**Resumed 2026-11-01:** the Coach ruled on 5b's two gaps (won't fix, with a test; undefined, with a TODO) and allowed force-push with a lease; the line is on GitHub. What follows is where it stood when it paused.

# Sprint v6bank: paused (2026-11-01)

The sprint is paused, by the sprint skill's rule: a thread's second review left significant
findings, which are the Coach's, and every remaining thread stands on that thread. Sprint doc:
https://claude.ai/artifact/J2B7dBt2L3GcMSSEc8MEMp (Open Matters, Progress, Cleanup). Plan and
progress: `whiteboard/20261031-v6bank/` on the sprint PR, #425.

## Where things stand

**Filed and reviewed (14 threads; PRs out of draft unless noted):**
1 names_and_refusals #426 · 2 deriver_and_strength #427 (still draft: `gh pr ready` refused) ·
9 whispers_and_names #428 · 6 store_fronting #429 · 3a gating #430 · 3b gating_passkey #431 ·
3c gating_telling #433 · 3d gating_concurrency #435 · 4a bank #432 · 4b bank_eviction #434 ·
7a vault_snapshot #436 · 5a devicedb #437 · S seams #439 · 13 vault_boxes #440 (added by the Coach; on S).

**The line is restacked locally, not pushed.** The harness refuses force-push this session, so the
restack was built non-destructively on local branches `v6line/<label>` in `/workspace/byok-v6line`:
main → #426 → #427 → #428 → #429 → #430 → #431 → #433 → #435 → #432 → #434 → #436 → #437, then
S (`20261101-seams`, pushed as a new branch, #439) on top. `pnpm justify` is green at S's tip
(735e5146). The GitHub branches `20261101-*` still hold the pre-restack commits; the progress
document's *The restack* table lists each `v6line/` tip and the remote SHA it replaces. To land the
line: push each `v6line/<label>` over `20261101-<label>` with `--force-with-lease=<branch>:<old sha>`,
and rewrite each PR's first line to "Stacked on #N, in the line main → …". Every PR's base stays main.

**Waiting on the Coach:**
* **Thread 5b lease_plumbing (#438), unfiled** in `/workspace/byok-lease_plumbing` at 9602d12b
  (pushed). Its first review flagged a reopen-after-close G4 hole; the rework (one lease mutex per
  scope) fixed it; the second review flagged two more G4 gaps (a close before `ensure` begins is
  lost; the scope mutex does not reach across banks sharing a deviceDB). No third review by rule:
  the Coach's ruling (Open Matters, TOP rows). 5b is not yet on the restacked line; it joins on
  top of `v6line/devicedb`, under S, or S is rebased onto it.
* **Force-push permission**, to land the restacked line (Open Matters, TOP).
* **Ruled 2026-11-01 (chat):** offline unlock kept; the rollback guard held from 7b (no counter); thread 13 added; `declined` kept; key rotation recorded in `notes/security.md`, out of scope.
* **Not started:** 7b vault_guards, 8 vault_deletion, 10 pester, 12 damaged_wayins, 11 v06_entry.
  7b stands on 5b's close and lease work (sign-out → `closeVaults`, the rollback guard on the
  device record), and the rest stand on 7b.

## YOLO decisions

Every YOLO call is a row in the doc's Open Matters ("Rec, taken in YOLO"), with where it landed;
the plan's glosses carry them as *Orchestrator:* lines. The largest: threads 3, 4, 5 and 7 split
(3a–3d, 4a–4b, 5a–5b, 7a–7b) to fit one context each; thread S added for the restack's seams; 5a's
latent epoch-key finding filed and carried to 7b; 4b's G4 birth-lease finding carried to 5b; the
restack built on local branches rather than wait for force-push.

## Open questions, gathered

All in the doc's Open Matters tab; the ones that block or change a contract start with **TOP**:
force-push; 5b's two G4 gaps. Cleanup lists what the sprint owes before it closes.
