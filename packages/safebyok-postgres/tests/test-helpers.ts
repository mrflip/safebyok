/** Test helpers: one PGlite per test file, PostgresVaultDBs on it, and direct row access for the VaultDB battery. */

import { afterAll, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import type { AdapterVaultDBOpts, Boxscope, VaultScope } from 'safebyok/storage'
import * as TH from 'safebyok/testing'
import { PostgresVaultDB, VaultFunctionsSql, VaultTablesSql, vaultChannelOf } from '../src/index'
import type { PostgresClient, PostgresListen, PostgresVaultDBOpts } from '../src/index'

// Re-export the core's test helpers, so a test here imports this one module as TH.
export * from 'safebyok/testing'

// == [The database]: BootMillis, database, bootDatabaseFirst

// On a CI runner, PGlite's WebAssembly can take eight seconds or more to compile from cold, longer than a test's default timeout.
export const BootMillis = 60_000

const made: { db?: Promise<PGlite> } = {}

/** Return this test file's PGlite with its tables created. One is shared per file, because each takes seconds to boot. */
export async function database(): Promise<PGlite> {
  made.db ??= (async () => {
    const db = new PGlite()
    await db.exec(VaultTablesSql)
    await db.exec(VaultFunctionsSql)
    // Listen on the battery user's channel at boot. PGlite queues a LISTEN behind the statements already waiting,
    // so a write made right after a watch's first LISTEN would be missed.
    await listenOn(db, vaultChannelOf(TH.bankScope.user_id))
    return db
  })()
  return await made.db
}

/** Boot this file's PGlite before its first test, and close it after its last. */
export function bootDatabaseFirst(): void {
  beforeAll(async () => { await database() }, BootMillis)
  afterAll(async () => {
    const db = await database()
    await db.close()
  })
}
// --

// == [VaultDBs]: FlakyClient, flakyClientOf, listen, vaultDBOver, makeVaultDB, emptyTables, makeTwin, failNextCall

/** A PGlite client whose next statement can be made to fail like a dropped connection. */
export type FlakyClient = PostgresClient & { failNext: () => void }

export function flakyClientOf(db: PGlite): FlakyClient {
  let isFailing = false
  function failure(): Error {
    isFailing = false
    return Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01', params: ['a row'] })
  }
  return {
    query:       async (text, params) => { if (isFailing) { throw failure() } return await db.query(text, params) },
    transaction: async (work) => { if (isFailing) { throw failure() } return await db.transaction(work) },
    failNext:    () => { isFailing = true },
  }
}

const listenersOf = new Map<string, Set<(text: string) => void>>()

/** Start listening on `channel` the first time it is asked for, and never stop, like the README's recipe. Returns the channel's set of callbacks. */
async function listenOn(db: PGlite, channel: string): Promise<Set<(text: string) => void>> {
  const listeners = listenersOf.get(channel)
  if (listeners !== undefined) { return listeners }
  const fresh = new Set<(text: string) => void>()
  listenersOf.set(channel, fresh)
  // PGlite uses the channel identifier as written, so it must be quoted to keep its case and punctuation. A user_id never contains `"`.
  await db.listen(`"${channel}"`, (text) => { for (const onNotify of fresh) { onNotify(text) } })
  return fresh
}

export const listen: PostgresListen = async (channel, onNotify) => {
  const listeners = listenersOf.get(channel) ?? await listenOn(await database(), channel)
  listeners.add(onNotify)
  return () => listeners.delete(onNotify)
}

const clientsOf = new WeakMap<PostgresVaultDB, FlakyClient>()
const optsOf = new WeakMap<PostgresVaultDB, VaultDBOverOpts>()

type VaultDBOverOpts = Omit<PostgresVaultDBOpts, 'client'>

/** Make a PostgresVaultDB on this file's PGlite, with `listen` wired up. */
export async function vaultDBOver(opts: VaultDBOverOpts = {}): Promise<PostgresVaultDB> {
  const db = await database()
  const client = flakyClientOf(db)
  const vaultDB = new PostgresVaultDB({ listen, ...opts, client })
  clientsOf.set(vaultDB, client)
  optsOf.set(vaultDB, opts)
  return vaultDB
}

/** Empty the tables and make a new VaultDB. */
export async function makeVaultDB(opts?: AdapterVaultDBOpts & { maxBoxes?: number }): Promise<PostgresVaultDB> {
  await emptyTables()
  return await vaultDBOver(opts)
}

export async function emptyTables(): Promise<void> {
  const db = await database()
  await db.exec('TRUNCATE safebyok_vaults, safebyok_boxes')
}

/** Make a second VaultDB on the same tables with the same opts as `vaultDB`, to act as another device. */
export const makeTwin = async (vaultDB: PostgresVaultDB): Promise<PostgresVaultDB> => await vaultDBOver(optsOf.get(vaultDB))

export const failNextCall = (vaultDB: PostgresVaultDB): void => { clientsOf.get(vaultDB)?.failNext() }
// --

// == [Rows]: sql, recordOf, rowsOf

/** Run SQL directly against the PGlite, for the battery's row checks. */
async function sql<RowT>(text: string, params: unknown[]): Promise<RowT[]> {
  const db = await database()
  const { rows } = await db.query<RowT>(text, params)
  return rows
}

/** The record a table row was stored from: each column a field, a null column left out. */
function recordOf(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([, val]) => val !== null))
}

