/** The SQL that PostgresVaultDB runs: one statement per constant. One that finds rows numbers its parameters in the order of the row's address; one that stores a record takes it as JSON text. */

import * as DB from 'safebyok/storage'

// The void `revision_seq` as an SQL literal: a record stored over no row is one past it.
const VoidSeqSql = String(DB.VoidRevisionSeq)

// A row is answered as one JSON object shaped like the record it was stored from, so a bigint column arrives as a number:
// a driver hands a bare bigint over as text.
// to_jsonb gives a null column as a JSON null, where the record had no such field. Those are dropped at the top level only:
// jsonb_strip_nulls would also drop a null inside `gate` or `sidecar`.
/** The record of the row `rowSql` names: a JSON object with a field for each column that is not null, or null where there is no row. */
function recordSqlOf(rowSql: string): string {
  return `(SELECT jsonb_object_agg(col.key, col.value) FROM jsonb_each(to_jsonb(${rowSql})) AS col WHERE col.value <> 'null'::jsonb)`
}
/** The record of the row aliased `stored`. */
const RecordSql = recordSqlOf('stored')

/** What is stored where `rowSql` names a row or none: `'void'`, `'live'` or `'gone'`. */
function presenceSqlOf(rowSql: string): string {
  return `CASE WHEN ${rowSql} IS NULL THEN 'void' WHEN (${rowSql}).am = 'a' THEN 'live' ELSE 'gone' END`
}

// == [Vault rows]: ListVaultsSql, GetVaultSql

/** Every vault row of a user, by vaultlabel. */
export const ListVaultsSql = `SELECT vaultlabel, ${RecordSql} AS vault FROM safebyok_vaults AS stored WHERE applabel = $1 AND user_id = $2 ORDER BY vaultlabel`
/** The vault row at a scope. */
export const GetVaultSql = `SELECT ${RecordSql} AS vault FROM safebyok_vaults AS stored WHERE applabel = $1 AND user_id = $2 AND vaultlabel = $3`
// --

// == [A vault's write]: BirthVaultSql, ReviseVaultSql
// Each is one statement that tests and stores. It raises nothing where it stores nothing, and answers one row:
//   ok        -- the record was stored
//   act       -- 'born', 'replaced', 'deleted' or 'reborn' where it was, else null: the classifier names a refusal from the rows
//   vault     -- the vault row stored, or else the one found, null for none
//   presence  -- what was stored before: 'void', 'live' or 'gone'
//   told      -- the notices sent: one where the record was stored
// Parameters: `$1` to `$3` the vault's scope, `$4` the record as JSON text, `$5` and `$6` the channel and text of its notice.

/** The columns of a vault row outside its scope, and the same columns of the row `record`. */
const VaultFieldsSql = 'fmt, am, revision_tok, revision_seq, registered_at, written_at, vault_tok, gate'
const VaultRecordFieldsSql = 'record.fmt, record.am, record.revision_tok, record.revision_seq, record.registered_at, record.written_at, record.vault_tok, record.gate'

// `found` locks the vault row as an UPDATE would, so a statement that waited for another writer of the vault is given the row that writer stored.
// That lock does not wait for a box's write, nor a box's write for it.
/** The opening of a vault's write: the row `record` made of `$4`, and `found`, the vault row at the scope, locked until the transaction ends. */
const VaultWriteReadsSql = `
  WITH record AS MATERIALIZED (
    SELECT * FROM jsonb_populate_record(NULL::safebyok_vaults, $4::text::jsonb)
  ), found AS MATERIALIZED (
    SELECT vault FROM safebyok_vaults AS vault
    WHERE  (applabel, user_id, vaultlabel) = ($1, $2, $3)
    FOR NO KEY UPDATE
  )`

