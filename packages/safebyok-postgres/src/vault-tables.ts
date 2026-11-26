// The Thing's columns and CHECKs, the same in every kind's table. A rule about one row alone is a CHECK here, never a
// clause in a write function.
const ThingColumns = `
  userid     text    COLLATE "C" NOT NULL,
  banklabel  text    COLLATE "C" NOT NULL,
  labelpath  text    COLLATE "C" NOT NULL,
  label      text    COLLATE "C" NOT NULL,
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

/** The SQL that creates PostgresVaultDB's three tables, one per kind of Thing: `await pool.query(VaultTablesSql)`. */
export const VaultTablesSql = `-- safebyok-postgres: the three tables PostgresVaultDB stores its Things in, one per kind. For Postgres 14 or later;
-- VaultFunctionsSql and PostgresVaultDB need Postgres 18.
-- Safe to run again: it creates only what is missing.
--
-- Each row is the Thing safebyok wrote, with a column for each of its fields. A field that is an object is a jsonb column.
-- am is 'a' for a live Thing and 'x' for a tombstone; an odd lifeseq is a tombstone's. The CHECKs refuse a row safebyok
-- could not read back, row by row; the write functions in VaultFunctionsSql make every check that compares two rows.
-- No row has the shell's revtok, all zeros: a write that cites it cites no row.
-- Each time is UTC epoch milliseconds. Every secret field is ciphertext.
--
-- Every text column is COLLATE "C", compared and sorted byte for byte, as safebyok compares names. A locale's collation
-- can reorder strings when the operating system or ICU is upgraded, leaving an index silently out of order.
--
-- No table has a foreign key: a bank's roots are written together by safebyok_birth_roots, and a lone or incompatible row
-- reads as one.

-- A bank: its Thing alone. lifetok is minted at the bank's birth, kept by each write over the live bank, and tells it from
-- another born under its banklabel.
CREATE TABLE IF NOT EXISTS safebyok_bank_things (${ThingColumns}
  lifetok    text    COLLATE "C" NOT NULL,${ThingChecks}
  CHECK (labelpath = 'bank' AND label = 'bank')
);

-- A gate. wayins holds the bank's passphrase wayin under main, and its passkey wayin under passkey0, JSON null for none.
-- auth, sigs and meta are kept for later, and are always empty. The main gate is never deleted.
CREATE TABLE IF NOT EXISTS safebyok_gate_things (${ThingColumns}
  wayins     jsonb   NOT NULL,
  auth       jsonb   NOT NULL,
  sigs       jsonb   NOT NULL,
  meta       jsonb   NOT NULL,${ThingChecks}
  CHECK (labelpath IN ('gate', 'gate/' || label)),
  CHECK (labelpath <> 'gate' OR am = 'a'),
  CHECK (COALESCE(
        jsonb_typeof(wayins->'main') = 'object'
    AND jsonb_typeof(wayins->'passkey0') IN ('object', 'null')
    AND jsonb_typeof(auth) = 'object' AND jsonb_typeof(sigs) = 'object' AND jsonb_typeof(meta) = 'object', false))
);

-- A box. A tombstone keeps its sealed whisper and its sidecar, which is always {}.
CREATE TABLE IF NOT EXISTS safebyok_box_things (${ThingColumns}
  sidecar        jsonb NOT NULL,
  whisper_sealed jsonb NOT NULL,${ThingChecks}
  CHECK (labelpath IN ('box', 'box/' || label)),
  CHECK (am = 'a' OR sidecar = '{}'::jsonb),
  CHECK (jsonb_typeof(sidecar) = 'object' AND jsonb_typeof(whisper_sealed) = 'object')
);

-- Row-level security is on, with no policy. The role that owns the tables, which your server
-- connects as, can reach every row. No other role can reach any, including Supabase's Data API roles.
ALTER TABLE safebyok_bank_things ENABLE ROW LEVEL SECURITY;
ALTER TABLE safebyok_gate_things ENABLE ROW LEVEL SECURITY;
ALTER TABLE safebyok_box_things  ENABLE ROW LEVEL SECURITY;
`
