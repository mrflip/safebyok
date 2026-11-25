# Thread 9: Postgres mints read_tc (2026-11-25)

Branch `20261125-pg_read_tc`, PR #911, stacked on #905 (thread 2, `20261125-stats`). Proved: `safebyok-postgres` lint, typecheck, and its 6 test files, 374 tests (PGlite 0.5.16, which is PostgreSQL 18.6).

* **Built**: every statement `PostgresVaultDB` runs returns `read_tc` as a column, `uuidv7()::text AS read_tc` (`ReadTcSql` in `src/vault-queries.ts`), beside the rows it reads: the get, write (all three kinds), list, birth, get-world and stats statements. `src/postgres-vault-db.ts` takes `read_tc` from the row; `readTcNow` is no longer imported there, and the `Omit<..., 'read_tc'>` row types are gone. The README says `PostgresVaultDB` needs Postgres 18 or later, for `uuidv7()`. Two tests in `tests/postgres-vault-db.test.ts`: two reads in one session are dated in order, and within a second of the database's `clock_timestamp()`; and an answer carries the `read_tc` of the row a fake client returns (which a client-minted `read_tc` would fail).
* **Decisions made**:
  * `uuidv7()::text`, cast to text so every driver hands back a string; Postgres prints a uuid in lowercase, version nibble 7, variant `[89ab]`, which `ReadTcPattern` accepts (checked against PGlite: `01a211fc-16bf-7000-83c6-...`).
  * One constant, `ReadTcSql`, spliced into each statement, rather than the expression written eight times.
* **Deviations**: none in the adapter. **The watch is unchanged**: see below.
* **Discoveries**:
  * **A watch notice's `read_tc` is minted in the core, not in this adapter**: `itemEventOf` in `packages/safebyok/src/storage/adapter-vault-db.ts` dates each `Received` with `readTcNow()` on arrival, and `Received` (`shapes-answers.ts`) has no `read_tc`. Carrying the database's would take a core change, outside this thread's "stay inside safebyok-postgres" (and the auto-mode classifier refused that edit). The plain way, for a later thread: `tell_thing` adds `'read_tc', uuidv7()::text` to the notice; `Received` gains an optional `read_tc`; `AdapterVaultDB.watch` checks it (an `ActualChecks.received` pick, refusing `storage_issue`) and falls back to `readTcNow()` where an adapter makes none (memory, IndexedDB). A notice too big for its Thing is fetched by `#fetchThing`, whose row now carries a database `read_tc` already.
  * `uuidv7()` runs while the statement executes, after its snapshot is taken: a `read_tc` is now no earlier than the snapshot, where the client's was minted just before the statement. The window is the statement's own milliseconds.
  * `uuidv7()` is monotonic within one backend (connection) only; across a pool's connections, two reads are ordered by the server's clock alone.
  * CI's `postgres` job (e2e) runs only the bankDB battery over real Postgres; `PostgresVaultDB` runs only on PGlite, which is Postgres 18.6, so `uuidv7()` is there.
* **For the Coach**: whether the watch should carry the database's `read_tc` (the core change above); recommend yes, as its own small thread.
