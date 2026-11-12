/** A real Postgres for this directory's tests and safebyok-graphql's: a database to a file, the PostgresBankDBs over it, and the battery's backdoor to its rows. */

import { afterAll, afterEach, beforeAll, describe } from 'vitest'
import { Client, Pool, escapeIdentifier } from 'pg'
import type { BankScope, Boxscope, VaultScope } from 'safebyok/storage'
import * as TH from 'safebyok/testing'
import { BankFunctionsSql, BankTablesSql, PostgresBankDB, bankChannelOf, pgClientOf } from 'safebyok-postgres'
import type { PostgresBankDBOpts, PostgresListen } from 'safebyok-postgres'

// Everything the core's tests use too, so a test here star-imports this one module as TH.
export * from 'safebyok/testing'

// == [Which suites run]: PgUrlVar, PostgresSuite, OnRealPostgres, postgresUrl, runsOnPostgres, describeOnPostgres

/** The environment variable naming the Postgres these tests run against: a connection string for a role that may CREATE DATABASE. */
export const PgUrlVar = 'SAFEBYOK_PG_URL'

/** Every suite this directory has, by the name {@link describeOnPostgres} knows it. */
export type PostgresSuite = 'battery' | 'races' | 'graphql'

/** The suites that run against a real Postgres when {@link PgUrlVar} names one; every other Postgres test runs over a PGlite in the package. */
export const OnRealPostgres: readonly PostgresSuite[] = ['battery', 'races', 'graphql']

/** The connection string of the Postgres to run against, or undefined where there is none, which skips every suite. */
export const postgresUrl = (): string | undefined => {
  const url = process.env[PgUrlVar]
  return (url === undefined || url === '') ? undefined : url
}

/** Whether `suite` runs here: a Postgres is named, and {@link OnRealPostgres} lists it. */
export const runsOnPostgres = (suite: PostgresSuite): boolean => (postgresUrl() !== undefined) && OnRealPostgres.includes(suite)

/** A `describe` for `suite` that runs where {@link runsOnPostgres} says, and is skipped elsewhere: `TH.describeOnPostgres('races', "...", () => { ... })`. */
export const describeOnPostgres = (suite: PostgresSuite, title: string, body: () => void): void => {
  describe.runIf(runsOnPostgres(suite))(title, () => { body() })
}
// --

// == [A database to a file]: FileDatabase, randomHex, useFileDatabase

/** One test file's own database on the server, made for it and dropped after it. */
export type FileDatabase = {
  /** A pool over it for what the test does as the host's own code: plant a row, count, empty. Shared by the file. */
  host: Pool
  /** A pool of its own over it, as one server has; ended with {@link FileDatabase.endDevices}. */
  devicePool: () => Pool
  /** A connection of its own to it, as a listener has; ended with the devices. */
  client: () => Promise<Client>
  /** Empties every table. */
  empty: () => Promise<void>
  /** Ends every pool and connection made since the last call. */
  endDevices: () => Promise<void>
}

/** `byteCount` random bytes as lowercase hex, for a database name no file running beside this one will pick. */
export const randomHex = (byteCount: number): string => (
  Array.from(crypto.getRandomValues(new Uint8Array(byteCount)), (byte) => byte.toString(16).padStart(2, '0')).join('')
)

const urlNaming = (url: string, database: string): string => {
  const named = new URL(url)
  named.pathname = `/${database}`
  return named.href
}

