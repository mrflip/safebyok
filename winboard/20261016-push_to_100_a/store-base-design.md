# Thread 5a: the storage base class, design

*push_to_100_a, 2026-10-16. Written for the Coach, then for the 5b worker. It was written against `main` (`af4b34f5`) but describes the code as it will stand once threads 1 and 4 have landed. **Ground assumed** says where it had to guess.*

## Summary

`VaultDB` already checks everything in its public verbs and leaves the `do*` hooks to adapters, and that split stays (G478). This design adds four things to the base and changes no hook:

- **A `logger` at construction**, falling back to the console. It is never openVault's logger.
- **One guarded `subscribe`.** It catches and reports each listener's failure, ignores a delivery that arrives after unsubscribe, and makes the unsubscribe safe to call twice. No adapter writes any of that again.
- **A concrete `listBoxRecords`** built on `doListBoxes`. Any VaultDB can then be served over GraphQL, and Postgres drops its own copy.
- **An exported `Refusals` module** of four constructors whose `cause` is never null.

`doSubscribe` stays the only no-op default. The two key-value adapters will share one set of expectation predicates exported from core, which retires `safebyok-indexeddb`'s copy.

The Coach's earlier idea of a connector that implements only list, replace and delete is **not** built. An update made as fetch, merge, replace cannot be the atomic compare-and-write that VAULTDB.md's baseline requires. A key-value tier that keeps atomicity (`ShelfVaultDB`) goes to the Coach as a yes/no question instead.

Proposed name for the adapters' logger option: **`logger`**, in every adapter.

## Ground assumed

- **Thread 1.** `bindValidators(bag)` keeps the bound rules on the instance, and the verbs read them from there. `maxNameBytes` and `reservedNameChars` are declarations on `VaultDB`. The key-value adapters take `{ ckey: { join, split } }`. The new `listBoxRecords` checks its scope against the bound rules, or against the floor when none are bound (the server case).
- **Thread 4.** `listedOrDamaged`, `DamagedLockbox.revision_id`, `newer_format` and `eraseDamagedVault` are as that thread leaves them. `newer_format` keeps its own constructor and is not one of the four.
- **Thread 13** (VAULTDB.md line 3.8 in every adapter) merges before 5 in the planned order. If it has not, the shared predicates below bring 3.8 to IndexedDB anyway: core's `lockboxMeetsExpectation` already compares `vault_key_epoch`.

## What the base carries

### Construction and the logger (G210, G211)

- `abstract class VaultDB { constructor(opts?: VaultDBOpts) }`, where `VaultDBOpts = { logger?: VaultLogger }`.
- The base keeps `protected readonly logger = parseLogger(opts?.logger)`. That is the existing guard, so a logger that throws or rejects is dropped, and with no logger the console fallback in `src/console-logger.ts` is used.
- A host's own adapter that calls `super()` with nothing keeps working and logs to the console.
- Each adapter factory takes `logger` in the options bag it already has, or a new one: `localVaultDB(store, { logger })`, `idbVaultDB({ dbName, logger })`, `convexVaultDB(client, api, { logger })`, `postgresVaultDB({ ..., logger })`, `graphqlVaultDB(client, { maxLockboxes, logger })`.
- `openVault` does not hand its logger to the adapter. Its doc block and each README say: "pass the same logger to both".

What adapters report through it:

| Event | Level | Notes |
|---|---|---|
| A listener throws or rejects | `error` | Host code to mend |
| An unsubscribe throws | `error` | |
| A watch that fails to start or drops (Postgres `listen` rejecting, a GraphQL subscription error, Convex `onError`) | `warn` | Once per failing streak; reset when the watch delivers again |

Every story carries `{ call: 'subscribe' }`. No record, scope or name is logged. An adapter's own error goes as `err`, as the vault does today.

### `subscribe` (G209, G511, G236, part of G149)

The public `subscribe` wraps `onChange` before `doSubscribe` sees it. The wrapper:

- calls the host's function inside a try/catch;
- if the function returns a thenable, attaches a catch to it;
- reports any failure to `this.logger.error`, and also to `globalThis.reportError` when that is a function (browsers, Deno), checked at call time;
- does nothing once the watch has been unsubscribed.

