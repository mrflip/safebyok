---
"safebyok": minor
---

`safebyok/storage` exports what an adapter whose server runs a whole vaultDB needs to carry its answers across a wire:

* `crossedErrOf(err)` gives a refusal as it may cross: its kind, its message and an allowlisted meta (`oplabel`, `act`, `capacity`, `fieldnames`, `labelpaths`), never its cause, ask or rows. `CrossedChecks.err` checks one that arrives, and `vaultErrorOfCrossed(crossed, meta, rows)` makes it a `VaultError` again.
* `Classifier.crossedThingOf`, `crossedWrittenOf`, `crossedNamedOf`, `crossedTrackedOf`, `crossedRootsOf`, `crossedWorldOf` and `crossedListingOf` check the Things an answer carries at the ask's scope, each refusing `storage_issue`.
* `AdapterVaultDB.watch` takes `VaultDB.watch`'s optional `onEnded`, and hands it to `doWatch` as an optional fourth argument: an adapter whose watch never ends itself leaves it out.
* `badActVals`, `refusedActVals`, `refusalkindVals`, `ifAbsentVals`, `putIfAbsentVals`, `ifPresentVals`, `gotActVals`, `putActVals` and `delActVals`: the values of an ask's flags, of each verb's acts and of a refusal's kind, for an adapter that names them on a wire.
* `crossedErrOf` gives an infinite `capacity` as the largest safe integer, as JSON cannot carry `Infinity`.
