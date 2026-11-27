/** GraphQLVaultDB on a client of its own: what it makes of a server's trouble, of an answer that is not what was asked, and of a watch's stream. */

import { describe, expect, it, vi } from 'vitest'
import { Client, CombinedError } from '@urql/core'
import { GraphQLError, graphql } from 'graphql'
import * as DB from 'safebyok/storage'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { GraphQLVaultDB, VaultOperations } from '../src/index'
import { VaultSchemaSdl, vaultResolvers } from '../src/server'
import * as Phrases from '../src/phrases'
import * as TH from './test-helpers'

// == [A client of its own]: FakeResult, fakeClient, watched, servedOf, gotNotice, revokedNotice

/** The result one call of a fake client returns, shaped like urql's `OperationResult`. */
type FakeResult = { data?: unknown, error?: CombinedError, hasNext?: boolean }

/** Make a GraphQLVaultDB on a fake urql Client. Queries and mutations resolve `asked`.
 * Each subscription's callback is pushed to `streams` for the test to call, after first receiving `atOnce` if given.
 * `counts.unsubscribed` counts the unsubscribes.
 */
function fakeClient(asked: FakeResult = {}, atOnce?: FakeResult) {
  const streams: ((result: FakeResult) => void)[] = []
  const counts = { unsubscribed: 0 }
  const client = {
    query:        () => ({ toPromise: () => Promise.resolve(asked) }),
    mutation:     () => ({ toPromise: () => Promise.resolve(asked) }),
    subscription: () => ({
      subscribe: (onResult: (result: FakeResult) => void) => {
        streams.push(onResult)
        if (atOnce !== undefined) { onResult(atOnce) }
        return { unsubscribe: () => { counts.unsubscribed += 1 } }
      },
    }),
  }
  return { vaultDB: new GraphQLVaultDB({ client: client as never }), streams, counts }
}

/** Start a watch on a fake client. `told` logs, in order, each Thing heard (by labelpath), `'ended'`, and each bad news (by refusalkind); `badnews` keeps the bad news. */
function watched(atOnce?: FakeResult) {
  const { vaultDB, streams, counts } = fakeClient({}, atOnce)
  const told: string[] = []
  const badnews: DB.VaultError[] = []
  const stop = vaultDB.watch(TH.ThingBank, (event) => {
    told.push((event.eventkind === 'item') ? event.val.labelpath : event.eventkind)
  }, (news) => {
    told.push(news.refusalkind)
    badnews.push(news)
  }, () => { told.push('ended') })
  return { streams, counts, told, badnews, stop }
}

/** The answer a server over a MemoryVaultDB with the test bank born sends for `ask` by `document`, as it crosses. */
async function servedOf(document: string, ask: object): Promise<Record<string, unknown>> {
  const memory = new DB.MemoryVaultDB()
  await TH.expectGood(memory.tryBirthBank(TH.birthBankAskOf()))
  const result = await graphql({ schema: TH.schemaOver(memory), source: document, variableValues: { ask: TH.overTheWire(ask) }, contextValue: { userid: 'u1' } })
  const [answer] = Object.values(TH.overTheWire(result.data) as Record<string, unknown>)
  return answer as Record<string, unknown>
}

/** A refusal as it crosses, with no meta. */
function bareCrossedErrOf(refusalkind: DB.Refusalkind, message: string) { return { refusalkind, message, meta: null } }

const gotNotice     = { safebyokWatchThings: { __typename: 'SafebyokNotice', record: TH.gateThingOf(), banktok: TH.SenderKnows.banktok, read_tc: DB.readTcNow(), err: null, isEnded: false } }
const troubleNotice = { safebyokWatchThings: { record: null, banktok: null, read_tc: null, err: bareCrossedErrOf('storage_unavailable', 'The datastore hiccuped'), isEnded: false } }
const revokedNotice = { safebyokWatchThings: { record: null, banktok: null, read_tc: null, err: bareCrossedErrOf('identity_revoked', 'Signed out'), isEnded: true } }
// --

