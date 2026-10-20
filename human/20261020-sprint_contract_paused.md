# Sprint `contract`: paused, 2026-10-20

**Why:** the Coach's weekly usage limit. Every filed thread is pushed. The two running workers were
stopped mid-build. Their work is uncommitted, and it waits in their worktrees.

Sprint doc: https://claude.ai/code/artifact/362ec68d-5bf3-46aa-a379-59a9c8bfb548. Plan and
progress: `whiteboard/20261019-contract/contract-plan.md`, `contract-progress.md`, on branch
`20261019-contract` (sprint PR #192).

## Filed, in one line

Each PR's base is `main`; merging the top merges all.

main → #193 → #194 → #196 → #197 → #198 → #199 → #200 → #195 (phase A) → #201 B1 → #202 B3 →
#204 `a_fixes` → #203 `a_sec` → #205 B2 → #206 `a_sec2` → #207 B4a `slots` → #208 B4 `put_wayin`
→ #209 B5 `placement` (47ab50be). **Phase B is complete.**

## Stopped mid-build (no commits, no PR yet)

* **C1 `putbox_store`.** It is in `/workspace/byok-putbox_store` on `20261020-putbox_store`, cut from
  47ab50be, with 17 files changed, uncommitted. It had just begun the core (`errors.ts`) after the
  adapters. Its handoff is the plan's C1 row, with these overrides: `vault_mismatch` carries no
  vault props; fill `meta.box_stored` with a summary only, unless the full record is needed.
* **`b_fixes`.** It is in `/workspace/byok-b_fixes` on `20261020-b_fixes`, cut from 47ab50be, with 4
  files changed, uncommitted. It holds phase B's passes' fixes: S1 (the strength checker's verdict
  parse leaked the passphrase in `cause`) and S2 (an outrun lease grant outlives `del()`), both
  significant; D1's test (unlock refuses when the lease can't be written); M1; M3; the untested
  `putWayin`/`delWayin` refusals; B5's two leftovers; the security-note fixes. The passes are
  comments on #192, and in the scratchpad's `passB/`.

**Resuming either:** a fresh `thread-worker` with its plan row and the note above. It runs
`git status` first, and keeps or discards what is there. The worktrees and branches are left as
they stand. Once both file, restack them into a line (C1 on `b_fixes`, or the other way round).
Then `lean_core` cuts from the top.

## Waiting on the Coach

*Open Matters* holds about 75 `drafting` rows, each with a Rec. Those that steer what comes next:

* D1: should unlock refuse when the lease can't be kept? Built as refuse, YOLO.
* The key deriver's throw rides as `cause`, while the checker's carries nothing.
* `box_stored`'s contents.
* `props` getters under one rule (explained, back to drafting).
* A forgotten passphrase can't be reset by the passkey.
* A second passkey replaces the first (built as replace, YOLO).
* B5's placement rows.
* About 20 rows of Contract drift for the orchestrator to carry into the Contract tab.

## Next, once resumed

C1 and `b_fixes` finish, are reviewed at high, and file. Then: `lean_core` → C2 beside C7 → C3, C4
→ C5 → C6, then phase C's passes 1, 2 and 5; then phase D. The Contract tab is owed the drift
listed under *Owed to the Contract tab* in `contract-progress.md`.

Say "go" in this session, or hand a fresh one the sprint doc, `contract-plan.md` and
`contract-progress.md`.