// Two callers that create one vault at once: the second waits, stores nothing, and answers no vault,
// since the row the first stored came after this statement began.
/** Store a vault's first record, for a caller that expects no vault row: it is stored where none is. */
export const BirthVaultSql = `${VaultWriteReadsSql}, written AS (
    INSERT INTO safebyok_vaults AS vault
           (applabel, user_id, vaultlabel, ${VaultFieldsSql})
    SELECT  $1::text, $2::text, $3::text, ${VaultRecordFieldsSql}
    FROM   record
    WHERE  record.am = 'a'
      AND  record.revision_seq = ${VoidSeqSql} + 1
    ON CONFLICT (applabel, user_id, vaultlabel) DO NOTHING
    RETURNING vault
  ), notified AS MATERIALIZED (
    SELECT pg_notify($5::text, $6::text) FROM written
  )
  SELECT EXISTS (SELECT FROM written)                                                    AS ok,
         CASE WHEN EXISTS (SELECT FROM written) THEN 'born' END                          AS act,
         ${recordSqlOf('COALESCE((SELECT vault FROM written), (SELECT vault FROM found))')} AS vault,
         CASE WHEN EXISTS (SELECT FROM written) THEN 'void'
              ELSE ${presenceSqlOf('(SELECT vault FROM found)')} END AS presence,
         (SELECT count(*)::int FROM notified)                                            AS told
`

// The statement holds no policy: its caller runs it only where the ask may store a record over the row it expects,
// which is a replace of a live vault, a del of one, or a put over a tombstone.
// `swept` removes the box rows of the vault's other lives, which nothing reads once the vault_tok has changed.
// It skips a box row another writer holds, and a box written as the vault's life ends is missed: tidyGone removes those.
/** Store a vault's next record over the row a caller expects, live or a tombstone: it is stored where the stored row has the expected `revision_tok` and `am`
 * and the record is one `revision_seq` past it. A tombstone is never stored over a tombstone. The box rows of the vault's other lives are deleted with it.
 * It answers `swept` too, the number of box rows deleted.
 *
 * Parameters: those of a vault's write, then `$7` and `$8` the expected `revision_tok` and `am`.
 */
export const ReviseVaultSql = `${VaultWriteReadsSql}, written AS (
    UPDATE safebyok_vaults AS vault
    SET    (${VaultFieldsSql})
         = (${VaultRecordFieldsSql})
    FROM   record
    WHERE  (vault.applabel, vault.user_id, vault.vaultlabel) = ($1, $2, $3)
      AND  vault.revision_tok = $7
      AND  vault.am = $8
      AND  vault.revision_seq = record.revision_seq - 1
      AND  ((vault.am = 'a') OR (record.am = 'a'))
    RETURNING vault
  ), swept AS (
    DELETE FROM safebyok_boxes AS box
    USING (
      SELECT doomed.applabel, doomed.user_id, doomed.vaultlabel, doomed.vault_tok, doomed.boxlabel
      FROM   safebyok_boxes AS doomed, written
      WHERE  (doomed.applabel, doomed.user_id, doomed.vaultlabel) = ($1, $2, $3)
        AND  doomed.vault_tok <> (written.vault).vault_tok
      FOR UPDATE OF doomed SKIP LOCKED
    ) AS doomed
    WHERE  (box.applabel, box.user_id, box.vaultlabel, box.vault_tok, box.boxlabel)
         = (doomed.applabel, doomed.user_id, doomed.vaultlabel, doomed.vault_tok, doomed.boxlabel)
    RETURNING box.boxlabel
  ), notified AS MATERIALIZED (
    SELECT pg_notify($5::text, $6::text) FROM written
  )
  SELECT EXISTS (SELECT FROM written)                                                    AS ok,
         CASE WHEN NOT EXISTS (SELECT FROM written)        THEN NULL
              WHEN $8 <> 'a'                               THEN 'reborn'
              WHEN (SELECT am FROM record) = 'a'           THEN 'replaced'
              ELSE                                              'deleted' END            AS act,
         ${recordSqlOf('COALESCE((SELECT vault FROM written), (SELECT vault FROM found))')} AS vault,
         CASE WHEN NOT EXISTS (SELECT FROM written) THEN ${presenceSqlOf('(SELECT vault FROM found)')}
              WHEN $8 = 'a'                         THEN 'live'
              ELSE                                       'gone' END                      AS presence,
         (SELECT count(*)::int FROM swept)                                               AS swept,
         (SELECT count(*)::int FROM notified)                                            AS told
`
// --

// == [Plain row writes]: LockVaultSql, ClaimVaultSql, WriteVaultSql
// PostgresVaultDB no longer runs these: the tests of the tables' rows do, until they move to the statements above.

