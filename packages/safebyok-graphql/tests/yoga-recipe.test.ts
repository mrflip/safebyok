// The README's Yoga recipe, run: its server half (a Yoga route over vaultResolvers and
// postgresVaultDB) and its client half (graphqlVaultDB over an urql Client posting to it), with
// only the wiring a test needs changed -- the request's user comes from a header instead of a
// session cookie, the database is a PGlite, and fetch calls the route in-process. Change one and
// the README changes with it.
import { describe, expect, it } from 'vitest'
import { Client, fetchExchange } from '@urql/core'
import { createSchema, createYoga } from 'graphql-yoga'
import { memoryDeviceDB } from 'safebyok'
import { postgresVaultDB } from 'safebyok-postgres'
import type { PostgresClient, PostgresListen } from 'safebyok-postgres'
import * as TH from './test-helpers'
import { graphqlVaultDB } from '../src/index'
import { VaultSchemaSdl, vaultResolvers } from '../src/server'

TH.bootDatabaseFirst()

// ------------------------------------------------------------------------- the server half

/** What each request's resolvers know of it: the user your own auth signed in, or null. */
type VaultContext = { userId: string | null }

/** The README's route, over `pool` and `listen`, its signed-in user found by `signedInUserId`. */
const vaultRoute = (pool: PostgresClient, listen: PostgresListen | undefined, signedInUserId: (request: Request) => Promise<string | null>, isDev = false) => {
  const schema = createSchema<VaultContext>({
    typeDefs:  [VaultSchemaSdl],
    resolvers: [vaultResolvers({ vaultDBFor: ({ userId }: VaultContext) => postgresVaultDB({ client: pool, userId, listen }) })],
  })
  const { handleRequest } = createYoga<object, VaultContext>({
    schema,
    graphqlEndpoint: '/api/graphql',
    // Made per request, for the user your own auth signed in -- never one the request names.
    context:         async ({ request }) => ({ userId: await signedInUserId(request) }),
    maskedErrors:    { isDev },
    logging:         false,
  })
  return async (request: Request): Promise<Response> => await handleRequest(request, {})
}

// ------------------------------------------------------------------------- the client half

/** The README's browser half: graphqlVaultDB over an urql Client that posts to the route, and subscribes over it too. */
const browserVaultDB = (fetcher: typeof fetch) => graphqlVaultDB({ client: new Client({
  url:                'https://app.example.test/api/graphql',
  exchanges:          [fetchExchange],
  fetchSubscriptions: true,
  fetch:              fetcher,
}) })

// ------------------------------------------------------------------------------------- tests

/** The test's stand-in for a session: the request's `x-test-user` header, URI-encoded, as a header holds only Latin-1. */
const byHeader = (request: Request) => {
  const userHeader = request.headers.get('x-test-user')
  return Promise.resolve(userHeader === null ? null : decodeURIComponent(userHeader))
}

/** The route over this file's database, signing each request in as its `x-test-user` header. */
const routeOver = async () => {
  const db = await TH.emptyDatabase()
  return vaultRoute(db, TH.listenOn(db), byHeader)
}

/** A browser for `userId`: its fetch reaches `route` in-process, signed in as that user. */
const browserFor = (route: (request: Request) => Promise<Response>, userId: string | null) => (
  browserVaultDB((url, init) => {
    const request = new Request(url, init)
    if (userId !== null) { request.headers.set('x-test-user', encodeURIComponent(userId)) }
    return route(request)
  })
)

TH.describeVaultDB('the README Yoga recipe, over postgresVaultDB', async () => {
  const route = await routeOver()
  return TH.perUser((userId) => browserFor(route, userId))
}, {
  makeVaultDBFor: async () => {
    const route = await routeOver()
    return (userId) => browserFor(route, userId)
  },
})

describe("the README Yoga recipe", () => {
  it("carries a real vault, made and opened by the core in the browser", async () => {
    const route = await routeOver()
    const vault = await TH.settledVault({
      applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB: browserFor(route, 'u1'), deviceDB: memoryDeviceDB(), keyDeriver: TH.testDeriver, passphraseStrengthTest: TH.anyPassphraseTest,
    })
    await vault.unlock('correct horse battery staple')
    await vault.putBox('anthropic_api_key', 'sk-ant-test-not-a-real-key')
    expect(await vault.getBox('anthropic_api_key')).to.eq('sk-ant-test-not-a-real-key')
    vault.close()
  })

  it("never sends the driver's own error to the browser, not even in Yoga's development mode", async () => {
    const dbDown = new Error('password authentication failed for user "vault_owner"')
    const route = vaultRoute(TH.failingClient(dbDown), undefined, () => Promise.resolve('u1'), true)
    const document = 'query ($scope: SafebyokVaultScopeInput!) { safebyokGetVaultProps(scope: $scope) { vault_id } }'
    const variables = { scope: TH.scopeOf('u1') }
    const response = await route(new Request('https://app.example.test/api/graphql', {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ query: document, variables }),
    }))
    const sent = await response.text()
    expect(sent).to.include('storage_unavailable')
    expect(sent).to.not.include('vault_owner')
  })

  it("pushes another device's write to a subscriber, over server-sent events", async () => {
    const route = await routeOver()
    const elsewhere = browserFor(route, 'u1')
    const { heard, unsubscribe } = await TH.liveWatch(browserFor(route, 'u1'), TH.scopeOf('u1'))
    await TH.expectingGood(elsewhere).ensureVaultProps(TH.vaultPropsOf('u1'))
    await TH.eventually(() => heard.count > 0)
    unsubscribe()
    expect(heard.count).to.eq(1)
  })

  it("stops listening to Postgres when a subscriber goes before any write, over server-sent events", async () => {
    const db = await TH.emptyDatabase()
    const listening = { count: 0 }
    const listen: PostgresListen = async (channel, onNotify) => {
      const unlisten = await db.listen(channel, onNotify)
      listening.count += 1
      return async () => {
        listening.count -= 1
        await unlisten()
      }
    }
    const route = vaultRoute(db, listen, byHeader)
    // As a network does, a fetch the browser aborts cancels the response body the server is sending.
    const browser = browserVaultDB(async (url, init) => {
      const request = new Request(url, init)
      request.headers.set('x-test-user', 'u1')
      const response = await route(request)
      const sending = response.body!.getReader()
      request.signal.addEventListener('abort', () => { void sending.cancel() })
      const received = new ReadableStream<Uint8Array>({
        pull: async (controller) => {
          const chunk = await sending.read()
          if (chunk.done) { controller.close() } else { controller.enqueue(chunk.value) }
        },
      })
      return new Response(received, response)
    })
    const unsubscribe = browser.subscribe(TH.scopeOf('u1'), () => undefined)
    await TH.eventually(() => listening.count === 1)
    unsubscribe()
    await TH.eventually(() => listening.count === 0)
    expect(listening.count).to.eq(0)
  })
})
