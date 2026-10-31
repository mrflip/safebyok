#!/usr/bin/env bash
# Finishes thread 28 (PR #354, branch 20261028-helpers_range): the re-lock that waits on the clock.
# convex-helpers 0.1.129 (published 2026-10-21T23:13:40Z) passes pnpm's seven-day minimumReleaseAge at
# 2026-10-28T23:13:40Z, and pnpm refuses it from the lockfile until then. Run this after
# 2026-10-28T23:14:00Z: it re-locks, checks the lockfile and a frozen install, commits
# pnpm-lock.yaml alone, runs scripts/file-thread, and on success takes PR #354 out of draft.
set -euo pipefail

root=/workspace/byok-helpers_range
earliest=2026-10-28T23:14:00Z
now=$(date -u +%s)
if (( now < $(date -u -d "$earliest" +%s) )); then
  echo "too early: pnpm still refuses convex-helpers@0.1.129; run this after $earliest (now $(date -u +%FT%TZ))" >&2
  exit 1
fi

cd "$root"
pnpm install
grep -qE '^\s+convex-helpers@0\.1\.129' pnpm-lock.yaml \
  || { echo "pnpm-lock.yaml does not resolve convex-helpers to 0.1.129" >&2; exit 1; }
pnpm install --frozen-lockfile

git add pnpm-lock.yaml
git commit -m "tools: the lockfile follows the convex-helpers ranges now that 0.1.129 has passed seven days

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"

/workspace/byok/scripts/file-thread "$root"
gh pr ready 354
