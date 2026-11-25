import io
import sqlite3
import numpy as np
import pytest
from fastapi import UploadFile
from starlette.datastructures import Headers

from backend.app.core.config import settings
from backend.app.engine.database import SessionLocal, init_db
from backend.app.api.endpoints import (
    create_investigation,
    delete_investigation,
    upload_dataset,
    run_full_investigation_analysis,
    run_what_if_simulation,
    ingest_supplemental_evidence,
    get_report,
    health_check,
    WhatIfPayload,
)

init_db()


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _csv_upload(filename: str, text: str) -> UploadFile:
    return UploadFile(
        file=io.BytesIO(text.encode("utf-8")),
        filename=filename,
        headers=Headers({"content-type": "text/csv"}),
    )


def test_full_generic_e2e_reasoning_whatif_closed_loop_and_reports(db_session):
    """End-to-end test on a generic non-manufacturing dataset (Steps 3 -> 4 -> 5 -> 6 -> 7)."""
    created = create_investigation(
        title="Step 6-7 Generic E2E",
        description="End-to-end verification on generic operational metrics",
        budget_limit=5000.0,
        time_limit_days=7,
        db=db_session,
    )
    inv_id = created["investigation"]["id"]
    try:
        rng = np.random.default_rng(101)
        rows = ["timestamp,region,traffic_load,response_time_ms,conversion_rate"]
        for i in range(40):
            load = 100 + i * 2.5
            resp = 120 + 0.8 * load + float(rng.normal(0, 4))
            conv = 12.0 - 0.04 * load + float(rng.normal(0, 0.4))
            reg = "West" if i < 20 else "East"
            rows.append(f"2025-02-01 {i % 24:02d}:00:00,{reg},{load:.1f},{resp:.2f},{conv:.2f}")
        csv_text = "\n".join(rows) + "\n"

        up = upload_dataset(inv_id=inv_id, file=_csv_upload("web_metrics.csv", csv_text), dataset_name="Web Metrics", is_supplemental=False, db=db_session)
        assert up["status"] == "success"

        # Run full pipeline
        run_res = run_full_investigation_analysis(inv_id=inv_id, db=db_session)
        assert run_res["status"] == "success"
        assert run_res["anomalies_count"] >= 1
        assert run_res["hypotheses_count"] >= 1
        assert run_res["recommendations_count"] >= 1

        # What-If linear projection (must be marked simulated and never alter source data)
        sim_res = run_what_if_simulation(
            inv_id=inv_id,
            payload=WhatIfPayload(target_col="conversion_rate", predictor_col="traffic_load", delta_pct=20.0),
            db=db_session,
        )
        sim = sim_res["simulation"]
        assert sim["is_simulation"] is True
        assert sim["model_metrics"]["sample_size"] == 40
        assert "Simulated" in sim["disclaimer"]

        # Closed-loop supplemental evidence
        supp_rows = ["timestamp,region,traffic_load,response_time_ms,conversion_rate"]
        for i in range(15):
            supp_rows.append(f"2025-02-03 {i:02d}:00:00,East,{180 + i},{260 + i},{4.5:.2f}")
        supp_res = ingest_supplemental_evidence(
            inv_id=inv_id,
            file=_csv_upload("supp_metrics.csv", "\n".join(supp_rows) + "\n"),
            dataset_name="Supplemental East Traffic",
            db=db_session,
        )
        assert supp_res["status"] == "success"
        assert "closed_loop_update" in supp_res

        # Reports: JSON & CSV
        json_rep = get_report(inv_id=inv_id, format="json", db=db_session)
        assert json_rep["investigation_id"] == inv_id
        assert "data_quality_summary" in json_rep
        assert "missing_information" in json_rep
        assert "statistical_methods" in json_rep
        assert "limitations" in json_rep
        assert len(json_rep["investigation_audit_trail"]) >= 3
        # Generic recommendations must not fabricate costs
        for rec in json_rep["next_best_evidence_recommendations"]:
            assert rec["estimated_cost_usd"] is None

        csv_resp = get_report(inv_id=inv_id, format="csv", db=db_session)
        csv_body = csv_resp.body.decode("utf-8")
        assert "Finding_ID,Title,Priority" in csv_body
    finally:
        delete_investigation(inv_id, db=db_session)


def test_health_check_and_sqlite_backup_restore(db_session, tmp_path):
    res = health_check(db=db_session)
    assert res["status"] == "healthy"
    assert res["database"] == "connected"
    assert res["storage"] == "writable"

    db_file = settings.STORAGE_DIR / "reverse_ai.db"
    assert db_file.exists()
    backup_file = tmp_path / "backup_reverse_ai.db"
    src = sqlite3.connect(db_file)
    dst = sqlite3.connect(backup_file)
    src.backup(dst)
    dst.close()
    src.close()

    # Verify backup DB integrity
    check_conn = sqlite3.connect(backup_file)
    integrity = check_conn.execute("PRAGMA integrity_check;").fetchone()[0]
    tables = {r[0] for r in check_conn.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall()}
    check_conn.close()
    assert integrity == "ok"
    assert {"investigations", "datasets", "anomalies", "hypotheses", "recommendations", "investigation_history"} <= tables
