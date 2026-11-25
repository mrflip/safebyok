import type { Thingkind } from 'safebyok/storage'

// == [Names]: TableVersion, SqlRevision, VaultFunctionNames

// TableVersion is safebyok's ThingFormat, spelled out because safebyok is private and a published package never imports
// it at runtime; a test holds them equal, so TableVersion moves whenever ThingFormat does. Until 1.0.0, no change to
// the tables or the functions bumps either name: nothing stored binds backward, and a host drops the vault tables,
// creates them again and runs VaultFunctionsSql again over them, first dropping each function whose arguments or result
// changed, which Postgres will not replace in place. From 1.0.0: bump both when any table's columns, CHECKs or stored
// record format change, since functions built for other tables will not work. Bump SqlRevision when a function's
// behaviour or signature changes over the same tables, and reset it to 0 when TableVersion moves. Each pair names a new
// set of functions; the older sets stay installed beside it.
/** The head of every vault function's name: the tables these functions are built for, and the `fmt` of the Things in them. */
export const TableVersion = 'a010501'
/** The tail of every vault function's name: the revision of these functions over the same tables. */
export const SqlRevision  = 0

/** Every vault function's name without its version, which {@link VaultFunctionNames} adds. */
const VaultFunctionStems = [
  'thing_record', 'world', 'root_box', 'tracked', 'tell_thing', 'base32_of_bigint', 'bigint_of_base32', 'lifeseq_ok', 'lifepath_kept',
  'replace_passphrase_ok', 'add_passkey_ok', 'revoke_passkey_ok', 'gate_policies_ok', 'write_bank', 'write_gate', 'write_box', 'birth_roots',
] as const

// The revision is zero-padded so that the names sort by it.
/** The name of each vault function under {@link TableVersion} and {@link SqlRevision}, such as `safebyok_a010501_r000_write_box`. */
export const VaultFunctionNames = Object.freeze(Object.fromEntries(VaultFunctionStems.map((stem) => (
  [stem, `safebyok_${TableVersion}_r${String(SqlRevision).padStart(3, '0')}_${stem}`]
)))) as Readonly<Record<typeof VaultFunctionStems[number], string>>
// --

// Each kind's write function is the same statement over its own table and body columns; the bank's alone also checks that
// a write over a live bank keeps its lifetok, and the gate's alone the storage policies its write names. Each is written
// out from writeFunctionOf, so the three cannot drift apart.

/** What sets one kind's write function apart: its table, the columns of its body, the bank's lifetok check, and the gate's storage policies. */
type WriteFunctionSpec = Readonly<{ kind: Thingkind, table: string, body: readonly string[], lifetoked: boolean, policied: boolean }>

const VoidRevtok = `'00000000-0000-0000-0000-000000000000'`

