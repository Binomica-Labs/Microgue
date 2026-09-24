#!/bin/bash
# Package the tree for sync -- ONLY if it is genuinely clean.
#
# Committed to the repo so it is never rewritten from memory again. Twice a
# tarball shipped source that only linted clean after an `eslint --fix`, and
# CI (which never fixes) failed. This runs the same plain lint CI runs,
# immediately before tar, and again on the packaged copy.
set -euo pipefail
cd "$(dirname "$0")/.."
V=$(python3 -c "import json;print(json.load(open('package.json'))['version'])")
echo "==> gate: plain lint (no --fix)"
npx eslint src test >/dev/null 2>&1 || { echo "!! lint fails -- NOT packaging"; npx eslint src test 2>&1 | grep -E "[0-9]+:[0-9]+" | head -5; exit 1; }
echo "==> gate: tsc"
npx tsc --noEmit >/dev/null 2>&1 || { echo "!! tsc fails -- NOT packaging"; exit 1; }
ROOT=$(cd .. && pwd)
STAGE=$(mktemp -d)
cp -r "$ROOT/web" "$STAGE/microgue-web"
for f in HANDOVER.md LICENSE README.md .gitignore; do
  [ -f "$ROOT/$f" ] && cp "$ROOT/$f" "$STAGE/microgue-web/" || true
done
[ -d "$ROOT/.github" ] && cp -r "$ROOT/.github" "$STAGE/microgue-web/" || true
rm -rf "$STAGE/microgue-web/node_modules"
rm -f /mnt/user-data/outputs/*.tar.gz
tar czf "/mnt/user-data/outputs/microgue-web-v$V.tar.gz" \
  --exclude='*.log' --exclude='public/icons' --exclude='public/*.js' \
  -C "$STAGE" microgue-web
gzip -t "/mnt/user-data/outputs/microgue-web-v$V.tar.gz"
rm -rf "$STAGE"
ls -l "/mnt/user-data/outputs/microgue-web-v$V.tar.gz" | awk '{printf "  packaged v'"$V"' %.0f KB, lint-gated\n", $5/1024}'
