import numpy as np
import pandas as pd
import pytest

from backend.app.engine.discovery_engine import run_autonomous_discovery
from backend.app.engine.database import SessionLocal, init_db
from backend.app.api.endpoints import (
    create_investigation,
    delete_investigation,
    get_investigation,
    upload_dataset,
    discover_anomalies,
    update_finding_status,
    FindingUpdatePayload,
)
from fastapi import UploadFile
from starlette.datastructures import Headers
import io

init_db()


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def test_normal_and_uncorrelated_dataset_low_false_positives():
    """Synthetic test data: clean normal uncorrelated variables should not produce high-priority false alarms."""
    rng = np.random.default_rng(123)
    df = pd.DataFrame({
        "metric_a": rng.normal(100, 5, size=200),
        "metric_b": rng.normal(50, 3, size=200),
    })
    res = run_autonomous_discovery(df)
    high = [f for f in res["findings"] if f["priority"] == "high"]
    corr = [f for f in res["findings"] if "CORR" in f["id"]]
    assert len(high) == 0
    assert len(corr) == 0


def test_injected_outliers_detection_recall():
    """Synthetic test data: 3 injected extreme outliers must be detected accurately."""
    rng = np.random.default_rng(42)
    vals = list(rng.normal(50.0, 2.0, size=100)) + [150.0, 160.0, 155.0]
    df = pd.DataFrame({"sensor_reading": vals})
    res = run_autonomous_discovery(df)
    outlier_findings = [f for f in res["findings"] if "OUTLIER" in f["id"]]
    assert len(outlier_findings) == 1
    assert outlier_findings[0]["measured_values"]["outlier_count"] >= 3
    assert outlier_findings[0]["measured_values"]["most_extreme_value"] == 160.0


def test_timeseries_known_shift_and_missing_gap():
    """Synthetic test data: known -25% step drop at midpoint + a missing 10-hour gap."""
    rng = np.random.default_rng(7)
    t1 = pd.date_range("2025-01-01 00:00", periods=40, freq="1h")
    t2 = pd.date_range("2025-01-03 02:00", periods=40, freq="1h")  # 10h gap
    timestamps = list(t1) + list(t2)
    y1 = rng.normal(100.0, 3.0, size=40)
    y2 = rng.normal(75.0, 3.0, size=40)
    df = pd.DataFrame({"timestamp": timestamps, "output_units": np.concatenate([y1, y2])})

    res = run_autonomous_discovery(df)
    ids = [f["id"] for f in res["findings"]]
    assert any("TS-SHIFT" in i for i in ids)
    assert "FIND-TS-GAPS" in ids

    shift = next(f for f in res["findings"] if "TS-SHIFT" in f["id"])
    assert shift["evidence_strength"] == "statistically_supported"
    assert shift["q_value"] is not None and shift["q_value"] < 0.05
    assert -30.0 <= shift["percentage_change"] <= -20.0


def test_correlated_variables_and_ci():
    """Synthetic test data: strong linear correlation r > 0.9 with valid 95% Fisher-z CI."""
    rng = np.random.default_rng(99)
    x = np.linspace(10, 100, 80)
    y = 2.5 * x + rng.normal(0, 3.0, size=80)
    df = pd.DataFrame({"temp_c": x, "power_kw": y})
    res = run_autonomous_discovery(df)
    corr = [f for f in res["findings"] if "CORR" in f["id"]]
    assert len(corr) == 1
    assert corr[0]["measured_values"]["pearson_r"] > 0.95
    assert len(corr[0]["confidence_interval"]) == 2
    assert corr[0]["confidence_interval"][0] > 0.9


def test_segment_differences_and_imbalanced_categories():
    """Synthetic test data: clear difference across segments + imbalanced category."""
    rng = np.random.default_rng(11)
    df = pd.DataFrame({
        "region": ["North"] * 45 + ["South"] * 45 + ["East"] * 10,
        "defect_rate": np.concatenate([
            rng.normal(2.0, 0.3, size=45),
            rng.normal(12.0, 0.5, size=45),
            rng.normal(2.2, 0.3, size=10),
        ]),
        "status": ["OK"] * 98 + ["FAIL"] * 2,
    })
    res = run_autonomous_discovery(df)
    ids = [f["id"] for f in res["findings"]]
    assert any("FIND-SEG" in i for i in ids)
    assert any("FIND-CAT-IMBAL" in i for i in ids)


def test_small_dataset_constant_cols_and_missing_values():
    """Small dataset (n=6) with constant column & missing values must not fabricate p-values."""
    df = pd.DataFrame({
        "const_col": [1, 1, 1, 1, 1, 1],
        "val": [10.0, np.nan, 12.0, 11.0, np.nan, 13.0],
    })
    res = run_autonomous_discovery(df)
    assert "const_col" in res["dataset_understanding"]["constant_columns"]
    for f in res["findings"]:
        assert f["p_value"] is None


def test_large_dataset_performance_benchmark():
    """Synthetic 5,000-row dataset benchmark: completes fast and records runtime & memory."""
    rng = np.random.default_rng(5)
    n = 5000
    x = rng.normal(100, 10, size=n)
    df = pd.DataFrame({
        "timestamp": pd.date_range("2025-01-01", periods=n, freq="5min"),
        "a": x,
        "b": x * 1.4 + rng.normal(0, 2, size=n),
        "c": rng.normal(50, 5, size=n),
    })
    res = run_autonomous_discovery(df)
    assert res["performance"]["runtime_ms"] < 10000
    assert res["performance"]["peak_memory_mb"] >= 0


def test_discovery_persistence_versioning_and_marking(db_session):
    created = create_investigation(title="Step 5 Persistence Test", description="Verify DB persistence", budget_limit=5000.0, time_limit_days=7, db=db_session)
    inv_id = created["investigation"]["id"]
    try:
        csv_bytes = (
            "timestamp,machine_id,output_units,temp_c\n"
            + "\n".join(
                f"2025-01-01 {h:02d}:00:00,M-01,{100 if h < 12 else 60},{65 if h < 12 else 85}"
                for h in range(24)
            )
        ).encode("utf-8")
        up = UploadFile(file=io.BytesIO(csv_bytes), filename="step5.csv", headers=Headers({"content-type": "text/csv"}))
        upload_dataset(inv_id=inv_id, file=up, dataset_name="Step 5 Telemetry", is_supplemental=False, db=db_session)

        # First scan -> v1
        d1 = discover_anomalies(inv_id=inv_id, db=db_session)
        assert d1["status"] == "success"
        assert d1["analysis_version"] == 1
        assert len(d1["findings"]) >= 1

        # Second scan -> v2 without duplicate rows
        d2 = discover_anomalies(inv_id=inv_id, db=db_session)
        assert d2["analysis_version"] == 2
        inv_data = get_investigation(inv_id, db=db_session)
        assert len(inv_data["anomalies"]) == len(d2["findings"])
        assert inv_data["anomalies"][0]["analysis_version"] == 2

        # Mark finding for further investigation
        fid = inv_data["anomalies"][0]["id"]
        mark_res = update_finding_status(inv_id, fid, FindingUpdatePayload(marked_for_investigation=True), db=db_session)
        assert mark_res["marked_for_investigation"] is True
        inv_after = get_investigation(inv_id, db=db_session)
        assert inv_after["anomalies"][0]["marked_for_investigation"] is True
    finally:
        delete_investigation(inv_id, db=db_session)
