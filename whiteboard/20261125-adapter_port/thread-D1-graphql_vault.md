# Thread D1: graphql_vault (2026-11-25)

Branch `20261125-graphql_vault`, PR #932, stacked on #914. Proved: `pnpm justify` green after the catch-up rebase;
safebyok-graphql 271 tests (the VaultDB battery, 113 cases each, over a MemoryVaultDB and over a PostgresVaultDB on
PGlite, through an in-process GraphQL server; the rest unit tests); core 2316; safebyok-postgres 135.

* **Built**:
  * **Core** (`packages/safebyok`, one commit): `src/shapes/shapes-crossed.ts` (`CrossedChecks`, `crossedErrOf`, moved
    from big's shapes-bank-answers); `vaultErrorOfCrossed` in `refusals/throwers.ts`; the classifier's
    `[Things crossed]` section (`crossedThingOf`, `crossedWrittenOf`, `crossedNamedOf`, `crossedTrackedOf`,
    `crossedRootsOf`, `crossedWorldOf`, `crossedListingOf`); `AdapterVaultDB.watch` passes `onEnded` to `doWatch` as an optional fourth
    argument (required, it broke safebyok-postgres's `super.doWatch(scope, receive, onBadNews)`);
    `safebyok/storage` exports these and the vals arrays (acts, flags, refusal kinds).
  * **`packages/safebyok-graphql`**, 0.5.0, public, in the `fixed` group, peer `safebyok`; CHANGELOG moved by `git mv`.
    * `src/vault-schema.ts`: `VaultSchemaSdl`, one operation per verb with its ask as one typed input; `safebyokJson`.
    * `src/vault-operations.ts`: `VaultOperations`, the documents, no `__typename`.
    * `src/vault-resolvers.ts`: `vaultResolvers({ vaultDB, getUserId })` over any vaultDB.
    * `src/graphql-vault-db.ts`: `GraphQLVaultDB extends AdapterVaultDB`, opts `{ client }`.
    * `src/shapes/shapes-wire.ts`: `WireAnswer`, `WireNotice`, `WireChecks` (the client's envelope checks).
    * `README.md`: the two halves, who reaches which bank, what crosses the wire, a watch's ending.
    * `tests/`: helpers (in-process urql Client over `executeExchange`, with urql's `cacheExchange`); the battery over
      memory and over PGlite, each with a test that a write over the wire lands in the server's store;
      `graphql-vault-db.test.ts` (the client against a fake Client: error mapping, crossed refusals, the watch);
      `vault-resolvers.test.ts` (wire form equals the `try*` answer, sign-in, the err allowlist, the watch's endings);
      `vault-schema.test.ts` (the drift walk: every typed input and answer against the core check that reads it, with
      negative cases); `exports.test.ts`.
  * **`notes/security.md`**: one entry, the err allowlist, the sanitized network cause, and the sign-in check.

* **Decisions made**:
  * **The client rebuilds the report a datastore would make.** Each `do*` reads the envelope (`WireChecks`, refusing
    `storage_issue`), then the Things through the classifier's `crossed*` checks against its own ask, so the base class
    makes the answer as for any datastore. A refused answer whose `tracked` is `'unread'` came from a verb that threw: its
    refusal is thrown again (`vaultErrorOfCrossed`, with the answer's act and the Thing it names, checked by
    `crossedNamedOf`), and `answerForThrown` answers it. Any other refused answer must carry a classifier act
    (`refusedActVals`; for a listing `void` or `gone`), else `storage_issue`; the base class makes its error from the act,
    the same error the server made.
  * **SDL**: enums for the flags, the modelkind, the storage policy and the refusal kind, from the core's vals; acts and
    `op` stay `String`. Stats are `Float` (`StoreLimitCap` passes a 32-bit Int). A refusal's `capacity` stays
    `SafebyokJson`. No GraphQL interface: the answer fields repeat per type from one TS string.
  * **Watch end is marked on the wire.** `SafebyokNotice` has `ended: Boolean!`: the server sets it on the bad news
    that follows its vaultDB watch's `onEnded`, and on the `identity_revoked` notice when a session is revoked mid-watch
    (Q5); then it closes the stream. The client ends at that notice: `onEnded()`, then `onBadNews(why)`, keeping
    `VaultDB.watch`'s promise that `onEnded` comes before the news that says why. Other bad notices go to `onBadNews`
    and the watch goes on. A stream that closes without one ends with `watchEnded()` (`storage_unavailable`).
    The client tells an ending in a microtask: urql can end a stream inside `subscribe()`, before `watch` returns, and
    `VaultDB.watch` promises `onEnded` comes after `watch` returns.
  * **graphql-js input objects** have a null prototype; the resolvers copy the ask (and its options) into plain objects
    before handing them to the vaultDB.
  * **A GraphQL error is `unexpected_error`** (`serverErred`, no cause, so a variable-coercion message quoting the record
    never reaches the caller), as big did and the design said. A network failure is `storage_unavailable`.

* **Set aside**:
  * A `storageCallRefused` wrapper around every server error: Q6 says not to catch to rethrow as mystery storage issues.
  * A typed SDL for records, tracks and `tracked`: Q1 keeps them `SafebyokJson`; the drift test skips them.
  * A required `onEnded` on the base `doWatch`: it broke safebyok-postgres's call; optional costs nothing.
  * Two battery files with no test of their own (lint's `no-empty-test-file`): each now proves the wire reaches its store.

* **Deviations**:
  * **Left to GraphQL, unlike big**: an error `getUserId` throws, and a watch whose scope fails its check (the base
    `watch` throws synchronously), both surface as GraphQL errors, which the client reads as `unexpected_error`. Big
    answered them as refusals; Q6's "don't catch errors just to rethrow" argues for leaving them. Tests state both.
  * Q7's spelling, `GraphQLVaultDB` / `GraphQLVaultClient`, over the design's `GraphqlVaultDB`.
  * `crossedErrOf` moved into the core (`safebyok/storage`) rather than living in the package: the allowlist sits beside
    `CrossedChecks.err`, which reads it back.
  * Packaging copied from `safebyok-graphql-big` (equivalent to indexeddb's, and already graphql-shaped).

* **Discoveries**:
  * The PGlite battery's cheat plants rows with safebyok-postgres's table names (`safebyok_*_things`), which are not
    exports: thread F (postgres_standalone) renaming them breaks `tests/test-helpers.ts`, nothing else.
  * tsdown wrote `inlinedDependencies: { zod }` into package.json on build, though no zod reaches dist (the checks'
    declarations name zod's types mid-build). `tsdown.config.ts` now has `deps.neverBundle` for zod; dist is unchanged.
  * The subagent's security entry cited "G4" for what the backend stores; G4 is the leaseKey's, so I dropped the cite.
  * `@urql/exchange-execute` and the battery passed first time over both stores: the client's checks agree with the core's.

* **For the Coach**:
  * **storageCallRefused**: the sprint suggested it for a server error that is not a crossed refusal. I kept
    `unexpected_error` (big's and the design's choice): a GraphQL error means a schema mismatch or a broken resolver, not
    a storage condition a host should retry or report as storage. Open.
  * **`ended` on `SafebyokNotice`**, beyond the design: the server's way to say a watch ended. Recommend keeping it.
  * **getUserId and a bad watch scope left to GraphQL** (Deviations). Recommend keeping it.
  * **The PGlite cheat's coupling** to safebyok-postgres's table names, against thread F. Recommend F fix the helper.
