// The README's route recipe, run: its server half (a web-standard POST handler) and its client half
// (a VaultDB over fetch), with only the wiring a test needs changed -- the request's user comes
// from a header instead of a session cookie, and fetch calls the handler in-process. Change one
// and the README changes with it.
import { describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { VaultDB, VaultError, RefusalKindVals, memoryDeviceDB } from 'safebyok'
import type { Outcome, VaultRecordExpectation, VaultDelExpectation, BoxRecord, BoxGetExpectation, BoxExpectation, BoxDelExpectation, DamagedBox, StoredVault, VaultRecord, RefusalKind, RefusalMeta, VaultScope, WayinSummary } from 'safebyok'
import * as TH from './test-helpers'
import { VaultChangeChannel, postgresVaultDB } from '../src/index'
import type { PostgresClient, PostgresListen } from '../src/index'

// ------------------------------------------------------------------------- the server half

/** One verb a browser's vault may call, as the route serves it from the arguments the browser sent. */
type Served = (vaultDB: VaultDB, args: unknown[]) => Promise<Outcome<unknown>>

/**
 * The verbs a browser's vault may call -- VaultDB's own, and nothing else -- each passed to the
 * VaultDB, which refuses another user's vault, and holds each record to its shape and each name
 * to its check and the table's limits, as a browser's vault does. A listing goes as the stored records, which the browser's
 * VaultDB validates.
 */
const served = new Map<string, Served>([
  ['getVault',         (vaultDB, [scope]) => vaultDB.getVaultRecords(scope as VaultScope)],
  ['ensureVault',      (vaultDB, [draft]) => vaultDB.ensureVaultRecords(draft as VaultRecord & { gate: null })],
  ['putVaultRecord',    (vaultDB, [vaultRecord, expected]) => vaultDB.putVaultRecord(vaultRecord as VaultRecord, expected as VaultRecordExpectation)],
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

/**
 * What a route answers, as JSON: `meta` always, the facts about what stands that a write's
 * refusal learned (the record that won the race, how full the vault is) or nothing, and either
 * the `result` or a `refusal`. A refusal's own `meta` holds error information only (a damaged
 * record's listing), rebuilt from the fields a browser may see: no wrapped or ciphered field of
 * a record, whatever the refusal carried. A record in the main `meta` crosses whole, as a read
 * would send it; the browser's VaultDB checks each.
 */
const answerOf = ({ ok, val = null, err }: Outcome<unknown>) => {
  if (ok) { return { result: val, meta: {} } }
  const { box_stored, vault_stored, capacity, box_listed, wayin_listed } = err.meta ?? {}
  const refusalMeta = { box_listed: box_listed && boxShown(box_listed), wayin_listed: wayin_listed && wayinShown(wayin_listed) }
  // Never the refusal's cause, the driver's own error. JSON leaves out what is undefined, and keeps a null: no record stands.
  return { refusal: { kind: err.refusalkind, message: err.message, meta: refusalMeta }, meta: { box_stored, vault_stored, capacity } }
}

/** A listed damaged box, rebuilt from its three public fields. */
const boxShown = ({ boxlabel, damaged, revision_tok }: DamagedBox) => ({ boxlabel, damaged, revision_tok })

/** A listed wayin, rebuilt from the fields a snapshot shows while the vault is locked: none of its salt, its wrapped vaultKey or the rest. */
const wayinShown = (wayin: WayinSummary) => {
  const { wayinkind, device_id, registered_at, vault_tok } = wayin
  return 'credential_id' in wayin
    ? { wayinkind, device_id, registered_at, vault_tok, credential_id: wayin.credential_id, prf_salt_b64: wayin.prf_salt_b64 }
    : { wayinkind, device_id, registered_at, vault_tok }
}

/** The README's POST handler, over `pool`, its signed-in user found by `signedInUserId`. */
const vaultRoute = (pool: PostgresClient, signedInUserId: (request: Request) => Promise<string | null>) => (
  async (request: Request): Promise<Response> => {
    const { verb, args } = await postedCall(request)
    const serve = typeof verb === 'string' ? served.get(verb) : undefined
    if (! serve || ! Array.isArray(args)) {
      return Response.json({ refusal: { kind: 'bad_option', message: 'That is not a vault verb.' }, meta: {} }, { status: 400 })
    }
    // Made per request, for the user your own auth signed in -- never one the request names.
    const vaultDB = postgresVaultDB({ client: pool, user_id: await signedInUserId(request) })
    return Response.json(answerOf(await serve(vaultDB, args)))
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
  protected async doEnsureVault(draft: VaultRecord & { gate: null }) { return storedVaultOf(await this.call('ensureVault', draft)) }
  protected doPutVaultRecord(vaultRecord: VaultRecord, expected: VaultRecordExpectation) { return this.call('putVaultRecord', vaultRecord, expected) }
  protected doGetBox(scope: VaultScope, boxlabel: string, expected: BoxGetExpectation) { return this.call('getBox', scope, boxlabel, expected) }
  protected doPutBox(scope: VaultScope, expected: BoxExpectation, box: BoxRecord) { return this.call('putBox', scope, expected, box) }
  protected doGetCapacity(scope: VaultScope) { return this.call('getCapacity', scope) }
  protected doDelBox(scope: VaultScope, boxlabel: string, expected: BoxDelExpectation) { return this.call('delBox', scope, boxlabel, expected) }
  protected doDelVault(scope: VaultScope, expected: VaultDelExpectation) { return this.call('delVault', scope, expected) }

  // A stale write refuses on the server and crosses as its kind, with what stands (a full vault,
  // with how full it is), so a write that answers landed: an update of the vault record answers with
  // the vault record as the server's storage holds it, a box write with the box, a box deletion
  // with what it removed, and a vault deletion with the tombstone it left.
  private async call(verb: string, ...args: unknown[]): Promise<unknown> {
    const response = await this.fetcher(VaultRouteUrl, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ verb, args }),
    })
    const answer = checkedAnswer(await response.json())
    if (answer.refusal) {
      // What stands, or how full the vault is, from the main meta, beside the refusal's own: handed
      // on unchecked, for the VaultDB checks each.
      const meta = { ...answer.meta, ...answer.refusal.meta }
      throw new VaultError(answer.refusal.kind, answer.refusal.message, Object.keys(meta).length === 0 ? {} : { meta })
    }
    if (! response.ok) { throw new Error(`The vault route answered ${String(response.status)}`) }
    return answer.result
  }
}

// An answer is the route's, or it is nothing the browser's vault believes: a `meta` of the fields
// the main meta may hold, and either a `result` or a `refusal` of a kind this package knows, a
// message, and a `meta` of the fields only a refusal's own may hold. The records in them are the
// VaultDB's to check. A thrown Error is met as storage_unavailable, quoting nothing it was sent.
type RouteAnswer = { result: unknown, refusal?: undefined, meta: RefusalMeta } | { result?: undefined, refusal: { kind: RefusalKind, message: string, meta: RefusalMeta }, meta: RefusalMeta }

const MainMetaCkeys: readonly string[] = ['box_stored', 'vault_stored', 'capacity']
const RefusalMetaCkeys: readonly string[] = ['box_listed', 'wayin_listed']

const isObject = (sent: unknown): sent is object => typeof sent === 'object' && sent !== null && ! Array.isArray(sent)

// `sent` as a meta if it is an object holding no field but `ckeys`, else null.
const metaWithin = (sent: unknown, ckeys: readonly string[]): RefusalMeta | null => (
  isObject(sent) && Object.keys(sent).every((ckey) => ckeys.includes(ckey)) ? sent : null
)

const checkedAnswer = (sent: unknown): RouteAnswer => {
  if (! isObject(sent)) { throw misshapen() }
  const answer = sent as { result?: unknown, refusal?: unknown, meta?: unknown }
  const meta = metaWithin(answer.meta, MainMetaCkeys)
  if (meta === null) { throw misshapen() }
  if (answer.refusal === undefined) {
    if (! ('result' in answer)) { throw misshapen() }
    return { result: answer.result, meta }
  }
  // A refusal comes with no result; its own meta, if it has one, holds only error information.
  if (! isObject(answer.refusal) || 'result' in answer) { throw misshapen() }
  const refusal = answer.refusal as { kind?: unknown, message?: unknown, meta?: unknown }
  const refusalMeta = metaWithin(refusal.meta ?? {}, RefusalMetaCkeys)
  if (refusalMeta === null || typeof refusal.message !== 'string' || ! isKind(refusal.kind)) { throw misshapen() }
  return { refusal: { kind: refusal.kind, message: refusal.message, meta: refusalMeta }, meta }
}

const misshapen = () => new Error('The vault route answered something that is not a vault answer.')

const isKind = (kind: unknown): kind is RefusalKind => (RefusalKindVals as readonly unknown[]).includes(kind)

// A vault as the route sends it -- its vault record, and its boxes as stored records -- or null for
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

/** A browser for `user_id`: its fetch reaches `route` in-process, signed in as that user. */
const browserFor = (route: (request: Request) => Promise<Response>, user_id: string | null) => sessionedBrowser(route, { user_id })

/** A browser whose fetch reaches `route` in-process, signed in as `session.user_id` at each call: change it to sign in or out. */
const sessionedBrowser = (route: (request: Request) => Promise<Response>, session: { user_id: string | null }) => (
  new RouteVaultDB((url, init) => {
    const headers = new Headers(init.headers)
    if (session.user_id !== null) { headers.set('x-test-user', encodeURIComponent(session.user_id)) }
    return route(new Request(`https://app.example.test${url}`, { ...init, headers }))
  })
)

TH.bootDatabaseFirst()

TH.describeVaultDB('the README route recipe, over postgresVaultDB', async () => {
  const route = await routeOver()
  return TH.perUser((user_id) => browserFor(route, user_id))
}, {
  makeVaultDBFor: async () => {
    const route = await routeOver()
    return (user_id) => browserFor(route, user_id)
  },
})

describe("the README route recipe", () => {
  it("carries a real vault, made and opened by the core in the browser", async () => {
    const route = await routeOver()
    const vault = await TH.settledVault({
      applabel: 'acme', user_id: 'u1', vaultlabel: 'main', vaultDB: browserFor(route, 'u1'), deviceDB: memoryDeviceDB(), keyDeriver: TH.testDeriver, strengthChecker: TH.anyStrengthChecker,
    })
    await TH.unlock(vault, 'correct horse battery staple')
    await vault.putBox({ boxlabel: 'anthropic_api_key' }, 'sk-ant-test-not-a-real-key')
    expect(await vault.getWhisper('anthropic_api_key')).to.eq('sk-ant-test-not-a-real-key')
    TH.closeVault(vault)
  })

  it("locks the browser's vault at its next call once the session signs out, erasing nothing", async () => {
    const route = await routeOver()
    const session: { user_id: string | null } = { user_id: 'u1' }
    const deviceDB = memoryDeviceDB()
    const opts = { applabel: 'acme', user_id: 'u1', vaultlabel: 'main', vaultDB: sessionedBrowser(route, session), deviceDB, keyDeriver: TH.testDeriver, strengthChecker: TH.anyStrengthChecker, logger: TH.spyLogger().logger }
    const vault = await TH.settledVault(opts)
    await TH.unlock(vault, 'correct horse battery staple')
    await vault.putBox({ boxlabel: 'anthropic_api_key' }, 'sk-ant-test-not-a-real-key')
    session.user_id = null
    await TH.expectRefusal(vault.getWhisper('anthropic_api_key'), 'identity_revoked')
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await TH.expectingGood(deviceDB).getLease(TH.scopeOf('u1'))).to.be.null
    // Signed in again: the same passphrase opens what was stored.
    session.user_id = 'u1'
    await TH.unlock(vault, 'correct horse battery staple')
    expect(await vault.getWhisper('anthropic_api_key')).to.eq('sk-ant-test-not-a-real-key')
    TH.closeVault(vault)
  })

  it("answers 400 to anything but a vault verb, a malformed body among them, and the client says so as storage_unavailable", async () => {
    const route = await routeOver()
    for (const body of [{ verb: 'subscribe', args: [] }, { verb: 'constructor', args: [] }, { verb: 'getVault', args: 'nope' }, null, 42]) {
      const response = await route(postOf(body))
      expect(response.status).to.eq(400)
      expect(await response.json()).to.deep.equal({ refusal: { kind: 'bad_option', message: 'That is not a vault verb.' }, meta: {} })
    }
    const notJson = await route(new Request(`https://app.example.test${VaultRouteUrl}`, { method: 'POST', body: '{"verb": "getVaultRecord", ' }))
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

/** A wayin record as storage holds it, its salt and wrapped vaultKey in place, for a test of what crosses. */
const fullWayin = (extra: Record<string, unknown> = {}) => ({
  wayinkind: 'passphrase', device_id: 'dev1', registered_at: 1_760_000_000_000, vault_tok: 'tok1',
  salt_b64: 'c2FsdC1ub3QtcmVhbA', vault_key_wayin_wrapped: 'wrapped-not-real', ...extra,
}) as unknown as WayinSummary

/** What `answer` is on the wire: sent as the route sends it, and read back as the browser reads it. */
const crossed = async (answer: object) => await Response.json(answer).json() as { refusal: { kind: string, message: string, meta: object }, meta: object }

describe("the README route recipe's answer, which every call makes in one shape", () => {
  it("answers a served call with its result and a main meta that holds nothing", () => {
    expect(answerOf({ ok: true, val: { here: 1 } })).to.deep.equal({ result: { here: 1 }, meta: {} })
    expect(answerOf({ ok: true, val: undefined })).to.deep.equal({ result: null, meta: {} })
  })

  it("carries what a stale write or a full vault learned in the main meta, and none of it in the refusal's own", async () => {
    const boxStored = { boxlabel: 'a', damaged: true, revision_tok: 'rev1' } as const
    const stale = new VaultError('stale_write', 'Another device wrote first.', { meta: { box_stored: boxStored } })
    expect(await crossed(answerOf({ ok: false, err: stale }))).to.deep.equal({ refusal: { kind: 'stale_write', message: 'Another device wrote first.', meta: {} }, meta: { box_stored: boxStored } })
    // A null is a fact too: no vault record stands.
    const none = new VaultError('stale_write', 'x', { meta: { vault_stored: null } })
    const noneSent = await crossed(answerOf({ ok: false, err: none }))
    expect(noneSent.meta).to.deep.equal({ vault_stored: null })
    const capacity = { boxes: { used: 3, max: 3 }, bytes: { used: 10, max: 100 } }
    const full = await crossed(answerOf({ ok: false, err: new VaultError('vault_full', 'x', { meta: { capacity } }) }))
    expect(full.meta).to.deep.equal({ capacity })
    expect(full.refusal.meta).to.deep.equal({})
  })

  it("rebuilds a damaged record's listing without its wrapped vaultKey, salt or any other field a record holds", async () => {
    const boxListed = { boxlabel: 'a', damaged: true, revision_tok: 'rev1', box_key_wrapped: 'wrapped-not-real', whisper_ciphered: 'ciphered-not-real' } as unknown as DamagedBox
    const err = new VaultError('damaged_wayin', 'x', { meta: { box_listed: boxListed, wayin_listed: fullWayin() } })
    const sent = await crossed(answerOf({ ok: false, err }))
    expect(sent).to.deep.equal({
      refusal: {
        kind: 'damaged_wayin', message: 'x',
        meta: { box_listed: { boxlabel: 'a', damaged: true, revision_tok: 'rev1' }, wayin_listed: { wayinkind: 'passphrase', device_id: 'dev1', registered_at: 1_760_000_000_000, vault_tok: 'tok1' } },
      },
      meta: {},
    })
    const text = JSON.stringify(sent)
    for (const material of ['wrapped', 'ciphered', 'salt_b64', 'not-real']) { expect(text).to.not.include(material) }
  })

  it("keeps a passkey's credential id and PRF salt in a listing, which a locked vault's snapshot shows as well", async () => {
    const passkey = fullWayin({ wayinkind: 'passkey', credential_id: 'cred1', prf_salt_b64: 'prfsalt1' })
    const sent = await crossed(answerOf({ ok: false, err: new VaultError('damaged_wayin', 'x', { meta: { wayin_listed: passkey } }) }))
    expect(sent.refusal.meta).to.deep.equal({ wayin_listed: { wayinkind: 'passkey', device_id: 'dev1', registered_at: 1_760_000_000_000, vault_tok: 'tok1', credential_id: 'cred1', prf_salt_b64: 'prfsalt1' } })
  })

  it("sends a refusal's kind and message, never its cause", async () => {
    const cause = new Error('password authentication failed for user "vault_owner"')
    const sent = await crossed(answerOf({ ok: false, err: new VaultError('storage_unavailable', 'Storage is down.', { cause }) }))
    expect(JSON.stringify(sent)).to.not.include('vault_owner')
    expect(sent).to.deep.equal({ refusal: { kind: 'storage_unavailable', message: 'Storage is down.', meta: {} }, meta: {} })
  })

  it("is believed by the browser only whole: a missing or misplaced meta, a refusal of no known kind, a result beside a refusal, or no object at all is storage_unavailable", async () => {
    const refusal = { kind: 'bad_option', message: 'Nope.' }
    const bodies: unknown[] = [
      { result: null }, { result: null, meta: [] }, { result: null, meta: { surprise: 1 } }, { meta: {} },
      { refusal: { kind: 'invented_kind', message: 'x' }, meta: {} }, { refusal: { kind: 'bad_option' }, meta: {} },
      { refusal: { ...refusal, meta: { box_stored: null } }, meta: {} }, { refusal: { ...refusal, meta: { box_listed: null, extra: 1 } }, meta: {} },
      { refusal, result: null, meta: {} }, { refusal: 'bad_option', meta: {} }, [], null, 'result',
    ]
    for (const body of bodies) {
      const broken = new RouteVaultDB(() => Promise.resolve(Response.json(body)))
      await TH.expectBad(broken.getVault(TH.scopeOf('u1')), 'storage_unavailable')
    }
  })

  it("rethrows a refusal's kind and message, and merges its main meta with its own", async () => {
    const wayinListed = { wayinkind: 'passphrase', device_id: 'dev1', registered_at: 1_760_000_000_000, vault_tok: 'tok1' }
    const body = { refusal: { kind: 'damaged_wayin', message: 'Damaged.', meta: { wayin_listed: wayinListed } }, meta: { vault_stored: null } }
    const browser = new RouteVaultDB(() => Promise.resolve(Response.json(body)))
    let thrown: unknown = null
    try {
      await (browser as unknown as { call: (verb: string) => Promise<unknown> }).call('getVault')
    } catch (err) {
      thrown = err
    }
    expect(thrown).to.be.instanceOf(VaultError)
    const refusal = thrown as VaultError
    expect(refusal.refusalkind).to.eq('damaged_wayin')
    expect(refusal.message).to.eq('Damaged.')
    expect(refusal.meta).to.deep.equal({ vault_stored: null, wayin_listed: wayinListed })
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
