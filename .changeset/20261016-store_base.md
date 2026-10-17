---
"safebyok": minor
"safebyok-indexeddb": minor
"safebyok-convex": minor
"safebyok-postgres": minor
"safebyok-graphql": minor
---

**Every storage adapter takes one bag of options, a `logger` among them.** `localVaultDB(store)` is now `localVaultDB({ store, logger })`, `convexVaultDB(client, api)` is `convexVaultDB({ client, api, logger })`, and `graphqlVaultDB(client, { maxLockboxes })` is `graphqlVaultDB({ client, maxLockboxes, logger })`; `idbVaultDB` and `postgresVaultDB` take `logger` in the bags they had. A VaultDB made with no logger uses the one `openVault` was given (`VaultDB.adoptLogger`), else the console. A VaultDB of your own takes `VaultDBOpts` and hands them to `super(opts)`.

**`subscribe` guards its listeners.** A listener that throws, or returns a promise that rejects, no longer escapes into a write or the adapter: it is logged as an `error` (story `{ call: 'subscribe' }`) and handed to `reportError` where the platform has one, and every other listener is still called. An unsubscribed listener is never called again, and a second unsubscribe does nothing.

**`VaultDB.listBoxRecords` is on every VaultDB**, so any VaultDB can be served over GraphQL: `safebyok-graphql`'s `ServedVaultDB` is any VaultDB, and `safebyok-postgres` no longer exports the `PostgresVaultDB` type (write `VaultDB`).

**New exports from `safebyok`**: `Refusals` (the refusals an adapter throws, each cause never null), `Expectations` (the comparisons a key-value adapter makes), and the types `VaultDBOpts`, `LocalVaultDBOpts`, `WatchTrouble`; from `safebyok/idb`, `ChangeBell`, which `idbDeviceDB` now rings as `safebyok-indexeddb` does: other tabs hear a write even when this tab has no listener, and each listener runs on its own microtask.

**Postgres and GraphQL set no lockbox limit by default** (`maxLockboxes` was 1000, now `Infinity`). A Postgres vault with no limit is never counted. Pass `maxLockboxes` to both, as before, to keep a limit.

**Postgres logs a `listen` that fails to start; GraphQL logs a subscription that fails and calls `onChange`**, so the vault reads again and meets the refusal itself. Convex logs a `ConvexClient` watch that fails. A GraphQL validation error (`BAD_USER_INPUT`, `GRAPHQL_VALIDATION_FAILED`) now refuses as `bad_option`, not `storage_unavailable`. safebyok's own Convex refusals (`identity_revoked`, `vault_full`) no longer carry the `ConvexError` as their cause.

**A GraphQL `vaultDBFor` that throws crosses as `bad_option` with a generic message**, saying the server's setup is wrong; its own message, which used to reach the browser, stays on the server as the GraphQL error's `cause`.

**The Convex component's `updateBundle` lands only a bundle that keeps the vault's `vault_id` and moves its `unlock_epoch` forward**, else resolves `false` (`stale_write` to the client). Every safebyok client already writes so; a client that does not is refused.

**An IndexedDB failure the browser gives no error for** reaches a caller as `storage_unavailable` whose cause reads "The storage backend failed without giving an error.", where it read "The IndexedDB request failed for an unknown reason".
