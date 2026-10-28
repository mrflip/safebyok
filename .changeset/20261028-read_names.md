---
"safebyok": minor
---

**No operation is a `read` or a `write`: each is named for what it does.** `StringStore.read`, `write` and `erase` are `get`, `put` and `del`: a StringStore of your own renames the methods, and `localVaultDB` refuses 'bad_option' for one still carrying the old names; `memoryStore()` and `domStore()` have the new ones. `Refusals.staleWrite('del')` is `Refusals.staleDel()`, its message `Refusals.StaleDelMessage`; `Refusals.StaleWriteVals` and the `StaleWrite` type are gone. The refusal it makes is still of kind `'stale_write'`. A DeviceDB subclass of your own implements `doDelUnparsed(scopepath, isSound)` where it implemented `doDelUnreadable(scopepath, isReadable)`: the hook is renamed, its contract unchanged. Inside the core, `KeptLease.tryRead` is `KeptLease.tryGet` and `registerLeaseReader(vault, read)` is `registerLeaseGetter(vault, getLease)`. Nothing stored changes.
