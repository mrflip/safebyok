import { beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { Client, cacheExchange } from '@urql/core'
import { executeExchange } from '@urql/exchange-execute'
import type { GraphQLSchema } from 'graphql'
import type { VaultDB, VaultDBOpts } from 'safebyok'
import { VaultNotifySql, VaultTablesSql, postgresVaultDB } from 'safebyok-postgres'
import type { PostgresClient, PostgresListen } from 'safebyok-postgres'
import { graphqlVaultDB } from '../src/index'
import { VaultSchemaSdl, vaultResolvers } from '../src/server'
import type { ServedVaultDB } from '../src/server'

// Everything the core's tests use too, so a test here star-imports this one module as TH.
export * from 'safebyok/testing'

const made: { db?: Promise<PGlite> } = {}

/**
 * This test file's database: one PGlite, made once with safebyok-postgres's tables in it. A
 * PGlite takes a second or so to start, so a file's tests share one and {@link emptyDatabase} it.
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

/** This file's database, its tables emptied. */
export const emptyDatabase = async (): Promise<PGlite> => {
  const db = await database()
  await db.exec('TRUNCATE safebyok_boxes, safebyok_vaults, safebyok_vault_tombstones')
  return db
}

/** A PGlite's own `listen`, called on its PGlite, as safebyok-postgres's README wires it. */
export const listenOn = (db: PGlite): PostgresListen => (channel, onNotify) => db.listen(channel, onNotify)

/** What the test server's context holds for one request: the user its auth signed in, or null. */
export type TestContext = { userId: string | null }

/** The VaultDB a request for `userId` gets: safebyok-postgres's, over `db`, listening there. */
export const requestFor = (db: PGlite, userId: string | null) => postgresVaultDB({ client: db, userId, listen: listenOn(db) })

/**
 * The schema a GraphQL server makes of {@link VaultSchemaSdl} and {@link vaultResolvers}, as
 * Yoga and Apollo do (graphql-tools' makeExecutableSchema), each request's VaultDB made by
 * `vaultDBFor` -- by default, safebyok-postgres's over `db`, for the context's user.
 */
export const schemaOver = (db: PGlite, vaultDBFor: (context: TestContext) => ServedVaultDB = ({ userId }) => requestFor(db, userId)): GraphQLSchema => (
  makeExecutableSchema({ typeDefs: VaultSchemaSdl, resolvers: vaultResolvers({ vaultDBFor }) })
)

/**
 * An urql Client signed in as `userId`, as a browser's would be, that runs each operation
 * in-process against `schema`, its context that user's. It has urql's document cache in front,
 * as an app's Client usually does.
 */
export const urqlClientFor = (schema: GraphQLSchema, userId: string | null): Client => new Client({
  url:       'https://app.example.test/api/graphql',
  exchanges: [cacheExchange, executeExchange({ schema, context: { userId } satisfies TestContext })],
})

/** The browser's VaultDB for `userId`: graphqlVaultDB over its own urql Client. */
export const browserFor = (schema: GraphQLSchema, userId: string | null, vaultDBOpts: VaultDBOpts = {}): VaultDB => graphqlVaultDB({ ...vaultDBOpts, client: urqlClientFor(schema, userId) })

/** A PostgresClient whose every statement rejects with `err`, as a driver does when the database is down. */
export const failingClient = (err: Error): PostgresClient => ({
  query: () => Promise.reject(err),
})
