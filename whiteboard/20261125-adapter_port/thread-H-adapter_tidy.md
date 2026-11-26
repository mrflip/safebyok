# Thread H: adapter_tidy (2026-11-26)

Branch `20261126-adapter_tidy`, PR #PRNUM, stacked on #935 (thread G), which stands on #932 (D1). Proved: package tests
before catch-up -- safebyok 2353, safebyok-graphql 285, safebyok-postgres 179, safebyok-postgres-big 246, all green;
typecheck and lint clean in each. `pnpm justify` after the catch-up rebase: see the PR's **Tests:** line.

* **Built**:
  1. `packages/safebyok-postgres-big/package.json`: `eslint-plugin-unicorn` `^80.0.0`, lockfile regenerated. Its lint
     raised nothing new, so nothing else changed there.
  2. `notes/wontfix.md`, row "Two Postgres lists whose `read_tc` order...": rewritten to match the code and the README.
     `PostgresVaultDB` already dates every read with Postgres 18's `uuidv7()` in the statement (`ReadTcSql` in
     `vault-queries.ts`), so the row's "current outcome" (a `read_tc` made in JavaScript) and its alternative ("the
     package supports Postgres before 18") were both stale. What is left of the crossing: `uuidv7()` is monotonic within a
     connection only, so two lists on two pool connections at once can still date in the other order from their
     snapshots. The alternatives now name a lock per list, and a UUID v7 from a sequence (our own construction).
  3. `packages/safebyok-postgres/src/phrases.ts`: `ClientExpected`, used by `postgresVaultDBOpts`'s `client` check.
  4. Core, `packages/safebyok/src/storage/thing-classifier.ts`: `crossedRefusedWriteOf(ask, act, raw)` and
     `crossedRefusedBirthOf(puts, act, raw)`, beside `crossedGotOf`, with type `CrossedRefused`. Each checks the Thing at
     its scope (a birth's: at the labelpath it carries, which must be one of the three puts'), runs the act tables
     (`writeActOf`, or `putActOf` for that root's put), and refuses `storage_issue` unless the table gives exactly the
     act carried and that act is a refusal. `GraphQLVaultDB.doWriteThing` and `doBirthBank` use them for a refusal the
     server's verb did not throw; `refusedActOf` in graphql-vault-db.ts is gone (the table check covers it). Tests:
     core `tests/storage/thing-classifier.test.ts` (two describes), graphql `tests/graphql-vault-db.test.ts` (two `it`s
     beside D1's get-act test). The graphql tests fail on the old code (verified).
* **Decisions made**:
  - The checks live in the core, not in safebyok-graphql: the act tables are private to the classifier (`putActOf`),
    and `crossedGotOf` set the pattern. Exported through `Classifier`, so safebyok's surface grows by two functions and
    a type (safebyok is private; no changeset for it).
  - A birth refusal carries only the root it names, so the check covers that root's put alone; it cannot check that
    the roots before it did not refuse first. Not checked further: the other roots never cross.
  - A good write or birth (`ok: true`) is not checked against the tables: what the server wrote replaced what the
    tables were run over. The brief named refused acts only.
* **Discoveries**:
  - A birth over a live bank always passes (the bank's put has `ifPresent: 'get'`), so a refused birth cannot be served
    from a MemoryVaultDB with the test bank born. The graphql birth test builds its refusal from the passed answer.
  - The wontfix row was wrong about the code, not just the README: the `uuidv7()` change had landed (`pg_read_tc`).
* **For the Coach**: the rewritten wontfix row's alternatives are mine; the old row said "awaiting a ruling".
