# Thread 1: names_and_refusals (2026-11-01)

Branch `20261101-names_and_refusals`, PR pending, cut from main. Justify: green.

* **Built**
  * `packages/safebyok/src/helpers/refusal-funcs.ts`: every refusal factory the models throw, in
    bannered sections (Opening a vault, Storables, Listings, Leases, Boxes, Vaults, Gates,
    Provings, Gatings, Banks), imported whole as `RefusalFuncs`. `helpers/throwers.ts` is gone;
    each model's own `// == [Refusals]` section is gone. The old core's `bank.ts` and `vault.ts`
    take the shared ones (`vaultGoneWhileOpening`, `vaultBehindWhileOpening`,
    `otherStoresThanHeld`, `vaultLocked`) from it.
  * Renames: goneError to vaultGoneWhileOpening, behindError to vaultBehindWhileOpening,
    otherStoresError to otherStoresThanHeld, lockedError to vaultLocked, partialLoadError to
    partialLoad, movedUnderEditError to movedUnderEdit, alreadyHeldError to alreadyHeld,
    unlockFirst to needVaultUnlocked (phrase `NeedVaultUnlocked`). The two `leaseNotInForce`
    (lease.ts, vault.ts) are one. The listings' inline absent refusals are `vaultAbsent(label)`
    and `boxAbsent(label)` (new phrase `boxAbsent`).
  * Storable `#replaceSnapshot` and Listing `#remakeSnapshot` call each listener in its own
    try, a throw going to `reportToPlatform`; a test in each.
  * The stale comment in `Storable.send` about a locked thing's getters is gone.

* **Decisions taken**
  * The old core `vault.ts` keeps its own `goneError`/`behindError` (different phrases:
    VaultObjectGone, VaultBehind) and the rest of its Refusals section: they are not shared with
    the models, and the old core is out of scope save for `raise`/`kept`.
  * Listing's listeners are isolated too: the same defect, one loop away (an extra beyond the
    thread text).

* **Deviations**
  * The deriver's own factories (`reservedLabel`, `suppliedSpecChanged`, `saltDoesNotFit` in
    `deriver/basederiver.ts`) stay, thread 2 working there; they move at the restack.

* **Next**: the `raise` and `kept` surveys' renames (below), then ready.
