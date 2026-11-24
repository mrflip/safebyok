import { noop } from 'es-toolkit'
import { describe, expect, it, vi } from 'vitest'
import type { Errors } from 'safebyok-big/internals'
import { Thing } from '../../src/models/thing'
import { type ThingRecord, Shell } from '../../src/shapes/shapes-thing'
import type { ReadTc, SeenThing, VaultEvent, VaultItemEvent } from '../../src/shapes/shapes-vault-event'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import { VaultMinder } from '../../src/minding/vault-minder'
import { readTcNow } from '../../src/storage/agerank'
import type { VaultDB } from '../../src/storage/vault-db'
import * as TH from '../test-helpers'

/** The store in memory each VaultMinder the battery makes stands over. */
const InnerOf = new WeakMap<VaultMinder, MemoryVaultDB>()

TH.describeVaultDBBattery('VaultMinder over a MemoryVaultDB', {
  makeVaultDB: () => {
    const inner = new MemoryVaultDB()
    const vaultDB = VaultMinder.make(TH.ThingBank, { vaultDB: inner, makeThing: TH.makePlainThing })
    InnerOf.set(vaultDB, inner)
    return vaultDB
  },
  _cheat_rowsOf: (vaultDB) => {
    const inner = InnerOf.get(vaultDB)!
    return {
      plant:  (scope, raw) => { inner._cheat_things(scope).set(scope.labelpath, structuredClone(raw)) },
      remove: (scope) => { inner._cheat_things(scope).delete(scope.labelpath) },
    }
  },  // It has no watch: what it tells its listeners is below.
  watches: false,
})

/** A refused answer carrying no record, named for the verb that answers it. */
function stubAnswerOf(verbname: string): never { return { ok: false, ask: {}, verbname, world: null, dbhas: null, parentage: [], deltas: [], read_tc: readTcNow(), banktok: null } as never }

/** A vaultDB whose every verb answers {@link stubAnswerOf} its own name, and whose watch answers `stop`. */
function stubVaultDBOf(stop: () => void) {
  return {
    tryGetThing:   vi.fn<VaultDB['tryGetThing']>(() => Promise.resolve(stubAnswerOf('got'))),
    tryWriteThing: vi.fn<VaultDB['tryWriteThing']>(() => Promise.resolve(stubAnswerOf('wrote'))),
    tryListThings: vi.fn<VaultDB['tryListThings']>(() => Promise.resolve(stubAnswerOf('listed'))),
    tryBirthBank:  vi.fn<VaultDB['tryBirthBank']>(() => Promise.resolve(stubAnswerOf('born'))),
    watch:         vi.fn<VaultDB['watch']>(() => stop),
  } satisfies VaultDB
}

/** A VaultMinder over a MemoryVaultDB, and that MemoryVaultDB, to write beside it. */
function sortedOverMemory(): { vaultDB: VaultMinder<TH.PlainThing>, inner: MemoryVaultDB } {
  const inner = new MemoryVaultDB()
  return { vaultDB: VaultMinder.make(TH.ThingBank, { vaultDB: inner, makeThing: TH.makePlainThing }), inner }
}

/** A VaultMinder over a MemoryVaultDB whose own watch notifies nothing, so that every event it tells is of an answer's records. */
function sortedOverQuietMemory(): { vaultDB: VaultMinder<TH.PlainThing>, inner: MemoryVaultDB } {
  const inner = new MemoryVaultDB()
  vi.spyOn(inner, 'watch').mockReturnValue(noop)
  return { vaultDB: VaultMinder.make(TH.ThingBank, { vaultDB: inner, makeThing: TH.makePlainThing }), inner }
}

/** The item event a device database might ring for `record`, from `'other_tab'` at `read_tc`. */
function rungOf(record: SeenThing, read_tc: ReadTc = readTcNow()): VaultItemEvent {
  return { ...TH.itemEventOf(record), sourcelabel: 'other_tab', read_tc }
}

/** Store `record` in `inner` past its verbs. */
function cheatStored(inner: MemoryVaultDB, record: ThingRecord): void { inner._cheat_things(record).set(record.labelpath, structuredClone(record)) }

/** A listener to `vaultDB`: the events it hears, the bad news it is told, and the end of its listen. */
function heardOf(vaultDB: VaultMinder): { events: VaultEvent[], badNews: Errors.VaultError[], end: () => void } {
  const events: VaultEvent[] = []
  const badNews: Errors.VaultError[] = []
  const end = vaultDB.listen({ hear: (event) => { events.push(event) }, onBadNews: (news) => { badNews.push(news) } })
  return { events, badNews, end }
}

/** Each of `events` as its eventkind, its labelpath, and its liveness, lifekind or agekind. */
function shorthandsOf(events: readonly VaultEvent[]): string[][] {
  return events.map((event) => {
    if (event.eventkind === 'item') { return [event.eventkind, event.labelpath, event.liveness] }
    return [event.eventkind, event.labelpath, (event.eventkind === 'life') ? event.lifekind : event.agekind]
  })
}

/** The shorthands of a Thing seen first, whole and live. */
function firstSeen(labelpath: string): string[][] { return [['item', labelpath, 'full'], ['life', labelpath, 'born']] }

/** The shorthands of a Thing seen first, sparse and live. */
function firstSeenSparse(labelpath: string): string[][] { return [['item', labelpath, 'soon'], ['life', labelpath, 'born'], ['aged', labelpath, 'bare']] }