/** The vault row at a scope, locked until the transaction ends. */
export const LockVaultSql = `${GetVaultSql} FOR UPDATE`

// jsonb_populate_record gives each column the record's field of its name, and null where the record has no such field.
/** Store the vault record `$1` where no row is stored; answers no row if one is. */
export const ClaimVaultSql = `
  INSERT INTO safebyok_vaults
  SELECT * FROM jsonb_populate_record(NULL::safebyok_vaults, $1::text::jsonb)
  ON CONFLICT (applabel, user_id, vaultlabel)
  DO NOTHING
  RETURNING vaultlabel
`
// Every column outside the address is set, so a tombstone stored over a live row leaves `gate` null.
/** Store the vault record `$1`, over any row stored. */
export const WriteVaultSql = `
  INSERT INTO safebyok_vaults
  SELECT * FROM jsonb_populate_record(NULL::safebyok_vaults, $1::text::jsonb)
  ON CONFLICT (applabel, user_id, vaultlabel)
  DO UPDATE SET
    fmt = EXCLUDED.fmt, am = EXCLUDED.am, revision_tok = EXCLUDED.revision_tok, revision_seq = EXCLUDED.revision_seq,
    registered_at = EXCLUDED.registered_at, written_at = EXCLUDED.written_at, vault_tok = EXCLUDED.vault_tok, gate = EXCLUDED.gate
`
// --

// == [Box rows]: BoxesOfLifeSql, GetBoxSql, WriteBoxSql

/** Every box row of one vault life, by boxlabel. */
export const BoxesOfLifeSql = `SELECT boxlabel, ${RecordSql} AS box FROM safebyok_boxes AS stored WHERE applabel = $1 AND user_id = $2 AND vaultlabel = $3 AND vault_tok = $4 ORDER BY boxlabel`
/** The box row at an address. */
export const GetBoxSql = `SELECT ${RecordSql} AS box FROM safebyok_boxes AS stored WHERE applabel = $1 AND user_id = $2 AND vaultlabel = $3 AND vault_tok = $4 AND boxlabel = $5`

// Every column outside the address is set, so a tombstone stored over a live row leaves its sidecar and ciphered columns null.
/** What an upsert of a box row sets, from the row it would have inserted. */
const BoxSetSql = `
      fmt = EXCLUDED.fmt, am = EXCLUDED.am, revision_tok = EXCLUDED.revision_tok, revision_seq = EXCLUDED.revision_seq,
      registered_at = EXCLUDED.registered_at, written_at = EXCLUDED.written_at, box_tok = EXCLUDED.box_tok,
      whisper_codec = EXCLUDED.whisper_codec, whisper_schema_version = EXCLUDED.whisper_schema_version,
      sidecar = EXCLUDED.sidecar, box_key_wrapped = EXCLUDED.box_key_wrapped, whisper_ciphered = EXCLUDED.whisper_ciphered`

/** Store the box record `$1`, over any row stored. */
export const WriteBoxSql = `
  INSERT INTO safebyok_boxes
  SELECT * FROM jsonb_populate_record(NULL::safebyok_boxes, $1::text::jsonb)
  ON CONFLICT (applabel, user_id, vaultlabel, vault_tok, boxlabel)
  DO UPDATE SET ${BoxSetSql}
`

/** The columns of a box row outside its address, and the same columns of the row `record`. */
const BoxFieldsSql = `fmt, am, revision_tok, revision_seq, registered_at, written_at, box_tok,
            whisper_codec, whisper_schema_version, sidecar, box_key_wrapped, whisper_ciphered`
const BoxRecordFieldsSql = `record.fmt, record.am, record.revision_tok, record.revision_seq, record.registered_at, record.written_at, record.box_tok,
            record.whisper_codec, record.whisper_schema_version, record.sidecar, record.box_key_wrapped, record.whisper_ciphered`

// --

