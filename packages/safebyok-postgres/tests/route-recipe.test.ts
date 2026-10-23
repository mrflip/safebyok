// The README's route recipe, run: its server half (a web-standard POST handler) and its client half
// (a VaultDB over fetch), with only the wiring a test needs changed -- the request's user comes
// from a header instead of a session cookie, and fetch calls the handler in-process. Change one
// and the README changes with it.
import { describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { VaultDB, VaultError, RefusalKindVals, memoryDeviceDB } from 'safebyok'
import type { Outcome, VaultPropsExpectation, VaultDelExpectation, BoxRecord, BoxGetExpectation, BoxExpectation, BoxDelExpectation, GatelessVaultProps, StoredVault, VaultProps, RefusalKind, RefusalMeta, VaultScope } from 'safebyok'
import * as TH from './test-helpers'
import { VaultChangeChannel, postgresVaultDB } from '../src/index'
import type { PostgresClient, PostgresListen } from '../src/index'

// ------------------------------------------------------------------------- the server half

/** One verb a browser's vault may call, as the route serves it from the arguments the browser sent. */
type Served = (vaultDB: VaultDB, args: unknown[]) => Promise<Outcome<unknown>>

/**
 * The verbs a browser's vault may call -- VaultDB's own, and nothing else -- each passed to the
 * VaultDB, which refuses another user's vault, and holds each record to its shape and each name
 * to the floor and the table's limits; what text a name may be beyond that is each browser
 * vault's own validators' to say. A listing goes as the stored records, which the browser's
 * VaultDB validates.
 */
const served = new Map<string, Served>([
  ['getVault',         (vaultDB, [scope]) => vaultDB.getVaultRecords(scope as VaultScope)],
  ['ensureVault',      (vaultDB, [draft]) => vaultDB.ensureVaultRecords(draft as GatelessVaultProps)],
  ['putVaultProps',    (vaultDB, [vaultProps, expected]) => vaultDB.putVaultProps(vaultProps as VaultProps, expected as VaultPropsExpectation)],
  ['getBox',           (vaultDB, [scope, boxlabel, expected]) => vaultDB.getBox(scope as VaultScope, boxlabel as string, expected as BoxGetExpectation)],
  ['getCapacity',      (vaultDB, [scope]) => vaultDB.getCapacity(scope as VaultScope)],
  ['putBox',           (vaultDB, [scope, expected, box]) => vaultDB.putBox(scope as VaultScope, expected as BoxExpectation, box as BoxRecord)],
  ['delBox',           (vaultDB, [scope, boxlabel, expected]) => vaultDB.delBox(scope as VaultScope, boxlabel as string, expected as BoxDelExpectation)],
  ['delVault',         (vaultDB, [scope, expected]) => vaultDB.delVault(scope as VaultScope, expected as VaultDelExpectation)],
])

/** What a request posts: its verb and arguments, or nothing when its body is not a JSON object. */
const postedCall = async (request: Request): Promise<{ verb?: unknown, args?: unknown }> => {
  try {
    const posted: unknown = await request.json()
    return typeof posted === 'object' && posted !== null ? posted : {}
  } catch {
    return {}
  }
}

/** The README's POST handler, over `pool`, its signed-in user found by `signedInUserId`. */
const vaultRoute = (pool: PostgresClient, signedInUserId: (request: Request) => Promise<string | null>) => (
  async (request: Request): Promise<Response> => {
    const { verb, args } = await postedCall(request)
    const serve = typeof verb === 'string' ? served.get(verb) : undefined
    if (! serve || ! Array.isArray(args)) {
      return Response.json({ refusal: { kind: 'bad_option', message: 'That is not a vault verb.' } }, { status: 400 })
    }
    // Made per request, for the user your own auth signed in -- never one the request names.
    const vaultDB = postgresVaultDB({ client: pool, userId: await signedInUserId(request) })
    const { ok, val = null, err } = await serve(vaultDB, args)
    // A refusal crosses as its kind, its calm message, and its meta -- what a stale write says
    // stands (a box write's box_stored, an update's vault_props_stored, as a read would send
    // them), or a vault_full's capacity -- never its cause, the driver's own error.
    if (! ok) { return Response.json({ refusal: { kind: err.refusalkind, message: err.message, meta: err.meta } }) }
    return Response.json({ result: val })
  }
)

// ------------------------------------------------------------------------- the client half

type Fetch = (url: string, init: RequestInit) => Promise<Response>

/** Where the route is served. */
const VaultRouteUrl = '/api/safebyok'

/** The README's client VaultDB: each verb one POST to the route, a refusal rethrown as its VaultError. */
class RouteVaultDB extends VaultDB {
  readonly maxRecordBytes = 1024 * 1024
  readonly maxVaultBytes = Infinity
  readonly maxBoxes = Infinity // the server's postgresVaultDB maxBoxes
  readonly maxNameBytes = 640  // the server's postgresVaultDB maxNameBytes

  private readonly fetcher: Fetch

  constructor(fetcher: Fetch) {
    super({})
    this.fetcher = fetcher
  }

  protected async doGetVault(scope: VaultScope) { return storedVaultOf(await this.call('getVault', scope)) }
  protected async doEnsureVault(draft: GatelessVaultProps) { return storedVaultOf(await this.call('ensureVault', draft)) }
  protected doPutVaultProps(vaultProps: VaultProps, expected: VaultPropsExpectation) { return this.call('putVaultProps', vaultProps, expected) }
  protected doGetBox(scope: VaultScope, boxlabel: string, expected: BoxGetExpectation) { return this.call('getBox', scope, boxlabel, expected) }
  protected doPutBox(scope: VaultScope, expected: BoxExpectation, box: BoxRecord) { return this.call('putBox', scope, expected, box) }
  protected doGetCapacity(scope: VaultScope) { return this.call('getCapacity', scope) }
  protected doDelBox(scope: VaultScope, boxlabel: string, expected: BoxDelExpectation) { return this.call('delBox', scope, boxlabel, expected) }
  protected doDelVault(scope: VaultScope, expected: VaultDelExpectation) { return this.call('delVault', scope, expected) }

  // A stale write refuses on the server and crosses as its kind, with what stands (a full vault,
  // with how full it is), so a write that answers landed: an update of the vault props answers with
  // the vault props as the server's storage holds them, a box write with the box, a box deletion
  // with what it removed, and a vault deletion with the tombstone it left.
  private async call(verb: string, ...args: unknown[]): Promise<unknown> {
    const response = await this.fetcher(VaultRouteUrl, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ verb, args }),
    })
    const { result, refusal } = await response.json() as { result?: unknown, refusal?: { kind?: unknown, message?: unknown, meta?: RefusalMeta } }
    if (refusal && isKind(refusal.kind) && typeof refusal.message === 'string') {
      // What stands, or how full the vault is, handed on unchecked: the VaultDB checks each.
      throw new VaultError(refusal.kind, refusal.message, refusal.meta === undefined ? {} : { meta: refusal.meta })
    }
    if (! response.ok) { throw new Error(`The vault route answered ${String(response.status)}`) }
    return result
  }
}

