# Thread S1: filer_stack (2026-11-12)

Branch `20261112-filer_stack`, PR #664, not stacked. Justify: green (tests/scripts 281; safebyok 3129; all packages and e2e pass).

* **Built**: `scripts/cut-thread` records a base given as a branch (local, or `origin/...`; never
  main) as `branch.<branch>.sprintbasebranch`. `scripts/file-thread` catches a stacked branch up with
  `git rebase --onto`, always `--no-update-refs`: onto `origin/main` when origin's copy of the
  base branch has merged into it, else onto `origin/<basebranch>` when that copy is not behind
  (an ancestor of) the recorded sprintbase; it records the new sprintbase. A branch cut from
  main takes its old path, unchanged; so does one with no recorded base branch. Conflict: abort, exit 3,
  naming the base it conflicted with. Tests in `tests/scripts/{cut,file}-thread.test.ts`: base gained
  commits, base rebased onto main, base rebased then merged, base merged as cut, base unmoved
  (and no other branch moves), conflict with the base. Headers of both scripts, PROCESS.md *A worktree
  per thread*, `.claude/skills/sprint/SKILL.md` §1 stacked-cut bullet and §2 *File* paragraph.
* **Decisions taken**: bash in the scripts (file-thread does not delegate to `filer.ts`). "Merged"
  means origin's copy of the base branch is reachable from origin/main (this repo merges with merge
  commits, keeping SHAs); a squash-merge is not detected. Origin's copy being absent or behind
  sprintbase files as cut, rather than rebasing commits away.
* **Deviations**: SKILL.md says a stacked thread may be cut once its base is *ready* (§1 bullet and the
  "Once a thread files" sentence in §2), as the handoff says is now practice; one sentence beyond the two asked.
  PROCESS.md gained a clause naming the new config key.
* **Discoveries**: the existing tests' local `isolatedEnv` spreads `process.env`, as the older
  copies do; I did not change it.
