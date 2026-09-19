#!/usr/bin/env bash
#
# Run the Sentinel Express API gateway.
#
#   ./run.sh          # npm start   (http://localhost:4000)
#   ./run.sh dev      # npm run dev (auto-restart on file changes)
#
# Installs dependencies on first run. Copy .env.example to .env to configure.
# Requires Node.js >= 18.
set -euo pipefail
cd "$(dirname "$0")"

MODE="${1:-start}"
case "$MODE" in
  start|dev) ;;
  *)
    echo "usage: ./run.sh [start|dev]" >&2
    exit 2
    ;;
esac

if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm (Node.js >= 18) not found." >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "==> Installing dependencies (npm install)"
  npm install
fi

if [ ! -f .env ] && [ -f .env.example ]; then
  echo "==> No .env found - using defaults (copy .env.example to .env to customise)."
fi

echo "==> Express API starting ($MODE) ..."
exec npm run "$MODE"
