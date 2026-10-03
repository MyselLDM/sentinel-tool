#!/usr/bin/env bash
# Top up the matched-pair set after a low-yield run.
#
# Two fixes carried into this pass:
#   1. --append    keeps the pairs already produced instead of overwriting them
#   2. affinity    pairs each concept only with goals that can host a LEGITIMATE use
#                  of it. Dual-use is a property of the (concept, goal) pair, not the
#                  concept alone - "prescription history" has an authorised role in a
#                  disability claim and none in office-equipment procurement. Run 2's
#                  dominant rejection (24x "benign side not authorised") was exactly
#                  this, and the judge was right every time.
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

step "1/4 top up matched pairs (append + goal affinity, fail-closed)"
"$PY" add_matched_pairs.py --per-concept "${PER_CONCEPT:-8}" --append \
  --endpoint "$ENDPOINT" --model "$GEN" \
  --judge-endpoint "$JUDGE_ENDPOINT" --judge-model "$JUDGE" --verbose
S1=$?; echo "STEP1_EXIT=$S1"

step "2/4 normalise + fold in"
"$PY" apply_corpus_cleanup.py
S2=$?; echo "STEP2_EXIT=$S2"

step "3/4 concept-disjoint split feasible now?"
"$PY" split_cue_disjoint.py
S3=$?; echo "STEP3_EXIT=$S3"

step "4/4 acceptance test: did the lexical leak close?"
if [ "$S3" -eq 0 ]; then
  "$PY" lexical_baseline.py --split-file data/corpus_v3/cue_split.csv
else
  echo "no usable concept-disjoint split (step 3 exit $S3) - running the standalone control"
  "$PY" lexical_baseline.py
fi
S4=$?; echo "STEP4_EXIT=$S4"

echo
echo "ALL_DONE topup=$S1 cleanup=$S2 split=$S3 baseline=$S4"
echo "  acceptance: lexical AUC should fall toward 0.5 on the cue-disjoint split."
echo "  then: append Audit F to AUDIT_LOG.md with the result."