/** A database for this file alone, its tables made, created before its first test and dropped after its last: `const getDb = TH.useFileDatabase()`. */
export function useFileDatabase(): () => FileDatabase {
  const url = postgresUrl()
  const made: { db?: FileDatabase, drop?: () => Promise<void> } = {}
  // A pool or client with no 'error' listener crashes the run when the server drops it; heard, the drop fails the test it fell in.
  const dropped: Error[] = []
  type PgEmitter = { on: (event: 'error', listener: (err: Error) => void) => unknown }
  const watched = <EmitterT extends PgEmitter>(emitter: EmitterT): EmitterT => {
    emitter.on('error', (err) => { dropped.push(err) })
    return emitter
  }

  beforeAll(async () => {
    if (url === undefined) { return }
    const databaseName = `safebyok_e2e_${randomHex(6)}`
    const admin = watched(new Client({ connectionString: url }))
    await admin.connect()
    try {
      await admin.query(`CREATE DATABASE ${databaseName}`)
    } finally {
      await admin.end()
    }
    const fileUrl = urlNaming(url, databaseName)
    const host = watched(new Pool({ connectionString: fileUrl, max: 4 }))
    // Set before anything else can fail, so a setup that throws still ends the pool and drops the database.
    made.drop = async () => {
      await made.db?.endDevices()
      await host.end()
      const dropper = watched(new Client({ connectionString: url }))
      await dropper.connect()
      try {
        await dropper.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`)
      } finally {
        await dropper.end()
      }
    }
    await host.query(BankTablesSql)
    await host.query(BankFunctionsSql)
    const devices: { end: () => Promise<void> }[] = []
    made.db = {
      host,
      devicePool: () => {
        const pool = watched(new Pool({ connectionString: fileUrl }))
        devices.push({ end: () => pool.end() })
        return pool
      },
      client: async () => {
        const client = watched(new Client({ connectionString: fileUrl }))
        await client.connect()
        devices.push({ end: () => client.end() })
        return client
      },
      empty:      async () => { await host.query('TRUNCATE safebyok_boxes, safebyok_vaults, safebyok_gates, safebyok_banks') },
      endDevices: async () => { await Promise.all(devices.splice(0).map((device) => device.end())) },
    }
  }, 60_000)

  afterEach(async () => {
    const [ended] = await Promise.allSettled([made.db?.endDevices()])
    const lost = dropped.splice(0)
    if (lost.length > 0) { throw new Error(`The server dropped a connection during this test: ${lost.map((err) => err.message).join('; ')}`, { cause: lost[0] }) }
    if (ended.status === 'rejected') { throw ended.reason }
  })

  afterAll(async () => { await made.drop?.() }, 60_000)

  return () => {
    if (made.db === undefined) { throw new Error(`No database: ${PgUrlVar} names none, or the file's tests have not begun.`) }
    return made.db
  }
}
// --

// == [Listening]: listenOver

/** A `listen` as the package's README has it, over a connection of its own, already listening for the batteries' users. */
export const listenOver = async (db: FileDatabase): Promise<PostgresListen> => {
  const listenersOf = new Map<string, Set<(text: string) => void>>()
  const listener = await db.client()
  listener.on('notification', ({ channel, payload = '' }) => {
    const listeners = listenersOf.get(channel) ?? []
    for (const onNotify of listeners) { onNotify(payload) }
  })
  const listen: PostgresListen = async (channel, onNotify) => {
    const listeners = listenersOf.get(channel) ?? new Set()
    if (! listenersOf.has(channel)) {
      listenersOf.set(channel, listeners)
      try {
        await listener.query(`LISTEN ${escapeIdentifier(channel)}`)
      } catch (err) {
        listenersOf.delete(channel)
        throw err
      }
    }
    listeners.add(onNotify)
    return () => listeners.delete(onNotify)
  }
  // A watch's first LISTEN races the writes made just after it, so the batteries' users are listened for before any watch.
  const user_ids = new Set([TH.BW.bankScope.user_id, TH.bankScope.user_id])
  for (const user_id of user_ids) {
    const unlisten = await listen(bankChannelOf(user_id), () => undefined)
    unlisten()
  }
  return listen
}
// --

// == [BankDBs]: BankDBOverOpts, bankDBOver, freshBankDB

export type BankDBOverOpts = Omit<PostgresBankDBOpts, 'client' | 'listen'>

/** A PostgresBankDB over `db` as one server has it: a pool and a listener of its own. */
export async function bankDBOver(db: FileDatabase, opts: BankDBOverOpts = {}): Promise<PostgresBankDB> {
  return new PostgresBankDB({ ...opts, client: pgClientOf(db.devicePool()), listen: await listenOver(db) })
}

/** A bankDB over `db` once the last test's bankDBs are ended and the tables emptied. */
export async function freshBankDB(db: FileDatabase, opts: BankDBOverOpts = {}): Promise<PostgresBankDB> {
  await db.endDevices()
  await db.empty()
  return await bankDBOver(db, opts)
}
// --

// == [Bank rows]: recordOf, planting, bankRowsOf

/** The record a table row was stored from: each column a field, a null column left out. */
const recordOf = (row: Record<string, unknown>): Record<string, unknown> => (
  Object.fromEntries(Object.entries(row).filter(([, val]) => val !== null))
)

/** Run a plant's statements in one transaction on the host's pool, with the foreign keys unchecked: a planted row need not stand under a bank row. The role must be a superuser. */
async function planting(db: FileDatabase, statements: [string, unknown[]][]): Promise<void> {
  await pgClientOf(db.host).transaction(async (tx) => {
    await tx.query('SET LOCAL session_replication_role = replica')
    for (const [text, params] of statements) { await tx.query(text, params) }
  })
}

// A bank row is planted by an upsert, never a delete and an insert, so the rows under it stay.
const PlantBankSql = `
  INSERT INTO safebyok_banks
  SELECT * FROM jsonb_populate_record(NULL::safebyok_banks, $3::text::jsonb || jsonb_build_object('user_id', $1::text, 'banklabel', $2::text))
  ON CONFLICT (user_id, banklabel)
  DO UPDATE SET (fmt, am, revision_tok, revision_seq, registered_at, written_at, bank_tok)
    = (EXCLUDED.fmt, EXCLUDED.am, EXCLUDED.revision_tok, EXCLUDED.revision_seq, EXCLUDED.registered_at, EXCLUDED.written_at, EXCLUDED.bank_tok)
`
const UnplantGateSql = 'DELETE FROM safebyok_gates WHERE (user_id, banklabel, gatelabel) = ($1, $2, $3)'
const PlantGateSql = `
  INSERT INTO safebyok_gates
  SELECT * FROM jsonb_populate_record(NULL::safebyok_gates, $4::text::jsonb || jsonb_build_object('user_id', $1::text, 'banklabel', $2::text, 'gatelabel', $3::text))
`
const UnplantBankVaultSql = 'DELETE FROM safebyok_vaults WHERE (user_id, banklabel, vaultlabel) = ($1, $2, $3)'
const PlantBankVaultSql = `
  INSERT INTO safebyok_vaults
  SELECT * FROM jsonb_populate_record(NULL::safebyok_vaults, $4::text::jsonb || jsonb_build_object('user_id', $1::text, 'banklabel', $2::text, 'vaultlabel', $3::text))
`
// A box row's life is part of its address. A planted row that names a life of its own is stored under that life, as a store keyed by scope alone would hold it.
const BankBoxRowSql = `
  jsonb_build_object('bank_tok', $4::text, 'vault_tok', $5::text) || $7::text::jsonb
  || jsonb_build_object('user_id', $1::text, 'banklabel', $2::text, 'vaultlabel', $3::text, 'boxlabel', $6::text)
`
const UnplantBankBoxSql = `
  DELETE FROM safebyok_boxes AS box
  USING  jsonb_populate_record(NULL::safebyok_boxes, ${BankBoxRowSql}) AS planted
  WHERE  (box.user_id, box.banklabel, box.vaultlabel, box.bank_tok, box.vault_tok, box.boxlabel)
       = (planted.user_id, planted.banklabel, planted.vaultlabel, planted.bank_tok, planted.vault_tok, planted.boxlabel)
`
const PlantBankBoxSql = `INSERT INTO safebyok_boxes SELECT * FROM jsonb_populate_record(NULL::safebyok_boxes, ${BankBoxRowSql})`

/** The first row `text` finds in `db`, as the record it was stored from, or null for none. */
async function recordFound(db: FileDatabase, text: string, params: unknown[]): Promise<Record<string, unknown> | null> {
  const { rows } = await db.host.query<{ row: Record<string, unknown> }>(text, params)
  return (rows[0] === undefined) ? null : recordOf(rows[0].row)
}

/** The bankDB battery's backdoor to the rows in `db`, by SQL on the host's pool.
 * A planted row's address is the scope's, whatever the row names, except a box row's life, and a field with no column is dropped.
 * The tables refuse a row that is no object, one missing a field every row has, and a number field that is no integer.
 */
export function bankRowsOf(db: FileDatabase): TH.BankDBRowCheats {
  return {
    plantBankRow: async ({ user_id, banklabel }: BankScope, row: unknown) => {
      await planting(db, [[PlantBankSql, [user_id, banklabel, JSON.stringify(row)]]])
    },
    plantGateRow: async ({ user_id, banklabel, gatelabel }: BankScope & { gatelabel: string }, row: unknown) => {
      const address = [user_id, banklabel, gatelabel]
      await planting(db, [[UnplantGateSql, address], [PlantGateSql, [...address, JSON.stringify(row)]]])
    },
    plantVaultRow: async ({ user_id, banklabel, vaultlabel }: VaultScope, row: unknown) => {
      const address = [user_id, banklabel, vaultlabel]
      await planting(db, [[UnplantBankVaultSql, address], [PlantBankVaultSql, [...address, JSON.stringify(row)]]])
    },
    plantBoxRow: async ({ user_id, banklabel, vaultlabel, boxlabel }: Boxscope, bank_tok: string, vault_tok: string, row: unknown) => {
      const params = [user_id, banklabel, vaultlabel, bank_tok, vault_tok, boxlabel, JSON.stringify(row)]
      await planting(db, [[UnplantBankBoxSql, params], [PlantBankBoxSql, params]])
    },
    bankRowOf: async ({ user_id, banklabel }: BankScope) => await recordFound(
      db, 'SELECT to_jsonb(stored) AS row FROM safebyok_banks AS stored WHERE (user_id, banklabel) = ($1, $2)', [user_id, banklabel],
    ),
    gateRowOf: async ({ user_id, banklabel, gatelabel }: BankScope & { gatelabel: string }) => await recordFound(
      db, 'SELECT to_jsonb(stored) AS row FROM safebyok_gates AS stored WHERE (user_id, banklabel, gatelabel) = ($1, $2, $3)', [user_id, banklabel, gatelabel],
    ),
    vaultRowOf: async ({ user_id, banklabel, vaultlabel }: VaultScope) => await recordFound(
      db, 'SELECT to_jsonb(stored) AS row FROM safebyok_vaults AS stored WHERE (user_id, banklabel, vaultlabel) = ($1, $2, $3)', [user_id, banklabel, vaultlabel],
    ),
    boxRowsOf: async ({ user_id, banklabel, vaultlabel }: VaultScope, bank_tok: string, vault_tok: string) => {
      const { rows } = await db.host.query<{ boxlabel: string, row: Record<string, unknown> }>(
        'SELECT boxlabel, to_jsonb(stored) AS row FROM safebyok_boxes AS stored WHERE (user_id, banklabel, vaultlabel, bank_tok, vault_tok) = ($1, $2, $3, $4, $5)',
        [user_id, banklabel, vaultlabel, bank_tok, vault_tok],
      )
      return new Map(rows.map(({ boxlabel, row }) => [boxlabel, recordOf(row)]))
    },
  }
}
// --
