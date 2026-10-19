-- safebyok-postgres: the tables a safebyok vault is stored in. For Postgres 14 or later, in a
-- UTF8 database. Safe to run again: it creates only the tables that are missing, and never
-- changes the columns or keys of one already there.
--
-- Each record is stored field by field, a column to a field, exactly as safebyok wrote it:
-- text as text, a time or a count as a bigint, and each structured value -- an encrypted value
-- (a cipherIv and its ciphertext), or the vault props' list of wayins -- as one opaque jsonb. A record's secret fields are ciphertext, every one.

-- One row of vault props per vault.
CREATE TABLE IF NOT EXISTS safebyok_vaults (
  applabel         text   NOT NULL,
  user_id          text   NOT NULL,
  vaultlabel       text   NOT NULL,
  vault_id         text   NOT NULL,
  format           text   NOT NULL,
  unlock_epoch     bigint NOT NULL,
  vault_key_epoch  bigint NOT NULL,
  wayins           jsonb  NOT NULL,
  registered_at    bigint NOT NULL,
  PRIMARY KEY (applabel, user_id, vaultlabel),
  -- What a box's foreign key names: its vault, down to the vault_id.
  UNIQUE (applabel, user_id, vaultlabel, vault_id)
);

-- One box per boxlabel, beside its vault's scope and vault_id. A box stands only while
-- its vault's props do, under the same vault_id: deleting the vault deletes its boxes with
-- it, and no write can leave a box in a vault made anew. The sidecar is kept as the JSON
-- text it was written as, never jsonb, which would rewrite it: that text is bound into the box.
CREATE TABLE IF NOT EXISTS safebyok_boxes (
  applabel               text   NOT NULL,
  user_id                text   NOT NULL,
  vaultlabel             text   NOT NULL,
  vault_id               text   NOT NULL,
  format                 text   NOT NULL,
  boxlabel               text   NOT NULL,
  revision_tok           text   NOT NULL,
  vault_key_epoch        bigint NOT NULL,
  box_key_wrapped        jsonb  NOT NULL,
  whisper_ciphered       jsonb  NOT NULL,
  whisper_codec          text   NOT NULL,
  whisper_schema_version bigint NOT NULL,
  sidecar_json           text   NOT NULL,
  registered_at          bigint NOT NULL,
  written_at             bigint NOT NULL,
  PRIMARY KEY (applabel, user_id, vaultlabel, boxlabel),
  FOREIGN KEY (applabel, user_id, vaultlabel, vault_id)
    REFERENCES safebyok_vaults (applabel, user_id, vaultlabel, vault_id) ON DELETE CASCADE
);

-- Row-level security on, with no policy: the tables' owner -- the role your server connects as --
-- reaches them as before, and every other role reaches no row at all. On Supabase, that keeps
-- them out of the Data API's reach.
ALTER TABLE safebyok_vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE safebyok_boxes  ENABLE ROW LEVEL SECURITY;