// == [Misanswers]: VerbsByField, Served, refusedOf, MisanswerCases

/** Each verb by the root field that answers it: the document a GraphQLVaultDB sends, and the call of its verb. */
const VerbsByField = {
  safebyokGetThing:   { document: VaultOperations.getThing,   call: async (vaultDB: DB.VaultDB, ask: object) => await vaultDB.tryGetThing(ask as DB.GetAsk) },
  safebyokWriteThing: { document: VaultOperations.writeThing, call: async (vaultDB: DB.VaultDB, ask: object) => await vaultDB.tryWriteThing(ask as DB.WriteAsk) },
  safebyokListThings: { document: VaultOperations.listThings, call: async (vaultDB: DB.VaultDB, ask: object) => await vaultDB.tryListThings(ask as DB.ListAsk) },
  safebyokBirthBank:  { document: VaultOperations.birthBank,  call: async (vaultDB: DB.VaultDB, ask: object) => await vaultDB.tryBirthBank(ask as DB.BirthBankAsk) },
  safebyokGetWorld:   { document: VaultOperations.getWorld,   call: async (vaultDB: DB.VaultDB, ask: object) => await vaultDB.tryGetWorld(ask as DB.GetWorldAsk) },
  safebyokStats:      { document: VaultOperations.stats,      call: async (vaultDB: DB.VaultDB, ask: object) => await vaultDB.tryStats(ask as DB.StatsAsk) },
} as const

/** An answer as it crossed, by field. */
type Served = Record<string, unknown>

/** `served` made a refusal naming `dbhas`, as a verb that threw answers. */
function refusedOf(served: Served, dbhas: unknown): Served {
  return { ...served, ok: false, act: 'unclassified_storing', tracked: 'unread', val: null, dbhas, err: bareCrossedErrOf('storage_issue', 'No') }
}

const ForeignGate = TH.gateThingOf({ userid: 'u2' })
const ChildOfGate = { ...TH.ThingBank, labelpath: 'gate/zz', am: 'd' }
const ParentOfOpenai = TH.boxThingOf('openai')
const MisplacedRoots = { bank: TH.bankThingOf(), gate: TH.rootBoxOf(), root: TH.rootBoxOf() }

