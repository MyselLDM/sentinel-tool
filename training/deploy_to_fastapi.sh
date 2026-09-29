#!/usr/bin/env bash
# Deploy the trained models into the FastAPI service, atomically.
#
# Copying training/models/ into fastapi/.models/ by hand is NOT enough:
#   1. fastapi/model_config.json must name the copied directories AND carry the
#      trained thresholds - otherwise app/models.py logs a warning and silently
#      serves the UNTRAINED base models at threshold 0.5.
#   2. That config is rewritten by compare_models.py on every training run, so it
#      reflects whichever protocol finished LAST (run_protocols_gpu.sh ends with
#      'sample', whose thresholds are optimistically tight). Use --protocol group.
#   3. The service reads the config once at startup, so it must be restarted.
#
# This script does all of it and then VERIFIES the result before you restart.
#
# Usage:
#   ./deploy_to_fastapi.sh                      # deploy the 'group' (primary) protocol
#   ./deploy_to_fastapi.sh --protocol sample    # deploy the paraphrase-holdout config
#   ./deploy_to_fastapi.sh --dry-run            # show what would happen
#   ./deploy_to_fastapi.sh --verify             # after restarting: assert trained models are live
#
# Git Bash / MSYS. PowerShell users: use deploy_to_fastapi.ps1.

set -uo pipefail

PROTOCOL="group"
DRY_RUN=0
VERIFY_ONLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --protocol) PROTOCOL="${2:-}"; shift 2 ;;
    --protocol=*) PROTOCOL="${1#*=}"; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --verify) VERIFY_ONLY=1; shift ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

case "$PROTOCOL" in
  group|stratified|sample) ;;
  *) echo "bad --protocol: $PROTOCOL (want group|stratified|sample)" >&2; exit 2 ;;
esac

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
SRC="$HERE/models"
DEST="$REPO/fastapi/.models"
SRC_CFG="$SRC/model_config.json"
# The service reads settings.model_config_path = fastapi/model_config.json.
# NOT fastapi/.models/model_config.json - a config left inside the models dir is
# never read, and a stale one there is actively misleading.
DEST_CFG="$REPO/fastapi/model_config.json"

say()  { echo "$*"; }
step() { echo; echo "==> $*"; }
die()  { echo "ERROR: $*" >&2; exit 1; }
run()  { if [ "$DRY_RUN" = 1 ]; then echo "    [dry-run] $*"; else "$@"; fi; }

# -- interpreter (needed for JSON handling) -----------------------------------
PY="${SENTINEL_PYTHON:-}"
if [ -z "$PY" ]; then
  for candidate in "/c/sentinel-gpu/Scripts/python.exe" "$REPO/fastapi/.venv/Scripts/python.exe" "$REPO/fastapi/.venv/bin/python"; do
    [ -x "$candidate" ] && PY="$candidate" && break
  done
fi
[ -n "$PY" ] || die "no python found; set SENTINEL_PYTHON"
json() { "$PY" -c "$1" "$2"; }

# -- --verify: run this AFTER restarting the service --------------------------
if [ "$VERIFY_ONLY" = 1 ]; then
  step "verifying the running FastAPI service (http://localhost:8000/health)"
  "$PY" - <<'PY'
import json, sys, urllib.error, urllib.request
url = "http://localhost:8000/health"
try:
    with urllib.request.urlopen(url, timeout=5) as resp:
        body, code = json.load(resp), resp.status
except urllib.error.HTTPError as exc:
    body, code = json.load(exc), exc.code
except Exception as exc:  # noqa: BLE001
    print(f"  could not reach {url}: {type(exc).__name__}: {exc}")
    sys.exit(1)
print(f"  HTTP {code}  status={body.get('status')}  ready={body.get('ready')}  on_base_models={body.get('on_base_models')}")
print(f"  nli={body.get('nli_version')}  contrastive={body.get('contrastive_version')}")
if body.get("model_error"):
    print(f"  model_error: {body['model_error']}")
if body.get("on_base_models") is False and body.get("ready"):
    print("  OK - serving the trained models.")
    sys.exit(0)
print("  NOT READY - the service is not serving trained models (see above).")
sys.exit(1)
PY
  exit $?
fi

say "Sentinel model deploy"
say "  source      : $SRC"
say "  destination : $DEST"
say "  protocol    : $PROTOCOL"
[ "$DRY_RUN" = 1 ] && say "  mode        : DRY RUN"

# -- 1. make sure the config matches the requested protocol -------------------
step "1/5 config for protocol '$PROTOCOL'"
if [ ! -f "$SRC_CFG" ]; then
  say "  no $SRC_CFG - generating it"
  run "$PY" "$HERE/compare_models.py" --protocol "$PROTOCOL" >/dev/null || die "compare_models.py failed"
