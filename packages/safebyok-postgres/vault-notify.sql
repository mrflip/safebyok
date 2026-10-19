-- safebyok-postgres: the triggers that tell listeners when a vault changes. Optional: run them
-- after vault-tables.sql only if your server hears other devices' writes through a `listen`.
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

CREATE OR REPLACE TRIGGER safebyok_lockboxes_changed
  AFTER INSERT OR UPDATE OR DELETE ON safebyok_lockboxes
  FOR EACH ROW EXECUTE FUNCTION safebyok_vault_changed();
