import type { PolicyTag, Thingkind } from 'safebyok/storage'

// == [Names]: TableVersion, SqlRevision, VaultFunctionNames

// TableVersion is safebyok's ThingFormat, spelled out; a test holds them equal, so TableVersion moves whenever ThingFormat
// does. Until 1.0.0, no change to the tables or the functions bumps either name: nothing stored binds backward, and a host
// drops the vault tables, creates them again and runs VaultFunctionsSql again over them, first dropping each function whose
// arguments or result changed, which Postgres will not replace in place. From 1.0.0: bump both when any table's columns,
// CHECKs or stored record format change, since functions built for other tables will not work. Bump SqlRevision when a
// function's behaviour or signature changes over the same tables, and reset it to 0 when TableVersion moves. Each pair names
// a new set of functions; the older sets stay installed beside it.
/** The head of every vault function's name: the tables these functions are built for, and the `fmt` of the Things in them. */
export const TableVersion = 'a010501'
/** The tail of every vault function's name: the revision of these functions over the same tables. */
export const SqlRevision  = 0

/** Every vault function's name without its version, which {@link VaultFunctionNames} adds. */
const VaultFunctionStems = [
  'thing_record', 'world', 'root_box', 'tracked', 'tell_thing', 'base32_of_bigint', 'bigint_of_base32', 'lifeseq_ok', 'lifepath_kept',
  'presence_of', 'revtok_cmp_of', 'write_tags_of', 'written_tags_of', 'birth_tags_of',
  'replace_passphrase_refusal', 'add_passkey_refusal', 'revoke_passkey_refusal', 'policy_verdict_of', 'policies_of', 'policies_met',
  'write_bank', 'write_gate', 'write_box', 'birth_roots',
] as const

// The revision is zero-padded so that the names sort by it.
/** The name of each vault function under {@link TableVersion} and {@link SqlRevision}, such as `safebyok_a010501_r000_write_box`. */
export const VaultFunctionNames = Object.freeze(Object.fromEntries(VaultFunctionStems.map((stem) => (
  [stem, `safebyok_${TableVersion}_r${String(SqlRevision).padStart(3, '0')}_${stem}`]
)))) as Readonly<Record<typeof VaultFunctionStems[number], string>>
// --

// Each kind's write function is the same statement over its own table and body columns; the bank's alone also checks that
// a write over a live bank keeps its lifetok, and the gate's alone the storage policies its write names. Each is written
// out from writeFunctionOf, so the three cannot drift apart. MemoryDatastore's isWritable copies the predicate, clause for
// clause, in TypeScript, and notes/vault-adapter-contract.md states it.

/** What sets one kind's write function apart: its table, the columns of its body, the bank's lifetok check, and the gate's storage policies. */
type WriteFunctionSpec = Readonly<{ kind: Thingkind, table: string, body: readonly string[], lifetoked: boolean, policied: boolean }>

const VoidRevtok = `'00000000-0000-0000-0000-000000000000'`

/** A storage policy's refusal tag as a SQL string literal. */
function sqlTagOf(tag: PolicyTag): string { return `'${tag}'` }