describe("VaultMinder, what only a wrapper can show", () => {
  it("hands each verb's ask to the vaultDB it wraps, and answers that vaultDB's own answer", async () => {
    const inner = stubVaultDBOf(() => undefined)
    const vaultDB = VaultMinder.make(TH.ThingBank, { vaultDB: inner, makeThing: TH.makePlainThing })
    const asks = { get: TH.getGateAskOf(), write: TH.birthAskOf(), list: TH.listAskAt('box'), birth: TH.birthBankAskOf() }
    expect(await vaultDB.tryGetThing(asks.get)).to.equal(await inner.tryGetThing.mock.results[0]!.value)
    expect(await vaultDB.tryWriteThing(asks.write)).to.equal(await inner.tryWriteThing.mock.results[0]!.value)
    expect(await vaultDB.tryListThings(asks.list)).to.equal(await inner.tryListThings.mock.results[0]!.value)
    expect(await vaultDB.tryBirthBank(asks.birth)).to.equal(await inner.tryBirthBank.mock.results[0]!.value)
    expect(inner.tryGetThing.mock.calls[0]![0]).to.equal(asks.get)
    expect(inner.tryWriteThing.mock.calls[0]![0]).to.equal(asks.write)
    expect(inner.tryListThings.mock.calls[0]![0]).to.equal(asks.list)
    expect(inner.tryBirthBank.mock.calls[0]![0]).to.equal(asks.birth)
  })

  it("watches its bank in the vaultDB it wraps once, from when it is made, whoever listens to it, asking nothing", () => {
    const stop = vi.fn()
    const inner = stubVaultDBOf(stop)
    const vaultDB = VaultMinder.make(TH.ThingBank, { vaultDB: inner, makeThing: TH.makePlainThing })
    expect(inner.watch.mock.calls.map(([scope]) => scope)).to.deep.equal([TH.ThingBank])
    const ends = [heardOf(vaultDB).end, heardOf(vaultDB).end]
    for (const end of ends) { end() }
    heardOf(vaultDB)
    expect([inner.watch.mock.calls.length, stop.mock.calls.length]).to.deep.equal([1, 0])
    expect([inner.tryGetThing, inner.tryWriteThing, inner.tryListThings, inner.tryBirthBank].every((verb) => verb.mock.calls.length === 0)).to.equal(true)
  })

  it("stops its watch of the vaultDB it wraps at its sweep, and still tells of an answer's records", async () => {
    const { vaultDB, inner } = sortedOverMemory()
    const { events } = heardOf(vaultDB)
    expect(vaultDB.sweep().sweep()).to.equal(vaultDB)
    await inner.tryBirthBank(TH.birthBankAskOf())
    await TH.aWhile()
    expect(events).to.deep.equal([])
    await vaultDB.tryGetThing(TH.getGateAskOf())
    expect(shorthandsOf(events)).to.deep.equal([...firstSeen('bank'), ...firstSeen('gate')])
  })

  it("calls the wrapped watch's stop once, however often swept", () => {
    const stop = vi.fn()
    const vaultDB = VaultMinder.make(TH.ThingBank, { vaultDB: stubVaultDBOf(stop), makeThing: TH.makePlainThing })
    vaultDB.sweep()
    vaultDB.sweep()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  const BadArgs = [
    [TH.ThingBank,                        undefined,                          'no options'],
    [TH.ThingBank,                        {},                                 'no vaultDB'],
    [TH.ThingBank,                        { vaultDB: { tryGetThing: noop } }, 'a vaultDB missing a verb'],
    [TH.ThingBank,                        { vaultDB: new MemoryVaultDB() },   'no makeThing'],
    [TH.ThingBank,                        { vaultDB: new MemoryVaultDB(), makeThing: 'plain' }, 'a makeThing that is no function'],
    [undefined,                           { vaultDB: new MemoryVaultDB(), makeThing: TH.makePlainThing }, 'no scope'],
    [{ userid: TH.ThingBank.userid },     { vaultDB: new MemoryVaultDB(), makeThing: TH.makePlainThing }, 'a scope with no banklabel'],
  ] as const

  for (const [scope, opts, blurb] of BadArgs) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => VaultMinder.make(scope as never, opts as never), 'bad_record')
    })
  }

  const BadListeners = [
    [undefined,               'no listener'],
    [noop,                    'a callback for a listener'],
    [{ onBadNews: noop },     'a listener with no hear'],
    [{ hear: noop },          'a listener with no onBadNews'],
  ] as const

  for (const [listener, blurb] of BadListeners) {
    it(`refuses ${blurb}`, () => {
      const { vaultDB } = sortedOverMemory()
      TH.expectSyncRefusal(() => vaultDB.listen(listener as never), 'bad_record')
    })
  }
})

