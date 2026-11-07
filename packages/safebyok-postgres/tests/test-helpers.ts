/** This file's PGlite, made once, and the PostgresVaultDBs and row backdoor the battery takes over it. */

import { afterAll, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import type { Boxscope, VaultDBOpts, VaultScope } from 'safebyok/storage'
import * as TH from 'safebyok/testing'
import { PostgresVaultDB, VaultTablesSql, vaultChannelOf } from '../src/index'
import type { PostgresClient, PostgresListen, PostgresVaultDBOpts } from '../src/index'

// Everything the core's tests use too, so a test here star-imports this one module as TH.
export * from 'safebyok/testing'

// == [The database]: BootMillis, database, bootDatabaseFirst

// A PGlite's WebAssembly compiles cold on a CI runner in eight seconds or more, past a test's timeout.
export const BootMillis = 60_000

const made: { db?: Promise<PGlite> } = {}

/** This file's PGlite, its tables made: one per file, as each takes seconds to boot. */
export const database = async (): Promise<PGlite> => {
  made.db ??= (async () => {
    const db = new PGlite()
    await db.exec(VaultTablesSql)
    // The battery's user is listened for at boot: a PGlite's own listen takes its turn behind the statements already
    // queued, so a write made just after a watch's first LISTEN would go unheard.
    await listenOn(db, vaultChannelOf(TH.bankScope.user_id))
    return db
  })()
  return await made.db
}

/** Boots this file's PGlite before its first test, and closes it after its last. */
export const bootDatabaseFirst = (): void => {
  beforeAll(async () => { await database() }, BootMillis)
  afterAll(async () => {
    const db = await database()
    await db.close()
  })
}
// --

// == [Stores]: FlakyClient, flakyClientOf, listen, storeOver, makeVaultDB, emptyTables, makeTwin, failNextCall

/** A client over a PGlite whose next statement can be made to fail as a dropped connection does. */
export type FlakyClient = PostgresClient & { failNext: () => void }

export const flakyClientOf = (db: PGlite): FlakyClient => {
  let isFailing = false
  const failure = (): Error => {
    isFailing = false
    return Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01', params: ['a row'] })
  }
  return {
    query:       async (text, params) => { if (isFailing) { throw failure() } return await db.query(text, params) },
    transaction: async (work) => { if (isFailing) { throw failure() } return await db.transaction(work) },
    failNext:    () => { isFailing = true },
  }
}

const heedersOf = new Map<string, Set<(text: string) => void>>()

/** Listens on `channel` the first time it is asked, and never stops, as the README's recipe does. */
const listenOn = async (db: PGlite, channel: string): Promise<Set<(text: string) => void>> => {
  const heeders = heedersOf.get(channel)
  if (heeders !== undefined) { return heeders }
  const fresh = new Set<(text: string) => void>()
  heedersOf.set(channel, fresh)
  // PGlite LISTENs on the identifier as given, so a channel keeps its case and characters only quoted; a user_id holds no `"`.
  await db.listen(`"${channel}"`, (text) => { for (const onNotify of fresh) { onNotify(text) } })
  return fresh
}

export const listen: PostgresListen = async (channel, onNotify) => {
  const heeders = heedersOf.get(channel) ?? await listenOn(await database(), channel)
  heeders.add(onNotify)
  return () => heeders.delete(onNotify)
}

const clientsOf = new WeakMap<PostgresVaultDB, FlakyClient>()
const optsOf = new WeakMap<PostgresVaultDB, StoreOpts>()

type StoreOpts = Omit<PostgresVaultDBOpts, 'client'>

/** A PostgresVaultDB over this file's PGlite, listening on it. */
export const storeOver = async (opts: StoreOpts = {}): Promise<PostgresVaultDB> => {
  const db = await database()
  const client = flakyClientOf(db)
  const vaultDB = new PostgresVaultDB({ listen, ...opts, client })
  clientsOf.set(vaultDB, client)
  optsOf.set(vaultDB, opts)
  return vaultDB
}

/** A fresh store over emptied tables. */
export const makeVaultDB = async (opts?: VaultDBOpts & { maxBoxes?: number }): Promise<PostgresVaultDB> => {
  await emptyTables()
  return await storeOver(opts)
}

export const emptyTables = async (): Promise<void> => {
  const db = await database()
  await db.exec('TRUNCATE safebyok_vaults, safebyok_boxes')
}

/** A second store over the same tables and opts as `vaultDB`, as another device holds. */
export const makeTwin = async (vaultDB: PostgresVaultDB): Promise<PostgresVaultDB> => await storeOver(optsOf.get(vaultDB))

export const failNextCall = (vaultDB: PostgresVaultDB): void => { clientsOf.get(vaultDB)?.failNext() }
// --

// == [Rows]: sql, rowsOf

/** The battery's backdoor to the rows in a PGlite, by SQL. */
const sql = async <RowT>(text: string, params: unknown[]): Promise<RowT[]> => {
  const db = await database()
  const { rows } = await db.query<RowT>(text, params)
  return rows
}

export const rowsOf = (): TH.VaultDBRowCheats => ({
  plantVaultRow: async ({ applabel, user_id, vaultlabel }: VaultScope, row: unknown) => {
    await sql(`INSERT INTO safebyok_vaults VALUES ($1, $2, $3, $4::text::jsonb)
      ON CONFLICT (applabel, user_id, vaultlabel) DO UPDATE SET vault = EXCLUDED.vault`, [applabel, user_id, vaultlabel, JSON.stringify(row)])
  },
  plantBoxRow: async ({ applabel, user_id, vaultlabel, boxlabel }: Boxscope, vault_tok: string, row: unknown) => {
    await sql(`INSERT INTO safebyok_boxes VALUES ($1, $2, $3, $4, $5, $6::text::jsonb)
      ON CONFLICT (applabel, user_id, vaultlabel, vault_tok, boxlabel) DO UPDATE SET box = EXCLUDED.box`, [applabel, user_id, vaultlabel, vault_tok, boxlabel, JSON.stringify(row)])
  },
  vaultRowOf: async ({ applabel, user_id, vaultlabel }: VaultScope) => {
    const rows = await sql<{ vault: unknown }>('SELECT vault FROM safebyok_vaults WHERE applabel = $1 AND user_id = $2 AND vaultlabel = $3', [applabel, user_id, vaultlabel])
    return rows[0]?.vault ?? null
  },
  boxRowsOf: async ({ applabel, user_id, vaultlabel }: VaultScope, vault_tok: string) => {
    const rows = await sql<{ boxlabel: string, box: unknown }>('SELECT boxlabel, box FROM safebyok_boxes WHERE applabel = $1 AND user_id = $2 AND vaultlabel = $3 AND vault_tok = $4', [applabel, user_id, vaultlabel, vault_tok])
    return new Map(rows.map(({ boxlabel, box }) => [boxlabel, box]))
  },
})
// --
