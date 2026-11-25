import os
import json
import pytest
import numpy as np
import pandas as pd
from pathlib import Path

from backend.app.engine.ingestion import (
    load_file_into_dataframe,
    detect_column_type,
    detect_unit_inconsistencies,
    compute_quality_score,
    inspect_and_profile_dataset
)
from backend.app.engine.data_fusion import identify_candidate_join_keys, fuse_datasets
from backend.app.engine.anomaly_detection import detect_production_anomalies
from backend.app.engine.hypothesis_testing import (
    compute_cohens_d,
    compute_mean_difference_ci,
    evaluate_bivariate_relationship,
    evaluate_controlled_regression,
    calculate_evidence_strength
)
from backend.app.engine.hypothesis_generation import generate_competing_explanations
from backend.app.engine.next_best_evidence import (
    compute_system_entropy,
    estimate_required_sample_size,
    generate_evidence_recommendations
)
from backend.app.engine.budget_optimizer import optimize_investigation_budget
from backend.app.demo.manufacturing import generate_manufacturing_demo_datasets

@pytest.fixture
def sample_csv(tmp_path):
    df = pd.DataFrame({
        "machine_id": ["M-01", "M-02", "M-03", "M-04", "M-01", "M-02"],
        "timestamp": ["2026-03-01 08:00:00", "2026-03-01 08:00:00", "2026-03-01 08:00:00", "2026-03-01 08:00:00", "2026-03-01 09:00:00", "2026-03-01 09:00:00"],
        "output_units": [95.0, 92.5, np.nan, 94.0, 96.0, 91.0],
        "temperature_c": [58.2, 59.1, 88.4, 57.9, 58.0, 60.2]
    })
    p = tmp_path / "sample.csv"
    df.to_csv(p, index=False)
    return p

@pytest.fixture
def sample_json(tmp_path):
    data = [
        {"machine_id": "M-01", "operator": "OP-01", "shift": "Day"},
        {"machine_id": "M-02", "operator": "OP-02", "shift": "Day"},
        {"machine_id": "M-03", "operator": "OP-01", "shift": "Night"}
    ]
    p = tmp_path / "sample.json"
    with open(p, "w") as f:
        json.dump(data, f)
    return p

# 1. Ingestion & Profiling Tests
def test_csv_ingestion(sample_csv):
    df = load_file_into_dataframe(sample_csv)
    assert len(df) == 6
    assert "machine_id" in df.columns
    assert "output_units" in df.columns

def test_json_ingestion(sample_json):
    df = load_file_into_dataframe(sample_json)
    assert len(df) == 3
    assert "operator" in df.columns

def test_profiling_and_missing_values(sample_csv):
    profile = inspect_and_profile_dataset(sample_csv, "Sample Test")
    assert profile["row_count"] == 6
    assert profile["column_count"] == 4
    assert profile["quality_score"] > 0
    # Check that output_units has 1 missing value
    out_dict = next(d for d in profile["data_dictionary"] if d["name"] == "output_units")
    assert out_dict["missing_count"] == 1

def test_unit_inconsistency_detection():
    df = pd.DataFrame({
        "temp_readings": ["24 C", "75 F", "25 C", "80 F"]
    })
    issues = detect_unit_inconsistencies(df)
    assert len(issues) > 0
    assert issues[0]["category"] == "temperature"

# 2. Data Fusion Tests
def test_join_key_identification():
    df1 = pd.DataFrame({"machine_id": ["M-01", "M-02"], "output": [100, 95]})
    df2 = pd.DataFrame({"machine_id": ["M-01", "M-02", "M-03"], "temp": [55.0, 58.0, 89.0]})
    meta1 = {"columns_meta": {"machine_id": {"is_identifier": True, "type": "string"}}}
    meta2 = {"columns_meta": {"machine_id": {"is_identifier": True, "type": "string"}}}
    
    candidates = identify_candidate_join_keys(df1, df2, meta1, meta2)
    assert len(candidates) > 0
    assert candidates[0]["left_key"] == "machine_id"
    assert candidates[0]["shared_distinct_values"] == 2

def test_dataset_fusion():
    dfs = {
        "Production": pd.DataFrame({"machine_id": ["M-01", "M-02"], "output": [100, 95]}),
        "Sensors": pd.DataFrame({"machine_id": ["M-01", "M-02"], "temp": [55.0, 58.0]})
    }
    specs = [{"left_dataset": "Production", "right_dataset": "Sensors", "left_key": "machine_id", "right_key": "machine_id", "join_type": "left"}]
    fused, audit, limits = fuse_datasets(dfs, specs)
    assert len(fused) == 2
    assert "temp" in fused.columns
    assert len(audit) == 1
    assert audit[0]["match_rate_pct"] == 100.0

