# Thread 5: port_graphql (2026-11-06)

Branch `20261106-port_graphql`, rebased onto thread 4's `20261106-port_postgres` at b72a514b6 (PR
#561); no PR of its own (the orchestrator's instruction). Justify: green, every package
(safebyok-graphql 208 pass, 1 skipped; core 2271; postgres 114; e2e 206).

* **Built**
  * **Core, pulled forward**: `VaultDB.relay` (a getter) and the type `VaultDBRelay` in
    `packages/safebyok/src/storage/vault-db-new.ts`, exported from `safebyok/storage`. Each relay call
    checks its input as its verb does (scopes, records, put/del opts, `demandNextSeq`, `maxRecordBytes`
    for a box), then calls the protected `do*` hook; a throw that is no VaultError becomes
    `storage_unavailable`. Inputs are typed `unknown`, as the relay carries wire input. Tests in
    `tests/storage/vault-db-new.test.ts`, *its relay*.
  * `packages/safebyok-graphql/src/vault-schema.ts`: `VaultSchemaSdl`, fresh. One JSON scalar
    `SafebyokJson` carries rows, records and opts whole; scopes are typed arguments. One root field per
    `do*` hook; `safebyokHeard` is a subscription answering a `Heard` as one JSON value (its `box` key
    absent for a vault notice, which the base `watch` needs).
  * `src/vault-resolvers.ts`: `vaultResolvers({ vaultDB, userIdOf })` over `vaultDB.relay`. The gate:
    each operation's `user_id` (the argument, or the record's or tombstone's) must equal
    `await userIdOf(context)`; signed out or another user refuses `identity_revoked`. A refusal crosses
    as a GraphQLError with the VaultError's message and `extensions: { kind, capacity?, fieldnames? }`,
    never the cause (the refusal rides as an unenumerable `cause`, for server logs). A host throw from
    `userIdOf` crosses as `unexpected_error`. The subscription iterator is a ReadableStream read
    through a reader, unbounded (`highWaterMark: Infinity`), its cancel stopping the watch.
  * `src/graphql-vault-db.ts`: `class GraphQLVaultDB extends VaultDB`, `new GraphQLVaultDB({ client,
    maxRecordBytes? })`; exports `VaultOperations` (the documents, for allowlists). Envelopes are checked
    (`record_conflict` when the server answers another shape); rows inside are left for the base class.
    Error tree: a GraphQL error whose `extensions` parse as a sent refusal becomes that VaultError;
    anything else (network, a foreign GraphQL error, Yoga's mask) is `storage_unavailable`, urql's
    error its cause.
  * Tests:
    * `graphql-vault-db.test.ts`: the battery over the client, in-process (urql's execute exchange) to
      the resolvers over a PostgresVaultDB on PGlite, `makeTwin` a second Client; `failNext` arms a
      `mapExchange` network failure.
    * `vault-resolvers.test.ts`: the gate (u2 and signed-out, queries, mutations, the subscription),
      no leak of a driver's or `userIdOf`'s error text, server-side `box_too_large` and `bad_option`,
      `vault_full` capacity crossing, opts refusals, and the SDL (10 `safebyok*` root fields, every
      `VaultOperations` document valid).
    * `yoga-recipe.test.ts`, fresh: the README's route (Yoga, header for session) and browser half
      (`fetchExchange`, `fetchSubscriptions`), running the battery over HTTP and SSE; the gate over
      HTTP; the driver's error unsent even with `isDev`; the server's LISTEN released when the browser
      stops watching (an aborted fetch cancels the body, as a network does).
    * `exports.test.ts`: each entry point exports its own half alone.
    * `test-helpers.ts` re-exports `safebyok/testing`, so tests star-import it as `TH` (thread 4's form).
  * `README.md` rewritten fresh (the recipe, who reaches which bank, what crosses the wire);
    `.changeset/20261106-port_graphql.md` (safebyok-graphql minor, safebyok minor for `relay`).
  * `fields.ts` and its test deleted, with VOCABULARY.md's exception and TODO.md's item about its
    `'plain'` class.

* **Decisions taken**
  * Resolvers reach `do*` through a core relay, not by casting to protected members nor by relaying
    the public verbs (which answer summaries and lose `ante`). It also means the server enforces what
    the client's verbs check.
  * One VaultDB serves every request (`vaultDB`), the gate in `userIdOf`: PostgresVaultDB no longer
    takes a per-request user. A `mayReach(context, scope)` predicate was set aside as more than the
    single-user bank needs today.
  * `vault_full`'s capacity is safeParsed by `SX.capacity` before crossing, so `Infinity` (no byte limit)
    crosses as `Number.MAX_SAFE_INTEGER`; a capacity that will not parse is left off rather than turning
    the refusal into `storage_unavailable`.
  * The battery's Client signs each operation in as the user its variables name, so the gate stays on.

* **Discoveries**
  * Zod 4's `unknown()` in an object requires the key: `box: unk.optional()` for a vault notice.
  * The vitest config resolves `safebyok` from `dist`: run `pnpm build:deps` before `vitest` by hand.
  * urql 6 sends a query by GET (`preferGetMethod: 'within-url'`): a test fetch reading the body for
    variables must read the URL too.
  * An in-process fetch does not cancel the response body when urql aborts; without the test's
    `overTheNetwork`, a stopped watch never releases the server's LISTEN.
