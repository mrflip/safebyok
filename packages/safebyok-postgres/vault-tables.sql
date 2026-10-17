-- safebyok-postgres: the tables a safebyok vault is stored in. For Postgres 14 or later, in a
-- UTF8 database. Safe to run again: it creates only the tables that are missing.
--
-- Each record is stored field by field, a column to a field, exactly as safebyok wrote it:
-- text as text, a time or a count as a bigint, and each structured value -- an encrypted value
-- (a cipherIv and its ciphertext), a bundle's prior vaultKey, or its list of unlock envelopes --
-- as one opaque jsonb. A record's secret fields are ciphertext, every one.

-- One bundle per vault. A null prior_vault_key is a vault still at its first vaultKey.
CREATE TABLE IF NOT EXISTS safebyok_bundles (
  applabel         text   NOT NULL,
  user_id          text   NOT NULL,
  vaultlabel       text   NOT NULL,
  format           text   NOT NULL,
  vault_id         text   NOT NULL,
  unlock_epoch     bigint NOT NULL,
  vault_key_epoch  bigint NOT NULL,
  prior_vault_key  jsonb,
  unlocks          jsonb  NOT NULL,
  registered_at    bigint NOT NULL,
  PRIMARY KEY (applabel, user_id, vaultlabel),
  -- What a lockbox's foreign key names: its vault, down to the vault_id.
  UNIQUE (applabel, user_id, vaultlabel, vault_id)
);

-- One lockbox per boxlabel, beside its vault's scope and vault_id. A lockbox stands only while
-- its vault's bundle does, under the same vault_id: erasing the bundle erases its lockboxes with
-- it, and no write can leave a lockbox in a vault made anew. The public bag is kept as the JSON
-- text it was written as, never jsonb, which would rewrite it: that text is bound into the lockbox.
CREATE TABLE IF NOT EXISTS safebyok_lockboxes (
  applabel               text   NOT NULL,
  user_id                text   NOT NULL,
  vaultlabel             text   NOT NULL,
  vault_id               text   NOT NULL,
  format                 text   NOT NULL,
  boxlabel               text   NOT NULL,
  revision_id            text   NOT NULL,
  vault_key_epoch        bigint NOT NULL,
  lockbox_key_wrapped    jsonb  NOT NULL,
  whisper_ciphered       jsonb  NOT NULL,
  whisper_codec          text   NOT NULL,
  whisper_schema_version bigint NOT NULL,
  public_json            text   NOT NULL,
  registered_at          bigint NOT NULL,
  written_at             bigint NOT NULL,
  PRIMARY KEY (applabel, user_id, vaultlabel, boxlabel),
  FOREIGN KEY (applabel, user_id, vaultlabel, vault_id)
    REFERENCES safebyok_bundles (applabel, user_id, vaultlabel, vault_id) ON DELETE CASCADE
);

-- Row-level security on, with no policy: the tables' owner -- the role your server connects as --
-- reaches them as before, and every other role reaches no row at all. On Supabase, that keeps
-- them out of the Data API's reach.
ALTER TABLE safebyok_bundles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE safebyok_lockboxes ENABLE ROW LEVEL SECURITY;
