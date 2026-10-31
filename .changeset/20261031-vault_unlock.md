---
"safebyok": minor
---

`DeviceDB.getLease` and `tryGetLease` now answer a `KeptLeaseRow`: a `LeaseRecord` as before, or a lease row of the new vault models (`fmt` 7001, `ModelsLeaseFormat`), so one deviceDB keeps both while the models are built. A host that reads `getLease`'s answer as a `LeaseRecord` narrows it with `leaseRecord.parse`; no stored row changes, and a row that is neither still reads as absent and is erased. `keptLeaseRow`, `KeptLeaseRow` and `ModelsLeaseFormat` are exported. Nothing else ships: the models' vaults are born unlocked, unlock by proof or by the lease the device keeps, and lock at the listing's `goodbye`, but nothing under src/models/ is exported yet.
