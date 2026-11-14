# Thread: lease_fold (2026-11-05)

Branch `20261105-lease_fold`, PR #494 (draft), on main at `eb7a4447`: #491 and #492 merged before the first push, so it is not stacked. Justify: exit 0 at this tip, every package; `safebyok` 60 files, 1773 passed, across the tree 7640 passed, 113 skipped, size budget within limits.

* **Built**:
  * `LOCKED`, `LockedBag`, `IsListing`, `isListing` in `helpers/consts.ts`.
  * `#vacateLease` erases by `held?.tryVacate() ?? Lease.tryUncache(friend)`; `#dropLease` is gone.
  * `vault.replacePassphrasePrompt`, `addPasskeyPrompt`, `revokePasskeyPrompt`, `delVaultPrompt`, with try forms.
  * `RunForGatingkind` in `gating.ts`, beside `ProveForGatingkind`; `#runBirth`, `#runReplacePassphrase`, `#runAddPasskey`, `#runDelVault` and the inline revoke and unlock runs are gone from `Vault`. `Vault.#gatingFriend` gives a run `#unlockByProof` and `#landGate`, which stay in `Vault`.
  * Five named provings types in `shapes-gateish.ts`, `ProvingsForGatingkind` the thin index.
  * `Bank.tellBadNews`, reached by `world.tellBadNews` from every listing; `Vault.tellBadNews` passes a box's on. `listing.tellBadNews` and the listings' `onBadNews` option are gone.

* **Decisions taken**:
  * **Gating, not Gate, holds the runs.** `Gate` is a read-only view of one record's wayins, with no listing and no provings. The gating has the listing, makes the provings, and already has the parallel table.
  * **A friend, not public vault verbs.** G9 says no public `Vault` method takes a proving, and the runs need two private verbs. Set aside: public `vault.landGate`, which breaks G9; keeping a `run` closure per entrypoint, which is the feature jealousy again.
  * **Five types.** `revoke_passkey` and `del_vault` share `AnteProvings`, and `PasskeyAddProvings` is `AnteProvings` plus one. The index stays because `Run<KindT>` and `Prove<KindT>` look up by kind.
  * **`Vault` offers `tellBadNews`, as it must**: it is `BoxListing`'s world. One line; the bad-news decisions are all the bank's. `tellIfRevoked` stays on `Listing`, as it is a filter, not a route.
  * **`#attachLease` not folded.** What is left is a guard, the slot, one verb already on `Lease`, and `settle`: all Vault's. Reversing 6ea4ae2cc needs friend verbs that can install a lease, a stronger capability.
  * **`#renewLease` not folded.** `lease.renew(proved, epoch, attach)` hands the lease's `#friend` to an argument, a public `Lease` verb handing the friend out (G9), and `friend.tryPeekLease` answers the raw record. A `Promise<Lease | null>` adds ticks between the `isForgotten` check and the slot, opening a crossing that is not there now. Its check is one getter and one verb already on `Lease`, so a wrapper adds code.
  * **Instance `lease.vacate()` stays.** A static `Lease.vacate(held, friend)` was tried and set aside: `tests/loosened/lease.test.ts` pins the instance's second vacate erasing nothing, by the Coach's wontfix (`notes/wontfix.md`). The static `uncache` covers a row with no lease held.

* **Deviations**:
  * Not stacked on #492, as the handoff expected: it merged first.
  * `#runBirth`'s `Vault.launchBirth` guards stay at the entrypoint, and `prior` is read at launch as before, so `LaunchArgs` carries it.
  * `parse` of the next wayin record now runs before `landGate` rather than inside its commit closure: the same tick, nothing awaited between.
  * `notes/guarantees.md`, `VOCABULARY.md` and `notes/security.md` (the last by a subagent, unread by this thread) follow the names that moved.

* **Discoveries**:
  * The ordering check: a scratch vitest file, not committed, logs each vaultDB, deviceDB, listing, proving and lease call and answer, with the microtask ticks since the last event and the lock state, over 19 scenarios (each gate change, lock crossings at the commit's start and landing and at the renewal's lease, a stale commit, a birth that loses to another tok, `identity_revoked`, a refused cache, a refused erase), on `eb7a4447` and on this branch. 227 events, identical but for one: `evict` is now called with the slot already null where it was called just before, in the same tick, from the erase's fold, which only the trace's own hook can see.
  * The trace's gaps are marked `far` across WebCrypto, where ticks do not count; order is still compared there.

* **For the Coach**:
  * Item 2 is a partial fold, by the two reasons above. A `LeaseHold`-style slot class in `lease.ts` could take all four, but it is new machinery, so it is not built.
  * Provings in the new public `Gating.launch` args: a caller passing its own friend hears provings, the same reach a `run` had. Not wider, not narrower.
