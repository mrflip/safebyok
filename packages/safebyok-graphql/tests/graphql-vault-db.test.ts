/** GraphQLVaultDB on a client of its own: what it makes of a server's trouble, of an answer that is not what was asked, and of a watch's stream. */

import { describe, expect, it } from 'vitest'
import { Client, CombinedError } from '@urql/core'
import { GraphQLError, graphql } from 'graphql'
import * as DB from 'safebyok/storage'
import { GraphQLVaultDB, VaultOperations } from '../src/index'
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

  it("refuses an answer that is not one a server sends, as storage_issue", async () => {
    const served = await servedOf(VaultOperations.getThing, TH.getGateAskOf())
    for (const malformed of [{ ok: true }, { ...served, act: 'gotsomething' }, { ...served, err: bareCrossedErrOf('bad_record', 'No') }]) {
      const { vaultDB } = fakeClient({ data: { safebyokGetThing: malformed } })
      await TH.expectBad(vaultDB.tryGetThing(TH.getGateAskOf()), 'storage_issue')
    }
  })

  it("refuses a Thing at a scope other than the ask's, as storage_issue", async () => {
    const served = await servedOf(VaultOperations.getThing, TH.getGateAskOf())
    for (const val of [TH.rootBoxOf(), TH.gateThingOf({ userid: 'u2' })]) {
      const { vaultDB } = fakeClient({ data: { safebyokGetThing: { ...served, val } } })
      await TH.expectBad(vaultDB.tryGetThing(TH.getGateAskOf()), 'storage_issue')
    }
  })

  it("refuses a get whose act does not fit the Thing it carries, as storage_issue", async () => {
    const voided = await servedOf(VaultOperations.getThing, TH.getAskAt('box/openai'))
    const failed = await servedOf(VaultOperations.getThing, TH.getAskAt('box/openai', 'fail'))
    expect([voided['act'], failed['act']]).to.deep.eq(['gotvoid', 'void'])
    const misfits = [
      [TH.getAskAt('box/openai'),         { ...voided, act: 'gotlive', val: voided['dbhas'] }],
      [TH.getAskAt('box/openai'),         { ...voided, dbhas: TH.boxThingOf() }],
      [TH.getAskAt('box/openai'),         { ...voided, act: 'gotgone' }],
      [TH.getAskAt('box/openai', 'fail'), { ...failed, dbhas: TH.boxThingOf() }],
    ] as const
    for (const [ask, misfit] of misfits) {
      const { vaultDB } = fakeClient({ data: { safebyokGetThing: misfit } })
      await TH.expectBad(vaultDB.tryGetThing(ask), 'storage_issue')
    }
  })

  it("answers a good answer as the server's vaultDB did", async () => {
    const served = await servedOf(VaultOperations.getThing, TH.getGateAskOf())
    const { vaultDB } = fakeClient({ data: { safebyokGetThing: { __typename: 'SafebyokThingAnswer', ...served } } })
    const record = await TH.expectGood(vaultDB.tryGetThing(TH.getGateAskOf()))
    expect(record).to.deep.eq(TH.gateThingOf())
  })

  it("answers a refusal the server's verb threw as it did there, with its act and the Thing it names", async () => {
    const served = await servedOf(VaultOperations.writeThing, TH.birthAskOf())
    const err = { refusalkind: 'bad_record', message: 'A storage policy refused it', meta: { oplabel: 'writeThing', act: 'policied', capacity: null, fieldnames: ['wayins'], labelpaths: null } }
    const thrown = { ...served, ok: false, act: 'policied', tracked: 'unread', val: null, dbhas: TH.gateThingOf(), err }
    const { vaultDB } = fakeClient({ data: { safebyokWriteThing: thrown } })
    const answer = await vaultDB.tryWriteThing(TH.birthAskOf())
    const refusal = await TH.expectBad(answer, 'bad_record')
    expect(answer).to.deep.include({ act: 'policied', dbhas: TH.gateThingOf() })
    expect(refusal.message).to.eq('A storage policy refused it')
    expect(refusal.meta).to.deep.include({ act: 'policied', fieldnames: ['wayins'] })
  })

  it("refuses a refusal with an act no datastore reports, where the server's verb did not throw, as storage_issue", async () => {
    const served = await servedOf(VaultOperations.getThing, TH.getGateAskOf())
    const unthrown = { ...served, ok: false, act: 'unclassified_storing', val: null, dbhas: TH.gateThingOf(), err: bareCrossedErrOf('storage_issue', 'No') }
    const { vaultDB } = fakeClient({ data: { safebyokGetThing: unthrown } })
    const err = await TH.expectBad(vaultDB.tryGetThing(TH.getGateAskOf()), 'storage_issue')
    expect(err.message).not.to.eq('No')
  })
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

  it("ends a failed request once, with a cause that names only the error", async () => {
    const { streams, told, badnews } = watched()
    streams[0]?.({ error: new CombinedError({ networkError: new TypeError('Failed to fetch') }), hasNext: false })
    await Promise.resolve()
    expect(told).to.deep.eq(['ended', 'storage_unavailable'])
    expect(badnews[0]?.cause).to.include({ thrownName: 'TypeError' })
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