const isKind = (kind: unknown): kind is RefusalKind => (RefusalKindVals as readonly unknown[]).includes(kind)

// A vault as the route sends it -- its vault props, and its boxes as stored records -- or null for
// none, as the VaultDB's half hands it up: each box under the boxlabel it holds.
const storedVaultOf = (sent: unknown): StoredVault => {
  if (sent === null) { return { vaultProps: null, boxes: [] } }
  const { vaultProps, boxes } = sent as { vaultProps: unknown, boxes: { boxlabel: string }[] }
  return { vaultProps, boxes: boxes.map((box) => ({ boxlabel: box.boxlabel, box })) }
}

// ------------------------------------------------------------------- the listen fan-out, for pg

/** The README's fan-out: one pg connection LISTENs, and hands each notification to every hearer. */
const fanOut = (listener: Pick<Client, 'on'>): PostgresListen => {
  const hearers = new Set<(payload: string) => void>()
  listener.on('notification', ({ channel, payload = '' }) => {
    if (channel === VaultChangeChannel) {
      for (const hear of hearers) { hear(payload) }
    }
  })
  return (_channel, onNotify) => {
    hearers.add(onNotify)
    return () => { hearers.delete(onNotify) }
  }
}

// ------------------------------------------------------------------------------------- tests

/** The route over this file's database, signing each request in as its `x-test-user` header. */
const routeOver = async () => vaultRoute(await TH.emptyDatabase(), byHeader)

/** The test's stand-in for a session: the request's `x-test-user` header, URI-encoded, as a header holds only Latin-1. */
const byHeader = (request: Request) => {
  const userHeader = request.headers.get('x-test-user')
  return Promise.resolve(userHeader === null ? null : decodeURIComponent(userHeader))
}

/** A POST of `body` to the route. */
const postOf = (body: unknown) => new Request(`https://app.example.test${VaultRouteUrl}`, { method: 'POST', body: JSON.stringify(body) })

/** A browser for `userId`: its fetch reaches `route` in-process, signed in as that user. */
const browserFor = (route: (request: Request) => Promise<Response>, userId: string | null) => sessionedBrowser(route, { userId })

/** A browser whose fetch reaches `route` in-process, signed in as `session.userId` at each call: change it to sign in or out. */
const sessionedBrowser = (route: (request: Request) => Promise<Response>, session: { userId: string | null }) => (
  new RouteVaultDB((url, init) => {
    const headers = new Headers(init.headers)
    if (session.userId !== null) { headers.set('x-test-user', encodeURIComponent(session.userId)) }
    return route(new Request(`https://app.example.test${url}`, { ...init, headers }))
  })
)

