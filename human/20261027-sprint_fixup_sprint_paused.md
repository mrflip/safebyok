# Fixup sprint paused, 2026-10-27: waiting on one ruling

The sprint is paused because every remaining thread waits on a ruling on thread 1.

* **Sprint doc:** https://claude.ai/artifact/Qvwd1KJxaAJKZtMtgaMNBg
* **Plan:** `whiteboard/20261027-fixup_sprint/fixup_sprint-plan.md`, on the sprint PR
  [#295](https://github.com/mrflip/safebyok/pull/295).

## Where each thread stands

| Thread | State | Where |
|---|---|---|
| 1. `outcome_default` | Built; review **flagged**; unfiled. | [#297](https://github.com/mrflip/safebyok/pull/297), worktree `/workspace/byok-outcome_default`, tip `3bb8aac2`, pushed |
| 2. `vault_params` | Not cut. It stacks on thread 1. | |
| 3. `device_db_class` | **Filed:** rebased onto `origin/main` (`8c9a32f5`), proved, pushed at `954e6290`, worktree removed. | [#298](https://github.com/mrflip/safebyok/pull/298) |
| 4. `retire_standing` | Not cut. It waits for threads 1 to 3, restacked into one line. | |

## What unblocks it

**The TOP row in Open Matters,** on thread 1's review:
* The problem: once `adapterAnswer`'s Outcome check is removed, an adapter that forgets `valOf`
  on `doGetBox` alone makes `putBox` silently overwrite a sound box as damaged, dropping its
  sidecar. The reviewer proved it with a probe.
* The choice:
  - **Keep the check** (recommended, by the ruling that a questioned check stays).
  - **Or** have `putBox` write over only a box the listing shows as damaged.

Once it's ruled:
* Thread 1's worker builds the ruling on #297, and a second reviewer looks at those commits only.
* Thread 1 is then filed, and thread 2 is cut from its tip.

The other Open Matters rows are not blocking. They are on `Refusals.unexpectedError` and on
thread 3's DeviceDB surface: the silent discard, the exports, scopepath hooks, unchecked writes,
`spyOnDeviceHook`, and the overridden-verb guard. The two **For coach** rows are on your local
`20261027-fixup` folder and the documentarian's `stash@{0}`.

## Leftovers

* The reviewer worktree `.claude/worktrees/agent-a90f998889ecffd1a` is locked by its agent's
  process. It holds nothing: its branch was `origin/main` and is deleted. Remove it once the lock
  lifts. It is listed on Cleanup.
* On this machine, worker streams stalled three times, and full lint and test runs are slow. The
  handoffs now say to trim command output and to commit at each milestone.
