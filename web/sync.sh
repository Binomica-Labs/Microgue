#!/data/data/com.termux/files/usr/bin/bash
# sync.sh -- pull the newest Microgue tarball out of Downloads and ship it.
#
#   ~/sync.sh "commit message"
#
# Finds the most recent microgue-web*.tar.gz by mtime, so Chrome's -1/-2/-3
# suffixes stop mattering. Verifies the extract before touching the repo, and
# refuses to commit if nothing actually changed.
set -euo pipefail

REPO="${MICROGUE_REPO:-$HOME/Microgue}"
DL="$HOME/storage/downloads"
MSG="${1:-Update from Claude}"

newest=$(ls -t "$DL"/microgue-web*.tar.gz 2>/dev/null | head -1 || true)
[ -n "$newest" ] || { echo "no microgue-web*.tar.gz in $DL"; exit 1; }
echo "==> $(basename "$newest")  ($(date -r "$newest" '+%H:%M'))"

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
tar xzf "$newest" -C "$tmp"
src="$tmp/microgue-web"
[ -f "$src/src/main.ts" ] || { echo "archive looks wrong: no src/main.ts"; exit 1; }

# Mirror the whole extract, not a hand-listed subset. The previous version
# copied src/ but not test/, which let the repo hold new source against stale
# tests -- CI caught it, but only after a push.
cp -r "$src/." "$REPO/web/"

# HANDOVER lives at the repo root: it covers the Lua tree as well as web/.
if [ -f "$REPO/web/HANDOVER.md" ]; then
  mv "$REPO/web/HANDOVER.md" "$REPO/HANDOVER.md"
fi

cd "$REPO"
if [ -z "$(git status --porcelain)" ]; then
  echo "==> already up to date, nothing to push"
  exit 0
fi
git status --short
git add -A
git commit -q -m "$MSG"
git push -q
echo "==> pushed $(git rev-parse --short HEAD)"
command -v gh >/dev/null && gh run watch --exit-status 2>/dev/null || true
# Self-update. This script lives outside the repo, so it cannot be refreshed by
# its own copy step -- which is exactly how a stale sync.sh shipped new source
# against old tests and broke CI twice.
self="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
if [ -f "$src/sync.sh" ] && ! cmp -s "$src/sync.sh" "$self"; then
  cp "$src/sync.sh" "$self" && chmod +x "$self"
  echo "==> sync.sh updated itself; the next run uses the new version"
fi

echo "==> done. force-close the app and reopen."
