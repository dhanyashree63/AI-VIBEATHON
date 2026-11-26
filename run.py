#!/usr/bin/env python3
"""
REVERSE AI 2.0 Launcher
Tagline: Discover. Investigate. Prove.
"""

import os
import sys

_ROOT = os.path.dirname(os.path.abspath(__file__))
_VENDOR_DIR = os.path.join(_ROOT, "vendor")
_TMP_PKGS = "/tmp/reverse_ai_pkgs"

for _p in (_VENDOR_DIR, _TMP_PKGS):
    if os.path.isdir(_p) and _p not in sys.path:
        sys.path.insert(0, _p)

import uvicorn


def main():
    listen_port = int(os.getenv("X_ZOHO_CATALYST_LISTEN_PORT") or os.getenv("PORT") or "8000")
    bind_host = "0.0.0.0" if (os.getenv("X_ZOHO_CATALYST_LISTEN_PORT") or os.getenv("PORT")) else "127.0.0.1"

    print("=" * 70)
    print("   REVERSE AI 2.0 — Autonomous Data Investigation Platform")
    print("   Tagline: Discover. Investigate. Prove.")
    print("=" * 70)
    print("\n[+] Starting FastAPI Application Server...")
    print(f"[+] Listening on http://{bind_host}:{listen_port}")
    print(f"[+] API Documentation: http://localhost:{listen_port}/docs\n")

    uvicorn.run("backend.app.main:app", host=bind_host, port=listen_port, reload=False)


if __name__ == "__main__":
    main()
