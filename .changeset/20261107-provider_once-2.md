---
"safebyok": patch
---

**`brandedDeviceDB`**, from `safebyok/storage`: the check `Bank.make` puts its `deviceDB` option through, refusing anything not a DeviceDB `bad_option`, for a binding that calls the deviceDB before it makes a bank. **Stored format:** unchanged.
