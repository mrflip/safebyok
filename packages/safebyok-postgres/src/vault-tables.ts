/** The SQL that creates safebyok's two tables: `await pool.query(VaultTablesSql)`. */
export const VaultTablesSql = `-- safebyok-postgres: the two tables safebyok stores its rows in. For Postgres 14 or later.
-- Safe to run again: it creates only what is missing.
--
-- Each row is the record safebyok wrote, with a column for each of its fields. A field that is an object is a jsonb column.
-- am is 'a' for a live row. A deleted vault or box leaves its row as a tombstone, am 'x', with the nullable columns null.
-- The checks hold each table to rows of that shape: a row they refuse is one safebyok could not read back.
-- They do not judge fmt: a row of a later format may be stored beside these, and the functions store nothing over it.
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
  PRIMARY KEY (applabel, user_id, vaultlabel),
  CHECK (am IN ('a', 'x')),
  CHECK ((am = 'a') = (gate IS NOT NULL)),
  CHECK (gate IS NULL OR COALESCE(
        jsonb_typeof(gate->'gate_epoch')       = 'number'
    AND jsonb_typeof(gate->'passphrase_wayin') = 'object'
    AND jsonb_typeof(gate->'passkey_wayin')    IN ('object', 'null'), false))
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
  FOREIGN KEY (applabel, user_id, vaultlabel) REFERENCES safebyok_vaults,
  CHECK (am IN ('a', 'x')),
  CHECK ((am = 'a') = (sidecar IS NOT NULL) AND (am = 'a') = (box_key_wrapped IS NOT NULL) AND (am = 'a') = (whisper_ciphered IS NOT NULL)),
  CHECK (sidecar IS NULL OR jsonb_typeof(sidecar) = 'object'),
  CHECK (box_key_wrapped IS NULL OR COALESCE(
        jsonb_typeof(box_key_wrapped->'cipher_iv_b64')  = 'string'
    AND jsonb_typeof(box_key_wrapped->'ciphertext_b64') = 'string', false)),
  CHECK (whisper_ciphered IS NULL OR COALESCE(
        jsonb_typeof(whisper_ciphered->'cipher_iv_b64')  = 'string'
    AND jsonb_typeof(whisper_ciphered->'ciphertext_b64') = 'string', false))
) WITH (fillfactor = 85);

-- Row-level security is on, with no policy. The role that owns the tables (the one your server
-- connects as) can reach every row. No other role can reach any, including Supabase's Data API roles.
ALTER TABLE safebyok_vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE safebyok_boxes  ENABLE ROW LEVEL SECURITY;
`
