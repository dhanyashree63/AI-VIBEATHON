import pytest
from fastapi import HTTPException
from backend.app.engine.database import SessionLocal, Investigation, init_db
from backend.app.api.endpoints import (
    create_investigation,
    list_investigations,
    get_investigation,
    update_investigation,
    delete_investigation,
    run_full_investigation_analysis,
    InvestigationUpdatePayload
)

init_db()

@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def test_investigation_lifecycle_crud_and_state_transitions(db_session):
    # 1. Validation: short title rejected
    with pytest.raises(HTTPException) as exc_short:
        create_investigation(title="A", description=None, budget_limit=5000.0, time_limit_days=7, db=db_session)
    assert exc_short.value.status_code == 400

    # 2. Create real investigation in DB (must return serialized dict with id & draft status)
    created = create_investigation(
        title="Session Lifecycle Test",
        description="Initial problem context",
        budget_limit=8000.0,
        time_limit_days=10,
        db=db_session
    )
    assert created["status"] == "success"
    assert isinstance(created["investigation"], dict)
    inv_id = created["investigation"]["id"]
    assert inv_id.startswith("INV-")
    assert created["investigation"]["status"] == "draft"

    try:
        # 3. Fetch directly by ID (simulates Inspect / direct URL load / refresh)
        fetched = get_investigation(inv_id, db=db_session)
        assert fetched["investigation"]["id"] == inv_id
        assert fetched["investigation"]["title"] == "Session Lifecycle Test"
        assert fetched["progress"]["data_quality"] == "pending"

        # 4. Cannot run analysis without dataset (400)
        with pytest.raises(HTTPException) as exc_no_ds:
            run_full_investigation_analysis(inv_id, db=db_session)
        assert exc_no_ds.value.status_code == 400

        # 5. Cannot manually mark completed without analysis results (400)
        with pytest.raises(HTTPException) as exc_bad_complete:
            update_investigation(inv_id, InvestigationUpdatePayload(status="completed"), db=db_session)
        assert exc_bad_complete.value.status_code == 400

        # 6. Rename & edit description (PATCH must return non-empty serialized dict)
        updated = update_investigation(
            inv_id,
            InvestigationUpdatePayload(title="Renamed Session Test", description="Updated description text"),
            db=db_session
        )
        assert updated["investigation"]["id"] == inv_id
        assert updated["investigation"]["title"] == "Renamed Session Test"
        assert updated["investigation"]["description"] == "Updated description text"

        # 7. Search & Filter via list_investigations
        search_res = list_investigations(search="Renamed Session", status="draft", sort_by="updated_at", sort_order="desc", db=db_session)
        assert any(i["id"] == inv_id for i in search_res["investigations"])

        # 8. Archive & Restore
        archived = update_investigation(inv_id, InvestigationUpdatePayload(status="archived"), db=db_session)
        assert archived["investigation"]["status"] == "archived"

        restored = update_investigation(inv_id, InvestigationUpdatePayload(status="ready"), db=db_session)
        assert restored["investigation"]["status"] == "draft"

        # 9. Duplicate-job guard (409 when already processing)
        inv_obj = db_session.query(Investigation).filter(Investigation.id == inv_id).first()
        inv_obj.status = "processing"
        db_session.commit()

        with pytest.raises(HTTPException) as exc_dup:
            run_full_investigation_analysis(inv_id, db=db_session)
        assert exc_dup.value.status_code == 409

        inv_obj.status = "draft"
        db_session.commit()

        # 10. Delete investigation & verify 404 afterward
        del_res = delete_investigation(inv_id, db=db_session)
        assert del_res["status"] == "success"
        assert del_res["deleted_id"] == inv_id

        with pytest.raises(HTTPException) as exc_404:
            get_investigation(inv_id, db=db_session)
        assert exc_404.value.status_code == 404
    finally:
        leftover = db_session.query(Investigation).filter(Investigation.id == inv_id).first()
        if leftover:
            db_session.delete(leftover)
            db_session.commit()

def test_invalid_and_missing_investigation_ids(db_session):
    with pytest.raises(HTTPException) as exc_bad:
        get_investigation("bad id with spaces!!", db=db_session)
    assert exc_bad.value.status_code == 400

    with pytest.raises(HTTPException) as exc_missing:
        get_investigation("INV-DOESNOTEXIST", db=db_session)
    assert exc_missing.value.status_code == 404