# 3. Statistical Testing & Confounding Tests
def test_cohens_d_and_confidence_interval():
    g1 = np.array([100, 102, 98, 105, 99, 101])
    g2 = np.array([60, 62, 59, 65, 58, 61])
    
    d = compute_cohens_d(g1, g2)
    ci = compute_mean_difference_ci(g1, g2)
    
    assert d > 5.0  # Very large separation
    assert ci[0] > 30.0 and ci[1] > ci[0]

def test_bivariate_relationship_calc():
    x = pd.Series([1.0, 2.0, 3.0, 4.0, 5.0, 6.0])
    y = pd.Series([2.0, 4.1, 5.9, 8.2, 10.1, 11.9])
    res = evaluate_bivariate_relationship(x, y)
    assert res["pearson_r"] > 0.95
    assert res["r_squared"] > 0.90

def test_controlled_regression_confounding():
    np.random.seed(42)
    n = 100
    # Confounder Z drives both X and Y
    z = np.random.normal(50, 10, n)
    x = z * 0.8 + np.random.normal(0, 2, n)
    y = z * 1.5 + np.random.normal(0, 2, n)
    
    df = pd.DataFrame({"y": y, "x": x, "z": z})
    res = evaluate_controlled_regression(df, "y", "x", ["z"])
    assert res["controlled"] is True
    assert res["is_confounded_or_spurious"] is True
    assert res["coefficient_attenuation_pct"] > 50.0

# 4. Next-Best Evidence & Shannon Entropy Tests
def test_shannon_entropy_calculation():
    # Uniform distribution (high uncertainty)
    e_high = compute_system_entropy([0.25, 0.25, 0.25, 0.25])
    # Skewed distribution (low uncertainty)
    e_low = compute_system_entropy([0.95, 0.02, 0.02, 0.01])
    assert e_high > e_low
    assert np.isclose(e_high, 2.0, atol=0.01)

def test_evidence_recommendations_generation():
    hypotheses = [
        {"id": "HYP_THERMAL_STRESS", "strength_score": 0.80, "category": "thermal"},
        {"id": "HYP_WORKLOAD_CONFOUNDING", "strength_score": 0.60, "category": "operational"},
        {"id": "HYP_MAINTENANCE_DELAY", "strength_score": 0.20, "category": "maintenance"}
    ]
    recs = generate_evidence_recommendations(hypotheses)
    assert len(recs) > 0
    top_rec = recs[0]
    assert "expected_information_gain_bits" in top_rec
    assert top_rec["expected_information_gain_bits"] > 0
    assert top_rec["required_sample_size"] > 0

# 5. Budget Optimizer Tests
def test_budget_optimization():
    recommendations = [
        {"id": "R1", "title": "Cheap & High Gain", "estimated_cost_usd": 1000.0, "estimated_duration_days": 2, "expected_information_gain_bits": 0.8, "feasibility_score": 0.95},
        {"id": "R2", "title": "Expensive & Low Gain", "estimated_cost_usd": 8000.0, "estimated_duration_days": 10, "expected_information_gain_bits": 0.2, "feasibility_score": 0.50}
    ]
    opt = optimize_investigation_budget(recommendations, max_budget_usd=3000.0, max_time_days=5)
    assert len(opt["selected_investigations"]) == 1
    assert opt["selected_investigations"][0]["id"] == "R1"
    assert opt["total_cost_usd"] == 1000.0

# 6. Edge Cases
def test_empty_dataframe_handling():
    empty_df = pd.DataFrame()
    anoms = detect_production_anomalies(empty_df)
    assert anoms == []

def test_constant_column_profiling(tmp_path):
    df = pd.DataFrame({"id": [1, 2, 3, 4], "constant_col": [42, 42, 42, 42]})
    p = tmp_path / "constant.csv"
    df.to_csv(p, index=False)
    profile = inspect_and_profile_dataset(p, "Constant Check")
    assert any("constant" in w.lower() for w in profile["quality_warnings"])

# 7. Manufacturing Demonstration Scenario
def test_manufacturing_demo_generation():
    files = generate_manufacturing_demo_datasets(force_regenerate=True)
    assert files["production_records"].exists()
    assert files["machine_logs"].exists()
    assert files["temperature_readings"].exists()
    assert files["ground_truth"].exists()
    
    prod_df = pd.read_csv(files["production_records"])
    assert len(prod_df) > 500
    
    # Test anomaly detection on demo dataset
    anoms = detect_production_anomalies(prod_df, metric_col="output_units")
    assert len(anoms) > 0
    shift_anom = anoms[0]
    assert shift_anom["percentage_change"] < -8.0  # Significant drop detected
    assert shift_anom["p_value"] < 0.001

