# 2026-10-31: Sprint newvault -- running; YOLO from 09:20 UTC

The orchestrator's entry for sprint newvault (PR #409, branch `20261031-newvault`). The plan,
progress document, design review and gap review are in `whiteboard/20261031-newvault/`; the
sprint doc is https://claude.ai/artifact/9kdLTv64qR3Rei7Do3nj9C.

## Where it stands

* Models PR #408 at 4ff14b4b (the base).
* Thread 1 gate_in_record: filed, #410 at 7c57356c, stacked on #408. Reviewed twice (high), both fixed, nothing significant left.
* Thread 5 tests_models: filed, #411 at c9d12890, cut from main. Its tests change at the restack (`thread-1-restack-notes.md` on thread 1's branch, plus the describe titles the second review named).
* Thread 2 vault_unlock: building (opus), cut from 7c57356c, worktree `/workspace/byok-vault_unlock`.
* Threads 3, 4, 6 wait on 2, 3, and 4+5.

## Judgment calls made in YOLO (each also on the sprint doc's Cleanup tab or in Resolved)

* **The gate is never null** (your "up to you"): thread 1 was reworked after its review so `VaultListing.build` builds the gate from the draft's stamp before the record is born; `vaultRecord.gate` is required, `buildGate` and the two guards are gone, `Proving`/`Gate` bind a `VaultStamp`, `makeLease(vault, dbfriend, opts)` takes the vault at the grant.
* **The lease at birth** is granted by `VaultListing.build` after holding the vault, through the proving `Gate.build` hands back (thread 2), since inside `Gate.build` no vault exists.
* **Overlapping `build(dna, …)` calls** on one scope both run their closures: left, a per-scope in-flight guard being the kind of check this sprint keeps out.
* **`Vault.#demandedFull()`** is hoisted into `Storable` by thread 2 (name its call).
* **Refusal sentences** move into `phrases.ts` in thread 2, per your ruling; the factories stay.

## What you may want to look at

* The second review's comment on #410 (minor items 1 to 8), none acted on beyond thread 2's handoff.
* Your base checkout `20261031-base_planning` (162c9c52) sits on thread 1's pre-rework tip; it needs a rebase onto 7c57356c when you next pick it up. `stash@{0}` there still holds the hunks the cleanup commit left out.
