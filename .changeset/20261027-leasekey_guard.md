---
"safebyok": minor
"safebyok-react": patch
---

**A lease record's `lease_key` must be a leaseKey.** A device store's lease record now reads as `corrupt_record` unless its `lease_key` is a non-extractable AES-GCM CryptoKey for `wrapKey` and `unwrapKey`, as this package writes one, where only a value that was no CryptoKey was refused before. The vault then asks for the passphrase, as for any lease it cannot take up. Only a store that rewrote the key can hand back such a record; `idbDeviceDB` and `memoryDeviceDB` never do. `isLeaseKey` in `src/types/types.ts` is the check.

**`leaseRecordOf` is gone** from `src/lease.ts`: a test-only export, never in an entry point, which handed out a Lease's record with its leaseKey. A Lease yields its record through nothing now; tests keep the record they made a lease from.

**Only a Lease, a proving and the device store hold a lease record.** `KeptLease.read(deviceDB, scope, { logger, call })` in `src/lease.ts` is how the core reads `DeviceDB.getLease`: the record checked as a lease of the scope and held closed, its stamp showing, until a Vault object takes it up (`kept.leaseOn(vault)`); the Bank's birth read and the vault's refresh and pantry consult carry a `KeptLease`, never a record, and `Proving.grantLease` makes the Lease it hands the vault to hold. A record the store hands back that is no lease of this scope reads as none, warned of once as a take-up finds it, as before. `DeviceDB` is unchanged.

**`safebyok-react` zeroes the authenticator's copy of the PRF answer.** `createPasskey` and `askPasskey` copy the authenticator's PRF result into the answer's `prfBytes` and now zero the buffer they copied from, so the answer's bytes are the one copy, which the vault zeroes as it uses them.
