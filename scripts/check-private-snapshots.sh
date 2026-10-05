#!/usr/bin/env sh
# Usable as a pre-commit hook: ln -s ../../scripts/check-private-snapshots.sh .git/hooks/pre-commit
exec npx tsx "$(dirname "$0")/check-private-snapshots.ts"
