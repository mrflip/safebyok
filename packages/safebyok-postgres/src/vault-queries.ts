/** The SQL that PostgresVaultDB runs, one whole statement for each kind of Thing and each call. */

// Each query returns a Thing as one JSON object shaped like the record it was stored from, so that a bigint column arrives
// as a number (a driver returns a bare bigint as text). `safebyok_thing_record` drops the null columns: the record had no
// such field. Each read fetches what it asks for and the bank's world in one statement, so both come from the same snapshot.
// Each statement also returns `tracked`, how the world compares with the track the ask passes as JSON, or null.

import type { Thingkind } from 'safebyok/storage'

// == [Tables]: ThingTables

/** The table that keeps each kind of Thing. */
const ThingTables = { bank: 'safebyok_bank_things', gate: 'safebyok_gate_things', box: 'safebyok_box_things' } as const satisfies Record<Thingkind, string>
// --

// == [Reads]: GetThingSql, ListThingsSql

/** The Thing of each kind at a scope ($1 userid, $2 banklabel, $3 labelpath), its bank's world, and how it compares with the track ($4). */
export const GetThingSql: Readonly<Record<Thingkind, string>> = {
  bank: getThingSqlOf(ThingTables.bank),
  gate: getThingSqlOf(ThingTables.gate),
  box:  getThingSqlOf(ThingTables.box),
}

/** The Thing of each kind at a scope, each Thing one label under it in labelpath order, its bank's world, and how it compares with the track ($4). */
export const ListThingsSql: Readonly<Record<Thingkind, string>> = {
  bank: listThingsSqlOf(ThingTables.bank),
  gate: listThingsSqlOf(ThingTables.gate),
  box:  listThingsSqlOf(ThingTables.box),
}

function getThingSqlOf(table: string): string {
  return `
  SELECT thing, world, safebyok_tracked(world, $4::text::jsonb) AS tracked FROM (SELECT (
    SELECT safebyok_thing_record(to_jsonb(stored)) FROM ${table} AS stored
    WHERE  (stored.userid, stored.banklabel, stored.labelpath) = ($1::text, $2::text, $3::text)
  ) AS thing, safebyok_world($1::text, $2::text) AS world) AS fetched
`
}

// The labelpaths under a parent's lie between `<parent>/` and `<parent>0`, '0' being the byte after '/'; a child's has no further '/'.
function listThingsSqlOf(table: string): string {
  return `
  SELECT parent, children, world, safebyok_tracked(world, $4::text::jsonb) AS tracked FROM (SELECT (
    SELECT safebyok_thing_record(to_jsonb(stored)) FROM ${table} AS stored
    WHERE  (stored.userid, stored.banklabel, stored.labelpath) = ($1::text, $2::text, $3::text)
  ) AS parent, COALESCE((
    SELECT jsonb_agg(jsonb_build_object('labelpath', child.labelpath, 'raw', safebyok_thing_record(to_jsonb(child))) ORDER BY child.labelpath)
    FROM   ${table} AS child
    WHERE  ((child.userid, child.banklabel) = ($1::text, $2::text))
      AND  (child.labelpath >= ($3::text || '/'))
      AND  (child.labelpath <  ($3::text || '0'))
      AND  (strpos(substr(child.labelpath, length($3::text) + 2), '/') = 0)
  ), '[]'::jsonb) AS children, safebyok_world($1::text, $2::text) AS world) AS fetched
`
}
// --

// == [Writes]: WriteThingSql, BirthRootsSql

/** Each kind's write function, over the record ($1) and what it cites ($2), and how the world after compares with the track ($3); the gate's also takes the storage policies ($4). */
export const WriteThingSql: Readonly<Record<Thingkind, string>> = {
  bank: 'SELECT ok, thing, world, safebyok_tracked(world, $3::text::jsonb) AS tracked FROM safebyok_write_bank($1::text::jsonb, $2::text::jsonb)',
  gate: 'SELECT ok, thing, world, safebyok_tracked(world, $3::text::jsonb) AS tracked FROM safebyok_write_gate($1::text::jsonb, $2::text::jsonb, $4::text[])',
  box:  'SELECT ok, thing, world, safebyok_tracked(world, $3::text::jsonb) AS tracked FROM safebyok_write_box($1::text::jsonb, $2::text::jsonb)',
}

/** A bank's birth: its bank ($1), main gate ($2) and root box ($3), and how the roots after compare with the track ($4). */
export const BirthRootsSql = `
  SELECT ok, bank, gate, root, safebyok_tracked(jsonb_build_object('bank', bank, 'maingate', gate), $4::text::jsonb) AS tracked
  FROM   safebyok_birth_roots($1::text::jsonb, $2::text::jsonb, $3::text::jsonb)
`
// --
