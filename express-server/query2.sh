#!/usr/bin/env bash
#
# Inspect the Sentinel *inference service* directly: shows what the two models
# see and score for a goal/subtask pair, before any verdict is combined.
#
#   ./query2.sh "Process disability benefits for this veteran" "Delete the database"
#
# Unlike query.sh (which asks the express gateway for the final verdict), this
# talks straight to the FastAPI service so it can print the model internals:
#   * NLI  - framed premise/hypothesis, subword tokens + input_ids, the raw
#            (pre-softmax) logits, and the softmax probabilities.
#   * Contrastive - the two framed strings, their subword tokens + ids, the
#            normalized goal & subtask embeddings, and their cosine similarity.
#   * Per-token encoder vectors for both models when DETAIL=full.
#
# Arguments:
#   $1  goal     (required, 1-2000 chars)
#   $2  subtask  (required, 1-2000 chars)
#
# Environment overrides:
#   SENTINEL_FASTAPI_URL     inference base URL (default: http://localhost:8000)
#   DETAIL                   "full" | "summary" (default: full)
#                            full    -> also print per-token encoder vectors
#                            summary -> tokens + embeddings only (small payload)
#   DIMS                     truncate every vector to N dims (0 = full; default: 0)
#   NLI_THRESHOLD            optional NLI threshold override (0-1)
#   CONTRASTIVE_THRESHOLD    optional contrastive threshold override (0-1)
#
# Exits 0 on a 2xx answer, 1 on any HTTP/transport error.
set -euo pipefail

BASE_URL="${SENTINEL_FASTAPI_URL:-http://localhost:8000}"
DETAIL="${DETAIL:-full}"
DIMS="${DIMS:-0}"
NLI_THRESHOLD="${NLI_THRESHOLD:-null}"
CONTRASTIVE_THRESHOLD="${CONTRASTIVE_THRESHOLD:-null}"

if [ "$#" -ne 2 ]; then
  echo "usage: $(basename "$0") <goal> <subtask>" >&2
  exit 2
fi

GOAL="$1"
SUBTASK="$2"

if [ -z "${GOAL//[[:space:]]/}" ] || [ -z "${SUBTASK//[[:space:]]/}" ]; then
  echo "error: goal and subtask must both be non-empty" >&2
  exit 2
fi

case "$DETAIL" in
  full)    TOKEN_VECTORS=true ;;
  summary) TOKEN_VECTORS=false ;;
  *) echo "error: DETAIL must be 'full' or 'summary' (got '$DETAIL')" >&2; exit 2 ;;
esac

case "$DIMS" in
  ''|*[!0-9]*) echo "error: DIMS must be a non-negative integer (got '$DIMS')" >&2; exit 2 ;;
esac

# Build the JSON body with jq when available, so quotes/newlines in the
# arguments are escaped correctly. Null thresholds fall back to the trained ones.
if command -v jq >/dev/null 2>&1; then
  BODY=$(jq -n \
    --arg goal "$GOAL" --arg subtask "$SUBTASK" \
    --argjson token_vectors "$TOKEN_VECTORS" --argjson embedding_dims "$DIMS" \
    --argjson nli_threshold "$NLI_THRESHOLD" \
    --argjson contrastive_threshold "$CONTRASTIVE_THRESHOLD" \
    '{goal: $goal, subtask: $subtask, token_vectors: $token_vectors,
      embedding_dims: $embedding_dims, nli_threshold: $nli_threshold,
      contrastive_threshold: $contrastive_threshold}')
else
  BODY=$(printf '{"goal":"%s","subtask":"%s","token_vectors":%s,"embedding_dims":%s,"nli_threshold":%s,"contrastive_threshold":%s}' \
    "${GOAL//\\/\\\\}" "${SUBTASK//\\/\\\\}" "$TOKEN_VECTORS" "$DIMS" \
    "$NLI_THRESHOLD" "$CONTRASTIVE_THRESHOLD")
  echo "warning: jq not found, JSON escaping is best-effort" >&2
fi

RESPONSE_FILE=$(mktemp)
trap 'rm -f "$RESPONSE_FILE"' EXIT

# The inference service is unauthenticated (auth lives at the gateway); run it
# bound to localhost and behind the gateway in any real deployment.
HTTP_STATUS=$(curl --silent --show-error \
  --request POST "$BASE_URL/debug/encode" \
  --header 'Content-Type: application/json' \
  --data "$BODY" \
  --output "$RESPONSE_FILE" \
  --write-out '%{http_code}') || {
  echo "error: could not reach $BASE_URL (is the fastapi service running? ./run.sh)" >&2
  exit 1
}

echo "POST $BASE_URL/debug/encode  ->  HTTP $HTTP_STATUS"
if command -v jq >/dev/null 2>&1; then
  jq . < "$RESPONSE_FILE" || cat "$RESPONSE_FILE"
else
  cat "$RESPONSE_FILE"
  echo
fi

case "$HTTP_STATUS" in
  2*) exit 0 ;;
  *) echo "error: request failed (HTTP $HTTP_STATUS)" >&2; exit 1 ;;
esac
