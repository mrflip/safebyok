---
"safebyok": minor
---

**Renamed exports; each behaves as before.** `DeviceDB`'s `raiseDeviceRecord`, `tryRaiseDeviceRecord` and the hook `doRaiseDeviceRecord` are `incrementDeviceRecord`, `tryIncrementDeviceRecord` and `doIncrementDeviceRecord`, and `raisedDeviceRecord` is `incrementedDeviceRecord`: a host's own `DeviceDB` subclass renames its `doRaiseDeviceRecord` override, and a `deviceDB` a host hands the bank must answer `tryIncrementDeviceRecord`. The lease row a `DeviceDB` stores, `keptLeaseRow` and its type `KeptLeaseRow`, is `cachedLeaseRow` and `CachedLeaseRow`. **A storable's or listing's listener that throws no longer aborts the verb that settled it**: each listener is called in turn, and one that throws is reported to the platform (`reportError`) while the others are still called. **Stored format:** unchanged.
