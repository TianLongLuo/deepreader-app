#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
exec "$ROOT/.runtime/frequency/bin/python" "$ROOT/scripts/frequency/query.py"
