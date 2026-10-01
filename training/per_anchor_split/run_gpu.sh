#!/usr/bin/env bash
# Launch a Sentinel training script on the AMD GPU (Windows ROCm).
#
# Why this wrapper exists: AMD's ROCm toolchain on Windows crashes with an
# access violation if the process *starts* in a directory whose path contains a
# space (this repo lives at "D:\My Code\sentinel"). Launching the script from a
# space-free directory fixes it. All output paths are absolute, so nothing else
# changes.
#
# Usage (from Git Bash):
#   ./run_gpu.sh train_nli.py [args...]
#   ./run_gpu.sh train_contrastive.py [args...]
#   ./run_gpu.sh compare_models.py
#   ./run_gpu.sh check_gpu.py
#
# Override the venv location with SENTINEL_GPU_VENV (default C:\sentinel-gpu).

set -euo pipefail

VENV="${SENTINEL_GPU_VENV:-/c/sentinel-gpu}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ $# -lt 1 ]; then
  echo "usage: run_gpu.sh <script.py> [args...]" >&2
  exit 2
fi
if [ ! -x "$VENV/Scripts/python.exe" ]; then
  echo "ERROR: GPU venv not found at $VENV" >&2
  echo "Run ./setup_gpu_amd.sh first, or set SENTINEL_GPU_VENV." >&2
  exit 1
fi

script="$1"; shift
cd "$VENV"   # space-free working directory (AMD ROCm requirement)
# -X faulthandler: surface native crashes (ROCm access violations) as a Python
# traceback instead of dying silently.
exec "$VENV/Scripts/python.exe" -X faulthandler "$SCRIPT_DIR/$script" "$@"
