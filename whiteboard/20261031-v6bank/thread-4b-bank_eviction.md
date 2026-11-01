# Thread 4b: bank_eviction (2026-11-01)

Branch `20261101-bank_eviction`, PR [#434](https://github.com/mrflip/safebyok/pull/434), stacked on
[#432](https://github.com/mrflip/safebyok/pull/432). Justify: green; safebyok 4872 passed, 37
skipped; size budgets unmoved.

* **Built**:
  * `Listing.evict(scope)` (`listing.ts`): unholds the thing and ends the listing's subscription
    to it first, then calls `thing.evict()`, then remakes the snapshot in a `finally`: the
    listeners are told once, and a throwing `evict` still leaves the thing let go. `#hold` now
    keeps each subscription's unsubscribe in `#unsubscribes`.
  * `Storable.evict()` (`storable.ts`): disarms the trigger. `Box.evict()` disarms, then super;
    `Vault.evict()` calls `letLeaseGo()`, then super.
  * `Box.disarm()` (`box.ts`): forgets `#exposed` and settles. `Box.adopt` override forgets
    `#exposed` when the central adopted is a tombstone, or a newer `revision_seq` that is not
    this device's own staged send (`central.revision_tok === staged.revision_tok`). `lock()`
    alone keeps it, as the Coach ruled.
  * `Bank.closeVault(bag)` / `closeVaults()` (`bank.ts`): `lock()` the vault (erasing the kept
    lease), then `vaultListing.evict(scope)`. The GAP comment is gone.
  * `Bank.ensureVault`: a call handing its own cleartexts runs apart (`#ensureVault` directly,
    not recorded in `#ensuring`); only a call that hands none joins one in flight.
  * Vault lock settles what is in flight (`vault.ts`):
    * `#launchGating` hands `Gating.launch` a world whose `requestCleartext` records each gating
      in `#gatings` as the host is handed it (synchronous, before the gating's first await);
      the `finally` prunes the settled ones. `#dropLease` (shared by `lock` and `letLeaseGo`)
      bumps `#lockSeq`, declines every gating in `#gatings`, and clears it.
    * `#unlockAlone` captures `#lockSeq` when the unlock begins and hands it through
      `#unlockByGating` to each `#unlockByProof`. Inside the mutex the proof checks it before
      `makeLease` (grant nothing) and after (evict the lease just put; the lock's erase, queued
      behind on the mutex, removes the record). Either way it throws
      `RefusalFuncs.lockedWhileUnlocking()` ('vault_locked', new phrase
      `LockedWhileUnlocking`), which is not correctable, so the gating settles.
    * `#lookUpCached` captures `#lockSeq` and declines a cached lease found after a lock.
    * `#leaseChores` (a hand-rolled promise chain) is replaced by es-toolkit's `Mutex` in
      `#withLeaseDB`: the lease's put, its look-up and its erase run in FIFO order.
  * Tests: `tests/models/listing.test.ts` (*Eviction*), `box.test.ts` (*Disarm*), new
    `vault-lock.test.ts`, new `bank-close.test.ts` (with a vaultDB keyed by vaultlabel, since the
    vault world's fake store holds one record in all).
* **Decisions taken**:
  * The gating is captured by wrapping `requestCleartext`, not by a hook in `gating.ts`, which
    is untouched (the handoff: no reshape). Set aside: a `Gating.onLaunch` callback or returning
    the gating from `launch` -- both reshape the gating's surface.
  * The lock sequence is taken when the unlock begins, not when an attempt runs: a gating's
    attempt runs a microtask after it is handed in, so a lock landing just after the user
    submits would otherwise be missed and the vault unlock behind it. A test pins this.
  * A lock during the cached-lease look-up declines the lease found and goes on to ask the user
    (the call asked to unlock); it does not refuse.
  * Box disarm keys on `revision_seq` and the staged `revision_tok`, not on the vault's lock.
* **Deviations**:
  * Vault eviction cannot tell its boxes to disarm: no vault holds a `BoxListing` yet.
    `Box.disarm()` and `Box.evict()` exist for the thread that gives the vault its `BoxListing` (the plan names none: see
    *For the Coach*); no GAP comment was left in code.
  * A gating declined by a lock refuses with `gatingDeclined`'s phrase ("The prompt was
    declined, or closed..."), not a lock's own; thread 3c is reshaping gating refusals.
* **Discoveries**:
  * The fake host in `makeVaultWorld` answering synchronously closes the dialog, which settles
    the gating as declined; a test that holds a gating open must return a promise that stays
    pending (`vault-lock.test.ts`'s `lockedVaultAsking`).
  * Model instances are not extensible: spy on `Box.prototype`, not on an instance.
* **For the Coach**: which thread gives the vault its boxes, so that `Vault.evict` can disarm
  them (`Box.evict` is ready)? I looked for it in `v6bank-plan.md` and found none. Also: a new
  refusal factory and phrase, `lockedWhileUnlocking` /
  `LockedWhileUnlocking`; a new base method, `Storable.evict()`. No `eslint-disable` or
  `ts-expect-error`.