// Each case: the root field, an ask over the born test bank, how the server's answer to it is altered, and the blurb.
const MisanswerCases = [
  // what no vaultDB answers:
  ["safebyokGetThing",   TH.getGateAskOf(),          () => ({ ok: true }),                                                                    'an answer missing its fields'],
  ["safebyokGetThing",   TH.getGateAskOf(),          (served: Served) => ({ ...served, act: 'gotsomething' }),                               'a get of an act no vaultDB answers'],
  ["safebyokGetThing",   TH.getGateAskOf(),          (served: Served) => ({ ...served, dbhas: TH.gateThingOf() }),                           'a live get that also names a dbhas'],
  ["safebyokGetThing",   TH.getGateAskOf(),          (served: Served) => ({ ...served, val: { labelpath: 'gate' } }),                        'a get of a Thing with no revision'],
  ["safebyokGetThing",   TH.getGateAskOf(),          (served: Served) => ({ ...served, err: bareCrossedErrOf('bad_record', 'No') }),         'a good answer carrying a refusal'],
  ["safebyokListThings", TH.listAskAt('box'),        (served: Served) => ({ ...served, parentage: [] }),                                     'a good listing with no parent'],
  // a Thing where the ask reaches none:
  ["safebyokGetThing",   TH.getGateAskOf(),          (served: Served) => ({ ...served, val: TH.rootBoxOf() }),                               "a get's Thing at another labelpath"],
  ["safebyokGetThing",   TH.getGateAskOf(),          (served: Served) => ({ ...served, val: ForeignGate }),                                  "a get's Thing in another user's bank"],
  ["safebyokGetThing",   TH.getAskAt('box/openai'),  (served: Served) => ({ ...served, dbhas: DB.Shell.of(TH.GateScope) }),                  "a void get's shell at another labelpath"],
  ["safebyokGetThing",   TH.getGateAskOf(),          (served: Served) => refusedOf(served, TH.rootBoxOf()),                                  "a get's refusal naming a Thing at another labelpath"],
  ["safebyokGetThing",   TH.getGateAskOf(),          (served: Served) => ({ ...served, tracked: { ...(served['tracked'] as object), bank: TH.gateThingOf() } }), 'a tracked root at another labelpath'],
  ["safebyokWriteThing", TH.birthAskOf(),            (served: Served) => ({ ...served, dbhas: ForeignGate }),                                "a write's refusal naming a Thing in another user's bank"],
  ["safebyokListThings", TH.listAskAt('box'),        (served: Served) => ({ ...served, parentage: [TH.gateThingOf()] }),                     "a listing's parent at another labelpath"],
  ["safebyokListThings", TH.listAskAt('box'),        (served: Served) => ({ ...served, deltas: [TH.gateThingOf()] }),                        "a listing's child under another parent"],
  ["safebyokListThings", TH.listAskAt('box'),        (served: Served) => ({ ...served, deltas: [TH.boxThingOf('zz', { userid: 'u2' })] }),   "a listing's child in another user's bank"],
  ["safebyokListThings", TH.listAskAt('box'),        (served: Served) => ({ ...served, incompatible_rows: [ChildOfGate] }),                  "a listing's incompatible child under another parent"],
  ["safebyokListThings", TH.listAskAt('box'),        (served: Served) => ({ ...served, val: { ...(served['val'] as object), parentpath: 'gate' } }),            "a good listing's kids of another parentpath"],
  ["safebyokListThings", TH.listAskAt('box'),        (served: Served) => ({ ...served, val: { ...(served['val'] as object), parentlife: '9' } }),                "a good listing's kids of another parentlife than its parent's"],
  ["safebyokListThings", TH.listAskAt('box/openai'), (served: Served) => ({ ...served, ok: true, act: 'gotlive', err: null, dbhas: null, parentage: [ParentOfOpenai], deltas: [{ ...ParentOfOpenai, labelpath: 'box/openai/zz', label: 'zz' }], val: { modelkind: 'kids', parentpath: 'box/openai', parentlife: ParentOfOpenai.lifepath, items: {}, gones: {}, read_tc: served['read_tc'] } }), "a listing's child too deep to be of the ask's modelkind"],
  ["safebyokListThings", TH.listAskAt('box/openai'), (served: Served) => ({ ...served, parentage: [TH.gateThingOf()] }),                                                                                                       "a refused listing's parentage at another labelpath"],
  ["safebyokBirthBank",  TH.birthBankAskOf(),        (served: Served) => ({ ...served, ok: true, act: 'born', dbhas: null, err: null, val: MisplacedRoots }), "a birth's root at another root's labelpath"],
  ["safebyokBirthBank",  TH.birthBankAskOf(),        (served: Served) => ({ ...refusedOf(served, TH.boxThingOf()), act: 'stale' }),          "a birth's refusal naming a Thing that is no root"],
  ["safebyokGetWorld",   TH.getWorldAskOf(),         (served: Served) => ({ ...served, val: { ...(served['val'] as object), gate: ForeignGate } }),     "a world's root in another user's bank"],
  ["safebyokStats",      TH.statsAskOf(),            (served: Served) => refusedOf(served, TH.boxThingOf()),                                 "a stats' refusal naming a Thing that is no root"],
] as const
// --

describe("GraphQLVaultDB's constructor", () => {
  it("refuses a client it cannot use", () => {
    const client = new Client({ url: 'https://app.example.test/api/graphql', exchanges: [] })
    for (const opts of [{}, { client: { query: () => client } }, { client: 'urql' }]) {
      TH.expectSyncRefusal(() => new GraphQLVaultDB(opts as never), 'bad_record')
    }
  })

  it("is a vaultDB", () => {
    const client = new Client({ url: 'https://app.example.test/api/graphql', exchanges: [] })
    expect(DB.isVaultDB(new GraphQLVaultDB({ client }))).to.be.true
  })
})

