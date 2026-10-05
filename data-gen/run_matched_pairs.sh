#!/usr/bin/env bash
# Generate concept-matched pairs, fold them in, then test whether the lexical leak
# is closed.
#
# Why: AUDIT_REPORT 3.3 found benign rows contained 0/281 mentions of the concepts
# the violations reach for, so a bag of words scored AUC 0.949 and a cue-disjoint
# split was NOT USABLE (6 of 8 concept families had zero benign rows).
#
# Matched pairs fix that by sharing concept AND verb and differing only in ROLE -
# public vs private, aggregate vs individual, custody vs examination. Only dual-use
# concepts can do this; subject_social and subject_location have no legitimate role
# for these goals and are skipped.
#
# Judging is fail-closed here: these rows feed a benchmark, where an unverified
# label is worse than a missing row.
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

step () { echo; echo "=============================================================="; echo "== $1"; echo "=============================================================="; }

step "1/4 generate concept-matched pairs (fail-closed)"
"$PY" add_matched_pairs.py --per-concept "${PER_CONCEPT:-8}" \
  --endpoint "$ENDPOINT" --model "$GEN" \
  --judge-endpoint "$JUDGE_ENDPOINT" --judge-model "$JUDGE" --verbose
S1=$?; echo "STEP1_EXIT=$S1"

step "2/4 normalise + fold in"
"$PY" apply_corpus_cleanup.py
S2=$?; echo "STEP2_EXIT=$S2"

step "3/4 can a concept-disjoint split be built now?"
"$PY" split_cue_disjoint.py
S3=$?; echo "STEP3_EXIT=$S3"

step "4/4 did the lexical leak close? (control)"
if [ "$S3" -eq 0 ]; then
  "$PY" lexical_baseline.py --split-file data/corpus_v3/cue_split.csv
else
  echo "skipped: no usable concept-disjoint split yet (step 3 exit $S3)"
  echo "running the standalone control instead (train on corpus, test on holdout)"
  "$PY" lexical_baseline.py
fi
S4=$?; echo "STEP4_EXIT=$S4"

echo
echo "ALL_DONE matched_pairs=$S1 cleanup=$S2 split=$S3 baseline=$S4"
echo "  acceptance test: lexical AUC should fall toward 0.5 on the cue-disjoint split."
