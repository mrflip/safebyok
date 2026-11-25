/** The SQL that PostgresVaultDB runs, one whole statement for each kind of Thing and each call. */

// Each query returns a Thing as one JSON object shaped like the record it was stored from, so that a bigint column arrives
// as a number (a driver returns a bare bigint as text). The `thing_record` function drops the null columns: the record had no
// such field. Each read fetches what it asks for and the bank's roots in one statement, so both come from the same snapshot.
// Each statement returns the bank row, null for none, and `tracked`, how the bank, main gate and root box compare with the
// track the ask passes as JSON.
// A get's and a write's also return `ancestor`, the nearest Thing stored above the scope (ancestorSqlOf).

import type { Thingkind } from 'safebyok/storage'
import { VaultFunctionNames } from './vault-functions'

// == [Tables]: ThingTables

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

/** The Thing of each kind at a scope ($1 userid, $2 banklabel, $3 labelpath), its bank's row, the nearest Thing stored above it, and how the bank, main gate and root box compare with the track ($4). */
export const GetThingSql: Readonly<Record<Thingkind, string>> = {
  bank: getThingSqlOf(ThingTables.bank),
  gate: getThingSqlOf(ThingTables.gate),
  box:  getThingSqlOf(ThingTables.box),
}

/** The Thing of each kind at a scope, each Thing one label under it in labelpath order, its bank's row, and how the bank, main gate and root box compare with the track ($4). */
export const ListThingsSql: Readonly<Record<Thingkind, string>> = {
  bank: listThingsSqlOf(ThingTables.bank),
  gate: listThingsSqlOf(ThingTables.gate),
  box:  listThingsSqlOf(ThingTables.box),
}

function getThingSqlOf(table: string): string {
  return `
  SELECT thing, world->'bank' AS bank, ancestor, ${VaultFunctionNames.tracked}(world, root, $4::text::jsonb) AS tracked FROM (SELECT (
    SELECT ${VaultFunctionNames.thing_record}(to_jsonb(stored)) FROM ${table} AS stored
    WHERE  (stored.userid, stored.banklabel, stored.labelpath) = ($1::text, $2::text, $3::text)
  ) AS thing, ${VaultFunctionNames.world}($1::text, $2::text) AS world, ${VaultFunctionNames.root_box}($1::text, $2::text) AS root,
  ${ancestorSqlOf(table, { userid: '$1::text', banklabel: '$2::text', labelpath: '$3::text' })} AS ancestor) AS fetched
`
}

// The labelpaths under a parent's lie between `<parent>/` and `<parent>0`, '0' being the byte after '/'; a child's has no further '/'.
function listThingsSqlOf(table: string): string {
  return `
  SELECT parent, children, world->'bank' AS bank, ${VaultFunctionNames.tracked}(world, root, $4::text::jsonb) AS tracked FROM (SELECT (
    SELECT ${VaultFunctionNames.thing_record}(to_jsonb(stored)) FROM ${table} AS stored
    WHERE  (stored.userid, stored.banklabel, stored.labelpath) = ($1::text, $2::text, $3::text)
  ) AS parent, COALESCE((
    SELECT jsonb_agg(jsonb_build_object('labelpath', child.labelpath, 'raw', ${VaultFunctionNames.thing_record}(to_jsonb(child))) ORDER BY child.labelpath)
    FROM   ${table} AS child
    WHERE  ((child.userid, child.banklabel) = ($1::text, $2::text))
      AND  (child.labelpath >= ($3::text || '/'))
      AND  (child.labelpath <  ($3::text || '0'))
      AND  (strpos(substr(child.labelpath, length($3::text) + 2), '/') = 0)
  ), '[]'::jsonb) AS children, ${VaultFunctionNames.world}($1::text, $2::text) AS world, ${VaultFunctionNames.root_box}($1::text, $2::text) AS root) AS fetched
`
}

/** A bank's three roots at its scope ($1 userid, $2 banklabel), and how they compare with the track ($3). */
export const GetWorldSql = `
  SELECT world->'bank' AS bank, world->'maingate' AS gate, root, ${VaultFunctionNames.tracked}(world, root, $3::text::jsonb) AS tracked FROM (SELECT
    ${VaultFunctionNames.world}($1::text, $2::text) AS world, ${VaultFunctionNames.root_box}($1::text, $2::text) AS root) AS fetched
`

