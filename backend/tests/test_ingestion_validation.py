import io
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import openpyxl
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings
from app.core.security import validate_file_content

client = TestClient(app)


def _create_test_investigation(title: str = "Step 4 Validation Test") -> str:
    res = client.post(
        "/api/investigations",
        data={"title": title, "description": "Automated Step 4 ingestion test"}
    )
    assert res.status_code == 200
    return res.json()["investigation"]["id"]


def _cleanup_investigation(inv_id: str):
    client.delete(f"/api/investigations/{inv_id}")


def _make_xlsx_bytes(rows: list[list]) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_upload_valid_csv_and_quality_report():
    inv_id = _create_test_investigation("CSV Quality Test")
    try:
        csv_content = (
            "timestamp,machine_id,output_units,operator_email\n"
            "2025-01-01 08:00:00,M-01,120,alice@example.com\n"
            "2025-01-01 09:00:00,M-01,115,bob@example.com\n"
            "2025-01-01 09:00:00,M-01,115,bob@example.com\n"
            "2025-01-01 10:00:00,M-02,,carol@example.com\n"
        ).encode("utf-8")

        res = client.post(
            f"/api/investigations/{inv_id}/datasets/upload",
            files={"file": ("production.csv", csv_content, "text/csv")},
            data={"dataset_name": "Production CSV"}
        )
        assert res.status_code == 200, res.text
        body = res.json()
        profile = body["profile"]
        assert profile["row_count"] == 4
        assert profile["column_count"] == 4
        assert profile["duplicate_rows"] == 1
        assert profile["pii_report"]["pii_detected"] is True
        assert "operator_email" in profile["pii_report"]["pii_columns"]
        assert len(profile["quality_warnings"]) >= 2

        # Verify GET investigation includes format & profiling_info
        inv_res = client.get(f"/api/investigations/{inv_id}")
        assert inv_res.status_code == 200
        ds_list = inv_res.json()["datasets"]
        assert len(ds_list) == 1
        assert ds_list[0]["format"] == "csv"
        assert ds_list[0]["profiling_info"]["duplicate_rows"] == 1
    finally:
        _cleanup_investigation(inv_id)


def test_upload_valid_xlsx():
    inv_id = _create_test_investigation("XLSX Upload Test")
    try:
        xlsx_bytes = _make_xlsx_bytes([
            ["machine_id", "temperature_c", "output_units"],
            ["M-01", 64.2, 102],
            ["M-02", 68.5, 98],
            ["M-03", 81.0, 62],
        ])
        res = client.post(
            f"/api/investigations/{inv_id}/datasets/upload",
            files={
                "file": (
                    "telemetry.xlsx",
                    xlsx_bytes,
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                )
            }
        )
        assert res.status_code == 200, res.text
        profile = res.json()["profile"]
        assert profile["row_count"] == 3
        assert profile["column_count"] == 3
    finally:
        _cleanup_investigation(inv_id)


def test_upload_valid_json_variants():
    inv_id = _create_test_investigation("JSON Upload Test")
    try:
        # Variant 1: List of objects
        arr_bytes = json.dumps([
            {"id": "A1", "metric": 10.5},
            {"id": "A2", "metric": 20.1},
        ]).encode("utf-8")
        res1 = client.post(
            f"/api/investigations/{inv_id}/datasets/upload",
            files={"file": ("records.json", arr_bytes, "application/json")}
        )
        assert res1.status_code == 200, res1.text
        assert res1.json()["profile"]["row_count"] == 2

        # Variant 2: Wrapped {"data": [...]}
        wrapped_bytes = json.dumps({
            "data": [
                {"id": "B1", "val": 100},
                {"id": "B2", "val": 200},
                {"id": "B3", "val": 300},
            ]
        }).encode("utf-8")
        res2 = client.post(
            f"/api/investigations/{inv_id}/datasets/upload",
            files={"file": ("wrapped.json", wrapped_bytes, "application/json")}
        )
        assert res2.status_code == 200, res2.text
        assert res2.json()["profile"]["row_count"] == 3
    finally:
        _cleanup_investigation(inv_id)


def test_upload_valid_structured_txt():
    inv_id = _create_test_investigation("Structured TXT Test")
    try:
        # Tab-delimited TSV in .txt
        tsv_bytes = (
            "sensor_id\treading\tstatus\n"
            "S-1\t42.1\tok\n"
            "S-2\t88.9\twarn\n"
        ).encode("utf-8")
        res1 = client.post(
            f"/api/investigations/{inv_id}/datasets/upload",
            files={"file": ("sensors.txt", tsv_bytes, "text/plain")}
        )
        assert res1.status_code == 200, res1.text
        assert res1.json()["profile"]["row_count"] == 2
        assert res1.json()["profile"]["column_count"] == 3

        # Pipe-delimited in .txt
        pipe_bytes = (
            "node|latency_ms|errors\n"
            "N1|12|0\n"
            "N2|45|3\n"
        ).encode("utf-8")
        res2 = client.post(
            f"/api/investigations/{inv_id}/datasets/upload",
            files={"file": ("latency.txt", pipe_bytes, "text/plain")}
        )
        assert res2.status_code == 200, res2.text
        assert res2.json()["profile"]["row_count"] == 2

        # JSON-lines in .txt
        jsonl_bytes = (
            '{"host": "h1", "cpu": 45}\n'
            '{"host": "h2", "cpu": 92}\n'
        ).encode("utf-8")
        res3 = client.post(
            f"/api/investigations/{inv_id}/datasets/upload",
            files={"file": ("metrics_jsonl.txt", jsonl_bytes, "text/plain")}
        )
        assert res3.status_code == 200, res3.text
        assert res3.json()["profile"]["row_count"] == 2
    finally:
        _cleanup_investigation(inv_id)


