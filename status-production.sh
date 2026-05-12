#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [[ ! -f app.pid ]]; then
  echo "Not running (no app.pid)."
  exit 0
fi

PID="$(cat app.pid || true)"
if [[ -n "${PID}" ]] && kill -0 "${PID}" 2>/dev/null; then
  echo "Running with PID ${PID}"
else
  echo "app.pid exists but process is not running"
fi
