---
"safebyok": minor
---

**A lease record's `lease_key` must be a leaseKey.** A device store's lease record now reads as `corrupt_record` unless its `lease_key` is a non-extractable AES-GCM CryptoKey for `wrapKey` and `unwrapKey`, as this package writes one, where only a value that was no CryptoKey was refused before. The vault then asks for the passphrase, as for any lease it cannot take up. Only a store that rewrote the key can hand back such a record; `idbDeviceDB` and `memoryDeviceDB` never do. `isLeaseKey` in `src/types/types.ts` is the check.

**`leaseRecordOf` is gone** from `src/lease.ts`: a test-only export, never in an entry point, which handed out a Lease's record with its leaseKey. A Lease yields its record through nothing now; tests keep the record they made a lease from.
