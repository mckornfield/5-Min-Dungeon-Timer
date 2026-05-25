#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

PORT="${PORT:-8000}"
HOST="${HOST:-127.0.0.1}"

if [[ $# -ge 1 ]]; then
  PORT="$1"
fi

if [[ $# -ge 2 ]]; then
  HOST="$2"
fi

if command -v python3 >/dev/null 2>&1; then
  PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_CMD="python"
else
  echo "Error: Python is not installed or not available on PATH." >&2
  exit 1
fi

echo "Using Python: ${PYTHON_CMD}"

if [[ -f "${REPO_ROOT}/requirements.txt" ]]; then
  echo "Installing dependencies from requirements.txt ..."
  "${PYTHON_CMD}" -m pip install -r "${REPO_ROOT}/requirements.txt"
else
  echo "No requirements.txt found. Skipping dependency install."
fi

echo "Starting server at http://${HOST}:${PORT}"
cd "${REPO_ROOT}"
exec "${PYTHON_CMD}" -m http.server "${PORT}" --bind "${HOST}"
