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

# Self-update. This script lives outside the repo, so it cannot be refreshed by
# its own copy step -- which is exactly how a stale sync.sh shipped new source
# against old tests and broke CI twice.
#
# It MUST be an atomic rename, never a copy over the file in place. bash reads
# a script incrementally by byte offset: overwrite the file it is executing and
# it resumes mid-line in the new contents, running fragments of comments as
# commands. A rename swaps the directory entry and leaves the running shell on
# the original inode, so it finishes the version it started.
self="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
if [ -f "$src/sync.sh" ] && ! cmp -s "$src/sync.sh" "$self"; then
  if cp "$src/sync.sh" "$self.new" && chmod +x "$self.new" \
     && mv -f "$self.new" "$self"; then
    echo "==> sync.sh updated itself; the next run uses the new version"
  else
    rm -f "$self.new"
    echo "==> could not update sync.sh (continuing with this one)"
  fi
fi


# Watch the run this push actually started.
#
# `gh run watch` with no argument opens a picker, which needs a keystroke and
# can list a run from an earlier push. Resolving the id from the commit SHA
# picks the right one every time and needs nothing from you. The run does not
# exist the instant the push returns, so poll briefly for it.
if command -v gh >/dev/null 2>&1; then
  sha="$(git rev-parse HEAD)"
  run=""
  i=0
  while [ $i -lt 20 ]; do
    run="$(gh run list --commit "$sha" --limit 1 \
             --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)"
    [ -n "$run" ] && break
    i=$((i + 1))
    printf '\r==> waiting for the run to appear (%ss)' "$i"
    sleep 1
  done
  if [ $i -gt 0 ]; then printf '\r\033[K'; fi

  if [ -z "$run" ]; then
    echo "==> no workflow run found for $(git rev-parse --short HEAD)"
  else
    echo "==> watching run $run"
    if gh run watch "$run" --exit-status --interval 3; then
      echo "==> deploy green"
    else
      echo "==> deploy FAILED. failing step log:"
      gh run view "$run" --log-failed 2>/dev/null | tail -40
      echo "==> (sync.sh already updated itself, so a fix can be pushed)"
      exit 1
    fi
  fi
fi

echo "==> done. the app updates itself on next resume."
