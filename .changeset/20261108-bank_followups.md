---
"safebyok": minor
---

**`DefaultOnPanic` also logs.** It tells the bank's logger of each panic at error, with the refusal's message, its `refusalkind` and `call: 'Bank.onPanic'`, as well as handing the refusal to the platform's `reportError`, so a panic in Node or during SSR, where there is no `reportError`, is no longer lost. A disabled bank's panics are logged the same way.

**A vacate forgets the bank's row in the deviceDB.** `bank.vacate()` now erases this bank's bank row too, after its leases, so the next `deviceDB.ensureBank` for that user and app mints a new `device_id`, as on a fresh device; a sweep leaves the row. A bank row the vacate cannot erase reaches the host's `onPanic`, as a lease it cannot erase does. **`DeviceDB` gains `forgetBank(scope)` and `tryForgetBank(scope)`**, and the protected hook `doForgetBank(scope)`, which a host's own `DeviceDB` subclass must now write: it removes whatever row is stored at that bank scope, in one step. `MemoryDeviceDB` and `IdbDeviceDB` write it.
