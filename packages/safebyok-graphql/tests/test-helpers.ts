/** Test helpers: one PGlite per test file, a GraphQL server on it, GraphQLBankDBs that call that server, and direct row access for the bankDB battery. */

import { afterAll, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { Client, cacheExchange, makeErrorResult, mapExchange } from '@urql/core'
import { executeExchange } from '@urql/exchange-execute'
import type { Operation } from '@urql/core'
import type { GraphQLSchema } from 'graphql'
import type { AdapterBankDB, BankScope, Boxscope, BX, VaultScope } from 'safebyok/storage'
import * as TH from 'safebyok/testing'
import { BankFunctionsSql, BankTablesSql, PostgresBankDB, bankChannelOf } from 'safebyok-postgres'
import type { PostgresBankDBOpts, PostgresListen } from 'safebyok-postgres'
import { GraphQLBankDB } from '../src/index'
import { BankSchemaSdl, bankResolvers } from '../src/server'

// Re-export the core's test helpers, so a test here imports this one module as TH.
export * from 'safebyok/testing'

// == [The database]: BootMillis, database, bootDatabaseFirst, emptyTables, listen

// On a CI runner, PGlite's WebAssembly can take eight seconds or more to compile from cold, longer than a test's default timeout.
export const BootMillis = 60_000

const made: { db?: Promise<PGlite> } = {}

/** Return this test file's PGlite with the bankDB's tables and functions created. One is shared per file, because each takes seconds to boot. */
export async function database(): Promise<PGlite> {
  made.db ??= (async () => {
    const db = new PGlite()
    await db.exec(BankTablesSql)
    await db.exec(BankFunctionsSql)
    // Listen on the battery user's channel at boot. PGlite queues a LISTEN behind the statements already waiting,
    // so a write made right after a watch's first LISTEN would be missed.
    await listenOn(db, bankChannelOf(TH.BW.bankScope.user_id))
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

export async function emptyTables(): Promise<void> {
  const db = await database()
  await db.exec('TRUNCATE safebyok_boxes, safebyok_vaults, safebyok_gates, safebyok_banks')
}

const listenersOf = new Map<string, Set<(text: string) => void>>()

/** Start listening on `channel` the first time it is asked for, and never stop, like safebyok-postgres's README recipe. Returns the channel's set of callbacks. */
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
// --

// == [The server]: TestContext, serverOver, schemaOver

/** The test server's per-request context: the signed-in user's id, or null. */
export type TestContext = { user_id: string | null }

/** Make the server's PostgresBankDB on this file's PGlite. */
export async function serverOver(opts: Omit<PostgresBankDBOpts, 'client'> = {}): Promise<PostgresBankDB> {
  return new PostgresBankDB({ listen, ...opts, client: await database() })
}

/** Build the executable GraphQL schema for `bankDB`. Each request is signed in as the user in its context. */
export function schemaOver(bankDB: AdapterBankDB): GraphQLSchema {
  return makeExecutableSchema({
    typeDefs:  BankSchemaSdl,
    resolvers: bankResolvers({ bankDB, getUserId: ({ user_id }: TestContext) => user_id }),
  })
}
// --

// == [The browser]: Signing, signedInAs, signedInAsAsked, FlakyBankDB, browserOver

/** A function that picks the context the server sees for each operation a test Client sends. */
export type Signing = (operation: Operation) => TestContext

/** Sign every operation in as `user_id`, or leave it signed out for null. */
export function signedInAs(user_id: string | null): Signing { return () => ({ user_id }) }

/** Sign each operation in as the user named in its variables: its scope's or its ask's. The server's sign-in check stays on, and the battery's users pass it. */
export const signedInAsAsked: Signing = ({ variables }) => {
  const { user_id, ask } = variables as { user_id?: string, ask?: { user_id?: string } }
  return { user_id: user_id ?? ask?.user_id ?? null }
}

/** A GraphQLBankDB whose next query or mutation can be made to fail like a dropped connection. */
export type FlakyBankDB = GraphQLBankDB & { failNext: () => void }

/** Make a GraphQLBankDB with its own urql Client that executes `schema` in-process. The Client uses urql's document cache, as an app's would. */
export function browserOver(schema: GraphQLSchema, signing: Signing = signedInAsAsked): FlakyBankDB {
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
  return Object.assign(new GraphQLBankDB({ client }), { failNext: () => { isFailing = true } })
}
// --

// == [The battery's bankDBs]: makeBankDB, makeTwin, adapterOf

const serversOf = new WeakMap<GraphQLBankDB, { schema: GraphQLSchema, adapter: PostgresBankDB }>()

/** Empty the tables and make a new browser-side bankDB. Its server's bankDB is made with `opts`. */
export async function makeBankDB(opts: BX.AdapterBankDBOpts & { maxBoxes?: number } = {}): Promise<FlakyBankDB> {
  await emptyTables()
  const adapter = await serverOver(opts)
  const schema = schemaOver(adapter)
  const bankDB = browserOver(schema)
  serversOf.set(bankDB, { schema, adapter })
  return bankDB
}

/** Return the server behind a bankDB that makeBankDB or makeTwin made. */
function serverOf(bankDB: GraphQLBankDB): { schema: GraphQLSchema, adapter: PostgresBankDB } {
  const server = serversOf.get(bankDB)
  if (server === undefined) { throw new Error('This takes a bankDB makeBankDB or makeTwin made') }
  return server
}

/** Make a second browser-side bankDB on the same server, to act as another device. */
export function makeTwin(bankDB: GraphQLBankDB): FlakyBankDB {
  const server = serverOf(bankDB)
  const twin = browserOver(server.schema)
  serversOf.set(twin, server)
  return twin
}

/** Return the PostgresBankDB behind a browser-side bankDB, for the battery's race tests. */
export function adapterOf(bankDB: GraphQLBankDB): AdapterBankDB { return serverOf(bankDB).adapter }
// --

// == [Rows]: sql, planting, recordOf, rowsOf

/** Run SQL directly against the PGlite, for the battery's row checks. */
async function sql<RowT>(text: string, params: unknown[]): Promise<RowT[]> {
  const db = await database()
  const { rows } = await db.query<RowT>(text, params)
  return rows
}

/** Run a plant's statements in one transaction, with the foreign keys unchecked: a planted row need not stand under a bank row. */
async function planting(statements: [string, unknown[]][]): Promise<void> {
  const db = await database()
  await db.transaction(async (tx) => {
    await tx.query('SET LOCAL session_replication_role = replica')
    for (const [text, params] of statements) { await tx.query(text, params) }
  })
}

/** The record a table row was stored from: each column a field, a null column left out. */
function recordOf(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([, val]) => val !== null))
}

// The same SQL as safebyok-postgres's own tests. A bank row is planted by an upsert, never a delete and an insert, so the rows under it stay.
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
const UnplantVaultSql = 'DELETE FROM safebyok_vaults WHERE (user_id, banklabel, vaultlabel) = ($1, $2, $3)'
const PlantVaultSql = `
  INSERT INTO safebyok_vaults
  SELECT * FROM jsonb_populate_record(NULL::safebyok_vaults, $4::text::jsonb || jsonb_build_object('user_id', $1::text, 'banklabel', $2::text, 'vaultlabel', $3::text))
`
// A box row's life is part of its address. A planted row that names a life of its own is stored under that life, as a store keyed by scope alone would hold it.
const BoxRowSql = `
  jsonb_build_object('bank_tok', $4::text, 'vault_tok', $5::text) || $7::text::jsonb
  || jsonb_build_object('user_id', $1::text, 'banklabel', $2::text, 'vaultlabel', $3::text, 'boxlabel', $6::text)
`
const UnplantBoxSql = `
  DELETE FROM safebyok_boxes AS box
  USING  jsonb_populate_record(NULL::safebyok_boxes, ${BoxRowSql}) AS planted
  WHERE  (box.user_id, box.banklabel, box.vaultlabel, box.bank_tok, box.vault_tok, box.boxlabel)
       = (planted.user_id, planted.banklabel, planted.vaultlabel, planted.bank_tok, planted.vault_tok, planted.boxlabel)
`
const PlantBoxSql = `INSERT INTO safebyok_boxes SELECT * FROM jsonb_populate_record(NULL::safebyok_boxes, ${BoxRowSql})`

/** The tables' rows, past the server's bankDB: plant one, or read what is stored, with SQL of its own.
 * A planted row's address is the scope's, whatever the row names, except a box row's life, and a field with no column is dropped.
 * The tables refuse a row that is no object, one missing a field every row has, and a number field that is no integer.
 */
export function rowsOf(): TH.BankDBRowCheats {
  return {
    plantBankRow: async ({ user_id, banklabel }: BankScope, row: unknown) => {
      await planting([[PlantBankSql, [user_id, banklabel, JSON.stringify(row)]]])
    },
    plantGateRow: async ({ user_id, banklabel, gatelabel }: BankScope & { gatelabel: string }, row: unknown) => {
      const address = [user_id, banklabel, gatelabel]
      await planting([[UnplantGateSql, address], [PlantGateSql, [...address, JSON.stringify(row)]]])
    },
    plantVaultRow: async ({ user_id, banklabel, vaultlabel }: VaultScope, row: unknown) => {
      const address = [user_id, banklabel, vaultlabel]
      await planting([[UnplantVaultSql, address], [PlantVaultSql, [...address, JSON.stringify(row)]]])
    },
    plantBoxRow: async ({ user_id, banklabel, vaultlabel, boxlabel }: Boxscope, bank_tok: string, vault_tok: string, row: unknown) => {
      const params = [user_id, banklabel, vaultlabel, bank_tok, vault_tok, boxlabel, JSON.stringify(row)]
      await planting([[UnplantBoxSql, params], [PlantBoxSql, params]])
    },
    bankRowOf: async ({ user_id, banklabel }: BankScope) => {
      const [found] = await sql<{ row: Record<string, unknown> }>(
        'SELECT to_jsonb(stored) AS row FROM safebyok_banks AS stored WHERE (user_id, banklabel) = ($1, $2)', [user_id, banklabel],
      )
      return (found === undefined) ? null : recordOf(found.row)
    },
    gateRowOf: async ({ user_id, banklabel, gatelabel }: BankScope & { gatelabel: string }) => {
      const [found] = await sql<{ row: Record<string, unknown> }>(
        'SELECT to_jsonb(stored) AS row FROM safebyok_gates AS stored WHERE (user_id, banklabel, gatelabel) = ($1, $2, $3)', [user_id, banklabel, gatelabel],
      )
      return (found === undefined) ? null : recordOf(found.row)
    },
    vaultRowOf: async ({ user_id, banklabel, vaultlabel }: VaultScope) => {
      const [found] = await sql<{ row: Record<string, unknown> }>(
        'SELECT to_jsonb(stored) AS row FROM safebyok_vaults AS stored WHERE (user_id, banklabel, vaultlabel) = ($1, $2, $3)', [user_id, banklabel, vaultlabel],
      )
      return (found === undefined) ? null : recordOf(found.row)
    },
    boxRowsOf: async ({ user_id, banklabel, vaultlabel }: VaultScope, bank_tok: string, vault_tok: string) => {
      const found = await sql<{ boxlabel: string, row: Record<string, unknown> }>(
        'SELECT boxlabel, to_jsonb(stored) AS row FROM safebyok_boxes AS stored WHERE (user_id, banklabel, vaultlabel, bank_tok, vault_tok) = ($1, $2, $3, $4, $5)',
        [user_id, banklabel, vaultlabel, bank_tok, vault_tok],
      )
      return new Map(found.map(({ boxlabel, row }) => [boxlabel, recordOf(row)]))
    },
  }
}
// --