fi
if [ -f "$SRC_CFG" ]; then
  HAVE="$(json "import json,sys;print(json.load(open(sys.argv[1],encoding='utf-8')).get('protocol_key',''))" "$SRC_CFG")"
  [ -z "$HAVE" ] && HAVE="$(json "import json,sys;print(json.load(open(sys.argv[1],encoding='utf-8')).get('protocol','?'))" "$SRC_CFG")"
  if [ "$HAVE" != "$PROTOCOL" ]; then
    say "  config was built from '$HAVE'; regenerating from '$PROTOCOL'"
    run "$PY" "$HERE/compare_models.py" --protocol "$PROTOCOL" >/dev/null || die "compare_models.py failed"
  else
    say "  already '$PROTOCOL' - leaving it alone"
  fi
fi

NLI_DIR="$(json "import json,sys;print(json.load(open(sys.argv[1],encoding='utf-8'))['nli']['model_dir'])" "$SRC_CFG")"
CON_DIR="$(json "import json,sys;print(json.load(open(sys.argv[1],encoding='utf-8'))['contrastive']['model_dir'])" "$SRC_CFG")"
NLI_THR="$(json "import json,sys;print(json.load(open(sys.argv[1],encoding='utf-8'))['nli']['threshold'])" "$SRC_CFG")"
CON_THR="$(json "import json,sys;print(json.load(open(sys.argv[1],encoding='utf-8'))['contrastive']['threshold'])" "$SRC_CFG")"
say "  nli         : $NLI_DIR  (threshold $NLI_THR)"
say "  contrastive : $CON_DIR  (threshold $CON_THR)"

# -- 2. the source must actually be complete ---------------------------------
step "2/5 checking source models"
for d in "$NLI_DIR" "$CON_DIR"; do
  [ -d "$SRC/$d" ] || die "missing source directory: $SRC/$d"
  [ -f "$SRC/$d/model.safetensors" ] || die "missing weights: $SRC/$d/model.safetensors"
  say "  ok  $d  ($(du -h "$SRC/$d/model.safetensors" | cut -f1) weights)"
done

# -- 3. prune ONLY stale copies of our two models (never the directory) -------
step "3/5 pruning stale model dirs in the destination"
[ -d "$DEST" ] || { say "  creating $DEST"; run mkdir -p "$DEST"; }
for existing in "$DEST"/sentinelagent-nli-* "$DEST"/contrastive-miniLM-*; do
  [ -e "$existing" ] || continue
  name="$(basename "$existing")"
  [ "$name" = "$NLI_DIR" ] && continue
  [ "$name" = "$CON_DIR" ] && continue
  say "  removing stale: $name"
  run rm -rf "$existing"
done
# A model_config.json sitting INSIDE .models is never read; a stale copy of it is
# how a deployment can look right on disk and still serve base models.
if [ -f "$DEST/model_config.json" ]; then
  say "  removing stray $DEST/model_config.json (unused; the service reads $DEST_CFG)"
  run rm -f "$DEST/model_config.json"
fi

# -- 4. copy the models and install the config -------------------------------
step "4/5 copying models + config"
for d in "$NLI_DIR" "$CON_DIR"; do
  run rm -rf "$DEST/$d"
  run cp -r "$SRC/$d" "$DEST/$d"
  [ "$DRY_RUN" = 1 ] || say "  copied $d"
done
run cp -f "$SRC_CFG" "$DEST_CFG"
say "  installed model_config.json"

# -- 5. assert the installed config resolves (catches the silent fallback) ---
step "5/5 verifying the installed config"
"$PY" - "$DEST_CFG" "$DEST" <<'PY' || exit 1
import json, os, sys
config_path, models_dir = sys.argv[1], sys.argv[2]
cfg = json.load(open(config_path, encoding="utf-8"))
problems = []
for key in ("nli", "contrastive"):
    entry = cfg.get(key) or {}
    name = entry.get("model_dir")
    path = os.path.join(models_dir, name or "")
    if not name or not os.path.isdir(path):
        problems.append(f"{key}: model_dir {name!r} does not resolve under {models_dir}")
        continue
    weights = os.path.join(path, "model.safetensors")
    if not os.path.isfile(weights):
        problems.append(f"{key}: no model.safetensors in {path}")
        continue
    print(f"  ok  {key:<12} {name}  threshold={entry.get('threshold')}")
if problems:
    print("\n  FAILED:")
    for problem in problems:
        print(f"    - {problem}")
    sys.exit(1)
print(f"  protocol recorded: {cfg.get('protocol_key', '?')}")
PY

step "done"
say "Restart the FastAPI service so it re-reads the config - a running process"
say "keeps the config it read at startup:"
say "    cd \"$REPO/fastapi\" && ./run.sh"
say ""
say "Then confirm it is serving the trained models:"
say "    \"$0\" --verify"
