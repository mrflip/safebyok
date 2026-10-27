---
"safebyok": minor
"safebyok-react": minor
---

**Breaking: the bank's snapshot lists its vaults, and hands out no Vault object; `bank.vaultOf` does.** `bank.snapshot` (and `getSnapshot()`) sits flat on the bank's scope (`applabel`, `user_id`) beside its `lifecycle` and `vaults`. What changed, and what to read instead:

* `status` is `lifecycle`, and `timely` is `ready`: `made`, `starting`, `ready`, or `refused` with its `err`. `err` is present only while `refused`. The `bank.status` getter is gone: read `bank.snapshot.lifecycle`. `BankStatus` is gone; the type is `BankSnapshot['lifecycle']`.
* `vaults` is a sorted, frozen array where it was an object keyed by an opaque text: each vault asked for and not let go, sorted by `vaultlabel`, as a `BankVault` -- the vault's scope, flat, and its `lifecycle` (`starting`, `ready`, or `refused` with its `err`). It holds no Vault object. The array is the same object until a vault in it changes, and each element the same until it changes itself. `VaultEntry` and `EntryStatus` are gone, for `BankVault`.
* `bank.entryOf(bag)` is gone, for two lookups: `bank.vaultOf(bag)`, the Vault object once `ready` (null before, once refused, and once let go), and `bank.bankVaultOf(bag)`, the vault's `BankVault`. Before: `bank.entryOf({ vaultlabel: 'main' })?.vault`, `entry.status`, `entry.err`, `entry.scope`. After: `bank.vaultOf({ vaultlabel: 'main' })`, `bankVault.lifecycle`, `bankVault.err` (once `lifecycle === 'refused'`), and the `BankVault` itself, which any bank call takes as its bag.

**safebyok-react: `useVault` hands down the Vault object, and `useBankVault` (new) the vault as the bank lists it.** `useVault('main')` is the Vault object, or null, where it was the bank's entry: `useVault('main')?.vault ?? null` becomes `useVault('main')`. A component rendering where the vault stands, or why it was refused, reads `useBankVault('main')`: `starting`, `ready`, or `refused` with its `err`. Both ask the bank for the vault as `useVault` did, and both throw a misuse refusal to the error boundary.

**Stored format:** unchanged.