/** The SQL of one kind's write function, from what sets it apart. */
function writeFunctionOf({ kind, table, body, lifetoked, policied }: WriteFunctionSpec): string {
  const columns     = ['fmt', 'am', 'lifepath', 'lifeseq', 'revtok', 'revseq', 'born_at', 'written_at', ...body]
  const policiesArg = policied ? ', policies text[]' : ''
  const policiesVal = policied ? 'policies' : 'ARRAY[]::text[]'
  return `
CREATE OR REPLACE FUNCTION ${VaultFunctionNames[`write_${kind}`]}(proposed_record jsonb, cited_record jsonb, if_absent text, if_present text${policiesArg})
RETURNS TABLE (tags jsonb, actual jsonb, world jsonb, root jsonb)
LANGUAGE plpgsql AS $$
DECLARE
  proposed ${table} := jsonb_populate_record(NULL::${table}, proposed_record);
  cited    ${table} := jsonb_populate_record(NULL::${table}, cited_record);
BEGIN
  IF (cited.revseq = -1) THEN
    -- Over the shell: a birth, where no row is stored.
    INSERT INTO ${table} AS written
    SELECT (proposed).*
    WHERE  (cited.revtok = ${VoidRevtok})
      AND  (if_absent = 'add')                                                       -- the ask's flag allows a write over no row
      AND  (proposed.revseq = 0)
      AND  (proposed.am = 'a')
      AND  (proposed.born_at = proposed.written_at)
      AND  ${VaultFunctionNames.lifeseq_ok}(NULL, NULL, proposed.lifeseq, proposed.am)
      AND  ${VaultFunctionNames.lifepath_kept}(cited.lifepath, proposed.lifepath)
    ON CONFLICT DO NOTHING  -- variation approved for birth calls: a birth is an ensure, so a conflict is the present case, which the read below answers
    RETURNING ${VaultFunctionNames.thing_record}(to_jsonb(written)) INTO actual;
  ELSE
    -- Over the ante row, the row the write is judged against: its WHERE sees the row a concurrent writer left.
    UPDATE ${table} AS ante
    SET    (${columns.join(', ')})
         = (${columns.map((column) => `proposed.${column}`).join(', ')})
    WHERE  ((ante.userid, ante.banklabel, ante.labelpath) = (proposed.userid, proposed.banklabel, proposed.labelpath))
      AND  (ante.revtok   = cited.revtok)
      AND  (ante.am       = cited.am)
      AND  (ante.lifepath = cited.lifepath)
      AND  (ante.revseq   = (proposed.revseq - 1))
      AND  (ante.revtok  <> proposed.revtok)
      AND  (ante.fmt      = proposed.fmt)
      AND  (CASE WHEN (ante.am = 'a') THEN (if_present = 'repl') ELSE (if_absent = 'add') END)  -- the ask's flag allows a write over this row
      AND  ((ante.am = 'a') OR (proposed.am = 'a'))                                  -- no tombstone over a tombstone
      AND  ((ante.am <> proposed.am) OR (ante.born_at = proposed.born_at))            -- a live Thing keeps its born_at
      AND  ((ante.am = 'a') OR (proposed.born_at = proposed.written_at))             -- a rebirth is born when written
      AND  ${VaultFunctionNames.lifeseq_ok}(ante.lifeseq, ante.am, proposed.lifeseq, proposed.am)
      AND  ${VaultFunctionNames.lifepath_kept}(ante.lifepath, proposed.lifepath)${lifetoked ? `
      AND  ((ante.am <> 'a') OR (ante.lifetok = proposed.lifetok))                   -- a write over a live bank keeps its lifetok` : ''}${policied ? `
      AND  ${VaultFunctionNames.policies_met}(${VaultFunctionNames.policies_of}('${kind}', policies, cited_record, proposed_record, to_jsonb(ante)))  -- a live gate meets its storage policies` : ''}
    RETURNING WITH (NEW AS written) ${VaultFunctionNames.thing_record}(to_jsonb(written)) INTO actual;
  END IF;

  IF (actual IS NOT NULL) THEN
    tags  := ${VaultFunctionNames.written_tags_of}('${kind}', proposed_record, cited_record, ${policiesVal});
    -- The world and root box after the write, in statements of their own: a statement does not see what it writes itself.
    -- Another write may land between, so at worst these read newer rows, which a receiver orders by their revisions.
    world := ${VaultFunctionNames.world}(proposed.userid, proposed.banklabel);
    root  := ${VaultFunctionNames.root_box}(proposed.userid, proposed.banklabel);
    PERFORM ${VaultFunctionNames.tell_thing}(actual, world->'bank');
    RETURN NEXT;  RETURN;
  END IF;

  -- Nothing written: the ante row is the actual one, read back as it now stands, and the tags are made of that same row.
  SELECT (SELECT ${VaultFunctionNames.thing_record}(to_jsonb(ante))),
         ${VaultFunctionNames.world}(proposed.userid, proposed.banklabel),
         ${VaultFunctionNames.root_box}(proposed.userid, proposed.banklabel)
  INTO   actual, world, root
  FROM   (SELECT) AS one
  LEFT JOIN ${table} AS ante
    ON   ((ante.userid, ante.banklabel, ante.labelpath) = (proposed.userid, proposed.banklabel, proposed.labelpath));
  tags := ${VaultFunctionNames.write_tags_of}('${kind}', proposed_record, cited_record, actual, ${policiesVal}, false);
  RETURN NEXT;
END $$;
`
}

