import io
import json
import openpyxl
import pytest
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers

from backend.app.core.config import settings
from backend.app.core.security import validate_file_content
from backend.app.engine.database import SessionLocal, init_db
from backend.app.api.endpoints import (
    create_investigation,
    get_investigation,
    delete_investigation,
    upload_dataset,
    delete_dataset,
)

init_db()


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _make_upload(filename: str, content: bytes, content_type: str = "application/octet-stream") -> UploadFile:
    return UploadFile(
        file=io.BytesIO(content),
        filename=filename,
        headers=Headers({"content-type": content_type}),
    )


def _make_xlsx_bytes(rows: list[list]) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_upload_valid_csv_and_quality_report(db_session):
    created = create_investigation(title="CSV Quality Test", description="Step 4 test", budget_limit=5000.0, time_limit_days=7, db=db_session)
    inv_id = created["investigation"]["id"]
    try:
        csv_content = (
            "timestamp,machine_id,output_units,operator_email\n"
            "2025-01-01 08:00:00,M-01,120,alice@example.com\n"
            "2025-01-01 09:00:00,M-01,115,bob@example.com\n"
            "2025-01-01 09:00:00,M-01,115,bob@example.com\n"
            "2025-01-01 10:00:00,M-02,,carol@example.com\n"
        ).encode("utf-8")

        res = upload_dataset(
            inv_id=inv_id,
            file=_make_upload("production.csv", csv_content, "text/csv"),
            dataset_name="Production CSV",
            is_supplemental=False,
            db=db_session,
        )
        assert res["status"] == "success"
        profile = res["profile"]
        assert profile["row_count"] == 4
        assert profile["column_count"] == 4
        assert profile["duplicate_rows"] == 1
        assert profile["pii_report"]["pii_detected"] is True
        assert "operator_email" in profile["pii_report"]["pii_columns"]
        assert len(profile["quality_warnings"]) >= 2

        inv_data = get_investigation(inv_id, db=db_session)
        ds_list = inv_data["datasets"]
        assert len(ds_list) == 1
        assert ds_list[0]["format"] == "csv"
        assert ds_list[0]["profiling_info"]["duplicate_rows"] == 1
    finally:
        delete_investigation(inv_id, db=db_session)


def test_upload_valid_xlsx(db_session):
    created = create_investigation(title="XLSX Upload Test", description="Step 4 test", budget_limit=5000.0, time_limit_days=7, db=db_session)
    inv_id = created["investigation"]["id"]
    try:
        xlsx_bytes = _make_xlsx_bytes([
            ["machine_id", "temperature_c", "output_units"],
            ["M-01", 64.2, 102],
            ["M-02", 68.5, 98],
            ["M-03", 81.0, 62],
        ])
        res = upload_dataset(
            inv_id=inv_id,
            file=_make_upload(
                "telemetry.xlsx",
                xlsx_bytes,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ),
            dataset_name=None,
            is_supplemental=False,
            db=db_session,
        )
        assert res["status"] == "success"
        assert res["profile"]["row_count"] == 3
        assert res["profile"]["column_count"] == 3
    finally:
        delete_investigation(inv_id, db=db_session)


def test_upload_valid_json_variants(db_session):
    created = create_investigation(title="JSON Upload Test", description="Step 4 test", budget_limit=5000.0, time_limit_days=7, db=db_session)
    inv_id = created["investigation"]["id"]
    try:
        arr_bytes = json.dumps([
            {"id": "A1", "metric": 10.5},
            {"id": "A2", "metric": 20.1},
        ]).encode("utf-8")
        res1 = upload_dataset(
            inv_id=inv_id,
            file=_make_upload("records.json", arr_bytes, "application/json"),
            dataset_name=None,
            is_supplemental=False,
            db=db_session,
        )
        assert res1["profile"]["row_count"] == 2

        wrapped_bytes = json.dumps({
            "data": [
                {"id": "B1", "val": 100},
                {"id": "B2", "val": 200},
                {"id": "B3", "val": 300},
            ]
        }).encode("utf-8")
        res2 = upload_dataset(
            inv_id=inv_id,
            file=_make_upload("wrapped.json", wrapped_bytes, "application/json"),
            dataset_name=None,
            is_supplemental=False,
            db=db_session,
        )
        assert res2["profile"]["row_count"] == 3
    finally:
        delete_investigation(inv_id, db=db_session)


def test_upload_valid_structured_txt(db_session):
    created = create_investigation(title="Structured TXT Test", description="Step 4 test", budget_limit=5000.0, time_limit_days=7, db=db_session)
    inv_id = created["investigation"]["id"]
    try:
        # Tab-delimited TSV in .txt
        tsv_bytes = (
            "sensor_id\treading\tstatus\n"
            "S-1\t42.1\tok\n"
            "S-2\t88.9\twarn\n"
        ).encode("utf-8")
        res1 = upload_dataset(
            inv_id=inv_id,
            file=_make_upload("sensors.txt", tsv_bytes, "text/plain"),
            dataset_name=None,
            is_supplemental=False,
            db=db_session,
        )
        assert res1["profile"]["row_count"] == 2
        assert res1["profile"]["column_count"] == 3

        # Pipe-delimited in .txt
        pipe_bytes = (
            "node|latency_ms|errors\n"
            "N1|12|0\n"
            "N2|45|3\n"
        ).encode("utf-8")
        res2 = upload_dataset(
            inv_id=inv_id,
            file=_make_upload("latency.txt", pipe_bytes, "text/plain"),
            dataset_name=None,
            is_supplemental=False,
            db=db_session,
        )
        assert res2["profile"]["row_count"] == 2

        # JSON-lines in .txt
        jsonl_bytes = (
            '{"host": "h1", "cpu": 45}\n'
            '{"host": "h2", "cpu": 92}\n'
        ).encode("utf-8")
        res3 = upload_dataset(
            inv_id=inv_id,
            file=_make_upload("metrics_jsonl.txt", jsonl_bytes, "text/plain"),
            dataset_name=None,
            is_supplemental=False,
            db=db_session,
        )
        assert res3["profile"]["row_count"] == 2
    finally:
        delete_investigation(inv_id, db=db_session)


