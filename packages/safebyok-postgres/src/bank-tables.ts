/** The SQL that creates the bankDB's four tables: `await pool.query(BankTablesSql)`. */
export const BankTablesSql = `-- safebyok-postgres: the four tables PostgresBankDB stores its rows in. For Postgres 14 or later.
-- Safe to run again: it creates only what is missing.
--
-- Each row is the record safebyok wrote, with a column for each of its fields. A field that is an object is a jsonb column.
-- am is 'a' for a live row. A deleted bank, vault or box leaves its row as a tombstone, am 'x', with the nullable columns null.
-- A gate row is never a tombstone: it is deleted with its bank.
-- The CHECK constraints refuse a row of any other shape, which safebyok could not read back.
-- They do not check fmt: a row in a later format may sit beside these, and the functions never overwrite it.
-- Each time is UTC epoch milliseconds. Every secret field of a record is ciphertext.
--
-- Each gate, vault and box row has a foreign key to its bank row, whatever that row's bank_tok. A bank row is never
-- deleted: delBank leaves its tombstone, and deletes every gate, vault and box row under it in the same transaction.

CREATE TABLE IF NOT EXISTS safebyok_banks (
  user_id       text    NOT NULL,
  banklabel     text    NOT NULL,
  fmt           integer NOT NULL,
  am            text    NOT NULL,
  revision_tok  text    NOT NULL,
  revision_seq  integer NOT NULL,
  registered_at bigint  NOT NULL,
  written_at    bigint  NOT NULL,
  bank_tok      text    NOT NULL,
  PRIMARY KEY (user_id, banklabel),
  CHECK (am IN ('a', 'x'))
);

-- wayins holds the bank's passphrase wayin under main, and its passkey wayin under passkey0 when it has one.
-- auth, sigs and meta are kept for later, and are always empty.
CREATE TABLE IF NOT EXISTS safebyok_gates (
  user_id       text    NOT NULL,
  banklabel     text    NOT NULL,
  gatelabel     text    NOT NULL,
  fmt           integer NOT NULL,
  am            text    NOT NULL,
  revision_tok  text    NOT NULL,
  revision_seq  integer NOT NULL,
  registered_at bigint  NOT NULL,
  written_at    bigint  NOT NULL,
  bank_tok      text    NOT NULL,
  gate_tok      text    NOT NULL,
  wayins        jsonb   NOT NULL,
  auth          jsonb   NOT NULL,
  sigs          jsonb   NOT NULL,
  meta          jsonb   NOT NULL,
  PRIMARY KEY (user_id, banklabel, gatelabel),
  FOREIGN KEY (user_id, banklabel) REFERENCES safebyok_banks,
  CHECK (am = 'a'),
  CHECK (COALESCE(
        jsonb_typeof(wayins->'main') = 'object'
    AND COALESCE(jsonb_typeof(wayins->'passkey0'), 'object') = 'object'
    AND jsonb_typeof(auth) = 'object' AND jsonb_typeof(sigs) = 'object' AND jsonb_typeof(meta) = 'object', false))
);

-- A vault row's bank_tok is the life of the bank it was written under. One under another bank_tok than its bank row's
-- is of an ended life of the bank, and is read as no row.
CREATE TABLE IF NOT EXISTS safebyok_vaults (
  user_id       text    NOT NULL,
  banklabel     text    NOT NULL,
  vaultlabel    text    NOT NULL,
  fmt           integer NOT NULL,
  am            text    NOT NULL,
  revision_tok  text    NOT NULL,
  revision_seq  integer NOT NULL,
  registered_at bigint  NOT NULL,
  written_at    bigint  NOT NULL,
  bank_tok      text    NOT NULL,
  vault_tok     text    NOT NULL,
  PRIMARY KEY (user_id, banklabel, vaultlabel),
  FOREIGN KEY (user_id, banklabel) REFERENCES safebyok_banks,
  CHECK (am IN ('a', 'x'))
);

-- A box row's key includes the life of the vault it is under: its bank's bank_tok and its vault's vault_tok. A box row
-- under any other pair than its vault row's is of an ended life, is never read again, and stays until tidyGone, or the
-- end of the vault's or the bank's life, deletes it.
-- The fillfactor leaves room in each page for a box's next revision to be stored beside the last.
CREATE TABLE IF NOT EXISTS safebyok_boxes (
  user_id                text    NOT NULL,
  banklabel              text    NOT NULL,
  vaultlabel             text    NOT NULL,
  bank_tok               text    NOT NULL,
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
  PRIMARY KEY (user_id, banklabel, vaultlabel, bank_tok, vault_tok, boxlabel),
  FOREIGN KEY (user_id, banklabel) REFERENCES safebyok_banks,
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

-- Row-level security is on, with no policy. The role that owns the tables, which your server
-- connects as, can reach every row. No other role can reach any, including Supabase's Data API roles.
ALTER TABLE safebyok_banks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE safebyok_gates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE safebyok_vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE safebyok_boxes  ENABLE ROW LEVEL SECURITY;
`
