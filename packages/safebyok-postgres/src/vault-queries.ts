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
// It answers one row: `ok`, `act`, `vault`, `presence` and `swept`. Where it stores the record it sends the notice of it too.
// Both take the same parameters: the record, then the row its ask expects, each as JSON text.

/** Store a vault's first record, where no row is stored. */
export const BirthVaultSql = 'SELECT * FROM safebyok_birth_vault($1::text::jsonb, $2::text::jsonb)'
/** Store a vault's next record over the row expected. */
export const ReviseVaultSql = 'SELECT * FROM safebyok_revise_vault($1::text::jsonb, $2::text::jsonb)'
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
// Each calls a function of `vault-functions.ts`. It answers one row: `ok`, `act`, `world`, `box` and `presence`, and from a birth `boxcount`.
// Both take the same parameters: the record, then the row its ask expects, each as JSON text, then the cap on the vault life's box rows, live and deleted.
// A revise adds no row and does not read the cap.

/** Store a box's first record, where no row is stored. */
export const BirthBoxSql = 'SELECT * FROM safebyok_birth_box($1::text::jsonb, $2::text::jsonb, $3)'
/** Store a box's next record over the row expected. */
export const ReviseBoxSql = 'SELECT * FROM safebyok_revise_box($1::text::jsonb, $2::text::jsonb, $3)'
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
