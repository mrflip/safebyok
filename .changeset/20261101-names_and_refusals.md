---
"safebyok": minor
---

**Renamed exports.** `DeviceDB`'s `raiseDeviceRecord`, `tryRaiseDeviceRecord` and the hook `doRaiseDeviceRecord` are `incrementDeviceRecord`, `tryIncrementDeviceRecord` and `doIncrementDeviceRecord`, and `raisedDeviceRecord` is `incrementedDeviceRecord`; each behaves as before. A host's own `DeviceDB` subclass renames its `doRaiseDeviceRecord` override, and a host's `deviceDB` passed as `BankOpts` names `tryIncrementDeviceRecord`. **A storable's or listing's listener that throws no longer aborts the verb that settled it**: each listener is called in turn, and one that throws is reported to the platform (`reportError`) while the others are still called. **Stored format:** unchanged.