/** The SQL that creates the functions PostgresVaultDB calls: `await pool.query(VaultFunctionsSql)`, after `VaultTablesSql`. */
export const VaultFunctionsSql = `-- safebyok-postgres: the functions PostgresVaultDB calls to write a Thing. For Postgres 18 or later:
-- they call uuidv7(), and each write function's UPDATE names its written row with RETURNING WITH (NEW AS ...).
-- Run it after the tables, and again with each upgrade of safebyok-postgres. Each name carries the version of the tables
-- the function is built for and its own revision, so an upgrade adds its functions beside the old ones, which stay;
-- running the same version again replaces its own.
--
-- Do not change the locking semantics: no transaction block (BEGIN ... COMMIT), no row lock (SELECT ... FOR UPDATE).
-- Discuss first.
--
-- PostgresVaultDB hands each write to its function unjudged: whether it writes is this SQL's alone, and the vaultDB finds
-- the act from the tags the function returns, and checks the two agree (notes/vault-adapter-contract.md). The checks are
-- here because this is a boundary that counts: behind GraphQL, Postgres or Convex the adapter's TypeScript runs on the
-- device, beside every script in the page, and only what runs here holds against one that calls Postgres directly. And
-- only the statement that writes a row sees the row it writes over: the checks sit in its WHERE, so when it waits on
-- another writer of the row, Postgres checks them again against the row that writer left.
--
-- Each write function stores its record in one statement, which waits only on a writer of the same row. It does not
-- throw when it stores nothing. It returns one row: the write's tags (made of the ante row, the row the write was judged
-- against, as ManifestTags.writeTagsOf makes them), the actual row (the row written, or where it stored nothing, the row
-- as it now stands, which the tags are then made of), the bank's world (the bank and main gate rows, each null for none)
-- and its root box row (null for none). When it stored the record, the world and root box are read just after, in the
-- same transaction; when it stored nothing, in the statement that reads the row back.
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
-- about one row alone is a CHECK on the table; a function holds only what compares the proposed record with the ante
-- row or the cited one.

-- Whether proposed_lifeseq follows ante_lifeseq: one past the ante when am flips, the same when not. A null ante is the
-- shell: life -1, gone. So a birth is life 0. The parity of each lifeseq is a CHECK on the row, not this.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.lifeseq_ok}(ante_lifeseq text, ante_am text, proposed_lifeseq text, proposed_am text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT (
    proposed_lifeseq = ${VaultFunctionNames.base32_of_bigint}(
      (COALESCE(${VaultFunctionNames.bigint_of_base32}(ante_lifeseq), -1))
      + (CASE WHEN (COALESCE(ante_am, 'x') <> proposed_am) THEN 1 ELSE 0 END)
    )
  )
$$;

-- Whether proposed_lifepath keeps the lives above its own in ante_lifepath: the lifeseqs of the Things above it.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.lifepath_kept}(ante_lifepath text, proposed_lifepath text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT (regexp_replace(ante_lifepath, '[^/]*$', '') = regexp_replace(proposed_lifepath, '[^/]*$', ''))
$$;

-- The tags of a write, each a copy of its TypeScript in safebyok's ManifestTags, comparison for comparison (the function
-- each copies is named beside it). Each reads the raw row as JSON, null for none, as ManifestTags reads it, so the tags of
-- a row agree whatever is stored in it: AdapterVaultDB makes them again of an unwritten write's actual row, and refuses
-- tags that disagree.

-- The liveness of the raw row ante: 'void' for none, 'live' where its am is 'a', else 'gone'. ManifestTags.presenceOf.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.presence_of}(ante jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN (ante IS NULL)          THEN 'void'
    WHEN ((ante->>'am') = 'a')   THEN 'live'
    ELSE                              'gone'
  END
$$;

-- The raw row ante's revtok against the cited and proposed revtoks: 'birth' where there is no row and the shell is cited,
-- '=next' where the row has the proposed revtok, 'eq' where it has the cited one, else 'neq'. ManifestTags' revtokCmpOf.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.revtok_cmp_of}(cited_revtok text, proposed_revtok text, ante jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN (ante IS NULL)                         THEN (CASE WHEN (cited_revtok = ${VoidRevtok}) THEN 'birth' ELSE 'neq' END)
    WHEN ((ante->>'revtok') = proposed_revtok)  THEN '=next'
    WHEN ((ante->>'revtok') = cited_revtok)     THEN 'eq'
    ELSE                                             'neq'
  END
$$;

-- The storage policies, one function each, as notes/storage-policies.md lists them, less big's registered_at check: the
-- write function checks born_at for every live-over-live write. Each is a copy of safebyok's GatePolicies, check for
-- check and tag for tag, and returns the tag of its refusal, or null where it allows the write. A gate's passkey0 is
-- an object, or JSON null for none.

-- Why a write that names replace_passphrase refuses: it must replace the passphrase wayin the gating proved against, and nothing else.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.replace_passphrase_refusal}(ante_wayins jsonb, cited_wayins jsonb, proposed_wayins jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN (NOT COALESCE(((ante_wayins->'main') = (cited_wayins->'main')), false))           THEN ${sqlTagOf('ProvedWayinMoved')}
    WHEN (NOT COALESCE(((ante_wayins - 'main') = (proposed_wayins - 'main')), false))      THEN ${sqlTagOf('OtherWayinMoved')}
  END
$$;

-- Why a write that names add_passkey refuses: it must add a passkey wayin to a gate that has none, and change nothing else.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.add_passkey_refusal}(ante_wayins jsonb, proposed_wayins jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN (jsonb_typeof(ante_wayins->'passkey0') IS DISTINCT FROM 'null')                   THEN ${sqlTagOf('PasskeyStored')}
    WHEN (jsonb_typeof(proposed_wayins->'passkey0') IS DISTINCT FROM 'object')             THEN ${sqlTagOf('PasskeyNotAdded')}
    WHEN (NOT COALESCE(((ante_wayins - 'passkey0') = (proposed_wayins - 'passkey0')), false)) THEN ${sqlTagOf('OtherWayinMoved')}
  END
$$;

-- Why a write that names revoke_passkey refuses: it must remove the gate's passkey wayin, and change nothing else.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.revoke_passkey_refusal}(ante_wayins jsonb, proposed_wayins jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN (jsonb_typeof(ante_wayins->'passkey0') IS DISTINCT FROM 'object')                 THEN ${sqlTagOf('NoPasskeyStored')}
    WHEN (jsonb_typeof(proposed_wayins->'passkey0') IS DISTINCT FROM 'null')               THEN ${sqlTagOf('PasskeyNotRevoked')}
    WHEN (NOT COALESCE(((ante_wayins - 'passkey0') = (proposed_wayins - 'passkey0')), false)) THEN ${sqlTagOf('OtherWayinMoved')}
  END
$$;

-- The verdict of policy on a write of proposed citing cited over the raw row ante: met wherever that is no live gate,
-- since a policy judges only a live gate's replacement. ManifestTags' policyVerdictOf.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.policy_verdict_of}(policy text, modelkind text, cited jsonb, proposed jsonb, ante jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN (refusaltag IS NULL) THEN jsonb_build_object('ok', true) ELSE jsonb_build_object('ok', false, 'refusaltag', refusaltag) END
  FROM (SELECT CASE
    WHEN ((modelkind <> 'gate') OR (${VaultFunctionNames.presence_of}(ante) <> 'live')) THEN NULL
    WHEN (policy = 'replace_passphrase') THEN ${VaultFunctionNames.replace_passphrase_refusal}(ante->'wayins', cited->'wayins', proposed->'wayins')
    WHEN (policy = 'add_passkey')        THEN ${VaultFunctionNames.add_passkey_refusal}(ante->'wayins', proposed->'wayins')
    WHEN (policy = 'revoke_passkey')     THEN ${VaultFunctionNames.revoke_passkey_refusal}(ante->'wayins', proposed->'wayins')
  END AS refusaltag) AS judged
$$;

-- A verdict for each storage policy in policies, keyed by the policy. ManifestTags.policiesOf.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.policies_of}(modelkind text, policies text[], cited jsonb, proposed jsonb, ante jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT COALESCE(jsonb_object_agg(policy, ${VaultFunctionNames.policy_verdict_of}(policy, modelkind, cited, proposed, ante)), '{}'::jsonb)
  FROM   unnest(policies) AS policy
$$;

-- Whether no verdict in verdicts refuses.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.policies_met}(verdicts jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT NOT EXISTS (SELECT FROM jsonb_each(verdicts) AS verdict WHERE ((verdict.value->'ok') = 'false'::jsonb))
$$;

-- The tags of a write of proposed over the raw row ante, citing cited, beside whether it wrote. ManifestTags.writeTagsOf.
-- modelkind is the write's, and policies the storage policies it names.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.write_tags_of}(modelkind text, proposed jsonb, cited jsonb, ante jsonb, policies text[], written boolean) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT jsonb_build_object(
    'presence',    ${VaultFunctionNames.presence_of}(ante),
    'revtok_cmp',  ${VaultFunctionNames.revtok_cmp_of}(cited->>'revtok', proposed->>'revtok', ante),
    'revseq_cmp',  CASE                                                                     -- revseqCmpOf
                     WHEN ((cited->'revseq') = '-1'::jsonb)          THEN 'birth'
                     WHEN ((ante->'revseq') = (cited->'revseq'))     THEN 'eq'
                     WHEN ((jsonb_typeof(ante->'revseq') = 'number') AND ((cited->>'revseq')::numeric < (ante->>'revseq')::numeric)) THEN 'stale'
                     ELSE                                                 'ahead'
                   END,
    'lifepath_eq', ((ante IS NULL) OR COALESCE(((ante->'lifepath') = (cited->'lifepath')), false)),
    'born_at_cmp', CASE                                                                     -- bornAtCmpOf
                     WHEN (((proposed->>'am') <> 'a') OR (${VaultFunctionNames.presence_of}(ante) <> 'live')) THEN 'moot'
                     WHEN ((ante->'born_at') = (proposed->'born_at'))                                         THEN 'same'
                     ELSE                                                                                          'changed'
                   END,
    'lifetok_cmp', CASE                                                                     -- lifetokCmpOf
                     WHEN ((modelkind <> 'bank') OR (${VaultFunctionNames.presence_of}(ante) <> 'live'))      THEN 'moot'
                     WHEN ((ante->'lifetok') = (proposed->'lifetok'))                                         THEN 'same'
                     ELSE                                                                                          'changed'
                   END,
    'policies',    ${VaultFunctionNames.policies_of}(modelkind, policies, cited, proposed, ante),
    'written',     written
  )
$$;

-- The tags of a write that wrote, of proposed citing cited. Its WHERE pinned the ante row's revtok, am and lifepath to the
-- cited ones, and its revseq to the proposed one's less one, which past the vaultDB's checks of the ask is the cited one's;
-- or, citing the shell, found no row. It held the ante row's born_at and lifetok to the proposed ones, and met each storage
-- policy. So each tag is the one ${VaultFunctionNames.write_tags_of} would make of that ante row: ManifestTags.writtenTagsOf.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.written_tags_of}(modelkind text, proposed jsonb, cited jsonb, policies text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT jsonb_build_object(
    'presence',    CASE WHEN ((cited->'revseq') = '-1'::jsonb) THEN 'void'  WHEN ((cited->>'am') = 'a') THEN 'live' ELSE 'gone' END,
    'revtok_cmp',  CASE WHEN ((cited->'revseq') = '-1'::jsonb) THEN 'birth' ELSE 'eq' END,
    'revseq_cmp',  CASE WHEN ((cited->'revseq') = '-1'::jsonb) THEN 'birth' ELSE 'eq' END,
    'lifepath_eq', true,
    'born_at_cmp', CASE WHEN (((proposed->>'am') = 'a') AND ((cited->>'am') = 'a')) THEN 'same' ELSE 'moot' END,
    'lifetok_cmp', CASE WHEN ((modelkind = 'bank') AND ((cited->>'am') = 'a'))      THEN 'same' ELSE 'moot' END,
    'policies',    COALESCE((SELECT jsonb_object_agg(policy, jsonb_build_object('ok', true)) FROM unnest(policies) AS policy), '{}'::jsonb),
    'written',     true
  )
$$;

-- The tags of a birth by bank_record, gate_record and root_record over the raw roots ante_bank, ante_gate and ante_root,
-- beside whether it wrote. ManifestTags.birthTagsOf: a birth's puts cite the shell, so each root's tags are its
-- presence and its revtok_cmp alone.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.birth_tags_of}(bank_record jsonb, gate_record jsonb, root_record jsonb, ante_bank jsonb, ante_gate jsonb, ante_root jsonb, written boolean) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT jsonb_build_object(
    'bank',    jsonb_build_object('presence', ${VaultFunctionNames.presence_of}(ante_bank), 'revtok_cmp', ${VaultFunctionNames.revtok_cmp_of}(${VoidRevtok}, bank_record->>'revtok', ante_bank)),
    'gate',    jsonb_build_object('presence', ${VaultFunctionNames.presence_of}(ante_gate), 'revtok_cmp', ${VaultFunctionNames.revtok_cmp_of}(${VoidRevtok}, gate_record->>'revtok', ante_gate)),
    'root',    jsonb_build_object('presence', ${VaultFunctionNames.presence_of}(ante_root), 'revtok_cmp', ${VaultFunctionNames.revtok_cmp_of}(${VoidRevtok}, root_record->>'revtok', ante_root)),
    'written', written
  )
$$;

-- Each kind's write function: store proposed_record over the row cited_record cites, or over the shell where none is
-- stored, where the ask's flags if_absent and if_present allow it and every check holds of the ante row.
${writeFunctionOf({ kind: 'bank', table: 'safebyok_bank_things', body: ['lifetok'], lifetoked: true, policied: false })}
${writeFunctionOf({ kind: 'gate', table: 'safebyok_gate_things', body: ['wayins', 'auth', 'sigs', 'meta'], lifetoked: false, policied: true })}
${writeFunctionOf({ kind: 'box', table: 'safebyok_box_things', body: ['sidecar', 'whisper_sealed'], lifetoked: false, policied: false })}

-- Store a bank's three roots, its bank, main gate and root box, where none of the three is stored. One statement writes
-- all three or none. Two births racing for one bank both pass the check that none is stored; the one that commits second
-- stores no bank, so it stores nothing, and answers what the first stored. The gate and root box are stored only beside a
-- bank stored by the same statement: where another writer stored either first, the statement fails whole.
-- Returns the birth's tags, and the three rows as they now stand, each null for none. Written, the three ante roots were
-- none; unwritten, the three are read back, and the tags made of those same rows.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.birth_roots}(bank_record jsonb, gate_record jsonb, root_record jsonb)
RETURNS TABLE (tags jsonb, bank jsonb, gate jsonb, root jsonb)
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
      AND  NOT EXISTS (SELECT FROM safebyok_bank_things AS ante WHERE (ante.userid, ante.banklabel, ante.labelpath) = (new_bank.userid, new_bank.banklabel, 'bank'))
      AND  NOT EXISTS (SELECT FROM safebyok_gate_things AS ante WHERE (ante.userid, ante.banklabel, ante.labelpath) = (new_bank.userid, new_bank.banklabel, 'gate'))
      AND  NOT EXISTS (SELECT FROM safebyok_box_things  AS ante WHERE (ante.userid, ante.banklabel, ante.labelpath) = (new_bank.userid, new_bank.banklabel, 'box'))
  ), banked AS (
    INSERT INTO safebyok_bank_things AS written SELECT (new_bank).* FROM unborn
    ON CONFLICT DO NOTHING  -- variation approved for birth calls: a birth is an ensure, so a conflict is the present case, which the read below answers
    RETURNING ${VaultFunctionNames.thing_record}(to_jsonb(written)) AS written
  ), gated AS (
    INSERT INTO safebyok_gate_things AS written SELECT (new_gate).* FROM banked  -- only once the bank is stored; a conflict here fails the whole statement
    RETURNING ${VaultFunctionNames.thing_record}(to_jsonb(written)) AS written
  ), rooted AS (
    INSERT INTO safebyok_box_things  AS written SELECT (new_root).* FROM banked  -- only once the bank is stored; a conflict here fails the whole statement
    RETURNING ${VaultFunctionNames.thing_record}(to_jsonb(written)) AS written
  )
  SELECT (SELECT written FROM banked), (SELECT written FROM gated), (SELECT written FROM rooted)
  INTO   bank, gate, root;

  IF (bank IS NOT NULL) THEN
    tags := ${VaultFunctionNames.birth_tags_of}(bank_record, gate_record, root_record, NULL, NULL, NULL, true);
    PERFORM ${VaultFunctionNames.tell_thing}(bank, jsonb_build_object('bank', bank, 'maingate', gate));
    PERFORM ${VaultFunctionNames.tell_thing}(gate, jsonb_build_object('bank', bank, 'maingate', gate));
    PERFORM ${VaultFunctionNames.tell_thing}(root, jsonb_build_object('bank', bank, 'maingate', gate));
    RETURN NEXT;  RETURN;
  END IF;

  SELECT (
    SELECT ${VaultFunctionNames.thing_record}(to_jsonb(ante)) FROM safebyok_bank_things AS ante
    WHERE  (ante.userid, ante.banklabel, ante.labelpath) = (new_bank.userid, new_bank.banklabel, 'bank')
  ), (
    SELECT ${VaultFunctionNames.thing_record}(to_jsonb(ante)) FROM safebyok_gate_things AS ante
    WHERE  (ante.userid, ante.banklabel, ante.labelpath) = (new_bank.userid, new_bank.banklabel, 'gate')
  ), (
    SELECT ${VaultFunctionNames.thing_record}(to_jsonb(ante)) FROM safebyok_box_things AS ante
    WHERE  (ante.userid, ante.banklabel, ante.labelpath) = (new_bank.userid, new_bank.banklabel, 'box')
  )
  INTO bank, gate, root;
  tags := ${VaultFunctionNames.birth_tags_of}(bank_record, gate_record, root_record, bank, gate, root, false);
  RETURN NEXT;
END $$;

REVOKE ALL ON FUNCTION ${VaultFunctionNames.thing_record}(jsonb)                          FROM PUBLIC;
REVOKE ALL ON FUNCTION ${VaultFunctionNames.tell_thing}(jsonb, jsonb)                     FROM PUBLIC;
REVOKE ALL ON FUNCTION ${VaultFunctionNames.write_bank}(jsonb, jsonb, text, text)         FROM PUBLIC;
REVOKE ALL ON FUNCTION ${VaultFunctionNames.write_gate}(jsonb, jsonb, text, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION ${VaultFunctionNames.write_box}(jsonb, jsonb, text, text)          FROM PUBLIC;
REVOKE ALL ON FUNCTION ${VaultFunctionNames.birth_roots}(jsonb, jsonb, jsonb)             FROM PUBLIC;
`