The returned unsubscribe runs once. A second call does nothing. If the adapter's unsubscribe throws, the error is logged, not rethrown.

Effects on the adapters:

- Convex's three-line once-guard moves here (G236: kept as one boolean, now in one place for everyone).
- Postgres's `listening` check before calling `onChange` goes.
- Postgres's watch-start call can no longer turn a throwing listener into an unhandled rejection (G511).
- A throwing listener no longer escapes a landed `localVaultDB` write (G209).
- The listener's type check happens once, here. `makeBell`'s check stays only for direct `StringStore` users.

### `listBoxRecords` (G208)

A public, concrete verb:

```ts
async listBoxRecords(scope: VaultScope): Promise<unknown[]>
```

It checks the scope, calls `doListBoxes` through `fromStorage`, keeps entries filed under a text boxlabel, and returns each record as stored minus `lockbox_key_wrapped` and `whisper_ciphered`. It does not validate the records: the browser's VaultDB does that (line 1.3).

- No in-tree adapter overrides it, since Postgres's version was exactly this. An adapter whose backend lists in one cheaper query may override it.
- `ServedVaultDB` becomes the same verbs `Pick`ed from `VaultDB`, with `listBoxRecords` included. Any VaultDB qualifies.
- `PostgresVaultDB` becomes a deprecated alias of `VaultDB`, or is dropped (the Coach's choice; default: dropped).

### `Refusals`: shared constructors (G213, G257)

A new `src/refusals.ts`, exported as `export * as Refusals from './refusals'` (imported whole, like `Sanitizer`):

- `storageUnavailable(cause: unknown)`
- `staleWrite(what: 'bundle' | 'lockbox' | 'erase')`
- `notPermitted(said?: string, cause?: unknown)`
- `vaultFull(limit?: number, cause?: unknown)`

The messages are core's current ones. The base's three stale messages and `asStorageTrouble` become calls to these.

**The never-null rule:** a `cause` given as `null` or `undefined` becomes `new Error('The storage backend failed without giving an error.')`. A cause that is left out leaves no `cause` property at all. This retires `safebyok-indexeddb`'s null-replacement in `settle`. `settle` itself stays, because it picks the request's error over the transaction's null error.

Adapters stop copying messages:

- Postgres's `vault_full` uses `Refusals.vaultFull(limit)`.
- GraphQL's resolvers use `storageUnavailable` in place of their `storageTrouble`.
- Convex rebuilds its own refusals through `Sanitizer.refusalFor(err, kind, message)`, so its own kinds drop the `ConvexError` cause too (G257: one rule, the Sanitizer decides). Its foreign-error message stays its own, because it must point at the deployment's logs. Closed by a note: the two messages differ only in that clause.
- `identity_revoked` is not among the four. Postgres and the Convex server each keep their own.

### Optional verbs (G214)

Only `doSubscribe`, a store that cannot push, has a no-op default, as today. The other seven hooks stay abstract.

The Coach's earlier ideas are each declined:

- **Fetch as list-then-select**: breaks "each verb is cheap".
- **Update as fetch-merge-replace**: breaks "each write is atomic on its own".
- **Sugar verbs nobody calls**: "implement no verbs we don't need".

### G149 tidy

- One `checked(schema, raw, kind, said)` replaces `checkOutgoing` and `checkRecord`.
- A shared `sameScope(one, two)` serves `checkBundle` and `vault.ts`'s `isOfScope`.
- Each write parses its record once, and the name checks read the parsed record.

### What stays in each adapter

- The seven data hooks, and `doSubscribe` where the backend can push.
- Its declarations: the three byte and count limits, plus thread 1's two name limits.
- Its option parsing.
- Its translation of backend errors into kinds.

### Shared expectation predicates

Core's private predicates (`bundleMeetsExpectation`, `vaultMeetsExpectation`, `vaultIdMeetsExpectation`, `lockboxMeetsExpectation`) are exported as `Expectations`, read with plain field access like IndexedDB's `fieldOf`. `localVaultDB` and `idbVaultDB` both use them, and `safebyok-indexeddb/src/expectations.ts` is deleted. Core's semantics win: `vault_key_epoch` is compared (line 3.8).

### Core's device-store bell (G270)

- `safebyok-indexeddb`'s `bell.ts` moves into core as `src/bell.ts`.
- It is exported from the `safebyok/idb` entry as `ChangeBell` (`ring`, `listen`). Both `idb.ts`'s device store and the IndexedDB package use it.
- So a write rings other tabs whether or not this tab listens, each listener runs on its own microtask, and a failure goes to `reportError` where available, else is dropped (the bell has no logger).
- `string-store.ts`'s `makeBell` keeps ringing synchronously, with the same catch added.

## Per adapter

| Adapter | Moves into the base or core | Also, this thread | Roughly |
|---|---|---|---|
| `localVaultDB` (core) | Expectation predicates shared; `noUnsubscribing` gone | `{ logger }`; "one tab" doc line (G272) | ~150 → ~135 lines |
| `idbVaultDB` | `expectations.ts` (73), `bell.ts` (99); `settle`'s null fallback | `logger` in `IdbVaultDBOpts` | ~536 → ~370 for the package |
| `postgresVaultDB` | `listBoxRecords` (15), the listening guard, `noUnsubscribing`, the copied message | `maxLockboxes` default `Infinity`, skipping the count CTE when unlimited (G285); listen failures logged; capped factory gets `listen` (G523); three cap tests trimmed, naming lines 4.3 and 4.4 (G519); README lines (G292, G286) | 420 → ~385 |
| `graphqlVaultDB` + resolvers | `storageTrouble`, `noUnsubscribing`, `ServedVaultDB`'s extra member | Default `Infinity` (G285); `extensions.code` `BAD_USER_INPUT` or `GRAPHQL_VALIDATION_FAILED` → `bad_option` (G303); a throwing `vaultDBFor` crosses as `bad_option` with a generic message, the original kept as the server-side `cause` (G304); a subscription error is logged **and** calls `onChange` (line 6.2); README lines (G300, G305) | 452 → ~440 (see Risks) |
| `convexVaultDB` + component | Once-guard; the cause on its own kinds | `{ logger }`, watch `onError` logged; component `updateBundle` lands only when `bundle.vault_id === standing.vault_id` and `bundle.unlock_epoch > standing.unlock_epoch`, else `false` → `stale_write`, matching Postgres's `vault_id` term (G247); G240's test trims; a test that fails when `convex` moves off the 1.46 protocol the fake socket follows (G250); README and comment lines (G246, G248, G252, G254, G258) | Client ~229 → ~220; tests shrink most |

Closed by a doc line as built: G268, G286, G290, G291's neighbour G292, G233 (one sentence under VAULTDB.md 5.4: identity is the backend's seam), G491 (a quota refusal is `storage_unavailable` with the DOMException as cause), and the Convex lines above. G523's other two bullets: `MapVaultDB` counts with a filter, not a copy, and the IndexedDB stray-field check becomes a battery line, since the base check now applies to every adapter.

