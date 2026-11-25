import re
import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.core.auth import (
    create_access_token,
    hash_password,
    require_authenticated_user,
    verify_password,
)
from backend.app.engine.database import User, get_db

router = APIRouter(prefix="/auth", tags=["auth"])

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class RegisterPayload(BaseModel):
    email: str
    name: str
    password: str


class LoginPayload(BaseModel):
    email: str
    password: str


@router.post("/register")
def register_user(payload: RegisterPayload, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    name = payload.name.strip()
    if not EMAIL_PATTERN.match(email):
        raise HTTPException(status_code=400, detail="Please provide a valid email address.")
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Name must be at least 2 characters.")
    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    user = User(
        id=f"USR-{uuid.uuid4().hex[:8].upper()}",
        email=email,
        name=name,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id, user.email)
    return {
        "status": "success",
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user.id, "email": user.email, "name": user.name},
    }


@router.post("/login")
def login_user(payload: LoginPayload, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_access_token(user.id, user.email)
    return {
        "status": "success",
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user.id, "email": user.email, "name": user.name},
    }


@router.get("/me")
def get_current_user_profile(current_user: User = Depends(require_authenticated_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "created_at": current_user.created_at,
    }
