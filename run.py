#!/usr/bin/env python3
"""
REVERSE AI 2.0 Launcher
Tagline: Discover. Investigate. Prove.
"""

import sys
import uvicorn
from backend.app.core.config import settings

def main():
    print("=" * 70)
    print("   REVERSE AI 2.0 — Autonomous Data Investigation Platform")
    print("   Tagline: Discover. Investigate. Prove.")
    print("=" * 70)
    print("\n[+] Starting FastAPI Application Server...")
    print("[+] API Documentation: http://localhost:8000/docs")
    print("[+] Web Workspace UI:  http://localhost:8000\n")
    
    try:
        uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=False)
    except OSError as e:
        if "10048" in str(e) or "address already in use" in str(e).lower():
            print("\n[!] Port 8000 is already in use. The server may already be running.")
            print("[!] Visit http://localhost:8000 to access the app.\n")
        else:
            raise

if __name__ == "__main__":
    main()