describe("GraphQLVaultDB's answers off the wire", () => {
  it("refuses a GraphQL error with no cause", async () => {
    const combined = new CombinedError({ graphQLErrors: [new GraphQLError('Variable "$ask" got invalid value { whisper: "the record sent" }')] })
    const { vaultDB } = fakeClient({ error: combined })
    const answer = await vaultDB.tryGetThing(TH.getGateAskOf())
    const err = await TH.expectBad(answer, 'unexpected_error')
    expect(answer).to.deep.include({ act: 'unclassified_storing', tracked: 'unread' })
    expect(err.message).to.eq(Phrases.ServerErred)
    expect(err.cause).to.be.undefined
    expect(err.meta).to.deep.include({ oplabel: 'getThing' })
  })

  it("refuses with the refusal a GraphQL error carries across, as the server made it", async () => {
    const crossed = { refusalkind: 'unexpected_error', message: 'Something unexpected went wrong', meta: { oplabel: null, act: null, capacity: null, fieldnames: null, labelpaths: null } }
    for (const combined of [
      new CombinedError({ graphQLErrors: [new GraphQLError(crossed.message, { extensions: { safebyokErr: crossed } })] }),
      new CombinedError({ networkError: new GraphQLError(crossed.message, { extensions: { safebyokErr: crossed } }) }),
    ]) {
      const { vaultDB } = fakeClient({ error: combined })
      const answer = await vaultDB.tryGetThing(TH.getGateAskOf())
      const err = await TH.expectBad(answer, 'unexpected_error')
      expect(answer).to.deep.include({ act: 'unclassified_storing', tracked: 'unread' })
      expect(err.message).to.eq(crossed.message)
    }
  })

  it("refuses a GraphQL error that carries a refusal it cannot read, as storage_issue", async () => {
    const combined = new CombinedError({ graphQLErrors: [new GraphQLError('No', { extensions: { safebyokErr: { refusalkind: 'datastore_sad', message: 'No' } } })] })
    const { vaultDB } = fakeClient({ error: combined })
    await TH.expectBad(vaultDB.tryGetThing(TH.getGateAskOf()), 'storage_issue')
  })

  it("refuses a failed request with a cause that carries only the error's name, HTTP status and code", async () => {
    const networkError = new Error('{"whisper_ciphered":"the record sent"}', { cause: { code: 'ECONNRESET', detail: 'the record sent' } })
    const combined = new CombinedError({ networkError, response: { status: 502, body: 'the record sent' } })
    const { vaultDB } = fakeClient({ error: combined })
    const err = await TH.expectBad(vaultDB.tryWriteThing(TH.birthAskOf()), 'storage_unavailable')
    const cause = err.cause as Error
    expect(cause).not.to.be.instanceOf(CombinedError)
    expect(cause).to.include({ thrownName: 'Error', status: 502, code: 'ECONNRESET' })
    expect(cause.cause).to.be.undefined
    expect(JSON.stringify([cause.message, cause.stack, Object.entries(cause)])).not.to.include('the record sent')
  })

  it("names only the error a request failed on, where it has no status or code", async () => {
    const { vaultDB } = fakeClient({ error: new CombinedError({ networkError: new TypeError('Failed to fetch') }) })
    const err = await TH.expectBad(vaultDB.tryStats(TH.statsAskOf()), 'storage_unavailable')
    expect(err.cause).to.deep.include({ thrownName: 'TypeError' })
    expect(err.cause).not.to.have.any.keys('status', 'code')
  })

  it("refuses a server serving some other schema", async () => {
    const { vaultDB } = fakeClient({ data: { somethingElse: 1 } })
    const err = await TH.expectBad(vaultDB.tryGetWorld(TH.getWorldAskOf()), 'unexpected_error')
    expect(err.message).to.eq(Phrases.SchemaNotServed)
  })

  it("answers a good answer as the server's vaultDB did, without the null its wire form gives what it lacks", async () => {
    const served = await servedOf(VaultOperations.getThing, TH.getGateAskOf())
    const { vaultDB } = fakeClient({ data: { safebyokGetThing: { __typename: 'SafebyokThingAnswer', ...served } } })
    const answer = await vaultDB.tryGetThing(TH.getGateAskOf())
    const { dbhas: _dbhas, err: _err, ...beside } = served
    expect(answer).to.deep.eq({ ...beside, ask: DB.loggableAskOf(TH.getGateAskOf()) })
  })

  it("answers a refusal as the server's vaultDB made it, with its act and the Thing it names", async () => {
    const served = await servedOf(VaultOperations.writeThing, TH.birthAskOf())
    const err = { refusalkind: 'bad_record', message: 'A storage policy refused it', meta: { oplabel: 'writeThing', act: 'policied', capacity: null, fieldnames: ['wayins'], labelpaths: null } }
    const { vaultDB } = fakeClient({ data: { safebyokWriteThing: { ...served, act: 'policied', err } } })
    const answer = await vaultDB.tryWriteThing(TH.birthAskOf())
    const refusal = await TH.expectBad(answer, 'bad_record')
    expect(answer).to.deep.include({ act: 'policied', dbhas: TH.gateThingOf() })
    expect(answer).not.to.have.property('val')
    expect(refusal.message).to.eq('A storage policy refused it')
    expect(refusal.meta).to.deep.include({ act: 'policied', fieldnames: ['wayins'], ask: DB.loggableAskOf(TH.birthAskOf()) })
  })

  it("deeply freezes each record it answers", async () => {
    const served = await servedOf(VaultOperations.getWorld, TH.getWorldAskOf())
    const { vaultDB } = fakeClient({ data: { safebyokGetWorld: served } })
    const roots = await TH.expectGood(vaultDB.tryGetWorld(TH.getWorldAskOf()))
    expect(Object.isFrozen(roots)).to.be.true
    expect(Object.isFrozen(roots.gate)).to.be.true
    expect(Object.isFrozen((roots.gate as DB.GateRecord).wayins)).to.be.true
  })

  it("refuses an ask that fails its check without sending it", async () => {
    const asked = vi.fn()
    const client = { query: asked, mutation: asked, subscription: asked }
    const answer = await new GraphQLVaultDB({ client: client as never }).tryGetThing({ ...TH.getGateAskOf(), labelpath: 'gate/x/y' })
    await TH.expectBad(answer, 'bad_record')
    expect(asked).not.toHaveBeenCalled()
  })

  for (const [fieldname, ask, alter, blurb] of MisanswerCases) {
    it(`refuses ${blurb}`, async () => {
      const { document, call } = VerbsByField[fieldname]
      const served   = await servedOf(document, ask)
      const answered = await call(fakeClient({ data: { [fieldname]: served } }).vaultDB, ask)
      expect(answered.ok, 'as served').to.eq(served['ok'])
      const misanswered = fakeClient({ data: { [fieldname]: alter(served) } }).vaultDB
      await TH.expectBad(call(misanswered, ask), 'storage_issue')
    })
  }
})

