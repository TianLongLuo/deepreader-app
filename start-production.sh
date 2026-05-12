#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-3000}"

mkdir -p logs
nohup npm run start -- --hostname "${HOST}" -p "${PORT}" > logs/app.out.log 2> logs/app.err.log &
echo $! > app.pid
echo "Started with PID $(cat app.pid)"
