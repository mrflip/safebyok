# Thread 15: the Postgres schema, from fresh (2026-10-18)

Branch `20261018-pg_fresh`, PR #PR, stacked on #170. Justify: green (postgres 249 passed, 14
skipped; every package green).

* **Built**:
  * **The SQL was already from-fresh** in code: `vault-tables.sql` / `VaultTablesSql` and
    `vault-notify.sql` / `VaultNotifySql` hold `CREATE TABLE IF NOT EXISTS`, row-level security,
    and `CREATE OR REPLACE` for the notify function and triggers. No `ALTER` but RLS, no rename,
    no upgrade path. The upgrade patchwork the Coach saw lived only in the changesets.
  * **One consistency fix**: `safebyok_vaults` now lists `vault_id` before `format` (SQL files,
    `src/columns.ts`), so both tables open with scope, `vault_id`, `format`: key columns first,
    then the record in its own order.
  * **The SQL header and README** say `VaultTablesSql` never changes the columns or keys of a
    table already there, and that until 1.0 a release that changes the tables says so and the
    host drops them and runs it again. The README's *Hearing other writes* says why there is a
    trigger.
  * **Tests** (`tests/vault-tables.test.ts`): each key's name and definition on a fresh database
    (all four named for their table, as Postgres names a key made with the table); every column
    `NOT NULL` with no default, except `prior_vault_key`, the one field a record may leave out;
    and a table already there of another shape left as it was (the reason a host must drop).
  * **Changesets**: the summary (`20261018-sweep.md`) gives a 0.3.0 host one block --
    `DROP TABLE IF EXISTS safebyok_lockboxes, safebyok_vaults, safebyok_bundles;` and
    `DROP FUNCTION IF EXISTS safebyok_vault_changed(), safebyok_lockboxes_capped();` -- then the
    new SQL. Its *Stored formats* paragraph now says a Postgres vault reads as **absent** (it
    said damaged, true only of the old rename path). `public_bag`, `written_at`, `wayin`,
    `sidecar`, `vaultprops`, `epoch_expectation` and `sweep_small` point to it in a line. Checked
    by hand on PGlite: 0.3.0's tables, notify SQL and README hard cap, then the block, leave no
    table or function behind, and the new SQL runs clean.
* **Decisions taken**:
  * **`IF NOT EXISTS` stays**: it is the adapter's documented contract ("safe to run again", run
    at server start or as a migration), not upgrade patchwork. `ALTER TABLE ... ENABLE ROW LEVEL
    SECURITY` stays: it is setup, idempotent.
  * **Keys keep Postgres's own names** (`safebyok_vaults_pkey`,
    `safebyok_vaults_applabel_user_id_vaultlabel_vault_id_key`, `safebyok_lockboxes_pkey`,
    `safebyok_lockboxes_applabel_user_id_vaultlabel_vault_id_fkey`) rather than explicit
    `CONSTRAINT` names: made fresh they follow the table names, and the new test pins them.
  * **The notify trigger stays.** It is what `subscribe` needs: Postgres tells another
    connection of a write only by `NOTIFY`; a trigger sends it from inside every write to the
    two tables, whatever made it, delivered at commit. The hard-cap trigger is not shipped (the
    README gives a prompt for a host's own); nothing exists for an upgrade.
* **Discoveries**: the summary's old *Stored formats* line ("in Postgres after the steps below
  ... reads as damaged") would have gone false with the drop; fixed. `epoch_expectation` told a
  host to take "the README's new version" of the hard cap, which `sweep_small` had since removed.
* **For the Coach**: *is the SQL reasonably clean and consistent?* Yes, and was in code; the
  mess was the changesets, now gone. Alternative not taken: drop the trigger by having each
  adapter statement call `pg_notify` itself (no opt-in SQL, no "listen without trigger hears
  nothing" footgun), at the cost of a CTE in every write and of missing writes made outside the
  adapter. Recommend keeping the trigger.
