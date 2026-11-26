import os
import secrets
from pathlib import Path
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent.parent
STORAGE_DIR = BASE_DIR / "storage"
DATA_DIR = BASE_DIR / "data"

STORAGE_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)

class Settings(BaseSettings):
    PROJECT_NAME: str = "REVERSE AI 2.0"
    TAGLINE: str = "Discover. Investigate. Prove."
    VERSION: str = "2.0.0"
    API_PREFIX: str = "/api"
    ENV: str = os.getenv("REVERSE_AI_ENV", "development")
    DEBUG: bool = os.getenv("REVERSE_AI_DEBUG", "false").lower() == "true"
    RATE_LIMIT_PER_MIN: int = int(os.getenv("REVERSE_AI_RATE_LIMIT", "120"))
    REQUIRE_AUTH: bool = os.getenv("REVERSE_AI_REQUIRE_AUTH", "false").lower() == "true"
    SECRET_KEY: str = os.getenv("REVERSE_AI_SECRET_KEY") or secrets.token_urlsafe(32)
    TOKEN_EXPIRE_MINUTES: int = int(os.getenv("REVERSE_AI_TOKEN_EXPIRE_MINUTES", "1440"))
    
    # Storage
    STORAGE_DIR: Path = STORAGE_DIR
    DATA_DIR: Path = DATA_DIR
    DATABASE_URL: str = f"sqlite:///{STORAGE_DIR / 'reverse_ai.db'}"
    
    # Upload limits (configurable via environment variables)
    MAX_UPLOAD_SIZE_BYTES: int = int(os.getenv("MAX_UPLOAD_SIZE_BYTES", str(50 * 1024 * 1024)))  # 50 MB default
    ALLOWED_EXTENSIONS: set[str] = {".csv", ".json", ".xlsx", ".txt"}
    
    # CORS (explicit origins only — no wildcard with credentials)
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:8000",
        "http://localhost:8080",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8000",
        "http://127.0.0.1:8080",
    ]
    
    # AI Integration layer
    OPENAI_API_KEY: str | None = os.getenv("OPENAI_API_KEY")
    GEMINI_API_KEY: str | None = os.getenv("GEMINI_API_KEY")
    ANTHROPIC_API_KEY: str | None = os.getenv("ANTHROPIC_API_KEY")

settings = Settings()
