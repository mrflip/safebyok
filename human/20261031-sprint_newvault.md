# 2026-10-31: Sprint newvault -- running; YOLO from 09:20 UTC

The orchestrator's entry for sprint newvault (PR #409, branch `20261031-newvault`). The plan,
progress document, design review and gap review are in `whiteboard/20261031-newvault/`; the
sprint doc is https://claude.ai/artifact/9kdLTv64qR3Rei7Do3nj9C.

## Where it stands

* Models PR #408 at 4ff14b4b (the base).
* Thread 1 gate_in_record: filed, #410 at 7c57356c, stacked on #408. Reviewed twice (high), both fixed, nothing significant left.
* Thread 5 tests_models: filed, #411 at c9d12890, cut from main. Its tests change at the restack (`thread-1-restack-notes.md` on thread 1's branch, plus the describe titles the second review named).
* Thread 2 vault_unlock: filed, #412 at c740f161, stacked on #410. Reworked after its first review and reviewed again; one significant finding left (after `goodbye`'s let-go, `lock()` cannot erase the kept lease), carried to thread 3 as its first directive and a TOP row.
* Thread 3 box_seal: filed, #413 at 5a1dc63a, stacked on #412. Its open design question is yours: the seal binds every sparse field including the revision and times (as the old core did), and the storable's ouch carry and thread 25's normalized `registered_at` tolerance now rewrite those without a reseal; options and the recommendation (bind only what is fixed for the box's life, plus the sidecar) are the TOP row on Open Matters. The review's other significant finding, a harmless double erase in `lease.ts`, is thread 4's first directive.
* Thread 4 gate_ops: built and reviewed (high, fixed, two significant left), #414 at f198afcf, stacked on #413; a rework is running, then a second review. My YOLO calls there: a gate changed elsewhere between the proof and the send refuses `stale_write` rather than overwriting (a consistency check, let back under your amended rule 6 because a revocation silently undone is a real hazard; strike it if you disagree); a gate change is proved by the passphrase alone, as the old README had it (the conservative default; loosen by ruling). The passkey wayin stays kept on a passphrase change (the vaultKey is unchanged), which is your TOP row with the reviewer's security paragraph; the ops leave lock state alone; `bad_option`/`absent_wayin` for the two refusals.
* Thread 6 waits on 4 and 5.

## Judgment calls made in YOLO (each also on the sprint doc's Cleanup tab or in Resolved)

* **The gate is never null** (your "up to you"): thread 1 was reworked after its review so `VaultListing.build` builds the gate from the draft's stamp before the record is born; `vaultRecord.gate` is required, `buildGate` and the two guards are gone, `Proving`/`Gate` bind a `VaultStamp`, `makeLease(vault, dbfriend, opts)` takes the vault at the grant.
* **The lease at birth** is granted by `VaultListing.build` after holding the vault, through the proving `Gate.build` hands back (thread 2), since inside `Gate.build` no vault exists.
* **Overlapping `build(dna, …)` calls** on one scope both run their closures: left, a per-scope in-flight guard being the kind of check this sprint keeps out.
* **`Vault.#demandedFull()`** is hoisted into `Storable` by thread 2 (name its call).
* **Refusal sentences** move into `phrases.ts` in thread 2, per your ruling; the factories stay.
* **Thread 2's rework** (the review's four significant findings, all two-way): the current `DeviceDB` widened on the put side too (`KeptLeaseRow`), so the real class types as the world's deviceDB; the kept-lease look runs whenever no lease is held rather than once per vault object, so another tab's lease is taken up; `ensureUnlocked` joins an unlock in flight and a displaced lease is let go without an erase; `goodbye` lets go rather than locks, leaving the kept lease for the next load (erasing is `lock()`'s and later the Bank's sign-out); `takeUpLease` refuses another vault's lease and one not in force. The worker's other calls stand: no closure handed and no kept lease refuses `vault_locked`; one proof per attempt, no fall-through; one wayin per proving.

## What you may want to look at

* The second review's comment on #410 (minor items 1 to 8), none acted on beyond thread 2's handoff.
* Your base checkout `20261031-base_planning` (162c9c52) sits on thread 1's pre-rework tip; it needs a rebase onto 7c57356c when you next pick it up. `stash@{0}` there still holds the hunks the cleanup commit left out.
