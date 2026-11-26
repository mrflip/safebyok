/** vaultResolvers: which user reaches which bank, what each answer carries on the wire, and how a watch ends. */

import { describe, expect, it, vi } from 'vitest'
import { graphql, parse, subscribe } from 'graphql'
import type { GraphQLSchema } from 'graphql'
import { makeExecutableSchema } from '@graphql-tools/schema'
import * as DB from 'safebyok/storage'
import { VaultOperations } from '../src/index'
import { VaultSchemaSdl, vaultResolvers } from '../src/server'
import { CrossedErrExtension } from '../src/shapes/shapes-wire'
import * as TH from './test-helpers'

// == [Running]: runAsk, wireFormOf, watching, expectCarries

/** Run `document` with `ask` against `schema` signed in as `userid`, and return its one root field's answer after a JSON round trip. */
async function runAsk(schema: GraphQLSchema, document: string, ask: object, userid: DB.Userid | null = 'u1'): Promise<Record<string, unknown>> {
  const result = await graphql({ schema, source: document, variableValues: { ask: TH.overTheWire(ask) }, contextValue: { userid } satisfies TH.TestContext })
  expect(result.errors, document).to.be.undefined
  const [answer] = Object.values(TH.overTheWire(result.data) as Record<string, unknown>)
  return answer as Record<string, unknown>
}

/** A vaultDB's answer as it should cross: less its ask and a listing's kids, its refusal allowlisted, null for each field it lacks, its read_tc set aside. */
function wireFormOf({ ask: _ask, ...answer }: { ask: unknown, ok: boolean, err?: DB.VaultError, read_tc: string }): unknown {
  const wire: Record<string, unknown> = { val: null, dbhas: null, ...answer, err: answer.err ? DB.crossedErrOf(answer.err) : null }
  // A listing's kids do not cross: the client makes them again from its parentage and deltas.
  if (Object.hasOwn(answer, 'parentage')) { delete wire['val'] }
  return readTcMasked(TH.overTheWire(wire) as Record<string, unknown>)
}

/** `answer` with its read_tc set aside, once checked to be one. */
function readTcMasked(answer: Record<string, unknown>): Record<string, unknown> {
  expect(answer['read_tc']).to.match(TH.ReadTcPattern)
  return { ...answer, read_tc: TH.AnyReadTc }
}

/** The ask that births the box `label` under the born root box. */
function boxBirthAskOf(label = 'openai'): DB.WriteAsk {
  return TH.birthAskOf(TH.boxThingOf(label), DB.Shell.childCited(TH.Life0))
}

/** Subscribe to a watch of the test bank through `schema` as the session `context`. `nextNotice` returns the next notice off the wire, or null when the stream ends. */
async function watching(schema: GraphQLSchema, context: TH.TestContext) {
  const stream = await subscribe({ schema, document: parse(VaultOperations.watchThings), variableValues: { scope: { ...TH.ThingBank } }, contextValue: context })
  if (! ('next' in stream)) { throw new Error(`Expected a subscription, got ${JSON.stringify(stream)}`) }
  return {
    stream,
    nextNotice: async () => {
      const next = await stream.next()
      if (next.done === true) { return null }
      expect(next.value.errors).to.be.undefined
      return TH.overTheWire(next.value.data?.['safebyokWatchThings']) as Record<string, unknown>
    },
  }
}

/** Expect `gqlErr` to be a GraphQL error carrying a refusal of `refusalkind`, and nothing of what getUserId threw. */
function expectCarries(gqlErr: unknown, refusalkind: DB.Refusalkind): void {
  const carried = (gqlErr as { extensions?: Record<string, unknown> }).extensions?.[CrossedErrExtension]
  expect(DB.CrossedChecks.err.parse(carried)).to.have.property('refusalkind', refusalkind)
  expect(JSON.stringify([String(gqlErr), carried])).not.to.include('session store')
}
// --