def test_reject_invalid_corrupted_and_malicious_files():
    inv_id = _create_test_investigation("Invalid Files Test")
    try:
        # 1. Empty file (0 bytes)
        r_empty = client.post(
            f"/api/investigations/{inv_id}/datasets/upload",
            files={"file": ("empty.csv", b"", "text/csv")}
        )
        assert r_empty.status_code == 400
        assert "empty" in r_empty.json()["detail"].lower()

        # 2. Whitespace-only CSV
        r_ws = client.post(
            f"/api/investigations/{inv_id}/datasets/upload",
            files={"file": ("blank.csv", b"   \n\t\n  ", "text/csv")}
        )
        assert r_ws.status_code == 400

        # 3. Corrupted XLSX (plain text renamed to .xlsx, fails ZIP magic bytes)
        r_bad_xlsx = client.post(
            f"/api/investigations/{inv_id}/datasets/upload",
            files={"file": ("fake.xlsx", b"not a real excel zip file", "application/octet-stream")}
        )
        assert r_bad_xlsx.status_code == 400
        assert "valid excel" in r_bad_xlsx.json()["detail"].lower() or "zip" in r_bad_xlsx.json()["detail"].lower()

        # 4. Windows PE executable (MZ header) disguised as .csv
        r_exe_csv = client.post(
            f"/api/investigations/{inv_id}/datasets/upload",
            files={"file": ("payload.csv", b"MZ\x90\x00\x03\x00\x00\x00fake_pe", "text/csv")}
        )
        assert r_exe_csv.status_code == 400
        assert "executable" in r_exe_csv.json()["detail"].lower()

        # 5. Corrupted JSON
        r_bad_json = client.post(
            f"/api/investigations/{inv_id}/datasets/upload",
            files={"file": ("broken.json", b'{"unclosed": [1, 2,', "application/json")}
        )
        assert r_bad_json.status_code == 400
        assert "json" in r_bad_json.json()["detail"].lower()

        # 6. Unstructured prose .txt
        r_prose = client.post(
            f"/api/investigations/{inv_id}/datasets/upload",
            files={"file": ("notes.txt", b"This is just an unstructured paragraph with no columns at all.", "text/plain")}
        )
        assert r_prose.status_code == 400

        # 7. Unsupported extensions (.exe, .xls, .pdf)
        for bad_name in ["malware.exe", "legacy.xls", "report.pdf"]:
            r_ext = client.post(
                f"/api/investigations/{inv_id}/datasets/upload",
                files={"file": (bad_name, b"dummy content", "application/octet-stream")}
            )
            assert r_ext.status_code == 400, f"Expected 400 for {bad_name}"
    finally:
        _cleanup_investigation(inv_id)


def test_file_size_limit_enforced(monkeypatch):
    monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE_BYTES", 64)
    with pytest.raises(HTTPException) as exc_info:
        validate_file_content(b"a,b\n" + b"1,2\n" * 30, "big.csv", "text/csv")
    assert exc_info.value.status_code == 413


def test_delete_dataset_and_status_revert():
    inv_id = _create_test_investigation("Delete Dataset Test")
    try:
        # Initially draft
        inv_before = client.get(f"/api/investigations/{inv_id}").json()["investigation"]
        assert inv_before["status"] == "draft"

        # Upload 1 dataset -> status becomes ready
        csv_bytes = b"col_a,col_b\n1,10\n2,20\n"
        up = client.post(
            f"/api/investigations/{inv_id}/datasets/upload",
            files={"file": ("sample.csv", csv_bytes, "text/csv")}
        )
        assert up.status_code == 200
        ds_id = up.json()["dataset_id"]

        inv_ready = client.get(f"/api/investigations/{inv_id}").json()["investigation"]
        assert inv_ready["status"] == "ready"

        # Delete dataset -> reverts to draft
        del_res = client.delete(f"/api/investigations/{inv_id}/datasets/{ds_id}")
        assert del_res.status_code == 200
        assert del_res.json()["deleted_dataset_id"] == ds_id

        inv_after = client.get(f"/api/investigations/{inv_id}").json()
        assert len(inv_after["datasets"]) == 0
        assert inv_after["investigation"]["status"] == "draft"
    finally:
        _cleanup_investigation(inv_id)
