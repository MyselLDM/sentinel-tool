#!/usr/bin/env bash
# Run the full Sentinel training pipeline (NLI -> contrastive -> compare) on the
# AMD GPU, detached, writing progress to logs/run_all.log and a completion
# marker to logs/RUN_DONE.
#
# Launched from a shell where the GPU works (Git Bash / MSYS). Why not call
# run_gpu.sh: that script `exec`s, which would replace this runner after the
# first step.
#
# Progress:   tail -f training/logs/run_all.log
# Status:     cat training/logs/run_all.status      (running | step=exitcode ... | done)
# Finished:   presence of training/logs/RUN_DONE

set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
VENV="${SENTINEL_GPU_VENV:-/c/sentinel-gpu}"
PY="$VENV/Scripts/python.exe"
LOG_DIR="$HERE/logs"
LOG="$LOG_DIR/run_all.log"
STATUS="$LOG_DIR/run_all.status"

mkdir -p "$LOG_DIR"
rm -f "$LOG_DIR/RUN_DONE"

if [ ! -x "$PY" ]; then
  echo "GPU venv python not found at $PY" | tee -a "$LOG"
  exit 1
fi

# A space-free working directory is mandatory for AMD ROCm on Windows.
cd "$VENV" || exit 1

: > "$LOG"
echo "running" > "$STATUS"
DATASET="$(cd "$HERE" && "$PY" -c 'import common; print(common.DATASET_PATH.name)' 2>/dev/null || echo '?')"
echo "started $(date -Is)  venv=$VENV  dataset=$DATASET" | tee -a "$LOG"

run_step() {
  local name="$1"; shift
  echo "=== $name: started $(date -Is) ===" | tee -a "$LOG"
  "$PY" -X faulthandler "$HERE/$name" "$@" >>"$LOG" 2>&1
  local code=$?
  echo "=== $name: exit=$code  $(date -Is) ===" | tee -a "$LOG"
  echo "$name=$code" >> "$STATUS"
  return $code
}

run_step train_nli.py
run_step train_contrastive.py
run_step compare_models.py

echo "done $(date -Is)" >> "$STATUS"
echo "DONE $(date -Is)" | tee -a "$LOG"
touch "$LOG_DIR/RUN_DONE"
