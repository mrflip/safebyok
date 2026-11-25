---
"safebyok-postgres": minor
---

`PostgresVaultDB` refuses a failed statement that a retry would not mend, a missing table or privilege among them, with `storage_issue` in place of `unexpected_error`; its message names the call, and its `cause` keeps the driver's message and code as before. Its watch takes the `onEnded` of `VaultDB.watch`: a watch that ends of itself, by a notice's fetch failing that way or by a `listen` that fails, calls `onEnded` once and then `onBadNews` with why, always after `watch` has returned, and two such fetch failures together now tell `onBadNews` once. An unlisten that fails is handed to `onBadNews`, where before it was swallowed. The README no longer speaks of the tables of safebyok-postgres-big.
