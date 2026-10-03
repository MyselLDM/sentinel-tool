#!/usr/bin/env bash
# Run the full Sentinel training pipeline for ONE evaluation protocol, detached,
# writing progress to logs/run_<strategy>.log and a completion marker to
# logs/RUN_DONE_<strategy>. Results are archived to logs/<strategy>/ so a second
# protocol's run cannot overwrite them.
#
# Usage:  ./run_all_gpu.sh [group|stratified|cue]        (default: group)
#
#   group      = goal-grouped CV, unseen goals -> the PRIMARY number
#   stratified = label-stratified k-fold, what the reference fine-tune script did
#   cue        = the concept-disjoint split (data/cue_split.csv); the test set's
#                overreach KINDS are unseen -> the secondary/robustness number
#
# Everything it writes stays inside this folder: logs/, models/.
#
# Launched from a shell where the GPU works (Git Bash / MSYS). Why not call
# run_gpu.sh: that script `exec`s, which would replace this runner after step 1.
#
# IMPORTANT: stop the local llama.cpp servers before running. They hold the same
# GPU, and a wedged HIP context is the usual cause of an access violation at the
# first kernel (see README "GPU requirements").
#
# Progress:   tail -f logs/run_<strategy>.log

set -uo pipefail

STRATEGY="${1:-group}"
case "$STRATEGY" in
  group|stratified|cue) ;;
  *) echo "unknown protocol: $STRATEGY (want group|stratified|cue)" >&2; exit 2 ;;
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
# The cue protocol reads its train/test assignment from row data, so it must load
# cue_split.csv; the CV protocols load the plain corpus (the holdout is never
# trained on - the frozen benchmark is scored separately by the trainer).
case "$STRATEGY" in
  cue) DATASET="$HERE/data/cue_split.csv" ;;
  *)   DATASET="$HERE/data/corpus_clean.csv" ;;
esac
if [ ! -f "$DATASET" ]; then
  echo "dataset not found: $DATASET" | tee -a "$LOG"
  exit 1
fi
echo "started $(date -Is)  protocol=$STRATEGY  venv=$VENV  dataset=$(basename "$DATASET")" | tee -a "$LOG"

run_step() {
  local name="$1"; shift
  echo "=== $name: started $(date -Is) ===" | tee -a "$LOG"
  "$PY" -X faulthandler "$HERE/$name" "$@" >>"$LOG" 2>&1
  local code=$?
  echo "=== $name: exit=$code  $(date -Is) ===" | tee -a "$LOG"
  echo "$name=$code" >> "$STATUS"
  return $code
}

# Both trainers take --fold-strategy and --dataset; compare_models.py pairs
# whatever is in logs/ (its --protocol flag is only for re-reading an archive).
run_step train_nli.py --fold-strategy "$STRATEGY" --dataset "$DATASET"
run_step train_contrastive.py --fold-strategy "$STRATEGY" --dataset "$DATASET"
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
