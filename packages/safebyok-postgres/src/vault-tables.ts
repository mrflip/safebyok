/** The SQL that makes safebyok's two tables, run once as a migration or at your server's start: `await pool.query(VaultTablesSql)`. */
export const VaultTablesSql = `-- safebyok-postgres: the two tables safebyok stores its rows in. For Postgres 14 or later.
-- Safe to run again: it creates only what is missing.
--
-- Each row is the record safebyok wrote, as one jsonb, beside the columns it is found by.
-- Every secret field of a record is ciphertext.

CREATE TABLE IF NOT EXISTS safebyok_vaults (
  applabel   text  NOT NULL,
  user_id    text  NOT NULL,
  vaultlabel text  NOT NULL,
  vault      jsonb NOT NULL,
  PRIMARY KEY (applabel, user_id, vaultlabel)
);

-- A box row is filed under the life of its vault, its vault_tok, and outlives that life until
-- tidyGone removes it.
CREATE TABLE IF NOT EXISTS safebyok_boxes (
  applabel   text  NOT NULL,
  user_id    text  NOT NULL,
  vaultlabel text  NOT NULL,
  vault_tok  text  NOT NULL,
  boxlabel   text  NOT NULL,
  box        jsonb NOT NULL,
  PRIMARY KEY (applabel, user_id, vaultlabel, vault_tok, boxlabel)
);

-- Row-level security with no policy: the role that owns the tables, which your server connects
-- as, reaches every row, and every other role none (on Supabase, the Data API's among them).
ALTER TABLE safebyok_vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE safebyok_boxes  ENABLE ROW LEVEL SECURITY;
`

