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

cd "$REPO"

# Pull BEFORE extracting, not after.
#
# The tarball is a whole tree, and `cp -r` overwrites whatever it lands on. If
# the remote has moved on, extracting a tarball built from the older base
# reverts that work -- and because cp does not delete, any file the newer tree
# added SURVIVES, leaving a mix of two versions that may not even compile.
# This happened: the remote reached v0.92 with three modules the tarball had
# never heard of.
echo "==> pulling"
# Git's own diverged-branch hint is six lines of advice about merge strategies
# and buries the one instruction that matters. Swallow it and say the thing.
if ! git pull --ff-only --quiet origin "$(git rev-parse --abbrev-ref HEAD)" 2>/dev/null; then
  echo "==> PULL FAILED: cannot fast-forward."
  echo "==> the local repo and the remote have BOTH moved on."
  echo "==>"
  echo "==> yours:  $(git log --oneline @{u}..HEAD 2>/dev/null | wc -l | tr -d " ") commit(s) not on the remote"
  git log --oneline @{u}..HEAD 2>/dev/null | sed "s/^/           /"
  echo "==> theirs: $(git log --oneline HEAD..@{u} 2>/dev/null | wc -l | tr -d " ") commit(s) not here"
  git log --oneline HEAD..@{u} 2>/dev/null | sed "s/^/           /"
  echo "==>"
  echo "==> nothing was extracted or pushed. decide which you want before retrying."
  exit 1
fi