describe("GraphQLVaultDB's watch", () => {
  it("hears each notice once", async () => {
    const { streams, told, stop } = watched()
    streams[0]?.({ data: gotNotice, hasNext: true })
    streams[0]?.({ data: gotNotice, hasNext: true })
    stop()
    await Promise.resolve()
    expect(told).to.deep.eq(['gate'])
  })

  it("ends a stream the server closes, once: onEnded, then why, and never resubscribes", async () => {
    const { streams, counts, told, badnews, stop } = watched()
    streams[0]?.({ data: gotNotice, hasNext: true })
    streams[0]?.({ data: gotNotice, hasNext: false })
    streams[0]?.({ hasNext: false })
    await Promise.resolve()
    stop()
    expect(streams).to.have.lengthOf(1)
    expect(told).to.deep.eq(['gate', 'ended', 'storage_unavailable'])
    expect(badnews[0]).to.include({ message: Phrases.WatchEnded })
    expect(counts.unsubscribed).to.be.greaterThanOrEqual(1)
  })

  it("ends at the notice the server marks as its last, with the refusal it carries", async () => {
    const { streams, counts, told, badnews } = watched()
    streams[0]?.({ data: revokedNotice, hasNext: true })
    streams[0]?.({ data: gotNotice, hasNext: false })
    await Promise.resolve()
    expect(told).to.deep.eq(['ended', 'identity_revoked'])
    expect(badnews[0]).to.include({ message: 'Signed out' })
    expect(counts.unsubscribed).to.eq(1)
  })

  it("passes on bad news the server does not mark as the last, and goes on", async () => {
    const { streams, told, stop } = watched()
    streams[0]?.({ data: troubleNotice, hasNext: true })
    streams[0]?.({ data: { safebyokWatchThings: { nonsense: 1 } }, hasNext: true })
    streams[0]?.({ data: gotNotice, hasNext: true })
    stop()
    await Promise.resolve()
    expect(told).to.deep.eq(['storage_unavailable', 'storage_issue', 'gate'])
  })

  it("tells a notice of a Thing in another user's bank as bad news, not a notice", async () => {
    const { streams, told, stop } = watched()
    streams[0]?.({ data: { safebyokWatchThings: { ...gotNotice.safebyokWatchThings, record: ForeignGate } }, hasNext: true })
    stop()
    await Promise.resolve()
    expect(told).to.deep.eq(['storage_issue'])
  })

  it("tells what its notice handler throws as bad news, and goes on", async () => {
    const { vaultDB, streams } = fakeClient()
    const told: string[] = []
    const stop = vaultDB.watch(TH.ThingBank, (event) => {
      told.push((event.eventkind === 'item') ? event.val.labelpath : event.eventkind)
      throw new Error('A bug in the host')
    }, (news) => { told.push(news.refusalkind) })
    streams[0]?.({ data: gotNotice, hasNext: true })
    streams[0]?.({ data: { safebyokWatchThings: { ...gotNotice.safebyokWatchThings, read_tc: DB.readTcNow() } }, hasNext: true })
    stop()
    await Promise.resolve()
    expect(told).to.deep.eq(['gate', 'unexpected_error', 'gate', 'unexpected_error'])
  })

  it("hands on each notice's Thing deeply frozen, with the banktok and read_tc it crossed with", () => {
    const { vaultDB, streams } = fakeClient()
    const heard: DB.VaultEvent[] = []
    const stop = vaultDB.watch(TH.ThingBank, (event) => { heard.push(event) }, () => undefined)
    streams[0]?.({ data: gotNotice, hasNext: true })
    stop()
    const [event] = heard
    expect(event).to.deep.include({ eventkind: 'item', labelpath: 'gate', val: TH.gateThingOf(), banktok: TH.SenderKnows.banktok, read_tc: gotNotice.safebyokWatchThings.read_tc })
    expect(Object.isFrozen((event as DB.VaultItemEvent).val)).to.be.true
  })

  it("refuses a watch of a scope that fails its check, without subscribing", () => {
    const { vaultDB, streams } = fakeClient()
    TH.expectSyncRefusal(() => vaultDB.watch({ ...TH.ThingBank, userid: '' }, () => undefined, () => undefined), 'bad_record')
    expect(streams).to.have.lengthOf(0)
  })

  it("ends a failed request once, with a cause that names only the error", async () => {
    const { streams, told, badnews } = watched()
    streams[0]?.({ error: new CombinedError({ networkError: new TypeError('Failed to fetch') }), hasNext: false })
    await Promise.resolve()
    expect(told).to.deep.eq(['ended', 'storage_unavailable'])
    expect(badnews[0]?.cause).to.include({ thrownName: 'TypeError' })
  })

  it("ends with the refusal a GraphQL error carries across", async () => {
    const crossed = { refusalkind: 'bad_record', message: 'A label is lowercase letters', meta: null }
    const { streams, told, badnews } = watched()
    streams[0]?.({ error: new CombinedError({ graphQLErrors: [new GraphQLError(crossed.message, { extensions: { safebyokErr: crossed } })] }), hasNext: false })
    await Promise.resolve()
    expect(told).to.deep.eq(['ended', 'bad_record'])
    expect(badnews[0]?.message).to.eq(crossed.message)
  })

  it("ends a GraphQL error once, with no cause, and stops the stream", async () => {
    const { streams, counts, told, badnews } = watched()
    streams[0]?.({ error: new CombinedError({ graphQLErrors: [new GraphQLError('Cannot query field')] }), hasNext: true })
    streams[0]?.({ data: gotNotice, hasNext: true })
    await Promise.resolve()
    expect(told).to.deep.eq(['ended', 'unexpected_error'])
    expect(badnews[0]?.message).to.eq(Phrases.ServerErred)
    expect(badnews[0]?.cause).to.be.undefined
    expect(counts.unsubscribed).to.eq(1)
  })

  it("tells nothing of a stream that ends after it was stopped", async () => {
    const { streams, counts, told, stop } = watched()
    stop()
    streams[0]?.({ hasNext: false })
    await Promise.resolve()
    expect(told).to.deep.eq([])
    expect(counts.unsubscribed).to.eq(1)
  })

  it("ends a stream that ends as soon as it starts once, after watch returns", async () => {
    const { counts, told, stop } = watched({ hasNext: false })
    expect(told).to.deep.eq([])
    await Promise.resolve()
    expect(told).to.deep.eq(['ended', 'storage_unavailable'])
    expect(counts.unsubscribed).to.eq(1)
    stop()
    expect(told).to.have.lengthOf(2)
  })
})

