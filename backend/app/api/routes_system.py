import os
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.engine.ai_provider import get_ai_provider_status
from backend.app.engine.database import get_db

router = APIRouter(tags=["system"])


@router.get("/health")
def health_check(db: Session = Depends(get_db)):
    """Reports database connectivity, storage writability, and platform status."""
    db_ok = False
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    storage_ok = settings.STORAGE_DIR.exists() and os.access(settings.STORAGE_DIR, os.W_OK)
    return {
        "status": "healthy" if (db_ok and storage_ok) else "degraded",
        "version": settings.VERSION,
        "database": "connected" if db_ok else "error",
        "storage": "writable" if storage_ok else "error",
    }


@router.get("/settings/status")
def get_platform_settings_status():
    return {
        "ai_provider": get_ai_provider_status(),
        "security": {
            "max_upload_mb": settings.MAX_UPLOAD_SIZE_BYTES // (1024 * 1024),
            "allowed_extensions": sorted(list(settings.ALLOWED_EXTENSIONS)),
            "pii_detection_and_masking": True,
            "path_traversal_protection": True,
            "parameterized_queries": True,
            "cors_explicit_origins": settings.CORS_ORIGINS,
            "auth_required": settings.REQUIRE_AUTH,
        },
    }
