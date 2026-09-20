#!/usr/bin/env bash
#
# Run the Sentinel FastAPI inference service.
#
#   ./run.sh                  # http://127.0.0.1:8000
#   PORT=9000 ./run.sh        # custom port
#   ./run.sh --reload         # extra args are passed through to uvicorn
#
# Creates .venv and installs requirements.txt on first run (and again whenever
# requirements.txt changes). Requires Python 3.10+.
set -euo pipefail
cd "$(dirname "$0")"

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8000}"
VENV="${VENV:-.venv}"

# --- Locate a Python interpreter -------------------------------------------
PY="${PYTHON:-}"
if [ -z "$PY" ]; then
  for candidate in python3 python py; do
    if command -v "$candidate" >/dev/null 2>&1; then PY="$candidate"; break; fi
  done
fi
if [ -z "$PY" ]; then
  echo "error: Python 3.10+ not found. Install it, or set PYTHON=/path/to/python." >&2
  exit 1
fi

# --- Create the virtual environment on first run ---------------------------
# A venv is NOT portable across operating systems: a checkout copied from
# Windows still carries .venv/Scripts/python.exe, which is not executable here.
# Such a venv looks present but has no interpreter for this OS — rebuild it.
if [ -d "$VENV" ] && [ ! -x "$VENV/Scripts/python.exe" ] && [ ! -x "$VENV/bin/python" ]; then
  if [ -f "$VENV/pyvenv.cfg" ]; then
    echo "==> $VENV has no interpreter for this OS (stale/foreign venv); rebuilding"
    rm -rf "$VENV"
  else
    echo "error: $VENV exists but is not a virtual environment." >&2
    echo "       Move it aside, or point VENV at another path." >&2
    exit 1
  fi
fi

if [ ! -d "$VENV" ]; then
  echo "==> Creating virtual environment in $VENV"
  "$PY" -m venv "$VENV"
fi

# --- Resolve the venv interpreter (POSIX vs Windows layout) ----------------
if [ -x "$VENV/Scripts/python.exe" ]; then
  VPY="$VENV/Scripts/python.exe"
elif [ -x "$VENV/bin/python" ]; then
  VPY="$VENV/bin/python"
else
  echo "error: no python interpreter found in $VENV" >&2
  echo "       Delete it and re-run: rm -rf '$VENV'" >&2
  exit 1
fi

# --- Install dependencies when requirements.txt is newer than the marker ---
# NOTE: torch must be >= 2.11 (see requirements.txt). On a GPU/CPU mismatch,
# install torch first from https://download.pytorch.org/whl/ and re-run.
MARKER="$VENV/.deps-installed"
if [ ! -f "$MARKER" ] || [ requirements.txt -nt "$MARKER" ]; then
  echo "==> Installing dependencies (requirements.txt)"
  "$VPY" -m pip install --upgrade pip
  "$VPY" -m pip install -r requirements.txt
  touch "$MARKER"
fi

echo "==> Inference API on http://$HOST:$PORT  (docs: /docs)"
exec "$VPY" -m uvicorn app.main:app --host "$HOST" --port "$PORT" "$@"
