/** The SQL that PostgresVaultDB runs, one whole statement for each kind of Thing and each call, each handing back the call's manifest. */

// Each statement returns one row, the call's manifest (notes/vault-adapter-contract.md), each Thing as one JSON object
// shaped like the record it was stored from, so that a bigint column arrives as a number (a driver returns a bare bigint
// as text). The `thing_record` function drops the null columns: the record had no such field. Each statement reads what it
// asks for and the bank's roots in one statement, so both come from the same snapshot, and returns beside it the bank's
// `banktok`, `tracked`, how the bank, main gate and root box compare with the track the ask passes as JSON, and `read_tc`,
// when Postgres read them (bankObservedSqlOf).

import { type Thingkind, VoidLifeTok } from 'safebyok/storage'
import { VaultFunctionNames } from './vault-functions'

// == [What every manifest carries]: bankObservedSqlOf, ThingTables

// Postgres 18's uuidv7() is monotonic within a connection, so two reads in one session are dated in the order they ran.
// The banktok is ManifestTags.banktokOf: a bank row with no lifetok, which its NOT NULL column forbids, would hand back null, never drop the key.
/** The columns every manifest carries, of the `world` and `root` columns of the statement's subquery and the track (`track`, a parameter): `banktok`, the bank row's lifetok or the void lifetok for none; `tracked`; and `read_tc`, a UUID version 7 Postgres makes as it runs the statement. */
function bankObservedSqlOf(track: string): string {
  const banktok = `CASE WHEN ((world->'bank') = 'null'::jsonb) THEN to_jsonb('${VoidLifeTok}'::text) ELSE (world->'bank'->'lifetok') END AS banktok`
  return `${banktok}, ${VaultFunctionNames.tracked}(world, root, ${track}::text::jsonb) AS tracked, uuidv7()::text AS read_tc`
}

/** The table that keeps each kind of Thing. */
const ThingTables = { bank: 'safebyok_bank_things', gate: 'safebyok_gate_things', box: 'safebyok_box_things' } as const satisfies Record<Thingkind, string>
// --

// == [Reads]: ancestorSqlOf, GetThingSql, ListThingsSql, GetWorldSql, StatsSql

// A Thing's ancestors are of its own kind, so they are in its table. starts_with compares text as text: a '%' or '_' in a
// labelpath is no wildcard, as it would be to LIKE.
/** The SQL of a subquery for the nearest Thing stored above a scope, given as SQL expressions: of the bank's Things in `table` whose labelpath followed by '/' begins the scope's, the one with the longest labelpath, or null for none. */
function ancestorSqlOf(table: string, { userid, banklabel, labelpath }: Readonly<Record<'userid' | 'banklabel' | 'labelpath', string>>): string {
  return `(
    SELECT   ${VaultFunctionNames.thing_record}(to_jsonb(above)) FROM ${table} AS above
    WHERE    ((above.userid, above.banklabel) = (${userid}, ${banklabel}))
      AND    starts_with(${labelpath}, above.labelpath || '/')
    ORDER BY length(above.labelpath) DESC
    LIMIT    1
  )`
}

/** A get's manifest of each kind at a scope ($1 userid, $2 banklabel, $3 labelpath), its roots compared with the track ($4). */
export const GetThingSql: Readonly<Record<Thingkind, string>> = {
  bank: getThingSqlOf(ThingTables.bank),
  gate: getThingSqlOf(ThingTables.gate),
  box:  getThingSqlOf(ThingTables.box),
}

/** A listing's manifest of each kind at a scope ($1 userid, $2 banklabel, $3 labelpath), each child in labelpath order, its roots compared with the track ($4). */
export const ListThingsSql: Readonly<Record<Thingkind, string>> = {
  bank: listThingsSqlOf(ThingTables.bank),
  gate: listThingsSqlOf(ThingTables.gate),
  box:  listThingsSqlOf(ThingTables.box),
}

// The ancestor is read only where there is no actual row: it is read nowhere else.
function getThingSqlOf(table: string): string {
  return `
  SELECT jsonb_build_object('presence', ${VaultFunctionNames.presence_of}(actual)) AS tags, actual,
         CASE WHEN (actual IS NULL) THEN ${ancestorSqlOf(table, { userid: '$1::text', banklabel: '$2::text', labelpath: '$3::text' })} END AS ancestor,
         ${bankObservedSqlOf('$4')}
  FROM (SELECT (
    SELECT ${VaultFunctionNames.thing_record}(to_jsonb(thing)) FROM ${table} AS thing
    WHERE  (thing.userid, thing.banklabel, thing.labelpath) = ($1::text, $2::text, $3::text)
  ) AS actual, ${VaultFunctionNames.world}($1::text, $2::text) AS world, ${VaultFunctionNames.root_box}($1::text, $2::text) AS root) AS observed
`
}

