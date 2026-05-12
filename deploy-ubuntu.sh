#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

APP_URL="${1:-${APP_BASE_URL:-http://127.0.0.1:3000}}"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-3000}"

if [[ ! -f ".env.production" ]]; then
  cp ".env.production.template" ".env.production"
fi

python3 - <<'PY' "$APP_URL"
from pathlib import Path
import sys

app_url = sys.argv[1].rstrip("/")
env_path = Path(".env.production")
text = env_path.read_text(encoding="utf-8")
text = text.replace("__APP_BASE_URL__", app_url)
env_path.write_text(text + ("" if text.endswith("\n") else "\n"), encoding="utf-8")
PY

python3 - <<'PY'
from pathlib import Path
import json

config_path = Path("storage/system/app-config.json")
if config_path.exists():
    config = json.loads(config_path.read_text(encoding="utf-8"))
    config["globalGeminiModel"] = "gemini-3-flash-preview"
    config_path.write_text(
        json.dumps(config, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
PY

echo "[1/4] Installing dependencies"
npm ci

echo "[2/4] Generating Prisma client"
npx prisma generate

echo "[3/4] Building application"
npm run build

mkdir -p logs

if [[ -f app.pid ]]; then
  OLD_PID="$(cat app.pid || true)"
  if [[ -n "${OLD_PID}" ]] && kill -0 "${OLD_PID}" 2>/dev/null; then
    kill "${OLD_PID}" || true
    sleep 1
  fi
fi

echo "[4/4] Starting application on ${HOST}:${PORT}"
nohup npm run start -- --hostname "${HOST}" -p "${PORT}" > logs/app.out.log 2> logs/app.err.log &
echo $! > app.pid

echo
echo "DeepReader is starting."
echo "URL: ${APP_URL}"
echo "PID: $(cat app.pid)"
echo "Logs:"
echo "  tail -f ${ROOT_DIR}/logs/app.out.log"
echo "  tail -f ${ROOT_DIR}/logs/app.err.log"
