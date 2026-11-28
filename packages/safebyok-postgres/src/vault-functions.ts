import { type PolicyTag, type Thingkind, VoidBanktok } from 'safebyok/storage'

// == [Names]: TableVersion, SqlRevision, VaultFunctionNames

// TableVersion is safebyok's ThingFormat, spelled out; a test holds them equal, so TableVersion moves whenever ThingFormat
// does. Until 1.0.0, no change to the tables or the functions bumps either name: nothing stored binds backward, and a host
// drops the vault tables, creates them again and runs VaultFunctionsSql again over them, first dropping each function whose
// arguments or result changed, which Postgres will not replace in place. From 1.0.0: bump both when any table's columns,
// CHECKs or stored record format change, since functions built for other tables will not work. Bump SqlRevision when a
// function's behaviour or signature changes over the same tables, and reset it to 0 when TableVersion moves. Each pair names
// a new set of functions; the older sets stay installed beside it.
/** The head of every vault function's name: the tables these functions are built for, and the `fmt` of the Things in them. */
export const TableVersion = 'a010502'
/** The tail of every vault function's name: the revision of these functions over the same tables. */
export const SqlRevision  = 0

/** Every vault function's name without its version, which {@link VaultFunctionNames} adds. */
const VaultFunctionStems = [
  'thing_record', 'bank_roots', 'banktok_of', 'tracked', 'tell_thing', 'base32_of_bigint', 'bigint_of_base32', 'lifeseq_ok', 'lifepath_kept',
  'presence_of', 'revtok_cmp_of', 'write_tags_of', 'written_tags_of', 'birth_tags_of',
  'replace_passphrase_refusal', 'add_passkey_refusal', 'revoke_passkey_refusal', 'policy_verdict_of', 'policies_of', 'policies_met',
  'write_gate', 'write_box', 'birth_roots',
] as const

// The revision is zero-padded so that the names sort by it.
/** The name of each vault function under {@link TableVersion} and {@link SqlRevision}, such as `safebyok_a010502_r000_write_box`. */
export const VaultFunctionNames = Object.freeze(Object.fromEntries(VaultFunctionStems.map((stem) => (
  [stem, `safebyok_${TableVersion}_r${String(SqlRevision).padStart(3, '0')}_${stem}`]
)))) as Readonly<Record<typeof VaultFunctionStems[number], string>>
// --

// Each kind's write function is the same statement over its own table and body columns; the gate's alone also checks that
// a write over a live gate keeps its banktok, and the storage policies its write names. Each is written out from
// writeFunctionOf, and its clauses from shellClausesOf and priorClausesOf, which birth_roots judges each of its two puts by,
// so none of them can drift apart. MemoryDatastore's isWritable copies the predicate, clause for clause, in TypeScript, and
// notes/vault-adapter-contract.md states it.

/** What sets one kind's write function apart: its table and the columns of its body. A gate's also has its banktok check and storage policies. */
type WriteFunctionSpec = Readonly<{ kind: Thingkind, table: string, body: readonly string[] }>

/** The SQL names a write's clauses read: its kind, the proposed and cited rows and their JSON, the ask's flags, and the storage policies it names. */
type WriteNames = Readonly<{ kind: Thingkind, proposed: string, cited: string, proposedJson: string, citedJson: string, ifAbsent: string, ifPresent: string, policies: string }>

const VoidRevtok = `'00000000-0000-0000-0000-000000000000'`

/** A storage policy's refusal tag as a SQL string literal. */
function sqlTagOf(tag: PolicyTag): string { return `'${tag}'` }

/** The clauses, joined by AND, of a WHERE. */
function clausesSqlOf(clauses: readonly string[]): string { return clauses.join('\n      AND  ') }

/** The write predicate's clauses over the shell, where there is no prior row: a birth. */
function shellClausesOf({ proposed, cited, ifAbsent }: WriteNames): string[] {
  return [
    `(${cited}.revtok = ${VoidRevtok})`,
    `(${ifAbsent} = 'add')                                                       -- the ask's flag allows a write over no row`,
    `(${proposed}.revseq = 0)`,
    `(${proposed}.am = 'a')`,
    `(${proposed}.born_at = ${proposed}.written_at)`,
    `${VaultFunctionNames.lifeseq_ok}(NULL, NULL, ${proposed}.lifeseq, ${proposed}.am)`,
    `${VaultFunctionNames.lifepath_kept}(${cited}.lifepath, ${proposed}.lifepath)`,
  ]
}

