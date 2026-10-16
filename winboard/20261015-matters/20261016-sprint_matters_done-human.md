# 2026-10-16: Sprint matters closed -- 22 threads merged or handed on, eleven questions open

The sprint ran in two parts on the Coach's Open Matters "proceed" rows. Part 2 ran in YOLO mode,
with its two-way calls listed in `winboard/20261015-matters/matters-plan.md` (*Decisions taken
in YOLO*). Everything ready merged to main as of `5428b3b`.

## What landed

* **Restack and small fixes:** #96 (release age), #97 (HKDF info), #98 (passkey button), #99
  (small sweep, size rule).
* **Contract and storage:**
  * #105 (rotation design);
  * #106 (`identity_revoked`);
  * #107 (VAULTDB.md contract);
  * #108 (damaged bundle);
  * #109 (IndexedDB fixes);
  * #110 (late unlock);
  * #113 (Postgres soft cap);
  * #114 (battery audit);
  * #115 (`eraseDamagedVault`).
* **Today's line:**
  * #118: CI flakes, including a dialog race in `VaultProvider`.
  * #111: Convex's tests stay in the package; `safebyok-convex/testing`; `e2e/` runs the React half.
  * #119: every contract race run every way, across two devices.
  * #120: rotation's stored fields, and the rollback check with two epochs.

## Handed on

* **Threads 18 to 20** (the rest of rotation) and **thread 5's remainder** (test trims, a helpers
  sweep): the Coach launches them as new sprints. The plan is the sprint doc's *Big Feats Next*
  tab.
* **Thread 17** (the server-side label grammar note in TODO) is unblocked since #101 merged. It
  isn't in those sprints; say if you want it.

## Waiting for the Coach

There are eleven rows in the doc's *Open Matters* tab, each with a recommendation:

* the fastkey rename;
* "may be newer" as its own error kind;
* the demo's erase wording;
* `'stay'`;
* camelCase race-check names;
* Convex's React-only coverage;
* a stale dialog over the next vault;
* a throwing `onChange` at Postgres's watch start;
* the branch sweep and the leftovers;
* a way out of `rolled_back`;
* a failed mark write after a change landed.

## Worth knowing

* **The sweep unregistered live worktrees.** At about 05:00Z a sweep run in the main checkout
  dropped the git registrations of four live worktrees. It left their files, so git stopped
  working in them. The work was recovered into fresh worktrees and nothing was lost. Directories
  left behind, which aren't git worktrees any more:
  * `/workspace/byok-matters`;
  * `/workspace/byok-race_helper`;
  * `/workspace/byok-rotation_shape`;
  * `/workspace/byok-matters_restack`, which `git worktree remove` couldn't empty.
* **git rerere is shared by every worktree.** It replayed a stale conflict resolution once; the
  worker caught and repaired it.
