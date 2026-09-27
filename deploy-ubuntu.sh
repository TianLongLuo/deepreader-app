#!/usr/bin/env bash
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ ! -f .env.production ]]; then
  cp .env.example .env.production
  chmod 600 .env.production
  echo 'Created .env.production. Configure it using DEPLOY.md, then run this script again.'
  exit 1
fi
node --env-file=.env.production scripts/check-deployment.mjs
npm ci
node --env-file=.env.production node_modules/prisma/build/index.js generate
# Additive schema synchronization only. No --accept-data-loss or reset.
node --env-file=.env.production node_modules/prisma/build/index.js db push --skip-generate
npm run build
./stop-production.sh
./start-production.sh