/** The SQL of one kind's write function, from what sets it apart. */
function writeFunctionOf({ kind, table, body, lifetoked, policied }: WriteFunctionSpec): string {
  const columns       = ['fmt', 'am', 'lifepath', 'lifeseq', 'revtok', 'revseq', 'born_at', 'written_at', ...body]
  const policiesArg   = policied ? ', policies text[]' : ''
  const lifetokOut    = lifetoked ? ', lifetok_ok boolean' : ''
  const policiesOut   = policied ? ', policies_ok boolean' : ''
  // The checks whose verdicts a refusal reports: each is the Thing stored's to fail, where the act tables find a write.
  const bornAtCheck   = '((stored.am <> proposed.am) OR (stored.born_at = proposed.born_at))'
  const lifetokCheck  = `((stored.am <> 'a') OR (stored.lifetok = proposed.lifetok))`
  const policiesCheck = `((stored.am <> proposed.am) OR ${VaultFunctionNames.gate_policies_ok}(policies, stored.wayins, cited.wayins, proposed.wayins))`
  return `
CREATE OR REPLACE FUNCTION ${VaultFunctionNames[`write_${kind}`]}(proposed_record jsonb, cited_record jsonb${policiesArg})
RETURNS TABLE (ok boolean, thing jsonb, world jsonb, root jsonb, born_at_ok boolean${lifetokOut}${policiesOut})
LANGUAGE plpgsql AS $$
DECLARE
  proposed ${table} := jsonb_populate_record(NULL::${table}, proposed_record);
  cited    ${table} := jsonb_populate_record(NULL::${table}, cited_record);
BEGIN
  IF (cited.revseq = -1) THEN
    -- Over the shell: a birth, where no row is stored.
    INSERT INTO ${table} AS stored
    SELECT (proposed).*
    WHERE  (cited.revtok = ${VoidRevtok})
      AND  (proposed.revseq = 0)
      AND  (proposed.am = 'a')
      AND  (proposed.born_at = proposed.written_at)
      AND  ${VaultFunctionNames.lifeseq_ok}(NULL, NULL, proposed.lifeseq, proposed.am)
      AND  ${VaultFunctionNames.lifepath_kept}(cited.lifepath, proposed.lifepath)
    ON CONFLICT DO NOTHING  -- variation approved for birth calls: a birth is an ensure, so a conflict is the present case, which the read below answers
    RETURNING ${VaultFunctionNames.thing_record}(to_jsonb(stored)) INTO thing;
  ELSE
    UPDATE ${table} AS stored
    SET    (${columns.join(', ')})
         = (${columns.map((column) => `proposed.${column}`).join(', ')})
    WHERE  ((stored.userid, stored.banklabel, stored.labelpath) = (proposed.userid, proposed.banklabel, proposed.labelpath))
      AND  (stored.revtok   = cited.revtok)
      AND  (stored.am       = cited.am)
      AND  (stored.lifepath = cited.lifepath)
      AND  (stored.revseq   = (proposed.revseq - 1))
      AND  (stored.revtok  <> proposed.revtok)
      AND  (stored.fmt      = proposed.fmt)
      AND  ((stored.am = 'a') OR (proposed.am = 'a'))                                -- no tombstone over a tombstone
      AND  ${bornAtCheck}                                                            -- a live Thing keeps its born_at
      AND  ((stored.am = 'a') OR (proposed.born_at = proposed.written_at))           -- a rebirth is born when written
      AND  ${VaultFunctionNames.lifeseq_ok}(stored.lifeseq, stored.am, proposed.lifeseq, proposed.am)
      AND  ${VaultFunctionNames.lifepath_kept}(stored.lifepath, proposed.lifepath)${lifetoked ? `
      AND  ${lifetokCheck}                                                           -- a write over a live bank keeps its lifetok` : ''}${policied ? `
      AND  ${policiesCheck}                                                          -- a live gate meets its storage policies` : ''}
    RETURNING ${VaultFunctionNames.thing_record}(to_jsonb(stored)) INTO thing;
  END IF;

  IF FOUND THEN
    ok := true;  born_at_ok := true;${lifetoked ? '  lifetok_ok := true;' : ''}${policied ? '  policies_ok := true;' : ''}
    -- The world and root box after the write, in statements of their own: a statement does not see what it writes itself.
    -- Another write may land between, so at worst these read newer rows, which a receiver orders by their revisions.
    world := ${VaultFunctionNames.world}(proposed.userid, proposed.banklabel);
    root  := ${VaultFunctionNames.root_box}(proposed.userid, proposed.banklabel);
    PERFORM ${VaultFunctionNames.tell_thing}(thing, world->'bank');
    RETURN NEXT;  RETURN;
  END IF;

  ok := false;
  SELECT (SELECT ${VaultFunctionNames.thing_record}(to_jsonb(stored))),
         COALESCE(${bornAtCheck}, true)${lifetoked ? `,
         COALESCE(${lifetokCheck}, true)` : ''}${policied ? `,
         COALESCE(${policiesCheck}, true)` : ''},
         ${VaultFunctionNames.world}(proposed.userid, proposed.banklabel),
         ${VaultFunctionNames.root_box}(proposed.userid, proposed.banklabel)
  INTO   thing, born_at_ok${lifetoked ? ', lifetok_ok' : ''}${policied ? ', policies_ok' : ''}, world, root
  FROM   (SELECT) AS one
  LEFT JOIN ${table} AS stored
    ON   ((stored.userid, stored.banklabel, stored.labelpath) = (proposed.userid, proposed.banklabel, proposed.labelpath));
  RETURN NEXT;
END $$;
`
}