describe("VaultMinder's listeners, of what an answer carries", () => {
  it("tells of a refused write's bank, main gate and root box, out to in, before the write answers, and of its dbhas seen once", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await inner.tryBirthBank(TH.birthBankAskOf())
    const { events, badNews } = heardOf(vaultDB)
    const track = { bank: TH.BankStaleTrack.bank, gate: TH.GateStaleTrack.gate, box: TH.RootStaleTrack.box }
    const answer = await vaultDB.tryWriteThing({ ...TH.birthAskOf(TH.gateThingOf({ revtok: TH.OtherRevtok })), track })
    expect(answer).to.deep.include({ ok: false, dbhas: TH.gateThingOf() })
    expect(shorthandsOf(events)).to.deep.equal([...firstSeen('bank'), ...firstSeen('gate'), ...firstSeen('box')])
    expect(badNews).to.deep.equal([])
  })

  it("tells of a listing's parent, then each Thing listed, sparse and in labelpath order, after the bank and main gate", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await inner.tryBirthBank(TH.birthBankAskOf())
    for (const label of ['openai', 'anthropic']) { await inner.tryWriteThing(TH.birthAskOf(TH.boxThingOf(label), Shell.childCited(TH.Life0))) }
    const { events } = heardOf(vaultDB)
    await vaultDB.tryListThings(TH.listAskAt('box'))
    expect(shorthandsOf(events)).to.deep.equal([
      ...firstSeen('bank'), ...firstSeen('gate'), ...firstSeenSparse('box'), ...firstSeenSparse('box/anthropic'), ...firstSeenSparse('box/openai'),
    ])
    expect(events.filter((event) => event.eventkind === 'item').map((event) => event.val)).to.deep.equal(
      [TH.bankThingOf(), TH.gateThingOf(), ...[TH.rootBoxOf(), TH.boxThingOf('anthropic'), TH.boxThingOf('openai')].map((thing) => Thing.sparseOf(thing))],
    )
  })

  it("tells of a birth's roots, each write's record, and a get's record, the answers' own objects", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    const { events } = heardOf(vaultDB)
    const born = await vaultDB.tryBirthBank(TH.birthBankAskOf())
    expect(shorthandsOf(events)).to.deep.equal([...firstSeen('bank'), ...firstSeen('gate'), ...firstSeen('box')])
    const box = TH.boxThingOf()
    const written = await vaultDB.tryWriteThing(TH.birthAskOf(box, Shell.childCited(TH.Life0)))
    const next = TH.nextOf(box)
    cheatStored(inner, next)
    const got = await vaultDB.tryGetThing(TH.getAskAt(box.labelpath))
    const records = events.filter((event) => event.eventkind === 'item').map((event) => event.val)
    expect(records).to.deep.equal([TH.bankThingOf(), TH.gateThingOf(), TH.rootBoxOf(), box, next])
    expect([records[2], records[3], records[4]]).to.have.ordered.members([born.ok && born.val.root, written.ok && written.val, got.ok && got.val])
  })

  it("tells of nothing for a repeat or an older record", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await inner.tryBirthBank(TH.birthBankAskOf())
    const { events } = heardOf(vaultDB)
    await vaultDB.tryGetThing(TH.getGateAskOf())
    expect(shorthandsOf(events)).to.deep.equal([...firstSeen('bank'), ...firstSeen('gate')])
    await vaultDB.tryGetThing(TH.getGateAskOf())
    const next = TH.nextGateOf(TH.gateThingOf())
    await vaultDB.tryWriteThing(TH.replaceAskOf(TH.gateThingOf(), next))
    const gate = TH.gateThingOf()
    vaultDB.receive(rungOf(gate))
    vaultDB.receive(rungOf(Thing.sparseOf(gate)))
    await TH.aWhile()
    expect(shorthandsOf(events.slice(4))).to.deep.equal([['item', 'gate', 'full']])
  })

  it("tells of the newest revision seen again in a later span of time, and of nothing for it again in that span", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await inner.tryBirthBank(TH.birthBankAskOf())
    const { events } = heardOf(vaultDB)
    const read_tc  = readTcNow()
    const nextTime = Number.parseInt(read_tc.slice(0, 8), 16) + 1
    const later    = `${nextTime.toString(16).padStart(8, '0')}${read_tc.slice(8)}`
    const gate     = TH.gateThingOf()
    vaultDB.receive(rungOf(gate, read_tc))
    vaultDB.receive(rungOf(gate, later))
    vaultDB.receive(rungOf(Thing.sparseOf(gate), later))
    expect(shorthandsOf(events)).to.deep.equal([...firstSeen('gate'), ['item', 'gate', 'full']])
    expect(events[2]).to.deep.include({ read_tc: later })
  })

  it("tells of a whole record seen sparse first, and of a newer sparse one as aged", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await inner.tryBirthBank(TH.birthBankAskOf())
    const { events } = heardOf(vaultDB)
    const root = TH.rootBoxOf()
    const rootNext = TH.nextOf(root)
    vaultDB.receive(rungOf(Thing.sparseOf(root)))
    await vaultDB.tryGetThing(TH.getAskAt('box'))
    vaultDB.receive(rungOf(Thing.sparseOf(rootNext)))
    expect(shorthandsOf(events)).to.deep.equal([
      ...firstSeenSparse('box'), ...firstSeen('bank'), ...firstSeen('gate'), ['item', 'box', 'full'], ['item', 'box', 'soon'], ['aged', 'box', 'cold'],
    ])
  })

  it("tells of the void sentinel a get's answer carries, under its parent's life as the step read it", async () => {
    const { vaultDB } = sortedOverMemory()
    const { events } = heardOf(vaultDB)
    await vaultDB.tryBirthBank(TH.birthBankAskOf())
    const answer = await vaultDB.tryGetThing(TH.getAskAt('box/openai'))
    expect(answer).to.deep.include({ act: 'gotvoid' })
    expect(shorthandsOf(events.slice(6))).to.deep.equal([['item', 'box/openai', 'void'], ['life', 'box/openai', 'died']])
    const voided = events.find((event) => event.labelpath === 'box/openai')
    const lifepath = `${TH.rootBoxOf().lifepath}/${Shell.VoidLifeseq}`
    expect(voided).to.deep.include({ val: answer.ok && answer.act === 'gotvoid' && answer.dbhas, agerank: `${lifepath}|-000000001|-000000001|${answer.read_tc.slice(0, 8)}` })
    expect(voided).to.deep.include({ val: Shell.of({ ...TH.BoxScope, lifepath }) })
  })

  it("tells of the void sentinel a get's answer carries under a parent it has not seen, and under one not stored", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await inner.tryBirthBank(TH.birthBankAskOf())
    const { events } = heardOf(vaultDB)
    expect(await vaultDB.tryGetThing(TH.getAskAt('box/openai'))).to.deep.include({ act: 'gotvoid' })
    expect(shorthandsOf(events)).to.deep.equal([...firstSeen('bank'), ...firstSeen('gate'), ['item', 'box/openai', 'void'], ['life', 'box/openai', 'died']])
    const unborn = sortedOverMemory()
    const unbornEvents = heardOf(unborn.vaultDB).events
    await unborn.vaultDB.tryGetThing(TH.getAskAt('box/openai'))
    expect(unbornEvents[0]).to.deep.include({ val: Shell.of({ ...TH.BoxScope, lifepath: `${Shell.VoidLifeseq}/${Shell.VoidLifeseq}` }) })
  })

  it("tells of the shell a write refused over nothing stored carries", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await inner.tryBirthBank(TH.birthBankAskOf())
    const { events } = heardOf(vaultDB)
    const answer = await vaultDB.tryWriteThing({ ...TH.birthAskOf(TH.boxThingOf(), Shell.childCited(TH.Life0)), ifAbsent: 'fail' })
    expect(answer).to.deep.include({ ok: false, act: 'void' })
    expect(shorthandsOf(events)).to.deep.equal([...firstSeen('bank'), ...firstSeen('gate'), ['item', 'box/openai', 'void'], ['life', 'box/openai', 'died']])
    expect(events[4]).to.deep.include({ val: Shell.of({ ...TH.BoxScope, lifepath: `${TH.Life0}/${Shell.VoidLifeseq}` }) })
  })

  it("tells of the void at a root as the root's own shell", async () => {
    const { vaultDB } = sortedOverMemory()
    const { events } = heardOf(vaultDB)
    const answer = await vaultDB.tryGetThing(TH.getGateAskOf())
    expect(answer).to.deep.include({ act: 'gotvoid' })
    expect(shorthandsOf(events)).to.deep.equal([['item', 'gate', 'void'], ['life', 'gate', 'died']])
    expect(events[0]).to.deep.include({ agerank: `${Shell.VoidLifeseq}|-000000001|-000000001|${answer.read_tc.slice(0, 8)}` })
  })

  it("sorts an answer's records while no one listens to it, so that they reach no one, then or later", async () => {
    const { vaultDB } = sortedOverMemory()
    await vaultDB.tryBirthBank(TH.birthBankAskOf())
    vaultDB.receive(rungOf(TH.boxThingOf()))
    const { events } = heardOf(vaultDB)
    await TH.aWhile()
    await vaultDB.tryGetThing(TH.getGateAskOf())
    vaultDB.receive(rungOf(TH.boxThingOf()))
    expect(events).to.deep.equal([])
  })

  it("refuses each record an answer to an ask of another bank carries, telling it to onBadNews and hearing nothing", async () => {
    const { vaultDB } = sortedOverMemory()
    const { events, badNews } = heardOf(vaultDB)
    await vaultDB.tryGetThing({ ...TH.getGateAskOf(), banklabel: 'other' })
    expect([events, badNews.map((news) => news.refusalkind)]).to.deep.equal([[], ['bad_record']])
    expect(vaultDB.thingAt(TH.GateScope)).to.be.undefined
  })

  it("tells every listener's onBadNews of a record of an answer it refuses, and answers unchanged", async () => {
    const theirs = { ok: true, act: 'born', ask: TH.ThingBank, world: null, read_tc: readTcNow(), val: TH.gateThingOf({ lifepath: 'not a lifepath' }) }
    const inner  = { ...stubVaultDBOf(noop), tryWriteThing: vi.fn<VaultDB['tryWriteThing']>(() => Promise.resolve(theirs as never)) }
    const vaultDB = VaultMinder.make(TH.ThingBank, { vaultDB: inner, makeThing: TH.makePlainThing })
    const listeners = [heardOf(vaultDB), heardOf(vaultDB)]
    expect(await vaultDB.tryWriteThing(TH.birthAskOf())).to.equal(theirs)
    for (const { events, badNews } of listeners) {
      expect(events).to.deep.equal([])
      expect(badNews.map((news) => news.refusalkind)).to.deep.equal(['bad_record'])
    }
  })
})

