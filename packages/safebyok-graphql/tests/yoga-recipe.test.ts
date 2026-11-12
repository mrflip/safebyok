// Runs the README's recipe: the server route (Yoga with vaultResolvers and a PostgresVaultDB) and the
// browser side (GraphQLVaultDB on an urql Client that posts to the route). Only the test wiring
// differs: the user comes from a header instead of a session cookie, the database is a PGlite, and
// fetch calls the route in-process. If you change the recipe here, change the README to match.

import { describe, expect, it } from 'vitest'
import { Client, fetchExchange } from '@urql/core'
import { createSchema, createYoga } from 'graphql-yoga'
import * as DB from 'safebyok/storage'
import { PostgresVaultDB } from 'safebyok-postgres'
import type { PostgresClient, PostgresListen } from 'safebyok-postgres'
import { GraphQLVaultDB } from '../src/index'
import { VaultSchemaSdl, vaultResolvers } from '../src/server'
import { VaultOperations } from '../src/vault-operations'
import * as TH from './test-helpers'

TH.bootDatabaseFirst()

// == [The recipe]: vaultRoute, browserVaultDB

/** Build the README's route for `vaultDB`. `signedInUserId` returns each request's signed-in user. */
function vaultRoute(vaultDB: PostgresVaultDB, signedInUserId: (request: Request) => Promise<string | null>, isDev = false) {
  /** The per-request context the resolvers see: the user your own auth signed in, or null. */
  type VaultContext = { user_id: string | null }
  const schema = createSchema<VaultContext>({
    typeDefs:  [VaultSchemaSdl],
    resolvers: [vaultResolvers({ vaultDB, getUserId: ({ user_id }: VaultContext) => user_id })],
  })
  const { handleRequest } = createYoga<object, VaultContext>({
    schema,
    graphqlEndpoint: '/api/graphql',
    context:         async ({ request }) => ({ user_id: await signedInUserId(request) }),
    maskedErrors:    { isDev },
    logging:         false,
  })
  return async (request: Request): Promise<Response> => await handleRequest(request, {})
}

/** Build the README's browser side: a GraphQLVaultDB on an urql Client that sends queries, mutations and subscriptions to the route by fetch. */
function browserVaultDB(fetcher: typeof fetch) {
  return new GraphQLVaultDB({ client: new Client({
    url:                'https://app.example.test/api/graphql',
    exchanges:          [fetchExchange],
    fetchSubscriptions: true,
    fetch:              fetcher,
  }) })
}
// --

// == [Wiring]: Route, byHeader, overTheNetwork, browserFor, signedInAsAsked, makeVaultDB, makeTwin

type Route = (request: Request) => Promise<Response>

/** Read the signed-in user from the request's `x-test-user` header, the test's substitute for a session. */
const byHeader = (request: Request) => Promise.resolve(request.headers.get('x-test-user'))

/** Wrap `response` so that aborting the request cancels the body the server is sending, as a real network connection would. */
function overTheNetwork(request: Request, response: Response): Response {
  if (response.body === null) { return response }
  const sending = response.body.getReader()
  request.signal.addEventListener('abort', () => { void sending.cancel() })
  const received = new ReadableStream<Uint8Array>({
    pull: async (controller) => {
      const chunk = await sending.read()
      if (chunk.done) { controller.close() } else { controller.enqueue(chunk.value) }
    },
  })
  return new Response(received, response)
}

/** Make a browser-side VaultDB whose fetch calls `route` in-process. `signedInAs` picks each operation's user from its variables. */
function browserFor(route: Route, signedInAs: (variables: Record<string, unknown>) => string | null) {
  return browserVaultDB(async (url, init) => {
    const request = new Request(url, init)
    const user_id = signedInAs(await variablesOf(request.clone()))
    if (user_id !== null) { request.headers.set('x-test-user', user_id) }
    return overTheNetwork(request, await route(request))
  })
}

/** Read an operation's variables from the request: from the URL when urql sent a query by GET, otherwise from the body. */
async function variablesOf(request: Request): Promise<Record<string, unknown>> {
  const inUrl = new URL(request.url).searchParams.get('variables')
  const sent = (inUrl === null) ? (await request.json() as { variables?: unknown }).variables : JSON.parse(inUrl) as unknown
  return (sent ?? {}) as Record<string, unknown>
}

