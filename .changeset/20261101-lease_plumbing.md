---
"safebyok": patch
---

**The models' vaults take up the kept lease at birth, and a lock during a vault's birth holds.** None of this is exported yet. A vault the models' listing fetches into being takes up the lease this device keeps of it, so a reload asks for nothing where a lease is kept. A lock, `closeVault` or let-go that lands while `ensure` is putting a new vault's first lease leaves the vault locked: the lock's erase waits for that put, so the device keeps no lease after a lock (G4). The models' `DeviceDB` erases a cached copy whose central or staged record names another vault than the one it is filed under, and tells the bank's `onBadNews` of each copy it erases as a 'corrupt_record'. Its `advanceDeviceRecord` now resolves `{ record, wroteOverDamaged }`. **Stored format:** unchanged; a copy filed under the wrong vault, which this package never writes, now reads as absent.
