# Thread 4: graphql_schema (2026-11-07)

Branch `20261107-graphql_schema`, PR #571 (draft), stacked on #569 (thread 2, `20261107-idb_devicedb`). Status:
**blocked after milestone 2**, as the handoff asked; milestones 3 (client) and 4 (finish) go to a fresh worker. Justify
green: core 2,364, indexeddb 107 (2 skipped), postgres 123, convex 227, fastkey 49, graphql 18 (196 skipped, below),
e2e 200, react 326.

Authority: the Coach's rulings in `vaultdb_cleanup-plan.md` *8. graphql_schema* (on `origin/20261106-vaultdb_cleanup`)
and `devicedb_idb-plan.md` *4. graphql_schema*.

* **Built, milestone 1** (`3f4f21bf7`, `packages/safebyok`):
  * **`VaultDBVerbs`** (`src/storage/vault-db-new.ts`): the brand plus each plain and `try*` front verb;
    `VaultDBVerbnames` lists them; `abstract class VaultDB implements VaultDBVerbs`. `tidyGone` stays on the store.
    `brandedVaultDB` asks for the brand and every verb; `BankOpts.vaultDB` and the listings take `VaultDBVerbs`.
  * **Acts as enums** in `shapes-enums.ts`; `ListAct` exported.
  * **Answer checkers `AX`** (`src/shapes/shapes-answers.ts`, from `safebyok/storage`): one per front verb,
    `crossedNotice`, `crossedErr` (`{refusalkind, message, meta: {capacity, fieldnames, call} | null}`),
    `crossedReqParams`, `damagedVault`, `damagedBox`. Strict; null stands for absent; a failure is `unexpected_error`.
  * **The battery over any `VaultDBVerbs`**, with the hook `_cheat_storeOf(vaultDB) => VaultDB`.
* **Built, milestone 2** (`30f02f3ce`, `349295716`):
  * **The schema** (`safebyok-graphql/src/vault-schema.ts`, `VaultSchemaSdl`): every name starts `Safebyok`. Queries
    `safebyokListVaults`, `GetVault`, `ListBoxes`, `GetBox`. Mutations `PutVault`, `PutBox`, `ReplacePassphrase`,
    `AddPasskey`, `RevokePasskey`, `DelBox`, `DelVault`. Subscription `safebyokWatch(applabel, user_id, vaultlabel)`.
    Scalars `SafebyokJson` (sidecar, `damaged_rows`, `err.meta`) and `SafebyokEpochMillis`. Typed row types,
    unions `SafebyokVaultRow`/`BoxRow`/`Row`, typed inputs, `SafebyokRefusalkind` drawn from `refusalkindVals`.
    The answer types carry `{ok act val world dbhas req_params err}`, with `err` a field and `act` a String.
  * **The resolvers** (`vault-resolvers.ts`, `vaultResolvers({vaultDB, userIdOf})`): each runs the user_id gate (the
    scope's user_id equals `userIdOf(context)`, else `identity_revoked`; a throwing `userIdOf` is `unexpected_error`),
    calls the hosted vaultDB's `try*` verb, and returns the whole answer. `err.meta` is rebuilt from capacity,
    fieldnames and call; no cause crosses. The watch re-runs the gate before each notice, and on a failure yields one
    `identity_revoked` notice and ends, releasing the store's listen. A watch refused at the start (gate or bad scope)
    yields one bad notice and ends. Exported types: `CrossingAnswer`, `CrossingNotice`, `VaultFieldArgs` (a map by
    field name), `VaultFieldResolver`, `VaultResolvers`, `VaultResolversOpts`.
  * **The documents** (`src/vault-operations.ts`, `VaultOperations`): one per root field, fragments only as used, no
    `__typename`. Not yet exported: `src/index.ts` still exports the old client's own `VaultOperations`.
  * **Relay retired**: `VaultDB.relay`, `VaultDBRelay` and their tests are gone from the core; breaking line in
    `.changeset/20261107-graphql_schema.md`. The graphql line is `.changeset/20261107-graphql_schema-2.md`.
  * **Tests** (`tests/vault-resolvers.test.ts`, 15): each verb's answer deep-equals the store's own `try*` answer once
    through JSON and the core's AX; the gate on all 11 operations; refusals with their meta and no cause; the watch,
    revoked mid-way; the schema's root fields, every document validated, the time scalar.
* **Skipped until milestone 3**, each with a comment naming it: `tests/graphql-vault-db.test.ts`'s battery
  (`describe.skip`); `tests/yoga-recipe.test.ts`'s browser half (`describe.skip`) and two of its tests (`it.skip`).
  `GraphQLVaultDB` still sends the old operations. Four `vitest/no-disabled-tests` warnings, no suppressions.
* **Decisions taken**:
  * **Interface `VaultDBVerbs`, class `VaultDB` kept**; set aside: renaming the class, churning five packages.
  * **`tidyGone` is off the interface and the wire**, by "exactly (and pretty much only) the front-end verbs".
  * **Per-verb answer checkers**; unknown fields refused, not stripped; the wire error field is `refusalkind`.
  * **Typed inputs**: a malformed type (a string `revision_seq`, an unknown field) is GraphQL's own validation error,
    never reaching the store; a bad value in a String field (`am: 'q'`) is the store's `bad_option` in `err`.
  * **Opts fields nullable, no SDL defaults**: absent means the store's default; an explicit null is `bad_option`.
  * **Scalars hand-rolled on graphql's own `GraphQLScalarType`**, with v17's `coerce*` keys. Set aside:
    `graphql-scalars`, a new dependency. On graphql 16 the coerce keys are ignored: Json still works, EpochMillis
    goes unchecked, and the core checks every field anyway.
* **Deviations**:
  * **`SafebyokEpochMillis`**, not the plan's `EpochMillis`, keeping every schema name under `Safebyok`.
  * **A refusal's cause no longer reaches the host's logs** through the resolvers; the old relay surfaced it.
  * Milestone 1 removed a stale `eslint-disable-line` on the brand getter.
* **Discoveries**:
  * A `ReadableStream`'s own async iterator `return()` waits on a pending `next()`; the watch reads through a reader,
    whose `cancel()` ends it at once.
  * `makeExecutableSchema` and yoga's `createSchema` take scalar instances and `__resolveType` in the resolver map.
  * Stale prose on the relay, left for milestone 4: `STYLE.md` 627-631 ("its GraphQL relay carries");
    `outcome.ts`'s doc example ("a server relaying a verb"); `notes/security.md` around 323-328 (relayed records,
    `__typename`), which only a sonnet subagent edits.
