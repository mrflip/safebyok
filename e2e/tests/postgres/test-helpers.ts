/** A real Postgres for this directory's tests: a database to a file, the PostgresVaultDBs over it, and the battery's backdoor to its rows. */

import { afterAll, afterEach, beforeAll, describe } from 'vitest'
import { Client, Pool, escapeIdentifier } from 'pg'
import type { Boxscope, VaultScope } from 'safebyok/storage'
import * as TH from 'safebyok/testing'
import { PostgresVaultDB, VaultTablesSql, pgClientOf, vaultChannelOf } from 'safebyok-postgres'
import type { PostgresListen, PostgresVaultDBOpts } from 'safebyok-postgres'

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
  /** A pool of its own over it, as one server holds; ended with {@link FileDatabase.endDevices}. */
  devicePool: () => Pool
  /** A connection of its own to it, as a listener holds; ended with the devices. */
  client: () => Promise<Client>
  /** Empties both tables. */
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
export const useFileDatabase = (): (() => FileDatabase) => {
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
    await host.query(VaultTablesSql)
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
      empty:      async () => { await host.query('TRUNCATE safebyok_vaults, safebyok_boxes') },
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

// == [Stores]: listenOver, StoreOpts, storeOver, freshStore

/** A `listen` as the package's README has it, over a connection of its own, already listening for the battery's user. */
export const listenOver = async (db: FileDatabase): Promise<PostgresListen> => {
  const heedersOf = new Map<string, Set<(text: string) => void>>()
  const listener = await db.client()
  listener.on('notification', ({ channel, payload = '' }) => {
    const heeders = heedersOf.get(channel) ?? []
    for (const onNotify of heeders) { onNotify(payload) }
  })
  const listen: PostgresListen = async (channel, onNotify) => {
    const heeders = heedersOf.get(channel) ?? new Set()
    if (! heedersOf.has(channel)) {
      heedersOf.set(channel, heeders)
      try {
        await listener.query(`LISTEN ${escapeIdentifier(channel)}`)
      } catch (err) {
        heedersOf.delete(channel)
        throw err
      }
    }
    heeders.add(onNotify)
    return () => heeders.delete(onNotify)
  }
  // A watch's first LISTEN races the writes made just after it, so the battery's user is listened for before any watch.
  const unlisten = await listen(vaultChannelOf(TH.bankScope.user_id), () => undefined)
  unlisten()
  return listen
}

export type StoreOpts = Omit<PostgresVaultDBOpts, 'client' | 'listen'>

/** A PostgresVaultDB over `db` as one server holds it: a pool and a listener of its own. */
export const storeOver = async (db: FileDatabase, opts: StoreOpts = {}): Promise<PostgresVaultDB> => (
  new PostgresVaultDB({ ...opts, client: pgClientOf(db.devicePool()), listen: await listenOver(db) })
)

/** A store over `db` once the last test's stores are ended and the tables emptied. */
export const freshStore = async (db: FileDatabase, opts: StoreOpts = {}): Promise<PostgresVaultDB> => {
  await db.endDevices()
  await db.empty()
  return await storeOver(db, opts)
}
// --

// == [Rows]: rowsOf

/** The battery's backdoor to the rows in `db`, by SQL on the host's pool. */
export const rowsOf = (db: FileDatabase): TH.VaultDBRowCheats => ({
  plantVaultRow: async ({ applabel, user_id, vaultlabel }: VaultScope, row: unknown) => {
    await db.host.query(`INSERT INTO safebyok_vaults VALUES ($1, $2, $3, $4::text::jsonb)
      ON CONFLICT (applabel, user_id, vaultlabel) DO UPDATE SET vault = EXCLUDED.vault`, [applabel, user_id, vaultlabel, JSON.stringify(row)])
  },
  plantBoxRow: async ({ applabel, user_id, vaultlabel, boxlabel }: Boxscope, vault_tok: string, row: unknown) => {
    await db.host.query(`INSERT INTO safebyok_boxes VALUES ($1, $2, $3, $4, $5, $6::text::jsonb)
      ON CONFLICT (applabel, user_id, vaultlabel, vault_tok, boxlabel) DO UPDATE SET box = EXCLUDED.box`, [applabel, user_id, vaultlabel, vault_tok, boxlabel, JSON.stringify(row)])
  },
  vaultRowOf: async ({ applabel, user_id, vaultlabel }: VaultScope) => {
    const { rows } = await db.host.query<{ vault: unknown }>('SELECT vault FROM safebyok_vaults WHERE applabel = $1 AND user_id = $2 AND vaultlabel = $3', [applabel, user_id, vaultlabel])
    return rows[0]?.vault ?? null
  },
  boxRowsOf: async ({ applabel, user_id, vaultlabel }: VaultScope, vault_tok: string) => {
    const { rows } = await db.host.query<{ boxlabel: string, box: unknown }>('SELECT boxlabel, box FROM safebyok_boxes WHERE applabel = $1 AND user_id = $2 AND vaultlabel = $3 AND vault_tok = $4', [applabel, user_id, vaultlabel, vault_tok])
    return new Map(rows.map(({ boxlabel, box }) => [boxlabel, box]))
  },
})
// --
