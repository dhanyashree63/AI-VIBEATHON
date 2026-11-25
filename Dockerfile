FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    REVERSE_AI_ENV=production \
    REVERSE_AI_DEBUG=false

RUN pip install --no-cache-dir fastapi uvicorn pydantic-settings sqlalchemy pandas numpy scipy scikit-learn openpyxl python-multipart

COPY backend/ ./backend/
COPY run.py ./
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')"
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
