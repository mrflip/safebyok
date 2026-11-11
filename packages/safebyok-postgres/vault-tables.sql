-- safebyok-postgres: the two tables safebyok stores its rows in. For Postgres 14 or later.
-- Safe to run again: it creates only what is missing.
--
-- Each row is the record safebyok wrote, with a column for each of its fields. A field that is an object is a jsonb column.
-- am is 'a' for a live row. A deleted vault or box leaves its row as a tombstone, with the nullable columns null.
-- Each time is UTC epoch milliseconds. Every secret field of a record is ciphertext.

CREATE TABLE IF NOT EXISTS safebyok_vaults (
  applabel      text    NOT NULL,
  user_id       text    NOT NULL,
  vaultlabel    text    NOT NULL,
  fmt           integer NOT NULL,
  am            text    NOT NULL,
  revision_tok  text    NOT NULL,
  revision_seq  integer NOT NULL,
  registered_at bigint  NOT NULL,
  written_at    bigint  NOT NULL,
  vault_tok     text    NOT NULL,
  gate          jsonb,
  PRIMARY KEY (applabel, user_id, vaultlabel)
);

-- A box row is keyed by its vault's vault_tok, which changes each time the vault is created anew.
-- Its foreign key is to the vault row at its scope, whatever that vault's vault_tok: the box rows of an ended
-- vault life are never read again, and stay until tidyGone removes them.
-- The fillfactor leaves room in each page for a box's next revision to be stored beside the last.
CREATE TABLE IF NOT EXISTS safebyok_boxes (
  applabel               text    NOT NULL,
  user_id                text    NOT NULL,
  vaultlabel             text    NOT NULL,
  vault_tok              text    NOT NULL,
  boxlabel               text    NOT NULL,
  fmt                    integer NOT NULL,
  am                     text    NOT NULL,
  revision_tok           text    NOT NULL,
  revision_seq           integer NOT NULL,
  registered_at          bigint  NOT NULL,
  written_at             bigint  NOT NULL,
  box_tok                text    NOT NULL,
  whisper_codec          text    NOT NULL,
  whisper_schema_version integer NOT NULL,
  sidecar                jsonb,
  box_key_wrapped        jsonb,
  whisper_ciphered       jsonb,
  PRIMARY KEY (applabel, user_id, vaultlabel, vault_tok, boxlabel),
  FOREIGN KEY (applabel, user_id, vaultlabel) REFERENCES safebyok_vaults
) WITH (fillfactor = 85);

-- The live boxes of a vault life, for the count a box's put takes against the cap.
CREATE INDEX IF NOT EXISTS safebyok_boxes_active ON safebyok_boxes (applabel, user_id, vaultlabel, vault_tok) WHERE am = 'a';

-- Row-level security is on, with no policy. The role that owns the tables (the one your server
-- connects as) can reach every row. No other role can reach any, including Supabase's Data API roles.
ALTER TABLE safebyok_vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE safebyok_boxes  ENABLE ROW LEVEL SECURITY;
