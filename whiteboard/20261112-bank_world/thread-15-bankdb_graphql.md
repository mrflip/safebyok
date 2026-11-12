# Thread 15: bankdb_graphql (2026-11-12)

Branch `20261112-bankdb_graphql`, PR [#671](https://github.com/mrflip/safebyok/pull/671), stacked on [#669](https://github.com/mrflip/safebyok/pull/669) (thread 13).
Justify: see the PR's **Tests:** line. e2e on a real Postgres (`SAFEBYOK_PG_URL` set here): graphql + postgres suites, 365 green.

* **Built**: `safebyok-graphql` carries a bankDB, in place. The vault adapter is gone from it.
  * Commit `storage: safebyok-graphql's sources and tests ... move to bank-named files unchanged` is a pure
    rename (`vault-schema.ts` -> `bank-schema.ts`, and so on), so `git diff <that commit>` reads the edit
    as bank against vault.
  * `bank-schema.ts` (`BankSchemaSdl`): one root field per bankDB verb, 15 in all. Query: `safebyokEnsureBank`,
    `safebyokGetVault`, `safebyokListBoxes`, `safebyokGetBox`. Mutation: `safebyokBuildBank`, the three gate verbs
    (each takes a `SafebyokGateVerbAskInput`, the gate's put without `gateVerb`), `safebyokDelBank`, vault and box
    put/del, `safebyokTidyGone`. Subscription: `safebyokWatch`. Every answer carries `parent` where the vault one
    carried `world`.
  * `bank-resolvers.ts` (`bankResolvers({ bankDB, getUserId })`): takes an `AdapterBankDB`; each field calls the
    nested bankDB's `try*` verb behind the same sign-in check. Ladder: one call per verb, nothing added at the
    hot end.
  * `bank-operations.ts` (`BankOperations`), `graphql-bank-db.ts` (`GraphQLBankDB implements BankDB`).
  * Tests: the 4b bankDB battery runs twice in the package (in-process, and through Yoga over fetch) and once in
    e2e over real sockets and Postgres; the drift test walks every root field and input against the `WX`/`BX`
    checks; the resolver tests port every vault case.
  * e2e: `tests/graphql/` runs on PostgresBankDB over the bank tables.
* **Decisions taken**:
  * Bank and vault rows each get one GraphQL type (`SafebyokBankRow`, `SafebyokVaultRow`), not a record/tombstone
    union: their two forms have the same fields now. Box rows keep the union (a record has its sidecar and ciphered
    fields).
  * `ensureBank`, `listBoxes`, `tidyGone` take scope arguments, as `listVaults` did; the resolver fills
    `gates: ['main']` for ensureBank.
  * A gate verb's sign-in refusal carries `gateVerb` in its ask, as the adapter's own answers do.
  * GraphQL answers a gate without a passkey wayin with `passkey0: null`; the gate check takes it only absent.
    `GraphQLBankDB`'s wire-forms drop (`wayinsOf`) leaves a null `passkey0` out. Set aside: loosening the core's
    wire checks (`shapes-bank-answers.ts`) to read it, since only GraphQL nulls an absent field and that module
    reuses the stored-row checks whole.
* **Deviations**:
  * Core, one token: `WX.delBankAnswer`'s good branch took `parent` as a required `null`, so a wire that sends only
    its schema's fields (no `parent` on a delBank answer) failed it. Now `lit(null).default(null)`, as every other
    always-null field there. Test added in `shapes-bank-answers.test.ts`. Thread 14 (Convex) may meet the same.
  * Core, one phrase: `SchemaNotServed` names `BankSchemaSdl`.
  * Pulled forward from 16: the e2e Postgres helpers lose the vault tableset (`Tableset`, `SqlOf`, `vaultDBOver`,
    `freshVaultDB`, `vaultRowsOf`). graphql was their only user. `useFileDatabase()` takes no argument.
  * Directive done, own commit: `TH.BankDBWorld` deleted; `idb-bank-db.test.ts` uses `TH.BW`.
* **Discoveries**:
  * The drift test's "a field the check only allows null may be left out" is wrong for a good branch with no
    default: the walk passed while the client failed. The fix was the core default, not the walk.
  * Ground rule 16: src lines, graphql 1230 -> 1439 (+209); core +1 -1 twice.
* **For the Coach**: the open questions are in the PR body.
