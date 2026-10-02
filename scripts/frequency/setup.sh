#!/usr/bin/env bash
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
python3 -c 'import sys; assert sys.version_info >= (3,9), "Python 3.9+ is required"'
python3 scripts/frequency/bootstrap.py
.runtime/frequency/bin/python -m pip --isolated install --index-url https://pypi.org/simple --disable-pip-version-check --no-cache-dir --require-hashes -r scripts/frequency/requirements.lock
printf '[{"lemma":"occasion","language":"en"},{"lemma":"negociar","language":"es"}]' | .runtime/frequency/bin/python scripts/frequency/query.py
