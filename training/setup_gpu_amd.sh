#!/usr/bin/env bash
# Set up a GPU-enabled Python environment for AMD Radeon (RDNA4) on Windows.
#
# Creates a venv at a SPACE-FREE path (AMD's Windows ROCm SDK console scripts
# break on paths containing spaces), installs AMD's ROCm PyTorch wheel, then
# applies the critical fix: overlay the *working* HIP SDK runtime DLLs + device
# library bitcode over the broken ones shipped in the `rocm-sdk-core` pip wheel.
#
# Usage:
#   ./setup_gpu_amd.sh [VENV_DIR]        # default: C:/sentinel-gpu
#
# Prerequisites:
#   * Python 3.12 on PATH
#   * AMD "HIP SDK for Windows" 7.2 installed
#     (https://www.amd.com/en/developer/resources/rocm-hub/hip-sdk.html)
#
# After it finishes, run the training scripts with:
#   <VENV_DIR>/Scripts/python.exe train_nli.py --device auto

set -euo pipefail

VENV_DIR="${1:-C:/sentinel-gpu}"
ROCM_REL="${ROCM_REL:-7.2.1}"
ROCM_INDEX="https://repo.radeon.com/rocm/windows/rocm-rel-${ROCM_REL}/"
# POSIX-style path to the installed HIP SDK (override with HIP_SDK_DIR).
HIP_SDK_DIR="${HIP_SDK_DIR:-/c/Program Files/AMD/ROCm/7.2}"

case "$VENV_DIR" in
  *" "*) echo "ERROR: VENV_DIR must not contain spaces (AMD ROCm SDK limitation): $VENV_DIR" >&2; exit 1 ;;
esac

PY="$VENV_DIR/Scripts/python.exe"

echo "==> [1/5] creating venv at $VENV_DIR"
python -m venv "$VENV_DIR"
"$PY" -m pip install -q --upgrade pip

echo "==> [2/5] installing torch + ROCm runtime from $ROCM_INDEX"
"$PY" -m pip install --find-links "$ROCM_INDEX" \
  "torch==2.9.1+rocm${ROCM_REL}" "rocm-sdk-core==${ROCM_REL}" \
  "rocm-sdk-libraries-custom==${ROCM_REL}" numpy

echo "==> [3/5] overlaying HIP SDK runtime (fixes the broken pip runtime)"
if [ ! -d "$HIP_SDK_DIR/bin" ]; then
  echo "ERROR: HIP SDK not found at $HIP_SDK_DIR (set HIP_SDK_DIR)." >&2
  exit 1
fi
SITE="$VENV_DIR/Lib/site-packages/_rocm_sdk_core"
cp -f "$HIP_SDK_DIR/bin/"*.dll "$SITE/bin/"
cp -f "$HIP_SDK_DIR/amdgcn/bitcode/"*.bc "$SITE/lib/llvm/amdgcn/bitcode/"

echo "==> [4/5] installing the training stack"
"$PY" -m pip install -q \
  "sentence-transformers==5.5.0" "transformers==5.8.1" "datasets==5.0.1" \
  scikit-learn scipy accelerate

echo "==> [5/5] verifying GPU acceleration"
"$PY" "$(cd "$(dirname "$0")" && pwd)/check_gpu.py"

echo
echo "Done. Train with: $(cd "$(dirname "$0")" && pwd)/run_gpu.sh train_nli.py"
echo "(run_gpu.sh launches from a space-free cwd, which AMD ROCm requires)"
