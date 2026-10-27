-- safebyok-postgres: the tables a safebyok vault is stored in. For Postgres 14 or later, in a
-- UTF8 database. Safe to run again: it creates only the tables that are missing, and never
-- changes the columns or keys of one already there.
--
-- Each record is stored field by field, a column to a field, exactly as safebyok wrote it:
-- text as text, a time or a count as a bigint, and each structured value -- an encrypted value
-- (a cipherIv and its ciphertext), or one of the two ways in of a vault record's gate -- as one
-- opaque jsonb. A record's secret fields are ciphertext, every one.

-- One row per vault record: its gate's passphrase and passkey, each a column, both null until
-- its gate is made (gate_epoch 0), then its passphrase always, and its passkey null when it has
-- none; the adapter nests the two as the record's gate. Its
-- vault_epoch is moved up by the statements that write its gate and delete it, never by a client.
CREATE TABLE IF NOT EXISTS safebyok_vaults (
  applabel         text   NOT NULL,
  user_id          text   NOT NULL,
  vaultlabel       text   NOT NULL,
  vault_tok        text   NOT NULL,
  format           text   NOT NULL,
  vault_epoch      bigint NOT NULL,
  gate_epoch       bigint NOT NULL,
  passphrase       jsonb,
  passkey          jsonb,
  registered_at    bigint NOT NULL,
  PRIMARY KEY (applabel, user_id, vaultlabel),
  -- What a box's foreign key names: its vault, down to the vault_tok.
  UNIQUE (applabel, user_id, vaultlabel, vault_tok)
);

-- What a deleted vault leaves in its scope: its counter, which the next vault made there carries
-- on. A scope holds a vault record's row or a tombstone, never both: a deletion moves the one to
-- the other in one statement, and a vault made anew moves it back.
CREATE TABLE IF NOT EXISTS safebyok_vault_tombstones (
  applabel         text   NOT NULL,
  user_id          text   NOT NULL,
  vaultlabel       text   NOT NULL,
  format           text   NOT NULL,
  vault_epoch      bigint NOT NULL,
  PRIMARY KEY (applabel, user_id, vaultlabel)
);

-- One box per boxlabel, beside its vault's scope and vault_tok. A box is stored only while
-- its vault record is, under the same vault_tok: deleting the vault deletes its boxes with
-- it, and no write can leave a box in a vault made anew. The sidecar is the app's own JSON object,
-- {} for none, kept as jsonb, so a server can query it: the box binds it with its keys sorted, so
-- jsonb's own order changes nothing.
CREATE TABLE IF NOT EXISTS safebyok_boxes (
  applabel               text   NOT NULL,
  user_id                text   NOT NULL,
  vaultlabel             text   NOT NULL,
  vault_tok              text   NOT NULL,
  format                 text   NOT NULL,
  boxlabel               text   NOT NULL,
  revision_tok           text   NOT NULL,
  box_key_wrapped        jsonb  NOT NULL,
  whisper_ciphered       jsonb  NOT NULL,
  whisper_codec          text   NOT NULL,
  whisper_schema_version bigint NOT NULL,
  sidecar                jsonb  NOT NULL DEFAULT '{}',
  registered_at          bigint NOT NULL,
  written_at             bigint NOT NULL,
  PRIMARY KEY (applabel, user_id, vaultlabel, boxlabel),
  FOREIGN KEY (applabel, user_id, vaultlabel, vault_tok)
    REFERENCES safebyok_vaults (applabel, user_id, vaultlabel, vault_tok) ON DELETE CASCADE
);

-- Row-level security on, with no policy: the tables' owner -- the role your server connects as --
-- reaches them as before, and every other role reaches no row at all. On Supabase, that keeps
-- them out of the Data API's reach.
ALTER TABLE safebyok_vaults           ENABLE ROW LEVEL SECURITY;
ALTER TABLE safebyok_vault_tombstones ENABLE ROW LEVEL SECURITY;
ALTER TABLE safebyok_boxes            ENABLE ROW LEVEL SECURITY;