describe("VaultMinder's listeners, where each event came from and when it was read", () => {
  it("stamps every event of an answer with the wrapped vaultDB as its source and the answer's own read_tc", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await inner.tryBirthBank(TH.birthBankAskOf())
    const { events } = heardOf(vaultDB)
    const track = { bank: TH.BankStaleTrack.bank, gate: TH.GateStaleTrack.gate, box: TH.RootStaleTrack.box }
    const answer = await vaultDB.tryGetThing({ ...TH.getGateAskOf(), track })
    expect(events).to.have.lengthOf(6)
    for (const event of events) { expect(event).to.deep.include({ sourcelabel: VaultMinder.VaultDBSourcelabel, read_tc: answer.read_tc, banktok: TH.bankThingOf().lifetok }) }
    expect(VaultMinder.VaultDBSourcelabel).to.eq('vault_db')
  })

  it("stamps an answer's events with its own banktok, never its ask's, and a received event's with its own, else the newest world's", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    const { events } = heardOf(vaultDB)
    const { lifetok } = TH.bankThingOf()
    const [askLifetok, rungLifetok] = [crypto.randomUUID(), crypto.randomUUID()]
    vaultDB.receive(rungOf(TH.boxThingOf('mistral')))
    await vaultDB.tryBirthBank(TH.birthBankAskOf())
    await inner.tryWriteThing(TH.birthAskOf(TH.boxThingOf(), Shell.childCited(TH.Life0)))
    await vaultDB.tryGetThing({ ...TH.getAskAt('box/openai'), banktok: askLifetok })
    vaultDB.receive(rungOf(TH.boxThingOf('anthropic')))
    vaultDB.receive({ ...rungOf(TH.boxThingOf('cohere')), banktok: rungLifetok })
    // Each box first seen gives two events, an item and a life; the birth, six.
    expect(events.map((event) => event.banktok)).to.deep.equal([
      undefined, undefined, ...Array.from({ length: 6 }, () => lifetok), lifetok, lifetok, lifetok, lifetok, rungLifetok, rungLifetok,
    ])
  })

  it("tells of a Thing the wrapped vaultDB's watch gives a notice of, at the read_tc of its notice", async () => {
    const { vaultDB, inner } = sortedOverMemory()
    await vaultDB.tryBirthBank(TH.birthBankAskOf())
    const { events } = heardOf(vaultDB)
    const box = TH.boxThingOf()
    const answer = await inner.tryWriteThing(TH.birthAskOf(box, Shell.childCited(TH.Life0)))
    await TH.eventually(() => events.length === 2)
    expect(shorthandsOf(events)).to.deep.equal(firstSeen('box/openai'))
    expect(events[0]).to.deep.include({ sourcelabel: 'vault_db', val: box })
    expect(events[0]!.read_tc).to.match(TH.ReadTcPattern).and.not.eq(answer.read_tc)
    expect(events[1]!.read_tc).to.eq(events[0]!.read_tc)
  })
})

