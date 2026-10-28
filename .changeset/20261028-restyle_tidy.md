---
"safebyok": minor
---

The exported validator `localVaultDBOptsShape` is renamed `localVaultDBOpts`, as a validator takes no `Shape` suffix: a host importing it by the old name imports the new one. What it checks and how it refuses are unchanged. `vaultDBShape`, `deviceDBShape`, `clockShape`, `keyDeriverShape` and `loggerShape` keep their names.

The main entry now exports the type beside each validator it exported without one: `VaultBag` and `BankBag`; `BankScopepath`, `VaultScopepath`, `LeaseScopepath`, `DeviceScopepath` and `BoxScopepath`; `ClockReading`, new; `MaskOpts` and `IdbOpts`, which `safebyok/utils` and `safebyok/idb` already export. Nothing a host imports today changes.