// == [A server of its own]: UnreadableVaultDB, sessionStoreDown, browserOverSessionStoreDown

/** A vaultDB whose datastore holds a Thing it cannot read. */
class UnreadableVaultDB extends DB.MemoryVaultDB {
  protected override doGetThing(): DB.GetManifest { throw DB.storageIssue() }
}

/** A getUserId whose session store is down. Its message has text that must never reach a browser. */
function sessionStoreDown(): never { throw new Error('The session store at sessions.internal is down') }

/** A browser over vaultResolvers whose getUserId fails, as where its session store is down. */
function browserOverSessionStoreDown(): GraphQLVaultDB {
  const resolvers = vaultResolvers({ vaultDB: new DB.MemoryVaultDB(), getUserId: sessionStoreDown })
  return TH.browserOver(makeExecutableSchema({ typeDefs: VaultSchemaSdl, resolvers }))
}
// --

describe("GraphQLVaultDB over vaultResolvers", () => {
  it("answers the bad answer the server's vaultDB gave, as it gave it", async () => {
    const served = await new UnreadableVaultDB().tryGetThing(TH.getGateAskOf())
    const answer = await TH.browserOver(TH.schemaOver(new UnreadableVaultDB())).tryGetThing(TH.getGateAskOf())
    const err = await TH.expectBad(answer, 'storage_issue')
    const servedErr = await TH.expectBad(served, 'storage_issue')
    expect(err.message).to.eq(servedErr.message)
    expect(answer).to.deep.include({ act: served.act, tracked: served.tracked })
  })

  it("refuses a request the server could not serve with its refusal, never its cause", async () => {
    const err = await TH.expectBad(browserOverSessionStoreDown().tryGetThing(TH.getGateAskOf()), 'unexpected_error')
    expect(err.cause).to.be.undefined
    expect(JSON.stringify([err.message, err.meta])).not.to.include('sessions.internal')
  })

  it("ends a watch the server could not serve, with its refusal", async () => {
    const told: string[] = []
    browserOverSessionStoreDown().watch(TH.ThingBank, () => { told.push('notice') }, (news) => { told.push(news.refusalkind) }, () => { told.push('ended') })
    await vi.waitFor(() => { expect(told).to.have.lengthOf(2) })
    expect(told).to.deep.eq(['ended', 'unexpected_error'])
  })
})
