# Thread 5: port_graphql (2026-11-06)

Branch `20261106-port_graphql`, cut from thread 4's `20261106-port_postgres` (PR #561); no PR of its own
(the orchestrator's instruction). Justify: in progress; the battery is green over the client (98 tests).

* **Built**
  * **Core, pulled forward**: `VaultDB.relay` (a getter) and the type `VaultDBRelay` in
    `packages/safebyok/src/storage/vault-db-new.ts`, exported from `safebyok/storage`. Each relay call
    checks its input as its verb does (scopes, records, put/del opts, `demandNextSeq`, `maxRecordBytes`
    for a box), then calls the protected `do*` hook, a throw that is no VaultError becoming
    `storage_unavailable`. Inputs are typed `unknown`: the relay carries wire input. Tests in
    `tests/storage/vault-db-new.test.ts`, *its relay*.
  * `packages/safebyok-graphql/src/vault-schema.ts`: `VaultSchemaSdl`, fresh. One JSON scalar
    `SafebyokJson` carries rows, records and opts whole; scopes are typed arguments. One root field per
    `do*` hook; `safebyokHeard` is a subscription answering a `Heard` as one JSON value (its `box` key
    absent for a vault notice, which the base `watch` needs).
  * `src/vault-resolvers.ts`: `vaultResolvers({ vaultDB, userIdOf })` over `vaultDB.relay`. The gate:
    each operation's `user_id` (the argument, or the record's or tombstone's) must equal
    `await userIdOf(context)`; signed out or another user refuses `identity_revoked`. A refusal crosses
    as a GraphQLError with the VaultError's message and `extensions: { kind, capacity?, fieldnames? }`,
    never the cause (which rides as an unenumerable `cause` for server logs). A host throw from
    `userIdOf` crosses as `unexpected_error`. The subscription iterator is a ReadableStream read
    through a reader, unbounded (`highWaterMark: Infinity`), its cancel stopping the watch.
  * `src/graphql-vault-db.ts`: `class GraphQLVaultDB extends VaultDB`, `new GraphQLVaultDB({ client,
    maxRecordBytes? })`; exports `VaultOperations` (the documents, for allowlists). Envelopes are checked
    (`record_conflict` when the server answers another shape); rows inside are left for the base class.
    Error tree: a GraphQL error whose `extensions` parse as a sent refusal becomes that VaultError;
    anything else (network, a foreign GraphQL error, Yoga's mask) is `storage_unavailable`, urql's
    error its cause.
  * `fields.ts` and its test deleted; the old tests replaced.
  * `tests/test-helpers.ts`: PGlite helpers copied from safebyok-postgres's; the battery's Client signs
    each operation in as the user its variables name (`signedInAsAsked`), so the gate stays on.
    `failNext` arms a `mapExchange` that turns the next query/mutation result into a network error.

* **Decisions taken**
  * Resolvers reach `do*` through a core relay, not by casting to protected members nor by relaying
    the public verbs (which answer summaries and lose `ante`). It also means the server enforces what
    the client's verbs check.
  * One VaultDB serves every request (`vaultDB`), the gate in `userIdOf`: PostgresVaultDB no longer
    takes a per-request user.
  * `vault_full`'s capacity is parsed by `SX.capacity` before crossing, so `Infinity` (no byte limit)
    crosses as `Number.MAX_SAFE_INTEGER`, which the core's checker gives anyway.

* **Discoveries**
  * Zod 4's `unknown()` in an object requires the key: `box: unk.optional()` for a vault notice.
  * The vitest config resolves `safebyok` from `dist`: run `pnpm build:deps` before `vitest` by hand.
