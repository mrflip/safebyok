# Thread 1: vaultdb_battery (2026-11-15)

Branch `20261115-vaultdb_battery`, PR #707 (draft), on main. Proved: `pnpm justify` green after the catch-up
(safebyok 766 tests, safebyok-postgres 327, the battery on PGlite among them); since then the RLS and REVOKE
commit, proved by the package's lint, typecheck and its vault file (87 tests).

## Why Postgres redoes the classifier's work

The store's own code is one of the two security boundaries that count. The other, and larger, is `bank.unlock`.
Behind Postgres the adapter's TypeScript runs in the page, beside whatever else runs there, so what it decides is a
claim; only SQL in the database holds against a script that calls the store directly. And only the statement that
writes sees the row it writes over: Postgres checks an UPDATE's WHERE again against the row a concurrent writer left.
So each write function makes every check again in its writing statement. Never "simplify" the SQL by trusting the
adapter's classification, and never add a SELECT-then-write.

PGlite is one connection: the battery cannot race two births or two writes of a row. How a race settles is argued
in the SQL's comments, not tested.

* **Built**:
  * `src/storage/`: `MaxLabelsUnder = { bank: 0, gate: 0, box: 1 }`. Every answer, refusals included, and every
    notice carries `world: WorldRecord | null` (the bank's record spread flat, its main gate as `maingate`).
  * **track / tracked** (the Coach's 2026-11-15 ruling): an ask may carry `track: { bank, gate }`, each
    `{ revseq, lifepath }`; the answer then carries `tracked: { bank: BankRecord | 'same', gate: GateThing | 'same' }`.
    The store compares; the classifier's `trackedEntryOf` checks a row as it checks any written row. Every response
    method ends in `notifyTrackedRecords` (`adapter-vault-db.ts`), which, with `doNotifyTracked` on (the default),
    tells the bank's watches of each entry that is not `'same'`, on a microtask. `MainGateLabelpath` (`'gate'`) is
    the one constant for the key. Exported from `safebyok/storage`: `Track`, `Tracked`, `TrackedFetched`,
    `trackedFieldOf`, `MainGateLabelpath`.
  * The battery, `tests/test-helpers/vaultdb-battery*.ts` (writes, lists, births, world, watch, tracked), published
    by `safebyok/testing` as `describeVaultDBBattery(label, { makeVaultDB, _cheat_rowsOf, watches? })`; the backdoor
    plants or removes a raw row. `MemoryVaultDB` runs it and keeps its memory-only cases.
  * `safebyok-postgres`: `PostgresVaultDB` (`src/postgres-vault-db.ts`), `VaultTablesSql` (`vault-tables.ts`: three
    tables, `safebyok_{bank,gate,box}_things`), `VaultFunctionsSql` (`vault-functions.ts`: `safebyok_write_<kind>`,
    `safebyok_birth_roots`, `safebyok_world`, `safebyok_tracked`, `safebyok_tell_thing`, the check helpers) and the
    statements (`vault-queries.ts`). It passes the battery on PGlite (`tests/postgres-vault-db.test.ts`), plus a direct
    SQL test that a write function, called past the adapter, refuses a stale cite and a skipped life.
* **Decisions made**:
  * The write functions take no op flags (`ifAbsent`, `ifPresent`): the adapter's `mayWrite` calls a write function
    only where the flags let the ask write over the Thing it cites; otherwise it reads and classifies. A flag only
    stops a write, so a script that skips it gains nothing the SQL checks would refuse.
  * On a refusal the adapter classifies the row read back; if the classifier would still find a write, the two
    disagree, and it throws `storage_issue`.
  * The three write functions are written from one template (`writeFunctionOf`), so they cannot drift. A rule about
    one row is a CHECK on its table, never a clause in a write function.
  * Policy SQL tests `jsonb_typeof(wayins->'passkey0')`, not the design's `wayins ? 'passkey0'`: our gate always
    carries `passkey0`, JSON null for none. Gate policies apply on any gate write that names them.
  * `tryBirthBank` is one call of `safebyok_birth_roots`: one CTE statement checks that none of the three is stored,
    then inserts all three. No BEGIN, no row lock. A losing racer hits the primary key, the statement rolls back, and
    the answer is `storage_unavailable` (a race gets a row, not a fix).
  * A missing or damaged tracked row is **unspecified** (notes/wontfix.md): no code for it, pinned by a type test
    (`shapes-thing.test.ts`) and two pointer comments. As built, a missing one throws `storage_issue` through the
    existing `writtenOf` check; nothing asserts that.
  * The compare is on raw rows by `(revseq, lifepath)`, so a damaged row that matches its track reads `'same'`.
  * Tracked is read after a write, beside the world; a born birth's tracked comes from the store, not the classifier
    (the roots are missing before the write).
  * `'gate'` is hard-coded in the SQL, as `safebyok_world` already was.
  * As the bank layer does, the three tables keep row-level security on with no policy, and the writing functions
    are revoked from PUBLIC: only the owning role reaches them. `notes/security.md` has the boundary entry.
  * `PostgresVaultDB` is not exported yet; `safebyok` is a devDependency of `safebyok-postgres`, with one
    `eslint-disable-next-line import-x/no-extraneous-dependencies` on its import.
* **Deviations**:
  * The plan's "returns its verdicts with the row" is built (`lifeseq_ok`, `policies_ok`), but the adapter does not
    read them: it classifies the row read back instead, guarded by the disagreement throw above.
  * The lease and proving cases for a gate at `gate/passkeys` are gone: no such gate can exist now.
* **Set aside**:
  * The world pick and push (f0b63ef83): superseded by track / tracked. A classifier-side compare: the store
    compares, as ruled.
  * A SQL filter or guard for a missing tracked row: ruled out (unspecified).
  * Tightening the CHECKs to refuse every damaged shape: they cannot cover all damage, and it would change the tables.
  * A SELECT in the write function before its UPDATE, to classify there: the race the boundary exists to close.
* **Discoveries**:
  * **A write over a damaged box it cites exactly**: Postgres replaces it, since the writing statement compares
    revisions, not shapes; memory refuses `damaged_row`, since its classifier checks before it writes. The battery
    accepts either, and each store's own file pins its outcome. A get refuses the damaged row in both.
  * A tracked write can notify a Thing twice; the watch cases accept duplicates.
  * `safebyok-postgres`'s tests run against `safebyok`'s **built** dist: build it first, or use the package's
    `test` script, which builds dependencies.
* **For the Coach**:
  * The wontfix entry the pointer comments name lives on `20261113-crypt_plan` (b3f16776b), not on main or here.
  * Whether a box birth should check that its parent is live; nothing does now.
  * The world a write answers is read just after the write, in the same transaction but a later statement, so under
    READ COMMITTED another writer's commit may land between.
