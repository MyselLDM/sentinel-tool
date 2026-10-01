#!/usr/bin/env bash
# Run the whole pipeline under BOTH domain protocols, in order:
#
#   1. domain         leave-one-domain-out, both paraphrase samples  -> DOMAIN axis
#   2. domain_sample  leave-one-domain-out AND paraphrase-holdout
#                     (train on sample_index 0, test on sample_index 1
#                      of the held-out domain)                        -> hardest
#
# Each protocol archives its own results under logs/<protocol>/, so nothing is
# overwritten. This regenerates the models too (the final model is trained on all
# data, so it is identical for both protocols).
#
# Usage:  nohup bash run_protocols_gpu.sh [protocol ...]     (default: domain domain_sample)
#
# Watch:      tail -f training/per_anchor_split/logs/run_protocols.log
# Per-run:    .../logs/run_domain.status · .../logs/run_domain_sample.status
# Finished:   .../logs/RUN_DONE

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
PROTOCOLS=("$@")
if [ ${#PROTOCOLS[@]} -eq 0 ]; then
  PROTOCOLS=(domain domain_sample)
fi
for protocol in "${PROTOCOLS[@]}"; do
  echo "=== protocol $protocol: started $(date -Is) ===" | tee -a "$LOG"
  bash "$HERE/run_all_gpu.sh" "$protocol" >>"$LOG" 2>&1
  code=$?
  echo "=== protocol $protocol: exit=$code  $(date -Is) ===" | tee -a "$LOG"
  echo "$protocol=$code" >> "$STATUS"
done

echo "done $(date -Is)" >> "$STATUS"
echo "DONE $(date -Is)" | tee -a "$LOG"
touch "$LOG_DIR/RUN_DONE"
