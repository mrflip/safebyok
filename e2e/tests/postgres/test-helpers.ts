import { afterAll, afterEach, beforeAll, describe } from 'vitest'
import { Client, Pool } from 'pg'
import type { PoolConfig } from 'pg'
import { randomBytes } from 'node:crypto'
import { VaultChangeChannel, VaultNotifySql, VaultTablesSql, postgresVaultDB } from 'safebyok-postgres'
import type { PostgresListen } from 'safebyok-postgres'
import { boxOf, bundleOf, noBoxYet, perUser, scopeOf, throughTurnstile } from 'safebyok/testing'
import type { MakeVaultDBDevices, Turnstile, VaultDBVerbs } from 'safebyok/testing'

// Everything the core's tests use too, so a test here star-imports this one module as TH.
export * from 'safebyok/testing'

// ----------------------------------------------------------------------- which suites run, and where

/** The environment variable naming the Postgres these tests run against: a connection string for a role that may CREATE DATABASE. */
export const PgUrlVar = 'SAFEBYOK_PG_URL'

/** Every suite this directory has, by the name {@link OnRealPostgres} and {@link describeOnPostgres} know it. */
export type PostgresSuite = 'battery' | 'races' | 'hard cap' | 'foreign key'

/**
 * The suites that run against a real Postgres, when {@link PgUrlVar} names one: the whole
 * selection, in one place. The VaultDB battery and its races, the lockbox limit's real races and
 * the README's optional hard-cap trigger, and the `23503` case. Every other Postgres test stays
 * in `packages/safebyok-postgres`, over a PGlite, so `pnpm justify` needs no Docker. A suite added
 * to this directory is added to {@link PostgresSuite} and to this list; to run one more, list it.
 */
export const OnRealPostgres: readonly PostgresSuite[] = ['battery', 'races', 'hard cap', 'foreign key']

/** The connection string of the Postgres to run against, or undefined where there is none: every suite is then skipped. */
export const postgresUrl = (): string | undefined => {
  const url = process.env[PgUrlVar]
  return url === undefined || url === '' ? undefined : url
}

/** Whether `suite` runs in this environment: a Postgres is named, and the selection lists it. */
export const runsOnPostgres = (suite: PostgresSuite): boolean => postgresUrl() !== undefined && OnRealPostgres.includes(suite)

/**
 * A `describe` for `suite` that runs where {@link runsOnPostgres} says, and is skipped, with its
 * body unread, elsewhere.
 *
 * @example TH.describeOnPostgres('races', "two writers for a vault's last place", () => { it(...) })
 */
export const describeOnPostgres = (suite: PostgresSuite, title: string, body: () => void) => {
  describe.runIf(runsOnPostgres(suite))(title, () => { body() })
}

// ------------------------------------------------------------------------------- a database to a file

/** One test file's own database on the server, made for it and dropped after it. */
export type FileDatabase = {
  /** Its connection string. */
  url: string
  /** A pool over it, for what the test does as the host's own code: a transaction held open, a count, a truncate. Shared by the file. */
  host: Pool
  /** A pool of its own over it: one device's connections, ended with {@link FileDatabase.endDevices}. */
  devicePool: (config?: PoolConfig) => Pool
  /** A connection of its own to it, not from a pool, as a long-lived listener or a held transaction needs; ended with the devices. */
  client: () => Promise<Client>
  /** Empties both tables: a fresh backend for the next test. */
  empty: () => Promise<void>
  /** Ends every device pool and client made since the last call; waits for the statements in flight. */
  endDevices: () => Promise<void>
}

/** The connection string `url` has, naming `database` in place of its own. */
const urlNaming = (url: string, database: string): string => {
  const named = new URL(url)
  named.pathname = `/${database}`
  return named.href
}

/**
 * A database for this file alone, made in `beforeAll` -- its tables from `VaultTablesSql`, and the
 * notify triggers from `VaultNotifySql` -- and dropped in `afterAll`, so files run side by side
 * never share a table, a notification channel or a truncate. Call it once at the top of a file
 * whose suites run on {@link postgresUrl}; the result is filled once the file's tests begin.
 *
 * @example const getDb = TH.useFileDatabase()  // then `const db = getDb()` inside a test
 */
