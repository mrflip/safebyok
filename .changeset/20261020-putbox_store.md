---
"safebyok": minor
"safebyok-convex": minor
"safebyok-graphql": minor
"safebyok-indexeddb": minor
"safebyok-postgres": minor
---

**`VaultDB.putBox` takes its expectation before the box, and reports what stands.** It is now `putBox(scope, expected, box, { signal }?)`, and a custom adapter's hook is `doPutBox(scope, expected, box)`: swap the two arguments in every direct call, wrapper and route. A write that misses no longer resolves `null`: the hook throws from the same atomic step, `Refusals.staleBox(standing)` with the record standing under the boxlabel (or null), or `Refusals.vaultMismatch()`; a key-value adapter asks `Expectations.boxRefusalOf(standingVaultProps, standingBox, expected)`, which replaces `Expectations.boxMeets`. `Refusals.staleWrite('box')` is gone. A hook that still resolves `null` is refused `corrupt_record`.

**Two new refusal kinds, and `stale_write` carries the winner.** `stale_write` from a box write carries `err.meta.box_stored`: the box that stands, whole, as `getBox` would return it (a `DamagedBox` when it fails its checks, null when nothing stands), so a caller can open it or write over its revision without reading again; `meta.box_stored` is typed `BoxRecord | DamagedBox | null`. `vault_mismatch` (a condition) is a box write whose vault props no longer stand -- the vault deleted, made anew or its vaultKey epoch moved -- where it used to be `stale_write`; it carries nothing of the vault props. `invalid_box` (misuse) is a box the base class would not build, where it used to be `bad_record`; a vault still says `bad_record` to its caller, and says `stale_write` or `vault_locked` for a `vault_mismatch`. **`signal`**: an `AbortSignal` that aborts before storage answers resolves `storage_unavailable`, its reason the cause; the write may still land (the new type `VaultDBCallOpts`). The Convex component's `putBox` returns `{ landed, ... }` in place of a nullable box; GraphQL and the Postgres route recipe carry `box_stored` across with the refusal. Stored records are unchanged.
