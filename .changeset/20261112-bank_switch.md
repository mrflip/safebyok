---
"safebyok": minor
---

**`vault_locked` is renamed `bank_locked`**, as the bank is what locks: a host matching `err.kind === 'vault_locked'` now matches `'bank_locked'`, refused where it was before, its message saying the bank is locked and nothing was read or written. **`BankAnnouncement`, `BankAnnounce` and `BankPanic` are renamed `DeviceAnnouncement`, `DeviceAnnounce` and `DevicePanic`**, the device being what announces and panics; their shapes are unchanged. **Stored format:** unchanged.
