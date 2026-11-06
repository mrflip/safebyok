# Thread 4: port_postgres (2026-11-06)

Branch `20261106-port_postgres`, stacked on #558 (thread 2, `20261106-vaultdb_battery`). Justify: everything
green except **safebyok-graphql**: its lint, typecheck and tests (232 of 360 red) still build the old
`postgresVaultDB` and speak safebyok-old's VaultDB. That is thread 5's work (it depends on this one) and
cannot be made green here short of porting graphql. safebyok-postgres 114 tests; e2e 216 (the Postgres
suites, 99, run against a real Postgres at `SAFEBYOK_PG_URL`, skipped without one); core 2267.

* **Built**
  * `packages/safebyok-postgres/src/postgres-vault-db.ts`: `class PostgresVaultDB extends VaultDB`
    (from `safebyok/storage`), the do* hooks written to read top to bottom as memory-vault-db's do, the
    decisions made in JS with the SX helpers (`isCheckedLiveVault`, `isLifeOver`, ...).
  * Opts (for thread 5): `new PostgresVaultDB({ client, listen?, maxBoxes?, maxRecordBytes? })`.
    `client: PostgresClient` = `{ query(text, params?) => Promise<{ rows }>, transaction(work(tx)) }`;
    a PGlite is one as it stands; `pgClientOf(pool)` (`src/pg-client.ts`) makes one of a `pg` Pool
    (BEGIN / COMMIT / ROLLBACK on a pool connection, released destroyed if the rollback fails).
    `listen: (channel, onNotify(text)) => Awaitable<unlisten>`, optional; without it, watch hears nothing.
  * `vault-tables.sql` / `VaultTablesSql`: `safebyok_vaults (applabel, user_id, vaultlabel, vault jsonb)`
    and `safebyok_boxes (applabel, user_id, vaultlabel, vault_tok, boxlabel, box jsonb)`, keyed on all
    their text columns, RLS on, no foreign key; idempotent. `VaultChangeChannel` = `safebyok_vault_changes`.
  * Tests: the battery over PGlite (all hooks incl. `makeTwin`, `makeCappedVaultDB`, `_cheat_failNextCall`),
    plus refusal triage, the stored shape, the watch (oversize notice, foreign notifications, no listen),
    the tables, `pgClientOf` over a fake pool, the export list.
  * `e2e/tests/postgres/`: the battery over a real Postgres via `pg`, a store per pool and listener; a watch
    heard across servers; a box-cap race (8 racers for 1 place, 5 rounds: exactly one lands) and a
    delete-while-writing race. `foreign-key.test.ts` deleted. e2e/package.json gains `safebyok` only.
  * Core: `safebyok/storage` exports `Checker`, `Checkers`, `objCheck`, types `ObjCheckOpts`, `Refusing`
    (thread 3 adds the same; one of each at the restack). The testing door exports `vaultQuery`, `boxQuery`.
  * README rewritten; changeset `.changeset/20261106-port_postgres.md` (safebyok-postgres minor, safebyok minor).
* **Decisions taken**
  * **jsonb documents beside key columns**, not a column per field: the battery plants garbage rows, which
    typed columns cannot hold, and the record shape stays the core's to change.
  * **Every write locks the vault row `FOR UPDATE`** in one transaction, so the box cap is exact and the
    races serialize; a birth is `INSERT ... ON CONFLICT DO NOTHING`, and the loser re-reads (landed false).
  * **Notices are sent by the write itself** (`pg_notify` inside the transaction, delivered on commit),
    carrying the stored rows. Over 7999 bytes a notice carries keys only, and the listener re-reads the
    current rows. Triggers and `VaultNotifySql` are gone.
  * **Triage**: SQLSTATE class 42 (missing table, privilege) is `unexpected_error`; anything else
    `storage_unavailable`; a VaultError passes through. The cause is a fresh Error with only the driver's
    message and code (PGlite errors carry `params`, which may hold row text).
  * **The per-request `user_id` gate is dropped**: who reaches which bank is the route's call (thread 5).
  * listen / unlisten failures are swallowed: a watch is best effort ("Nothing may count on hearing one").
* **Deviations**
  * `pgClientOf` is hand-rolled (pg's documented transaction recipe, ~20 lines); pg has no helper for it.
  * The route-recipe test and README section are dropped; the recipe is thread 5's to state.
  * e2e `races.test.ts` is rewritten, not ported: the old best-effort cap bounds no longer apply.
* **Discoveries**
  * PGlite's `listen` runs behind its own mutex and resolves late: a write right after `watch()` can beat
    the LISTEN. The package tests therefore make one LISTEN at boot and fan it out, as a server would; the
    README's recipe does the same over a `pg` Client.
  * `pg_notify` refuses payloads past ~8000 bytes, hence the keys-only fallback.
  * The first full justify was red on e2e (fixed by the port) and on safebyok-graphql (thread 5).
* **For the Coach**
  * The notice fallback reads rows as they are now, not as stored: a watcher may hear a later row.
  * Should the box cap count bytes too? `vault_full` reports `bytes: { used: 0, max: Infinity }`.