// == [VaultDBs]: bornMemory, refusedConnection, UnreachableVaultDB, CountedVaultDB, GoingOnVaultDB, EndingVaultDB

/** A MemoryVaultDB with the test bank born. */
async function bornMemory<VaultDBT extends DB.MemoryVaultDB>(vaultDB: VaultDBT): Promise<VaultDBT> {
  await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
  return vaultDB
}

/** A driver's error for a database that refused the connection. Its message has text that must never reach a browser. */
function refusedConnection(): Error { return Object.assign(new Error('connect ECONNREFUSED db.internal:5432 password=hunter2'), { code: 'ECONNREFUSED' }) }

/** A vaultDB whose datastore refuses the connection on a get. */
class UnreachableVaultDB extends DB.MemoryVaultDB {
  protected override doGetThing(): DB.GetManifest { throw refusedConnection() }
}

/** A MemoryVaultDB that counts the watches it has running in `watching`. */
class CountedVaultDB extends DB.MemoryVaultDB {
  watching = 0

  protected override doWatch(scope: DB.ThingWatchScope, receive: (received: DB.Received) => void, onBadNews: (news: DB.VaultError) => void): () => void {
    this.watching += 1
    const stop = super.doWatch(scope, receive, onBadNews)
    return () => {
      this.watching -= 1
      stop()
    }
  }
}

/** A vaultDB whose watch tells two pieces of bad news, then goes on until it is stopped. It counts each stop in `stops`. */
class GoingOnVaultDB extends DB.MemoryVaultDB {
  stops = 0

  protected override doWatch(_scope: DB.ThingWatchScope, _receive: unknown, onBadNews: (news: DB.VaultError) => void): () => void {
    queueMicrotask(() => {
      onBadNews(new DB.VaultError('storage_unavailable', 'The first bad news.'))
      onBadNews(new DB.VaultError('storage_unavailable', 'The second bad news.'))
    })
    return () => { this.stops += 1 }
  }
}

/** A vaultDB whose watch ends itself as it starts, on a connection refused. */
class EndingVaultDB extends DB.MemoryVaultDB {
  override watch(_scope: DB.ThingWatchScope, _onNotice: unknown, onBadNews: (news: DB.VaultError) => void, onEnded: () => void): () => void {
    queueMicrotask(() => {
      onEnded()
      onBadNews(DB.storageUnavailable(refusedConnection()))
    })
    return noUnwatching
  }
}

/** The stop of a watch that has nothing to stop. */
function noUnwatching(): void { /* nothing to stop */ }

/** A getUserId whose session store is down. Its message has text that must never reach a browser. */
function sessionStoreDown(): never { throw new Error('The session store is down') }

/** vaultResolvers over `served`, signing each request in by `getUserId`. */
function schemaSignedInBy(served: DB.VaultDB, getUserId: (context: never) => DB.Userid | null): GraphQLSchema {
  return makeExecutableSchema({ typeDefs: VaultSchemaSdl, resolvers: vaultResolvers({ vaultDB: served, getUserId }) })
}

/** A getUserId that signs every request in as u1. */
function signedInAsU1(): DB.Userid { return 'u1' }
// --

// == [The asks]: VerbCases