// A vault row is planted by an upsert, never a delete and an insert: deleting a vault row deletes its box rows.
const PlantVaultSql = `
  INSERT INTO safebyok_vaults
  SELECT * FROM jsonb_populate_record(NULL::safebyok_vaults, $4::text::jsonb || jsonb_build_object('applabel', $1::text, 'user_id', $2::text, 'vaultlabel', $3::text))
  ON CONFLICT (applabel, user_id, vaultlabel)
  DO UPDATE SET (fmt, am, revision_tok, revision_seq, registered_at, written_at, vault_tok, gate)
    = (EXCLUDED.fmt, EXCLUDED.am, EXCLUDED.revision_tok, EXCLUDED.revision_seq, EXCLUDED.registered_at, EXCLUDED.written_at, EXCLUDED.vault_tok, EXCLUDED.gate)
`
const UnplantBoxSql = 'DELETE FROM safebyok_boxes WHERE applabel = $1 AND user_id = $2 AND vaultlabel = $3 AND vault_tok = $4 AND boxlabel = $5'
const PlantBoxSql = `
  INSERT INTO safebyok_boxes
  SELECT * FROM jsonb_populate_record(NULL::safebyok_boxes, $6::text::jsonb
    || jsonb_build_object('applabel', $1::text, 'user_id', $2::text, 'vaultlabel', $3::text, 'vault_tok', $4::text, 'boxlabel', $5::text))
`

/** The tables' rows, past the adapter: plant one, or read what is stored, with SQL of its own.
 * A planted row's address is the scope's, whatever the row names, and a field with no column is dropped.
 * The tables refuse a row that is no object, one missing a field every row has, a number field that is no integer, and a box row with no vault row at its scope.
 */
export function rowsOf(): TH.VaultDBRowCheats {
  return {
    plantVaultRow: async ({ applabel, user_id, vaultlabel }: VaultScope, row: unknown) => {
      await sql(PlantVaultSql, [applabel, user_id, vaultlabel, JSON.stringify(row)])
    },
    plantBoxRow: async ({ applabel, user_id, vaultlabel, boxlabel }: Boxscope, vault_tok: string, row: unknown) => {
      const address = [applabel, user_id, vaultlabel, vault_tok, boxlabel]
      await sql(UnplantBoxSql, address)
      await sql(PlantBoxSql, [...address, JSON.stringify(row)])
    },
    vaultRowOf: async ({ applabel, user_id, vaultlabel }: VaultScope) => {
      const rows = await sql<{ vault: Record<string, unknown> }>(
        'SELECT to_jsonb(stored) AS vault FROM safebyok_vaults AS stored WHERE applabel = $1 AND user_id = $2 AND vaultlabel = $3', [applabel, user_id, vaultlabel],
      )
      return (rows[0] === undefined) ? null : recordOf(rows[0].vault)
    },
    boxRowsOf: async ({ applabel, user_id, vaultlabel }: VaultScope, vault_tok: string) => {
      const rows = await sql<{ boxlabel: string, box: Record<string, unknown> }>(
        'SELECT boxlabel, to_jsonb(stored) AS box FROM safebyok_boxes AS stored WHERE applabel = $1 AND user_id = $2 AND vaultlabel = $3 AND vault_tok = $4', [applabel, user_id, vaultlabel, vault_tok],
      )
      return new Map(rows.map(({ boxlabel, box }) => [boxlabel, recordOf(box)]))
    },
  }
}
// --
