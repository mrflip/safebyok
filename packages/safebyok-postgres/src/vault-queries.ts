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

// == [Vault rows]: ListVaultsSql, GetVaultSql, LockVaultSql, BirthVaultSql, WriteVaultSql

/** Every vault row of a user, by vaultlabel. */
export const ListVaultsSql = `SELECT vaultlabel, ${RecordSql} AS vault FROM safebyok_vaults AS stored WHERE applabel = $1 AND user_id = $2 ORDER BY vaultlabel`
/** The vault row at a scope. */
export const GetVaultSql = `SELECT ${RecordSql} AS vault FROM safebyok_vaults AS stored WHERE applabel = $1 AND user_id = $2 AND vaultlabel = $3`
/** The vault row at a scope, locked until the transaction ends. */
export const LockVaultSql = `${GetVaultSql} FOR UPDATE`

// jsonb_populate_record gives each column the record's field of its name, and null where the record has no such field.
/** Store the vault record `$1` where no row is stored; answers no row if one is. */
export const BirthVaultSql = `
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

export const RotateVaultSql = `
WITH tombstoned AS (
  UPDATE safebyok_vaults
  SET    vault_tok = $5, am = $6               -- new token, tombstone am (plus the vault's other fields)
  WHERE  (applabel, user_id, vaultlabel) = ($1, $2, $3) AND vault_tok = $4
  RETURNING vault_tok
), swept AS (
  DELETE FROM safebyok_boxes AS box
  USING (
    SELECT applabel, user_id, vaultlabel, vault_tok, boxlabel
    FROM   safebyok_boxes
    WHERE  (applabel, user_id, vaultlabel) = ($1, $2, $3)
      AND  vault_tok <> (SELECT vault_tok FROM tombstoned)
    FOR UPDATE SKIP LOCKED
  ) AS doomed
  WHERE  (box.applabel, box.user_id, box.vaultlabel, box.vault_tok, box.boxlabel)
       = (doomed.applabel, doomed.user_id, doomed.vaultlabel, doomed.vault_tok, doomed.boxlabel)
  RETURNING box.boxlabel
)
SELECT EXISTS (SELECT FROM tombstoned)   AS tombstoned,
       (SELECT count(*)::int FROM swept) AS swept
`
// --

// == [Box rows]: BoxesOfLifeSql, GetBoxSql, WriteBoxSql, BirthBoxSql, ReviseBoxSql, BoxLivesSql, BoxAndRoomSql, DeleteBoxLifeSql

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

// What a box's write locks, and what waits for it:
// - `world` locks nothing. A write that crosses a vault's del or rebirth may be stored in a vault life that has just ended:
//   that life's box rows are never read again, and tidyGone removes them. So a box's write and a vault's never wait for each other,
//   but for the moment the foreign key holds the vault row's key while a box row is inserted.
// - `found` locks the box row as its UPDATE would, so a statement that waited for another writer of that box is given the row
//   that writer stored. A box row inserted after the statement began is not found.
// - `counted` locks nothing: the cap is soft.
/** The opening of a box's write: the row `record` made of `$6`, the record as JSON text, and what is stored at the address `$1` to `$5`.
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

/** The one row a box's write answers:
 * - `world`    -- the vault row it found, null for none
 * - `box`      -- the box row it stored, or else the one it found, null for none
 * - `boxcount` -- the live boxes of the vault life, counted before the write
 * - `wrote`    -- the record was stored
 */
const BoxWriteAnswerSql = `
  SELECT ${recordSqlOf('(SELECT vault FROM world)')}                                    AS world,
         ${recordSqlOf('COALESCE((SELECT box FROM written), (SELECT box FROM found))')} AS box,
         counted.boxcount,
         EXISTS (SELECT FROM written)                                                   AS wrote
  FROM   counted`

// Two callers that insert one box at once: the second waits, stores nothing, and answers `wrote` false with no box,
// since the row the first stored came after this statement began.
/** Store a box's first record, for a caller that expects no box row: it is stored where none is, in a live vault of the box's life with room under the cap.
 * Where it is not stored nothing is raised: the answer's `world`, `box` and `boxcount` say why.
 *
 * Parameters: `$1` to `$5` the box's address, `$6` the record as JSON text, `$7` the cap on live boxes.
 */
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
  )${BoxWriteAnswerSql}
`

// The statement holds no policy: its caller runs it only where the ask may store a record over the row it expects,
// which is a replace of a live box, a del of one, or a put over a tombstone.
/** Store a box's next record over the row a caller expects, live or a tombstone: it is stored where the stored row has the expected `revision_tok` and `am`,
 * the record is one `revision_seq` past it, and the vault is live in the box's life. A live record over a tombstone also needs room under the cap, and a tombstone is never stored over a tombstone.
 * Where it is not stored nothing is raised: the answer's `world`, `box` and `boxcount` say why.
 *
 * Parameters: `$1` to `$5` the box's address, `$6` the record as JSON text, `$7` the cap on live boxes, `$8` and `$9` the expected `revision_tok` and `am`.
 */
export const ReviseBoxSql = `${BoxWriteReadsSql}, written AS (
    UPDATE safebyok_boxes AS box
    SET    (${BoxFieldsSql})
         = (${BoxRecordFieldsSql})
    FROM   record, world, counted
    WHERE  (box.applabel, box.user_id, box.vaultlabel, box.vault_tok, box.boxlabel) = ($1, $2, $3, $4, $5)
      AND  box.revision_tok = $8
      AND  box.am = $9
      AND  box.revision_seq = record.revision_seq - 1
      AND  (world.vault).vault_tok = $4 AND (world.vault).am = 'a'
      AND  ((box.am = 'a') OR (record.am = 'a'))
      AND  ((box.am = 'a') OR (record.am <> 'a') OR (counted.boxcount < $7::int))
    RETURNING box
  )${BoxWriteAnswerSql}
`

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

// == [Notices]: NotifySql

/** Send each text of `$2` as a notification on the channel `$1`. */
export const NotifySql = 'SELECT pg_notify($1, told) FROM unnest($2::text[]) AS told'
// --
