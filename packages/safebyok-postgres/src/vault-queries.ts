/** The SQL that PostgresVaultDB runs: one statement per constant, each written out whole so it can be read, and run by hand, on its own. */

// A row is answered as one JSON object shaped like the record it was stored from, so a bigint column arrives as a number:
// a driver hands a bare bigint over as text. `safebyok_record` drops the columns that are null, where the record had no such field.

// == [Vault rows]: ListVaultsSql, GetVaultSql

/** Every vault row of a user, by vaultlabel. */
export const ListVaultsSql = `
  SELECT vaultlabel, safebyok_record(to_jsonb(vault)) AS vault
  FROM   safebyok_vaults AS vault
  WHERE  (applabel, user_id) = ($1, $2)
  ORDER  BY vaultlabel
`
/** The vault row at a scope. */
export const GetVaultSql = `
  SELECT safebyok_record(to_jsonb(vault)) AS vault
  FROM   safebyok_vaults AS vault
  WHERE  (applabel, user_id, vaultlabel) = ($1, $2, $3)
`
// --

// == [A vault's write]: BirthVaultSql, ReviseVaultSql
// Each calls a function of `vault-functions.ts`, which tests the record against what is stored and stores it.
// It answers one row: `ok`, `act`, `vault`, `presence` and `swept`.

/** Store a vault's first record. Parameters: the record as JSON text, then the channel and text of its notice. */
export const BirthVaultSql = 'SELECT * FROM safebyok_birth_vault($1::text::jsonb, $2, $3)'
/** Store a vault's next record over the row expected. Parameters: those of {@link BirthVaultSql}, then the expected `revision_tok` and `am`. */
export const ReviseVaultSql = 'SELECT * FROM safebyok_revise_vault($1::text::jsonb, $2, $3, $4, $5)'
// --

// == [Box rows]: GetBoxWithVaultSql, ListBoxesWithVaultSql
// A read of a box together with its vault is one statement, so both rows come from the same snapshot.

/** A box row, and its vault row as `world`. */
export const GetBoxWithVaultSql = `
  SELECT (
    SELECT safebyok_record(to_jsonb(vault)) FROM safebyok_vaults AS vault
    WHERE  (applabel, user_id, vaultlabel) = ($1, $2, $3)
  ) AS world, (
    SELECT safebyok_record(to_jsonb(box)) FROM safebyok_boxes AS box
    WHERE  (applabel, user_id, vaultlabel, vault_tok, boxlabel) = ($1, $2, $3, $4, $5)
  ) AS box
`
/** A vault row and the box rows of one of its lives, by boxlabel. */
export const ListBoxesWithVaultSql = `
  SELECT (
    SELECT safebyok_record(to_jsonb(vault)) FROM safebyok_vaults AS vault
    WHERE  (applabel, user_id, vaultlabel) = ($1, $2, $3)
  ) AS vault, COALESCE((
    SELECT jsonb_agg(jsonb_build_object('boxlabel', boxlabel, 'box', safebyok_record(to_jsonb(box))) ORDER BY boxlabel)
    FROM   safebyok_boxes AS box
    WHERE  (applabel, user_id, vaultlabel, vault_tok) = ($1, $2, $3, $4)
  ), '[]'::jsonb) AS boxes
`
// --

// == [A box's write]: BirthBoxSql, ReviseBoxSql
// Each calls a function of `vault-functions.ts`. It answers one row: `ok`, `act`, `world`, `box`, `presence` and `boxcount`.

/** Store a box's first record. Parameters: the record as JSON text, the channel and text of its notice, then the cap on live boxes. */
export const BirthBoxSql = 'SELECT * FROM safebyok_birth_box($1::text::jsonb, $2, $3, $4)'
/** Store a box's next record over the row expected. Parameters: those of {@link BirthBoxSql}, then the expected `revision_tok` and `am`. */
export const ReviseBoxSql = 'SELECT * FROM safebyok_revise_box($1::text::jsonb, $2, $3, $4, $5, $6)'
// --

// == [Tidying]: BoxLivesSql, DeleteBoxLifeSql

