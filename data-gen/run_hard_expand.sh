#!/usr/bin/env bash
# Expand the frozen `hard` holdout (purpose-hiding rows) then re-normalise.
#
# 26 hand-authored rows is too few for McNemar - the confidence interval swamps the
# effect. This adds ~4 rows per goal in the same register, giving ~74.
#
# Disjointness from training is enforced (Jaccard < 0.75 vs every train row and the
# 26 frozen originals), so the benchmark stays clean. Originals are never modified.
set -u

export MSYS2_ARG_CONV_EXCL='*'
export MSYS_NO_PATHCONV=1

HERE="$(cd "$(dirname "$0")" && pwd)"
PY="${PY:-/c/sentinel-gpu/Scripts/python.exe}"
GEN="${GEN:-D:\\llamacpp-rocm\\build\\bin\\models\\Qwen2.5-14B-Instruct-abliterated-v2.i1-Q4_K_M.gguf}"
JUDGE="${JUDGE:-D:\\llamacpp-rocm\\build\\bin\\models\\Qwen3.5-9B-abliterated-Q4_K_M.gguf}"
ENDPOINT="${ENDPOINT:-http://127.0.0.1:8081/v1/chat/completions}"
JUDGE_ENDPOINT="${JUDGE_ENDPOINT:-http://127.0.0.1:8082/v1/chat/completions}"

cd "$HERE" || exit 1

echo "=============================================================="
echo "== 1/2 expand hard holdout (${PER_GOAL:-4} rows x 12 goals)"
echo "=============================================================="
"$PY" extend_hard_holdout.py --per-goal "${PER_GOAL:-4}" \
  --endpoint "$ENDPOINT" --model "$GEN" \
  --judge-endpoint "$JUDGE_ENDPOINT" --judge-model "$JUDGE" --verbose
S1=$?
echo "STEP1_EXIT=$S1"

echo
echo "=============================================================="
echo "== 2/2 normalise + fold in"
echo "=============================================================="
"$PY" apply_corpus_cleanup.py
S2=$?
echo "STEP2_EXIT=$S2"

echo
echo "ALL_DONE hard_expand=$S1 cleanup=$S2"
