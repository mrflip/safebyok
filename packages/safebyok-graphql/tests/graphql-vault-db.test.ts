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

/** The answer a server over a MemoryVaultDB with the test bank born, and a box of each of `labels` under its root box, sends for `ask` by `document`, as it crosses. */
async function servedOf(document: string, ask: object, labels: readonly string[] = []): Promise<Record<string, unknown>> {
  const memory = new DB.MemoryVaultDB()
  await TH.expectGood(memory.tryBirthBank(TH.birthBankAskOf()))
  for (const label of labels) {
    const birth = TH.birthAskOf(TH.boxThingOf(label), DB.Shell.childCited(TH.Life0))
    await TH.expectGood(memory.tryWriteThing(birth))
  }
  const result = await graphql({ schema: TH.schemaOver(memory), source: document, variableValues: { ask: TH.overTheWire(ask) }, contextValue: { userid: 'u1' } })
  const [answer] = Object.values(TH.overTheWire(result.data) as Record<string, unknown>)
  return answer as Record<string, unknown>
}

/** The answer a server over an empty MemoryVaultDB sends for the test bank's birth, as it crosses. */
async function servedBirth(): Promise<Record<string, unknown>> {
  const result = await graphql({ schema: TH.schemaOver(new DB.MemoryVaultDB()), source: VaultOperations.birthBank, variableValues: { ask: TH.overTheWire(TH.birthBankAskOf()) }, contextValue: { userid: 'u1' } })
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

  it("refuses an answer that is not one a server sends, as storage_issue", async () => {
    const served = await servedOf(VaultOperations.getThing, TH.getGateAskOf())
    for (const malformed of [{ ok: true }, { ...served, act: 'gotsomething' }, { ...served, err: bareCrossedErrOf('bad_record', 'No') }]) {
      const { vaultDB } = fakeClient({ data: { safebyokGetThing: malformed } })
      await TH.expectBad(vaultDB.tryGetThing(TH.getGateAskOf()), 'storage_issue')
    }
  })

  it("refuses a Thing other than the one at the ask's scope", async () => {
    const served = await servedOf(VaultOperations.getThing, TH.getGateAskOf())
    const cases = [[TH.rootBoxOf(), 'incompatible_row'], [TH.gateThingOf({ userid: 'u2' }), 'storage_issue']] as const
    for (const [val, refusalkind] of cases) {
      const { vaultDB } = fakeClient({ data: { safebyokGetThing: { ...served, val } } })
      await TH.expectBad(vaultDB.tryGetThing(TH.getGateAskOf()), refusalkind)
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
      [TH.getAskAt('box/openai', 'fail'), { ...failed, act: 'stale' }],
    ] as const
    for (const [ask, misfit] of misfits) {
      const { vaultDB } = fakeClient({ data: { safebyokGetThing: misfit } })
      await TH.expectBad(vaultDB.tryGetThing(ask), 'storage_issue')
    }
  })

  it("answers the shell a server names under the lives above it", async () => {
    const voided = await servedOf(VaultOperations.getThing, TH.getAskAt('box/openai'))
    expect(voided['dbhas']).to.deep.eq(DB.Shell.under(TH.BoxScope, TH.rootBoxOf()))
    const { vaultDB } = fakeClient({ data: { safebyokGetThing: voided } })
    expect(await vaultDB.tryGetThing(TH.getAskAt('box/openai'))).to.deep.include({ ok: true, act: 'gotvoid', dbhas: voided['dbhas'] })
  })

  it("refuses a shell that is no shell of the ask's labelpath, as storage_issue", async () => {
    const voided = await servedOf(VaultOperations.getThing, TH.getAskAt('box/openai'))
    const shell  = voided['dbhas'] as DB.VoidSentinel
    const misfits = [
      { ...shell, lifepath: `${TH.Life0}/${TH.Life0}/${DB.Shell.VoidLifeseq}` },
      { ...shell, lifepath: 7 },
      { ...shell, labelpath: 'box/openai/x', label: 'x', lifepath: `${TH.Life0}/${TH.Life0}/${DB.Shell.VoidLifeseq}` },
    ]
    for (const dbhas of misfits) {
      const { vaultDB } = fakeClient({ data: { safebyokGetThing: { ...voided, dbhas } } })
      await TH.expectBad(vaultDB.tryGetThing(TH.getAskAt('box/openai')), 'storage_issue')
    }
  })

  const OtherShellCases = [
    // a shell of the wrong Thing:
    [DB.Shell.under({ ...TH.BoxScope, labelpath: 'box/anthropic' }, TH.rootBoxOf()), "a sibling's shell, well formed at its own scope"],
    [DB.Shell.under(TH.RootScope, null),                                             "the shell of the Thing above the ask's, well formed at its own scope"],
  ] as const

  describe("a get's shell", () => {
    for (const [dbhas, blurb] of OtherShellCases) {
      it(`refuses ${blurb}, as storage_issue`, async () => {
        const voided = await servedOf(VaultOperations.getThing, TH.getAskAt('box/openai'))
        const { vaultDB } = fakeClient({ data: { safebyokGetThing: { ...voided, dbhas } } })
        await TH.expectBad(vaultDB.tryGetThing(TH.getAskAt('box/openai')), 'storage_issue')
      })
    }
  })

  it("answers a write's refusal with the act its own tables find for the Thing the server names", async () => {
    const refused = await servedOf(VaultOperations.writeThing, TH.birthAskOf())
    const gateNext = TH.nextGateOf(TH.gateThingOf())
    expect(refused).to.deep.include({ ok: false, act: 'retcon', dbhas: TH.gateThingOf() })
    const cases = [
      [refused,                         'retcon', TH.gateThingOf()],
      [{ ...refused, act: 'stale' },    'retcon', TH.gateThingOf()],
      [{ ...refused, dbhas: gateNext }, 'stale',  gateNext],
    ] as const
    for (const [answer, act, dbhas] of cases) {
      const { vaultDB } = fakeClient({ data: { safebyokWriteThing: answer } })
      expect(await vaultDB.tryWriteThing(TH.birthAskOf())).to.deep.include({ ok: false, act, dbhas })
    }
  })

  it("refuses a write whose Thing does not bear out whether the server wrote, as storage_issue", async () => {
    const refused = await servedOf(VaultOperations.writeThing, TH.birthAskOf())
    const written = { ...refused, ok: true, act: 'born', dbhas: null, err: null }
    const misfits = [
      { ...refused, act: 'born' },
      { ...refused, dbhas: DB.Shell.of(TH.GateScope) },
      { ...written, val: TH.nextGateOf(TH.gateThingOf()) },
      { ...written, val: DB.Shell.of(TH.GateScope) },
    ]
    for (const misfit of misfits) {
      const { vaultDB } = fakeClient({ data: { safebyokWriteThing: misfit } })
      await TH.expectBad(vaultDB.tryWriteThing(TH.birthAskOf()), 'storage_issue')
    }
  })

  it("answers a birth's refusal with the act its own tables find for the root the server names", async () => {
    // A birth over the same bank again is refused as retcon, so a stale refusal is made from that answer.
    const retconned = await servedOf(VaultOperations.birthBank, TH.birthBankAskOf())
    const gateNext  = TH.nextGateOf(TH.gateThingOf())
    const refused   = { ...retconned, act: 'stale', dbhas: gateNext }
    expect(retconned).to.deep.include({ ok: false, act: 'retcon' })
    for (const answer of [refused, { ...refused, act: 'clash' }]) {
      const { vaultDB } = fakeClient({ data: { safebyokBirthBank: answer } })
      expect(await vaultDB.tryBirthBank(TH.birthBankAskOf())).to.deep.include({ ok: false, act: 'stale', dbhas: gateNext })
    }
  })

  it("refuses a birth whose act its roots do not fit, as storage_issue", async () => {
    const born    = await servedBirth()
    const roots   = born['val'] as DB.RootRows
    const refused = { ...born, ok: false, act: 'stale', val: null, dbhas: TH.nextGateOf(TH.gateThingOf()), err: bareCrossedErrOf('bad_record', 'Stale') }
    const passed  = { ...born, act: 'passed', val: { ...roots, bank: TH.nextOf(TH.bankThingOf()) } }
    expect(born).to.deep.include({ ok: true, act: 'born' })
    const misfits = [
      { ...refused, act: 'born' },
      { ...refused, dbhas: TH.boxThingOf() },
      { ...refused, dbhas: DB.Shell.of(TH.GateScope) },
      { ...born, val: { ...roots, gate: TH.nextGateOf(TH.gateThingOf()) } },
      { ...born, val: { ...roots, root: DB.Shell.of(TH.RootScope) } },
      { ...born, val: { ...roots, root: TH.rootBoxOf({ userid: 'u2' }) } },
      { ...born, val: { bank: roots.bank, gate: roots.gate } },
      { ...passed, val: { ...passed.val, root: DB.Shell.of(TH.RootScope) } },
    ]
    for (const misfit of misfits) {
      const { vaultDB } = fakeClient({ data: { safebyokBirthBank: misfit } })
      await TH.expectBad(vaultDB.tryBirthBank(TH.birthBankAskOf()), 'storage_issue')
    }
  })

  it("answers a world's roots as the server sent them, the shell where none is stored", async () => {
    const served = await servedOf(VaultOperations.getWorld, TH.getWorldAskOf())
    const shells = { bank: DB.Shell.of(TH.BankScope), gate: DB.Shell.of(TH.GateScope), root: DB.Shell.of(TH.RootScope) }
    for (const val of [served['val'], shells]) {
      const { vaultDB } = fakeClient({ data: { safebyokGetWorld: { ...served, val } } })
      const roots = await TH.expectGood(vaultDB.tryGetWorld(TH.getWorldAskOf()))
      expect(roots).to.deep.eq(val)
    }
    const otherBank = { ...shells, bank: TH.bankThingOf({ userid: 'u2' }) }
    const { vaultDB } = fakeClient({ data: { safebyokGetWorld: { ...served, val: otherBank } } })
    await TH.expectBad(vaultDB.tryGetWorld(TH.getWorldAskOf()), 'storage_issue')
  })

  it("refuses a tracked with a root missing or a root not its own, as storage_issue", async () => {
    const served = await servedOf(VaultOperations.getThing, TH.getGateAskOf())
    const tracked = served['tracked'] as Record<string, unknown>
    const misfits = [
      { bank: tracked['bank'], gate: tracked['gate'] },
      { ...tracked, gate: TH.gateThingOf({ userid: 'u2' }) },
      { ...tracked, bank: 'different' },
    ]
    for (const misfit of misfits) {
      const { vaultDB } = fakeClient({ data: { safebyokGetThing: { ...served, tracked: misfit } } })
      await TH.expectBad(vaultDB.tryGetThing(TH.getGateAskOf()), 'storage_issue')
    }
  })

  it("answers a listing from the parent and children the server sent, in labelpath order", async () => {
    const served = await servedOf(VaultOperations.listThings, TH.listAskAt('box'), ['anthropic', 'openai'])
    const deltas = served['deltas'] as object[]
    for (const answer of [served, { ...served, deltas: deltas.toReversed() }]) {
      const { vaultDB } = fakeClient({ data: { safebyokListThings: answer } })
      const listing = await vaultDB.tryListThings(TH.listAskAt('box'))
      expect(listing).to.deep.include({ ok: true, deltas, incompatible_rows: [] })
      expect(listing).to.have.nested.property('val.items').that.has.keys('anthropic', 'openai')
    }
  })

  it("answers a child the server could not read among incompatible_rows", async () => {
    const served = await servedOf(VaultOperations.listThings, TH.listAskAt('box'), ['anthropic', 'openai'])
    const [first, second] = served['deltas'] as [object, DB.BoxSparse]
    const incompatible = { ...TH.ThingBank, labelpath: second.labelpath, am: 'd' }
    const { vaultDB } = fakeClient({ data: { safebyokListThings: { ...served, deltas: [first], incompatible_rows: [incompatible] } } })
    expect(await vaultDB.tryListThings(TH.listAskAt('box'))).to.deep.include({ ok: true, deltas: [first], incompatible_rows: [incompatible] })
  })

  it("refuses a listing whose parent or children do not fit its ask, as storage_issue", async () => {
    const served = await servedOf(VaultOperations.listThings, TH.listAskAt('box'), ['anthropic', 'openai'])
    const [first, second] = served['deltas'] as [object, DB.BoxSparse]
    const misfits = [
      { ...served, deltas: [first, { ...second, userid: 'u2' }] },
      { ...served, deltas: [first, { ...second, labelpath: 'box/openai/x', label: 'x' }] },
      { ...served, deltas: [first, TH.gateThingOf()] },
      { ...served, incompatible_rows: [{ ...TH.ThingBank, labelpath: 'gate', am: 'd' }] },
      { ...served, parentage: [] },
      { ...served, ok: false, act: 'gone', dbhas: (served['parentage'] as object[])[0], err: bareCrossedErrOf('bad_record', 'Gone') },
    ]
    for (const misfit of misfits) {
      const { vaultDB } = fakeClient({ data: { safebyokListThings: misfit } })
      await TH.expectBad(vaultDB.tryListThings(TH.listAskAt('box')), 'storage_issue')
    }
  })

  it("refuses a listing whose parent is of another kind, as incompatible_row", async () => {
    const served = await servedOf(VaultOperations.listThings, TH.listAskAt('box'), ['openai'])
    const { vaultDB } = fakeClient({ data: { safebyokListThings: { ...served, parentage: [TH.gateThingOf()] } } })
    await TH.expectBad(vaultDB.tryListThings(TH.listAskAt('box')), 'incompatible_row')
  })

  it("answers a good answer as the server's vaultDB did", async () => {
    const served = await servedOf(VaultOperations.getThing, TH.getGateAskOf())
    const { vaultDB } = fakeClient({ data: { safebyokGetThing: { __typename: 'SafebyokThingAnswer', ...served } } })
    const record = await TH.expectGood(vaultDB.tryGetThing(TH.getGateAskOf()))
    expect(record).to.deep.eq(TH.gateThingOf())
  })

  it("answers a refusal the server's verb threw as it did there, with its act", async () => {
    const served = await servedOf(VaultOperations.writeThing, TH.birthAskOf())
    const err = { refusalkind: 'bad_record', message: 'A storage policy refused it', meta: { oplabel: 'writeThing', act: 'policied', capacity: null, fieldnames: ['wayins'], labelpaths: null } }
    const thrown = { ...served, ok: false, act: 'policied', tracked: 'unread', val: null, dbhas: null, err }
    const { vaultDB } = fakeClient({ data: { safebyokWriteThing: thrown } })
    const answer = await vaultDB.tryWriteThing(TH.birthAskOf())
    const refusal = await TH.expectBad(answer, 'bad_record')
    expect(answer).to.deep.include({ act: 'policied', dbhas: null })
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

// == [A server of its own]: DamagedVaultDB, sessionStoreDown, browserOverSessionStoreDown

/** A vaultDB whose datastore holds a Thing it cannot read. */
class DamagedVaultDB extends DB.MemoryVaultDB {
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
    const served = await new DamagedVaultDB().tryGetThing(TH.getGateAskOf())
    const answer = await TH.browserOver(TH.schemaOver(new DamagedVaultDB())).tryGetThing(TH.getGateAskOf())
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