/** The number of box rows stored for each vault life of a user. */
export const BoxLivesSql = `
  SELECT vaultlabel, vault_tok, count(*)::int AS boxcount
  FROM   safebyok_boxes
  WHERE  (applabel, user_id) = ($1, $2)
  GROUP  BY vaultlabel, vault_tok
  ORDER  BY vaultlabel, vault_tok
`
/** Remove every box row of one vault life. */
export const DeleteBoxLifeSql = `
  DELETE FROM safebyok_boxes
  WHERE  (applabel, user_id, vaultlabel, vault_tok) = ($1, $2, $3, $4)
`
// --

// == [Plain row writes]: GetBoxSql, BoxesOfLifeSql, BoxAndRoomSql, LockVaultSql, ClaimVaultSql, WriteVaultSql, WriteBoxSql
// PostgresVaultDB no longer runs these: the tests of the tables' rows do, until they move to the functions.

/** The box row at an address. */
export const GetBoxSql = `
  SELECT safebyok_record(to_jsonb(box)) AS box
  FROM   safebyok_boxes AS box
  WHERE  (applabel, user_id, vaultlabel, vault_tok, boxlabel) = ($1, $2, $3, $4, $5)
`
/** Every box row of one vault life, by boxlabel. */
export const BoxesOfLifeSql = `
  SELECT boxlabel, safebyok_record(to_jsonb(box)) AS box
  FROM   safebyok_boxes AS box
  WHERE  (applabel, user_id, vaultlabel, vault_tok) = ($1, $2, $3, $4)
  ORDER  BY boxlabel
`
/** The box row at an address, and how many live boxes its vault life has. */
export const BoxAndRoomSql = `
  SELECT (
    SELECT safebyok_record(to_jsonb(box)) FROM safebyok_boxes AS box
    WHERE  (applabel, user_id, vaultlabel, vault_tok, boxlabel) = ($1, $2, $3, $4, $5)
  ) AS box, (
    SELECT count(*)::int FROM safebyok_boxes
    WHERE  (applabel, user_id, vaultlabel, vault_tok) = ($1, $2, $3, $4) AND am = 'a'
  ) AS used
`
/** The vault row at a scope, locked until the transaction ends. */
export const LockVaultSql = `
  SELECT safebyok_record(to_jsonb(vault)) AS vault
  FROM   safebyok_vaults AS vault
  WHERE  (applabel, user_id, vaultlabel) = ($1, $2, $3)
  FOR UPDATE
`
/** Store the vault record `$1` where no row is stored; answers no row if one is. */
export const ClaimVaultSql = `
  INSERT INTO safebyok_vaults
  SELECT * FROM jsonb_populate_record(NULL::safebyok_vaults, $1::text::jsonb)
  ON CONFLICT (applabel, user_id, vaultlabel)
  DO NOTHING
  RETURNING vaultlabel
`
/** Store the vault record `$1`, over any row stored. */
export const WriteVaultSql = `
  INSERT INTO safebyok_vaults
  SELECT * FROM jsonb_populate_record(NULL::safebyok_vaults, $1::text::jsonb)
  ON CONFLICT (applabel, user_id, vaultlabel)
  DO UPDATE SET
    fmt = EXCLUDED.fmt, am = EXCLUDED.am, revision_tok = EXCLUDED.revision_tok, revision_seq = EXCLUDED.revision_seq,
    registered_at = EXCLUDED.registered_at, written_at = EXCLUDED.written_at, vault_tok = EXCLUDED.vault_tok, gate = EXCLUDED.gate
`
/** Store the box record `$1`, over any row stored. */
export const WriteBoxSql = `
  INSERT INTO safebyok_boxes
  SELECT * FROM jsonb_populate_record(NULL::safebyok_boxes, $1::text::jsonb)
  ON CONFLICT (applabel, user_id, vaultlabel, vault_tok, boxlabel)
  DO UPDATE SET
    fmt = EXCLUDED.fmt, am = EXCLUDED.am, revision_tok = EXCLUDED.revision_tok, revision_seq = EXCLUDED.revision_seq,
    registered_at = EXCLUDED.registered_at, written_at = EXCLUDED.written_at, box_tok = EXCLUDED.box_tok,
    whisper_codec = EXCLUDED.whisper_codec, whisper_schema_version = EXCLUDED.whisper_schema_version,
    sidecar = EXCLUDED.sidecar, box_key_wrapped = EXCLUDED.box_key_wrapped, whisper_ciphered = EXCLUDED.whisper_ciphered
`
// --
