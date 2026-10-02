#!/usr/bin/env bash
# Corpus v3 finishing pass, in order:
#   1. backfill `corruption`  - the one harm family per_cell=4 could never reach
#   2. add benign/neutral control rows to the frozen holdout (so FPR is measurable)
#   3. re-normalise + fold both into corpus_clean.csv / holdout_clean.csv
#
# Sequential on purpose: steps 1 and 2 both drive the same two llama.cpp servers
# (:8081 generator, :8082 judge), so running them in parallel only queues.
#
# Originals (seed.csv, generated.csv, holdout_paraphrases.csv) are never modified;
# every step writes to a new file.
set -u

# keep MSYS from rewriting the Windows model ids into POSIX paths
export MSYS2_ARG_CONV_EXCL='*'
export MSYS_NO_PATHCONV=1

HERE="$(cd "$(dirname "$0")" && pwd)"
PY="${PY:-/c/sentinel-gpu/Scripts/python.exe}"
GEN="${GEN:-D:\\llamacpp-rocm\\build\\bin\\models\\Qwen2.5-14B-Instruct-abliterated-v2.i1-Q4_K_M.gguf}"
JUDGE="${JUDGE:-D:\\llamacpp-rocm\\build\\bin\\models\\Qwen3.5-9B-abliterated-Q4_K_M.gguf}"
ENDPOINT="${ENDPOINT:-http://127.0.0.1:8081/v1/chat/completions}"
JUDGE_ENDPOINT="${JUDGE_ENDPOINT:-http://127.0.0.1:8082/v1/chat/completions}"

cd "$HERE" || exit 1

step () {
  echo
  echo "=============================================================="
  echo "== $1"
  echo "=============================================================="
}

step "1/3 backfill corruption pairs"
"$PY" add_missing_harm.py --harm corruption --pairs "${CORRUPTION_PAIRS:-10}" \
  --endpoint "$ENDPOINT" --model "$GEN" \
  --judge-endpoint "$JUDGE_ENDPOINT" --judge-model "$JUDGE" --verbose
S1=$?
echo "STEP1_EXIT=$S1"

step "2/3 holdout control rows"
"$PY" extend_holdout.py \
  --endpoint "$ENDPOINT" --model "$GEN" \
  --judge-endpoint "$JUDGE_ENDPOINT" --judge-model "$JUDGE" --verbose
S2=$?
echo "STEP2_EXIT=$S2"

step "3/3 normalise + fold in"
"$PY" apply_corpus_cleanup.py
S3=$?
echo "STEP3_EXIT=$S3"

echo
echo "ALL_DONE step1=$S1 step2=$S2 step3=$S3"
