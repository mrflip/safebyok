import { beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { postgresVaultDB } from '../src/index'
import type { PostgresClient, PostgresListen } from '../src/index'
import type { VaultDB, VaultScope, VaultValidators } from 'safebyok'
import { VaultNotifySql, VaultTablesSql } from '../src/vault-tables'

// Everything the core's tests use too, so a test here star-imports this one module as TH.
export * from 'safebyok/testing'

const made: { db?: Promise<PGlite> } = {}

/**
 * This test file's database: one PGlite, made once with {@link VaultTablesSql} and the optional
 * {@link VaultNotifySql} run in it. A PGlite takes seconds to start, so a file's tests share one
 * and {@link emptyDatabase} it.
 */
export const database = (): Promise<PGlite> => {
  made.db ??= madeDatabase()
  return made.db
}

const madeDatabase = async (): Promise<PGlite> => {
  const db = new PGlite()
  await db.exec(VaultTablesSql)
  await db.exec(VaultNotifySql)
  return db
}

/**
 * The most a file's PGlite may take to boot, in milliseconds. Its WebAssembly compiles cold on a
 * CI runner in eight seconds or more, past any test's timeout, so the boot is paid in a hook.
 */
export const BootMillis = 60_000

/**
 * Boots this file's database before its first test, under {@link BootMillis}, so no test is charged
 * for the boot and every test's own timeout still catches a real hang. Call it at the top of
 * every test file that touches the database.
 *
 * @example TH.bootDatabaseFirst()
 */
export const bootDatabaseFirst = (): void => {
  beforeAll(async () => { await database() }, BootMillis)
}

/**
 * A client over this file's database that sees none of the vault's tables: each statement runs
 * in a transaction whose search_path is a schema with nothing in it. For the database a host
 * forgot to make the tables in, without booting a second PGlite.
 */
export const tablelessClient = (db: PGlite): PostgresClient => ({
  query: (text, params) => db.transaction(async (tx) => {
    await tx.exec('CREATE SCHEMA IF NOT EXISTS tableless; SET LOCAL search_path TO tableless')
    return await tx.query(text, params)
  }),
})

/** This file's database, its tables emptied. */
export const emptyDatabase = async (): Promise<PGlite> => {
  const db = await database()
  await db.exec('TRUNCATE safebyok_lockboxes, safebyok_bundles')
  return db
}

/** A PGlite's own `listen`, as the README wires it. */
export const listenOn = (db: PGlite): PostgresListen => (channel, onNotify) => db.listen(channel, onNotify)

/** One statement a {@link spyClient} was handed. */
export type SentStatement = { text: string, params: unknown[] }

/**
 * A PostgresClient that passes each statement to `client` -- or, where `answer` says, answers it
 * itself -- and keeps every statement it was handed, in order.
 *
 * @example
 *   const spy = TH.spyClient(db)
 *   spy.sent.length  // 0, until the VaultDB asks something
 */
export const spyClient = (client: PostgresClient, answer?: (text: string) => Promise<{ rows: unknown[] }> | undefined) => {
  const sent: SentStatement[] = []
  const spied: PostgresClient = {
    query: async (text, params) => {
      sent.push({ text, params })
      return await (answer?.(text) ?? client.query(text, params))
    },
  }
  return { client: spied, sent }
}

/** A PostgresClient whose every statement rejects with `err`, as a driver does when the database is down. */
export const failingClient = (err: Error): PostgresClient => ({
  query: () => Promise.reject(err),
})

/** What `operation` rejected with; fails the test if it resolved. */
export const refusalOf = async (operation: Promise<unknown>): Promise<{ kind?: unknown, cause?: unknown, message?: unknown }> => {
  try {
    await operation
  } catch (err) {
    return err as { kind?: unknown }
  }
  throw new Error('the operation was not refused')
}

/** Resolves once `check` holds, looking every few milliseconds; rejects after a second. */
export const eventually = async (check: () => boolean): Promise<void> => {
  for (let ii = 0; ii < 200; ii += 1) {
    if (check()) { return }
    await new Promise((resolve) => { setTimeout(resolve, 5) })
  }
  throw new Error('it never came to pass')
}

/** Whether `onChange` got called, kept for a test to look at. */
export const changeCounter = () => {
  const heard = { count: 0 }
  return { heard, onChange: () => { heard.count += 1 } }
}

/**
 * A watch on `scope` through `vaultDB`, once it is live, its calls counted from then: a
 * postgresVaultDB with a listen calls once as the listen begins, and this resolves after that
 * call, the count back at zero.
 *
 * @example const { heard, unsubscribe } = await TH.liveWatch(TH.requestFor(db, 'u1'), TH.scopeOf('u1'))
 */
export const liveWatch = async (vaultDB: Pick<VaultDB, 'subscribe'>, scope: VaultScope, validators?: VaultValidators) => {
  const heard = { count: 0 }
  const unsubscribe = vaultDB.subscribe(scope, () => { heard.count += 1 }, validators)
  await eventually(() => heard.count > 0)
  heard.count = 0
  return { heard, unsubscribe }
}

/** The postgresVaultDB a request for `userId` makes over `db`, listening there. */
export const requestFor = (db: PGlite, userId: string | null) => postgresVaultDB({ client: db, userId, listen: listenOn(db) })