describe("VaultMinder.receive(event)", () => {
  it("tells of the record of an item event received, sorted with an answer's, at the event's own sourcelabel and read_tc", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await inner.tryBirthBank(TH.birthBankAskOf())
    const { events } = heardOf(vaultDB)
    await vaultDB.tryGetThing(TH.getGateAskOf())
    const next = TH.nextGateOf(TH.gateThingOf())
    const read_tc = readTcNow()
    vaultDB.receive(rungOf(next, read_tc))
    vaultDB.receive(rungOf(TH.boxThingOf(), read_tc))
    const rung = events.slice(4)
    expect(shorthandsOf(rung)).to.deep.equal([['item', 'gate', 'full'], ...firstSeen('box/openai')])
    for (const event of rung) { expect(event).to.deep.include({ sourcelabel: 'other_tab', read_tc }) }
    expect(rung[0]).to.deep.include({ val: next })
    await vaultDB.tryGetThing(TH.getGateAskOf())
    expect(events).to.have.lengthOf(7)
  })

  it("tells of nothing for a repeat received, or for a life or aged event, whatever its agerank", async () => {
    const { vaultDB } = sortedOverMemory()
    const { events } = heardOf(vaultDB)
    await vaultDB.tryBirthBank(TH.birthBankAskOf())
    const sorted = [...events]
    for (const event of sorted) { vaultDB.receive(event) }
    const box = TH.boxThingOf()
    const scope = { userid: box.userid, banklabel: box.banklabel, labelpath: box.labelpath, modelkind: 'box' as const, banktok: undefined, sourcelabel: 'other_tab', read_tc: readTcNow() }
    vaultDB.receive({ ...scope, eventkind: 'life', lifekind: 'born', agerank: 'zzz', agerankWas: undefined })
    vaultDB.receive({ ...scope, eventkind: 'aged', agekind: 'bare', agekindWas: undefined, agerank: 'zzz', agerankWas: undefined })
    expect(events).to.deep.equal(sorted)
  })

  it("tells of the void sentinel of a void item received, at the lifepath it carries, sorted with an answer's records", async () => {
    const { vaultDB } = sortedOverMemory()
    const { events } = heardOf(vaultDB)
    const voidSentinel = Shell.of({ ...TH.BoxScope, lifepath: Shell.childCited(TH.Life0).lifepath })
    vaultDB.receive(rungOf(voidSentinel))
    expect(shorthandsOf(events)).to.deep.equal([['item', 'box/openai', 'void'], ['life', 'box/openai', 'died']])
    expect(events[0]).to.deep.include({ val: voidSentinel })
    await vaultDB.tryBirthBank(TH.birthBankAskOf())
    expect(await vaultDB.tryGetThing(TH.getAskAt('box/openai'))).to.deep.include({ act: 'gotvoid' })
    expect(events).to.have.lengthOf(8)
  })

  const BadEvents = [
    [{ ...rungOf(TH.gateThingOf()), sourcelabel: 'Other Tab' },                         'a sourcelabel that is not a label'],
    [{ ...rungOf(TH.gateThingOf()), sourcelabel: undefined },                           'no sourcelabel'],
    [rungOf(TH.gateThingOf(), crypto.randomUUID()),                                    'a read_tc that is no UUID version 7'],
    [{ ...rungOf(TH.gateThingOf()), eventkind: 'told' },                                'an eventkind it does not know'],
    [undefined,                                                                          'no event'],
    [{ ...rungOf(TH.gateThingOf()), val: 'not a Thing' },                                'a val that is not a Thing'],
    [rungOf(TH.gateThingOf({ banklabel: 'other' })),                                    'an event of another bank'],
    [{ ...rungOf(TH.gateThingOf({ banklabel: 'other' })), banklabel: 'acme' },          'a record of another bank than its event'],
    [{ ...rungOf(TH.boxThingOf()), labelpath: 'box/anthropic' },                         'a record of another Thing than its event'],
    [rungOf(TH.boxThingOf('openai', { lifepath: TH.Life0 })),                           'a lifepath shallower than its labelpath'],
    [{ ...rungOf(TH.gateThingOf()), liveness: 'dead' },                                 'a liveness it does not know'],
    [{ ...rungOf(TH.gateThingOf()), liveness: 'void' },                                 'a void event whose val is not the void sentinel'],
    [{ ...rungOf(Shell.of({ ...TH.BoxScope, lifepath: Shell.childCited(TH.Life0).lifepath })), liveness: 'gone' }, 'an event not void whose val is the void sentinel'],
  ] as const

  for (const [event, blurb] of BadEvents) {
    it(`refuses ${blurb}, telling nothing`, () => {
      const { vaultDB } = sortedOverMemory()
      const { events } = heardOf(vaultDB)
      TH.expectSyncRefusal(() => { vaultDB.receive(event as never) })
      expect(events).to.deep.equal([])
    })
  }
})

describe("VaultMinder.thingAt(scoped)", () => {
  it("answers the one Thing it keeps at a labelpath, the same object across records and lives", async () => {
    const { vaultDB } = sortedOverQuietMemory()
    await vaultDB.tryBirthBank(TH.birthBankAskOf())
    const thing = vaultDB.thingAt(TH.RootScope)!
    expect(thing.pickle()).to.deep.include({ labelpath: 'box', revseq: 0 })
    const tomb = TH.boxThingOf('box', { labelpath: 'box', am: 'x', lifepath: TH.lifepathPlus(TH.Life0, 1), lifeseq: TH.lifepathPlus(TH.Life0, 1), revseq: 1 })
    const soon = Thing.sparseOf(TH.rootBoxOf({ revseq: 3 }))
    vaultDB.receive(rungOf(soon))
    vaultDB.receive(rungOf(tomb))
    expect(vaultDB.thingAt(TH.RootScope)).to.equal(thing)
    expect(thing.pickle()).to.equal(tomb)
    expect(thing).to.include({ am: 'x', lifepath: tomb.lifepath })
  })

  it("answers undefined for a labelpath it has learned of no record at, or only a record its Thing refused", () => {
    const inner = stubVaultDBOf(noop)
    const vaultDB = VaultMinder.make(TH.ThingBank, { vaultDB: inner, makeThing: TH.makePlainThing })
    const { badNews } = heardOf(vaultDB)
    expect(vaultDB.thingAt(TH.BoxScope)).to.eq(undefined)
    const [, onNotice] = inner.watch.mock.calls[0]!
    onNotice({ ...TH.itemEventOf(TH.boxThingOf()), read_tc: crypto.randomUUID() })
    expect(badNews.map((news) => news.refusalkind)).to.deep.equal(['bad_record'])
    expect(vaultDB.thingAt(TH.BoxScope)).to.eq(undefined)
  })

  it("makes each Thing once, with the first record it learns of at that labelpath", () => {
    const makeThing = vi.fn(TH.makePlainThing)
    const vaultDB = VaultMinder.make(TH.ThingBank, { vaultDB: new MemoryVaultDB(), makeThing })
    heardOf(vaultDB)
    const soon = Thing.sparseOf(TH.boxThingOf('openai', { revseq: 2 }))
    vaultDB.receive(rungOf(soon))
    vaultDB.receive(rungOf(TH.boxThingOf('openai', { revseq: 2 })))
    vaultDB.receive(rungOf(TH.boxThingOf('openai', { revseq: 1 })))
    vaultDB.receive(rungOf(TH.boxThingOf('other')))
    expect(makeThing.mock.calls).to.deep.equal([[soon], [TH.boxThingOf('other')]])
    expect(vaultDB.thingAt(TH.BoxScope)).to.equal(makeThing.mock.results[0]!.value)
  })

  it("refuses a scope of another bank", () => {
    const { vaultDB } = sortedOverMemory()
    TH.expectSyncRefusal(() => vaultDB.thingAt({ ...TH.BoxScope, banklabel: 'other' }), 'bad_record')
    TH.expectSyncRefusal(() => vaultDB.thingAt({ ...TH.ThingBank } as never), 'bad_record')
  })
})

