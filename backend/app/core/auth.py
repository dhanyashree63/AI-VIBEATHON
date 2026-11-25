import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.engine.database import User, get_db


def hash_password(password: str) -> str:
    """Hashes a password using scrypt with a 16-byte random salt."""
    if not password or len(password) < 8:
        raise ValueError("Password must be at least 8 characters.")
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=16384, r=8, p=1, dklen=32)
    return f"scrypt${base64.b64encode(salt).decode()}${base64.b64encode(derived).decode()}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Verifies a plaintext password against a stored scrypt hash using constant-time comparison."""
    try:
        scheme, salt_b64, hash_b64 = stored_hash.split("$", 2)
        if scheme != "scrypt":
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
        derived = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=16384, r=8, p=1, dklen=32)
        return hmac.compare_digest(derived, expected)
    except Exception:
        return False


def create_access_token(user_id: str, email: str, expires_minutes: int | None = None) -> str:
    """Creates a signed HMAC-SHA256 bearer token with expiration."""
    exp_mins = expires_minutes if expires_minutes is not None else settings.TOKEN_EXPIRE_MINUTES
    payload = {
        "sub": user_id,
        "email": email,
        "iat": int(time.time()),
        "exp": int(time.time()) + (exp_mins * 60),
    }
    payload_b64 = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    sig = hmac.new(settings.SECRET_KEY.encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).decode().rstrip("=")
    return f"{payload_b64}.{sig_b64}"


def decode_access_token(token: str) -> dict[str, Any]:
    """Validates signature and expiration of a bearer token."""
    try:
        payload_b64, sig_b64 = token.split(".", 1)
    except ValueError:
        raise HTTPException(status_code=401, detail="Malformed authentication token.")

    expected_sig = hmac.new(settings.SECRET_KEY.encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256).digest()
    expected_sig_b64 = base64.urlsafe_b64encode(expected_sig).decode().rstrip("=")
    if not hmac.compare_digest(sig_b64, expected_sig_b64):
        raise HTTPException(status_code=401, detail="Invalid authentication token signature.")

    padded = payload_b64 + "=" * (-len(payload_b64) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=401, detail="Corrupted authentication token payload.")

    if int(payload.get("exp", 0)) < int(time.time()):
        raise HTTPException(status_code=401, detail="Authentication token has expired.")
    return payload


def get_optional_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User | None:
    """Returns authenticated User if Authorization header is supplied; enforces strict token validity."""
    if not authorization:
        if settings.REQUIRE_AUTH:
            raise HTTPException(status_code=401, detail="Authentication required.")
        return None

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization header must use Bearer scheme.")

    token = authorization[7:].strip()
    payload = decode_access_token(token)
    user = db.query(User).filter(User.id == payload.get("sub")).first()
    if not user:
        raise HTTPException(status_code=401, detail="Authenticated user no longer exists.")
    return user


def require_authenticated_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required.")
    token = authorization[7:].strip()
    payload = decode_access_token(token)
    user = db.query(User).filter(User.id == payload.get("sub")).first()
    if not user:
        raise HTTPException(status_code=401, detail="Authenticated user no longer exists.")
    return user


def enforce_investigation_access(inv: Any, user: User | None) -> None:
    """Prevents IDOR: if investigation has an owner_id, only that owner may access/modify it."""
    if inv.id == "INV-DEMO-MFG-01":
        return
    if inv.owner_id and (user is None or inv.owner_id != user.id):
        raise HTTPException(status_code=403, detail="Access denied: you do not own this investigation.")
    if user is not None and inv.owner_id is None and settings.REQUIRE_AUTH:
        raise HTTPException(status_code=403, detail="Access denied to unowned investigation.")
