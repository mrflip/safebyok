---
"safebyok": patch
---

DeviceDB's throwing forms now check the device record they resolve: `getDeviceRecord` resolves a checked `DeviceRecord | null`, a record filed under the scope but naming another read as none, as a malformed one already was; `raiseDeviceRecord` resolves the record as stored, checked, or null where a record a host handed it fails its check (`tryRaiseDeviceRecord` resolves the same as an Outcome). `deviceRecordFor` was never exported from the package and is gone. A host whose own code reads device records through the core's `DeviceDB` sees the same records; one calling `raiseDeviceRecord` handles a null it could not meet with a record `deviceRecordOf` made. **Stored format:** unchanged.