describe("VaultMinder.listen(listener)", () => {
  it("tells every listener every event, in one order, each the same frozen event", async () => {
    const { vaultDB } = sortedOverMemory()
    const listeners = [heardOf(vaultDB), heardOf(vaultDB)]
    await vaultDB.tryBirthBank(TH.birthBankAskOf())
    expect(listeners[0]!.events).to.have.lengthOf(6)
    expect(listeners[1]!.events).to.have.ordered.members(listeners[0]!.events)
    expect(listeners[0]!.events.every((event) => Object.isFrozen(event))).to.be.true
  })

  it("tells a listener's onBadNews the error its hear throws, and goes on telling it and the others, and answering", async () => {
    const { vaultDB } = sortedOverMemory()
    const badNews: Errors.VaultError[] = []
    const thrown: VaultEvent[] = []
    vaultDB.listen({ hear: (event) => { thrown.push(event); throw new Error('host bug') }, onBadNews: (news) => { badNews.push(news) } })
    const other = heardOf(vaultDB)
    expect(await vaultDB.tryBirthBank(TH.birthBankAskOf())).to.deep.include({ ok: true, act: 'born' })
    expect(thrown).to.have.lengthOf(6)
    expect(other.events).to.have.lengthOf(6)
    expect(new Set(badNews.map((news) => news.refusalkind))).to.deep.equal(new Set(['unexpected_error']))
    expect(other.badNews).to.deep.equal([])
  })

  it("tells a listener whose listen has ended nothing more", async () => {
    const { vaultDB } = sortedOverMemory()
    const { events, end } = heardOf(vaultDB)
    heardOf(vaultDB)
    end()
    await vaultDB.tryBirthBank(TH.birthBankAskOf())
    expect(events).to.deep.equal([])
  })

  it("tells a listener that listens twice each event twice, and each end stops one of them", () => {
    const { vaultDB } = sortedOverMemory()
    const heard: VaultEvent[] = []
    const listener = { hear: (event: VaultEvent) => { heard.push(event) }, onBadNews: noop }
    const endFirst = vaultDB.listen(listener)
    vaultDB.listen(listener)
    const gate = TH.gateThingOf()
    vaultDB.receive(rungOf(gate))
    expect(shorthandsOf(heard)).to.deep.equal([['item', 'gate', 'full'], ['item', 'gate', 'full'], ['life', 'gate', 'born'], ['life', 'gate', 'born']])
    endFirst()
    vaultDB.receive(rungOf(TH.nextGateOf(gate)))
    expect(heard).to.have.lengthOf(5)
  })
})