/** The SQL that creates the functions PostgresVaultDB calls: `await pool.query(VaultFunctionsSql)`, after `VaultTablesSql`. */
export const VaultFunctionsSql = `-- safebyok-postgres: the functions PostgresVaultDB calls to write a Thing. For Postgres 14 or later.
-- Run it after the tables, and again with each upgrade of safebyok-postgres. Each name carries the version of the tables
-- the function is built for and its own revision, so an upgrade adds its functions beside the old ones, which stay;
-- running the same version again replaces its own.
--
-- Do not change the locking semantics: no transaction block (BEGIN ... COMMIT), no row lock (SELECT ... FOR UPDATE).
-- Discuss first.
--
-- PostgresVaultDB has made every check below already. They are made again here because this is a boundary that counts:
-- behind GraphQL, Postgres or Convex the adapter's TypeScript runs on the device, beside every script in the page, and
-- only what runs here holds against one that calls Postgres directly. And only the statement that writes a row sees the
-- row it writes over: the checks sit in its WHERE, so when it waits on another writer of the row, Postgres checks them
-- again against the row that writer left.
--
-- Each write function stores its record in one statement, which waits only on a writer of the same row. It does not
-- throw when it stores nothing. It returns one row: whether it stored the record (ok), the row as it now stands, the
-- bank's world (the bank and main gate rows, each null for none), its root box row (null for none), and the verdict of
-- each named check on that row. When it stored the record, the world and root box are read just after, in the same
-- transaction; when it stored nothing, in the statement that reads the row back.
--
-- A function that stores a record notifies the user's channel in the same transaction (see ${VaultFunctionNames.tell_thing}).
--
-- The functions run with the caller's privileges, and only their owner, the role that ran this file, may call them.

-- Convert a row to the Thing it was stored from, dropping the columns that are null. Returns null for no row.
-- Only top-level nulls are dropped: a null inside wayins is part of the Thing.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.thing_record}(stored jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_object_agg(col.key, col.value) FROM jsonb_each(stored) AS col WHERE col.value <> 'null'::jsonb
$$;

-- The world of a bank: its bank row under bank, and its main gate row under maingate, each null for none.
-- STABLE, so it reads in the calling statement's snapshot.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.world}(of_userid text, of_banklabel text) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'bank', (
      SELECT ${VaultFunctionNames.thing_record}(to_jsonb(bank)) FROM safebyok_bank_things AS bank
      WHERE  (bank.userid, bank.banklabel, bank.labelpath) = (of_userid, of_banklabel, 'bank')
    ),
    'maingate', (
      SELECT ${VaultFunctionNames.thing_record}(to_jsonb(gate)) FROM safebyok_gate_things AS gate
      WHERE  (gate.userid, gate.banklabel, gate.labelpath) = (of_userid, of_banklabel, 'gate')
    )
  )
$$;

-- The root box row of a bank, null for none. STABLE, so it reads in the calling statement's snapshot.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.root_box}(of_userid text, of_banklabel text) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT ${VaultFunctionNames.thing_record}(to_jsonb(root)) FROM safebyok_box_things AS root
  WHERE  (root.userid, root.banklabel, root.labelpath) = (of_userid, of_banklabel, 'box')
$$;

-- How the bank and main gate in world, and the root box row root, compare with track, the revseq and lifepath an ask
-- tracks of each: under bank, gate and box, the JSON string 'same' where the row has both, else the row.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.tracked}(world jsonb, root jsonb, track jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT jsonb_build_object(
    'bank', CASE WHEN ((world->'bank'->'revseq', world->'bank'->'lifepath') = (track->'bank'->'revseq', track->'bank'->'lifepath'))
                 THEN '"same"'::jsonb ELSE world->'bank' END,
    'gate', CASE WHEN ((world->'maingate'->'revseq', world->'maingate'->'lifepath') = (track->'gate'->'revseq', track->'gate'->'lifepath'))
                 THEN '"same"'::jsonb ELSE world->'maingate' END,
    'box',  CASE WHEN ((root->'revseq', root->'lifepath') = (track->'box'->'revseq', track->'box'->'lifepath'))
                 THEN '"same"'::jsonb ELSE root END
  )
$$;

-- Notify the user's channel, safebyok_things_<userid>, of a Thing just stored, with its bank's row, null for none.
-- The notice is a JSON object with the Thing's scope under at, when Postgres read it under read_tc (a UUID version 7),
-- the Thing under thing, and the bank row under bank.
-- Postgres refuses a notice of 8000 bytes or more. A notice that is too large drops the bank row first, then the Thing.
-- A listener that gets only a scope fetches the Thing and the bank row itself.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.tell_thing}(thing jsonb, bank jsonb) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  at      jsonb := jsonb_build_object('userid', thing->'userid', 'banklabel', thing->'banklabel', 'labelpath', thing->'labelpath');
  read_tc text  := uuidv7()::text;
  notice  text  := jsonb_build_object('at', at, 'read_tc', read_tc, 'thing', thing, 'bank', bank)::text;
BEGIN
  IF octet_length(notice) >= 8000 THEN notice := jsonb_build_object('at', at, 'read_tc', read_tc, 'thing', thing)::text; END IF;
  IF octet_length(notice) >= 8000 THEN notice := jsonb_build_object('at', at, 'read_tc', read_tc)::text; END IF;
  PERFORM pg_notify('safebyok_things_' || (thing->>'userid'), notice);
END $$;

-- The 10 base-32 digits (0-9a-v) of lifenum: a lifeseq. Raises unless lifenum is between 0 and 32^10 - 1.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.base32_of_bigint}(lifenum bigint) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE AS $$
BEGIN
  IF ((lifenum < 0) OR (lifenum >= (1::bigint << 50))) THEN    -- 2^50 is 32^10
    RAISE EXCEPTION '${VaultFunctionNames.base32_of_bigint}: a lifeseq is a life from 0 to 32^10 - 1';
  END IF;
  RETURN (
    SELECT string_agg(substr('0123456789abcdefghijklmnopqrstuv', (((lifenum >> (5 * place)) & 31)::integer + 1), 1), '' ORDER BY place DESC)
    FROM   generate_series(0, 9) AS place
  );
END $$;

-- The number base-32 digits spell, either case. Raises for anything but base-32 digits.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.bigint_of_base32}(digits text) RETURNS bigint
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE AS $$
BEGIN
  IF (digits !~ '^[0-9a-vA-V]+$') THEN
    RAISE EXCEPTION '${VaultFunctionNames.bigint_of_base32}: a lifeseq is base-32 digits, 0-9 and a-v';
  END IF;
  RETURN (
    SELECT sum((strpos('0123456789abcdefghijklmnopqrstuv', substr(lower(digits), place, 1)) - 1)::bigint << (5 * (length(digits) - place)))::bigint
    FROM   generate_series(1, length(digits)) AS place
  );
END $$;

-- Each check below returns true or false and takes plain values, so one function serves every kind's table. A rule
-- about one row alone is a CHECK on the table; a function holds only what compares the proposed record with the stored
-- row or the cited one.

-- Whether proposed_lifeseq follows stored_lifeseq: one past the stored when am flips, the same when not. A null stored
-- is the shell: life -1, gone. So a birth is life 0. The parity of each lifeseq is a CHECK on the row, not this.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.lifeseq_ok}(stored_lifeseq text, stored_am text, proposed_lifeseq text, proposed_am text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT (
    proposed_lifeseq = ${VaultFunctionNames.base32_of_bigint}(
      (COALESCE(${VaultFunctionNames.bigint_of_base32}(stored_lifeseq), -1))
      + (CASE WHEN (COALESCE(stored_am, 'x') <> proposed_am) THEN 1 ELSE 0 END)
    )
  )
$$;

-- Whether proposed_lifepath keeps the lives above its own in stored_lifepath: the lifeseqs of the Things above it.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.lifepath_kept}(stored_lifepath text, proposed_lifepath text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT (regexp_replace(stored_lifepath, '[^/]*$', '') = regexp_replace(proposed_lifepath, '[^/]*$', ''))
$$;

-- The storage policies, one function each, as notes/storage-policies.md lists them, less big's registered_at check: the
-- write function checks born_at for every live-over-live write. A gate with no passkey wayin has passkey0 JSON null.

-- Whether a gate write replaces the passphrase wayin the gating proved against, and nothing else.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.replace_passphrase_ok}(stored_wayins jsonb, cited_wayins jsonb, proposed_wayins jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT COALESCE(
        ((stored_wayins -> 'main') = (cited_wayins -> 'main'))
    AND ((stored_wayins - 'main') = (proposed_wayins - 'main')), false)
$$;

-- Whether a gate write adds a passkey wayin to a gate that has none, and changes nothing else.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.add_passkey_ok}(stored_wayins jsonb, proposed_wayins jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT COALESCE(
        (jsonb_typeof(stored_wayins -> 'passkey0') = 'null')
    AND (jsonb_typeof(proposed_wayins -> 'passkey0') = 'object')
    AND ((stored_wayins - 'passkey0') = (proposed_wayins - 'passkey0')), false)
$$;

-- Whether a gate write removes the gate's passkey wayin, and changes nothing else.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.revoke_passkey_ok}(stored_wayins jsonb, proposed_wayins jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT COALESCE(
        (jsonb_typeof(stored_wayins -> 'passkey0') = 'object')
    AND (jsonb_typeof(proposed_wayins -> 'passkey0') = 'null')
    AND ((stored_wayins - 'passkey0') = (proposed_wayins - 'passkey0')), false)
$$;

-- Whether a gate write keeps each storage policy it names.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.gate_policies_ok}(policies text[], stored_wayins jsonb, cited_wayins jsonb, proposed_wayins jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT (
        ((NOT ('replace_passphrase' = ANY (policies))) OR ${VaultFunctionNames.replace_passphrase_ok}(stored_wayins, cited_wayins, proposed_wayins))
    AND ((NOT ('add_passkey'        = ANY (policies))) OR ${VaultFunctionNames.add_passkey_ok}(stored_wayins, proposed_wayins))
    AND ((NOT ('revoke_passkey'     = ANY (policies))) OR ${VaultFunctionNames.revoke_passkey_ok}(stored_wayins, proposed_wayins))
  )
$$;

-- Each kind's write function: store proposed_record over the row cited_record cites, or over the shell where none is
-- stored, if every check holds of the row it writes over.
${writeFunctionOf({ kind: 'bank', table: 'safebyok_bank_things', body: ['lifetok'], lifetoked: true, policied: false })}
${writeFunctionOf({ kind: 'gate', table: 'safebyok_gate_things', body: ['wayins', 'auth', 'sigs', 'meta'], lifetoked: false, policied: true })}
${writeFunctionOf({ kind: 'box', table: 'safebyok_box_things', body: ['sidecar', 'whisper_sealed'], lifetoked: false, policied: false })}

-- Store a bank's three roots, its bank, main gate and root box, where none of the three is stored. One statement writes
-- all three or none. Two births racing for one bank both pass the check that none is stored; the one that commits second
-- stores no bank, so it stores nothing, and answers what the first stored. The gate and root box are stored only beside a
-- bank stored by the same statement: where another writer stored either first, the statement fails whole.
-- Returns whether it stored them (ok), and the three rows as they now stand, each null for none.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.birth_roots}(bank_record jsonb, gate_record jsonb, root_record jsonb)
RETURNS TABLE (ok boolean, bank jsonb, gate jsonb, root jsonb)
LANGUAGE plpgsql AS $$
DECLARE
  new_bank safebyok_bank_things := jsonb_populate_record(NULL::safebyok_bank_things, bank_record);
  new_gate safebyok_gate_things := jsonb_populate_record(NULL::safebyok_gate_things, gate_record);
  new_root safebyok_box_things  := jsonb_populate_record(NULL::safebyok_box_things,  root_record);
BEGIN
  WITH unborn AS (
    SELECT
    WHERE  ((new_gate.userid, new_gate.banklabel) = (new_bank.userid, new_bank.banklabel))
      AND  ((new_root.userid, new_root.banklabel) = (new_bank.userid, new_bank.banklabel))
      AND  (new_bank.labelpath = 'bank') AND (new_gate.labelpath = 'gate') AND (new_root.labelpath = 'box')
      AND  (new_bank.revseq = 0) AND (new_gate.revseq = 0) AND (new_root.revseq = 0)
      AND  (new_bank.am = 'a') AND (new_gate.am = 'a') AND (new_root.am = 'a')
      AND  (new_bank.born_at = new_bank.written_at) AND (new_gate.born_at = new_gate.written_at) AND (new_root.born_at = new_root.written_at)
      AND  ${VaultFunctionNames.lifeseq_ok}(NULL, NULL, new_bank.lifeseq, new_bank.am)
      AND  ${VaultFunctionNames.lifeseq_ok}(NULL, NULL, new_gate.lifeseq, new_gate.am)
      AND  ${VaultFunctionNames.lifeseq_ok}(NULL, NULL, new_root.lifeseq, new_root.am)
      AND  NOT EXISTS (SELECT FROM safebyok_bank_things AS stored WHERE (stored.userid, stored.banklabel, stored.labelpath) = (new_bank.userid, new_bank.banklabel, 'bank'))
      AND  NOT EXISTS (SELECT FROM safebyok_gate_things AS stored WHERE (stored.userid, stored.banklabel, stored.labelpath) = (new_bank.userid, new_bank.banklabel, 'gate'))
      AND  NOT EXISTS (SELECT FROM safebyok_box_things  AS stored WHERE (stored.userid, stored.banklabel, stored.labelpath) = (new_bank.userid, new_bank.banklabel, 'box'))
  ), banked AS (
    INSERT INTO safebyok_bank_things AS stored SELECT (new_bank).* FROM unborn
    ON CONFLICT DO NOTHING  -- variation approved for birth calls: a birth is an ensure, so a conflict is the present case, which the read below answers
    RETURNING ${VaultFunctionNames.thing_record}(to_jsonb(stored)) AS written
  ), gated AS (
    INSERT INTO safebyok_gate_things AS stored SELECT (new_gate).* FROM banked  -- only once the bank is stored; a conflict here fails the whole statement
    RETURNING ${VaultFunctionNames.thing_record}(to_jsonb(stored)) AS written
  ), rooted AS (
    INSERT INTO safebyok_box_things  AS stored SELECT (new_root).* FROM banked  -- only once the bank is stored; a conflict here fails the whole statement
    RETURNING ${VaultFunctionNames.thing_record}(to_jsonb(stored)) AS written
  )
  SELECT (SELECT written FROM banked), (SELECT written FROM gated), (SELECT written FROM rooted)
  INTO   bank, gate, root;

  IF (bank IS NOT NULL) THEN
    ok := true;
    PERFORM ${VaultFunctionNames.tell_thing}(bank, jsonb_build_object('bank', bank, 'maingate', gate));
    PERFORM ${VaultFunctionNames.tell_thing}(gate, jsonb_build_object('bank', bank, 'maingate', gate));
    PERFORM ${VaultFunctionNames.tell_thing}(root, jsonb_build_object('bank', bank, 'maingate', gate));
    RETURN NEXT;  RETURN;
  END IF;

  ok := false;
  SELECT (
    SELECT ${VaultFunctionNames.thing_record}(to_jsonb(stored)) FROM safebyok_bank_things AS stored
    WHERE  (stored.userid, stored.banklabel, stored.labelpath) = (new_bank.userid, new_bank.banklabel, 'bank')
  ), (
    SELECT ${VaultFunctionNames.thing_record}(to_jsonb(stored)) FROM safebyok_gate_things AS stored
    WHERE  (stored.userid, stored.banklabel, stored.labelpath) = (new_bank.userid, new_bank.banklabel, 'gate')
  ), (
    SELECT ${VaultFunctionNames.thing_record}(to_jsonb(stored)) FROM safebyok_box_things AS stored
    WHERE  (stored.userid, stored.banklabel, stored.labelpath) = (new_bank.userid, new_bank.banklabel, 'box')
  )
  INTO bank, gate, root;
  RETURN NEXT;
END $$;

REVOKE ALL ON FUNCTION ${VaultFunctionNames.thing_record}(jsonb)                   FROM PUBLIC;
REVOKE ALL ON FUNCTION ${VaultFunctionNames.tell_thing}(jsonb, jsonb)              FROM PUBLIC;
REVOKE ALL ON FUNCTION ${VaultFunctionNames.write_bank}(jsonb, jsonb)              FROM PUBLIC;
REVOKE ALL ON FUNCTION ${VaultFunctionNames.write_gate}(jsonb, jsonb, text[])      FROM PUBLIC;
REVOKE ALL ON FUNCTION ${VaultFunctionNames.write_box}(jsonb, jsonb)               FROM PUBLIC;
REVOKE ALL ON FUNCTION ${VaultFunctionNames.birth_roots}(jsonb, jsonb, jsonb)      FROM PUBLIC;
`
