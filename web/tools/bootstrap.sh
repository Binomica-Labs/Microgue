#!/bin/bash
# Restore a working tree from scratch, in one command.
#
# This replaces "extract the last tarball", which was the restore route until
# a container reset left the tree TEN VERSIONS STALE without anything saying
# so: the newest tarball in the sandbox is only the newest one THIS session
# produced, and the repo had moved on. A clone cannot be stale.
#
#   bash tools/bootstrap.sh          # clone fresh into /home/claude/Microgue
#
set -euo pipefail
REPO="https://github.com/Binomica-Labs/Microgue.git"
DEST="${1:-/home/claude/Microgue}"
if [ -d "$DEST/.git" ]; then
  echo "==> pulling into $DEST"
  git -C "$DEST" pull --ff-only
else
  echo "==> cloning into $DEST"
  rm -rf "$DEST"
  git clone --depth 1 "$REPO" "$DEST"
fi
cd "$DEST/web"
echo "==> npm ci"
npm ci >/dev/null 2>&1
echo "==> verifying"
npx tsc --noEmit
npx eslint src test
echo "==> v$(python3 -c "import json;print(json.load(open('package.json'))['version'])") ready, $(ls src/*.ts | wc -l) modules"