describe("VaultMinder's asks: makeGetAsk, makeListAsk, makePutAsk and makeDelAsk", () => {
  it("fill in the bank's scope, the modelkind and the default flags, and carry no banktok and no track before the bank is heard of", () => {
    const { vaultDB } = sortedOverMemory()
    expect(vaultDB.makeGetAsk({ labelpath: 'box/openai' })).to.deep.equal({ ...TH.ThingBank, labelpath: 'box/openai', op: 'get', modelkind: 'box', ifAbsent: 'nil' })
    expect(vaultDB.makeListAsk({ labelpath: 'box' })).to.deep.equal({ ...TH.ThingBank, labelpath: 'box', op: 'list', modelkind: 'box', ifAbsent: 'fail' })
    const box = TH.boxThingOf()
    expect(vaultDB.makePutAsk({ cited: Shell.childCited(TH.Life0), record: box })).to.not.have.any.keys('banktok', 'track')
  })

  it("carry the bank's lifetok, and track the revision each root's Thing holds once all three are kept", async () => {
    const { vaultDB } = sortedOverMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    const known = { track: TH.trackOf(), banktok: TH.bankThingOf().lifetok }
    expect(vaultDB.makeGetAsk({ labelpath: 'box/openai' })).to.deep.equal({ ...TH.ThingBank, labelpath: 'box/openai', op: 'get', modelkind: 'box', ifAbsent: 'nil', ...known })
    expect(vaultDB.makeListAsk({ labelpath: 'box' })).to.deep.include(known)
    const next = { ...TH.bankThingOf(), revtok: TH.revtokOf('next'), revseq: 1, written_at: TH.T0 + 1 }
    expect(vaultDB.makePutAsk({ cited: TH.bankThingOf(), record: next })).to.deep.include({ ...TH.ThingBank, labelpath: 'bank', op: 'put', modelkind: 'bank', ifAbsent: 'add', ifPresent: 'repl', ...known })
    const box = TH.boxThingOf()
    expect(vaultDB.makeDelAsk({ cited: box, record: TH.boxTombOf(box) })).to.deep.include({ ...TH.ThingBank, op: 'del', modelkind: 'box', ifAbsent: 'fail', ...known })
  })

  it("carry the banktok but no track while the root box's Thing is not kept, or holds only its shell", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await TH.expectGood(inner.tryBirthBank(TH.birthBankAskOf()))
    await vaultDB.tryGetThing(TH.getAskAt('bank'))
    expect(vaultDB.makeGetAsk({ labelpath: 'box/openai' })).to.deep.include({ banktok: TH.bankThingOf().lifetok }).and.not.have.property('track')
    const soon = Thing.sparseOf(TH.rootBoxOf({ revseq: 3 }))
    vaultDB.receive(rungOf(soon))
    expect(vaultDB.thingAt(TH.RootScope)?.pickle()).to.deep.equal(Shell.of(TH.RootScope))
    expect(vaultDB.makeGetAsk({ labelpath: 'box/openai' })).to.not.have.property('track')
  })

  it("track a root known newer only sparse at the whole record its Thing holds, so the answer sends the newer whole", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    const root1 = TH.nextOf(TH.rootBoxOf())
    cheatStored(inner, root1)
    vaultDB.receive(rungOf(Thing.sparseOf(root1)))
    expect(vaultDB.makeGetAsk({ labelpath: 'bank' }).track?.box).to.deep.equal({ revseq: 0, lifepath: TH.Life0 })
    const answer = await vaultDB.tryGetThing(vaultDB.makeGetAsk({ labelpath: 'bank' }))
    expect(answer).to.deep.include({ ok: true, tracked: { bank: 'same', gate: 'same', box: root1 } })
    expect(vaultDB.thingAt(TH.RootScope)?.pickle()).to.deep.equal(root1)
  })

  it("carry no banktok over the bank's tombstone, and track it", async () => {
    const { vaultDB } = sortedOverMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    const tomb = TH.bankThingOf({ am: 'x', lifeseq: TH.lifepathPlus(TH.Life0, 1), lifepath: TH.lifepathPlus(TH.Life0, 1), revtok: TH.revtokOf('gone'), revseq: 1, written_at: TH.T0 + 1 })
    vaultDB.receive(rungOf(tomb))
    const ask = vaultDB.makeGetAsk({ labelpath: 'box' })
    expect(ask).to.not.have.property('banktok')
    expect(ask.track?.bank).to.deep.equal({ revseq: 1, lifepath: tomb.lifepath })
  })

  it("carry the bank's lifetok to the answer's ask, which a vaultDB neither compares with the bank stored nor refuses on", async () => {
    const { vaultDB, inner } = sortedOverMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    const answer = await inner.tryGetThing(vaultDB.makeGetAsk({ labelpath: 'bank' }))
    expect(answer).to.deep.include({ ok: true, act: 'gotlive' })
    expect(answer.ask).to.deep.include({ banktok: TH.bankThingOf().lifetok })
    const elsewise = await inner.tryGetThing({ ...vaultDB.makeGetAsk({ labelpath: 'bank' }), banktok: TH.OtherLifetok })
    expect(elsewise).to.deep.include({ ok: true, act: 'gotlive' })
  })

  it("track the bank a watch notified it of, written elsewhere", async () => {
    const { vaultDB, inner } = sortedOverMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    const next = TH.nextOf(TH.bankThingOf())
    const ask  = TH.replaceAskOf(TH.bankThingOf(), next)
    await TH.expectGood(inner.tryWriteThing(ask))
    expect(vaultDB.makeGetAsk({ labelpath: 'bank' }).track?.bank).to.deep.equal({ revseq: 1, lifepath: next.lifepath })
  })
})

describe("VaultMinder.tryGetOnce(scoped) and getOnce(scoped)", () => {
  it("resolve the record the Thing at the scope holds, its events told before it resolves, with the bank's own get ask", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    const box = TH.boxThingOf()
    cheatStored(inner, box)
    const asked = vi.spyOn(inner, 'tryGetThing')
    const { events } = heardOf(vaultDB)
    const ask   = vaultDB.makeGetAsk({ labelpath: 'box/openai', ifAbsent: 'nil' })
    const record = await vaultDB.getOnce(TH.BoxScope)
    expect(record).to.equal(vaultDB.thingAt(TH.BoxScope)?.pickle()).and.deep.equal(box)
    expect(shorthandsOf(events)).to.deep.equal(firstSeen('box/openai'))
    expect(asked.mock.calls).to.deep.equal([[ask]])
  })

  it("resolve the shell where none is stored", async () => {
    const { vaultDB } = sortedOverMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    expect(await vaultDB.getOnce(TH.BoxScope)).to.deep.equal(Shell.of(TH.BoxScope, TH.rootBoxOf()))
  })

  it("resolve the record the Thing holds for an answer older than a whole record it knows", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    cheatStored(inner, TH.boxThingOf())
    const newer = TH.nextOf(TH.boxThingOf())
    vaultDB.receive(rungOf(newer))
    const answer = await vaultDB.tryGetOnce(TH.BoxScope)
    expect(answer).to.deep.include({ ok: true, act: 'gotlive', val: TH.boxThingOf() })
    expect(await vaultDB.getOnce(TH.BoxScope)).to.equal(newer)
  })

  it("throw stale_read where the Thing is known only sparse in its newest life, and its try form answers the vaultDB's answer", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    const box = TH.boxThingOf()
    cheatStored(inner, box)
    const reborn = TH.boxRebornOf(TH.boxTombOf(box))
    vaultDB.receive(rungOf(Thing.sparseOf(reborn)))
    const err = await TH.expectRefusal(vaultDB.getOnce(TH.BoxScope))
    expect(err.refusalkind).to.eq('stale_read')
    expect(await vaultDB.tryGetOnce(TH.BoxScope)).to.deep.include({ ok: true, act: 'gotlive', val: box })
  })

  it("answer, or throw, the vaultDB's refusal", async () => {
    const { vaultDB, inner } = sortedOverMemory()
    vi.spyOn(inner, 'tryGetThing').mockImplementation(async (ask) => await MemoryVaultDB.prototype.tryGetThing.call(inner, { ...ask, ifAbsent: 'fail' }))
    expect(await vaultDB.tryGetOnce(TH.GateScope)).to.deep.include({ ok: false, act: 'void' })
    await TH.expectRefusal(vaultDB.getOnce(TH.GateScope))
  })

  it("answer a refusal for a scope of another bank, asking the vaultDB nothing", async () => {
    const { vaultDB, inner } = sortedOverMemory()
    const asked = vi.spyOn(inner, 'tryGetThing')
    await TH.expectBad(vaultDB.tryGetOnce({ ...TH.BoxScope, banklabel: 'other' }), 'bad_record')
    await TH.expectBad(vaultDB.tryGetOnce(null as never), 'bad_record')
    await TH.expectRefusal(vaultDB.getOnce({ ...TH.BoxScope, banklabel: 'other' }), 'bad_record')
    expect(asked).not.toHaveBeenCalled()
  })
})