/** The write predicate's clauses over the prior row `prior`, the row the write is judged against. */
function priorClausesOf({ kind, proposed, cited, proposedJson, citedJson, ifAbsent, ifPresent, policies }: WriteNames, prior: string): string[] {
  const gateClauses = [
    `((${prior}.am <> 'a') OR (${prior}.banktok = ${proposed}.banktok))                 -- a write over a live gate keeps its banktok`,
    `${VaultFunctionNames.policies_met}(${VaultFunctionNames.policies_of}('${kind}', ${policies}, ${citedJson}, ${proposedJson}, to_jsonb(${prior}))) -- a live gate meets its storage policies`,
  ]
  return [
    `((${prior}.userid, ${prior}.banklabel, ${prior}.labelpath) = (${proposed}.userid, ${proposed}.banklabel, ${proposed}.labelpath))`,
    `(${prior}.revtok   = ${cited}.revtok)`,
    `(${prior}.am       = ${cited}.am)`,
    `(${prior}.lifepath = ${cited}.lifepath)`,
    `(${prior}.revseq   = (${proposed}.revseq - 1))`,
    `(${prior}.revtok  <> ${proposed}.revtok)`,
    `(${prior}.fmt      = ${proposed}.fmt)`,
    `(CASE WHEN (${prior}.am = 'a') THEN (${ifPresent} = 'repl') ELSE (${ifAbsent} = 'add') END) -- the ask's flag allows a write over this row`,
    `((${prior}.am = 'a') OR (${proposed}.am = 'a'))                                 -- no tombstone over a tombstone`,
    `((${prior}.am <> ${proposed}.am) OR (${prior}.born_at = ${proposed}.born_at))          -- a live Thing keeps its born_at`,
    `((${prior}.am = 'a') OR (${proposed}.born_at = ${proposed}.written_at))            -- a rebirth is born when written`,
    `${VaultFunctionNames.lifeseq_ok}(${prior}.lifeseq, ${prior}.am, ${proposed}.lifeseq, ${proposed}.am)`,
    `${VaultFunctionNames.lifepath_kept}(${prior}.lifepath, ${proposed}.lifepath)`,
    ...((kind === 'gate') ? gateClauses : []),
  ]
}

/** The columns a write sets over its prior row, of a kind whose body columns are `body`. */
function setColumnsOf(body: readonly string[]): string[] { return ['banktok', 'fmt', 'am', 'lifepath', 'lifeseq', 'revtok', 'revseq', 'born_at', 'written_at', ...body] }

/** The SQL of one kind's write function, from what sets it apart. */
function writeFunctionOf({ kind, table, body }: WriteFunctionSpec): string {
  const isGate      = (kind === 'gate')
  const columns     = setColumnsOf(body)
  const policiesArg = isGate ? ', policies text[]' : ''
  const policiesVal = isGate ? 'policies' : 'ARRAY[]::text[]'
  const names       = { kind, proposed: 'proposed', cited: 'cited', proposedJson: 'proposed_record', citedJson: 'cited_record', ifAbsent: 'if_absent', ifPresent: 'if_present', policies: policiesVal }
  return `
CREATE OR REPLACE FUNCTION ${VaultFunctionNames[`write_${kind}`]}(proposed_record jsonb, cited_record jsonb, if_absent text, if_present text${policiesArg})
RETURNS TABLE (tags jsonb, actual jsonb, roots jsonb)
LANGUAGE plpgsql AS $$
DECLARE
  proposed ${table} := jsonb_populate_record(NULL::${table}, proposed_record);
  cited    ${table} := jsonb_populate_record(NULL::${table}, cited_record);
BEGIN
  IF (cited.revseq = -1) THEN
    -- Over the shell: a birth, where there is no prior row.
    INSERT INTO ${table} AS written
    SELECT (proposed).*
    WHERE  ${clausesSqlOf(shellClausesOf(names))}
    ON CONFLICT DO NOTHING  -- variation approved for birth calls: a birth is an ensure, so a conflict is the present case, which the read below answers
    RETURNING ${VaultFunctionNames.thing_record}(to_jsonb(written)) INTO actual;
  ELSE
    -- Over the prior row, the row the write is judged against: its WHERE sees the row a concurrent writer left.
    UPDATE ${table} AS prior
    SET    (${columns.join(', ')})
         = (${columns.map((column) => `proposed.${column}`).join(', ')})
    WHERE  ${clausesSqlOf(priorClausesOf(names, 'prior'))}
    RETURNING WITH (NEW AS written) ${VaultFunctionNames.thing_record}(to_jsonb(written)) INTO actual;
  END IF;

  IF (actual IS NOT NULL) THEN
    tags  := ${VaultFunctionNames.written_tags_of}('${kind}', proposed_record, cited_record, ${policiesVal});
    -- The roots after the write, in a statement of its own: a statement does not see what it writes itself.
    -- Another write may land between, so at worst it reads newer rows, which a receiver orders by their revisions.
    roots := ${VaultFunctionNames.bank_roots}(proposed.userid, proposed.banklabel);
    PERFORM ${VaultFunctionNames.tell_thing}(actual, roots->'gate');
    RETURN NEXT;  RETURN;
  END IF;

  -- Nothing written: the prior row is the actual one, read back as it now stands, and the tags are made of that same row.
  SELECT (SELECT ${VaultFunctionNames.thing_record}(to_jsonb(prior))),
         ${VaultFunctionNames.bank_roots}(proposed.userid, proposed.banklabel)
  INTO   actual, roots
  FROM   (SELECT) AS one
  LEFT JOIN ${table} AS prior
    ON   ((prior.userid, prior.banklabel, prior.labelpath) = (proposed.userid, proposed.banklabel, proposed.labelpath));
  tags := ${VaultFunctionNames.write_tags_of}('${kind}', proposed_record, cited_record, actual, ${policiesVal}, false);
  RETURN NEXT;
END $$;
`
}