## Battery and contract

- `describeVaultDB`'s factories take `VaultDBOpts`, so the battery can pass a spy logger. A new line under 6.1, for adapters that push: a throwing listener leaves the write resolved, the other listener called, and one `error` logged.
- Lines under 1.3 and 2.3 for `listBoxRecords`: whole, damaged records included, no ciphered fields.
- VAULTDB.md's *Who does what* gains the base's subscribe guard and `listBoxRecords`. No new numbered line, so `VaultDBContract` is unchanged.

## Build order

Cut from 4's restacked tip, after 13 if it has merged. `pnpm justify` must be green at every step.

1. **Core.** `VaultDBOpts` and the logger, `Refusals`, the subscribe guard, `listBoxRecords`, the G149 tidy, `Expectations`. Move `localVaultDB` and `MapVaultDB` onto them. Battery changes land here, green on `localVaultDB`.
2. **Bell.** `ChangeBell` into core; `idb.ts` uses it (G270).
3. **IndexedDB.** `Expectations`, `ChangeBell`, `logger`; delete `expectations.ts` and `bell.ts`.
4. **Postgres.** Then 5. **GraphQL** (it serves Postgres in its tests). Then 6. **Convex**, client then component.
7. READMEs, VAULTDB.md, `notes/security.md` (`reportError`; the adapter keeping its own logger; Convex dropping every cause), the changeset, the row report.

