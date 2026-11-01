# Thread 1: names_and_refusals (2026-11-01)

Branch `20261101-names_and_refusals`, PR [#426](https://github.com/mrflip/safebyok/pull/426), cut
from main. Justify: green, 6992 passed, 220 skipped, every package.

* **Built**
  * `packages/safebyok/src/helpers/refusal-funcs.ts`: every refusal factory the models throw, in
    bannered sections (Opening a vault, Storables, Listings, Leases, Boxes, Vaults, Gates,
    Provings, Gatings, Banks), imported whole as `RefusalFuncs`. `helpers/throwers.ts` is gone,
    and so is each model's own `// == [Refusals]` section. The old core's `bank.ts` and `vault.ts`
    take the factories they share with the models from it.
  * Factory renames: goneError to vaultGoneWhileOpening, behindError to vaultBehindWhileOpening,
    otherStoresError to otherStoresThanHeld, lockedError to vaultLocked, partialLoadError to
    partialLoad, movedUnderEditError to movedUnderEdit, alreadyHeldError to alreadyHeld,
    unlockFirst to needVaultUnlocked (phrase `NeedVaultUnlocked`). The two `leaseNotInForce`
    copies are now one. The listings' inline absent refusals are `vaultAbsent(label)` and
    `boxAbsent(label)`, with a new phrase `boxAbsent`.
  * **raise.** DeviceDB's `raiseDeviceRecord` / `tryRaiseDeviceRecord` / `doRaiseDeviceRecord`
    are now `incrementDeviceRecord` / `tryIncrementDeviceRecord` / `doIncrementDeviceRecord`;
    `raisedDeviceRecord` is `incrementedDeviceRecord`, and `raisedFrom` is `incrementedFrom`.
    `RaisedGating.raise` is now `RaisedGating.make` (sync). Vault's `#raiseGating`, which makes a
    gating and runs it, is now `#launchGating`.
  * **kept, cached sense.** `KeptLeaseRow`/`keptLeaseRow` are now `CachedLeaseRow`/
    `cachedLeaseRow`; the old `KeptLease` is now `CachedLease`, with fields `cachedLease`. In
    the models: `takeUpCachedLease`, `#cachedLookup`, `#lookUpCached`, `eraseCached`. In the old
    gating: `uncachedUnlockError`. In tests: `cachedNow`, `cache`, `friend.cached`.
  * **kept, other senses, renamed.** `checkSuppliedSpecKept` is now `checkSuppliedSpecUnchanged`
    (in the old core and in the deriver). `keptIfSame` is now `shownIfSame`. The phrase
    `PassphraseKept` is now `PassphraseIrremovable`. A memo lookup's local `kept` is now
    `cached`. `keptTombstones` is now `collectTombstones`.
  * Storable `#replaceSnapshot` and Listing `#remakeSnapshot` call each listener inside its own
    try, and a throw goes to `reportToPlatform`. Each has a test.
  * The stale comment in `Storable.send` about a locked thing's getters is gone.

* **Decisions taken**
  * The device record only ever climbs to the higher `highest_vault_epoch`. I read that as the
    plan's "increment" and named it so. `advance` fits a ratchet better: see the Open Matter.
  * Old core `vault.ts` keeps its own `goneError`/`behindError`, whose phrases differ, and the
    rest of its Refusals section. Old `gating.ts` keeps its Refusals section too. Neither is
    shared with the models, and the old core is in scope only for `raise`/`kept`.
  * Prose stays as it is, in docs, test titles and logger text: "the record is raised, never
    lowered", "a vault raises a gating", "kept" meaning retained. The thread renames identifiers.
  * Listing's listeners are isolated too: the same defect, one loop away. This goes beyond the
    thread text.

* **Deviations**
  * The deriver's own factories (`reservedLabel`, `suppliedSpecChanged`, `saltDoesNotFit` in
    `deriver/basederiver.ts`) stay where they are while thread 2 works in that file. They move at
    the restack.

* **Discoveries: senses not renamed, with a recommended name for each**
  * `RaisedGating` (internal class): `LaunchedGating`.
  * Prose and test parameters where a vault "raises a gating" (`heldGatingOf(vault, raise)`, the
    `raising` locals in safebyok-react tests, gating.test's `raise`): "launch".
  * Prose "raised, never lowered" for the device record: "advanced".
  * `kept` meaning *storage's copy* in test locals (`const kept = tryGetBox(...)`, vault-wayins,
    listing.test): `stored`.
  * `kept` as a destructured field a tamper row retains (vault-lease, vault-storage, vault-del
    tests): `was`.
  * safebyok-convex `tallies.ts` `kept` and the `keptTally` test helper (the tally row
    maintained in the database): `tallyRow` / `storedTally`.
  * safebyok-react `bank-provider.tsx` `kept = { held: true }` (a liveness flag): `liveness`.
  * mask.test `keptChars` (characters left unmasked): `unmaskedChars`.
  * Prose "kept" meaning retained, about 280 hits: leave.

* **For the Coach**: the GAP comments in `models/bank.ts` (64, 66, 137, 153) and
  `models/gating.ts` (67, 78) belong to the pester, box-listing, 4a and gatings threads. This
  thread could close none of them.
