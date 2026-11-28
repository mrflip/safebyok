/** Test helpers: a GraphQL server over any vaultDB, GraphQLVaultDBs that call it in-process, and one PGlite per test file for a PostgresVaultDB. */

import { afterAll, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { Client, cacheExchange, makeErrorResult, mapExchange } from '@urql/core'
import { executeExchange } from '@urql/exchange-execute'
import type { Operation } from '@urql/core'
import type { GraphQLSchema } from 'graphql'
import { type Userid, type VaultDB } from 'safebyok/storage'
import * as VT from 'safebyok/testing'
import { PostgresVaultDB, VaultFunctionsSql, VaultTablesSql, thingsChannelOf } from 'safebyok-postgres'
import { GraphQLVaultDB } from '../src/index'
import { VaultSchemaSdl, vaultResolvers } from '../src/server'

// Re-export the core's test helpers, so a test here imports this one module as TH.
export * from 'safebyok/testing'

// == [The server]: overTheWire, TestContext, schemaOver

/** Round-trip `val` through JSON, as the wire would. */
export function overTheWire(val: unknown): unknown {
  const text = JSON.stringify(val)
  return JSON.parse(text) as unknown
}

/** The test server's per-request context: the signed-in user's id, or null. */
export type TestContext = { userid: Userid | null }

/** Build the executable GraphQL schema over `vaultDB`. Each request is signed in as the user in its context. */
export function schemaOver(vaultDB: VaultDB): GraphQLSchema {
  return makeExecutableSchema({
    typeDefs:  VaultSchemaSdl,
    resolvers: vaultResolvers({ vaultDB, getUserId: ({ userid }: TestContext) => userid }),
  })
}
// --

// == [The browser]: Signing, signedInAs, signedInAsAsked, FlakyVaultDB, browserOver

/** A function that picks the context the server sees for each operation a test Client sends. */
export type Signing = (operation: Operation) => TestContext

/** Sign every operation in as `userid`, or leave it signed out for null. */
export function signedInAs(userid: Userid | null): Signing { return () => ({ userid }) }

/** Sign each operation in as the user its ask or its watch's scope names. The server's sign-in check stays on, and the battery's users pass it. */
export const signedInAsAsked: Signing = ({ variables }) => {
  const { ask, scope } = variables as { ask?: { userid?: Userid }, scope?: { userid?: Userid } }
  return { userid: ask?.userid ?? scope?.userid ?? null }
}

/** A GraphQLVaultDB whose next query or mutation can be made to fail like a dropped connection. */
export type FlakyVaultDB = GraphQLVaultDB & { failNext: () => void }

/** Make a GraphQLVaultDB with its own urql Client that executes `schema` in-process. The Client uses urql's document cache, as an app's would. */
export function browserOver(schema: GraphQLSchema, signing: Signing = signedInAsAsked): FlakyVaultDB {
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

// == [PGlite]: BootMillis, database, bootDatabaseFirst, postgresVaultDB, postgresRows

// On a CI runner, PGlite's WebAssembly can take eight seconds or more to compile from cold, longer than a test's default timeout.
export const BootMillis = 60_000

// The tables safebyok-postgres keeps each kind's Things in, which the cheat plants into directly.
const ThingTables = { gate: 'safebyok_gate_things', box: 'safebyok_box_things' } as const

const made: { db?: Promise<PGlite> } = {}
const onNotifies = new Set<(text: string) => void>()

/** This test file's PGlite, with the vaultDB's tables and functions created, listening on the battery user's channel. One is shared per file, because each takes seconds to boot. */
export async function database(): Promise<PGlite> {
  made.db ??= (async () => {
    const db = new PGlite()
    await db.exec(VaultTablesSql)
    await db.exec(VaultFunctionsSql)
    // PGlite queues a LISTEN behind the statements already waiting, so it listens once, at boot, before any write.
    // It uses the channel identifier as written, so it is quoted.
    await db.listen(`"${thingsChannelOf(VT.ThingBank.userid)}"`, (text) => { for (const onNotify of onNotifies) { onNotify(text) } })
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

/** A PostgresVaultDB over this file's PGlite with its tables emptied, listening on the battery user's channel. */
export async function postgresVaultDB(): Promise<PostgresVaultDB> {
  const db = await database()
  await db.exec(`TRUNCATE ${Object.values(ThingTables).join(', ')}`)
  return new PostgresVaultDB({
    client: db,
    listen: (_channel, onNotify) => {
      onNotifies.add(onNotify)
      return () => onNotifies.delete(onNotify)
    },
  })
}

/** The cheat into this file's PGlite: plant a raw Thing at a scope, or take one away. */
export const postgresRows: VT.VaultDBRowCheats = {
  plant: async (scope, raw) => {
    await postgresRows.remove(scope)
    const db = await database()
    const table = ThingTables[scope.modelkind]
    await db.query(`INSERT INTO ${table} SELECT * FROM jsonb_populate_record(NULL::${table}, $1::text::jsonb)`, [JSON.stringify(raw)])
  },
  remove: async ({ userid, banklabel, modelkind, labelpath }) => {
    const db = await database()
    await db.query(`DELETE FROM ${ThingTables[modelkind]} WHERE (userid, banklabel, labelpath) = ($1, $2, $3)`, [userid, banklabel, labelpath])
  },
}
// --
