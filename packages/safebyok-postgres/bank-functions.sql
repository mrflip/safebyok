-- safebyok-postgres: the functions PostgresBankDB calls to write a bank, gate, vault or box row. For Postgres 14 or later.
-- Run it after the tables, and again with each upgrade of safebyok-postgres: each run replaces the functions.
--
-- Each write function checks a record against the stored rows and stores it, in one call. It does not throw when it
-- stores nothing. It returns one row, which says whether it stored the record (ok), and when it did, what happened
-- (act: born, replaced, deleted or reborn), the rows as they are now, and what was stored before (presence: void, live
-- or gone). When it stores nothing, it returns the rows as they stand, and PostgresBankDB works out the answer from them.
-- PostgresBankDB calls a vault or box function only when the record may replace the row it expects, and the gate
-- function for every gate verb.
-- A function never overwrites a row whose fmt differs from the record's, and never stores a row under a row above
-- whose fmt is not this version's. A row in a later format is one this version of safebyok cannot read.
-- Each write function takes the record to store and the row the caller expects, both as JSON. The bank functions
-- also take the bank's main gate record, and the box functions the cap on box rows.
--
-- A gate, vault or box write reads the row above it without a lock. This is on purpose: a lock on the row above would
-- make every writer under one bank or vault wait its turn, to guard against a rare race. Three things follow.
-- - A vault written while its bank is deleted may be written into a bank life that has ended, and a box written while
--   its vault is deleted or created anew into a vault life that has ended. Nothing reads such a row again, and
--   tidyGone, or the end of its bank's life, deletes it.
-- - A box write counts the vault life's box rows without a lock, so writers racing to add their first box may pass the
--   cap together. The cap is soft, and tidyGone does not trim it.
-- - The foreign key of a new gate, vault or box row takes a key-share lock on its bank row, which no write to the bank
--   row waits on.
-- Each statement sees what was committed when it started. So when nothing is stored, the rows returned are the rows
-- as they stand after any wait on another writer.
--
-- A function that stores a record notifies the user's channel in the same transaction (see safebyok_tell). The rows a
-- delBank or delVault deletes with it are not told of: a listener hears the tombstone.
--
-- The functions run with the caller's privileges, and only their owner, the role that ran this file, may call them.