export const useFileDatabase = (): (() => FileDatabase) => {
  const url = postgresUrl()
  const made: { db?: FileDatabase, drop?: () => Promise<void> } = {}
  beforeAll(async () => {
    if (url === undefined) { return }
    const databaseName = `safebyok_e2e_${randomBytes(6).toString('hex')}`
    const admin = new Client({ connectionString: url })
    await admin.connect()
    await admin.query(`CREATE DATABASE ${databaseName}`)
    await admin.end()
    const fileUrl = urlNaming(url, databaseName)
    const host = new Pool({ connectionString: fileUrl, max: 4 })
    await host.query(VaultTablesSql)
    await host.query(VaultNotifySql)
    const devices: { end: () => Promise<void> }[] = []
    made.db = {
      url: fileUrl,
      host,
      devicePool: (config = {}) => {
        const pool = new Pool({ connectionString: fileUrl, ...config })
        devices.push({ end: () => pool.end() })
        return pool
      },
      client: async () => {
        const client = new Client({ connectionString: fileUrl })
        await client.connect()
        devices.push({ end: () => client.end() })
        return client
      },
      empty:      async () => { await host.query('TRUNCATE safebyok_lockboxes, safebyok_bundles') },
      endDevices: async () => { await Promise.all(devices.splice(0).map((device) => device.end())) },
    }
    made.drop = async () => {
      await made.db?.endDevices()
      await host.end()
      const dropper = new Client({ connectionString: url })
      await dropper.connect()
      await dropper.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`)
      await dropper.end()
    }
  }, 60_000)
  afterEach(async () => { await made.db?.endDevices() })
  afterAll(async () => { await made.drop?.() }, 60_000)
  return () => {
    if (made.db === undefined) { throw new Error(`No database: ${PgUrlVar} names none, or the file's tests have not begun.`) }
    return made.db
  }
}

// ----------------------------------------------------------------------------------------- listening

/**
 * A `listen` as the postgres README has it, over one connection of its own that LISTENs once,
 * when the first subscription asks, and hands its notifications to every subscriber. The
 * connection is ended with the file database's devices.
 */
export const listenOver = (db: FileDatabase): PostgresListen => {
  const hearers = new Set<(payload: string) => void>()
  let listening: Promise<void> | undefined
  const begin = async () => {
    const listener = await db.client()
    await listener.query(`LISTEN ${VaultChangeChannel}`)
    listener.on('notification', ({ channel, payload = '' }) => {
      if (channel === VaultChangeChannel) {
        for (const hear of hearers) { hear(payload) }
      }
    })
  }
  return async (_channel, onNotify) => {
    listening ??= begin()
    await listening
    hearers.add(onNotify)
    return () => { hearers.delete(onNotify) }
  }
}

// ---------------------------------------------------------------------------------------- the devices

/** What a device's pool is made with, besides its database: the isolation level its statements run under, where it is not Postgres's default. */
export type DeviceKind = {
  /** Each statement of this device's runs in a transaction at this isolation level; READ COMMITTED, Postgres's own, when omitted. */
  isolation?: 'repeatable read' | 'serializable' | undefined
}

/** Pool settings that make every statement run at `isolation`: the host's `default_transaction_isolation`, as a server's setting would. */
const poolConfigFor = ({ isolation }: DeviceKind): PoolConfig => {
  if (isolation === undefined) { return {} }
  const spaceEscaped = isolation.replace(' ', String.raw`\ `)
  return { options: `-c default_transaction_isolation=${spaceEscaped}` }
}

/**
 * One device over `db`: its own pool, its own listening connection, its postgresVaultDB signed in
 * as whomever a scope names, each round trip passing `turnstile`.
 *
 * @param db - The file's database.
 * @param turnstile - Where the race holds this device's round trips; omit for a device that races none.
 * @param deviceOpts - The lockbox limit to hold the device to; and `kind`, its pool's isolation level.
 */
export const deviceOver = (db: FileDatabase, turnstile: Turnstile | undefined, deviceOpts: { maxLockboxes?: number | undefined, kind?: DeviceKind } = {}) => {
  const { maxLockboxes, kind = {} } = deviceOpts
  const pool = db.devicePool(poolConfigFor(kind))
  const listenHere = listenOver(db)
  const client = turnstile === undefined ? pool : throughTurnstile(turnstile, pool, ['query'])
  const listen: PostgresListen = turnstile === undefined
    ? listenHere
    : async (channel, onNotify) => {
      await turnstile.pass()
      return await listenHere(channel, onNotify)
    }
  return (userId: string | null) => postgresVaultDB({ client, userId, listen, maxLockboxes })
}

/**
 * `makeDevices` for the battery's races: a fresh, emptied backend, and a device to each call, each
 * with a pool and a listener of its own, sharing nothing but the database, and each statement and
 * each listen passing the race's turnstile. The last race's devices are ended first.
 */
export const devicesOver = (getDb: () => FileDatabase): MakeVaultDBDevices => async (turnstile) => {
  const db = getDb()
  await db.endDevices()
  await db.empty()
  return ({ maxLockboxes }) => {
    const vaultDBFor = deviceOver(db, turnstile, { maxLockboxes })
    return perUser((userId) => vaultDBFor(userId))
  }
}

// --------------------------------------------------------------------------- what a host's own code does

/** Resolves once `check` holds, looking every few milliseconds; rejects after five seconds. */
export const eventually = async (check: () => boolean | Promise<boolean>): Promise<void> => {
  for (let ii = 0; ii < 500; ii += 1) {
    if (await check()) { return }
    await new Promise((resolve) => { setTimeout(resolve, 10) })
  }
  throw new Error('it never came to pass')
}

/** Resolves once some statement on the file's database is waiting for another's lock: a write held where a race wants it. */
export const untilStatementBlocked = async (db: FileDatabase): Promise<void> => {
  await eventually(async () => {
    const { rows } = await db.host.query("SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'")
    return (rows[0] as { waiting: number }).waiting > 0
  })
}

/** Makes the u1 vault the helpers' bundles stand for, through `vaultDB`, and writes a lockbox under each of `boxlabels`. */
export const filled = async (vaultDB: VaultDBVerbs, boxlabels: readonly string[]): Promise<void> => {
  await vaultDB.createBundle(bundleOf('u1'))
  for (const boxlabel of boxlabels) { await vaultDB.updateBox(scopeOf('u1'), boxOf(boxlabel, `sk-fake-${boxlabel}`), noBoxYet) }
}

/**
 * A lockbox written straight to the table, as a host's own code might, through `client`: a copy of
 * the u1 vault's lockbox `like`, under `boxlabel`. With `client` in a transaction not yet
 * committed, it is a write the adapter's next statement cannot see. The copy goes through a
 * temporary table so that it names no column, and follows the tables' shape wherever it goes.
 */
export const insertRawBox = async (client: Client, boxlabel: string, like: string): Promise<void> => {
  await client.query('CREATE TEMP TABLE raw_box ON COMMIT DROP AS SELECT * FROM safebyok_lockboxes WHERE boxlabel = $1', [like])
  await client.query("UPDATE raw_box SET boxlabel = $1, revision_id = 'rev-raw'", [boxlabel])
  await client.query('INSERT INTO safebyok_lockboxes SELECT * FROM raw_box')
}

/** How many lockboxes the u1 vault holds, counted straight from the table. */
export const lockboxesStanding = async (db: FileDatabase): Promise<number> => {
  const { rows } = await db.host.query('SELECT count(*)::int AS standing FROM safebyok_lockboxes')
  return (rows[0] as { standing: number }).standing
}

/** How a write settled, never rejecting: `landed`, or the kind it was refused with (`unknown` for none). */
export const outcomeOf = async (write: Promise<unknown>): Promise<{ kind: string }> => {
  try {
    await write
    return { kind: 'landed' }
  } catch (err) {
    const { kind } = (err ?? {}) as { kind?: unknown }
    return { kind: typeof kind === 'string' ? kind : 'unknown' }
  }
}
