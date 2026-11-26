---
"safebyok": minor
---

`safebyok/storage` exports what an adapter whose server runs a whole vaultDB needs to carry its answers across a wire:

* `crossedErrOf(err)` gives a refusal as it may cross: its kind, its message and an allowlisted meta (`oplabel`, `act`, `capacity`, `fieldnames`, `labelpaths`), never its cause, ask or rows. `CrossedChecks.err` checks one that arrives, and `refusedOverWire(crossed, { act, dbhas })` makes it a `VaultError` again, with the act and the Thing stored that the answer carrying it names.
* `Classifier.crossedThingOf`, `crossedGotOf` (which also checks a get's act against the Thing, by the get table), `crossedWrittenOf`, `crossedNamedOf`, `crossedTrackedOf`, `crossedRootsOf`, `crossedWorldOf` and `crossedListingOf` check the Things an answer carries at the ask's scope, each refusing `storage_issue`.
* `AdapterVaultDB.doWatch`'s `onEnded` is optional: an adapter whose watch never ends itself may leave it out of its override, and of a call to `super.doWatch`. `watch` still hands `doWatch` one.
* `badActVals`, `refusedActVals`, `refusalkindVals`, `ifAbsentVals`, `putIfAbsentVals`, `ifPresentVals`, `gotActVals`, `putActVals` and `delActVals`: the values of an ask's flags, of each verb's acts and of a refusal's kind, for an adapter that names them on a wire.
* `crossedErrOf` gives an infinite `capacity` as the largest safe integer, as JSON cannot carry `Infinity`.
