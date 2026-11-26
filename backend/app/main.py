import logging
import time
from collections import defaultdict, deque
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
from backend.app.core.config import settings, BASE_DIR
from backend.app.engine.database import init_db
from backend.app.api.endpoints import router as api_router

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("reverse_ai")

# Initialize database schemas
init_db()

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Autonomous Data Investigation Platform: Discover. Investigate. Prove.",
    version=settings.VERSION,
    docs_url="/docs" if settings.DEBUG or settings.ENV != "production" else None,
    redoc_url=None
)

# Cross-Origin Resource Sharing (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lightweight in-memory rate limiter for write/compute API endpoints
_RATE_BUCKETS: dict[str, deque[float]] = defaultdict(deque)

@app.middleware("http")
async def security_and_rate_limit_middleware(request: Request, call_next):
    if request.url.path.startswith(settings.API_PREFIX) and request.method in ("POST", "PATCH", "DELETE"):
        client_ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        bucket = _RATE_BUCKETS[client_ip]
        while bucket and (now - bucket[0]) > 60.0:
            bucket.popleft()
        if len(bucket) >= settings.RATE_LIMIT_PER_MIN:
            return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded. Please retry shortly."})
        bucket.append(now)

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

# Global safe exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.method} {request.url.path}: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "InternalServerError",
            "message": "An unexpected error occurred during investigation execution.",
            "detail": str(exc) if settings.DEBUG else "Internal server error. Check server logs for details."
        }
    )

# Include API Router
app.include_router(api_router, prefix=settings.API_PREFIX)

# Static frontend distribution serving
DIST_DIR = BASE_DIR.parent / "frontend" / "dist"
if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Don't intercept API routes
        if full_path.startswith("api"):
            return JSONResponse(status_code=404, content={"detail": "API endpoint not found"})
        file_path = DIST_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(DIST_DIR / "index.html")
else:
    @app.get("/")
    def root():
        return {
            "platform": settings.PROJECT_NAME,
            "tagline": settings.TAGLINE,
            "version": settings.VERSION,
            "status": "operational",
            "endpoints": {
                "api_docs": "/docs",
                "health": f"{settings.API_PREFIX}/investigations"
            }
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
