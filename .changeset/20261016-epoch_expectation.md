---
"safebyok": minor
"safebyok-indexeddb": minor
"safebyok-convex": minor
"safebyok-postgres": minor
"safebyok-graphql": minor
---

**Every adapter now compares a lockbox write's `vault_key_epoch`** (VAULTDB.md line 3.8): `idbVaultDB` in the write's transaction, the Convex component's `updateBox` mutation, and `postgresVaultDB` in the write's one statement, reading the vault's bundle row `FOR SHARE`; `graphqlVaultDB` gets it from the VaultDB its server serves. A lockbox write sealed under a vaultKey the bundle no longer stands for now refuses as `stale_write`, writing nothing. Every vault is at `vault_key_epoch` 1 today, so no write a host makes now is refused by it. Convex hosts redeploy the component to take it up.

**Postgres: a bundle update waits for lockbox writes in flight.** The `FOR SHARE` read is the one lock any verb takes; lockbox writes never wait for each other. If you installed the README's optional hard-cap trigger, replace it with the README's new version, which serializes inserts on an advisory lock: the old one's `FOR UPDATE` on the bundle row deadlocks two first writes into one vault, one of them failing as `storage_unavailable`.

**`safebyok/testing`: `describeVaultDB` no longer takes `comparesVaultKeyEpoch`.** Line 3.8's tests run for every adapter; drop the option, and compare the epoch in your adapter's lockbox write.

**`close()`, and a refresh that outlives the key, now stop a read in flight.** A `read()` or `use()` under way when the handle is closed hands back nothing and refuses with `vault_closed`; one under way when a refresh finds the vault's ways in changed on another device, or the vault gone, refuses with `vault_locked`. A `lockSoon()` grace running out, and a clock that cannot be read, still let a read in hand finish.

**A device-store failure says what failed.** Still kind `storage_unavailable`, the device store's error its cause, but the message now names the step -- reading or writing the remembered unlock, reading or writing this device's mark of the vault, erasing either -- and what to do. `eraseDamagedVault` now reports a device-store failure the same way (it threw the device store's own error before).