-- Convert a row to the record it was stored from, dropping the columns that are null. Returns null for no row.
-- Only top-level nulls are dropped: a null inside wayins or sidecar is part of the record.
CREATE OR REPLACE FUNCTION safebyok_record(stored jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_object_agg(col.key, col.value) FROM jsonb_each(stored) AS col WHERE col.value <> 'null'::jsonb
$$;

-- Notify the user's channel, safebyok_<user_id>, of a row just stored, with the row above it: a gate or vault row's
-- bank row, or a box row's vault row. A bank row has none.
-- The notice is a JSON object with the stored row's address under at, the row under row, and the row above under
-- parent. A box row's address carries the life of its vault, bank_tok and vault_tok.
-- Postgres refuses a notice of 8000 bytes or more. A notice that is too large drops the row above first, then both
-- rows. A listener that gets only an address fetches the rows itself.
CREATE OR REPLACE FUNCTION safebyok_tell(parent jsonb, stored jsonb) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  is_box boolean := stored ? 'boxlabel';
  at     jsonb   := safebyok_record(jsonb_build_object(
    'user_id', stored->'user_id', 'banklabel', stored->'banklabel', 'gatelabel', stored->'gatelabel', 'vaultlabel', stored->'vaultlabel',
    'bank_tok', CASE WHEN is_box THEN stored->'bank_tok' END, 'vault_tok', CASE WHEN is_box THEN stored->'vault_tok' END,
    'boxlabel', stored->'boxlabel'));
  notice text    := safebyok_record(jsonb_build_object('at', at, 'parent', parent, 'row', stored))::text;
BEGIN
  IF octet_length(notice) >= 8000 AND parent IS NOT NULL THEN notice := jsonb_build_object('at', at, 'row', stored)::text; END IF;
  IF octet_length(notice) >= 8000 THEN notice := jsonb_build_object('at', at)::text; END IF;
  PERFORM pg_notify('safebyok_' || (stored->>'user_id'), notice);
END $$;

-- Store a bank's first record and its main gate, if no bank row exists at its scope. expected_row is not read.
-- A bank row is never deleted, so no gate row stands under a bank that has none.
CREATE OR REPLACE FUNCTION safebyok_birth_bank(new_record jsonb, new_gate jsonb, expected_row jsonb)
RETURNS TABLE (ok boolean, act text, bank jsonb, gate jsonb, presence text)
LANGUAGE plpgsql AS $$
DECLARE
  new_bank safebyok_banks := jsonb_populate_record(NULL::safebyok_banks, new_record);
  new_main safebyok_gates := jsonb_populate_record(NULL::safebyok_gates, new_gate);
BEGIN
  ok := false;
  IF new_bank.am = 'a' AND new_bank.revision_seq = 0 THEN
    INSERT INTO safebyok_banks VALUES (new_bank.*)
    ON CONFLICT (user_id, banklabel) DO NOTHING;
    ok := FOUND;
  END IF;

  IF ok THEN
    INSERT INTO safebyok_gates VALUES (new_main.*);
    act := 'born';  presence := 'void';
    bank := safebyok_record(to_jsonb(new_bank));  gate := safebyok_record(to_jsonb(new_main));
    PERFORM safebyok_tell(NULL, bank);
    PERFORM safebyok_tell(bank, gate);
    RETURN NEXT;  RETURN;
  END IF;

  SELECT safebyok_record(to_jsonb(b)), (
    SELECT safebyok_record(to_jsonb(g)) FROM safebyok_gates AS g
    WHERE  (g.user_id, g.banklabel, g.gatelabel) = (new_bank.user_id, new_bank.banklabel, 'main')
  ) INTO bank, gate
  FROM   (SELECT 1) AS one LEFT JOIN safebyok_banks AS b
    ON   (b.user_id, b.banklabel) = (new_bank.user_id, new_bank.banklabel);
  RETURN NEXT;
END $$;

-- Store a bank's next record over the expected row: a buildBank over a tombstone, with its new main gate, or a
-- delBank's tombstone over a live row, with new_gate null.
-- The record is stored only if the stored row has the expected revision_tok, am and bank_tok, the record's
-- revision_seq is one past the row's, and the record's am differs from the row's: a buildBank over a live bank, and a
-- delBank over a tombstone, store nothing.
-- The same write deletes every gate, vault and box row under the bank's scope, whatever its life, then stores the
-- new main gate of a bank built anew.
CREATE OR REPLACE FUNCTION safebyok_revise_bank(new_record jsonb, new_gate jsonb, expected_row jsonb)
RETURNS TABLE (ok boolean, act text, bank jsonb, gate jsonb, presence text)
LANGUAGE plpgsql AS $$
DECLARE
  new_bank safebyok_banks := jsonb_populate_record(NULL::safebyok_banks, new_record);
  new_main safebyok_gates := jsonb_populate_record(NULL::safebyok_gates, new_gate);
  expected safebyok_banks := jsonb_populate_record(NULL::safebyok_banks, expected_row);
BEGIN
  UPDATE safebyok_banks AS b
  SET    (fmt, am, revision_tok, revision_seq, registered_at, written_at, bank_tok)
       = (new_bank.fmt, new_bank.am, new_bank.revision_tok, new_bank.revision_seq, new_bank.registered_at, new_bank.written_at, new_bank.bank_tok)
  WHERE  (b.user_id, b.banklabel) = (new_bank.user_id, new_bank.banklabel)
    AND  b.revision_tok = expected.revision_tok
    AND  b.am = expected.am
    AND  b.bank_tok = expected.bank_tok
    AND  b.fmt = new_bank.fmt
    AND  b.revision_seq = new_bank.revision_seq - 1
    AND  b.am <> new_bank.am;
  ok := FOUND;

  IF ok THEN
    DELETE FROM safebyok_boxes  AS x WHERE (x.user_id, x.banklabel) = (new_bank.user_id, new_bank.banklabel);
    DELETE FROM safebyok_vaults AS v WHERE (v.user_id, v.banklabel) = (new_bank.user_id, new_bank.banklabel);
    DELETE FROM safebyok_gates  AS g WHERE (g.user_id, g.banklabel) = (new_bank.user_id, new_bank.banklabel);
    act      := CASE WHEN new_bank.am = 'a' THEN 'reborn' ELSE 'deleted' END;
    presence := CASE WHEN expected.am = 'a' THEN 'live' ELSE 'gone' END;
    bank     := safebyok_record(to_jsonb(new_bank));
    PERFORM safebyok_tell(NULL, bank);
    IF new_bank.am = 'a' THEN
      INSERT INTO safebyok_gates VALUES (new_main.*);
      gate := safebyok_record(to_jsonb(new_main));
      PERFORM safebyok_tell(bank, gate);
    END IF;
    RETURN NEXT;  RETURN;
  END IF;

  SELECT safebyok_record(to_jsonb(b)), (
    SELECT safebyok_record(to_jsonb(g)) FROM safebyok_gates AS g
    WHERE  (g.user_id, g.banklabel, g.gatelabel) = (new_bank.user_id, new_bank.banklabel, 'main')
  ) INTO bank, gate
  FROM   (SELECT 1) AS one LEFT JOIN safebyok_banks AS b
    ON   (b.user_id, b.banklabel) = (new_bank.user_id, new_bank.banklabel);
  RETURN NEXT;
END $$;

-- Store a gate verb's record over the expected gate row.
-- The record is stored only if the bank is live in the record's bank_tok, the stored gate row has that bank_tok and
-- the expected revision_tok, am and gate_tok, and the record's revision_seq is one past the row's.
CREATE OR REPLACE FUNCTION safebyok_put_gate(new_record jsonb, expected_row jsonb)
RETURNS TABLE (ok boolean, act text, bank jsonb, gate jsonb, presence text)
LANGUAGE plpgsql AS $$
DECLARE
  new_gate   safebyok_gates := jsonb_populate_record(NULL::safebyok_gates, new_record);
  expected   safebyok_gates := jsonb_populate_record(NULL::safebyok_gates, expected_row);
  its_bank   safebyok_banks;
BEGIN
  SELECT b.* INTO its_bank FROM safebyok_banks AS b
  WHERE  (b.user_id, b.banklabel) = (new_gate.user_id, new_gate.banklabel);

  ok := false;
  IF its_bank.am = 'a' AND its_bank.bank_tok = new_gate.bank_tok AND its_bank.fmt = 3001 THEN
    UPDATE safebyok_gates AS g
    SET    (fmt, am, revision_tok, revision_seq, registered_at, written_at, bank_tok, gate_tok, wayins, auth, sigs, meta)
         = (new_gate.fmt, new_gate.am, new_gate.revision_tok, new_gate.revision_seq, new_gate.registered_at, new_gate.written_at, new_gate.bank_tok, new_gate.gate_tok,
            new_gate.wayins, new_gate.auth, new_gate.sigs, new_gate.meta)
    WHERE  (g.user_id, g.banklabel, g.gatelabel) = (new_gate.user_id, new_gate.banklabel, new_gate.gatelabel)
      AND  g.bank_tok = new_gate.bank_tok
      AND  g.revision_tok = expected.revision_tok
      AND  g.am = expected.am
      AND  g.gate_tok = expected.gate_tok
      AND  g.fmt = new_gate.fmt
      AND  g.revision_seq = new_gate.revision_seq - 1;
    ok := FOUND;
  END IF;

  IF ok THEN
    act := 'replaced';  presence := 'live';
    bank := safebyok_record(to_jsonb(its_bank));  gate := safebyok_record(to_jsonb(new_gate));
    PERFORM safebyok_tell(bank, gate);
    RETURN NEXT;  RETURN;
  END IF;

  SELECT safebyok_record(to_jsonb(b)), (
    SELECT safebyok_record(to_jsonb(g)) FROM safebyok_gates AS g
    WHERE  (g.user_id, g.banklabel, g.gatelabel) = (new_gate.user_id, new_gate.banklabel, new_gate.gatelabel)
  ) INTO bank, gate
  FROM   (SELECT 1) AS one LEFT JOIN safebyok_banks AS b
    ON   (b.user_id, b.banklabel) = (new_gate.user_id, new_gate.banklabel);
  RETURN NEXT;
END $$;

-- Store a vault's first record, if its bank is live in the record's bank_tok and no vault row of that bank life
-- exists at its scope. A vault row of an ended life of the bank counts as none, and is overwritten. expected_row is
-- not read.
CREATE OR REPLACE FUNCTION safebyok_birth_vault(new_record jsonb, expected_row jsonb)
RETURNS TABLE (ok boolean, act text, bank jsonb, vault jsonb, presence text)
LANGUAGE plpgsql AS $$
DECLARE
  new_vault safebyok_vaults := jsonb_populate_record(NULL::safebyok_vaults, new_record);
  its_bank  safebyok_banks;
BEGIN
  SELECT b.* INTO its_bank FROM safebyok_banks AS b
  WHERE  (b.user_id, b.banklabel) = (new_vault.user_id, new_vault.banklabel);

  ok := false;
  IF its_bank.am = 'a' AND its_bank.bank_tok = new_vault.bank_tok AND its_bank.fmt = 3001
     AND new_vault.am = 'a' AND new_vault.revision_seq = 0 THEN
    INSERT INTO safebyok_vaults AS v VALUES (new_vault.*)
    ON CONFLICT (user_id, banklabel, vaultlabel) DO UPDATE
    SET    (fmt, am, revision_tok, revision_seq, registered_at, written_at, bank_tok, vault_tok)
         = (EXCLUDED.fmt, EXCLUDED.am, EXCLUDED.revision_tok, EXCLUDED.revision_seq, EXCLUDED.registered_at, EXCLUDED.written_at, EXCLUDED.bank_tok, EXCLUDED.vault_tok)
    WHERE  v.bank_tok <> EXCLUDED.bank_tok
      AND  v.fmt = EXCLUDED.fmt;
    ok := FOUND;
  END IF;

  IF ok THEN
    act := 'born';  presence := 'void';
    bank := safebyok_record(to_jsonb(its_bank));  vault := safebyok_record(to_jsonb(new_vault));
    PERFORM safebyok_tell(bank, vault);
    RETURN NEXT;  RETURN;
  END IF;

  SELECT safebyok_record(to_jsonb(b)), (
    SELECT safebyok_record(to_jsonb(v)) FROM safebyok_vaults AS v
    WHERE  (v.user_id, v.banklabel, v.vaultlabel) = (new_vault.user_id, new_vault.banklabel, new_vault.vaultlabel)
  ) INTO bank, vault
  FROM   (SELECT 1) AS one LEFT JOIN safebyok_banks AS b
    ON   (b.user_id, b.banklabel) = (new_vault.user_id, new_vault.banklabel);
  RETURN NEXT;
END $$;

-- Store a vault's next record over the expected row, live or a tombstone: a replace, a del, or a put over a tombstone.
-- The record is stored only if the bank is live in the record's bank_tok, the stored row has that bank_tok and the
-- expected revision_tok, am and vault_tok, and the record's revision_seq is one past the row's. A tombstone never
-- replaces a tombstone.
-- A del deletes, in the same write, the box rows of the vault life it ends.
CREATE OR REPLACE FUNCTION safebyok_revise_vault(new_record jsonb, expected_row jsonb)
RETURNS TABLE (ok boolean, act text, bank jsonb, vault jsonb, presence text)
LANGUAGE plpgsql AS $$
DECLARE
  new_vault safebyok_vaults := jsonb_populate_record(NULL::safebyok_vaults, new_record);
  expected  safebyok_vaults := jsonb_populate_record(NULL::safebyok_vaults, expected_row);
  its_bank  safebyok_banks;
BEGIN
  SELECT b.* INTO its_bank FROM safebyok_banks AS b
  WHERE  (b.user_id, b.banklabel) = (new_vault.user_id, new_vault.banklabel);

  ok := false;
  IF its_bank.am = 'a' AND its_bank.bank_tok = new_vault.bank_tok AND its_bank.fmt = 3001 THEN
    UPDATE safebyok_vaults AS v
    SET    (fmt, am, revision_tok, revision_seq, registered_at, written_at, vault_tok)
         = (new_vault.fmt, new_vault.am, new_vault.revision_tok, new_vault.revision_seq, new_vault.registered_at, new_vault.written_at, new_vault.vault_tok)
    WHERE  (v.user_id, v.banklabel, v.vaultlabel) = (new_vault.user_id, new_vault.banklabel, new_vault.vaultlabel)
      AND  v.bank_tok = new_vault.bank_tok
      AND  v.revision_tok = expected.revision_tok
      AND  v.am = expected.am
      AND  v.vault_tok = expected.vault_tok
      AND  v.fmt = new_vault.fmt
      AND  v.revision_seq = new_vault.revision_seq - 1
      AND  (v.am = 'a' OR new_vault.am = 'a');
    ok := FOUND;
  END IF;

  IF ok THEN
    IF new_vault.am <> 'a' THEN
      DELETE FROM safebyok_boxes AS x
      WHERE  (x.user_id, x.banklabel, x.vaultlabel, x.bank_tok, x.vault_tok)
           = (new_vault.user_id, new_vault.banklabel, new_vault.vaultlabel, new_vault.bank_tok, expected.vault_tok);
    END IF;
    act      := CASE WHEN expected.am <> 'a' THEN 'reborn' WHEN new_vault.am = 'a' THEN 'replaced' ELSE 'deleted' END;
    presence := CASE WHEN expected.am = 'a' THEN 'live' ELSE 'gone' END;
    bank     := safebyok_record(to_jsonb(its_bank));  vault := safebyok_record(to_jsonb(new_vault));
    PERFORM safebyok_tell(bank, vault);
    RETURN NEXT;  RETURN;
  END IF;

  SELECT safebyok_record(to_jsonb(b)), (
    SELECT safebyok_record(to_jsonb(v)) FROM safebyok_vaults AS v
    WHERE  (v.user_id, v.banklabel, v.vaultlabel) = (new_vault.user_id, new_vault.banklabel, new_vault.vaultlabel)
  ) INTO bank, vault
  FROM   (SELECT 1) AS one LEFT JOIN safebyok_banks AS b
    ON   (b.user_id, b.banklabel) = (new_vault.user_id, new_vault.banklabel);
  RETURN NEXT;
END $$;

-- Store a box's first record, if no box row exists at its address in its vault's life, its vault is live in that
-- life, and the life has room under the cap. The cap counts every box row of the vault life, live or tombstone.
-- boxcount is that count, taken without a lock. expected_row is not read.
CREATE OR REPLACE FUNCTION safebyok_birth_box(new_record jsonb, expected_row jsonb, maxboxes integer)
RETURNS TABLE (ok boolean, act text, parent jsonb, box jsonb, presence text, boxcount integer)
LANGUAGE plpgsql AS $$
DECLARE
  new_box   safebyok_boxes := jsonb_populate_record(NULL::safebyok_boxes, new_record);
  its_vault safebyok_vaults;
BEGIN
  SELECT v.* INTO its_vault FROM safebyok_vaults AS v
  WHERE  (v.user_id, v.banklabel, v.vaultlabel) = (new_box.user_id, new_box.banklabel, new_box.vaultlabel);
  SELECT count(*)::integer INTO boxcount FROM safebyok_boxes AS x
  WHERE  (x.user_id, x.banklabel, x.vaultlabel, x.bank_tok, x.vault_tok) = (new_box.user_id, new_box.banklabel, new_box.vaultlabel, new_box.bank_tok, new_box.vault_tok);

  ok := false;
  IF its_vault.am = 'a' AND its_vault.bank_tok = new_box.bank_tok AND its_vault.vault_tok = new_box.vault_tok AND its_vault.fmt = 6003
     AND new_box.am = 'a' AND new_box.revision_seq = 0
     AND boxcount < maxboxes THEN
    INSERT INTO safebyok_boxes VALUES (new_box.*)
    ON CONFLICT (user_id, banklabel, vaultlabel, bank_tok, vault_tok, boxlabel) DO NOTHING;
    ok := FOUND;
  END IF;

  IF ok THEN
    act := 'born';  presence := 'void';
    parent := safebyok_record(to_jsonb(its_vault));  box := safebyok_record(to_jsonb(new_box));
    PERFORM safebyok_tell(parent, box);
    RETURN NEXT;  RETURN;
  END IF;

  SELECT safebyok_record(to_jsonb(v)), (
    SELECT safebyok_record(to_jsonb(x)) FROM safebyok_boxes AS x
    WHERE  (x.user_id, x.banklabel, x.vaultlabel, x.bank_tok, x.vault_tok, x.boxlabel)
         = (new_box.user_id, new_box.banklabel, new_box.vaultlabel, new_box.bank_tok, new_box.vault_tok, new_box.boxlabel)
  ) INTO parent, box
  FROM   (SELECT 1) AS one LEFT JOIN safebyok_vaults AS v
    ON   (v.user_id, v.banklabel, v.vaultlabel) = (new_box.user_id, new_box.banklabel, new_box.vaultlabel);
  RETURN NEXT;
END $$;

-- Store a box's next record over the expected row, live or a tombstone: a replace, a del, or a put over a tombstone.
-- The record is stored only if the stored row has the expected revision_tok, am and box_tok, the record's
-- revision_seq is one past the row's, and the vault is live in the box's life. A tombstone never replaces a tombstone.
-- It adds no box row, so the cap does not apply. It takes maxboxes only so that both box functions take the same
-- arguments, and does not read it.
CREATE OR REPLACE FUNCTION safebyok_revise_box(new_record jsonb, expected_row jsonb, maxboxes integer)
RETURNS TABLE (ok boolean, act text, parent jsonb, box jsonb, presence text)
LANGUAGE plpgsql AS $$
DECLARE
  new_box   safebyok_boxes := jsonb_populate_record(NULL::safebyok_boxes, new_record);
  expected  safebyok_boxes := jsonb_populate_record(NULL::safebyok_boxes, expected_row);
  its_vault safebyok_vaults;
BEGIN
  SELECT v.* INTO its_vault FROM safebyok_vaults AS v
  WHERE  (v.user_id, v.banklabel, v.vaultlabel) = (new_box.user_id, new_box.banklabel, new_box.vaultlabel);

  ok := false;
  IF its_vault.am = 'a' AND its_vault.bank_tok = new_box.bank_tok AND its_vault.vault_tok = new_box.vault_tok AND its_vault.fmt = 6003 THEN
    UPDATE safebyok_boxes AS x
    SET    (fmt, am, revision_tok, revision_seq, registered_at, written_at, box_tok,
            whisper_codec, whisper_schema_version, sidecar, box_key_wrapped, whisper_ciphered)
         = (new_box.fmt, new_box.am, new_box.revision_tok, new_box.revision_seq, new_box.registered_at, new_box.written_at, new_box.box_tok,
            new_box.whisper_codec, new_box.whisper_schema_version, new_box.sidecar, new_box.box_key_wrapped, new_box.whisper_ciphered)
    WHERE  (x.user_id, x.banklabel, x.vaultlabel, x.bank_tok, x.vault_tok, x.boxlabel)
         = (new_box.user_id, new_box.banklabel, new_box.vaultlabel, new_box.bank_tok, new_box.vault_tok, new_box.boxlabel)
      AND  x.revision_tok = expected.revision_tok
      AND  x.am = expected.am
      AND  x.box_tok = expected.box_tok
      AND  x.fmt = new_box.fmt
      AND  x.revision_seq = new_box.revision_seq - 1
      AND  (x.am = 'a' OR new_box.am = 'a');
    ok := FOUND;
  END IF;

  IF ok THEN
    act      := CASE WHEN expected.am <> 'a' THEN 'reborn' WHEN new_box.am = 'a' THEN 'replaced' ELSE 'deleted' END;
    presence := CASE WHEN expected.am = 'a' THEN 'live' ELSE 'gone' END;
    parent := safebyok_record(to_jsonb(its_vault));  box := safebyok_record(to_jsonb(new_box));
    PERFORM safebyok_tell(parent, box);
    RETURN NEXT;  RETURN;
  END IF;

  SELECT safebyok_record(to_jsonb(v)), (
    SELECT safebyok_record(to_jsonb(x)) FROM safebyok_boxes AS x
    WHERE  (x.user_id, x.banklabel, x.vaultlabel, x.bank_tok, x.vault_tok, x.boxlabel)
         = (new_box.user_id, new_box.banklabel, new_box.vaultlabel, new_box.bank_tok, new_box.vault_tok, new_box.boxlabel)
  ) INTO parent, box
  FROM   (SELECT 1) AS one LEFT JOIN safebyok_vaults AS v
    ON   (v.user_id, v.banklabel, v.vaultlabel) = (new_box.user_id, new_box.banklabel, new_box.vaultlabel);
  RETURN NEXT;
END $$;

REVOKE ALL ON FUNCTION safebyok_record(jsonb)                              FROM PUBLIC;
REVOKE ALL ON FUNCTION safebyok_tell(jsonb, jsonb)                         FROM PUBLIC;
REVOKE ALL ON FUNCTION safebyok_birth_bank(jsonb, jsonb, jsonb)            FROM PUBLIC;
REVOKE ALL ON FUNCTION safebyok_revise_bank(jsonb, jsonb, jsonb)           FROM PUBLIC;
REVOKE ALL ON FUNCTION safebyok_put_gate(jsonb, jsonb)                     FROM PUBLIC;
REVOKE ALL ON FUNCTION safebyok_birth_vault(jsonb, jsonb)                  FROM PUBLIC;
REVOKE ALL ON FUNCTION safebyok_revise_vault(jsonb, jsonb)                 FROM PUBLIC;
REVOKE ALL ON FUNCTION safebyok_birth_box(jsonb, jsonb, integer)           FROM PUBLIC;
REVOKE ALL ON FUNCTION safebyok_revise_box(jsonb, jsonb, integer)          FROM PUBLIC;
