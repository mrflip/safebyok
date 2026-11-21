---
---

Empty: the new `safebyok` is private, and `safebyok-big` is untouched. What a caller of the new core will see: **`bank.getSnapshot()` and `bank.subscribe(listener)`**, in the shape `useSyncExternalStore` wants, give the bank's `stage` (`locked`, `unlocked` or `swept` today; `BankStage` names every stage), `isLocked`, `isEnded`, `endCause`, `leaseEndsAt` (when the lease expires, in epoch milliseconds) and `lastErr` (null until startup can fail). A snapshot is a new frozen object only when something in it changed, and subscribers are told only then; a listener that throws reaches `onBadNews`. **`device.sweep()`** now sweeps its bank (for now, the last `Bank` made on the device), ending its lease. **Stored format:** unchanged.
