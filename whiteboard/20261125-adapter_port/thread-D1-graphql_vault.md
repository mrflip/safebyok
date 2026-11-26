# Thread D1: graphql_vault (2026-11-25, reworked 2026-11-26)

Branch `20261125-graphql_vault`, PR #932, on main (#914 merged). Proved, after the review's rework: safebyok-graphql 283
tests (the VaultDB battery over a MemoryVaultDB and over a PostgresVaultDB on PGlite, through an in-process GraphQL
server; the rest unit tests); core 2349; lint and typecheck green in both. Filing runs `pnpm justify`.

* **Built**:
  * **Core** (`packages/safebyok`): `src/shapes/shapes-crossed.ts`: `CrossedChecks` (`err`, `act`, `answered`),
    `crossedErrOf` (moved from big, now refusing a non-VaultError as `bad_record`) and `refusedOverWire(crossed,
    answered)`, which checks both and refuses `storage_issue`; the classifier's `[Things crossed]` section
    (`crossedThingOf`, `crossedGotOf`, `crossedWrittenOf`, `crossedNamedOf`, `crossedTrackedOf`, `crossedRootsOf`,
    `crossedWorldOf`, `crossedListingOf`); `safebyok/storage` exports these, `refusalOfThrown`, `storageCallRefused`,
    `birthPutsOf`, `checkedWriteAsk`, `checkedBirthBankAsk`, and big's act, flag and refusal-kind vals.
    `AdapterVaultDB.doWatch`'s `_onEnded` is required, as on main.
  * **`packages/safebyok-graphql`**, 0.5.0, public, in the `fixed` group, peer `safebyok`:
    `VaultSchemaSdl`, `VaultOperations`, `vaultResolvers({ vaultDB, getUserId })` over any vaultDB, `GraphQLVaultDB
    extends AdapterVaultDB` over an urql Client, `shapes/shapes-wire.ts` (`WireChecks`, `CrossedErrExtension`), README.
  * **Tests**: the battery over both stores; `graphql-vault-db.test.ts` (fake Client, and end to end over
    `vaultResolvers`); `vault-resolvers.test.ts`; `vault-schema.test.ts` (the drift walk); `tests/wontfix/` (below);
    core `tests/shapes/shapes-crossed.test.ts`, `tests/storage/thing-classifier.test.ts`,
    `tests/refusals/throwers.test.ts`, and additions to `shapes-thing.test.ts` (`birthPutsOf`) and `index.test.ts` (the
    re-exported vals).
  * **`notes/security.md`**: one entry, the err allowlist, the sanitized network cause, and the sign-in check.
  * **`notes/wontfix.md`**: the row on Convex and Postgres watches stopped mid-flight is widened to GraphQL's ending.

* **Errors across the wire** (the Coach, 2026-11-26: "GraphQL is a transport: what goes in, goes out"). The four cases,
  stated for the caller in `graphql-vault-db.ts`'s header:
  1. The server's vaultDB refused or failed (any kind, `storage_issue` and `unexpected_error` included): it crosses as
     the BadAnswer it gave. The resolvers never re-throw it.
  2. The server could not serve the request (`getUserId` throws): the resolvers throw a `GraphQLError` whose
     `extensions.safebyokErr` is `crossedErrOf(refusalOfThrown(err))`: `unexpected_error` with the generic message, or
     the VaultError thrown; never the cause. Mid-watch, the reader is cancelled first (Minor 2).
  3. The request broke the package's rules (a watch scope that fails its check): likewise, `bad_record`, the kind the
     core's own watch check refuses with (big used `bad_scope`).
  4. GraphQL itself failed: a GraphQL error with no refusal of ours is `unexpected_error` (`serverErred`, no text).
  The client reads the carried refusal from `graphQLErrors`, or, for a subscription's rejected `next` in-process, from
  the `networkError` (that is where `@urql/exchange-execute` puts it), and makes it a VaultError with
  `refusedOverWire`; a carried refusal that fails its check is `storage_issue`.

* **Decisions made**:
  * **The client rebuilds the report a datastore would make.** Each `do*` reads the envelope (`WireChecks`), then the
    Things through the classifier's `crossed*` checks against its own ask; a get's act is checked against its Thing
    (`crossedGotOf`, Minor 1). A refused answer tracked `'unread'` came from a verb that threw: its refusal is thrown
    again (`refusedOverWire`) and `answerForThrown` answers it.
  * **Asks are checked at entry** in the resolvers (Minor 3), by the core's own checks: a malformed ask answers the
    BadAnswer `bad_record` the core's try* verb would, without calling the vaultDB. This replaced `plainAskOf`.
  * **The watch's end is marked on the wire**: `isEnded: Boolean!` on `SafebyokNotice` (renamed from `ended`, Minor 7;
    the Coach: "lgtm"). The client ends at that notice, `onEnded()` then `onBadNews(why)`, in a microtask, so that it
    comes after `watch` returns where urql ends the stream inside `subscribe()`.
  * **SDL**: enums from the core's vals; acts and `op` stay `String`; stats are `Float`; records stay `SafebyokJson`.

* **Set aside**:
  * `refusedOverWire` in `refusals/throwers.ts`: it needs `CrossedChecks`, and shapes-crossed imports the throwers, a
    cycle. It lives beside `crossedErrOf`.
  * A `checkedAskOf` helper returning ask-or-refusal: one try/catch per resolver reads straighter.
  * A `storageCallRefused` wrapper around every server error (Q6). A typed SDL for records (Q1).

* **Deviations**:
  * `CountedVaultDB` in vault-resolvers.test.ts does not pass `onEnded` on, as item 3 asked: it extends
    `MemoryVaultDB`, whose `doWatch` takes three parameters (TS2554). Only `AdapterVaultDB`'s gained the fourth.
  * The wontfix demonstration shows more than asked: the ending arrives after `watch` returns *and* after a stop called
    within that microtask, which is what makes it a wontfix row; the promise half was already tested
    ("ends a stream that ends as soon as it starts once, after watch returns").
  * Q7's spelling, `GraphQLVaultDB`.

* **Discoveries**:
  * The PGlite battery's cheat plants rows with safebyok-postgres's table names, which are not exports.
  * tsdown wrote `inlinedDependencies: { zod }` on build; `tsdown.config.ts` has `deps.neverBundle` for zod.
  * A pipe before `&&` hides lint's exit code: prove with each check's own exit.

* **For the Coach**:
  * **A try\* verb never throws**: the Coach's "thrown on receipt" reaches a `GraphQLVaultDB` caller as a BadAnswer
    carrying that refusal (tracked `'unread'`), or on a watch as `onEnded` then `onBadNews`. Recommend keeping it.
  * **"The adapter should not itself re-throw"** read as the resolvers'. The client still throws inside `do*` so that
    `answerForThrown` makes the BadAnswer. Recommend keeping it.
  * **A malformed ask stays a BadAnswer** (`bad_record`), as the core's try* verbs answer one; only the watch scope,
    whose core check throws, becomes a GraphQL error. Recommend keeping it.
  * **Write and birth refused acts are not checked against `dbhas`**, as a get's now is. Recommend a later thread.
  * **The `answered` check refuses `storage_issue`**, as any malformed crossing does. Recommend keeping it.
  * **The extension key `safebyokErr`** is mine. Recommend keeping it.