// Each verb's operation, an ask of it over the born test bank, whether the vaultDB answers it ok, and the vaultDB verb that answers it.
const VerbCases = [
  ['getThing',          VaultOperations.getThing,   TH.getGateAskOf(),                 true,  (vaultDB: DB.VaultDB, ask: never) => vaultDB.tryGetThing(ask)],
  ['getThing refused',  VaultOperations.getThing,   TH.getAskAt('box/openai', 'fail'), false, (vaultDB: DB.VaultDB, ask: never) => vaultDB.tryGetThing(ask)],
  ['listThings',        VaultOperations.listThings, TH.listAskAt('box'),               true,  (vaultDB: DB.VaultDB, ask: never) => vaultDB.tryListThings(ask)],
  ['getWorld',          VaultOperations.getWorld,   TH.getWorldAskOf(),                true,  (vaultDB: DB.VaultDB, ask: never) => vaultDB.tryGetWorld(ask)],
  ['stats',             VaultOperations.stats,      TH.statsAskOf(),                   true,  (vaultDB: DB.VaultDB, ask: never) => vaultDB.tryStats(ask)],
  ['writeThing',        VaultOperations.writeThing, boxBirthAskOf(),                   true,  (vaultDB: DB.VaultDB, ask: never) => vaultDB.tryWriteThing(ask)],
  ['writeThing refused', VaultOperations.writeThing, TH.birthAskOf(TH.gateThingOf()),  false, (vaultDB: DB.VaultDB, ask: never) => vaultDB.tryWriteThing(ask)],
  ['birthBank refused', VaultOperations.birthBank,  TH.birthBankAskOf(),               false, (vaultDB: DB.VaultDB, ask: never) => vaultDB.tryBirthBank(ask)],
] as const
// --

describe("vaultResolvers", () => {
  it("answers each verb as the vaultDB's own try* verb does, in wire form", async () => {
    for (const [label, document, ask, isOk, verb] of VerbCases) {
      const served = await bornMemory(new DB.MemoryVaultDB())
      const direct = await bornMemory(new DB.MemoryVaultDB())
      const answer = await runAsk(TH.schemaOver(served), document, ask)
      expect(answer['ok'], label).to.eq(isOk)
      const expected = wireFormOf(await verb(direct, ask as never))
      expect(readTcMasked(answer), label).to.deep.eq(expected)
    }
  })

  it("answers a birth of a bank not yet born as the vaultDB does", async () => {
    const answer = await runAsk(TH.schemaOver(new DB.MemoryVaultDB()), VaultOperations.birthBank, TH.birthBankAskOf())
    const direct = await new DB.MemoryVaultDB().tryBirthBank(TH.birthBankAskOf())
    expect(readTcMasked(answer)).to.deep.eq(wireFormOf(direct))
  })

  it("refuses every verb of a request signed in as another user, or signed out, and leaves the bank alone", async () => {
    for (const userid of ['u2', null]) {
      const served = new DB.MemoryVaultDB()
      const schema = TH.schemaOver(served)
      for (const [label, document, ask] of VerbCases) {
        const answer = await runAsk(schema, document, ask, userid)
        expect(answer, label).to.deep.include({ ok: false, act: 'unclassified_storing', tracked: 'unread', banktok: DB.VoidLifeTok })
        expect(answer, label).to.have.nested.property('err.refusalkind', 'identity_revoked')
      }
      await TH.expectGood(served.tryBirthBank(TH.birthBankAskOf()))
    }
  })

  it("sends a refusal as its kind, message and allowlisted meta, never its cause", async () => {
    const answer = await runAsk(TH.schemaOver(new UnreachableVaultDB()), VaultOperations.getThing, TH.getGateAskOf())
    const refusal = await TH.expectBad(new UnreachableVaultDB().tryGetThing(TH.getGateAskOf()))
    expect(answer).to.deep.include({ ok: false, tracked: 'unread', err: TH.overTheWire(DB.crossedErrOf(refusal)) })
    expect(JSON.stringify(answer)).not.to.include('hunter2')
  })

  it("hands its vaultDB the ask as plain objects, as graphql-js's null-prototype input objects are not", async () => {
    const served = await bornMemory(new DB.MemoryVaultDB())
    const tryWriteThing = vi.spyOn(served, 'tryWriteThing')
    const gate = TH.gateThingOf()
    await runAsk(TH.schemaOver(served), VaultOperations.writeThing, TH.replaceAskOf(gate, TH.nextGateOf(gate), { policies: [] }))
    const [ask] = tryWriteThing.mock.calls[0]!
    expect(Object.getPrototypeOf(ask)).to.eq(Object.prototype)
    expect(Object.getPrototypeOf(ask.options)).to.eq(Object.prototype)
  })

  it("refuses an ask its vaultDB would refuse as bad_record, as the vaultDB does, without calling it", async () => {
    const served = await bornMemory(new DB.MemoryVaultDB())
    const tryWriteThing = vi.spyOn(served, 'tryWriteThing')
    const gate = TH.gateThingOf()
    const answer = await runAsk(TH.schemaOver(served), VaultOperations.writeThing, { ...TH.replaceAskOf(gate, TH.nextGateOf(gate)), options: null })
    expect(answer).to.deep.include({ ok: false }).and.to.have.nested.property('err.refusalkind', 'bad_record')
    expect(tryWriteThing).not.toHaveBeenCalled()
  })

  it("fails with a GraphQL error carrying the refusal for what its getUserId throws, without calling its vaultDB", async () => {
    const served = new DB.MemoryVaultDB()
    const tryGetThing = vi.spyOn(served, 'tryGetThing')
    const result = await graphql({ schema: schemaSignedInBy(served, sessionStoreDown), source: VaultOperations.getThing, variableValues: { ask: TH.overTheWire(TH.getGateAskOf()) }, contextValue: {} })
    expect(result.errors).to.have.lengthOf(1)
    expectCarries(result.errors?.[0], 'unexpected_error')
    expect(tryGetThing).not.toHaveBeenCalled()
  })

  it("carries a VaultError its getUserId throws as it is", async () => {
    const result = await graphql({ schema: schemaSignedInBy(new DB.MemoryVaultDB(), () => { throw DB.storageUnavailable(new Error('The session store is down')) }), source: VaultOperations.getThing, variableValues: { ask: TH.overTheWire(TH.getGateAskOf()) }, contextValue: {} })
    expectCarries(result.errors?.[0], 'storage_unavailable')
  })

  it("refuses a vaultDB or getUserId it cannot use", () => {
    const vaultDB = new DB.MemoryVaultDB()
    for (const opts of [{}, { vaultDB: {}, getUserId: signedInAsU1 }, { vaultDB, getUserId: 'u1' }, { vaultDB }]) {
      TH.expectSyncRefusal(() => vaultResolvers(opts as never), 'bad_record')
    }
  })
})

