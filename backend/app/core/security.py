import io
import os
import re
import json
import zipfile
from pathlib import Path
from fastapi import HTTPException, UploadFile
from backend.app.core.config import settings

# Common PII Regex Patterns
EMAIL_REGEX = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b')
PHONE_REGEX = re.compile(r'\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b')
SSN_REGEX = re.compile(r'\b\d{3}-\d{2}-\d{4}\b')
CREDIT_CARD_REGEX = re.compile(r'\b(?:\d{4}[-\s]?){3}\d{4}\b')

DANGEROUS_EXTENSIONS = {
    ".exe", ".bat", ".cmd", ".sh", ".py", ".js", ".vbs", ".ps1", ".msi", ".dll", ".so", ".bin", ".html", ".htm", ".php"
}

FORBIDDEN_MIME_TYPES = {
    "application/x-msdownload",
    "application/x-executable",
    "application/x-sh",
    "application/javascript",
    "text/javascript",
    "text/html",
    "application/x-httpd-php"
}

EXECUTABLE_SIGNATURES = (
    b"MZ",              # Windows PE/EXE/DLL
    b"\x7fELF",         # Linux ELF
    b"\xca\xfe\xba\xbe", # Mach-O
    b"\xfe\xed\xfa\xce", # Mach-O
    b"\xfe\xed\xfa\xcf", # Mach-O 64
)

ZIP_SIGNATURES = (b"PK\x03\x04", b"PK\x05\x06")

def sanitize_filename(filename: str) -> str:
    """Sanitize uploaded file names to prevent path traversal or special character exploits."""
    clean_name = os.path.basename(filename)
    clean_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', clean_name)
    if not clean_name or clean_name.startswith('.'):
        clean_name = f"dataset_{clean_name}"
    return clean_name

def validate_uploaded_file(file: UploadFile) -> str:
    """Validates filename, extension, and MIME type before reading content."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Uploaded file must have a valid filename.")

    clean_name = sanitize_filename(file.filename)
    ext = Path(clean_name).suffix.lower()

    if ext in DANGEROUS_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File extension '{ext}' is forbidden for security reasons.")

    if ext not in settings.ALLOWED_EXTENSIONS:
        allowed_str = ", ".join(sorted(settings.ALLOWED_EXTENSIONS))
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext}'. Supported formats are: {allowed_str}."
        )

    mime = (getattr(file, "content_type", None) or "").lower().split(";")[0].strip()
    if mime in FORBIDDEN_MIME_TYPES:
        raise HTTPException(status_code=400, detail=f"MIME type '{mime}' is not allowed.")

    return clean_name

def read_upload_streaming(file: UploadFile, max_bytes: int | None = None, chunk_size: int = 65536) -> bytes:
    """Reads an uploaded file in chunks while enforcing size limits before full allocation."""
    limit = max_bytes if max_bytes is not None else settings.MAX_UPLOAD_SIZE_BYTES
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = file.file.read(chunk_size)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            max_mb = max(1, limit // (1024 * 1024))
            raise HTTPException(status_code=413, detail=f"File exceeds the maximum upload limit of {max_mb} MB.")
        chunks.append(chunk)
    return b"".join(chunks)


def validate_file_content(content: bytes, clean_filename: str, content_type: str | None = None) -> str:
    """
    Inspects actual file bytes (magic signatures, encoding, structure, size) to verify
    that file content matches its extension and is safe to parse.
    Returns detected format ('csv', 'xlsx', 'json', 'txt').
    """
    if content is None or len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty (0 bytes).")

    if len(content) > settings.MAX_UPLOAD_SIZE_BYTES:
        max_mb = settings.MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)
        raise HTTPException(status_code=400, detail=f"File exceeds the maximum upload limit of {max_mb} MB.")

    mime = (content_type or "").lower().split(";")[0].strip()
    if mime in FORBIDDEN_MIME_TYPES:
        raise HTTPException(status_code=400, detail=f"MIME type '{mime}' is not allowed.")

    ext = Path(clean_filename).suffix.lower()
    header = content[:16]

    # Block executable binaries regardless of extension
    for sig in EXECUTABLE_SIGNATURES:
        if header.startswith(sig):
            raise HTTPException(
                status_code=400,
                detail="Executable binary signature detected. File rejected for security reasons."
            )

    if ext == ".xlsx":
        if not any(header.startswith(sig) for sig in ZIP_SIGNATURES):
            raise HTTPException(
                status_code=400,
                detail="Invalid or corrupted Excel (.xlsx) file: file signature does not match OOXML format."
            )
        # Archive / decompression bomb protection
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                total_uncompressed = sum(info.file_size for info in zf.infolist())
                if total_uncompressed > 150 * 1024 * 1024:
                    raise HTTPException(status_code=400, detail="Excel archive uncompressed size exceeds 150 MB safety limit.")
                if len(content) > 0 and (total_uncompressed / len(content)) > 100:
                    raise HTTPException(status_code=400, detail="Suspicious Excel archive compression ratio rejected for security.")
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="Corrupted Excel (.xlsx) archive.")
        return "xlsx"

    # Text-based formats (.csv, .json, .txt) must not contain raw null bytes
    if b"\x00" in content[:4096]:
        raise HTTPException(
            status_code=400,
            detail=f"File '{clean_filename}' appears to contain binary data and cannot be parsed as {ext.upper()}."
        )

    decoded = None
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            decoded = content.decode(enc)
            break
        except UnicodeDecodeError:
            continue

    if decoded is None or not decoded.strip():
        raise HTTPException(status_code=400, detail="Uploaded file contains only whitespace or unreadable encoding.")

    if ext == ".json":
        stripped = decoded.strip()
        if not (stripped.startswith("{") or stripped.startswith("[")):
            raise HTTPException(
                status_code=400,
                detail="Invalid JSON file: content must be a JSON array of records or JSON object."
            )
        try:
            parsed = json.loads(stripped)
            if not isinstance(parsed, (list, dict)) or len(parsed) == 0:
                raise HTTPException(status_code=400, detail="JSON file contains no tabular records.")
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail=f"Corrupted JSON syntax: {exc.msg} (line {exc.lineno}).")
        return "json"

    return ext.lstrip(".")

def detect_pii(text: str) -> dict[str, list[str]]:
    """Detects potential PII occurrences in a sample text."""
    findings = {
        "emails": EMAIL_REGEX.findall(text),
        "phones": PHONE_REGEX.findall(text),
        "ssns": SSN_REGEX.findall(text),
        "credit_cards": CREDIT_CARD_REGEX.findall(text)
    }
    return {k: list(set(v)) for k, v in findings.items() if v}

def mask_pii(text: str) -> str:
    """Masks detected PII strings in text."""
    masked = EMAIL_REGEX.sub("[REDACTED_EMAIL]", text)
    masked = SSN_REGEX.sub("[REDACTED_SSN]", masked)
    masked = CREDIT_CARD_REGEX.sub("[REDACTED_CC]", masked)
    masked = PHONE_REGEX.sub("[REDACTED_PHONE]", masked)
    return masked
