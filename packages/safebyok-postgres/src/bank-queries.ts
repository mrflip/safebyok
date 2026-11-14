/** The SQL that PostgresBankDB runs, one whole statement per constant. */

// Each is written out whole, so it can be read, and run by hand, on its own.

// Each query returns a row as one JSON object shaped like the record it was stored from, so that a bigint column arrives
// as a number (a driver returns a bare bigint as text). `safebyok_record` drops the null columns: the record had no such field.
// Each read fetches the row asked for and the row above it in one statement, so both rows come from the same snapshot.

// == [Bank rows]: EnsureBankSql, GetBankSql, GetGateWithBankSql

/** A bank row, its `main` gate row, and every vault row stored under its scope, by vaultlabel. */
export const EnsureBankSql = `
  SELECT (
    SELECT safebyok_record(to_jsonb(bank)) FROM safebyok_banks AS bank
    WHERE  (user_id, banklabel) = ($1, $2)
  ) AS bank, (
    SELECT safebyok_record(to_jsonb(gate)) FROM safebyok_gates AS gate
    WHERE  (user_id, banklabel, gatelabel) = ($1, $2, 'main')
  ) AS gate, COALESCE((
    SELECT jsonb_agg(jsonb_build_object('vaultlabel', vaultlabel, 'vault', safebyok_record(to_jsonb(vault))) ORDER BY vaultlabel)
    FROM   safebyok_vaults AS vault
    WHERE  (user_id, banklabel) = ($1, $2)
  ), '[]'::jsonb) AS vaults
`
/** The bank row at a scope. */
export const GetBankSql = `
  SELECT safebyok_record(to_jsonb(bank)) AS bank
  FROM   safebyok_banks AS bank
  WHERE  (user_id, banklabel) = ($1, $2)
`
/** A gate row, and its bank row. */
export const GetGateWithBankSql = `
  SELECT (
    SELECT safebyok_record(to_jsonb(bank)) FROM safebyok_banks AS bank
    WHERE  (user_id, banklabel) = ($1, $2)
  ) AS bank, (
    SELECT safebyok_record(to_jsonb(gate)) FROM safebyok_gates AS gate
    WHERE  (user_id, banklabel, gatelabel) = ($1, $2, $3)
  ) AS gate
`
// --

// == [A bank's or a gate's write]: BirthBankSql, ReviseBankSql, PutGateSql
// Each calls a function in `bank-functions.ts`, which checks the record against the stored rows and stores it.
// It returns one row: `ok`, `act`, `bank`, `gate` and `presence`. When it stores the record, it also sends the notices.
// The bank functions take the bank record, its main gate record (null for a delBank), then the row the ask expects,
// each as JSON text. The gate function takes the gate record, then the row the ask expects, then the ask's policies.

/** Store a bank's first record and its main gate, if no row is stored. */
export const BirthBankSql = 'SELECT * FROM safebyok_birth_bank($1::text::jsonb, $2::text::jsonb, $3::text::jsonb)'
/** Store a bank's next record over the row expected, replacing every row under the bank with its new main gate, if any. */
export const ReviseBankSql = 'SELECT * FROM safebyok_revise_bank($1::text::jsonb, $2::text::jsonb, $3::text::jsonb)'
/** Store a putGate ask's record over the gate row expected, under the storage policies it names. */
export const PutGateSql = 'SELECT * FROM safebyok_put_gate($1::text::jsonb, $2::text::jsonb, $3::text[])'
// --

// == [Vault rows]: GetVaultWithBankSql

/** A vault row, and its bank row. */
export const GetVaultWithBankSql = `
  SELECT (
    SELECT safebyok_record(to_jsonb(bank)) FROM safebyok_banks AS bank
    WHERE  (user_id, banklabel) = ($1, $2)
  ) AS bank, (
    SELECT safebyok_record(to_jsonb(vault)) FROM safebyok_vaults AS vault
    WHERE  (user_id, banklabel, vaultlabel) = ($1, $2, $3)
  ) AS vault
`
// --

// == [A vault's write]: BirthVaultSql, ReviseVaultSql
// Each calls a function in `bank-functions.ts`. It returns one row: `ok`, `act`, `bank`, `vault` and `presence`.
// Both take the same parameters: the record, then the row the ask expects, each as JSON text.

