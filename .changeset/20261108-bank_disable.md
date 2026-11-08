---
"safebyok": minor
---

A bank swept or vacated is spent: `bank.isEnabled` turns false for good, its snapshot reads `refused` with a `disabled` err, and `hello`, `ensureVault` and `vaultAt` refuse `disabled`; make another bank with `Bank.make`. A disabled bank calls none of the host's `onPanic`, `onBadNews` or `requestCleartext`, falling back to the core's defaults, so the `identity_revoked` that vacates a bank is the last news its `onBadNews` hears, and a lease the vacate cannot erase is reported to the platform, not to `onPanic`.
