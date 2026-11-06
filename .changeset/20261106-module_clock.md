---
"safebyok": minor
---

**The clock is no longer an option.** `Bank.make` no longer takes a `clock`, and `BankOpts` drops it: the package reads the device's clock, `Date.now()`, wherever it stamps or judges a time. A host still passing `clock` meets `bad_option`, as for any option `Bank.make` does not take; drop it. `bank.clock` and `vault.clock` are gone. A test that wants to set the time uses vitest's fake timers, or `_cheat_clock(fn)` and `_cheat_clockReset()` from `safebyok/testing`; the main entry exports neither.