/** Sign each operation in as the user named in its variables, by the same rule as TH.signedInAsAsked. */
const signedInAsAsked = (variables: Record<string, unknown>): string | null => (
  TH.signedInAsAsked({ variables } as unknown as Parameters<TH.Signing>[0]).user_id
)

const serversOf = new WeakMap<GraphQLVaultDB, { route: Route, adapter: PostgresVaultDB }>()

/** Empty the tables and make a new browser-side VaultDB with its own route. Its server's VaultDB is made with `opts` and, if given, a cap of `maxBoxes` boxes per vault. */
async function makeVaultDB(opts: DB.AdapterVaultDBOpts = {}, maxBoxes?: number): Promise<GraphQLVaultDB> {
  await TH.emptyTables()
  const adapter = await TH.serverOver({ ...opts, ...((maxBoxes !== undefined) && { maxBoxes }) })
  const route = vaultRoute(adapter, byHeader)
  const vaultDB = browserFor(route, signedInAsAsked)
  serversOf.set(vaultDB, { route, adapter })
  return vaultDB
}

/** Return the route and the server's VaultDB behind a browser that makeVaultDB or makeTwin made. */
function serverOf(vaultDB: GraphQLVaultDB): { route: Route, adapter: PostgresVaultDB } {
  const server = serversOf.get(vaultDB)
  if (server === undefined) { throw new Error('This takes a browser makeVaultDB or makeTwin made') }
  return server
}

/** Make a second browser-side VaultDB on the same route, to act as another device. */
const makeTwin = (vaultDB: GraphQLVaultDB): GraphQLVaultDB => {
  const server = serverOf(vaultDB)
  const twin = browserFor(server.route, signedInAsAsked)
  serversOf.set(twin, server)
  return twin
}
// --

describe("the README's Yoga recipe, its browser half", () => {
  TH.describeVaultDBBattery("the README's Yoga recipe", {
    makeVaultDB:          async (opts) => await makeVaultDB(opts),
    makeCappedVaultDB:    async (maxBoxes) => await makeVaultDB({}, maxBoxes),
    makeTwin,
    _cheat_rowsOf:        () => TH.rowsOf(),
    _cheat_adapterOf:     (vaultDB) => serverOf(vaultDB).adapter,
  })
})

describe("the README's Yoga recipe", () => {
  it("refuses a browser that asks for another user's bank", async () => {
    await TH.emptyTables()
    const route = vaultRoute(await TH.serverOver(), byHeader)
    const intruder = browserFor(route, () => 'u2')
    const born = TH.vaultPutAskOf(TH.vaultAt())
    await TH.expectRefusal(intruder.putVault(born), 'identity_revoked')
    await TH.expectRefusal(browserFor(route, () => null).listVaults(TH.vaultListAsk), 'identity_revoked')
    expect(await TH.rowsOf().vaultRowOf(TH.vaultScope)).to.be.null
  })

  it("stops the server's watch once the browser stops watching", async () => {
    let watching = 0
    const listen: PostgresListen = async (channel, onNotify) => {
      watching += 1
      const unlisten = await TH.listen(channel, onNotify)
      return () => {
        watching -= 1
        return unlisten()
      }
    }
    const browser = browserFor(vaultRoute(await TH.serverOver({ listen }), byHeader), signedInAsAsked)
    const unwatch = browser.watch(TH.bankScope, () => undefined)
    await expect.poll(() => watching).to.eq(1)
    unwatch()
    await expect.poll(() => watching).to.eq(0)
  })

  it("never sends the driver's own error to the browser, not even in Yoga's development mode", async () => {
    const driverError = new Error('password authentication failed for user "vault_owner"')
    const client: PostgresClient = { query: () => Promise.reject(driverError), transaction: () => Promise.reject(driverError) }
    const route = vaultRoute(new PostgresVaultDB({ client }), () => Promise.resolve('u1'), true)
    const variables = { ask: DB.vaultGet.parse(TH.vaultGetAskOf()) }
    const response = await route(new Request('https://app.example.test/api/graphql', {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ query: VaultOperations.getVault, variables }),
    }))
    const sent = await response.text()
    expect(sent).to.include('storage_unavailable')
    expect(sent).not.to.include('vault_owner')
  })
})