TH.bootDatabaseFirst()

TH.describeVaultDB('the README route recipe, over postgresVaultDB', async () => {
  const route = await routeOver()
  return TH.perUser((userId) => browserFor(route, userId))
}, {
  makeVaultDBFor: async () => {
    const route = await routeOver()
    return (userId) => browserFor(route, userId)
  },
})

describe("the README route recipe", () => {
  it("carries a real vault, made and opened by the core in the browser", async () => {
    const route = await routeOver()
    const vault = await TH.settledVault({
      applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB: browserFor(route, 'u1'), deviceDB: memoryDeviceDB(), keyDeriver: TH.testDeriver, strengthChecker: TH.anyStrengthChecker,
    })
    await TH.unlock(vault, 'correct horse battery staple')
    await vault.putBox({ boxlabel: 'anthropic_api_key' }, 'sk-ant-test-not-a-real-key')
    expect(await vault.getWhisper('anthropic_api_key')).to.eq('sk-ant-test-not-a-real-key')
    TH.closeVault(vault)
  })

  it("locks the browser's vault at its next call once the session signs out, erasing nothing", async () => {
    const route = await routeOver()
    const session: { userId: string | null } = { userId: 'u1' }
    const deviceDB = memoryDeviceDB()
    const opts = { applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB: sessionedBrowser(route, session), deviceDB, keyDeriver: TH.testDeriver, strengthChecker: TH.anyStrengthChecker, logger: TH.spyLogger().logger }
    const vault = await TH.settledVault(opts)
    await TH.unlock(vault, 'correct horse battery staple')
    await vault.putBox({ boxlabel: 'anthropic_api_key' }, 'sk-ant-test-not-a-real-key')
    session.userId = null
    await TH.expectRefusal(vault.getWhisper('anthropic_api_key'), 'identity_revoked')
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await TH.expectingGood(deviceDB).getLease(TH.scopeOf('u1'))).to.be.null
    // Signed in again: the same passphrase opens what was stored.
    session.userId = 'u1'
    await TH.unlock(vault, 'correct horse battery staple')
    expect(await vault.getWhisper('anthropic_api_key')).to.eq('sk-ant-test-not-a-real-key')
    TH.closeVault(vault)
  })

  it("answers 400 to anything but a vault verb, a malformed body among them, and the client says so as storage_unavailable", async () => {
    const route = await routeOver()
    for (const body of [{ verb: 'subscribe', args: [] }, { verb: 'constructor', args: [] }, { verb: 'getVault', args: 'nope' }, null, 42]) {
      const response = await route(postOf(body))
      expect(response.status).to.eq(400)
    }
    const notJson = await route(new Request(`https://app.example.test${VaultRouteUrl}`, { method: 'POST', body: '{"verb": "getVaultProps", ' }))
    expect(notJson.status).to.eq(400)
    const broken = new RouteVaultDB(() => Promise.resolve(Response.json({}, { status: 502 })))
    await TH.expectBad(broken.getVault(TH.scopeOf('u1')), 'storage_unavailable')
  })

  it("never sends the driver's own error to the browser", async () => {
    const dbDown = new Error('password authentication failed for user "vault_owner"')
    const route = vaultRoute(TH.failingClient(dbDown), () => Promise.resolve('u1'))
    const response = await route(postOf({ verb: 'getVault', args: [TH.scopeOf('u1')] }))
    const sent = await response.text()
    expect(sent).to.include('storage_unavailable')
    expect(sent).to.not.include('vault_owner')
  })
})

describe("the README's pg fan-out", () => {
  it("hands each notification on the vault channel to every hearer, until it unlistens", () => {
    const handlers: ((notice: { channel: string, payload?: string }) => void)[] = []
    const listener = { on: (_event: string, handler: (typeof handlers)[number]) => { handlers.push(handler) } }
    const emit = (notice: { channel: string, payload?: string }) => { for (const handler of handlers) { handler(notice) } }
    const listen = fanOut(listener as unknown as Pick<Client, 'on'>)
    const heard: string[] = []
    const unlisten = listen(VaultChangeChannel, (payload) => { heard.push(payload) }) as () => void
    emit({ channel: VaultChangeChannel, payload: '{"applabel":"acme"}' })
    emit({ channel: 'someone_elses_channel', payload: 'ignored' })
    emit({ channel: VaultChangeChannel })
    unlisten()
    emit({ channel: VaultChangeChannel, payload: 'too late' })
    expect(heard).to.deep.equal(['{"applabel":"acme"}', ''])
  })
})
