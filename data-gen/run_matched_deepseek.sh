#!/usr/bin/env bash
# Regenerate the matched pairs with DeepSeek as BOTH generator and judge, validate
# them, cross-check with the local judges, then rebuild the split and re-measure.
#
# Why regenerate: only 7 of the previous 22 pairs survived an independent audit
# (Audit I). The 9B judge was too permissive, and at ~13 s/call the local pipeline was
# too slow to iterate on. DeepSeek is ~1.2 s/call, so a large strictly-judged run is
# ~15 min instead of hours.
#
# Caveat carried deliberately: DeepSeek generating AND judging is self-judging, which
# loses the cross-model independence the 14B/9B split gave. So step 3 re-judges what
# DeepSeek accepted with the LOCAL 9B - mismatches (DeepSeek accept vs local reject)
# are flagged as possible DeepSeek false-accepts. The local model cannot be the only
# gate, but it is a useful second opinion.
#
# The API key is read from the environment only.
set -u

export MSYS2_ARG_CONV_EXCL='*'
export MSYS_NO_PATHCONV=1

HERE="$(cd "$(dirname "$0")" && pwd)"
PY="${PY:-/c/sentinel-gpu/Scripts/python.exe}"
DS_URL="${DS_URL:-https://api.deepseek.com/v1/chat/completions}"
DS_MODEL="${DS_MODEL:-deepseek-chat}"
LOCAL_JUDGE_URL="${LOCAL_JUDGE_URL:-http://127.0.0.1:8082/v1/chat/completions}"
LOCAL_JUDGE_MODEL="${LOCAL_JUDGE_MODEL:-D:\\llamacpp-rocm\\build\\bin\\models\\Qwen3.5-9B-abliterated-Q4_K_M.gguf}"
# MSYS_NO_PATHCONV=1 protects the Windows model ids, but it also stops MSYS
# converting OUR paths - so convert them explicitly. Without this, Python resolves
# "/d/My Code/..." against the current drive root and writes to a stray tree.
to_win () { cygpath -w "$1" 2>/dev/null || echo "$1"; }
OUT="$(to_win "${OUT:-$HERE/data/corpus_v3/matched_pairs_ds.csv}")"
VALID="$(to_win "${VALID:-$HERE/data/corpus_v3/matched_pairs_ds_validated.csv}")"

if [ -z "${DEEPSEEK_API_KEY:-}" ]; then
  echo "DEEPSEEK_API_KEY is not set - refusing to run (see test_deepseek.py)" >&2
  exit 2
fi
cd "$HERE" || exit 1

step () { echo; echo "=============================================================="; echo "== $1"; echo "=============================================================="; }

step "1/4 generate matched pairs (DeepSeek generator + judge, fail-closed)"
"$PY" add_matched_pairs.py --per-concept "${PER_CONCEPT:-25}" \
  --endpoint "$DS_URL" --model "$DS_MODEL" \
  --judge-endpoint "$DS_URL" --judge-model "$DS_MODEL" \
  --out "$OUT" --verbose
S1=$?; echo "STEP1_EXIT=$S1"

step "2/4 validate independently (both sides, harm context) - keep only survivors"
"$PY" deepseek_pair_audit.py --model "$DS_MODEL" --base "${DS_URL%/chat/completions}" \
  --pairs "$OUT" --out "${VALID%.csv}.json" --write-valid "$VALID"
S2=$?; echo "STEP2_EXIT=$S2"

step "3/4 cross-check with the LOCAL 9B (independent second opinion)"
if [ -f "$VALID" ]; then
  echo "-- rows DeepSeek accepted, re-judged locally; local REJECTs are flagged --"
  "$PY" rejudge_rows.py --file "$VALID" --label 0 \
    --judge-endpoint "$LOCAL_JUDGE_URL" --judge-model "$LOCAL_JUDGE_MODEL" \
    --out "${VALID%.csv}_localcrosscheck.json" 2>&1 | tail -14
else
  echo "no validated file produced"
fi
S3=$?; echo "STEP3_EXIT=$S3"

step "4/4 fold in, rebuild the split, re-measure the ceiling"
"$PY" apply_corpus_cleanup.py && \
"$PY" split_cue_disjoint.py && \
"$PY" lexical_baseline.py --split-file data/corpus_v3/cue_split.csv
S4=$?; echo "STEP4_EXIT=$S4"

echo
echo "ALL_DONE generate=$S1 validate=$S2 crosscheck=$S3 rebuild=$S4"
echo "  record the outcome in AUDIT_LOG.md as Audit J, including a null result."
