#!/usr/bin/env bash
# Run the whole pipeline under BOTH evaluation protocols, in order:
#
#   1. group   anchor-grouped CV (unseen goals)              -> PRIMARY
#   2. sample  paraphrase-holdout (unseen wording, shared
#              goals; folds over sample_index)              -> paraphrase gap
#
# Each protocol archives its own results under logs/<protocol>/, so nothing is
# overwritten. This regenerates the models too (the final model is trained on all
# data, so it is identical for both protocols).
#
# Usage:  nohup bash run_protocols_gpu.sh &
#
# Watch:      tail -f training/logs/run_protocols.log
# Per-run:    training/logs/run_group.status · training/logs/run_sample.status
# Finished:   training/logs/RUN_DONE

set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$HERE/logs"
mkdir -p "$LOG_DIR"

LOG="$LOG_DIR/run_protocols.log"
STATUS="$LOG_DIR/run_all.status"
rm -f "$LOG_DIR/RUN_DONE"
: > "$LOG"
echo "running" > "$STATUS"

echo "started $(date -Is)" | tee -a "$LOG"
for protocol in group sample; do
  echo "=== protocol $protocol: started $(date -Is) ===" | tee -a "$LOG"
  bash "$HERE/run_all_gpu.sh" "$protocol" >>"$LOG" 2>&1
  code=$?
  echo "=== protocol $protocol: exit=$code  $(date -Is) ===" | tee -a "$LOG"
  echo "$protocol=$code" >> "$STATUS"
done

echo "done $(date -Is)" >> "$STATUS"
echo "DONE $(date -Is)" | tee -a "$LOG"
touch "$LOG_DIR/RUN_DONE"