// A row's size is Postgres's own measure of it as a value, pg_column_size: its columns as stored, compressed where Postgres compressed them.
/** The SQL of a subquery for the stats of a bank's ($1 userid, $2 banklabel) Things in `table`: how many it stores, how many are live, and their size in bytes. */
function thingkindStatsSqlOf(table: string): string {
  return `(
    SELECT jsonb_build_object('count', count(*), 'live_count', count(*) FILTER (WHERE stored.am = 'a'), 'size', COALESCE(sum(pg_column_size(stored)), 0))
    FROM   ${table} AS stored
    WHERE  (stored.userid, stored.banklabel) = ($1::text, $2::text)
  )`
}

/** The stats of a bank's ($1 userid, $2 banklabel) boxes and gates, its bank's row, and how the bank, main gate and root box compare with the track ($3). */
export const StatsSql = `
  SELECT box, gate, world->'bank' AS bank, ${VaultFunctionNames.tracked}(world, root, $3::text::jsonb) AS tracked FROM (SELECT
    ${thingkindStatsSqlOf(ThingTables.box)} AS box, ${thingkindStatsSqlOf(ThingTables.gate)} AS gate,
    ${VaultFunctionNames.world}($1::text, $2::text) AS world, ${VaultFunctionNames.root_box}($1::text, $2::text) AS root) AS fetched
`
// --

// == [Writes]: recordAncestorSqlOf, WriteThingSql, BirthRootsSql

// The ancestor is read beside the write function's call, in the same statement: it is another row than the one written.
/** The SQL of a subquery for the nearest Thing stored above the scope of the record ($1) in `table`. */
function recordAncestorSqlOf(table: string): string {
  return ancestorSqlOf(table, { userid: `($1::text::jsonb ->> 'userid')`, banklabel: `($1::text::jsonb ->> 'banklabel')`, labelpath: `($1::text::jsonb ->> 'labelpath')` })
}

// Every statement returns all three verdicts: one whose check its kind does not make is true.
/** Each kind's write function, over the record ($1) and what it cites ($2), the nearest Thing stored above the record's scope, the bank row after, and how the bank, main gate and root box after compare with the track ($3); the gate's also takes the storage policies ($4). */
export const WriteThingSql: Readonly<Record<Thingkind, string>> = {
  bank: `SELECT ok, thing, world->'bank' AS bank, born_at_ok, lifetok_ok, true AS policies_ok, ${recordAncestorSqlOf(ThingTables.bank)} AS ancestor, ${VaultFunctionNames.tracked}(world, root, $3::text::jsonb) AS tracked FROM ${VaultFunctionNames.write_bank}($1::text::jsonb, $2::text::jsonb)`,
  gate: `SELECT ok, thing, world->'bank' AS bank, born_at_ok, true AS lifetok_ok, policies_ok, ${recordAncestorSqlOf(ThingTables.gate)} AS ancestor, ${VaultFunctionNames.tracked}(world, root, $3::text::jsonb) AS tracked FROM ${VaultFunctionNames.write_gate}($1::text::jsonb, $2::text::jsonb, $4::text[])`,
  box:  `SELECT ok, thing, world->'bank' AS bank, born_at_ok, true AS lifetok_ok, true AS policies_ok, ${recordAncestorSqlOf(ThingTables.box)} AS ancestor, ${VaultFunctionNames.tracked}(world, root, $3::text::jsonb) AS tracked FROM ${VaultFunctionNames.write_box}($1::text::jsonb, $2::text::jsonb)`,
}

/** A bank's birth: its bank ($1), main gate ($2) and root box ($3), and how the roots after compare with the track ($4). */
export const BirthRootsSql = `
  SELECT ok, bank, gate, root, ${VaultFunctionNames.tracked}(jsonb_build_object('bank', bank, 'maingate', gate), root, $4::text::jsonb) AS tracked
  FROM   ${VaultFunctionNames.birth_roots}($1::text::jsonb, $2::text::jsonb, $3::text::jsonb)
`
// --