# 8. Excel Ingestion, Security, PII & Extended Edge Cases (Phase 7 & 8)
def test_excel_xlsx_ingestion(tmp_path):
    df = pd.DataFrame({
        "machine_id": ["M-01", "M-02", "M-03"],
        "output_units": [95.0, 91.5, 48.0],
        "spindle_temp_c": [58.0, 59.5, 89.2]
    })
    xlsx_path = tmp_path / "plant_records.xlsx"
    df.to_excel(xlsx_path, index=False)
    loaded = load_file_into_dataframe(xlsx_path)
    assert len(loaded) == 3
    assert "spindle_temp_c" in loaded.columns

def test_invalid_file_and_path_traversal_security():
    from fastapi import HTTPException
    from backend.app.core.security import sanitize_filename, validate_uploaded_file

    assert ".." not in sanitize_filename("../../etc/passwd.csv")
    assert sanitize_filename("../../evil.csv") == "evil.csv"

    class DummyUpload:
        def __init__(self, filename):
            self.filename = filename

    with pytest.raises(HTTPException):
        validate_uploaded_file(DummyUpload("payload.exe"))
    with pytest.raises(HTTPException):
        validate_uploaded_file(DummyUpload("script.py"))
    with pytest.raises(HTTPException):
        validate_uploaded_file(DummyUpload("report.pdf"))
    with pytest.raises(HTTPException):
        validate_uploaded_file(DummyUpload("legacy.xls"))

def test_pii_detection_and_masking():
    from backend.app.engine.profiling import scan_dataframe_for_pii, mask_dataframe_pii

    df = pd.DataFrame({
        "operator_name": ["Alice", "Bob"],
        "contact": ["alice@factory.com", "bob@factory.com"],
        "ssn": ["123-45-6789", "987-65-4321"]
    })
    scan = scan_dataframe_for_pii(df)
    assert scan["pii_detected"] is True
    assert "contact" in scan["pii_columns"]
    assert "ssn" in scan["pii_columns"]

    masked_df, _ = mask_dataframe_pii(df)
    assert "[REDACTED_EMAIL]" in masked_df["contact"].iloc[0]
    assert "[REDACTED_SSN]" in masked_df["ssn"].iloc[0]

def test_duplicate_detection_and_small_dataset_edge_cases(tmp_path):
    # Duplicate detection
    df_dup = pd.DataFrame({
        "id": [1, 1, 2, 3, 4],
        "val": [10.0, 10.0, 20.0, 30.0, 40.0]
    })
    p = tmp_path / "dups.csv"
    df_dup.to_csv(p, index=False)
    profile = inspect_and_profile_dataset(p, "Dup Test")
    assert profile["duplicate_rows"] == 1
    assert any("duplicate" in w.lower() for w in profile["quality_warnings"])

    # Very small dataset + invalid timestamps
    df_small = pd.DataFrame({
        "timestamp": ["not-a-date", "also-bad", "???"],
        "metric": [1.0, 2.0, 3.0]
    })
    assert detect_production_anomalies(df_small) == []

def test_high_correlations_and_evidence_scoring():
    from backend.app.engine.profiling import compute_high_correlations
    from backend.app.engine.evidence_scoring import score_hypothesis_evidence, compute_uncertainty_metrics

    x = np.arange(50, dtype=float)
    df = pd.DataFrame({"a": x, "b": x * 2.0 + 1.0, "c": np.random.normal(0, 1, 50)})
    corrs = compute_high_correlations(df, threshold=0.8)
    assert len(corrs) >= 1
    assert corrs[0]["pearson_r"] > 0.99

    scored = score_hypothesis_evidence(p_val=0.0001, effect_size=1.2, sample_size=100, is_confounded=False)
    assert scored["score"] >= 0.78
    assert scored["verdict"] == "STRONG_SUPPORT"

    unc_high = compute_uncertainty_metrics([0.5, 0.5, 0.5, 0.5])
    unc_low = compute_uncertainty_metrics([0.96, 0.05, 0.05, 0.05])
    assert unc_high["uncertainty_pct"] > unc_low["uncertainty_pct"]

def test_budget_optimizer_measurement_and_resource_constraints():
    recs = [
        {"id": "R1", "title": "Heavy Sample", "estimated_cost_usd": 500.0, "estimated_duration_days": 1, "expected_information_gain_bits": 0.9, "feasibility_score": 0.9, "required_sample_size": 400},
        {"id": "R2", "title": "Lean Sample", "estimated_cost_usd": 800.0, "estimated_duration_days": 2, "expected_information_gain_bits": 0.7, "feasibility_score": 0.9, "required_sample_size": 60}
    ]
    opt = optimize_investigation_budget(recs, max_budget_usd=5000.0, max_time_days=7, max_observations=100, max_parallel_experiments=1)
    assert len(opt["selected_investigations"]) == 1
    assert opt["selected_investigations"][0]["id"] == "R2"
    assert len(opt["infeasible_options"]) == 1
    assert "assumptions_and_estimates" in opt