/** Store a vault's first record, if no row of its bank's life is stored. */
export const BirthVaultSql = 'SELECT * FROM safebyok_birth_vault($1::text::jsonb, $2::text::jsonb)'
/** Store a vault's next record over the row expected. */
export const ReviseVaultSql = 'SELECT * FROM safebyok_revise_vault($1::text::jsonb, $2::text::jsonb)'
// --

// == [Box rows]: GetBoxWithVaultSql, ListBoxesWithVaultSql

/** A box row of one life of a vault, and its vault row as `parent`. */
export const GetBoxWithVaultSql = `
  SELECT (
    SELECT safebyok_record(to_jsonb(vault)) FROM safebyok_vaults AS vault
    WHERE  (user_id, banklabel, vaultlabel) = ($1, $2, $3)
  ) AS parent, (
    SELECT safebyok_record(to_jsonb(box)) FROM safebyok_boxes AS box
    WHERE  (user_id, banklabel, vaultlabel, bank_tok, vault_tok, boxlabel) = ($1, $2, $3, $4, $5, $6)
  ) AS box
`
/** The box rows of one life of a vault, by boxlabel, and its vault row as `parent`. */
export const ListBoxesWithVaultSql = `
  SELECT (
    SELECT safebyok_record(to_jsonb(vault)) FROM safebyok_vaults AS vault
    WHERE  (user_id, banklabel, vaultlabel) = ($1, $2, $3)
  ) AS parent, COALESCE((
    SELECT jsonb_agg(jsonb_build_object('boxlabel', boxlabel, 'box', safebyok_record(to_jsonb(box))) ORDER BY boxlabel)
    FROM   safebyok_boxes AS box
    WHERE  (user_id, banklabel, vaultlabel, bank_tok, vault_tok) = ($1, $2, $3, $4, $5)
  ), '[]'::jsonb) AS boxes
`
// --

// == [A box's write]: BirthBoxSql, ReviseBoxSql
// Each calls a function in `bank-functions.ts`. It returns one row: `ok`, `act`, `parent`, `box` and `presence`, and for a birth `boxcount`.
// Both take the same parameters: the record, then the row the ask expects, each as JSON text, then the cap on the vault life's box rows, live and deleted.
// A revise adds no row and does not read the cap.

/** Store a box's first record, if no row is stored in its vault's life. */
export const BirthBoxSql = 'SELECT * FROM safebyok_birth_box($1::text::jsonb, $2::text::jsonb, $3)'
/** Store a box's next record over the row expected. */
export const ReviseBoxSql = 'SELECT * FROM safebyok_revise_box($1::text::jsonb, $2::text::jsonb, $3)'
// --

// == [Tidying]: DeleteEndedVaultsSql, DeleteEndedBoxesSql, CountBoxesSql
// tidyGone runs these in order, in one transaction, each reading the row above from the scope's own rows. A vault row of a later fmt, and the box rows under it, are left alone.

/** Delete every vault row of a bank's scope that is not of the bank's live life. */
export const DeleteEndedVaultsSql = `
  DELETE FROM safebyok_vaults AS vault
  WHERE  (vault.user_id, vault.banklabel) = ($1, $2)
    AND  vault.fmt = 6003
    AND  NOT EXISTS (
      SELECT 1 FROM safebyok_banks AS bank
      WHERE  (bank.user_id, bank.banklabel) = (vault.user_id, vault.banklabel)
        AND  bank.am = 'a' AND bank.bank_tok = vault.bank_tok)
`
/** Delete every box row of a bank's scope that is not of its vault's live life. */
export const DeleteEndedBoxesSql = `
  DELETE FROM safebyok_boxes AS box
  WHERE  (box.user_id, box.banklabel) = ($1, $2)
    AND  NOT EXISTS (
      SELECT 1 FROM safebyok_vaults AS vault
      WHERE  (vault.user_id, vault.banklabel, vault.vaultlabel) = (box.user_id, box.banklabel, box.vaultlabel)
        AND  (vault.fmt <> 6003 OR (vault.am = 'a' AND (vault.bank_tok, vault.vault_tok) = (box.bank_tok, box.vault_tok))))
`
/** The number of box rows left under a bank's scope. */
export const CountBoxesSql = `
  SELECT count(*)::int AS boxcount
  FROM   safebyok_boxes
  WHERE  (user_id, banklabel) = ($1, $2)
`
// --
