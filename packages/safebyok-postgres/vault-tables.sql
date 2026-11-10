-- safebyok-postgres: the two tables safebyok stores its rows in. For Postgres 14 or later.
-- Safe to run again: it creates only what is missing.
--
-- Each row stores the record safebyok wrote as one jsonb column, next to the columns it is looked up by.
-- Every secret field of a record is ciphertext.

CREATE TABLE IF NOT EXISTS safebyok_vaults (
  applabel   text  NOT NULL,
  user_id    text  NOT NULL,
  vaultlabel text  NOT NULL,
  vault      jsonb NOT NULL,
  PRIMARY KEY (applabel, user_id, vaultlabel)
);

-- A box row is keyed by its vault's vault_tok, which changes each time the vault is created anew.
-- The box rows of an ended vault life stay until tidyGone removes them.
CREATE TABLE IF NOT EXISTS safebyok_boxes (
  applabel   text  NOT NULL,
  user_id    text  NOT NULL,
  vaultlabel text  NOT NULL,
  vault_tok  text  NOT NULL,
  boxlabel   text  NOT NULL,
  box        jsonb NOT NULL,
  PRIMARY KEY (applabel, user_id, vaultlabel, vault_tok, boxlabel)
);

-- Row-level security is on, with no policy. The role that owns the tables (the one your server
-- connects as) can reach every row. No other role can reach any, including Supabase's Data API roles.
ALTER TABLE safebyok_vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE safebyok_boxes  ENABLE ROW LEVEL SECURITY;
