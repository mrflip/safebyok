/** Yoga servers over a real Postgres, reached over real sockets, and the browsers that post to them: safebyok-graphql's README recipe, both halves. */

import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach } from 'vitest'
import { Client, fetchExchange } from '@urql/core'
import { createSchema, createYoga } from 'graphql-yoga'
import { GraphQLVaultDB } from 'safebyok-graphql'
import { VaultSchemaSdl, vaultResolvers } from 'safebyok-graphql/server'
import { PostgresVaultDB, pgClientOf } from 'safebyok-postgres'
import type { PostgresListen } from 'safebyok-postgres'
import * as TH from '../postgres/test-helpers'

// Everything the Postgres tests use too, so a test here star-imports this one module as TH.
export * from '../postgres/test-helpers'

// == [Servers]: Server, useServers, serve, vaultDBListening

/** One server: Yoga over the README's route, on a port of its own, and the VaultDB it hosts. */
export type Server = { url: string, vaultDB: PostgresVaultDB }

const closers: (() => Promise<void>)[] = []

/** Closes each server after each test, before the database's own hook ends their pools; called once at a file's top, after TH.useFileDatabase. */
export const useServers = (): void => {
  afterEach(async () => { await closeServers() })
}

/** Closes every server open, cutting the watches still streaming from them. */
const closeServers = async (): Promise<void> => { await Promise.all(closers.splice(0).map((close) => close())) }

/** A server hosting `vaultDB` on a free port of this machine, its signed-in user the request's `x-test-user` header in place of a session. */
export const serve = async (vaultDB: PostgresVaultDB): Promise<Server> => {
  /** What each request's resolvers know of it: the user its auth signed in, or null. */
  type VaultContext = { user_id: string | null }
  const yoga = createYoga<object, VaultContext>({
    schema: createSchema<VaultContext>({
      typeDefs:  [VaultSchemaSdl],
      resolvers: [vaultResolvers({ vaultDB, userIdOf: ({ user_id }: VaultContext) => user_id })],
    }),
    graphqlEndpoint: '/api/graphql',
    context:         ({ request }) => ({ user_id: request.headers.get('x-test-user') }),
    logging:         false,
  })
  const http = createServer(yoga.requestListener)
  await new Promise<void>((resolve) => { http.listen(0, '127.0.0.1', resolve) })
  closers.push(() => new Promise<void>((resolve) => {
    http.closeAllConnections()
    http.close(() => { resolve() })
  }))
  const { port } = http.address() as AddressInfo
  return { url: `http://127.0.0.1:${String(port)}/api/graphql`, vaultDB }
}

/** A PostgresVaultDB over `db` as one server has it, its listen counted in `listening` as each watch starts and stops. */
export const vaultDBListening = async (db: TH.FileDatabase, listening: { count: number }): Promise<PostgresVaultDB> => {
  const listen = await TH.listenOver(db)
  const counted: PostgresListen = async (channel, onNotify) => {
    const unlisten = await listen(channel, onNotify)
    listening.count += 1
    return () => {
      listening.count -= 1
      return unlisten()
    }
  }
  return new PostgresVaultDB({ client: pgClientOf(db.devicePool()), listen: counted })
}

/** A server over emptied tables, the last test's servers closed and their VaultDBs ended first. */
export const freshServer = async (db: TH.FileDatabase, opts: TH.VaultDBOverOpts = {}): Promise<Server> => {
  await closeServers()
  return await serve(await TH.freshVaultDB(db, opts))
}
// --

// == [Browsers]: Signing, signedInAsAsked, browserAt

/** Who a browser signs each operation in as, from the variables it sends, or null for signed out. */
export type Signing = (variables: Record<string, unknown>) => string | null

/** Signs each operation in as the user it asks for, so the server's gate stays on and lets the battery's users through. */
export const signedInAsAsked: Signing = (variables) => {
  const { user_id, record, tombstone, params } = variables as { user_id?: string } & Partial<Record<'record' | 'tombstone' | 'params', { user_id?: string }>>
  return user_id ?? record?.user_id ?? tombstone?.user_id ?? params?.user_id ?? null
}

/** The README's browser half: a GraphQLVaultDB over an urql Client posting to `server` over the network, and subscribing there too. */
export const browserAt = (server: Server, signing: Signing = signedInAsAsked): GraphQLVaultDB => new GraphQLVaultDB({ client: new Client({
  url:                server.url,
  exchanges:          [fetchExchange],
  fetchSubscriptions: true,
  fetch:              async (url, init) => {
    const request = new Request(url, init)
    const user_id = signing(await variablesOf(request.clone()))
    if (user_id !== null) { request.headers.set('x-test-user', user_id) }
    return await fetch(request)
  },
}) })

/** The variables an operation was sent with: in the URL, as urql sends a query by GET, or in the body. */
const variablesOf = async (request: Request): Promise<Record<string, unknown>> => {
  const inUrl = new URL(request.url).searchParams.get('variables')
  const sent = (inUrl === null) ? (await request.json() as { variables?: unknown }).variables : JSON.parse(inUrl) as unknown
  return (sent ?? {}) as Record<string, unknown>
}
// --
