import pytest
from backend.app.engine.database import SessionLocal, Investigation
from backend.app.api.endpoints import (
    load_manufacturing_demo,
    get_investigation,
    get_investigation_charts,
    get_platform_settings_status,
    optimize_budget,
    execute_demo_next_step,
    get_report
)

@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def test_demo_manufacturing_endpoint_flow(db_session):
    # 1. Load manufacturing demo
    demo_res = load_manufacturing_demo(db=db_session)
    assert demo_res["status"] == "success"
    assert demo_res["datasets_loaded"] == 5
    assert demo_res["anomalies_detected"] > 0
    assert demo_res["hypotheses_evaluated"] > 0
    assert demo_res["recommendations_formulated"] > 0

    inv_id = demo_res["demo_investigation_id"]

    # 2. Get full investigation graph
    inv_data = get_investigation(inv_id, db=db_session)
    assert "investigation" in inv_data
    assert len(inv_data["datasets"]) >= 5
    assert len(inv_data["anomalies"]) >= 1
    assert len(inv_data["hypotheses"]) >= 4
    assert len(inv_data["recommendations"]) >= 1
    assert len(inv_data["history"]) >= 4

    # 3. Optimize budget
    opt_res = optimize_budget(
        inv_id,
        max_budget=6000.0,
        max_days=8,
        max_observations=500,
        max_parallel_experiments=3,
        db=db_session
    )
    assert opt_res["status"] == "success"
    opt_data = opt_res["optimization"]
    assert "selected_investigations" in opt_data
    assert opt_data["total_cost_usd"] <= 6000.0
    assert len(opt_data["selected_investigations"]) > 0

    # 4. Execute next step (Targeted Coolant Flow)
    step_res = execute_demo_next_step(db=db_session)
    assert step_res["status"] == "success"
    update_data = step_res["closed_loop_update"]
    assert "proven_root_causes" in update_data
    assert len(update_data["proven_root_causes"]) > 0

    # 5. Fetch full audit report
    report_data = get_report(inv_id, db=db_session)
    assert "markdown_report" in report_data
    assert "Executive Summary" in report_data["markdown_report"]
    assert "Coolant" in report_data["markdown_report"] or "Thermal" in report_data["markdown_report"]

    # 6. Verify real chart data & AI narrative endpoint
    charts = get_investigation_charts(inv_id, db=db_session)
    assert len(charts["timeseries"]["daily_series"]) > 0
    assert "uncertainty" in charts
    assert charts["is_simulated"] is True

    # 7. Verify platform settings & AI provider status
    settings_status = get_platform_settings_status()
    assert settings_status["ai_provider"]["api_keys_exposed_to_client"] is False
    assert settings_status["security"]["pii_detection_and_masking"] is True
