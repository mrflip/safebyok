---
---

Empty: the new `safebyok` is private, and `safebyok-big` is untouched. What a caller of the new core will see: **`bank.sweep()`** now also sweeps each `Vault` made on the bank, whose minder stops watching and empties its cache (its listeners hear each car and listing removed), tells the bank's subscribers once, then lets them go, and has its device let the bank go. **`device.sweep()`** no longer ends the device: it sweeps every bank made on the device (and **`device.lock()`** locks each), and the device stays usable, showing `PendingBank`, judging passphrases and holding the next bank made on it. **`vault.sweep()`** is new, and **`Vault.make`** now refuses a swept bank with `disabled`. New exported type: `HostedVault`. **Stored format:** unchanged.
