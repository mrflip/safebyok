---
"safebyok": minor
---

The exported validator `localVaultDBOptsShape` is renamed `localVaultDBOpts`, as a validator takes no `Shape` suffix. The old name is gone, with no alias: a host importing `localVaultDBOptsShape` imports `localVaultDBOpts` in its place. What it checks and how it refuses are unchanged. `vaultDBShape`, `deviceDBShape`, `clockShape`, `keyDeriverShape` and `loggerShape` keep their names.

The main entry now exports the type beside each validator it exported without one: `VaultBag` and `BankBag`; `BankScopepath`, `VaultScopepath`, `LeaseScopepath`, `DeviceScopepath` and `BoxScopepath`; `ClockReading`, new; `MaskOpts` and `IdbOpts`, which `safebyok/utils` and `safebyok/idb` already export. These are additions: no name a host imports today changes with them.
