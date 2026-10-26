import { beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { postgresVaultDB } from '../src/index'
import type { PostgresClient, PostgresListen } from '../src/index'
import type { VaultDBOpts } from 'safebyok'
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

/**
 * The roles {@link roleClient} sends as, made once in this file's database. Each may keep its
 * vault props and its tombstone (a vault's birth writes both) and read every box;
 * `safebyok_reader` lacks the privilege to write a box, and `safebyok_viewer` holds it, but no
 * row-level security policy lets it insert or change one.
 */
export type GuestRole = 'safebyok_reader' | 'safebyok_viewer'

const GuestRolesSql = `DO $$ BEGIN
    CREATE ROLE safebyok_reader NOLOGIN;
    CREATE ROLE safebyok_viewer NOLOGIN;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;
  GRANT SELECT, INSERT, UPDATE, DELETE ON safebyok_vaults TO safebyok_reader, safebyok_viewer;
  GRANT SELECT, INSERT, UPDATE, DELETE ON safebyok_vault_tombstones TO safebyok_reader, safebyok_viewer;
  GRANT SELECT ON safebyok_boxes TO safebyok_reader;
  GRANT SELECT, INSERT, UPDATE, DELETE ON safebyok_boxes TO safebyok_viewer;
  DROP POLICY IF EXISTS guests ON safebyok_vaults;
  DROP POLICY IF EXISTS guests ON safebyok_vault_tombstones;
  DROP POLICY IF EXISTS guests ON safebyok_boxes;
  CREATE POLICY guests ON safebyok_vaults TO safebyok_reader, safebyok_viewer USING (true) WITH CHECK (true);
  CREATE POLICY guests ON safebyok_vault_tombstones TO safebyok_reader, safebyok_viewer USING (true) WITH CHECK (true);
  CREATE POLICY guests ON safebyok_boxes FOR SELECT TO safebyok_reader, safebyok_viewer USING (true);`

/**
 * A client over this file's database whose every statement runs as `role` (a {@link GuestRole}),
 * in a transaction of its own, where the tables' owner runs every other: for the database
 * refusing a call by its own rules, without booting a second PGlite.
 *
 * @example TH.roleClient(db, 'safebyok_reader')  // reads; a box write fails with 42501
 */
export const roleClient = async (db: PGlite, role: GuestRole): Promise<PostgresClient> => {
  await db.exec(GuestRolesSql)
  return {
    query: (text, params) => db.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE ${role}`)
      return await tx.query(text, params)
    }),
  }
}

/** This file's database, its tables emptied. */
export const emptyDatabase = async (): Promise<PGlite> => {
  const db = await database()
  await db.exec('TRUNCATE safebyok_boxes, safebyok_vaults, safebyok_vault_tombstones')
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

/** The postgresVaultDB a request for `user_id` makes over `db`, listening there. */
export const requestFor = (db: PGlite, user_id: string | null, vaultDBOpts: VaultDBOpts = {}) => postgresVaultDB({ ...vaultDBOpts, client: db, user_id, listen: listenOn(db) })
