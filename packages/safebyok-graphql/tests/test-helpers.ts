/** Test helpers: one PGlite per test file, a GraphQL server on it, GraphQLVaultDBs that call that server, and direct row access for the VaultDB battery. */

import { afterAll, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { Client, cacheExchange, makeErrorResult, mapExchange } from '@urql/core'
import { executeExchange } from '@urql/exchange-execute'
import type { Operation } from '@urql/core'
import type { GraphQLSchema } from 'graphql'
import type { AdapterVaultDB, AdapterVaultDBOpts, Boxscope, VaultScope } from 'safebyok/storage'
import * as TH from 'safebyok/testing'
import { PostgresVaultDB, VaultFunctionsSql, VaultTablesSql, vaultChannelOf } from 'safebyok-postgres'
import type { PostgresListen, PostgresVaultDBOpts } from 'safebyok-postgres'
import { GraphQLVaultDB } from '../src/index'
import { VaultSchemaSdl, vaultResolvers } from '../src/server'

// Re-export the core's test helpers, so a test here imports this one module as TH.
export * from 'safebyok/testing'

// == [The database]: BootMillis, database, bootDatabaseFirst, emptyTables, listen

// On a CI runner, PGlite's WebAssembly can take eight seconds or more to compile from cold, longer than a test's default timeout.
export const BootMillis = 60_000

const made: { db?: Promise<PGlite> } = {}

/** Return this test file's PGlite with its tables created. One is shared per file, because each takes seconds to boot. */
export const database = async (): Promise<PGlite> => {
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

const listenersOf = new Map<string, Set<(text: string) => void>>()

/** Start listening on `channel` the first time it is asked for, and never stop, like safebyok-postgres's README recipe. Returns the channel's set of callbacks. */
const listenOn = async (db: PGlite, channel: string): Promise<Set<(text: string) => void>> => {
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
// --

// == [The server]: TestContext, serverOver, schemaOver

/** The test server's per-request context: the signed-in user's id, or null. */
export type TestContext = { user_id: string | null }

/** Make the server's PostgresVaultDB on this file's PGlite. */
export const serverOver = async (opts: Omit<PostgresVaultDBOpts, 'client'> = {}): Promise<PostgresVaultDB> => (
  new PostgresVaultDB({ listen, ...opts, client: await database() })
)

/** Build the executable GraphQL schema for `vaultDB`. Each request is signed in as the user in its context. */
export const schemaOver = (vaultDB: AdapterVaultDB): GraphQLSchema => makeExecutableSchema({
  typeDefs:  VaultSchemaSdl,
  resolvers: vaultResolvers({ vaultDB, getUserId: ({ user_id }: TestContext) => user_id }),
})
// --

// == [The browser]: Signing, signedInAs, signedInAsAsked, browserOver

/** A function that picks the context the server sees for each operation a test Client sends. */
export type Signing = (operation: Operation) => TestContext

/** Sign every operation in as `user_id`, or leave it signed out for null. */
export const signedInAs = (user_id: string | null): Signing => () => ({ user_id })

/** Sign each operation in as the user named in its variables: its scope's, its ask's or its record's. The server's sign-in check stays on, and the battery's users pass it. */
export const signedInAsAsked: Signing = ({ variables }) => {
  const { user_id, ask, record } = variables as { user_id?: string } & Partial<Record<'ask' | 'record', { user_id?: string }>>
  return { user_id: user_id ?? ask?.user_id ?? record?.user_id ?? null }
}

/** A GraphQLVaultDB whose next query or mutation can be made to fail like a dropped connection. */
export type FlakyVaultDB = GraphQLVaultDB & { failNext: () => void }

/** Make a GraphQLVaultDB with its own urql Client that executes `schema` in-process. The Client uses urql's document cache, as an app's would. */
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

/** Empty the tables and make a new browser-side VaultDB. Its server's VaultDB is made with `opts` and, if given, a cap of `maxBoxes` boxes per vault. */
export const makeVaultDB = async (opts: AdapterVaultDBOpts = {}, maxBoxes?: number): Promise<FlakyVaultDB> => {
  await emptyTables()
  const adapter = await serverOver({ ...opts, ...((maxBoxes !== undefined) && { maxBoxes }) })
  const schema = schemaOver(adapter)
  const vaultDB = browserOver(schema)
  serversOf.set(vaultDB, { schema, adapter })
  return vaultDB
}

/** Return the server behind a VaultDB that makeVaultDB or makeTwin made. */
const serverOf = (vaultDB: GraphQLVaultDB): { schema: GraphQLSchema, adapter: PostgresVaultDB } => {
  const server = serversOf.get(vaultDB)
  if (server === undefined) { throw new Error('This takes a VaultDB makeVaultDB or makeTwin made') }
  return server
}

/** Make a second browser-side VaultDB on the same server, to act as another device. */
export const makeTwin = (vaultDB: GraphQLVaultDB): FlakyVaultDB => {
  const server = serverOf(vaultDB)
  const twin = browserOver(server.schema)
  serversOf.set(twin, server)
  return twin
}

/** Return the PostgresVaultDB behind a browser-side VaultDB, for the battery's race tests. */
export const adapterOf = (vaultDB: GraphQLVaultDB): AdapterVaultDB => serverOf(vaultDB).adapter
// --

// == [Rows]: sql, recordOf, rowsOf

/** Run SQL directly against the PGlite, for the battery's row checks. */
const sql = async <RowT>(text: string, params: unknown[]): Promise<RowT[]> => {
  const db = await database()
  const { rows } = await db.query<RowT>(text, params)
  return rows
}

/** The record a table row was stored from: each column a field, a null column left out. */
function recordOf(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([, val]) => val !== null))
}

// The same SQL as safebyok-postgres's own tests. A vault row is planted by an upsert, never a delete and an insert: deleting a vault row deletes its box rows.
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

/** The tables' rows, past the server's VaultDB: plant one, or read what is stored, with SQL of its own.
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
