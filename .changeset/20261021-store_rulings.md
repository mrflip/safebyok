---
"safebyok": minor
"safebyok-postgres": minor
"safebyok-convex": minor
"safebyok-graphql": minor
"safebyok-indexeddb": minor
---

**Breaking, for an adapter of your own and for code calling a VaultDB directly.** `VaultDB.putBox(scope, expected, box)` takes no options: its `signal` is gone, and `VaultDBCallOpts` with it. Every VaultDB answers how full a vault is: `getCapacity(scope)` resolves a `Capacity`, `{ boxes: { used, max }, bytes: { used, max } }`, each adapter weighing bytes its own way (its README says how), a limit it does not keep as the largest safe integer. An adapter of your own implements `doGetCapacity(scope)`. A `vault_full` from storage now carries the same reckoning as `meta.capacity`: `Refusals.vaultFull(capacity, opts?)` replaces `Refusals.vaultFull(limit?, opts?)`, and a `vault_full` without a sound capacity is refused as `corrupt_record`. A box write sent again after it landed now refuses as `stale_write`, naming its own box, on every adapter: Postgres answered it as landed. Postgres's box write locks the box standing `FOR UPDATE` in place of a no-op update. `describeVaultDB` gains line 4.7 and a resent-write race.

Convex: redeploy the component with the app. A box write with no room now resolves `{ landed: false, refusalkind: 'vault_full', capacity }` rather than throwing a `ConvexError`, so `SafebyokErrorKindVals` no longer lists `vault_full`; re-export the new `getCapacity` from your `convex/safebyok.ts`. A client meeting a box write's answer in a shape it does not know refuses it as `corrupt_record`, saying the deployed component is out of date. GraphQL: the schema adds `safebyokGetCapacity` and the `SafebyokCapacity` type, and a `vault_full` crosses with `extensions.meta.capacity`; serve the new SDL beside the new client, and register the tenth document in `VaultOperations`. The Postgres route recipe sends a refusal's `meta` whole and serves `getCapacity`.