## Public surface (changeset: minor, five packages)

- **safebyok**
  - `VaultDB(opts?: VaultDBOpts)`, a protected `logger`, the public `listBoxRecords`.
  - `subscribe` now catches listener failures, and its unsubscribe runs once.
  - New exports: `Refusals`, `Expectations`, `VaultDBOpts`; `localVaultDB(store, opts?)`; `ChangeBell` from `safebyok/idb`.
  - `safebyok/testing`: the factories take `VaultDBOpts`, plus the new battery lines.
- **safebyok-indexeddb**
  - `IdbVaultDBOpts.logger`.
  - Adopts the 3.8 comparison, if thread 13 had not already.
- **safebyok-postgres**
  - `PostgresVaultDBOpts.logger`.
  - `maxLockboxes` default `Infinity` (was 1000).
  - `PostgresVaultDB` type dropped or aliased.
- **safebyok-graphql**
  - `GraphqlVaultDBOpts.logger`.
  - Default `Infinity`.
  - `ServedVaultDB` is any VaultDB.
  - Validation errors become `bad_option`.
  - A setup error's message no longer crosses the wire.
  - A failed subscription calls `onChange`.
- **safebyok-convex**
  - `convexVaultDB`'s third argument, `{ logger }`.
  - Its own refusals carry no cause.
  - The component refuses a changed `vault_id` or a non-increasing `unlock_epoch` as a failed expectation.

## Opens for the Coach

1. **The logger option's name.** Default: `logger`.
2. **`ShelfVaultDB`.** A core base where a key-value connector writes only `onShelf(mode, work)`, with reads, puts and erases inside one atomic step, and the base writes all seven hooks. It would fold `localVaultDB` (~40 lines) and `idbVaultDB` (~50) into it, and turn the IndexedDB README's "copy this" into "extend this". It needs `localVaultDB` serialized by a three-line promise chain, which is a hand-roll needing your yes. Default: **not this sprint**; `Expectations` is the part built now.
3. **`PostgresVaultDB`.** Dropped or aliased? Default: dropped.

## Risks

- **Errors reported twice in browsers.** With the console fallback, `reportError` and the logger both print. That is accepted, since `reportError` is what dev overlays catch.
- **jsdom tests.** jsdom implements `reportError` as a window `error` event, which vitest may count as an unhandled error. Tests that throw on purpose spy on it.
- **GraphQL may not get shorter.** It gains G303, G304, 6.2 and the logger. The acceptance line ("every adapter is shorter") is met by the package as a whole, through the resolvers.
- **Restack conflicts.** `vault-db.ts` is touched by threads 1, 4, 13 and this one. If the restack finds a shape other than the one assumed, follow its shape and report it.
- **Postgres's `Infinity` path.** It skips the count, so the capped tests must keep passing a number.
- **GraphQL calling `onChange` on error.** If a server errors in a loop, the vault refreshes in a loop. The vault's single-flight refresh (thread 4) bounds it.

## Critical files for the build
- /workspace/byok-push_to_100_a/packages/safebyok/src/vault-db.ts
- /workspace/byok-push_to_100_a/packages/safebyok/tests/test-helpers.ts
- /workspace/byok-push_to_100_a/packages/safebyok-indexeddb/src/idb-vault-db.ts (with bell.ts and expectations.ts beside it)
- /workspace/byok-push_to_100_a/packages/safebyok-postgres/src/postgres-vault-db.ts
- /workspace/byok-push_to_100_a/packages/safebyok-graphql/src/vault-resolvers.ts and graphql-vault-db.ts
- /workspace/byok-push_to_100_a/packages/safebyok-convex/src/convex-vault-db.ts and component/vaults.ts
