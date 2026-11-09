/** This file's PGlite and the server over it, and the GraphQLVaultDBs and row backdoor the battery takes. */

import { afterAll, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { Client, cacheExchange, makeErrorResult, mapExchange } from '@urql/core'
import { executeExchange } from '@urql/exchange-execute'
import type { Operation } from '@urql/core'
import type { GraphQLSchema } from 'graphql'
import type { AdapterVaultDB, AdapterVaultDBOpts, Boxscope, VaultScope } from 'safebyok/storage'
import * as TH from 'safebyok/testing'
import { PostgresVaultDB, VaultTablesSql, vaultChannelOf } from 'safebyok-postgres'
import type { PostgresListen, PostgresVaultDBOpts } from 'safebyok-postgres'
import { GraphQLVaultDB } from '../src/index'
import { VaultSchemaSdl, vaultResolvers } from '../src/server'

// Everything the core's tests use too, so a test here star-imports this one module as TH.
export * from 'safebyok/testing'

// == [The database]: BootMillis, database, bootDatabaseFirst, emptyTables, listen

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

export const emptyTables = async (): Promise<void> => {
  const db = await database()
  await db.exec('TRUNCATE safebyok_vaults, safebyok_boxes')
}

const heedersOf = new Map<string, Set<(text: string) => void>>()

/** Listens on `channel` the first time it is asked, and never stops, as safebyok-postgres's README recipe does. */
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
// --

// == [The server]: TestContext, serverOver, schemaOver

/** What the test server's context holds for one request: the user its auth signed in, or null. */
export type TestContext = { user_id: string | null }

/** The server's PostgresVaultDB over this file's PGlite. */
export const serverOver = async (opts: Omit<PostgresVaultDBOpts, 'client'> = {}): Promise<PostgresVaultDB> => (
  new PostgresVaultDB({ listen, ...opts, client: await database() })
)

/** The GraphQL schema over `vaultDB`, each request signed in as its context says. */
export const schemaOver = (vaultDB: AdapterVaultDB): GraphQLSchema => makeExecutableSchema({
  typeDefs:  VaultSchemaSdl,
  resolvers: vaultResolvers({ vaultDB, userIdOf: ({ user_id }: TestContext) => user_id }),
})
// --

// == [The browser]: Signing, signedInAs, signedInAsAsked, browserOver

/** How a test Client signs each operation in: the context the server sees for it. */
export type Signing = (operation: Operation) => TestContext

/** Signs every operation in as `user_id`, or signed out for null. */
export const signedInAs = (user_id: string | null): Signing => () => ({ user_id })

/** Signs each operation in as the user it asks for, so the server's gate stays on and lets the battery's users through. */
export const signedInAsAsked: Signing = ({ variables }) => {
  const { user_id, record, tombstone, params } = variables as { user_id?: string } & Partial<Record<'record' | 'tombstone' | 'params', { user_id?: string }>>
  return { user_id: user_id ?? record?.user_id ?? tombstone?.user_id ?? params?.user_id ?? null }
}

/** A GraphQLVaultDB whose next query or mutation can be made to fail as a dropped connection does. */
export type FlakyVaultDB = GraphQLVaultDB & { failNext: () => void }

/** A GraphQLVaultDB over its own urql Client, run in-process against `schema`, with urql's document cache in front, as an app's Client has. */
export const browserOver = (schema: GraphQLSchema, signing: Signing = signedInAsAsked): FlakyVaultDB => {
  let isFailing = false
  const flaky = mapExchange({
    onResult: (result) => {
      if (! isFailing || result.operation.kind === 'subscription') { return result }
      isFailing = false
      return makeErrorResult(result.operation, new TypeError('Failed to fetch'))
    },
  })
  const client = new Client({
    url:       'https://app.example.test/api/graphql',
    exchanges: [cacheExchange, flaky, executeExchange({ schema, context: signing })],
  })
  return Object.assign(new GraphQLVaultDB({ client }), { failNext: () => { isFailing = true } })
}
// --

// == [The battery's VaultDBs]: makeVaultDB, makeTwin, adapterOf

const serversOf = new WeakMap<GraphQLVaultDB, { schema: GraphQLSchema, adapter: PostgresVaultDB }>()

/** A fresh browser's VaultDB over emptied tables, its server's VaultDB made with `opts` and at most `maxBoxes` boxes to a vault. */
export const makeVaultDB = async (opts: AdapterVaultDBOpts = {}, maxBoxes?: number): Promise<FlakyVaultDB> => {
  await emptyTables()
  const adapter = await serverOver({ ...opts, ...((maxBoxes !== undefined) && { maxBoxes }) })
  const schema = schemaOver(adapter)
  const vaultDB = browserOver(schema)
  serversOf.set(vaultDB, { schema, adapter })
  return vaultDB
}

/** The server a VaultDB makeVaultDB made talks to. */
const serverOf = (vaultDB: GraphQLVaultDB): { schema: GraphQLSchema, adapter: PostgresVaultDB } => {
  const server = serversOf.get(vaultDB)
  if (server === undefined) { throw new Error('This takes a VaultDB makeVaultDB or makeTwin made') }
  return server
}

/** A second browser's VaultDB over the same server, as another device holds. */
export const makeTwin = (vaultDB: GraphQLVaultDB): FlakyVaultDB => {
  const server = serverOf(vaultDB)
  const twin = browserOver(server.schema)
  serversOf.set(twin, server)
  return twin
}

/** The PostgresVaultDB behind a browser's VaultDB, for the battery's races. */
export const adapterOf = (vaultDB: GraphQLVaultDB): AdapterVaultDB => serverOf(vaultDB).adapter
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