def test_reject_invalid_corrupted_and_malicious_files(db_session):
    created = create_investigation(title="Invalid Files Test", description="Step 4 test", budget_limit=5000.0, time_limit_days=7, db=db_session)
    inv_id = created["investigation"]["id"]
    try:
        # 1. Empty file (0 bytes)
        with pytest.raises(HTTPException) as exc_empty:
            upload_dataset(inv_id=inv_id, file=_make_upload("empty.csv", b"", "text/csv"), dataset_name=None, is_supplemental=False, db=db_session)
        assert exc_empty.value.status_code == 400
        assert "empty" in exc_empty.value.detail.lower()

        # 2. Whitespace-only CSV
        with pytest.raises(HTTPException) as exc_ws:
            upload_dataset(inv_id=inv_id, file=_make_upload("blank.csv", b"   \n\t\n  ", "text/csv"), dataset_name=None, is_supplemental=False, db=db_session)
        assert exc_ws.value.status_code == 400

        # 3. Corrupted XLSX (plain text renamed to .xlsx, fails ZIP magic bytes)
        with pytest.raises(HTTPException) as exc_xlsx:
            upload_dataset(inv_id=inv_id, file=_make_upload("fake.xlsx", b"not a real excel zip file"), dataset_name=None, is_supplemental=False, db=db_session)
        assert exc_xlsx.value.status_code == 400
        assert "corrupted excel" in exc_xlsx.value.detail.lower() or "ooxml" in exc_xlsx.value.detail.lower()

        # 4. Windows PE executable (MZ header) disguised as .csv
        with pytest.raises(HTTPException) as exc_exe:
            upload_dataset(inv_id=inv_id, file=_make_upload("payload.csv", b"MZ\x90\x00\x03\x00\x00\x00fake_pe", "text/csv"), dataset_name=None, is_supplemental=False, db=db_session)
        assert exc_exe.value.status_code == 400
        assert "executable" in exc_exe.value.detail.lower()

        # 5. Corrupted JSON
        with pytest.raises(HTTPException) as exc_json:
            upload_dataset(inv_id=inv_id, file=_make_upload("broken.json", b'{"unclosed": [1, 2,', "application/json"), dataset_name=None, is_supplemental=False, db=db_session)
        assert exc_json.value.status_code == 400
        assert "json" in exc_json.value.detail.lower()

        # 6. Unstructured prose .txt
        with pytest.raises(HTTPException) as exc_prose:
            upload_dataset(inv_id=inv_id, file=_make_upload("notes.txt", b"This is just an unstructured paragraph with no columns at all.", "text/plain"), dataset_name=None, is_supplemental=False, db=db_session)
        assert exc_prose.value.status_code == 400

        # 7. Unsupported extensions (.exe, .xls, .pdf)
        for bad_name in ["malware.exe", "legacy.xls", "report.pdf"]:
            with pytest.raises(HTTPException) as exc_ext:
                upload_dataset(inv_id=inv_id, file=_make_upload(bad_name, b"dummy content"), dataset_name=None, is_supplemental=False, db=db_session)
            assert exc_ext.value.status_code == 400
    finally:
        delete_investigation(inv_id, db=db_session)


def test_file_size_limit_enforced(monkeypatch):
    monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE_BYTES", 64)
    with pytest.raises(HTTPException) as exc_info:
        validate_file_content(b"a,b\n" + b"1,2\n" * 30, "big.csv", "text/csv")
    assert exc_info.value.status_code == 400


def test_delete_dataset_and_status_revert(db_session):
    created = create_investigation(title="Delete Dataset Test", description="Step 4 test", budget_limit=5000.0, time_limit_days=7, db=db_session)
    inv_id = created["investigation"]["id"]
    try:
        inv_before = get_investigation(inv_id, db=db_session)["investigation"]
        assert inv_before["status"] == "draft"

        csv_bytes = b"col_a,col_b\n1,10\n2,20\n"
        up = upload_dataset(
            inv_id=inv_id,
            file=_make_upload("sample.csv", csv_bytes, "text/csv"),
            dataset_name=None,
            is_supplemental=False,
            db=db_session,
        )
        ds_id = up["dataset_id"]

        inv_ready = get_investigation(inv_id, db=db_session)["investigation"]
        assert inv_ready["status"] == "ready"

        del_res = delete_dataset(inv_id, ds_id, db=db_session)
        assert del_res["status"] == "success"
        assert del_res["deleted_dataset_id"] == ds_id

        inv_after = get_investigation(inv_id, db=db_session)
        assert len(inv_after["datasets"]) == 0
        assert inv_after["investigation"]["status"] == "draft"
    finally:
        delete_investigation(inv_id, db=db_session)
