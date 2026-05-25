#!/usr/bin/env python3
"""Cross-platform launcher for the local static server.

Checks Python/pip availability, installs dependencies from requirements.txt
when present, then runs python -m http.server.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Launch local static server")
    parser.add_argument("--port", type=int, default=8000, help="Server port (default: 8000)")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host (default: 127.0.0.1)")
    return parser.parse_args()


def run_checked(cmd: list[str], cwd: Path | None = None) -> None:
    subprocess.run(cmd, cwd=str(cwd) if cwd else None, check=True)


def main() -> int:
    args = parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    requirements = repo_root / "requirements.txt"

    if shutil.which("python") is None and shutil.which("python3") is None:
        print("Error: Python is not installed or not available on PATH.", file=sys.stderr)
        return 1

    python_exec = sys.executable or shutil.which("python3") or shutil.which("python")
    if not python_exec:
        print("Error: Could not resolve a Python executable.", file=sys.stderr)
        return 1

    print(f"Using Python: {python_exec}")

    if requirements.exists():
        print(f"Installing dependencies from {requirements} ...")
        run_checked([python_exec, "-m", "pip", "install", "-r", str(requirements)], cwd=repo_root)
    else:
        print("No requirements.txt found. Skipping dependency install.")

    print(f"Starting server at http://{args.host}:{args.port}")
    run_checked([python_exec, "-m", "http.server", str(args.port), "--bind", args.host], cwd=repo_root)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as error:
        print(f"Command failed with exit code {error.returncode}: {' '.join(error.cmd)}", file=sys.stderr)
        raise SystemExit(error.returncode)