* **What remains**:
  * **3. Client**: `GraphQLVaultDB` as a class implementing `VaultDBVerbs`, over urql, sending
    `src/vault-operations.ts`'s documents and parsing each answer with AX. Export the new `VaultOperations` from
    `src/index.ts` and delete the old one. urql's cacheExchange adds `__typename` and does not export
    `maskTypename`: drop it by explicit paths, never a deep strip (a sidecar key could be `__typename`). A GraphQL
    error is `unexpected_error` with its cause; a network failure `storage_unavailable`. Resubscribe after a stream
    ends (`resubscribeMillis`, about 1000), except after `identity_revoked`. Un-skip the tests above.
  * **4. Finish**: a drift test walking AX against the schema; the battery over GraphQL, `_cheat_storeOf` naming the
    server's store; yoga and e2e; READMEs (the host vacates a bank on any user_id change); the stale relay prose;
    GraphQL's doc blocks; the changesets' client lines.
* **For the Coach**, each a two-way call, my recommendation first:
  * **Interface name** `VaultDBVerbs`: keep.
  * **tidyGone off the wire**: keep it off.
  * **Refuse, don't strip** unknown fields at the client: keep.
  * **Wire failure kind** `unexpected_error`, rather than a new refusalkind: keep.
  * **`_cheat_storeOf`** as the battery's hook: keep.
  * **`SafebyokEpochMillis`** over `EpochMillis`: keep the prefix.
  * **Hand-rolled scalars** over `graphql-scalars`: keep; ~30 lines on graphql's own API.
  * **Explicit null opts refused** as `bad_option`: keep; or map null to absent in the resolver.
  * **Type errors are GraphQL errors** before the store: keep; they are a client's bug, not a refusal.
  * **No cause in host logs**: accept for now; a later `onRefusal` opt could log one server-side.
  * **`__typename` dropped by path** and **resubscribe about 1s**: as planned.
