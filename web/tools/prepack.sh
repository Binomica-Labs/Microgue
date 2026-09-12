#!/bin/bash
# The pre-package gate. Run from web/. Exits non-zero if ANY step fails.
#
# This exists because a shell pipe like `npm run lint | tail -1; echo $?`
# reports tail's exit code -- always 0 -- and "final lint: 0" was printed for
# several versions while lint was actually failing. CI caught it twice. A
# gate that cannot lie: each step's own exit status, no pipe in the way.
set -u
cd "$(dirname "$0")/.." || exit 1
fail=0
step() {
  local name="$1"; shift
  if "$@" >/tmp/prepack.log 2>&1; then
    printf '  %-8s ok\n' "$name"
  else
    printf '  %-8s FAIL\n' "$name"; tail -5 /tmp/prepack.log | sed 's/^/           /'; fail=1
  fi
}
step guard npm run guard --silent
step tsc   npx tsc --noEmit
step lint  npx eslint src test
step test  npx vitest run --reporter=dot
if [ "$fail" = 1 ]; then echo "PREPACK FAILED -- do not package"; exit 1; fi
echo "PREPACK CLEAN"
