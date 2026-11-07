# Thread 4: what milestones 1 to 3 built, in detail (2026-11-07)

For whoever reworks the core's `VaultDBVerbs`, the answer checks, the schema or the resolvers; the thread file
`thread-4-graphql_schema.md` has the summary.

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

## Milestone 3: GraphQLVaultDB

* **Built, milestone 3** (`b43fbf15d`, `4e686715e`):
  * **`GraphQLVaultDB`** (`src/graphql-vault-db.ts`) is a class implementing `VaultDBVerbs`, no longer extending
    `VaultDB`. Each `try*` verb parses its inputs with the core's own checks (so its refusals match a store's:
    `bad_scope`, `bad_option`, fieldnames), sends `VaultOperations`' document (queries `network-only`), drops
    `__typename` by path, and parses with the AX checker. A refusal gets `{call, req_params}` in its meta, as the
    base class's do. The plain verbs are `goodAnswerOf(await this.tryX())`.
  * **Errors**: a CombinedError with a `networkError` is `storage_unavailable`; one with GraphQL errors, or data
    missing the field, is `unexpected_error` (`SchemaNotServed`), no cause (G304).
  * **`__typename`**: `dropTypename(bag, nested)` drops a selection's own and recurses only into the fields each
    selection names (gate, wayins, ciphered fields, listing rows, `req_params.prior`, `err`). Never into a sidecar,
    `damaged_rows` or `meta`. A test round-trips a sidecar holding `__typename`.
  * **Watch**: heeds each result whose `data` differs from the one before (fetch's closing result repeats it);
    when a result has `hasNext: false` and the watch is neither stopped nor revoked, resubscribes after
    `afterAPause` (a private helper, `ResubscribeMillis = 1000`). `identity_revoked` ends it for good.
  * **`VaultOperations`** exported from `src/vault-operations.ts`; the old copy, `answers` and `refusalSent` deleted.
  * **Core**: `IsVaultDB` exported from `safebyok/storage`, since an outside implementer needs the brand.
    `damagedVault`/`damagedBox` take any string label: a damaged row may be listed under a label failing the check.
    That was a milestone 1 bug that un-skipping the battery found. It has a test in `shapes-answers.test.ts`.
  * **Tests**: both batteries run end to end over GraphQL (in-process executeExchange, and the yoga recipe over
    fetch), with `_cheat_storeOf` naming the server's PostgresVaultDB. New: the sidecar case; a GraphQL error; a
    foreign schema; a refusal before sending; the watch's resubscribe, revoke and stop (a fake client and fake timers).
  * **Changesets** brought up to date: the client line, `maxRecordBytes` breaking, the `IsVaultDB` export, damaged labels.
