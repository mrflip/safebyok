---
"safebyok": minor
---

The exported validator `localVaultDBOptsShape` is renamed `localVaultDBOpts`, as a validator takes no `Shape` suffix: a host importing it by the old name imports the new one. What it checks and how it refuses are unchanged. `vaultDBShape`, `deviceDBShape`, `clockShape`, `keyDeriverShape` and `loggerShape` keep their names.
