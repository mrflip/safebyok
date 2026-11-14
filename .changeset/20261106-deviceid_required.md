---
"safebyok-big": minor
---

`device_id` is now a required option of `Bank.make`: a host hands it in, a label, and `Bank.make` refuses 'bad_option' when it is missing, where it minted one. The bank answers `bank.device_id` and the snapshot's `device_id` as given from the start, and no longer adopts the first one a device cached. The deviceDB keeps leases only: `cacheDeviceRecord`, `tryCacheDeviceRecord`, the `doCacheDeviceRecord` hook a subclass wrote and the `DeviceRecord` shape are gone, and the bad news of a damaged device record with them. A device record a store holds is no longer read; before 1.0 there is no migration, and a store may drop those rows.
