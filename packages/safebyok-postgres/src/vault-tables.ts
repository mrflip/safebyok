// The Thing's columns and CHECKs, the same in every kind's table. A rule about one row alone is a CHECK here, never a
// clause in a write function.
const ThingColumns = `
  userid     text    COLLATE "C" NOT NULL,
  banklabel  text    COLLATE "C" NOT NULL,
  labelpath  text    COLLATE "C" NOT NULL,
  modelkind  text    COLLATE "C" NOT NULL,
  label      text    COLLATE "C" NOT NULL,
  banktok    text    COLLATE "C" NOT NULL,
  fmt        text    COLLATE "C" NOT NULL,
  am         text    COLLATE "C" NOT NULL,
  lifepath   text    COLLATE "C" NOT NULL,
  lifeseq    text    COLLATE "C" NOT NULL,
  revtok     text    COLLATE "C" NOT NULL,
  revseq     integer NOT NULL,
  born_at    bigint  NOT NULL,
  written_at bigint  NOT NULL,`

const ThingChecks = `
  PRIMARY KEY (userid, banklabel, labelpath),
  CHECK (am IN ('a', 'x') AND revseq >= 0 AND born_at <= written_at),
  CHECK (revtok <> '00000000-0000-0000-0000-000000000000'),
  CHECK (lifeseq ~ '^[0-9a-v]{10}$'),
  CHECK ((am = 'x') = (right(lifeseq, 1) IN ('1','3','5','7','9','b','d','f','h','j','l','n','p','r','t','v'))),
  CHECK (lifeseq = substring(lifepath from '[^/]*$')),
  CHECK (label = substring(labelpath from '[^/]*$')),
  CHECK (array_length(string_to_array(lifepath, '/'), 1) = array_length(string_to_array(labelpath, '/'), 1)),`

/** The SQL that creates PostgresVaultDB's two tables, one per kind of Thing: `await pool.query(VaultTablesSql)`. */
export const VaultTablesSql = `-- safebyok-postgres: the two tables PostgresVaultDB writes its Things to, one per kind. For Postgres 14 or later;
-- VaultFunctionsSql and PostgresVaultDB need Postgres 18.
-- Safe to run again: it creates only what is missing.
--
-- Each row is the Thing safebyok wrote, with a column for each of its fields. A field that is an object is a jsonb column.
-- modelkind is the kind of Thing, the same in every row of a table: 'gate' or 'box'. A labelpath addresses a Thing within
-- its kind's table, so a bank labelled box has its gate and its root box each at labelpath box, one in each table.
-- banktok names the life of the bank a Thing was written in: a gate's is minted at each of the bank's births and kept by
-- each write over the live gate, its tombstone among them; a box's is its gate's when it was sealed, which no table
-- compares with the gate's.
-- am is 'a' for a live Thing and 'x' for a tombstone; an odd lifeseq is a tombstone's. The CHECKs refuse a row safebyok
-- could not read back, row by row; the write functions in VaultFunctionsSql make every check that compares two rows.
-- No row has the shell's revtok, all zeros: a write that cites it cites no row.
-- Each time is UTC epoch milliseconds. Every secret field is ciphertext.
--
-- Every text column is COLLATE "C", compared and sorted byte for byte, as safebyok compares names. A locale's collation
-- can reorder strings when the operating system or ICU is upgraded, leaving an index silently out of order.
--
-- A bank has no row of its own: its gate and its root box are its roots, written together by safebyok_birth_roots.
-- No table has a foreign key, and a lone or incompatible row reads as one.

-- A bank's gate, stored at its banklabel. Its banktok tells one life of the bank from another born under its banklabel. A
-- live gate's wayins holds the bank's passphrase wayin under main,
-- and its passkey wayin under passkey0, JSON null for none. The gate's tombstone is its bank's end, and keeps no wayin:
-- each place is JSON null. auth, sigs and meta are kept for later, and are always empty.
CREATE TABLE IF NOT EXISTS safebyok_gate_things (${ThingColumns}
  wayins     jsonb   NOT NULL,
  auth       jsonb   NOT NULL,
  sigs       jsonb   NOT NULL,
  meta       jsonb   NOT NULL,${ThingChecks}
  CHECK (modelkind = 'gate'),
  CHECK (labelpath = banklabel AND label = banklabel),
  CHECK (COALESCE(CASE
    WHEN (am = 'a') THEN ((jsonb_typeof(wayins->'main') = 'object') AND (jsonb_typeof(wayins->'passkey0') IN ('object', 'null')))
    ELSE                 (wayins = '{"main": null, "passkey0": null}'::jsonb)
  END, false)),
  CHECK (jsonb_typeof(auth) = 'object' AND jsonb_typeof(sigs) = 'object' AND jsonb_typeof(meta) = 'object')
);

-- A box. A tombstone keeps its sealed whisper and its sidecar, which is always {}.
CREATE TABLE IF NOT EXISTS safebyok_box_things (${ThingColumns}
  sidecar        jsonb NOT NULL,
  whisper_sealed jsonb NOT NULL,${ThingChecks}
  CHECK (modelkind = 'box'),
  CHECK (labelpath IN ('box', 'box/' || label)),
  CHECK (am = 'a' OR sidecar = '{}'::jsonb),
  CHECK (jsonb_typeof(sidecar) = 'object' AND jsonb_typeof(whisper_sealed) = 'object')
);

-- Row-level security is on, with no policy. The role that owns the tables, which your server
-- connects as, can reach every row. No other role can reach any, including Supabase's Data API roles.
ALTER TABLE safebyok_gate_things ENABLE ROW LEVEL SECURITY;
ALTER TABLE safebyok_box_things  ENABLE ROW LEVEL SECURITY;
`
