/** The SQL that creates the functions PostgresVaultDB calls to write a row: `await pool.query(VaultFunctionsSql)`, after `VaultTablesSql`. */
export const VaultFunctionsSql = `-- safebyok-postgres: the functions PostgresVaultDB calls to write a vault row or a box row. For Postgres 14 or later.
-- Run it after the tables, and again with each upgrade of safebyok-postgres: each run replaces the functions.
--
-- Each write function checks a record against the stored row and stores it, in one call. It does not throw when it
-- stores nothing. It returns one row, which says whether it stored the record (ok), what happened (act: born,
-- replaced, deleted or reborn), the rows as they are now, and what was stored before (presence: void, live or gone).
-- The functions decide no policy: PostgresVaultDB calls one only when the record may replace the row it expects.
-- A function never overwrites a row whose fmt differs from the record's, and never stores a box under a vault row
-- whose fmt is not 6001. A row in a later format is one this version of safebyok cannot read.
-- Each write function takes the record to store and the row the caller expects, both as JSON. The box functions
-- also take the cap on box rows.
--
-- A box write locks only the box row. This is on purpose: a lock on the vault row would make every writer under one
-- vault wait its turn, to guard against a rare race. Two things follow.
-- - It reads the vault row without a lock, so a box written while its vault is deleted or created anew may be
--   written into a vault life that has ended. Nothing reads such a row again, and the vault's next write, or
--   tidyGone, deletes it.
-- - It counts the vault life's box rows without a lock, so writers racing to add their first box may pass the cap
--   together. The cap is soft, and tidyGone does not trim it.
-- Each statement sees what was committed when it started. So when nothing is stored, the rows returned are the rows
-- as they stand after any wait on another writer.
--
-- A function that stores a record notifies the user's channel in the same transaction (see safebyok_tell).
--
-- The functions run with the caller's privileges, and only their owner, the role that ran this file, may call them.

-- Convert a row to the record it was stored from, dropping the columns that are null. Returns null for no row.
-- Only top-level nulls are dropped: a null inside gate or sidecar is part of the record.
CREATE OR REPLACE FUNCTION safebyok_record(stored jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_object_agg(col.key, col.value) FROM jsonb_each(stored) AS col WHERE col.value <> 'null'::jsonb
$$;

-- Notify the user's channel, safebyok_<user_id>, of a row just stored: a vault row, or a box row with its vault row.
-- The notice is a JSON object with the stored row's address under at, and the rows under vault and box.
-- Postgres refuses a notice of 8000 bytes or more. A notice that is too large drops a box's vault row first, then
-- every row. A listener that gets only an address fetches the row itself.
CREATE OR REPLACE FUNCTION safebyok_tell(vault jsonb, box jsonb) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  stored jsonb := COALESCE(box, vault);
  at     jsonb := safebyok_record(jsonb_build_object(
    'applabel', stored->'applabel', 'user_id', stored->'user_id', 'vaultlabel', stored->'vaultlabel',
    'vault_tok', box->'vault_tok', 'boxlabel', box->'boxlabel'));
  notice text  := safebyok_record(jsonb_build_object('at', at, 'vault', vault, 'box', box))::text;
BEGIN
  IF octet_length(notice) >= 8000 AND box IS NOT NULL THEN notice := jsonb_build_object('at', at, 'box', box)::text; END IF;
  IF octet_length(notice) >= 8000 THEN notice := jsonb_build_object('at', at)::text; END IF;
  PERFORM pg_notify('safebyok_' || (stored->>'user_id'), notice);
END $$;

-- Store a vault's first record, if no vault row exists at its scope. expected_row is not read.
CREATE OR REPLACE FUNCTION safebyok_birth_vault(new_record jsonb, expected_row jsonb)
RETURNS TABLE (ok boolean, act text, vault jsonb, presence text, swept integer)
LANGUAGE plpgsql AS $$
DECLARE
  new_vault safebyok_vaults := jsonb_populate_record(NULL::safebyok_vaults, new_record);
BEGIN
  ok := false;  swept := 0;
  IF new_vault.am = 'a' AND new_vault.revision_seq = 0 THEN
    INSERT INTO safebyok_vaults VALUES (new_vault.*)
    ON CONFLICT (applabel, user_id, vaultlabel) DO NOTHING;
    ok := FOUND;
  END IF;

  IF ok THEN
    act := 'born';  presence := 'void';  vault := safebyok_record(to_jsonb(new_vault));
    PERFORM safebyok_tell(vault, NULL);
    RETURN NEXT;  RETURN;
  END IF;

  SELECT safebyok_record(to_jsonb(v)) INTO vault FROM safebyok_vaults AS v
  WHERE  (v.applabel, v.user_id, v.vaultlabel) = (new_vault.applabel, new_vault.user_id, new_vault.vaultlabel);
  presence := CASE WHEN vault IS NULL THEN 'void' WHEN vault->>'am' = 'a' THEN 'live' ELSE 'gone' END;
  RETURN NEXT;
END $$;

-- Store a vault's next record over the expected row, live or a tombstone: a replace, a del, or a put over a tombstone.
-- The record is stored only if the stored row has the expected revision_tok, am and vault_tok, and the record's
-- revision_seq is one past the row's. A tombstone never replaces a tombstone.
-- The same write deletes the box rows of the vault's other lives, skipping any row another transaction has locked.
-- swept is the number of box rows deleted.
CREATE OR REPLACE FUNCTION safebyok_revise_vault(new_record jsonb, expected_row jsonb)
RETURNS TABLE (ok boolean, act text, vault jsonb, presence text, swept integer)
LANGUAGE plpgsql AS $$
DECLARE
  new_vault safebyok_vaults := jsonb_populate_record(NULL::safebyok_vaults, new_record);
  expected  safebyok_vaults := jsonb_populate_record(NULL::safebyok_vaults, expected_row);
BEGIN
  swept := 0;
  UPDATE safebyok_vaults AS v
  SET    (fmt, am, revision_tok, revision_seq, registered_at, written_at, vault_tok, gate)
       = (new_vault.fmt, new_vault.am, new_vault.revision_tok, new_vault.revision_seq, new_vault.registered_at, new_vault.written_at, new_vault.vault_tok, new_vault.gate)
  WHERE  (v.applabel, v.user_id, v.vaultlabel) = (new_vault.applabel, new_vault.user_id, new_vault.vaultlabel)
    AND  v.revision_tok = expected.revision_tok
    AND  v.am = expected.am
    AND  v.vault_tok = expected.vault_tok
    AND  v.fmt = new_vault.fmt
    AND  v.revision_seq = new_vault.revision_seq - 1
    AND  (v.am = 'a' OR new_vault.am = 'a');
  ok := FOUND;

  IF ok THEN
    DELETE FROM safebyok_boxes AS b
    USING (
      SELECT d.applabel, d.user_id, d.vaultlabel, d.vault_tok, d.boxlabel
      FROM   safebyok_boxes AS d
      WHERE  (d.applabel, d.user_id, d.vaultlabel) = (new_vault.applabel, new_vault.user_id, new_vault.vaultlabel)
        AND  d.vault_tok <> new_vault.vault_tok
      FOR UPDATE SKIP LOCKED
    ) AS doomed
    WHERE  (b.applabel, b.user_id, b.vaultlabel, b.vault_tok, b.boxlabel)
         = (doomed.applabel, doomed.user_id, doomed.vaultlabel, doomed.vault_tok, doomed.boxlabel);
    GET DIAGNOSTICS swept = ROW_COUNT;
    act      := CASE WHEN expected.am <> 'a' THEN 'reborn' WHEN new_vault.am = 'a' THEN 'replaced' ELSE 'deleted' END;
    presence := CASE WHEN expected.am = 'a' THEN 'live' ELSE 'gone' END;
    vault    := safebyok_record(to_jsonb(new_vault));
    PERFORM safebyok_tell(vault, NULL);
    RETURN NEXT;  RETURN;
  END IF;

  SELECT safebyok_record(to_jsonb(v)) INTO vault FROM safebyok_vaults AS v
  WHERE  (v.applabel, v.user_id, v.vaultlabel) = (new_vault.applabel, new_vault.user_id, new_vault.vaultlabel);
  presence := CASE WHEN vault IS NULL THEN 'void' WHEN vault->>'am' = 'a' THEN 'live' ELSE 'gone' END;
  RETURN NEXT;
END $$;

-- Store a box's first record, if no box row exists at its address, its vault is live in the box's life, and that
-- vault life has room under the cap. The cap counts every box row of the vault life, live or tombstone.
-- boxcount is that count, taken without a lock. expected_row is not read.
CREATE OR REPLACE FUNCTION safebyok_birth_box(new_record jsonb, expected_row jsonb, maxboxes integer)
RETURNS TABLE (ok boolean, act text, world jsonb, box jsonb, presence text, boxcount integer)
LANGUAGE plpgsql AS $$
DECLARE
  new_box safebyok_boxes := jsonb_populate_record(NULL::safebyok_boxes, new_record);
  its_vault safebyok_vaults;
BEGIN
  SELECT v.* INTO its_vault FROM safebyok_vaults AS v
  WHERE  (v.applabel, v.user_id, v.vaultlabel) = (new_box.applabel, new_box.user_id, new_box.vaultlabel);
  SELECT count(*)::integer INTO boxcount FROM safebyok_boxes AS b
  WHERE  (b.applabel, b.user_id, b.vaultlabel, b.vault_tok) = (new_box.applabel, new_box.user_id, new_box.vaultlabel, new_box.vault_tok);

  ok := false;
  IF its_vault.am = 'a' AND its_vault.vault_tok = new_box.vault_tok AND its_vault.fmt = 6001
     AND new_box.am = 'a' AND new_box.revision_seq = 0
     AND boxcount < maxboxes THEN
    INSERT INTO safebyok_boxes VALUES (new_box.*)
    ON CONFLICT (applabel, user_id, vaultlabel, vault_tok, boxlabel) DO NOTHING;
    ok := FOUND;
  END IF;

  IF ok THEN
    act := 'born';  presence := 'void';
    world := safebyok_record(to_jsonb(its_vault));  box := safebyok_record(to_jsonb(new_box));
    PERFORM safebyok_tell(world, box);
    RETURN NEXT;  RETURN;
  END IF;

  SELECT safebyok_record(to_jsonb(v)), (
    SELECT safebyok_record(to_jsonb(b)) FROM safebyok_boxes AS b
    WHERE  (b.applabel, b.user_id, b.vaultlabel, b.vault_tok, b.boxlabel) = (new_box.applabel, new_box.user_id, new_box.vaultlabel, new_box.vault_tok, new_box.boxlabel)
  ) INTO world, box
  FROM   (SELECT 1) AS one LEFT JOIN safebyok_vaults AS v
    ON   (v.applabel, v.user_id, v.vaultlabel) = (new_box.applabel, new_box.user_id, new_box.vaultlabel);
  presence := CASE WHEN box IS NULL THEN 'void' WHEN box->>'am' = 'a' THEN 'live' ELSE 'gone' END;
  RETURN NEXT;
END $$;

-- Store a box's next record over the expected row, live or a tombstone: a replace, a del, or a put over a tombstone.
-- The record is stored only if the stored row has the expected revision_tok, am and box_tok, the record's
-- revision_seq is one past the row's, and the vault is live in the box's life. A tombstone never replaces a tombstone.
-- It adds no box row, so the cap does not apply. It takes maxboxes only so that both box functions take the same
-- arguments, and does not read it.
CREATE OR REPLACE FUNCTION safebyok_revise_box(new_record jsonb, expected_row jsonb, maxboxes integer)
RETURNS TABLE (ok boolean, act text, world jsonb, box jsonb, presence text)
LANGUAGE plpgsql AS $$
DECLARE
  new_box   safebyok_boxes := jsonb_populate_record(NULL::safebyok_boxes, new_record);
  expected  safebyok_boxes := jsonb_populate_record(NULL::safebyok_boxes, expected_row);
  its_vault safebyok_vaults;
BEGIN
  SELECT v.* INTO its_vault FROM safebyok_vaults AS v
  WHERE  (v.applabel, v.user_id, v.vaultlabel) = (new_box.applabel, new_box.user_id, new_box.vaultlabel);

  ok := false;
  IF its_vault.am = 'a' AND its_vault.vault_tok = new_box.vault_tok AND its_vault.fmt = 6001 THEN
    UPDATE safebyok_boxes AS b
    SET    (fmt, am, revision_tok, revision_seq, registered_at, written_at, box_tok,
            whisper_codec, whisper_schema_version, sidecar, box_key_wrapped, whisper_ciphered)
         = (new_box.fmt, new_box.am, new_box.revision_tok, new_box.revision_seq, new_box.registered_at, new_box.written_at, new_box.box_tok,
            new_box.whisper_codec, new_box.whisper_schema_version, new_box.sidecar, new_box.box_key_wrapped, new_box.whisper_ciphered)
    WHERE  (b.applabel, b.user_id, b.vaultlabel, b.vault_tok, b.boxlabel) = (new_box.applabel, new_box.user_id, new_box.vaultlabel, new_box.vault_tok, new_box.boxlabel)
      AND  b.revision_tok = expected.revision_tok
      AND  b.am = expected.am
      AND  b.box_tok = expected.box_tok
      AND  b.fmt = new_box.fmt
      AND  b.revision_seq = new_box.revision_seq - 1
      AND  (b.am = 'a' OR new_box.am = 'a');
    ok := FOUND;
  END IF;

  IF ok THEN
    act      := CASE WHEN expected.am <> 'a' THEN 'reborn' WHEN new_box.am = 'a' THEN 'replaced' ELSE 'deleted' END;
    presence := CASE WHEN expected.am = 'a' THEN 'live' ELSE 'gone' END;
    world := safebyok_record(to_jsonb(its_vault));  box := safebyok_record(to_jsonb(new_box));
    PERFORM safebyok_tell(world, box);
    RETURN NEXT;  RETURN;
  END IF;

  SELECT safebyok_record(to_jsonb(v)), (
    SELECT safebyok_record(to_jsonb(b)) FROM safebyok_boxes AS b
    WHERE  (b.applabel, b.user_id, b.vaultlabel, b.vault_tok, b.boxlabel) = (new_box.applabel, new_box.user_id, new_box.vaultlabel, new_box.vault_tok, new_box.boxlabel)
  ) INTO world, box
  FROM   (SELECT 1) AS one LEFT JOIN safebyok_vaults AS v
    ON   (v.applabel, v.user_id, v.vaultlabel) = (new_box.applabel, new_box.user_id, new_box.vaultlabel);
  presence := CASE WHEN box IS NULL THEN 'void' WHEN box->>'am' = 'a' THEN 'live' ELSE 'gone' END;
  RETURN NEXT;
END $$;

REVOKE ALL ON FUNCTION safebyok_record(jsonb)                              FROM PUBLIC;
REVOKE ALL ON FUNCTION safebyok_tell(jsonb, jsonb)                         FROM PUBLIC;
REVOKE ALL ON FUNCTION safebyok_birth_vault(jsonb, jsonb)                  FROM PUBLIC;
REVOKE ALL ON FUNCTION safebyok_revise_vault(jsonb, jsonb)                 FROM PUBLIC;
REVOKE ALL ON FUNCTION safebyok_birth_box(jsonb, jsonb, integer)           FROM PUBLIC;
REVOKE ALL ON FUNCTION safebyok_revise_box(jsonb, jsonb, integer)          FROM PUBLIC;
`
