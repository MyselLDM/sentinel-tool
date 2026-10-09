#!/usr/bin/env bash
#
# Query the Sentinel gateway's public evaluation endpoint.
#
#   ./query.sh "Process disability benefits for this veteran" "Delete the database"
#
# Arguments:
#   $1  goal     (required, 1-2000 chars)
#   $2  subtask  (required, 1-2000 chars)
#
# Environment overrides:
#   SENTINEL_API_KEY   API key (default: the demo key baked in below)
#   SENTINEL_BASE_URL  gateway base URL (default: http://localhost:4000)
#   MODE               "standard" | "detailed" (default: standard)
#
# Exits 0 on an accepted/rejected 2xx answer, 1 on any HTTP/transport error.
set -euo pipefail

API_KEY="${SENTINEL_API_KEY:-sk_test_I1SYhkMoqYcWos3ifLMtt9EGQdFDUpX8}"
BASE_URL="${SENTINEL_BASE_URL:-http://localhost:4000}"
MODE="${MODE:-detailed}"

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

# Build the JSON body with jq when available, so quotes/newlines in the
# arguments are escaped correctly.
if command -v jq >/dev/null 2>&1; then
  BODY=$(jq -n --arg goal "$GOAL" --arg subtask "$SUBTASK" --arg mode "$MODE" \
    '{goal: $goal, subtask: $subtask, mode: $mode}')
else
  BODY=$(printf '{"goal":"%s","subtask":"%s","mode":"%s"}' \
    "${GOAL//\\/\\\\}" "${SUBTASK//\\/\\\\}" "$MODE")
  echo "warning: jq not found, JSON escaping is best-effort" >&2
fi

RESPONSE_FILE=$(mktemp)
trap 'rm -f "$RESPONSE_FILE"' EXIT

HTTP_STATUS=$(curl --silent --show-error \
  --request POST "$BASE_URL/api/evaluate" \
  --header "Authorization: Bearer $API_KEY" \
  --header 'Content-Type: application/json' \
  --data "$BODY" \
  --output "$RESPONSE_FILE" \
  --write-out '%{http_code}') || {
  echo "error: could not reach $BASE_URL (is express-server running? ./run.sh)" >&2
  exit 1
}

echo "POST $BASE_URL/api/evaluate  ->  HTTP $HTTP_STATUS"
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
