#!/bin/sh
set -eu

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
git config core.hooksPath .githooks
chmod +x .githooks/pre-push
printf 'Installed local Git hooks at %s/.githooks\n' "$ROOT"
printf 'Every push will run scripts/secret-scan.py and git diff --check.\n'