describe("VaultMinder.tryListOnce(labelpath) and listOnce(labelpath)", () => {
  it("resolve the listing once the parent and each child are told, with the bank's own list ask", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    cheatStored(inner, TH.boxThingOf())
    const listed = vi.spyOn(inner, 'tryListThings')
    const ask  = vaultDB.makeListAsk({ labelpath: 'box', ifAbsent: 'nil' })
    const kids = await vaultDB.listOnce('box')
    expect(Object.keys(kids.items)).to.deep.equal(['openai'])
    expect(vaultDB.thingAt(TH.BoxScope)?.citable).to.deep.equal(Thing.sparseOf(TH.boxThingOf()))
    expect(listed.mock.calls).to.deep.equal([[ask]])
  })

  it("list nothing under a parent never stored", async () => {
    const { vaultDB } = sortedOverMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    const kids = await vaultDB.listOnce('box/nope')
    expect([kids.items, kids.gones]).to.deep.equal([{}, {}])
  })

  it("tell each listener's onBadNews of a child stored damaged, and list the rest", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    cheatStored(inner, TH.boxThingOf())
    inner._cheat_things(TH.ThingBank).set('box/bad', { ...TH.boxThingOf('bad'), revseq: -2 })
    const { badNews } = heardOf(vaultDB)
    const answer = await vaultDB.tryListOnce('box')
    expect(answer).to.deep.include({ ok: true })
    expect(badNews.map((news) => [news.refusalkind, news.meta?.labelpaths])).to.deep.equal([['damaged_row', ['box/bad']]])
  })

  it("answer, or throw, the vaultDB's refusal", async () => {
    const { vaultDB } = sortedOverMemory()
    await TH.expectBad(vaultDB.tryListOnce('Box'), 'bad_record')
    await TH.expectRefusal(vaultDB.listOnce('Box'), 'bad_record')
  })
})

describe("VaultMinder's writes: tryPutOnce, putOnce, tryDelOnce and delOnce", () => {
  it("put over the citable of the Thing at the record's labelpath, resolving the record stored, which the Thing holds", async () => {
    const { vaultDB } = sortedOverQuietMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    await vaultDB.getOnce(TH.BoxScope)
    const written = await vaultDB.putOnce({ record: TH.boxThingOf() })
    expect(written).to.deep.equal(TH.boxThingOf())
    expect(vaultDB.thingAt(TH.BoxScope)?.pickle()).to.equal(written)
  })

  it("put over a cold box, citing the newer revision known only sparse", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    await vaultDB.putOnce({ record: TH.boxThingOf(), cited: Shell.childCited(TH.Life0) })
    const box1 = TH.nextOf(TH.boxThingOf())
    cheatStored(inner, box1)
    vaultDB.receive(rungOf(Thing.sparseOf(box1)))
    expect(vaultDB.thingAt(TH.BoxScope)?.agekind).to.eq('cold')
    const box2 = TH.nextOf(box1)
    const asked = vi.spyOn(inner, 'tryWriteThing')
    expect(await vaultDB.putOnce({ record: box2 })).to.deep.equal(box2)
    expect(asked.mock.calls[0]![0].cited).to.deep.equal(Thing.sparseOf(box1))
  })

  it("throw a stale write's refusal once the record stored is told, and its try form answers it", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    const root1 = TH.nextOf(TH.rootBoxOf())
    cheatStored(inner, root1)
    const mine = TH.nextOf(TH.rootBoxOf(), { revtok: TH.revtokOf('mine') })
    const err  = await TH.expectRefusal(vaultDB.putOnce({ record: mine }))
    expect(err.refusalkind).to.eq('stale_write')
    expect(vaultDB.thingAt(TH.RootScope)?.pickle()).to.deep.equal(root1)
    expect(await vaultDB.tryPutOnce({ record: TH.nextOf(root1) })).to.deep.include({ ok: true })
  })

  it("answer the vaultDB's refusal where no Thing is kept at the labelpath and no cited is given", async () => {
    const { vaultDB } = sortedOverMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    await TH.expectBad(vaultDB.tryPutOnce({ record: TH.boxThingOf() }), 'bad_record')
  })

  it("answer a refusal for a record of another bank, asking the vaultDB nothing", async () => {
    const { vaultDB, inner } = sortedOverMemory()
    const asked = vi.spyOn(inner, 'tryWriteThing')
    await TH.expectBad(vaultDB.tryPutOnce({ record: TH.boxThingOf('openai', { banklabel: 'other' }) }), 'bad_record')
    await TH.expectBad(vaultDB.tryDelOnce(null as never), 'unexpected_error')
    expect(asked).not.toHaveBeenCalled()
  })

  it("delete over the citable of the Thing, resolving the tombstone stored, which the Thing holds", async () => {
    const { vaultDB } = sortedOverMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    const box = await vaultDB.putOnce({ record: TH.boxThingOf(), cited: Shell.childCited(TH.Life0) })
    const tomb = TH.boxTombOf(box)
    expect(await vaultDB.delOnce({ record: tomb })).to.deep.equal(tomb)
    expect(vaultDB.thingAt(TH.BoxScope)?.pickle()).to.deep.equal(tomb)
    expect(await vaultDB.tryDelOnce({ record: tomb })).to.deep.include({ ok: false })
  })
})
