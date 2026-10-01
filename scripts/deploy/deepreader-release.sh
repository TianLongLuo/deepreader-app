#!/usr/bin/env bash
# Reviewed only for the user's existing DeepReader installation, not a general server installer.
set -Eeuo pipefail
APP=/opt/deepreader-app
[[ $# = 2 && "$1" =~ ^[0-9a-f]{40}$ && "$2" =~ ^[0-9a-f]{40}$ ]] || { echo 'Usage: deepreader-release.sh NEW_SHA EXPECTED_OLD_SHA'; exit 2; }
[[ $EUID = 0 ]] || { echo 'Run as the existing app owner root'; exit 2; }
export PATH=/root/.local/bin:$PATH
cd "$APP"
NEW="$1"; OLD="$2"; STOPPED=0; UPDATED=0; DEPS=0; UNIT=0
[[ "$(pwd -P)" = "$APP" && "$(git rev-parse HEAD)" = "$OLD" && -z "$(git status --porcelain)" ]]
[[ -s .env.production && -s prisma/dev.db && -d storage && -d .next && -d node_modules ]]
[[ "$(node -p 'process.versions.node.split(".")[0]')" = 22 ]]
[[ "$(systemctl show deepreader.service -p WorkingDirectory --value)" = "$APP" ]]
python3 -c 'import sys,venv,sqlite3; assert sys.version_info >= (3,9)'
node --env-file=.env.production -e 'if(!["file:./dev.db","file:/opt/deepreader-app/prisma/dev.db"].includes(process.env.DATABASE_URL))throw Error("Verify app database path before releasing")'
git fetch origin main
[[ "$(git rev-parse origin/main)" = "$NEW" ]]
git merge-base --is-ancestor "$OLD" "$NEW"
B="/opt/deepreader-app-backups/$(date +%Y%m%d-%H%M%S)-learning-${NEW:0:7}"
install -d -m 700 "$B"
exec > >(tee -a "$B/release.log") 2>&1
rollback(){
 local rc="$1"; trap - ERR; set +e
 printf 'RELEASE_FAILED=%s; restoring only app code/runtime; keeping additive learning data\n' "$rc"
 if [[ "$STOPPED" = 1 ]]; then systemctl stop deepreader-worker.service; systemctl stop deepreader.service; fi
 if [[ "$UPDATED" = 1 ]]; then git reset --keep "$OLD"; [[ ! -d .next ]] || mv .next "$B/failed-next"; cp -a "$B/next" .next; fi
 if [[ "$DEPS" = 1 ]]; then [[ ! -d node_modules ]] || mv node_modules "$B/failed-node_modules"; mv "$B/node_modules" node_modules; fi
 if [[ "$UNIT" = 1 ]]; then
  if [[ -f "$B/worker.service" ]]; then cp -a "$B/worker.service" /etc/systemd/system/deepreader-worker.service; [[ -f "$B/worker-was-enabled" ]] || systemctl disable deepreader-worker.service; else systemctl disable deepreader-worker.service; rm -f /etc/systemd/system/deepreader-worker.service; fi
  systemctl daemon-reload
 fi
 if [[ "$STOPPED" = 1 ]]; then systemctl start deepreader.service; [[ ! -f "$B/worker-was-active" ]] || systemctl start deepreader-worker.service; fi
 printf 'ROLLBACK_APP_STATE=%s\nBACKUP=%s\n' "$(systemctl is-active deepreader.service)" "$B"
 exit "$rc"
}
trap 'rc=$?; printf "FAIL_LINE=%s\n" "$LINENO"; rollback "$rc"' ERR
printf 'OLD=%s\nNEW=%s\nBACKUP=%s\n' "$OLD" "$NEW" "$B"
df -h "$APP"; free -m
cp -a .env.production "$B/env.production"; cp -a .next "$B/next"; printf '%s\n' "$OLD" > "$B/old-commit"
sha256sum .env.production /etc/nginx/sites-enabled/activecoach /etc/systemd/system/deepreader.service > "$B/config.sha256"
if [[ -f /etc/systemd/system/deepreader-worker.service ]]; then
 [[ "$(systemctl show deepreader-worker.service -p WorkingDirectory --value)" = "$APP" ]]
 cp -a /etc/systemd/system/deepreader-worker.service "$B/worker.service"
 systemctl is-enabled --quiet deepreader-worker.service && touch "$B/worker-was-enabled" || true
fi
STOPPED=1
if systemctl is-active --quiet deepreader-worker.service; then touch "$B/worker-was-active"; systemctl stop deepreader-worker.service; fi
systemctl stop deepreader.service || true
state="$(systemctl show deepreader.service -p ActiveState --value)"
[[ "$state" = inactive || "$state" = failed ]]
[[ "$(systemctl show deepreader.service -p MainPID --value)" = 0 ]]
if curl -s -o /dev/null --max-time 2 http://127.0.0.1:3000/login; then echo 'App port is still in use'; false; fi
# Consistent SQLite backup includes WAL commits; never restore it automatically after new writes.
python3 - "$B/SNAPSHOT.db" <<'PY'
import sqlite3,sys
source=sqlite3.connect('file:/opt/deepreader-app/prisma/dev.db?mode=ro',uri=True)
copy=sqlite3.connect(sys.argv[1]);source.backup(copy);copy.close();source.close()
PY
cp -a "$B/SNAPSHOT.db" "$B/COPY.db"
cp -a storage "$B/storage"
find storage -type f -print0 | sort -z | xargs -0 -r sha256sum > "$B/storage.sha256"
mv node_modules "$B/node_modules"; DEPS=1
git merge --ff-only "$NEW"; UPDATED=1
npm ci --no-audit --no-fund
npx prisma generate
bash scripts/frequency/setup.sh
node scripts/qa/production-copy.mjs --database "$B/COPY.db"
# Backup-copy rehearsal passed. Live schema is additive/versioned, no db push/reset.
node scripts/migrate-learning-schema.mjs --database "$APP/prisma/dev.db"
node --import tsx scripts/migrate-vocabulary.ts --database "$APP/prisma/dev.db"
systemd-run --wait --pipe --collect --service-type=exec --unit="deepreader-build-$(date +%s)" -p WorkingDirectory="$APP" -p MemoryMax=1800M -p MemorySwapMax=512M -p CPUQuota=100% -p Nice=10 --setenv=PATH=/root/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin --setenv=NODE_OPTIONS=--max-old-space-size=1024 /root/.local/bin/npm run build
[[ -s .next/BUILD_ID && -f .next/server/app/api/study/practice/route.js ]]
sha256sum -c "$B/config.sha256"; sha256sum -c "$B/storage.sha256"
UNIT=1
install -m 644 scripts/deploy/deepreader-worker.service /etc/systemd/system/deepreader-worker.service
systemctl daemon-reload; systemctl enable deepreader-worker.service
systemctl start deepreader.service; systemctl start deepreader-worker.service
code=000
for i in $(seq 1 30); do code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:3000/login || true); [[ "$code" = 200 ]] && break; sleep 1; done
[[ "$code" = 200 ]]
systemctl is-active --quiet deepreader.service; systemctl is-active --quiet deepreader-worker.service
[[ "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 https://app.coacheverything.tech/login)" = 200 ]]
[[ "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 -H 'Content-Type: application/json' -d '{}' https://app.coacheverything.tech/api/study/practice)" = 401 ]]
sha256sum -c "$B/config.sha256"; sha256sum -c "$B/storage.sha256"
printf '__LEARNING_RELEASE_SUCCESS__\nCOMMIT=%s\nBACKUP=%s\n' "$(git rev-parse HEAD)" "$B"
systemctl show deepreader.service deepreader-worker.service -p ActiveState -p MainPID --no-pager
