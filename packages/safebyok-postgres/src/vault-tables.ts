/** The SQL that makes safebyok's tables in your Postgres, 14 or later, in a UTF8 database.
 * Run it once, as a migration or at your server's start: it is safe to run again. The package also
 * ships it as `vault-tables.sql`, for a migration tool to copy.
 *
 * It makes `safebyok_vaults`, a row of vault props per vault, and `safebyok_boxes`, a row per box:
 * no trigger, no function, no other table. Row-level security is on with no policy, so only the
 * tables' owner reaches them. Push between devices is {@link VaultNotifySql}'s, which you opt in to.
 *
 * @example await pool.query(VaultTablesSql)  // pg runs several statements in one query without parameters
 * @example await pglite.exec(VaultTablesSql)
 */
export const VaultTablesSql = `-- safebyok-postgres: the tables a safebyok vault is stored in. For Postgres 14 or later, in a
-- UTF8 database. Safe to run again: it creates only the tables that are missing, and never
-- changes the columns or keys of one already there.
--
-- Each record is stored field by field, a column to a field, exactly as safebyok wrote it:
-- text as text, a time or a count as a bigint, and each structured value -- an encrypted value
-- (a cipherIv and its ciphertext), or one of the vault props' two ways in -- as one opaque jsonb. A record's secret fields are ciphertext, every one.

-- One row of vault props per vault: its passphrase always, its passkey null when it has none.
CREATE TABLE IF NOT EXISTS safebyok_vaults (
  applabel         text   NOT NULL,
  user_id          text   NOT NULL,
  vaultlabel       text   NOT NULL,
  vault_tok        text   NOT NULL,
  format           text   NOT NULL,
  gate_epoch       bigint NOT NULL,
  passphrase       jsonb  NOT NULL,
  passkey          jsonb,
  registered_at    bigint NOT NULL,
  PRIMARY KEY (applabel, user_id, vaultlabel),
  -- What a box's foreign key names: its vault, down to the vault_tok.
  UNIQUE (applabel, user_id, vaultlabel, vault_tok)
);

-- One box per boxlabel, beside its vault's scope and vault_tok. A box stands only while
-- its vault's props do, under the same vault_tok: deleting the vault deletes its boxes with
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
ALTER TABLE safebyok_vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE safebyok_boxes  ENABLE ROW LEVEL SECURITY;
`

/** The SQL for an optional trigger that lets a vault hear other devices' writes.
 * After every write that changes a vault, the trigger notifies {@link VaultChangeChannel}, and a
 * `listen` handed to `postgresVaultDB` calls its subscribers. Run it once, after {@link
 * VaultTablesSql}; it is safe to run again. The package also ships it as `vault-notify.sql`.
 * Without it nothing is pushed: a vault learns of another device's writes when it next reads.
 *
 * @example await pool.query(VaultNotifySql)  // after VaultTablesSql
 * @example await pglite.exec(VaultNotifySql)
 */
export const VaultNotifySql = `-- safebyok-postgres: the triggers that tell listeners when a vault changes. Optional: run them
-- after vault-tables.sql only if your server hears other devices' writes through a \`listen\`.
-- Safe to run again: it replaces its function and triggers.
--
-- After any write that changes a vault, a notification on the channel safebyok_vault_changes,
-- whose payload is the vault's scope as JSON: {"applabel" : ..., "user_id" : ..., "vaultlabel" : ...}.
-- A scope too long for a payload (8000 bytes) sends an empty one, which every listener hears as
-- its own. Postgres delivers a transaction's identical notifications as one, after it commits.
CREATE OR REPLACE FUNCTION safebyok_vault_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  payload text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'DELETE' THEN
    payload := json_build_object('applabel', OLD.applabel, 'user_id', OLD.user_id, 'vaultlabel', OLD.vaultlabel)::text;
  ELSE
    payload := json_build_object('applabel', NEW.applabel, 'user_id', NEW.user_id, 'vaultlabel', NEW.vaultlabel)::text;
  END IF;
  IF octet_length(payload) >= 8000 THEN
    payload := '';
  END IF;
  PERFORM pg_notify('safebyok_vault_changes', payload);
  RETURN NULL;
END
$$;

CREATE OR REPLACE TRIGGER safebyok_vaults_changed
  AFTER INSERT OR UPDATE OR DELETE ON safebyok_vaults
  FOR EACH ROW EXECUTE FUNCTION safebyok_vault_changed();

CREATE OR REPLACE TRIGGER safebyok_boxes_changed
  AFTER INSERT OR UPDATE OR DELETE ON safebyok_boxes
  FOR EACH ROW EXECUTE FUNCTION safebyok_vault_changed();
`

/** The channel {@link VaultNotifySql}'s trigger notifies after every write that changes a vault.
 * Its payload is the vault's scope as JSON, with no record and nothing ciphered. It is empty for a
 * scope too long for a payload, which every listener hears as its own.
 */
export const VaultChangeChannel = 'safebyok_vault_changes'
