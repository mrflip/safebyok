# 2026-10-31: Sprint newvault done -- six threads in one line, three TOP rows for you

Sprint newvault (PR #409, branch `20261031-newvault`, YOLO from 09:20 UTC) fleshed out the vault
models in `packages/safebyok/src/models/` on top of the models PR #408: the gate stored in the
vault record and never null, unlocking by proof and by the kept lease, the lease's autolock and
in-force refusal, the box sealing through the lease, the three gate operations, and two test
threads (the models' units, and the vault's story end to end). Every thread was reviewed, three of
them twice after a rework; nothing significant is left in code except what is yours to rule on.
The plan, progress document, design review, gap review and resolutions are in
`whiteboard/20261031-newvault/`; the sprint doc is https://claude.ai/artifact/9kdLTv64qR3Rei7Do3nj9C.

## The PRs, in merge order (each PR's base is the branch below it; merge the bottom first)

1. #408 models (the base), `20261031-newvault_models` at 4ff14b4b, on main.
2. #410 thread 1 gate_in_record, 7c57356c. Stacked on #408.
3. #412 thread 2 vault_unlock, c740f161. Stacked on #410. Widens `DeviceDB.getLease`/`putLease` to `KeptLeaseRow` (minor changeset).
4. #413 thread 3 box_seal, 5a1dc63a. Stacked on #412.
5. #414 thread 4 gate_ops, a69bdef8. Stacked on #413.
6. #411 thread 5 tests_models, 7a0edfe9 (restacked from main onto #414). Stacked on #414.
7. #415 thread 6 tests_vault_box, 83cacba8. Stacked on #411.
8. #416 notes (`20261031-notes_models`, 34ee3d27): the guarantees note names the models files; a wontfix line for `Lease.forget()`. Stacked on #415.
9. #409 the sprint PR, squashed on top: the whiteboard directory and the `human/` entries only. Merging it merges everything.

## What needs your word (the TOP rows on Open Matters; the rest are recorded YOLO calls with a Rec)

* **What the box's seal is bound to** (#413). The seal binds every sparse field including the
  revision and times, as the old core did; the storable's ouch carry and thread 25's tolerance of a
  normalized `registered_at` now rewrite those without a reseal (pinned). Recommendation: bind only
  what is fixed for the box's life plus the sidecar, and edit VOCABULARY's row; a small follow-up on
  #413 before the next sprint builds on the round trip.
* **The passkey wayin kept on a passphrase change** (#414). Cryptographically nothing is lost;
  the old sweep was policy. With the passphrase now the only proof of a gate change, keeping it
  obliges a host to show the passkey beside revoke. Recommendation: keep it.
* **DeviceDB widened on both sides** (#412) and **`lock()` after `goodbye`** (#413): both built as
  the rows say; accept or strike.

## YOLO decisions (each a row, with where it landed)

* Thread 1 reworked so the gate is never null (your "up to you").
* Thread 2: the lease at birth through the proving `Gate.build` hands back; the DeviceDB put side
  widened; the kept-lease look whenever no lease is held; concurrent unlocks joined; `goodbye` a
  let-go, not a lock; `takeUpLease` refusing another vault's lease or one out of force.
* Thread 3: `lock()` erases the kept lease by scope whether or not it holds one (closes the hole
  `goodbye`'s let-go opened).
* Thread 4: the autolock and damaged path erase once; a gate changed elsewhere between the proof
  and the send refuses `stale_write` (a consistency check let back under your amended rule 6); a
  gate change is proved by the passphrase alone; the passkey wayin is kept on a passphrase change.
* Refusal sentences in `phrases.ts`; `Storable.demandedFull()`; one wayin per proving.

## Still open, gathered (details in the PR comments and the sprint doc's Cleanup)

* Two checkers disagree on a passkey wayin's salt, so one damaged passkey wayin blocks the
  passphrase unlock (#415, loosened pin); a gateless stored record reads `bad_option` where
  `damaged_vault` is true (#415).
* A proof that settles after `lock()`/`goodbye` re-unlocks (no fence; the old core's gap too).
* `Lease.letGo()`, `vault.letLeaseGo()`, `isForgotten` and `takeUpLease` are public; name or hide
  them when the models reach the surface.
* The next sprint's list from your Roadmap Gaps marks is in the plan's *Not threads* and the gap
  review's last table; the size budgets' eight "raise" rows were already over on the base and want
  one `pnpm size:budget --write` on the merged line.
* Your base checkout `20261031-base_planning` (162c9c52) sits on thread 1's pre-rework tip and the
  spec's status markers there need a hand merge with the ones the threads wrote; `stash@{0}` there
  holds the hunks the cleanup commit left out; the local draft branches `20261031-newvault_lease`
  and `20261031-newvault_gate` are superseded by #408 and yours to delete.

What you resolved during the sprint is in `whiteboard/20261031-newvault/newvault-resolutions.md`.