// == [A box's write]: BirthBoxSql, ReviseBoxSql
// Each is one statement that tests and stores. It raises nothing where it stores nothing, and answers one row:
//   ok        -- the record was stored
//   act       -- 'born', 'replaced', 'deleted' or 'reborn' where it was, else null: the classifier names a refusal from the rows
//   world     -- the vault row found, null for none
//   box       -- the box row stored, or else the one found, null for none
//   presence  -- what was stored before: 'void', 'live' or 'gone'
//   boxcount  -- the live boxes of the vault life, counted before the write
//   told      -- the notices sent: one where the record was stored
// Parameters: `$1` to `$5` the box's address, `$6` the record as JSON text, `$7` the cap on live boxes, `$8` and `$9` the channel and text of its notice.

// What a box's write locks, and what waits for it:
// - `world` locks nothing. A write that crosses a vault's del or rebirth may be stored in a vault life that has just ended:
//   that life's box rows are never read again, and the vault's next write or tidyGone removes them. A box's write and a vault's never wait for each other.
// - `found` locks the box row as its UPDATE would, so a statement that waited for another writer of that box is given the row
//   that writer stored. A box row inserted after the statement began is not found.
// - `counted` locks nothing: the cap is soft.
/** The opening of a box's write: the row `record` made of `$6`, and what is stored at the address.
 * - `world`   -- the vault row at the box's scope
 * - `found`   -- the box row at the address, locked until the transaction ends
 * - `counted` -- `boxcount`, the live boxes of the vault life
 */
const BoxWriteReadsSql = `
  WITH record AS MATERIALIZED (
    SELECT * FROM jsonb_populate_record(NULL::safebyok_boxes, $6::text::jsonb)
  ), world AS MATERIALIZED (
    SELECT vault FROM safebyok_vaults AS vault
    WHERE  (applabel, user_id, vaultlabel) = ($1, $2, $3)
  ), found AS MATERIALIZED (
    SELECT box FROM safebyok_boxes AS box
    WHERE  (applabel, user_id, vaultlabel, vault_tok, boxlabel) = ($1, $2, $3, $4, $5)
    FOR NO KEY UPDATE
  ), counted AS MATERIALIZED (
    SELECT count(*)::int AS boxcount
    FROM   safebyok_boxes
    WHERE  (applabel, user_id, vaultlabel, vault_tok) = ($1, $2, $3, $4) AND am = 'a'
  )`

// Two callers that insert one box at once: the second waits, stores nothing, and answers no box,
// since the row the first stored came after this statement began.
/** Store a box's first record, for a caller that expects no box row: it is stored where none is, in a live vault of the box's life with room under the cap. */
export const BirthBoxSql = `${BoxWriteReadsSql}, written AS (
    INSERT INTO safebyok_boxes AS box
           (applabel, user_id, vaultlabel, vault_tok, boxlabel,
            ${BoxFieldsSql})
    SELECT  $1::text, $2::text, $3::text, $4::text, $5::text,
            ${BoxRecordFieldsSql}
    FROM   record, world, counted
    WHERE  (world.vault).vault_tok = $4 AND (world.vault).am = 'a'
      AND  record.am = 'a'
      AND  record.revision_seq = ${VoidSeqSql} + 1
      AND  counted.boxcount < $7::int
    ON CONFLICT (applabel, user_id, vaultlabel, vault_tok, boxlabel) DO NOTHING
    RETURNING box
  ), notified AS MATERIALIZED (
    SELECT pg_notify($8::text, $9::text) FROM written
  )
  SELECT EXISTS (SELECT FROM written)                                                    AS ok,
         CASE WHEN EXISTS (SELECT FROM written) THEN 'born' END                          AS act,
         ${recordSqlOf('(SELECT vault FROM world)')}                                    AS world,
         ${recordSqlOf('COALESCE((SELECT box FROM written), (SELECT box FROM found))')} AS box,
         CASE WHEN EXISTS (SELECT FROM written) THEN 'void'
              ELSE ${presenceSqlOf('(SELECT box FROM found)')} END AS presence,
         counted.boxcount,
         (SELECT count(*)::int FROM notified)                                            AS told
  FROM   counted
`