# A tarball older than what is already in the repo would revert work. Compare
# the versions and refuse, because this is the mistake that is invisible until
# someone notices a feature has vanished.
# sed, not python3. Termux does not ship python by default, and the failure
# would have been SILENT: both lookups fall back to 0.0.0, compare equal, and
# the regression guard quietly does nothing. A guard that disappears when a
# dependency is missing is worse than no guard, because you think you have one.
ver() { sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$1" | head -1; }
have="$(ver web/package.json)"
want="$(ver "$src/package.json")"
if [ -z "$have" ] || [ -z "$want" ]; then
  echo "==> WARNING: could not read a version from package.json."
  echo "==> the regression guard is NOT active for this run."
  have=""; want=""
fi
if [ -n "$have" ] && [ -n "$want" ] && [ "$have" != "$want" ] && \
   [ "$(printf '%s\n%s\n' "$have" "$want" | sort -V | head -1)" = "$want" ]; then
  echo "==> REFUSING: the archive is v$want but the repo is already at v$have."
  echo "==> extracting it would revert work that is already pushed."
  echo "==> if you really mean it: FORCE=1 ~/sync.sh \"$MSG\""
  [ "${FORCE:-0}" = "1" ] || exit 1
  echo "==> FORCE set; going ahead anyway."
fi

# Files the repo has and the archive does not. cp leaves these in place, so
# they end up mixed with an older tree. Listing them is the divergence alarm --
# they are NOT deleted, because deleting someone else's work automatically is
# how this goes badly wrong in the other direction.
extra="$(comm -23 \
  <(cd "$REPO/web" && find src test -type f -name '*.ts' 2>/dev/null | sort) \
  <(cd "$src" && find src test -type f -name '*.ts' 2>/dev/null | sort))"
if [ -n "$extra" ]; then
  echo "==> WARNING: the repo has files this archive does not:"
  printf '%s\n' "$extra" | sed 's/^/      /'
  echo "==> they are being LEFT IN PLACE. if the archive was built without them,"
  echo "==> the result is two versions mixed together. check it compiles."
fi

# Mirror the whole extract, not a hand-listed subset. The previous version
# copied src/ but not test/, which let the repo hold new source against stale
# tests -- CI caught it, but only after a push.
cp -r "$src/." "$REPO/web/"

# Some files belong at the repo ROOT, not under web/. The archive carries them
# in web/ because that is all it can carry; they are hoisted here. Each one is
# announced, because silently overwriting a root file is exactly the kind of
# thing you want to see in the log when something later goes wrong.
if [ -f "$REPO/web/HANDOVER.md" ]; then
  mv "$REPO/web/HANDOVER.md" "$REPO/HANDOVER.md"
fi
if [ -f "$REPO/web/.gitignore.root" ]; then
  echo "==> hoisting .gitignore to the repo root"
  mv "$REPO/web/.gitignore.root" "$REPO/.gitignore"
fi
if [ -d "$REPO/web/.github" ]; then
  echo "==> hoisting .github/ to the repo root"
  cp -r "$REPO/web/.github/." "$REPO/.github/"
  rm -rf "$REPO/web/.github"
fi

# (already in $REPO; the pull needed to happen before the extract)
# "Nothing to push" has to mean nothing LOCAL and nothing UNPUSHED. Checking
# only the working tree meant a failed push looked identical to being in sync,
# and the commit sat on the phone indefinitely.
unpushed="$(git log @{u}..HEAD --oneline 2>/dev/null || true)"
if [ -z "$(git status --porcelain)" ] && [ -z "$unpushed" ]; then
  echo "==> already up to date, nothing to push"
  exit 0
fi
if [ -n "$unpushed" ]; then
  echo "==> $(printf '%s\n' "$unpushed" | wc -l | tr -d ' ') commit(s) not on the remote:"
  printf '%s\n' "$unpushed" | sed 's/^/    /'
fi
git status --short
# Embedded git repositories become a mode-160000 GITLINK: a submodule pointer
# with no .gitmodules, aimed at a commit that exists only on this machine. The
# push succeeds, and then CI fails in actions/checkout with "git failed with
# exit code 128", which says nothing about the cause. Catch it here instead.
embedded="$(find "$REPO" -mindepth 2 -name .git -not -path "*/node_modules/*" \
              -printf '%h\n' 2>/dev/null | sed "s|^$REPO/||")"
if [ -n "$embedded" ]; then
  echo "==> EMBEDDED GIT REPO(S) inside the tree:"
  printf '%s\n' "$embedded" | sed 's/^/      /'
  echo "==> these become dangling submodule pointers and break CI checkout."
  echo "==> add them to .gitignore, or: git rm --cached <path>"
  echo "==> nothing was committed."
  exit 1
fi

git add -A
# Only commit if there is something to commit: this may be a retry of a push
# that failed earlier, with the commit already made.
if [ -n "$(git status --porcelain)" ]; then
  git commit -q -m "$MSG"
fi

# NOT -q, and the status IS checked. `git push -q` followed by an
# unconditional "pushed" message is how a commit ends up living on the phone
# while the deploy never happens and nothing says so.
if ! git push; then
  echo "==> PUSH FAILED. Nothing was deployed."
  echo "==> fix the remote, then run sync.sh again to retry the same commit."
  exit 1
fi
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
# Never self-update when running from inside a checkout: exercising this script
# against a scratch repo would otherwise copy the packaged sync.sh back over
# the one being edited, silently reverting work in progress. It happened.
if [ -f "$self" ] && [ -f "$(dirname "$self")/package.json" ]; then
  echo "==> running from a source tree; skipping self-update"
elif [ -f "$src/sync.sh" ] && ! cmp -s "$src/sync.sh" "$self"; then
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
# picks the right one every time and needs nothing from you.
#
# The run does not exist the instant the push returns, and it can take much
# longer than a few seconds when another Pages run is still in flight -- the
# workflow uses a concurrency group, so a new run may not be registered until
# the previous one lets go. Twenty seconds of silent polling was not enough,
# and the script then printed the same cheerful "done" as a green deploy.
if command -v gh >/dev/null 2>&1; then
  # Full SHA: `gh run list --commit` will not resolve an abbreviated one.
  sha="$(git rev-parse HEAD)"
  short="$(git rev-parse --short HEAD)"
  run=""
  waited=0
  limit=90
  while [ "$waited" -lt "$limit" ]; do
    run="$(gh run list --commit "$sha" --limit 1 \
             --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)"
    [ -n "$run" ] && break
    waited=$((waited + 2))
    printf '\r==> waiting for a run on %s (%ss of %ss)' "$short" "$waited" "$limit"
    sleep 2
  done
  [ "$waited" -gt 0 ] && printf '\r\033[K'

  # Fall back to the newest run on this branch. If CI is queued behind another
  # deploy the commit lookup can stay empty while a run for this push is
  # genuinely pending; watching the newest is better than watching nothing, and
  # it says plainly that it is a guess.
  if [ -z "$run" ]; then
    # ONE call for both fields. Two calls can land either side of a new run
    # appearing, and then the id and the SHA describe different runs -- which
    # is exactly the mistake this fallback exists to avoid making.
    newest="$(gh run list --branch "$(git rev-parse --abbrev-ref HEAD)" --limit 1 \
                --json databaseId,headSha \
                --jq '.[0] | "\(.databaseId) \(.headSha)"' 2>/dev/null || true)"
    run="${newest%% *}"
    head_sha="${newest##* }"
    if [ -n "$run" ] && [ "$head_sha" = "$sha" ]; then
      echo "==> run for $short registered late; watching $run"
    elif [ -n "$run" ]; then
      echo "==> NO run for $short after ${limit}s."
      echo "==> newest run on this branch is for ${head_sha:0:7}, which is NOT this push."
      echo "==> check: gh run list --limit 5"
      run=""
    fi
  fi

  if [ -z "$run" ]; then
    echo "==> NOT WATCHED: no workflow run appeared for $short in ${limit}s."
    echo "==> the push succeeded; CI may be queued, or the workflow may not"
    echo "==> have triggered at all. check with: gh run list --limit 5"
    echo "==> done pushing, but the deploy is UNVERIFIED."
    exit 2
  fi

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

echo "==> done. the app updates itself on next resume."
