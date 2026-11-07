# Thread 4: graphql_schema (2026-11-07)

Branch `20261107-graphql_schema`, PR #571, stacked on #569 (thread 2, `20261107-idb_devicedb`). Status: **ready**,
milestones 1-4 built. Justify green (with `SAFEBYOK_PG_URL` set): core 2,365, indexeddb 107 (2 skipped), postgres 123
(1), convex 227, fastkey 49, graphql 224 (3), e2e 298 (4), react 326.

Authority: the Coach's rulings in `vaultdb_cleanup-plan.md` *8. graphql_schema* (on `origin/20261106-vaultdb_cleanup`)
and `devicedb_idb-plan.md` *4. graphql_schema*. Milestones 1 to 3 in detail: `thread-4-graphql_schema-m1m2.md`.

* **Built, milestone 1** (`3f4f21bf7`): the core's `VaultDBVerbs` interface, which `VaultDB` implements; the answer
  checkers (`shapes-answers.ts`, from `safebyok/storage`); the battery over any `VaultDBVerbs`, with `_cheat_storeOf`.
* **Built, milestone 2** (`30f02f3ce`, `349295716`): the typed schema (`vault-schema.ts`), the resolvers calling the
  hosted store's `try*` verbs behind the user_id gate (`vault-resolvers.ts`), the documents (`vault-operations.ts`),
  and the core's `VaultDB.relay` retired.
* **Built, milestone 3** (`b43fbf15d`, `4e686715e`): `GraphQLVaultDB` a class implementing `VaultDBVerbs` over urql,
  parsing inputs with the core's checks and answers with AX, dropping `__typename` by path, resubscribing a watch
  after 1s; `IsVaultDB` exported; damaged rows keep their stored label. In detail in the side file.
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
* **Built, milestone 4** (`0f5644d7d` to the changeset commit):
  * **Drift test** (`packages/safebyok-graphql/tests/vault-schema.test.ts`): walks each root field's answer against its
    AX checker, and each input object against the core check `GraphQLVaultDB` parses it with, through zod 4's `_zod.def`
    (past nullable, default, pipe and array; a union's options; null literals dropped) and graphql's type objects (a
    union's members). A schema type must hold exactly its check's fieldnames. Tests prove it catches a missing field,
    an extra field, an object for a scalar, and a field gone from one member of a union; a coverage test names every
    root field and input argument, so a new operation fails until it is listed.
  * **e2e** (`e2e/tests/graphql/`): the battery over real sockets to Yoga servers (`yoga.requestListener` on
    `node:http`, port 0) hosting PostgresVaultDBs over a real Postgres, run under `describeOnPostgres('graphql', ...)`
    (skipped without a PG URL, like the Postgres suite). Plus: a watch hears another server's writes, a 9000-char
    sidecar included; a stopped watch ends the server's listen; the user_id gate refuses another user, or none. The
    signed-in user rides an `x-test-user` header the browser's fetch sets per operation.
  * **READMEs**: core and GraphQL say a host vacates its bank and makes another when the signed-in user changes. The
    GraphQL README is rewritten where it described the relay: operations are the verbs, `new GraphQLVaultDB({ client })`
    alone, deploy the halves together, who reaches which bank, what crosses the wire.
  * **Stale relay prose**: STYLE.md's wire paragraphs; `storageTroubleOf`'s doc example in `refusals/outcome.ts`;
    `notes/security.md`'s 20261026-reads entry, amended by a sonnet subagent per the file's header.
  * **Doc blocks** in `packages/safebyok-graphql/src` cut to one line of purpose; two SDL descriptions lost a second clause.
  * **Changesets**: both name nothing reading an older release; the GraphQL one names each breaking change (schema,
    `safebyokTidyGone`/`safebyokHeard`, `VaultFieldArgs`, `GraphQLVaultDB` not a `VaultDB` and `{ client }` alone),
    the new exports, deploying both halves together, and the vacate rule.
* **Decisions taken** (milestone 4):
  * **The drift test walks inputs too**, not only AX: the same walk, and the record and option inputs drift as easily.
  * **A check field holding only null may be absent from the schema** (listVaults' `dbhas`, which its default fills).
  * **SafebyokJson is not walked into**: it carries a sidecar, a damaged row or `meta` whole.
  * **e2e beside the Postgres e2e**, reusing its helpers, rather than an in-memory store: real sockets, real SSE, real
    LISTEN/NOTIFY across two servers.
* **Discoveries** (milestone 4): `createServer(yoga)` trips `no-misused-promises`; `yoga.requestListener` does not.
  Closing a server needs `closeAllConnections()` first, or an open SSE stream holds `close()`.
* **Incident**: a broad `rg -i relay` over `notes/*.md` printed two lines of `notes/security.md` (around 323 and 328)
  to me before I had excluded it. Nothing more of it was opened; the edit went through the subagent.
* **For the Coach**, each a two-way call, my recommendation first:
  * **Older GraphQL entries in `notes/security.md`** (2026-10-22 wire_meta, 2026-10-15) may still describe the old
    wire; only the 20261026-reads entry was amended. A sonnet follow-up, or leave them as history.
  * **`TODO.md`** lines 22 and 29 still speak of relaying. Untouched: outside the thread's files.
  * Milestones 1-2: interface name `VaultDBVerbs`; tidyGone off the wire; refuse, don't strip; `unexpected_error`
    for wire failures; `_cheat_storeOf`; `SafebyokEpochMillis`; hand-rolled scalars; explicit null opts refused;
    type errors as GraphQL errors; no cause in host logs. Keep each.
  * **Resubscribe delay**: built as planned, a fixed 1s behind `afterAPause`; or resubscribe at once, with no timer
    (a one-line change).
  * **`maxRecordBytes` off the client**: keep; or accept it and ignore it, sparing hosts a breaking change.
  * **Brand-getter lint**: keep the `eslint-disable-line`; or set `getters` in the graphql eslint config.
