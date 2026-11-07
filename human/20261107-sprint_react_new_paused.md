# Sprint react_new: paused for a restack

**Resumed 2026-11-07**: the Coach merged #573 to #578 (no restack was needed; #579 already stood on them). See the plan's status line.

Paused 2026-11-07. Every remaining thread waits on one restack, which the `/restacker` skill
won't run for an agent: the base checkout's copy still sets `disable-model-invocation`, though
main dropped it in #536.

## What the Coach does to resume

Run `/restacker 573 574 576 577 575 578`, the line `main → #573 → #574 → #576 → #577 → #575 → #578`.
It also brings the line onto today's main, `de4943bd6`, where the devicedb_idb line merged. Then
say "go" in this session, or start a fresh one with `/sprint` and the sprint directory.

## Filed (every PR's base is main; reviews posted as PR comments)

| Thread | PR | Stands on | Review |
|---|---|---|---|
| 1 core_for_react | #573 | main (495cc5d6e) | low, fixed |
| 2 react_port | #574 | #573 | medium, fixed (6) |
| 4 react_boxes | #576 | #574 | high, fixed |
| 3 react_dialogs | #577 | #574 | medium, fixed |
| 12 provider_handlers | #575 | #574 | medium, fixed |
| 11 react_passkeys | #578 | #577 | high, fixed |
| 9 browser_batteries | #579 | main (de4943bd6) | medium, fixed |

No thread waits in a worktree: each was filed and its worktree removed. The sprint worktree,
`../byok-react_new`, holds the sprint PR #572 (draft).

## Waiting

* **5 demo_fields** (the demo on the new core, flow 3) and **13 react_tidy** (passkey argument
  checks, focus after a dismissed prompt, `passkeyRpId` forwarding, VOCABULARY line 22): cut from
  #578's tip once the restack lands.
* **6 demo_exposed** and **7 demo_sealed** (flows 2 and 1) follow 5, with **8 dev_inspectors** beside
  them.
* **10 demo_browser** (the demo onto `browserOpts`, `DevDeviceDBInspector`) comes last, on 7, 8, 9
  and 13 restacked.

## YOLO calls made

Each is a row in the sprint doc's Open Matters
(https://claude.ai/artifact/UN5fpxiLeEaLHjpFgBiHg9):

* the demo parked during thread 2 (ruled: keep);
* a stand-in strength checker and an in-memory device store in the demo until thread 10;
* thread 3 split into 3 and 11;
* thread 12 created from thread 2's review;
* thread 11 cut from thread 3 alone while the restack waits, its two thread-4 ride-alongs moved to
  thread 5;
* thread 13 created from thread 11's review;
* `browserOpts` supplies no `device_id`.

## Open questions

All in the doc's Open Matters, one row each. The TOP row is the restack above.
