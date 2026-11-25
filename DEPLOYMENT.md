# REVERSE AI 2.0 — Production Deployment & Recovery Guide

## 1. Environment Configuration
Copy `.env.example` to `.env` and set production values:
- `REVERSE_AI_ENV=production`
- `REVERSE_AI_DEBUG=false` (disables `/docs` and hides internal exception traces)
- `MAX_UPLOAD_SIZE_BYTES=52428800`
- `REVERSE_AI_RATE_LIMIT=120`

## 2. Build & Start (Production)
1. Build frontend:
   ```bash
   cd frontend && npm ci && npm run build
   ```
2. Start backend (behind an HTTPS reverse proxy such as Nginx, Caddy, or Render/Cloudflare):
   ```bash
   uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --workers 1
   ```
   *(Use `--workers 1` with SQLite to avoid multi-process write contention, or migrate `DATABASE_URL` to PostgreSQL for multi-worker scaling.)*

## 3. Health Check
- `GET /api/health` returns `200` with `{"status": "healthy", "database": "connected", "storage": "writable"}`.

## 4. Backup & Restore (SQLite + Uploaded Datasets)
- **Backup** (uses SQLite online backup API so live writes stay consistent):
  ```bash
  python -c "import sqlite3; src=sqlite3.connect('backend/storage/reverse_ai.db'); dst=sqlite3.connect('backup_reverse_ai.db'); src.backup(dst); dst.close(); src.close()"
  ```
- **Restore**:
  Stop the server, replace `backend/storage/reverse_ai.db` with `backup_reverse_ai.db`, and restart.
