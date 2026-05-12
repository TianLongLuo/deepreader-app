#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [[ ! -f app.pid ]]; then
  echo "No app.pid found."
  exit 0
fi

PID="$(cat app.pid || true)"
if [[ -n "${PID}" ]] && kill -0 "${PID}" 2>/dev/null; then
  kill "${PID}"
  echo "Stopped PID ${PID}"
else
  echo "Process not running."
fi

rm -f app.pid
