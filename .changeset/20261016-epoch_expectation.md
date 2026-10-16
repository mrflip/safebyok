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
