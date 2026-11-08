---
"safebyok": minor
---

A bank swept or vacated is spent: its snapshot reads `refused` with a `disabled` err, `hello`, `ensureVault` and `vaultAt` refuse `disabled`, and `bank.isEnabled` turns false for good; make another bank with `Bank.make`. `bank.vacate()` now answers a promise, which settles once the bank's leases on this device are erased; that erase still calls the host's `onPanic` and `onBadNews`, and only then is the bank disabled. A disabled bank calls none of the host's `onPanic`, `onBadNews` or `requestCleartext`, falling back to the core's defaults.
