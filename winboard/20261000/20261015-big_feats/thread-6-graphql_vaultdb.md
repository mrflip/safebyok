# Thread 6: graphql_vaultdb (2026-10-15)

Branch `20261015-graphql_vaultdb`, PR [#78](https://github.com/mrflip/safebyok/pull/78), stacked on [#73](https://github.com/mrflip/safebyok/pull/73) (thread 5, tip `39fcfaa`), which stands on
[#76](https://github.com/mrflip/safebyok/pull/76), then [#71](https://github.com/mrflip/safebyok/pull/71): merge in order #71, #76, #73, #78. Built on
#73's earlier tip `d55eb9c`, restacked at the Coach's word without conflict. Justify green: core
804, convex 272, postgres 132, react 47, graphql 140, demo 61, root 105.

* **Built**: `packages/safebyok-graphql/`, packaged like `safebyok-postgres` (ESM+CJS, tsdown-written
  `exports`, its own eslint cut from the core's, README, changeset, a place in the `fixed` group).
  - **Two entry points.** `safebyok-graphql` is the browser's half, `graphqlVaultDB(client)`;
    `safebyok-graphql/server` the server's, `VaultSchemaSdl` and `vaultResolvers({ vaultDBFor })`.
    `typesVersions` for `./server`, as the core has for its subpaths (attw's node10 check).
  - `src/vault-schema.ts`: the SDL. One root field per VaultDB verb (`safebyokReadBundle` ...
    `safebyokEraseVault`) and `safebyokVaultChanged(scope)`, answering the scope. Every record an
    object type and an input type with a field per stored field; `SafebyokCiphered` for each
    encrypted value; the expectations as input types.
  - `src/fields.ts`: **the one field mapper**, shared by both halves. `BundleFields`,
    `LockboxFields`, `ScopeFields`, held to the records both ways by the compiler (thread 5's
    `everyFieldOf` trick); `selectionOf` builds the client's selection sets from them; `recordOf`
    rebuilds a record field by field (dropping `__typename`, a null note, strays).
  - `src/vault-resolvers.ts`: the resolver map over a **`ServedVaultDB`** (the VaultDB verbs plus
    `listBoxRecords`; `PostgresVaultDB` is one, nothing names Postgres). The subscription wraps
    `vaultDB.subscribe` in a web-standard `ReadableStream`.
  - `src/graphql-vault-db.ts`: the client, each verb one urql operation.
  - Tests: `describeVaultDB` twice -- over urql's execute exchange against graphql-tools'
    `makeExecutableSchema`, and over the README's Yoga recipe (`tests/yoga-recipe.test.ts`, Yoga
    over in-process fetch, subscriptions as server-sent events) -- both with `perUser` and PGlite
    behind. Plus the schema held to the core's record schemas, every client operation validated
    against the SDL, refusals, masking, causes, subscription lifecycle and coalescing.
* **Decisions taken**:
  - **`unlocks` is `[SafebyokUnlockEnvelope!]!`, a list of opaque JSON scalars**, not a union
    typed field by field. GraphQL has no input unions (`@oneOf` only from graphql 17), thread 3 is
    adding the passkey method beside us, and the Postgres column is one `jsonb`: an opaque envelope
    keeps the adapter a shelf, and a new method crosses with no change here. Ciphered values are a
    small object type. `passphrase_epoch` is `Int`; times are `Float` (epoch ms passes Int32).
  - **`graphql` is an optional peer of the server half, at runtime**, for `GraphQLError`: Yoga
    masks any other error as "Unexpected error" (the kind would be lost), and in development mode
    serializes the masked original's message, stack and `cause` to the browser. `@urql/core` is an
    optional peer used for types only: the client's built code imports nothing from it. Range
    `graphql ^16.3.0 || ^17.0.0` (the options-object constructor).
  - **A refusal crosses as a fresh GraphQLError** (message, `extensions.kind`); the VaultError is
    attached afterwards as an unenumerable `cause`. Passing it as the constructor's `cause` makes it
    the `originalError`, and Yoga masks it: checked by experiment, recorded in a comment.
  - **No logger option**: the cause stays on the server for the host's own error hooks.
  - Root fields `safebyok*`, types `Safebyok*`: everything lands in the host's namespace. The SDL
    defines `type Query` etc. (not `extend type`), which graphql-tools-based servers merge.
  - `graphqlVaultDB(client)` positional, as `convexVaultDB` is; every query `network-only`.
  - Subscription queue: `ReadableStream` (no dependency, no hand-rolled queue), **read through a
    reader** (the review's fix, `7d8b496`): the stream's own `values()` iterator queues `return()`
    behind a pending `next()`, so a subscriber leaving a quiet vault kept `vaultDB.subscribe` (and
    Postgres's LISTEN) alive until the next write; `reader.cancel()` ends the pending read at once.
    A change heard while one waits is dropped (`desiredSize`), which also makes a late `onChange`
    after cancel harmless.
  - The server reads a lockbox expectation with `revision_id` left out as null.
* **Deviations**:
  - `perUser` is copied from `safebyok-postgres`'s tests (it is not published). A candidate for
    `safebyok/testing`.
  - `vitest.config.ts` sets `ssr.resolve.conditions` to `['module', 'node']`: Vite's default
    `development` condition hands `src/` graphql's `__dev__` build while graphql-tools, urql and
    Yoga (loaded by Node) get the other, two realms. Test-only: a host's bundle is unaffected.
* **Discoveries**:
  - graphql 17's `mapAsyncIterable` asks an iterable for its iterator twice: a `ReadableStream`
    returned as is throws "locked". And its own iterator cannot be ended mid-read (above): hence
    the reader.
  - graphql 17 deprecates `originalError` for `cause`; the constructor's `cause` becomes it.
  - urql's `cacheExchange` adds `__typename` to every selection; `recordOf` drops it.
  - A listed record missing a non-null field would cross as a GraphQL non-null error, hence
    `storage_unavailable`, not `corrupt_record`. Postgres's NOT NULL columns rule it out; another
    ServedVaultDB could meet it.
  - Records on writes are validated only by the core's VaultDB (gripe_fixes' `vaultdb_validation`
    adds it); GraphQL checks every field's type but nothing inside an envelope.
* **At filing** (the orchestrator's YOLO calls): this file says the stream is read through a
  reader, and the README says the server half and the host's GraphQL server must share one copy
  of `graphql`, or every refusal is masked and its kind lost.
* **For the Coach** (open questions, also in the PR, beside the review's minor findings there):
  - `graphql` as a runtime (optional) peer of the server half: the plan allowed it only if truly
    needed; Yoga's masking is the need. Confirm.
  - Opaque JSON envelopes over a union type: confirm the call.
  - Untested: Apollo Server, Mercurius, graphql-ws (the README names them in prose only).
  - A failed subscription on the client is silent, as thread 5's rejected `listen` is.
  - `VaultOperations` (the client's documents) could be exported for hosts with persisted-operation
    allowlists; it is not, for now.
  - The `passphrase_epoch` rename follow-up (YOLO decision 2) now reaches this SDL too.
  - Safety hatches: non-null `!` in tests only (schema lookups and error lists); none in `src/`, no
    `eslint-disable`, no `@ts-expect-error`.
