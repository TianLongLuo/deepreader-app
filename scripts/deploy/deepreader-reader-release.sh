#!/usr/bin/env bash
# Project-only update for the existing DeepReader installation. No installer or schema changes.
set -Eeuo pipefail
APP=/opt/deepreader-app
BACKUPS=/opt/deepreader-app-backups
WEB=deepreader.service
[[ $# = 2 && "$1" =~ ^[0-9a-f]{40}$ && "$2" =~ ^[0-9a-f]{40}$ ]] || { echo 'Usage: deepreader-reader-release.sh NEW_SHA EXPECTED_OLD_SHA'; exit 2; }
[[ $EUID = 0 ]] || { echo 'Run using the existing root deployment identity'; exit 2; }
NEW_SHA="$1"; EXPECTED_OLD_SHA="$2"; STOPPED=0; UPDATED=0; B=''
export PATH=/root/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
cd "$APP"
git(){ command git -c safe.directory="$APP" "$@"; }
[[ "$(pwd -P)" = "$APP" && "$(git rev-parse HEAD)" = "$EXPECTED_OLD_SHA" && -z "$(git status --porcelain)" ]] || exit 2
[[ -s .env.production && -s prisma/dev.db && -d storage/uploads && -s .next/BUILD_ID && -d node_modules ]] || exit 2
[[ "$(systemctl show "$WEB" -p WorkingDirectory --value)" = "$APP" ]] || exit 2
[[ "$(systemctl show "$WEB" -p FragmentPath --value)" = /etc/systemd/system/deepreader.service ]] || exit 2
[[ -f /etc/systemd/system/deepreader.service && ! -L /etc/systemd/system/deepreader.service ]] || exit 2
systemctl is-active --quiet "$WEB"
NODE=$(command -v node); NPM=$(command -v npm)
[[ "$($NODE -p 'process.versions.node.split(".")[0]')" = 22 && -x "$NODE" && -x "$NPM" ]] || exit 2
EXEC=$(systemctl show "$WEB" -p ExecStart --value)
[[ "$EXEC" = *"$APP"* && "$EXEC" = *node_modules/next/dist/bin/next* ]] || exit 2
OWNER=$(stat -c '%U' "$APP"); SERVICE_USER=$(systemctl show "$WEB" -p User --value)
[[ "${SERVICE_USER:-root}" = "$OWNER" ]] || exit 2
"$NODE" --env-file=.env.production -e 'if(!["file:./dev.db","file:/opt/deepreader-app/prisma/dev.db"].includes(process.env.DATABASE_URL))throw Error("Verify app database path before release")'
worker_before=$(systemctl show deepreader-worker.service -p ActiveState --value)
worker_pid=$(systemctl show deepreader-worker.service -p MainPID --value)
[[ "$worker_before" = active || "$worker_before" = inactive || "$worker_before" = failed ]]
if [[ -f /etc/systemd/system/deepreader-worker.service ]]; then
 [[ "$(systemctl show deepreader-worker.service -p WorkingDirectory --value)" = "$APP" ]] || exit 2
 [[ "$(systemctl show deepreader-worker.service -p FragmentPath --value)" = /etc/systemd/system/deepreader-worker.service ]] || exit 2
fi
remote=$(git remote get-url origin)
[[ "$remote" = https://github.com/TianLongLuo/deepreader-app.git || "$remote" = git@github.com:TianLongLuo/deepreader-app.git ]]
git fetch origin main
[[ "$(git rev-parse origin/main)" = "$NEW_SHA" ]] || exit 2
git merge-base --is-ancestor "$EXPECTED_OLD_SHA" "$NEW_SHA"
[[ -z "$(git diff --name-only "$EXPECTED_OLD_SHA" "$NEW_SHA" -- package.json package-lock.json prisma/schema.prisma)" ]] || exit 2
need=$(( $(du -sk .next prisma/dev.db | awk '{n+=$1} END{print n}') * 2 + 524288 ))
free_kb=$(df -Pk "$APP" | awk 'END{print $4}'); [[ "$free_kb" -ge "$need" ]]
B="$BACKUPS/$(date +%Y%m%d-%H%M%S)-reader-${NEW_SHA:0:7}"
[[ ! -e "$B" ]]; install -d -m 700 "$B" || exit 2
exec > >(tee -a "$B/release.log") 2>&1
rollback(){
 local rc="$1" failure=0; trap - ERR INT TERM; set +e
 printf 'RELEASE_FAILED=%s\nBACKUP=%s\n' "$rc" "$B"
 if [[ "$STOPPED" = 1 ]]; then
  systemctl stop "$WEB" || failure=1
  if [[ "$UPDATED" = 1 ]]; then
   git reset --keep "$EXPECTED_OLD_SHA" || failure=1
   if [[ -d .next ]]; then mv .next "$B/failed-next" || failure=1; fi
   cp -a "$B/next" .next || failure=1
  fi
  systemctl start "$WEB" || failure=1
  systemctl is-active --quiet "$WEB" || failure=1
 fi
 printf 'ROLLBACK_SECONDARY_FAILURE=%s\nROLLBACK_HEAD=%s\n' "$failure" "$(git rev-parse HEAD)"
 # The consistent database snapshot is for manual recovery, never copied over live data.
 exit "$rc"
}
trap 'rc=$?; printf "FAIL_LINE=%s\n" "$LINENO"; rollback "$rc"' ERR
trap 'rollback 130' INT
trap 'rollback 143' TERM
printf 'OLD=%s\nNEW=%s\nBACKUP=%s\nWORKER_BEFORE=%s PID=%s\n' "$EXPECTED_OLD_SHA" "$NEW_SHA" "$B" "$worker_before" "$worker_pid"
df -h "$APP"; free -m
cp -a .env.production "$B/env.production"; cp -a .next "$B/next"
printf '%s\n' "$EXPECTED_OLD_SHA" > "$B/old-commit"
sha256sum .env.production /etc/nginx/sites-enabled/activecoach /etc/systemd/system/deepreader.service > "$B/config.sha256"
if [[ -f /etc/systemd/system/deepreader-worker.service ]]; then sha256sum /etc/systemd/system/deepreader-worker.service >> "$B/config.sha256"; fi
find storage/uploads -type f -print0 | sort -z | xargs -0 -r sha256sum > "$B/uploads.sha256"
python3 - "$APP/prisma/dev.db" "$B/SNAPSHOT.db" <<'PY'
import sqlite3,sys
source=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
copy=sqlite3.connect(sys.argv[2]);source.backup(copy)
assert copy.execute('PRAGMA quick_check').fetchone()[0]=='ok'
assert not copy.execute('PRAGMA foreign_key_check').fetchall()
copy.close();source.close()
PY
# Trap is armed before the first process change; never stop the existing worker.
STOPPED=1
systemctl stop "$WEB"
[[ "$(systemctl show "$WEB" -p MainPID --value)" = 0 ]] || rollback 2
state=$(systemctl show "$WEB" -p ActiveState --value); [[ "$state" = inactive || "$state" = failed ]] || rollback 2
if curl -s -o /dev/null --max-time 2 http://127.0.0.1:3000/login; then echo 'App port remains occupied'; false; fi
UPDATED=1; git merge --ff-only "$NEW_SHA"
systemd-run --wait --pipe --collect --service-type=exec --unit="deepreader-build-$(date +%s)" -p WorkingDirectory="$APP" -p User="$OWNER" -p MemoryMax=1800M -p MemorySwapMax=512M -p CPUQuota=100% -p Nice=10 --setenv=PATH="$PATH" --setenv=NODE_OPTIONS=--max-old-space-size=1024 "$NPM" run build
[[ -s .next/BUILD_ID && -f .next/server/app/api/semantic-flip/route.js ]] || rollback 2
sha256sum -c "$B/config.sha256"; sha256sum -c "$B/uploads.sha256"
systemctl start "$WEB"
code=000
for i in $(seq 1 30); do code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:3000/login || true); [[ "$code" = 200 ]] && break; sleep 1; done
[[ "$code" = 200 ]] || rollback 2
[[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://app.coacheverything.tech/login)" = 200 ]] || rollback 2
[[ "$(curl -s -X POST -H 'Content-Type: application/json' --data '{}' -o /dev/null -w '%{http_code}' --max-time 15 https://app.coacheverything.tech/api/semantic-flip)" = 401 ]] || rollback 2
[[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://app.coacheverything.tech/api/documents)" = 401 ]] || rollback 2
asset=$(grep -rl '语义翻牌' .next/static/chunks | sed -n '1p'); [[ -n "$asset" ]]
[[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://app.coacheverything.tech/_next/${asset#.next/}")" = 200 ]] || rollback 2
pid=$(systemctl show "$WEB" -p MainPID --value); restarts=$(systemctl show "$WEB" -p NRestarts --value)
sleep 5; systemctl is-active --quiet "$WEB"
[[ "$pid" != 0 && "$(systemctl show "$WEB" -p MainPID --value)" = "$pid" && "$(systemctl show "$WEB" -p NRestarts --value)" = "$restarts" ]] || rollback 2
[[ "$(systemctl show deepreader-worker.service -p ActiveState --value)" = "$worker_before" ]] || rollback 2
printf 'WORKER_AFTER_PID=%s (natural PID changes allowed; no worker commands issued)\n' "$(systemctl show deepreader-worker.service -p MainPID --value)"
python3 - "$APP/prisma/dev.db" <<'PY'
import sqlite3,sys
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
assert c.execute('PRAGMA quick_check').fetchone()[0]=='ok'
assert not c.execute('PRAGMA foreign_key_check').fetchall()
print('SQLITE_QUICK_CHECK=ok FK_ERRORS=0');c.close()
PY
sha256sum -c "$B/config.sha256"; sha256sum -c "$B/uploads.sha256"
[[ "$(git rev-parse HEAD)" = "$NEW_SHA" && -z "$(git status --porcelain)" ]] || rollback 2
trap - ERR INT TERM
printf '__READER_MODES_RELEASE_SUCCESS__\nSHA=%s\nBACKUP=%s\n' "$NEW_SHA" "$B"