// The labelpaths under a parent's lie between `<parent>/` and `<parent>0`, '0' being the byte after '/'; a child's has no further '/'.
function listThingsSqlOf(table: string): string {
  return `
  SELECT jsonb_build_object('presence', ${VaultFunctionNames.presence_of}(actual)) AS tags, actual, children, ${bankObservedSqlOf('$4')}
  FROM (SELECT (
    SELECT ${VaultFunctionNames.thing_record}(to_jsonb(thing)) FROM ${table} AS thing
    WHERE  (thing.userid, thing.banklabel, thing.labelpath) = ($1::text, $2::text, $3::text)
  ) AS actual, COALESCE((
    SELECT jsonb_agg(jsonb_build_object('labelpath', child.labelpath, 'raw', ${VaultFunctionNames.thing_record}(to_jsonb(child))) ORDER BY child.labelpath)
    FROM   ${table} AS child
    WHERE  ((child.userid, child.banklabel) = ($1::text, $2::text))
      AND  (child.labelpath >= ($3::text || '/'))
      AND  (child.labelpath <  ($3::text || '0'))
      AND  (strpos(substr(child.labelpath, length($3::text) + 2), '/') = 0)
  ), '[]'::jsonb) AS children, ${VaultFunctionNames.world}($1::text, $2::text) AS world, ${VaultFunctionNames.root_box}($1::text, $2::text) AS root) AS observed
`
}

/** A get of the world's manifest: a bank's three roots at its scope ($1 userid, $2 banklabel), compared with the track ($3). */
export const GetWorldSql = `
  SELECT jsonb_build_object('bank', world->'bank', 'gate', world->'maingate', 'root', root) AS actual, ${bankObservedSqlOf('$3')}
  FROM (SELECT ${VaultFunctionNames.world}($1::text, $2::text) AS world, ${VaultFunctionNames.root_box}($1::text, $2::text) AS root) AS observed
`

// A row's size is Postgres's own measure of it as a value, pg_column_size: its columns as stored, compressed where Postgres compressed them.
/** The SQL of a subquery for the stats of a bank's ($1 userid, $2 banklabel) Things in `table`: how many it stores, how many are live, and their size in bytes. */
function thingkindStatsSqlOf(table: string): string {
  return `(
    SELECT jsonb_build_object('count', count(*), 'live_count', count(*) FILTER (WHERE thing.am = 'a'), 'size', COALESCE(sum(pg_column_size(thing)), 0))
    FROM   ${table} AS thing
    WHERE  (thing.userid, thing.banklabel) = ($1::text, $2::text)
  )`
}

/** An ask for stats' manifest, less the limits: the stats of a bank's ($1 userid, $2 banklabel) boxes and gates, its roots compared with the track ($3). */
export const StatsSql = `
  SELECT box, gate, ${bankObservedSqlOf('$3')}
  FROM (SELECT ${thingkindStatsSqlOf(ThingTables.box)} AS box, ${thingkindStatsSqlOf(ThingTables.gate)} AS gate,
    ${VaultFunctionNames.world}($1::text, $2::text) AS world, ${VaultFunctionNames.root_box}($1::text, $2::text) AS root) AS observed
`
// --

// == [Writes]: writeThingSqlOf, WriteThingSql, BirthRootsSql

// The ancestor is read beside the write function's call, in the same statement, only where there is no actual row: it is
// another row than the one written.
/** The SQL of a write's manifest, from the call of its kind's write function `call` over the table `table`. */
function writeThingSqlOf(table: string, call: string): string {
  const ancestor = ancestorSqlOf(table, { userid: `($1::text::jsonb ->> 'userid')`, banklabel: `($1::text::jsonb ->> 'banklabel')`, labelpath: `($1::text::jsonb ->> 'labelpath')` })
  return `
  SELECT tags, actual, CASE WHEN (actual IS NULL) THEN ${ancestor} END AS ancestor, ${bankObservedSqlOf('$5')}
  FROM   ${call}
`
}

/** A write's manifest of each kind: its write function over the record ($1), what it cites ($2), its ifAbsent ($3) and ifPresent ($4), its roots after compared with the track ($5); the gate's also takes the storage policies ($6). */
export const WriteThingSql: Readonly<Record<Thingkind, string>> = {
  bank: writeThingSqlOf(ThingTables.bank, `${VaultFunctionNames.write_bank}($1::text::jsonb, $2::text::jsonb, $3::text, $4::text)`),
  gate: writeThingSqlOf(ThingTables.gate, `${VaultFunctionNames.write_gate}($1::text::jsonb, $2::text::jsonb, $3::text, $4::text, $6::text[])`),
  box:  writeThingSqlOf(ThingTables.box,  `${VaultFunctionNames.write_box}($1::text::jsonb, $2::text::jsonb, $3::text, $4::text)`),
}

/** A birth's manifest: its bank ($1), main gate ($2) and root box ($3), the roots after compared with the track ($4). */
export const BirthRootsSql = `
  SELECT tags, jsonb_build_object('bank', bank, 'gate', gate, 'root', root) AS actual, ${bankObservedSqlOf('$4')}
  FROM (SELECT tags, bank, gate, root, jsonb_build_object('bank', bank, 'maingate', gate) AS world
        FROM   ${VaultFunctionNames.birth_roots}($1::text::jsonb, $2::text::jsonb, $3::text::jsonb)) AS observed
`
// --
