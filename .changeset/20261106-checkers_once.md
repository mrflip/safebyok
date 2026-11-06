---
"safebyok": minor
---

**An `autolockMinutes` of `Infinity` is kept as `ForeverMillis`**, the longest span between two instants the package accepts: `bank.leaseMillis` and `bank.autolockMinutes` read that finite span where they read `Infinity`, and a lease still never lapses. A `maxMillisSinceRefresh` or `maxWorldMillis` of `Infinity` is bounded the same way. **`Bank.make` refuses a bad `keyDeriver`, `requestCleartext`, `strengthChecker`, `logger` or `onPanic` once**, by the check that wraps it: the message still leads with the option's name, and now ends in a period. Every other export is unchanged. **Stored format:** unchanged.
