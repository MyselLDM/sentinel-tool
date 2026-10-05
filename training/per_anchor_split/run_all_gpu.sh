#!/usr/bin/env bash
# Run the full Sentinel training pipeline for ONE evaluation protocol, detached,
# writing progress to logs/run_<strategy>.log and a completion marker to
# logs/RUN_DONE_<strategy>. Results are archived to logs/<strategy>/ so a second
# protocol's run cannot overwrite them.
#
# Usage:  ./run_all_gpu.sh [domain|domain_sample|group|stratified|sample]   (default: domain)
#
# This is the per_anchor_split variant: the domain protocols hold out a whole
# service domain, so the fold count comes from the data (9), not --folds.
#
#   domain        = leave-one-domain-out, both paraphrase samples -> the DOMAIN axis
#   domain_sample = leave-one-domain-out AND train on sample_index 0 only, test on
#                   sample_index 1 of the held-out domain            -> hardest
#
# Launched from a shell where the GPU works (Git Bash / MSYS). Why not call
# run_gpu.sh: that script `exec`s, which would replace this runner after step 1.
#
# Progress:   tail -f training/logs/run_<strategy>.log

set -uo pipefail

STRATEGY="${1:-domain}"
case "$STRATEGY" in
  group|stratified|sample|domain|domain_sample) ;;
  *) echo "unknown protocol: $STRATEGY (want group|stratified|sample|domain|domain_sample)" >&2; exit 2 ;;
esac

HERE="$(cd "$(dirname "$0")" && pwd)"
VENV="${SENTINEL_GPU_VENV:-/c/sentinel-gpu}"
PY="$VENV/Scripts/python.exe"
LOG_DIR="$HERE/logs"
LOG="$LOG_DIR/run_${STRATEGY}.log"
STATUS="$LOG_DIR/run_${STRATEGY}.status"
ARCHIVE="$LOG_DIR/$STRATEGY"

mkdir -p "$LOG_DIR"
rm -f "$LOG_DIR/RUN_DONE_${STRATEGY}"

if [ ! -x "$PY" ]; then
  echo "GPU venv python not found at $PY" | tee -a "$LOG"
  exit 1
fi

# A space-free working directory is mandatory for AMD ROCm on Windows.
cd "$VENV" || exit 1

: > "$LOG"
echo "running" > "$STATUS"
DATASET="$(cd "$HERE" && "$PY" -c 'import common; print(common.DATASET_PATH.name)' 2>/dev/null || echo '?')"
echo "started $(date -Is)  protocol=$STRATEGY  venv=$VENV  dataset=$DATASET" | tee -a "$LOG"

run_step() {
  local name="$1"; shift
  echo "=== $name: started $(date -Is) ===" | tee -a "$LOG"
  "$PY" -X faulthandler "$HERE/$name" "$@" >>"$LOG" 2>&1
  local code=$?
  echo "=== $name: exit=$code  $(date -Is) ===" | tee -a "$LOG"
  echo "$name=$code" >> "$STATUS"
  return $code
}

# Only the trainers take --fold-strategy; compare_models.py pairs whatever is in logs/.
run_step train_nli.py --fold-strategy "$STRATEGY"
run_step train_contrastive.py --fold-strategy "$STRATEGY"
run_step compare_models.py

# Archive this protocol's results so the next protocol's run cannot clobber them.
mkdir -p "$ARCHIVE"
for f in nli_cv_results.json contrastive_cv_results.json comparison_results.json; do
  [ -f "$LOG_DIR/$f" ] && cp -f "$LOG_DIR/$f" "$ARCHIVE/"
done
echo "archived results -> $ARCHIVE" | tee -a "$LOG"

echo "done $(date -Is)" >> "$STATUS"
echo "DONE $(date -Is)" | tee -a "$LOG"
touch "$LOG_DIR/RUN_DONE_${STRATEGY}"
