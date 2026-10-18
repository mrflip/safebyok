# Thread 13: file-thread and .DS_Store (2026-10-18)

Branch `20261018-dsstore_filing`, cut from origin/main (not stacked). Justify: green (root 262 tests,
`tests/scripts/file-thread.test.ts` 11).

* **Built**: `scripts/file-thread` now finishes the job when `git worktree remove` fails
  ("Directory not empty", worktree unregistered, directory left). A new `finish_removal` runs only
  after the push, and only if (1) `git status --porcelain` was empty just before the removal
  (taken after `clear-ds-store.sh`, while `.git` still existed), (2) `refs/remotes/origin/<branch>`
  equals the local tip, and (3) every file left in the directory is in the tip's tree, a
  `.DS_Store`, the `.git` stub, under `node_modules`, or ignored by the main checkout's rules
  (`git check-ignore --no-index`). Then it tries `rm -rf` four times (pause
  `FILE_THREAD_RETRY_PAUSE`, default 1 s) and runs `git worktree prune`. Any check failing exits 1
  with the reason, naming up to ten stray files, and leaves the directory. The success line adds
  ", after its removal needed finishing by hand". Tests stub `git worktree remove`, `git push` and
  `rm` through a PATH-first stubs dir: the happy path (with a first `rm` that fails), a stray file,
  a dirty worktree, origin not at the tip. `notes/housekeeping.md` documents it. Empty changeset.
* **Decisions taken**: the "nothing tracked or untracked-unignored remains" check is made as a
  clean `status` before the removal plus a file-by-file comparison afterwards, since after the
  failure there is no `.git` to ask. "Origin equals the tip" reads the tracking ref the push
  just updated rather than a second network call (no credentials needed). `clear-ds-store.sh`
  is reused as before, before the removal; it cannot serve the fallback, which runs after the
  worktree has become unregistered (it needs a git worktree to run in).
* **Deviations**: none.
* **Discoveries**: the pre-existing first-line rm of the `mktemp` log meant a PATH stub for `rm`
  must match only the worktree's path, or it kills the script under `set -e`.
* **For the Coach**: the field failure could not be reproduced on Linux; the tests simulate it
  by recreating the leftover after a real removal. Worth watching the next sprint's filings for
  the new success line.
