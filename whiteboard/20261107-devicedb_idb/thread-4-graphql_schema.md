# Thread 4: graphql_schema (2026-11-07)

Branch `20261107-graphql_schema`, PR #571 (draft), stacked on #569 (thread 2, `20261107-idb_devicedb`). Status:
**blocked after milestone 3**, as the handoff asked; milestone 4 (finish) goes to a fresh worker. Justify green: core
2,365, indexeddb 107 (2 skipped), postgres 123 (1), convex 227, fastkey 49, graphql 218 (3), e2e 200 (2), react 326.

Authority: the Coach's rulings in `vaultdb_cleanup-plan.md` *8. graphql_schema* (on `origin/20261106-vaultdb_cleanup`)
and `devicedb_idb-plan.md` *4. graphql_schema*. Milestones 1 and 2 in detail: `thread-4-graphql_schema-m1m2.md`.

* **Built, milestone 1** (`3f4f21bf7`): the core's `VaultDBVerbs` interface, which `VaultDB` implements; the answer
  checkers (`shapes-answers.ts`, from `safebyok/storage`); the battery over any `VaultDBVerbs`, with `_cheat_storeOf`.
* **Built, milestone 2** (`30f02f3ce`, `349295716`): the typed schema (`vault-schema.ts`), the resolvers calling the
  hosted store's `try*` verbs behind the user_id gate (`vault-resolvers.ts`), the documents (`vault-operations.ts`),
  and the core's `VaultDB.relay` retired.
* **Built, milestone 3** (`b43fbf15d`, `4e686715e`):
  * **`GraphQLVaultDB`** (`src/graphql-vault-db.ts`) is a class implementing `VaultDBVerbs`, no longer extending
    `VaultDB`. Each `try*` verb parses its inputs with the core's own checks (so its refusals match a store's:
    `bad_scope`, `bad_option`, fieldnames), sends `VaultOperations`' document (queries `network-only`), drops
    `__typename` by path, and parses with the AX checker. A refusal gets `{call, req_params}` in its meta, as the
    base class's do. The plain verbs are `goodAnswerOf(await this.tryX())`.
  * **Errors**: a CombinedError with a `networkError` is `storage_unavailable`; one with GraphQL errors, or data
    missing the field, is `unexpected_error` (`SchemaNotServed`), the CombinedError its cause.
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
* **Decisions taken** (milestone 3):
  * **`goodAnswerOf`, not `valOf`**: a plain verb returns the whole `GoodAnswer`, and `valOf` returns only `val`.
  * **`GraphQLVaultDBOpts` is `{ client }` alone**: `maxRecordBytes` belongs to the server's store. The test helpers
    route `makeVaultDB(opts)` to the server. An `interface` with the `AssertEqual` check.
  * **Stream end by `result.hasNext`**, not wonka's `onEnd` (wonka is not a dependency). executeExchange never ends a
    subscription, so the resubscribe tests use a fake client.
  * **`signedInAsAsked`** also reads `params.user_id`, for the gate verbs.
* **Suppression**: one `eslint-disable-line @typescript-eslint/class-literal-property-style` on the brand getter.
  The graphql config keeps the rule's default `fields`, the core sets `getters`, and `device-db-new.ts` does the same.
  The alternative is to set `getters` in the graphql package's eslint config.
* **Deviations**: `SafebyokEpochMillis`, not `EpochMillis`; a refusal's cause no longer reaches host logs through
  the resolvers; `goodAnswerOf` in place of the handoff's literal `valOf`.
* **Discoveries**:
  * urql's `mergeResultPatch` keeps the previous `data` reference, so fetch's closing `{hasNext: false}` result
    repeats the last notice; skipping a repeated `data` reference handles it.
  * A `ReadableStream`'s async iterator `return()` waits on a pending `next()`; the server's watch reads through a
    reader.
* **What remains, milestone 4**:
  * A drift test walking AX against the schema.
  * e2e.
  * READMEs: the host vacates a bank on any user_id change; the yoga recipe's browser half (`browserVaultDB` no
    longer takes opts); `GraphQLVaultDB({ client })` alone.
  * Stale relay prose: `STYLE.md` 627-631 and `outcome.ts`'s doc example ("a server relaying a verb");
    `notes/security.md` around 323-328, which only a sonnet subagent edits.
  * GraphQL's doc blocks, to the current rules.
* **For the Coach**, each a two-way call, my recommendation first:
  * Milestones 1-2: interface name `VaultDBVerbs`; tidyGone off the wire; refuse, don't strip; `unexpected_error`
    for wire failures; `_cheat_storeOf`; `SafebyokEpochMillis`; hand-rolled scalars; explicit null opts refused;
    type errors as GraphQL errors; no cause in host logs. Keep each.
  * **Resubscribe delay**: built as planned, a fixed 1s behind `afterAPause`; or resubscribe at once, with no timer
    (a one-line change).
  * **`maxRecordBytes` off the client**: keep; or accept it and ignore it, sparing hosts a breaking change.
  * **Brand-getter lint**: keep the `eslint-disable-line`; or set `getters` in the graphql eslint config.
