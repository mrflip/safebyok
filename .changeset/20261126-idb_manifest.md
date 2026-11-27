---
---

None: a restructuring. `IdbVaultDB`'s `do*` calls hand back a manifest, as `notes/vault-adapter-contract.md` describes, each from one function of a new `IdbDatastore` (`src/idb-datastore.ts`, not exported), whose transaction body is the datastore step. `safebyok/storage` exports `isWritable` and `isBirthWritable`, the write and birth predicates `MemoryDatastore` uses, so that a datastore that runs TypeScript in its step shares them. A working vaultDB answers as before.
