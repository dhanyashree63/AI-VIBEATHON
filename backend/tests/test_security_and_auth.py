import io
import zipfile
import pytest
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers

from backend.app.core.auth import (
    create_access_token,
    decode_access_token,
    enforce_investigation_access,
    hash_password,
    verify_password,
)
from backend.app.core.security import read_upload_streaming, validate_file_content
from backend.app.engine.database import SessionLocal, User, init_db
from backend.app.api.routes_auth import (
    LoginPayload,
    RegisterPayload,
    login_user,
    register_user,
)
from backend.app.api.endpoints import (
    create_investigation,
    delete_investigation,
    get_investigation,
)

init_db()


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def test_password_hashing_and_token_expiration():
    hashed = hash_password("StrongPass123!")
    assert hashed.startswith("scrypt$")
    assert verify_password("StrongPass123!", hashed) is True
    assert verify_password("WrongPass!", hashed) is False

    token = create_access_token("USR-1", "a@example.com", expires_minutes=5)
    payload = decode_access_token(token)
    assert payload["sub"] == "USR-1"

    # Tampered token rejected
    with pytest.raises(HTTPException) as exc_tamper:
        decode_access_token(token + "x")
    assert exc_tamper.value.status_code == 401

    # Expired token rejected
    expired = create_access_token("USR-1", "a@example.com", expires_minutes=-1)
    with pytest.raises(HTTPException) as exc_exp:
        decode_access_token(expired)
    assert exc_exp.value.status_code == 401


def test_register_login_and_idor_ownership_enforcement(db_session):
    email_a = "owner_a_test@example.com"
    email_b = "attacker_b_test@example.com"

    # Clean up any leftover test users
    for em in (email_a, email_b):
        existing = db_session.query(User).filter(User.email == em).first()
        if existing:
            db_session.delete(existing)
    db_session.commit()

    reg_a = register_user(RegisterPayload(email=email_a, name="Owner A", password="Password123!"), db=db_session)
    reg_b = register_user(RegisterPayload(email=email_b, name="User B", password="Password123!"), db=db_session)
    assert reg_a["access_token"]
    assert reg_b["access_token"]

    # Wrong password rejected
    with pytest.raises(HTTPException) as exc_login:
        login_user(LoginPayload(email=email_a, password="WrongPassword!"), db=db_session)
    assert exc_login.value.status_code == 401

    user_a = db_session.query(User).filter(User.email == email_a).first()
    user_b = db_session.query(User).filter(User.email == email_b).first()

    # Owner A creates an investigation
    created = create_investigation(
        title="Confidential Owner A",
        description="Private",
        budget_limit=5000.0,
        time_limit_days=7,
        db=db_session,
        current_user=user_a,
    )
    inv_id = created["investigation"]["id"]
    try:
        # Owner A can access
        fetched = get_investigation(inv_id, db=db_session, current_user=user_a)
        assert fetched["investigation"]["id"] == inv_id

        # User B (IDOR attempt) is blocked with 403
        with pytest.raises(HTTPException) as exc_idor:
            get_investigation(inv_id, db=db_session, current_user=user_b)
        assert exc_idor.value.status_code == 403

        # Unauthenticated request on owned investigation is blocked with 403
        with pytest.raises(HTTPException) as exc_anon:
            get_investigation(inv_id, db=db_session, current_user=None)
        assert exc_anon.value.status_code == 403
    finally:
        delete_investigation(inv_id, db=db_session, current_user=user_a)
        db_session.delete(user_a)
        db_session.delete(user_b)
        db_session.commit()


def test_streaming_upload_limit_and_zip_bomb_protection():
    # 1. Streaming upload rejects oversized payload with 413
    big_upload = UploadFile(
        file=io.BytesIO(b"a,b\n" + b"1,2\n" * 500),
        filename="big.csv",
        headers=Headers({"content-type": "text/csv"}),
    )
    with pytest.raises(HTTPException) as exc_size:
        read_upload_streaming(big_upload, max_bytes=128, chunk_size=64)
    assert exc_size.value.status_code == 413

    # 2. High-compression ZIP bomb disguised as .xlsx rejected
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("xl/sharedStrings.xml", b"A" * (1024 * 1024))  # 1 MB of 'A' compresses to ~1 KB (>100x ratio)
    bomb_bytes = buf.getvalue()
    with pytest.raises(HTTPException) as exc_bomb:
        validate_file_content(bomb_bytes, "bomb.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    assert exc_bomb.value.status_code == 400
    assert "compression ratio" in exc_bomb.value.detail.lower()
