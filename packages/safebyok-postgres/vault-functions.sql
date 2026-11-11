-- safebyok-postgres: the functions PostgresVaultDB calls to write a vault row or a box row. For Postgres 14 or later.
-- Run it after the tables, and again with each upgrade of safebyok-postgres: each run replaces the functions.
--
-- Each function tests a record against what is stored and stores it, in one call. It raises nothing where it stores
-- nothing: it answers one row, which says whether it stored the record (ok), what that came to (act: born, replaced,
-- deleted or reborn), the rows as they now stand, and what was stored before (presence: void, live or gone).
-- A function holds no policy: its caller calls it only where it may store the record over the row it expects.
--
-- A box's write locks nothing but the box row it stores. It reads its vault row without a lock, so a box written as its
-- vault is deleted or created anew may land in a vault life that has ended: nothing reads such a row again, and the
-- vault's next write or tidyGone removes it.
-- Each statement of a function sees what is committed as it starts, so the rows answered where nothing was stored
-- are the rows as they stand after any wait for another writer.
--
-- The functions run as the role that calls them, and no other role may call them.

-- A row as the record it was stored from: a field for each column that is not null. Null for no row.
-- Only the top level is stripped: a null inside gate or sidecar is part of the record.
CREATE OR REPLACE FUNCTION safebyok_record(stored jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_object_agg(col.key, col.value) FROM jsonb_each(stored) AS col WHERE col.value <> 'null'::jsonb
$$;

-- Store a vault's first record, where no vault row is stored at its scope.
CREATE OR REPLACE FUNCTION safebyok_birth_vault(new_record jsonb, channel text, notice text)
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
    PERFORM pg_notify(channel, notice);
    act := 'born';  presence := 'void';  vault := safebyok_record(to_jsonb(new_vault));
    RETURN NEXT;  RETURN;
  END IF;

  SELECT safebyok_record(to_jsonb(v)) INTO vault FROM safebyok_vaults AS v
  WHERE  (v.applabel, v.user_id, v.vaultlabel) = (new_vault.applabel, new_vault.user_id, new_vault.vaultlabel);
  presence := CASE WHEN vault IS NULL THEN 'void' WHEN vault->>'am' = 'a' THEN 'live' ELSE 'gone' END;
  RETURN NEXT;
END $$;

-- Store a vault's next record over the row its caller expects, live or a tombstone: a replace, a del, or a put over a tombstone.
-- It is stored where the stored row has the expected revision_tok and am, and the record is one revision_seq past it.
-- A tombstone is never stored over a tombstone.
-- The box rows of the vault's other lives are deleted with it, but for any another writer holds; swept is their number.
CREATE OR REPLACE FUNCTION safebyok_revise_vault(new_record jsonb, channel text, notice text, expected_tok text, expected_am text)
RETURNS TABLE (ok boolean, act text, vault jsonb, presence text, swept integer)
LANGUAGE plpgsql AS $$
DECLARE
  new_vault safebyok_vaults := jsonb_populate_record(NULL::safebyok_vaults, new_record);
BEGIN
  swept := 0;
  UPDATE safebyok_vaults AS v
  SET    (fmt, am, revision_tok, revision_seq, registered_at, written_at, vault_tok, gate)
       = (new_vault.fmt, new_vault.am, new_vault.revision_tok, new_vault.revision_seq, new_vault.registered_at, new_vault.written_at, new_vault.vault_tok, new_vault.gate)
  WHERE  (v.applabel, v.user_id, v.vaultlabel) = (new_vault.applabel, new_vault.user_id, new_vault.vaultlabel)
    AND  v.revision_tok = expected_tok
    AND  v.am = expected_am
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
    PERFORM pg_notify(channel, notice);
    act      := CASE WHEN expected_am <> 'a' THEN 'reborn' WHEN new_vault.am = 'a' THEN 'replaced' ELSE 'deleted' END;
    presence := CASE WHEN expected_am = 'a' THEN 'live' ELSE 'gone' END;
    vault    := safebyok_record(to_jsonb(new_vault));
    RETURN NEXT;  RETURN;
  END IF;

  SELECT safebyok_record(to_jsonb(v)) INTO vault FROM safebyok_vaults AS v
  WHERE  (v.applabel, v.user_id, v.vaultlabel) = (new_vault.applabel, new_vault.user_id, new_vault.vaultlabel);
  presence := CASE WHEN vault IS NULL THEN 'void' WHEN vault->>'am' = 'a' THEN 'live' ELSE 'gone' END;
  RETURN NEXT;
END $$;

-- Store a box's first record, where no box row is stored at its address, in a live vault of the box's life with room under the cap.
CREATE OR REPLACE FUNCTION safebyok_birth_box(new_record jsonb, channel text, notice text, maxboxes integer)
RETURNS TABLE (ok boolean, act text, world jsonb, box jsonb, presence text, boxcount integer)
LANGUAGE plpgsql AS $$
DECLARE
  new_box safebyok_boxes := jsonb_populate_record(NULL::safebyok_boxes, new_record);
  its_vault safebyok_vaults;
BEGIN
  SELECT v.* INTO its_vault FROM safebyok_vaults AS v
  WHERE  (v.applabel, v.user_id, v.vaultlabel) = (new_box.applabel, new_box.user_id, new_box.vaultlabel);
  SELECT count(*)::integer INTO boxcount FROM safebyok_boxes AS b
  WHERE  (b.applabel, b.user_id, b.vaultlabel, b.vault_tok) = (new_box.applabel, new_box.user_id, new_box.vaultlabel, new_box.vault_tok)
    AND  b.am = 'a';

  ok := false;
  IF its_vault.am = 'a' AND its_vault.vault_tok = new_box.vault_tok
     AND new_box.am = 'a' AND new_box.revision_seq = 0
     AND boxcount < maxboxes THEN
    INSERT INTO safebyok_boxes VALUES (new_box.*)
    ON CONFLICT (applabel, user_id, vaultlabel, vault_tok, boxlabel) DO NOTHING;
    ok := FOUND;
  END IF;

  IF ok THEN
    PERFORM pg_notify(channel, notice);
    act := 'born';  presence := 'void';
    world := safebyok_record(to_jsonb(its_vault));  box := safebyok_record(to_jsonb(new_box));
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

-- Store a box's next record over the row its caller expects, live or a tombstone: a replace, a del, or a put over a tombstone.
-- It is stored where the stored row has the expected revision_tok and am, the record is one revision_seq past it,
-- and the vault is live in the box's life. A live record over a tombstone also needs room under the cap.
-- A tombstone is never stored over a tombstone.
CREATE OR REPLACE FUNCTION safebyok_revise_box(new_record jsonb, channel text, notice text, maxboxes integer, expected_tok text, expected_am text)
RETURNS TABLE (ok boolean, act text, world jsonb, box jsonb, presence text, boxcount integer)
LANGUAGE plpgsql AS $$
DECLARE
  new_box safebyok_boxes := jsonb_populate_record(NULL::safebyok_boxes, new_record);
  its_vault safebyok_vaults;
BEGIN
  SELECT v.* INTO its_vault FROM safebyok_vaults AS v
  WHERE  (v.applabel, v.user_id, v.vaultlabel) = (new_box.applabel, new_box.user_id, new_box.vaultlabel);
  SELECT count(*)::integer INTO boxcount FROM safebyok_boxes AS b
  WHERE  (b.applabel, b.user_id, b.vaultlabel, b.vault_tok) = (new_box.applabel, new_box.user_id, new_box.vaultlabel, new_box.vault_tok)
    AND  b.am = 'a';

  ok := false;
  IF its_vault.am = 'a' AND its_vault.vault_tok = new_box.vault_tok THEN
    UPDATE safebyok_boxes AS b
    SET    (fmt, am, revision_tok, revision_seq, registered_at, written_at, box_tok,
            whisper_codec, whisper_schema_version, sidecar, box_key_wrapped, whisper_ciphered)
         = (new_box.fmt, new_box.am, new_box.revision_tok, new_box.revision_seq, new_box.registered_at, new_box.written_at, new_box.box_tok,
            new_box.whisper_codec, new_box.whisper_schema_version, new_box.sidecar, new_box.box_key_wrapped, new_box.whisper_ciphered)
    WHERE  (b.applabel, b.user_id, b.vaultlabel, b.vault_tok, b.boxlabel) = (new_box.applabel, new_box.user_id, new_box.vaultlabel, new_box.vault_tok, new_box.boxlabel)
      AND  b.revision_tok = expected_tok
      AND  b.am = expected_am
      AND  b.revision_seq = new_box.revision_seq - 1
      AND  (b.am = 'a' OR new_box.am = 'a')
      AND  (b.am = 'a' OR new_box.am <> 'a' OR boxcount < maxboxes);
    ok := FOUND;
  END IF;

  IF ok THEN
    PERFORM pg_notify(channel, notice);
    act      := CASE WHEN expected_am <> 'a' THEN 'reborn' WHEN new_box.am = 'a' THEN 'replaced' ELSE 'deleted' END;
    presence := CASE WHEN expected_am = 'a' THEN 'live' ELSE 'gone' END;
    world := safebyok_record(to_jsonb(its_vault));  box := safebyok_record(to_jsonb(new_box));
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

REVOKE ALL ON FUNCTION safebyok_record(jsonb)                                          FROM PUBLIC;
REVOKE ALL ON FUNCTION safebyok_birth_vault(jsonb, text, text)                         FROM PUBLIC;
REVOKE ALL ON FUNCTION safebyok_revise_vault(jsonb, text, text, text, text)            FROM PUBLIC;
REVOKE ALL ON FUNCTION safebyok_birth_box(jsonb, text, text, integer)                  FROM PUBLIC;
REVOKE ALL ON FUNCTION safebyok_revise_box(jsonb, text, text, integer, text, text)     FROM PUBLIC;
