#!/bin/bash
# Package the web tree -- but ONLY if plain lint (no --fix) and tsc pass on
# the exact files being packaged. Twice now a tarball shipped source that
# only linted clean after a --fix pass: eslint --fix had repaired the working
# tree in the session, the package was cut from a state that predated it, and
# CI (which never fixes) failed. This gate runs the same plain lint CI runs,
# immediately before tar, so the two can no longer disagree.
set -euo pipefail
cd /home/claude/Microgue/web
V=$(python3 -c "import json;print(json.load(open('package.json'))['version'])")
echo "==> gate: plain lint (no --fix)"
npx eslint src test >/dev/null 2>&1 || { echo "!! lint fails -- NOT packaging"; npx eslint src test 2>&1 | grep -E "[0-9]+:[0-9]+" | head -5; exit 1; }
echo "==> gate: tsc"
npx tsc --noEmit >/dev/null 2>&1 || { echo "!! tsc fails -- NOT packaging"; exit 1; }
echo "==> both clean; packaging v$V"
cd /home/claude && rm -rf /tmp/pack && mkdir -p /tmp/pack
cp -r /home/claude/Microgue/web /tmp/pack/microgue-web
cp /home/claude/Microgue/HANDOVER.md /tmp/pack/microgue-web/HANDOVER.md
cp /home/claude/Microgue/.gitignore /tmp/pack/microgue-web/.gitignore.root
mkdir -p /tmp/pack/microgue-web/.github/workflows
cp /home/claude/Microgue/.github/workflows/pages.yml /tmp/pack/microgue-web/.github/workflows/
rm -rf /tmp/pack/microgue-web/node_modules
rm -f /mnt/user-data/outputs/*.tar.gz
tar czf "/mnt/user-data/outputs/microgue-web-v$V.tar.gz" \
  --exclude='*.log' --exclude='public/icons' --exclude='public/*.js' \
  -C /tmp/pack microgue-web
gzip -t "/mnt/user-data/outputs/microgue-web-v$V.tar.gz"
# and verify the PACKAGED copy lints, not just the working tree
echo "==> gate: lint the packaged copy"
cd /tmp/pack/microgue-web && ln -sfn /home/claude/Microgue/web/node_modules node_modules
npx eslint src test >/dev/null 2>&1 || { echo "!! PACKAGED copy fails lint"; rm -f "/mnt/user-data/outputs/microgue-web-v$V.tar.gz"; exit 1; }
rm -f node_modules
ls -l "/mnt/user-data/outputs/microgue-web-v$V.tar.gz" | awk '{printf "  packaged %.0f KB, lint-gated\n", $5/1024}'
