# Thread A: big_names (2026-11-25)

Branch `20261125-big_names`, PR [#916](https://github.com/mrflip/safebyok/pull/916), stacked on #912. Proved: package tests and typechecks green: safebyok-postgres 123,
safebyok-postgres-big 246, safebyok-fastkey 43, safebyok-indexeddb 115, safebyok-indexeddb-big 215, safebyok-react 339,
safebyok-react-big 277, safebyok-graphql-big 448, safebyok-convex-big 334, the demos and e2e (111, 24, 26, 99, 576), root
scripts 327; lint clean. `pnpm justify` after the catch-up rebase: see the PR's **Tests:** line.

* **Built**
  * Renames, in one pure commit first (b749119f1), so #905 and #911 rebase across a rename:
    * indexeddb → indexeddb-big, idb-lean → indexeddb
    * react → react-big, react-lean → react
    * convex → convex-big, graphql → graphql-big
    * the bank half of postgres → a new postgres-big
  * Each -big package answers to its name, is private, and has the README line "Frozen, on safebyok-big, until its port
    replaces it". graphql-big depends on postgres-big.
  * safebyok-indexeddb and safebyok-react are public at 0.5.0, with `safebyok` as a peer dependency, the -big packages'
    npm metadata, and their CHANGELOGs. safebyok-react has a new README.
  * The postgres split:
    * safebyok-postgres exports `PostgresVaultDB`, `thingsChannelOf`, `VaultTablesSql`, `VaultFunctionsSql` and the
      `PostgresQueryable` and `PostgresListen` types, has a peer dependency on `safebyok` and none on safebyok-big, and
      has a README rewritten for the vault side.
    * The driver helpers PostgresVaultDB had imported from postgres-bank-db.ts (refusals, notices, listening) are copied
      verbatim into `src/postgres-driver.ts`, with a test of their own.
    * safebyok-postgres-big has PostgresBankDB, the bank SQL, `pgClientOf`, and their tests.
  * safebyok-fastkey imports from `safebyok` and `safebyok/browser`. Its three cross-device tests are rewritten over the
    new core: `TH.buildBornVault` and `TH.makeDevice` sharing one vaultDB, then `gate.unlock`, `vaultTSQ.getOnce` and
    `unsealBox`. Its README's example uses `reactGiver`.
  * Consumers:
    * The React demo and e2e use the -big names.
    * The dojo, envman and knockknock demos use safebyok-react and safebyok-indexeddb.
    * The fixed group is react, postgres, fastkey and indexeddb.
    * `tests/scripts/release.test.ts` expects the packed react's peer dependency on `safebyok`, and refuses any public
      `-big` package.
    * PROCESS.md *Packages*, the root README and NOTYET.md name the new packages.
  * Four changesets, one each for indexeddb, react, postgres and fastkey (minor, breaking before 1.0).
* **Decisions made**
  * **pgClientOf is not in safebyok-postgres.** The handoff said pg-client was "needed by both". PostgresVaultDB takes
    any client with `query` and never calls `transaction`, and a `pg` Pool already has `query`. So pg-client.ts and its
    test move to -big as renames, not copies. If the vault side ever needs transactions, it ports the file back.
  * **The shared driver code goes in a new file, `postgres-driver.ts`**, rather than into postgres-vault-db.ts. That keeps
    the file #911 edits small to conflict with, and leaves each export with one home.
  * **The changelogs follow the npm name** (indexeddb, react). postgres and fastkey keep theirs where they were. The
    convex and graphql changelogs stay in the -big packages for threads B and D to decide.
  * In each -big package, every `safebyok-X` became `safebyok-X-big` except in CHANGELOG.md, including the SQL comments
    and phrases of postgres-big.
* **Deviations**
  * safebyok-postgres no longer ships `.sql` files (`files: ["dist"]`). The vault SQL lives only in `VaultTablesSql` and
    `VaultFunctionsSql`, as it did before this thread. The README says so.
* **Discoveries**
  * **The pending changesets break `changeset status`.** 42 of them name `safebyok-convex` or `safebyok-graphql`, and no
    package has those names until threads B and D. CI never runs it; a release would. I left the changesets alone.
  * Some paths existed on both sides of a swap: react↔react-lean, indexeddb↔idb-lean. git shows these as modify, add and
    delete, not as renames, so #905 will meet conflicts there. They are `idb-lean/{README.md,src/index.ts}` and the
    same files in indexeddb, and in react/react-lean: `src/index.ts`, `eslint.config.mjs`, `package.json`,
    `tsdown.config.ts`, `tests/test-helpers*.ts*` and `tests/test-helpers/secret-search.ts`.
  * `safebyok` itself is still private, so the four public packages cannot publish until it is not (the old react had
    the same problem, with its peer dependency on the private safebyok-big).
* **For the Coach**
  * Confirm that pgClientOf leaves safebyok-postgres.
  * Decide whether the 42 changesets that name convex and graphql stay as they are until B and D land (my
    recommendation), or are rewritten.
