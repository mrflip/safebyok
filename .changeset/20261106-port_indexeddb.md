---
"safebyok-indexeddb": minor
"safebyok-big": minor
---

safebyok-indexeddb is rewritten on the core's new VaultDB from safebyok/storage: idbVaultDB({ dbName, maxRecordBytes }) makes an IdbVaultDB, whose rows go in the database <dbName>:vaults, so a vault the old adapter wrote is not seen. Its inspector, its logger option and its own limits are gone; a write past the storage quota refuses with vault_full, any other IndexedDB failure with storage_unavailable. safebyok/storage adds storageFull, the vault_full refusal for a write the storage had no room for, and exports Checkers, Checker and objCheck for an adapter's own validators.
