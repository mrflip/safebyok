# C1 look-ahead from thread A1b: one atomic conditional putBox per backend (2026-10-19)

For C1's worker: how each adapter would write a box conditionally and report what stands
(`meta.box_stored`), in one statement or transaction. Notes, not built.

* **Postgres, one statement.** A plain `SELECT` in the same statement reads the statement's
  snapshot, so it can miss a winner that committed while the write waited; a row lock reads the
  latest. So make the miss lock the row too:
  * *A replace* (`revision_tok` given): `UPDATE safebyok_boxes SET (cols) = CASE WHEN
    revision_tok = $expected THEN ROW(new) ELSE ROW(cols) END WHERE <scope, boxlabel, vault_id>
    AND EXISTS (vault FOR SHARE) RETURNING cols, revision_tok = $new AS landed`. Under READ
    COMMITTED the UPDATE waits for a concurrent writer, re-reads the latest row (EvalPlanQual),
    and `RETURNING` hands back the winner when it did not land. A no-op update costs a dead tuple
    and fires triggers: guard `VaultNotifySql` with `WHEN (OLD IS DISTINCT FROM NEW)`.
  * *A first write* (`null`): `INSERT ... ON CONFLICT (pk) DO UPDATE SET format =
    safebyok_boxes.format RETURNING cols, revision_tok = $new AS landed`, the trick
    `EnsureVaultPropsSql` already uses: the conflict path locks and returns the standing row (a C3
    tombstone included, once its ciphertext columns are nullable). The limit's count and the
    `FOR SHARE` vault read stay as `InsertBoxSql` has them; no row, or no vault, is
    `vault_mismatch`, and a second read of `safebyok_vaults` supplies `vault_props_stored`.
  * A transaction (`SELECT ... FOR UPDATE`, compare, write) would do it too, but asks the
    `PostgresClient` for one, which it does not ask today.
* **Convex, one mutation.** A mutation is a serializable transaction, retried by Convex on
  conflict: read the box by its index, compare `revision_tok`, and either write or return the
  standing row (or tombstone) as `{ landed: false, box_stored }`, in the same handler. `putBox`'s
  `returns` validator becomes a union of the stored box and the miss.
* **GraphQL, over the server's VaultDB.** The server's Postgres VaultDB does the write; the miss
  crosses as the `stale_write` GraphQL error with `extensions.meta.box_stored` (a stored record,
  or null), which the browser's base validates like any read. A typed union result
  (`SafebyokBox | SafebyokStaleWrite`) is the alternative; `extensions.meta` keeps one path for
  every refusal, and serves `vault_props_stored` and `capacity` too. Recommend `extensions.meta`.
* **The Postgres route recipe**: the refusal body gains `meta`, and the client half hands it to
  the VaultError.