// The statement holds no policy: its caller runs it only where the ask may store a record over the row it expects,
// which is a replace of a live box, a del of one, or a put over a tombstone.
/** Store a box's next record over the row a caller expects, live or a tombstone: it is stored where the stored row has the expected `revision_tok` and `am`,
 * the record is one `revision_seq` past it, and the vault is live in the box's life. A live record over a tombstone also needs room under the cap, and a tombstone is never stored over a tombstone.
 *
 * Parameters: those of a box's write, then `$10` and `$11` the expected `revision_tok` and `am`.
 */
export const ReviseBoxSql = `${BoxWriteReadsSql}, written AS (
    UPDATE safebyok_boxes AS box
    SET    (${BoxFieldsSql})
         = (${BoxRecordFieldsSql})
    FROM   record, world, counted
    WHERE  (box.applabel, box.user_id, box.vaultlabel, box.vault_tok, box.boxlabel) = ($1, $2, $3, $4, $5)
      AND  box.revision_tok = $10
      AND  box.am = $11
      AND  box.revision_seq = record.revision_seq - 1
      AND  (world.vault).vault_tok = $4 AND (world.vault).am = 'a'
      AND  ((box.am = 'a') OR (record.am = 'a'))
      AND  ((box.am = 'a') OR (record.am <> 'a') OR (counted.boxcount < $7::int))
    RETURNING box
  ), notified AS MATERIALIZED (
    SELECT pg_notify($8::text, $9::text) FROM written
  )
  SELECT EXISTS (SELECT FROM written)                                                    AS ok,
         CASE WHEN NOT EXISTS (SELECT FROM written)        THEN NULL
              WHEN $11 <> 'a'                              THEN 'reborn'
              WHEN (SELECT am FROM record) = 'a'           THEN 'replaced'
              ELSE                                              'deleted' END            AS act,
         ${recordSqlOf('(SELECT vault FROM world)')}                                    AS world,
         ${recordSqlOf('COALESCE((SELECT box FROM written), (SELECT box FROM found))')} AS box,
         CASE WHEN NOT EXISTS (SELECT FROM written) THEN ${presenceSqlOf('(SELECT box FROM found)')}
              WHEN $11 = 'a'                        THEN 'live'
              ELSE                                       'gone' END                      AS presence,
         counted.boxcount,
         (SELECT count(*)::int FROM notified)                                            AS told
  FROM   counted
`
// --

// == [Box rows of a life]: BoxLivesSql, BoxAndRoomSql, DeleteBoxLifeSql

/** The number of box rows stored for each vault life of a user. */
export const BoxLivesSql = `SELECT vaultlabel, vault_tok, count(*)::int AS boxcount FROM safebyok_boxes WHERE applabel = $1 AND user_id = $2
  GROUP BY vaultlabel, vault_tok ORDER BY vaultlabel, vault_tok`
// The count is the vault's room. It is taken under no lock of its own: the cap is soft.
/** What a box's put or del reads once its vault row is locked: the box row, and how many live boxes that vault life has. */
export const BoxAndRoomSql = `SELECT (${GetBoxSql}) AS box, (
  SELECT count(*)::int FROM safebyok_boxes WHERE applabel = $1 AND user_id = $2 AND vaultlabel = $3 AND vault_tok = $4 AND am = 'a'
) AS used`
/** Remove every box row of one vault life. */
export const DeleteBoxLifeSql = 'DELETE FROM safebyok_boxes WHERE applabel = $1 AND user_id = $2 AND vaultlabel = $3 AND vault_tok = $4'
// --

// == [A box with its vault]: GetBoxWithVaultSql, ListBoxesWithVaultSql
// A read of a box together with its vault is one statement, so both rows come from the same snapshot.

/** A box row and its vault row. */
export const GetBoxWithVaultSql = `SELECT (${GetVaultSql}) AS vault, (${GetBoxSql}) AS box`
/** A vault row and the box rows of one of its lives, by boxlabel. */
export const ListBoxesWithVaultSql = `SELECT (${GetVaultSql}) AS vault, COALESCE((
  SELECT jsonb_agg(jsonb_build_object('boxlabel', boxlabel, 'box', ${RecordSql}) ORDER BY boxlabel)
  FROM safebyok_boxes AS stored WHERE applabel = $1 AND user_id = $2 AND vaultlabel = $3 AND vault_tok = $4
), '[]'::jsonb) AS boxes`
// --