/** The body columns of each kind's table, beside the Thing's. */
const GateBody = ['wayins', 'auth', 'sigs', 'meta'] as const
const BoxBody  = ['sidecar', 'whisper_sealed'] as const
const GateColumns = setColumnsOf(GateBody)
const BoxColumns  = setColumnsOf(BoxBody)

// A birth's puts' flags, as birthPutsOf sets them, and no storage policy.
/** The SQL names birth_roots judges its gate's put by. */
const BirthGateNames = { kind: 'gate', proposed: 'new_gate', cited: 'gate_cited', proposedJson: 'gate_record', citedJson: 'gate_cited_record', ifAbsent: `'add'`, ifPresent: `'get'`, policies: 'ARRAY[]::text[]' } as const
/** The SQL names birth_roots judges its root box's put by. */
const BirthRootNames = { kind: 'box', proposed: 'new_root', cited: 'root_cited', proposedJson: 'root_record', citedJson: 'root_cited_record', ifAbsent: `'add'`, ifPresent: `'fail'`, policies: 'ARRAY[]::text[]' } as const

/** The SQL that creates the functions PostgresVaultDB calls: `await pool.query(VaultFunctionsSql)`, after `VaultTablesSql`. */
export const VaultFunctionsSql = `-- safebyok-postgres: the functions PostgresVaultDB calls to write a Thing. For Postgres 18 or later:
-- they call uuidv7(), and each write function's UPDATE names its written row with RETURNING WITH (NEW AS ...).
-- Run it after the tables, and again with each upgrade of safebyok-postgres. Each name carries the version of the tables
-- the function is built for and its own revision; running the same version again replaces its own.
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
-- Each write function writes its record in one statement, which waits only on a writer of the same row. It does not
-- throw when it writes nothing. It returns one row: the write's tags (made of the prior row, the row the write was judged
-- against, as ManifestTags.writeTagsOf makes them), the actual row (the row written, or where it wrote nothing, the row
-- as it now stands, which the tags are then made of), and the bank's roots (its gate and root box rows, each null for
-- none). When it wrote the record, the roots are read just after, in the same transaction; when it wrote nothing, in the
-- statement that reads the row back.
--
-- A function that writes a record notifies the user's channel in the same transaction (see ${VaultFunctionNames.tell_thing}).
--
-- The functions run with the caller's privileges. Only their owner, the role that ran this file, may call the ones that
-- write a Thing or notify a watch, or thing_record.

-- Convert a row to the Thing it was stored from, dropping the columns that are null. Returns null for no row.
-- Only top-level nulls are dropped: a null inside wayins is part of the Thing.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.thing_record}(stored jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_object_agg(col.key, col.value) FROM jsonb_each(stored) AS col WHERE col.value <> 'null'::jsonb
$$;

-- A bank's two roots: its gate row under gate, stored at its banklabel, and its root box row under root,
-- each null for none. STABLE, so it reads in the calling statement's snapshot.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.bank_roots}(of_userid text, of_banklabel text) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'gate', (
      SELECT ${VaultFunctionNames.thing_record}(to_jsonb(gate)) FROM safebyok_gate_things AS gate
      WHERE  (gate.userid, gate.banklabel, gate.labelpath) = (of_userid, of_banklabel, of_banklabel)
    ),
    'root', (
      SELECT ${VaultFunctionNames.thing_record}(to_jsonb(root)) FROM safebyok_box_things AS root
      WHERE  (root.userid, root.banklabel, root.labelpath) = (of_userid, of_banklabel, 'box')
    )
  )
$$;

-- The banktok of a bank by its raw gate row gate: the gate's banktok, the void banktok where there is no gate row, and
-- JSON null where the row has no banktok. ManifestTags.banktokOf.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.banktok_of}(gate jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN ((gate IS NULL) OR (gate = 'null'::jsonb)) THEN to_jsonb('${VoidBanktok}'::text)
    ELSE                                                 COALESCE(gate->'banktok', 'null'::jsonb)
  END
$$;

-- How the gate and root box in roots compare with track, the revseq and lifepath an ask tracks of each: under gate and
-- root, the JSON string 'same' where the row has both, else the row. ManifestTags.trackedOf.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.tracked}(roots jsonb, track jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT jsonb_build_object(
    'gate', CASE WHEN ((roots->'gate'->'revseq', roots->'gate'->'lifepath') = (track->'gate'->'revseq', track->'gate'->'lifepath'))
                 THEN '"same"'::jsonb ELSE roots->'gate' END,
    'root', CASE WHEN ((roots->'root'->'revseq', roots->'root'->'lifepath') = (track->'root'->'revseq', track->'root'->'lifepath'))
                 THEN '"same"'::jsonb ELSE roots->'root' END
  )
$$;

-- Notify the user's channel, safebyok_things_<userid>, of a Thing just written. gate is the raw row of the Thing's bank's
-- gate, or JSON null for none.
-- The notice is a JSON object with the Thing's scope and modelkind under at, when Postgres read it under read_tc (a UUID version 7),
-- the Thing under thing, and under bank the gate's banktok (as banktok_of reads it), labelpath, lifepath, revseq and revtok,
-- each JSON null where there is no gate; never its wayins.
-- Postgres refuses a notice of 8000 bytes or more. A notice that is too large drops the Thing and the bank's part.
-- A listener that gets only a scope fetches the Thing and the banktok itself.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.tell_thing}(thing jsonb, gate jsonb) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  at      jsonb := jsonb_build_object('userid', thing->'userid', 'banklabel', thing->'banklabel', 'modelkind', thing->'modelkind', 'labelpath', thing->'labelpath');
  bank    jsonb := jsonb_build_object('banktok', ${VaultFunctionNames.banktok_of}(gate), 'labelpath', gate->'labelpath', 'lifepath', gate->'lifepath', 'revseq', gate->'revseq', 'revtok', gate->'revtok');
  read_tc text  := uuidv7()::text;
  notice  text  := jsonb_build_object('at', at, 'read_tc', read_tc, 'thing', thing, 'bank', bank)::text;
BEGIN
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
-- about one row alone is a CHECK on the table; a function holds only what compares the proposed record with the prior
-- row or the cited one.

-- Whether proposed_lifeseq follows prior_lifeseq: one past the prior when am flips, the same when not. A null prior is the
-- shell: life -1, gone. So a birth is life 0. The parity of each lifeseq is a CHECK on the row, not this.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.lifeseq_ok}(prior_lifeseq text, prior_am text, proposed_lifeseq text, proposed_am text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT (
    proposed_lifeseq = ${VaultFunctionNames.base32_of_bigint}(
      (COALESCE(${VaultFunctionNames.bigint_of_base32}(prior_lifeseq), -1))
      + (CASE WHEN (COALESCE(prior_am, 'x') <> proposed_am) THEN 1 ELSE 0 END)
    )
  )
$$;

-- Whether proposed_lifepath keeps the lives above its own in prior_lifepath: the lifeseqs of the Things above it.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.lifepath_kept}(prior_lifepath text, proposed_lifepath text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT (regexp_replace(prior_lifepath, '[^/]*$', '') = regexp_replace(proposed_lifepath, '[^/]*$', ''))
$$;

-- The tags of a write, each a copy of its TypeScript in safebyok's ManifestTags, comparison for comparison (the function
-- each copies is named beside it). Each reads the raw row as JSON, null for none, as ManifestTags reads it, so the tags of
-- a row agree whatever is stored in it: AdapterVaultDB makes them again of an unwritten write's actual row, and refuses
-- tags that disagree.

-- The liveness of the raw row prior: 'void' for none, 'live' where its am is 'a', else 'gone'. ManifestTags.presenceOf.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.presence_of}(prior jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN (prior IS NULL)         THEN 'void'
    WHEN ((prior->>'am') = 'a')  THEN 'live'
    ELSE                              'gone'
  END
$$;

-- The raw row prior's revtok against the cited and proposed revtoks: 'birth' where there is no row and the shell is cited,
-- '=next' where the row has the proposed revtok, 'eq' where it has the cited one, else 'neq'. ManifestTags' revtokCmpOf.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.revtok_cmp_of}(cited_revtok text, proposed_revtok text, prior jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN (prior IS NULL)                        THEN (CASE WHEN (cited_revtok = ${VoidRevtok}) THEN 'birth' ELSE 'neq' END)
    WHEN ((prior->>'revtok') = proposed_revtok) THEN '=next'
    WHEN ((prior->>'revtok') = cited_revtok)    THEN 'eq'
    ELSE                                             'neq'
  END
$$;

-- The storage policies, one function each, as notes/storage-policies.md lists them. Each is a copy of safebyok's
-- GatePolicies, check for check and tag for tag, and returns the tag of its refusal, or null where it allows the write.
-- A gate's passkey0 is an object, or JSON null for none.

-- Why a write that names replace_passphrase refuses: it must replace the passphrase wayin the gating proved against, and nothing else.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.replace_passphrase_refusal}(prior_wayins jsonb, cited_wayins jsonb, proposed_wayins jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN (NOT COALESCE(((prior_wayins->'main') = (cited_wayins->'main')), false))          THEN ${sqlTagOf('ProvedWayinMoved')}
    WHEN (NOT COALESCE(((prior_wayins - 'main') = (proposed_wayins - 'main')), false))     THEN ${sqlTagOf('OtherWayinMoved')}
  END
$$;

-- Why a write that names add_passkey refuses: it must add a passkey wayin to a gate that has none, and change nothing else.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.add_passkey_refusal}(prior_wayins jsonb, proposed_wayins jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN (jsonb_typeof(prior_wayins->'passkey0') IS DISTINCT FROM 'null')                  THEN ${sqlTagOf('PasskeyStored')}
    WHEN (jsonb_typeof(proposed_wayins->'passkey0') IS DISTINCT FROM 'object')             THEN ${sqlTagOf('PasskeyNotAdded')}
    WHEN (NOT COALESCE(((prior_wayins - 'passkey0') = (proposed_wayins - 'passkey0')), false)) THEN ${sqlTagOf('OtherWayinMoved')}
  END
$$;

-- Why a write that names revoke_passkey refuses: it must remove the gate's passkey wayin, and change nothing else.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.revoke_passkey_refusal}(prior_wayins jsonb, proposed_wayins jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN (jsonb_typeof(prior_wayins->'passkey0') IS DISTINCT FROM 'object')                THEN ${sqlTagOf('NoPasskeyStored')}
    WHEN (jsonb_typeof(proposed_wayins->'passkey0') IS DISTINCT FROM 'null')               THEN ${sqlTagOf('PasskeyNotRevoked')}
    WHEN (NOT COALESCE(((prior_wayins - 'passkey0') = (proposed_wayins - 'passkey0')), false)) THEN ${sqlTagOf('OtherWayinMoved')}
  END
$$;

-- The verdict of policy on a write of proposed citing cited over the raw row prior: met wherever that is no live gate,
-- since a policy judges only a live gate's replacement. ManifestTags' policyVerdictOf.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.policy_verdict_of}(policy text, modelkind text, cited jsonb, proposed jsonb, prior jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN (refusaltag IS NULL) THEN jsonb_build_object('ok', true) ELSE jsonb_build_object('ok', false, 'refusaltag', refusaltag) END
  FROM (SELECT CASE
    WHEN ((modelkind <> 'gate') OR (${VaultFunctionNames.presence_of}(prior) <> 'live')) THEN NULL
    WHEN (policy = 'replace_passphrase') THEN ${VaultFunctionNames.replace_passphrase_refusal}(prior->'wayins', cited->'wayins', proposed->'wayins')
    WHEN (policy = 'add_passkey')        THEN ${VaultFunctionNames.add_passkey_refusal}(prior->'wayins', proposed->'wayins')
    WHEN (policy = 'revoke_passkey')     THEN ${VaultFunctionNames.revoke_passkey_refusal}(prior->'wayins', proposed->'wayins')
  END AS refusaltag) AS judged
$$;

-- A verdict for each storage policy in policies, keyed by the policy. ManifestTags.policiesOf.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.policies_of}(modelkind text, policies text[], cited jsonb, proposed jsonb, prior jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT COALESCE(jsonb_object_agg(policy, ${VaultFunctionNames.policy_verdict_of}(policy, modelkind, cited, proposed, prior)), '{}'::jsonb)
  FROM   unnest(policies) AS policy
$$;

-- Whether no verdict in verdicts refuses.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.policies_met}(verdicts jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT NOT EXISTS (SELECT FROM jsonb_each(verdicts) AS verdict WHERE ((verdict.value->'ok') = 'false'::jsonb))
$$;

-- The tags of a write of proposed over the raw row prior, citing cited, beside whether it wrote. ManifestTags.writeTagsOf.
-- modelkind is the write's, and policies the storage policies it names.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.write_tags_of}(modelkind text, proposed jsonb, cited jsonb, prior jsonb, policies text[], written boolean) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT jsonb_build_object(
    'presence',    ${VaultFunctionNames.presence_of}(prior),
    'revtok_cmp',  ${VaultFunctionNames.revtok_cmp_of}(cited->>'revtok', proposed->>'revtok', prior),
    'revseq_cmp',  CASE                                                                     -- revseqCmpOf
                     WHEN ((cited->'revseq') = '-1'::jsonb)          THEN 'birth'
                     WHEN ((prior->'revseq') = (cited->'revseq'))    THEN 'eq'
                     WHEN ((jsonb_typeof(prior->'revseq') = 'number') AND ((cited->>'revseq')::numeric < (prior->>'revseq')::numeric)) THEN 'stale'
                     ELSE                                                 'ahead'
                   END,
    'lifepath_eq', ((prior IS NULL) OR COALESCE(((prior->'lifepath') = (cited->'lifepath')), false)),
    'born_at_cmp', CASE                                                                     -- bornAtCmpOf
                     WHEN (((proposed->>'am') <> 'a') OR (${VaultFunctionNames.presence_of}(prior) <> 'live')) THEN 'moot'
                     WHEN ((prior->'born_at') = (proposed->'born_at'))                                         THEN 'same'
                     ELSE                                                                                           'changed'
                   END,
    'banktok_cmp', CASE                                                                     -- banktokCmpOf
                     WHEN ((modelkind <> 'gate') OR (${VaultFunctionNames.presence_of}(prior) <> 'live'))      THEN 'moot'
                     WHEN ((prior->'banktok') = (proposed->'banktok'))                                         THEN 'same'
                     ELSE                                                                                           'changed'
                   END,
    'policies',    ${VaultFunctionNames.policies_of}(modelkind, policies, cited, proposed, prior),
    'written',     written
  )
$$;

-- The tags of a write that wrote, of proposed citing cited. Its WHERE pinned the prior row's revtok, am and lifepath to the
-- cited ones, and its revseq to the proposed one's less one, which past the vaultDB's checks of the ask is the cited one's;
-- or, citing the shell, found no row. It held the prior row's born_at and banktok to the proposed ones, and met each storage
-- policy. So each tag is the one ${VaultFunctionNames.write_tags_of} would make of that prior row: ManifestTags.writtenTagsOf.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.written_tags_of}(modelkind text, proposed jsonb, cited jsonb, policies text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT jsonb_build_object(
    'presence',    CASE WHEN ((cited->'revseq') = '-1'::jsonb) THEN 'void'  WHEN ((cited->>'am') = 'a') THEN 'live' ELSE 'gone' END,
    'revtok_cmp',  CASE WHEN ((cited->'revseq') = '-1'::jsonb) THEN 'birth' ELSE 'eq' END,
    'revseq_cmp',  CASE WHEN ((cited->'revseq') = '-1'::jsonb) THEN 'birth' ELSE 'eq' END,
    'lifepath_eq', true,
    'born_at_cmp', CASE WHEN (((proposed->>'am') = 'a') AND ((cited->>'am') = 'a')) THEN 'same' ELSE 'moot' END,
    'banktok_cmp', CASE WHEN ((modelkind = 'gate') AND ((cited->>'am') = 'a'))      THEN 'same' ELSE 'moot' END,
    'policies',    COALESCE((SELECT jsonb_object_agg(policy, jsonb_build_object('ok', true)) FROM unnest(policies) AS policy), '{}'::jsonb),
    'written',     true
  )
$$;

-- The tags of a birth that wrote nothing, by gate_record citing gate_cited and root_record citing root_cited, over the
-- raw roots prior_gate and prior_root: each root's tags as ${VaultFunctionNames.write_tags_of} makes them, less written.
-- ManifestTags.birthTagsOf.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.birth_tags_of}(gate_record jsonb, gate_cited jsonb, root_record jsonb, root_cited jsonb, prior_gate jsonb, prior_root jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT jsonb_build_object(
    'gate',    ${VaultFunctionNames.write_tags_of}('gate', gate_record, gate_cited, prior_gate, ARRAY[]::text[], false) - 'written',
    'root',    ${VaultFunctionNames.write_tags_of}('box',  root_record, root_cited, prior_root, ARRAY[]::text[], false) - 'written',
    'written', false
  )
$$;

-- Each kind's write function: write proposed_record over the row cited_record cites, or over the shell where none is
-- stored, where the ask's flags if_absent and if_present allow it and every check holds of the prior row.
${writeFunctionOf({ kind: 'gate', table: 'safebyok_gate_things', body: GateBody })}
${writeFunctionOf({ kind: 'box', table: 'safebyok_box_things', body: BoxBody })}

-- Write a bank's two roots, its gate at its banklabel and its root box, where each put is writable as its kind's write
-- function would judge it: over the shell, where none is stored, its first revision; over its tombstone, its next life. One
-- statement writes both or neither. The root box's put is judged first, in the statement's snapshot; the gate is then
-- written as write_gate writes it, and the root box only beside a gate written by the same statement. Where another writer
-- wrote the root box first, its INSERT fails the statement whole, and an UPDATE that finds its WHERE no longer holds raises,
-- which fails it as well. Two births racing for one bank both find the root box writable; the one that commits second
-- writes no gate, so it writes nothing, and answers what the first wrote.
-- A birth's puts' flags are fixed (birthPutsOf): each adds over no row or a tombstone; the gate's gets a live gate, and the
-- root box's fails over a live one.
-- Returns the birth's tags, and the two rows as they now stand, each null for none. Written, each root's tags are those of
-- the write its put let through, as write_gate's and write_box's are; unwritten, the two are read back, and the tags made
-- of those same rows. MemoryDatastore's isBirthWritable.
CREATE OR REPLACE FUNCTION ${VaultFunctionNames.birth_roots}(gate_record jsonb, gate_cited_record jsonb, root_record jsonb, root_cited_record jsonb)
RETURNS TABLE (tags jsonb, gate jsonb, root jsonb)
LANGUAGE plpgsql AS $$
DECLARE
  new_gate   safebyok_gate_things := jsonb_populate_record(NULL::safebyok_gate_things, gate_record);
  gate_cited safebyok_gate_things := jsonb_populate_record(NULL::safebyok_gate_things, gate_cited_record);
  new_root   safebyok_box_things  := jsonb_populate_record(NULL::safebyok_box_things,  root_record);
  root_cited safebyok_box_things  := jsonb_populate_record(NULL::safebyok_box_things,  root_cited_record);
BEGIN
  WITH writable AS (
    SELECT
    FROM   (SELECT) AS one
    LEFT JOIN safebyok_box_things AS root_prior
      ON   ((root_prior.userid, root_prior.banklabel, root_prior.labelpath) = (new_root.userid, new_root.banklabel, new_root.labelpath))
    WHERE  ((new_root.userid, new_root.banklabel) = (new_gate.userid, new_gate.banklabel))
      AND  (new_gate.labelpath = new_gate.banklabel) AND (new_root.labelpath = 'box')
      AND  (CASE WHEN (root_cited.revseq = -1)
             THEN ((root_prior.userid IS NULL) AND ${clausesSqlOf(shellClausesOf(BirthRootNames))})
             ELSE (${clausesSqlOf(priorClausesOf(BirthRootNames, 'root_prior'))})
           END)
  ), gate_added AS (
    INSERT INTO safebyok_gate_things AS written SELECT (new_gate).* FROM writable
    WHERE  (gate_cited.revseq = -1)
      AND  ${clausesSqlOf(shellClausesOf(BirthGateNames))}
    ON CONFLICT DO NOTHING  -- variation approved for birth calls: a birth is an ensure, so a conflict is the present case, which the read below answers
    RETURNING ${VaultFunctionNames.thing_record}(to_jsonb(written)) AS written
  ), gate_reborn AS (
    UPDATE safebyok_gate_things AS prior
    SET    (${GateColumns.join(', ')})
         = (${GateColumns.map((column) => `new_gate.${column}`).join(', ')})
    FROM   writable
    WHERE  (gate_cited.revseq <> -1)
      AND  ${clausesSqlOf(priorClausesOf(BirthGateNames, 'prior'))}
    RETURNING WITH (NEW AS written) ${VaultFunctionNames.thing_record}(to_jsonb(written)) AS written
  ), gated AS (
    SELECT written AS gate_written FROM gate_added UNION ALL SELECT written FROM gate_reborn  -- named apart from written, which the root box's UPDATE returns
  ), root_added AS (
    INSERT INTO safebyok_box_things AS written SELECT (new_root).* FROM gated
    WHERE  (root_cited.revseq = -1)  -- only once the gate is written; a conflict here fails the whole statement
    RETURNING ${VaultFunctionNames.thing_record}(to_jsonb(written)) AS written
  ), root_reborn AS (
    UPDATE safebyok_box_things AS prior
    SET    (${BoxColumns.join(', ')})
         = (${BoxColumns.map((column) => `new_root.${column}`).join(', ')})
    FROM   gated
    WHERE  (root_cited.revseq <> -1)
      AND  ${clausesSqlOf(priorClausesOf(BirthRootNames, 'prior'))}
    RETURNING WITH (NEW AS written) ${VaultFunctionNames.thing_record}(to_jsonb(written)) AS written
  )
  SELECT (SELECT gate_written FROM gated), (SELECT written FROM root_added UNION ALL SELECT written FROM root_reborn)
  INTO   gate, root;

  IF (gate IS NOT NULL) THEN
    IF (root IS NULL) THEN
      RAISE EXCEPTION '${VaultFunctionNames.birth_roots}: the root box was written under the birth, which writes both roots or neither';
    END IF;
    tags := jsonb_build_object(
      'gate',    ${VaultFunctionNames.written_tags_of}('gate', gate_record, gate_cited_record, ARRAY[]::text[]) - 'written',
      'root',    ${VaultFunctionNames.written_tags_of}('box',  root_record, root_cited_record, ARRAY[]::text[]) - 'written',
      'written', true
    );
    PERFORM ${VaultFunctionNames.tell_thing}(gate, gate);
    PERFORM ${VaultFunctionNames.tell_thing}(root, gate);
    RETURN NEXT;  RETURN;
  END IF;

  SELECT (
    SELECT ${VaultFunctionNames.thing_record}(to_jsonb(prior)) FROM safebyok_gate_things AS prior
    WHERE  (prior.userid, prior.banklabel, prior.labelpath) = (new_gate.userid, new_gate.banklabel, new_gate.banklabel)
  ), (
    SELECT ${VaultFunctionNames.thing_record}(to_jsonb(prior)) FROM safebyok_box_things AS prior
    WHERE  (prior.userid, prior.banklabel, prior.labelpath) = (new_gate.userid, new_gate.banklabel, 'box')
  )
  INTO gate, root;
  tags := ${VaultFunctionNames.birth_tags_of}(gate_record, gate_cited_record, root_record, root_cited_record, gate, root);
  RETURN NEXT;
END $$;

REVOKE ALL ON FUNCTION ${VaultFunctionNames.thing_record}(jsonb)                          FROM PUBLIC;
REVOKE ALL ON FUNCTION ${VaultFunctionNames.tell_thing}(jsonb, jsonb)                     FROM PUBLIC;
REVOKE ALL ON FUNCTION ${VaultFunctionNames.write_gate}(jsonb, jsonb, text, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION ${VaultFunctionNames.write_box}(jsonb, jsonb, text, text)          FROM PUBLIC;
REVOKE ALL ON FUNCTION ${VaultFunctionNames.birth_roots}(jsonb, jsonb, jsonb, jsonb)      FROM PUBLIC;
`