describe("vaultResolvers' watch", () => {
  it("sends each Thing written while the session stays signed in as its user, and stops the vaultDB's watch when left", async () => {
    const served = await bornMemory(new CountedVaultDB())
    const { stream, nextNotice } = await watching(TH.schemaOver(served), { userid: 'u1' })
    expect(served.watching).to.eq(1)
    await TH.expectGood(served.tryWriteThing(boxBirthAskOf()))
    const notice = (await nextNotice())!
    expect(notice).to.deep.include({ err: null, isEnded: false, banktok: TH.SenderKnows.banktok })
    expect(notice['record']).to.deep.include({ labelpath: TH.BoxScope.labelpath })
    expect(notice['read_tc']).to.match(TH.ReadTcPattern)
    await stream.return(undefined)
    expect(served.watching).to.eq(0)
  })

  it("ends, marked, once its session is signed out or in as another user", async () => {
    for (const revoked of ['u2', null]) {
      const served = await bornMemory(new CountedVaultDB())
      const session: TH.TestContext = { userid: 'u1' }
      const { nextNotice } = await watching(TH.schemaOver(served), session)
      await TH.expectGood(served.tryWriteThing(boxBirthAskOf()))
      expect(await nextNotice()).to.have.property('isEnded', false)
      session.userid = revoked
      await TH.expectGood(served.tryWriteThing(boxBirthAskOf('anthropic')))
      const last = await nextNotice()
      expect(last).to.deep.include({ record: null, isEnded: true }).and.to.have.nested.property('err.refusalkind', 'identity_revoked')
      expect(await nextNotice()).to.be.null
      expect(served.watching).to.eq(0)
    }
  })

  it("ends a refused watch after one marked notice, without starting its vaultDB's", async () => {
    const served = new CountedVaultDB()
    const { nextNotice } = await watching(TH.schemaOver(served), { userid: 'u2' })
    expect(await nextNotice()).to.deep.include({ isEnded: true }).and.to.have.nested.property('err.refusalkind', 'identity_revoked')
    expect(await nextNotice()).to.be.null
    expect(served.watching).to.eq(0)
  })

  it("fails a watch of a scope that fails its check with a GraphQL error carrying bad_record, without starting its vaultDB's", async () => {
    const served = new CountedVaultDB()
    const variableValues = { scope: { ...TH.ThingBank, banklabel: '' } }
    const result = await subscribe({ schema: TH.schemaOver(served), document: parse(VaultOperations.watchThings), variableValues, contextValue: { userid: 'u1' } })
    expect(result).to.have.property('errors').with.lengthOf(1)
    expectCarries((result as { errors: unknown[] }).errors[0], 'bad_record')
    expect(served.watching).to.eq(0)
  })

  it("fails a watch with a GraphQL error carrying the refusal for what its getUserId throws, without starting its vaultDB's", async () => {
    const served = new CountedVaultDB()
    const result = await subscribe({ schema: schemaSignedInBy(served, sessionStoreDown), document: parse(VaultOperations.watchThings), variableValues: { scope: { ...TH.ThingBank } }, contextValue: {} })
    expect(result).to.have.property('errors').with.lengthOf(1)
    expectCarries((result as { errors: unknown[] }).errors[0], 'unexpected_error')
    expect(served.watching).to.eq(0)
  })

  it("ends with the bad news that ended its vaultDB's watch, marked, and without its cause", async () => {
    const { nextNotice } = await watching(TH.schemaOver(new EndingVaultDB()), { userid: 'u1' })
    const last = await nextNotice()
    expect(last).to.deep.include({ isEnded: true }).and.to.have.nested.property('err.refusalkind', 'storage_unavailable')
    expect(JSON.stringify(last)).not.to.include('hunter2')
    expect(await nextNotice()).to.be.null
  })

  it("sends bad news its vaultDB's watch goes on after, unmarked, until it is left", async () => {
    const served = new GoingOnVaultDB()
    const { stream, nextNotice } = await watching(TH.schemaOver(served), { userid: 'u1' })
    expect(await nextNotice()).to.deep.include({ isEnded: false }).and.to.have.nested.property('err.message', 'The first bad news.')
    expect(await nextNotice()).to.deep.include({ isEnded: false }).and.to.have.nested.property('err.message', 'The second bad news.')
    await stream.return(undefined)
    expect(served.stops).to.eq(1)
  })

  it("stops its vaultDB's watch, then fails with a GraphQL error carrying the refusal for what its getUserId throws mid-watch", async () => {
    const served = new GoingOnVaultDB()
    const session = { userid: 'u1', isDown: false }
    const getUserId = (context: typeof session) => (context.isDown ? sessionStoreDown() : context.userid)
    const { stream } = await watching(schemaSignedInBy(served, getUserId), session)
    session.isDown = true
    try {
      await stream.next()
      expect.unreachable('Expected the watch to fail')
    } catch (err) {
      expectCarries(err, 'unexpected_error')
    }
    expect(served.stops).to.eq(1)
  })

  it("ends with the sign-in's refusal when bad news reaches a session signed out since", async () => {
    const served = new GoingOnVaultDB()
    const session: TH.TestContext = { userid: 'u1' }
    const { nextNotice } = await watching(TH.schemaOver(served), session)
    session.userid = null
    expect(await nextNotice()).to.deep.include({ isEnded: true }).and.to.have.nested.property('err.refusalkind', 'identity_revoked')
    expect(await nextNotice()).to.be.null
    expect(served.stops).to.eq(1)
  })
})
