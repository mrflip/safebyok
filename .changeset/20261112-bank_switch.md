---
"safebyok": minor
---

**`vault_locked` is renamed `bank_locked`**, as the bank is what locks: a host matching `err.kind === 'vault_locked'` now matches `'bank_locked'`, refused where it was before, its message saying the bank is locked and nothing was read or written. **`BankAnnouncement`, `BankAnnounce` and `BankPanic` are renamed `DeviceAnnouncement`, `DeviceAnnounce` and `DevicePanic`**, the device being what announces and panics; their shapes are unchanged. **`Device.make` takes a `bankDB`** where it took a `vaultDB`: a `BankDB` from a storage adapter, branded and answering each of its verbs, the refusal `bad_option` otherwise. **Stored format:** unchanged.
