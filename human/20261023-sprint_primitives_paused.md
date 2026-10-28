# Sprint primitives: paused, 2026-10-23 04:45 UTC

*Orchestrator*, at the Coach's request ("would you pause in 150 minutes, and prioritize core library stuff over react stuff"). I paused about an hour early: the core line was complete, and starting React would only spend usage before the pause stopped it.

## Where it stands

**Merged by the Coach:** #243, #244, #246, #251, and #256 (which carried #253 and #254 in with it).

**The line, waiting to merge.** Every PR's base is `main`; merging the top merges them all. Each one is filed, reviewed, and green.

| PR | Thread | Review |
|---|---|---|
| [#258](https://github.com/mrflip/safebyok/pull/258) | 7 bank | fixed |
| [#259](https://github.com/mrflip/safebyok/pull/259) | 7b bank_provider | flagged, then fixed |
| [#260](https://github.com/mrflip/safebyok/pull/260) | 8 proving_gate | fixed |
| [#261](https://github.com/mrflip/safebyok/pull/261) | 9 gating | flagged, then flagged; the rest went to 9b |
| [#262](https://github.com/mrflip/safebyok/pull/262) | 9b gating_followups (the Coach's rulings, and the line review's fixes) | fixed |
| [#264](https://github.com/mrflip/safebyok/pull/264) | 9c core_cleanups (no cleartext hook's throw is kept) | fixed |
| [#263](https://github.com/mrflip/safebyok/pull/263) | 11 docs, the core half, plus a follow-up | fixed |

**Beside the line:**
- [#252](https://github.com/mrflip/safebyok/pull/252) (12 route_meta) sits on `main`.
- The sprint PR [#248](https://github.com/mrflip/safebyok/pull/248), documents only, joins the line last, on top.

No worktree holds unfiled work, and no agent is running.

**Does the redesign work?** An opus review of the whole core line at #261's tip says yes, with gaps (`whiteboard/20261022-primitives/core-line-review.md`). All ten audit risks hold on every path it traced, and the control flow is straight-line primitives, with nothing retrying or re-reading inside one. Its S and U gaps were fixed in #262 and #264. What's left needs the Coach's word: the rows below.

## Waiting on the Coach

The sprint doc's *Open Matters* tab (https://claude.ai/artifact/XJsqP4CTaVdfwKMBGS1sQ4). These change what gets built:
- **9c went past "Leave it, we will audit these"** (the key deriver's `cause`). Keep it, or undo it with one hand commit.
- **The line review's three design rows:**
  - another tab's unlock briefly locks this one (U3);
  - a tab holding the newer copy never reports a rollback, because of audit 6's order (U6);
  - simplify the sent-deletion bookkeeping (M1).
- **The Contract tabs:** retire the old *Contract* tab, and rename *Contract, primitives* to *Contract*.
- **Stores:** a store check on `clearCachedVault` and `delDamagedVault`.
- **Lint cache:** `pnpm justify` without it. It hid red branches twice this sprint; that would be its own process PR.
- **The rest:** many smaller `drafting` rows with Recs, from threads 7–11.

## What comes next

1. **Thread 10, react,** stacked on #263. The plan's thread 10 gloss carries everything the core left it:
   - per-kind dialogs;
   - the correctable kinds shown in place;
   - joins as 9b built them;
   - `declinedError` worded by kind;
   - `checkPassphrase` retired;
   - the demo's tests;
   - safebyok-react's README (its *React reports it to you* line is stale).
2. **The rows the Coach rules on,** as threads.
3. **Wrap-up** (the sprint skill's `wrapup.md`):
   - restack #252 into the line;
   - sweep *Resolved* into `primitives-resolutions.md`;
   - this note's done twin;
   - squash the sprint PR.
