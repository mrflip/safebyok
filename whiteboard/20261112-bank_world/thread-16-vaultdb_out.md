# Thread 16: vaultdb_out (2026-11-12)

Branch `20261112-vaultdb_out`, PR #TBD (draft), stacked on #681. Justify: green at the last run before the catch-up (core 2954 + 1, indexeddb 197, postgres 212, react 262, convex 249, graphql 409, fastkey 43, demo 99, e2e 549); re-run after the catch-up below.

* **Built**: the VaultDB stack is deleted, and a search for `VaultDB|vaultDB|AdapterVaultDB|MemoryVaultDB|IdbVaultDB` (case-insensitive for `vaultdb`) finds nothing live. Dated ledgers keep theirs: `human/`, `notes/security.md`, `winboard/`, other whiteboards, CHANGELOGs, changesets, `notes/old_vocabulary.md` (which gained the row), `notes/wontfix.md`'s `vaultdb_cleanup` sprint name, `.github/workflows/ci.yml`'s link to the old `VAULTDB.md`, and TODO's `VAULTDB.md` link.
  * Core: `VaultDB`, `AdapterVaultDB`, `MemoryVaultDB`, the vault-world classifier, `shapes-answers.ts`, the vault half of `shapes-storage.ts` (asks, rows, forms, the vault options), their throwers and phrases, `IsVaultDB` and `VaultsDBVersion`, the vault battery and `storage-world` helpers. `shapes-bank-answers.ts` took the three checks it shared (`crossedErr`, `damagedVault`, `CrossedErr`). `shapes-storage.ts` is now the base layer the bankDB and the deviceDB share. `askOpVals` and `badActVals` are the one set each: the `bank*` duplicates are gone. `RefusalRows` is `{ parent?, dbhas? }`.
  * Adapters: `IdbVaultDB` and `shelf.ts`; `PostgresVaultDB`, its two SQL files, queries, functions and tables; `ConvexVaultDB`, `SafebyokComponent`, the vault component (`vaults.ts`, vault `tallies.ts`, `validators.ts`, `server.ts`). Convex's `bank-*` files lost the prefix (`server.ts`, `validators.ts`, `tallies.ts`), its tables lost `bank_` in theirs, `capacity` and `watchScope` moved into `validators.ts` first, and `refusals.ts` no longer carries the `gate_issue` crossing.
  * `DevVaultDBInspector` and its tests (thread 12 left it).
  * Tests: the Postgres channel and watch tests moved to `postgres-bank-db.test.ts`; the Convex tally tests were ported to the bank's tallies (plus a budget test); `testing.test.ts`, `test.test.ts` and `test-helpers.test.ts` run through `buildBank` and `ensureBank`.
* **Decisions taken**:
  * `isLiveRow` stays in `shapes-storage.ts` and the storage index: the Convex component's tallies use it, and it is not vault-world.
  * `notes/design-vaultdb.md` is deleted. Its refs in `design-models.md` and `design-proof.md` point at `notes/answer-contract.md`. Those two design notes, and `notes/gallant*.md`, only had the names mechanically renamed to `bankDB`, and are stale in more than names (`tryPutVault(record, { prior })`, `gate_epoch`): a rewrite is not this thread's.
  * TODO.md: the Postgres `InsertBoxOutcome` item went (its file is gone); the others were renamed to the BankDB, and the Coach's 2026-10-22 and 2026-10-21 quotes carry `[bankDB]` in the brackets' place.
  * READMEs: names only (thread 17 rewrites the prose); the indexeddb README was rewritten for the bankDB because its whole text was the VaultDB's, and the Postgres and Convex READMEs say what a host does with its old tables.
  * The changeset is one file, `minor` on safebyok, indexeddb, postgres, convex and react; it says what a host does: IndexedDB's `:vaults-v...` databases are left unread; Postgres: drop `safebyok_boxes`, `safebyok_vaults` and the `safebyok_` functions first, because `CREATE TABLE IF NOT EXISTS` keeps an old table with its old columns; Convex: empty every table of the component before deploying, since a table with rows cannot be dropped and `safebyok_vaults`, `safebyok_boxes` and `safebyok_tallies` now hold other columns.
* **Deviations**: none from the thread text. The Postgres vault tableset in the e2e helpers was already gone (thread 15).
* **Discoveries**:
  * The Convex package tests resolve `safebyok/storage` from its `dist`, so a core change needs `pnpm --filter safebyok build` before the Convex tests see it.
  * `world` as an answer's field: gone from the core, graphql (`BX.CrossedErr`) and the notes. The remaining `world` in code is the models' own (`ProvingWorld`, a bank's world).
* **For the Coach**:
  * `notes/guarantees.md` is untouched (thread G). Lines my removal makes false: line 124 ("not to the host's VaultDB") and line 206 ("`bank_key_wayin_wrapped` (VaultDB)"): both want `BankDB`.
  * Stored-shape effects are listed in the changeset; none of them migrates anything.

## Next leg

None: the thread is complete.
