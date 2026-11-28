import { noop, omit } from 'es-toolkit'
import { describe, expect, it, vi } from 'vitest'
import { type Errors, SX } from 'safebyok-big/internals'
import { Thing } from '../../src/models/thing'
import { type ThingRecord, type ThingScope, Shell } from '../../src/shapes/shapes-thing'
import type { ReadTc, SeenThing, VaultEvent, VaultItemEvent } from '../../src/shapes/shapes-vault-event'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import { VaultMinder } from '../../src/minding/vault-minder'
import type { ThingCar } from '../../src/minding/thing-car'
import { v7 as uuidv7 } from 'uuid'
import { VacantAgerank, VacantReadTc, readTcNow } from '../../src/storage/agerank'
import { VoidTrack } from '../../src/shapes/shapes-asks'
import type { VaultDB } from '../../src/storage/vault-db'
import * as TH from '../test-helpers'

/** Where the test bank's gate is stored: at its banklabel. */
const Gatepath = TH.GateScope.labelpath

/** The datastore in memory each VaultMinder the battery makes stands over. */
const InnerOf = new WeakMap<VaultMinder, MemoryVaultDB>()

TH.describeVaultDBBattery('VaultMinder over a MemoryVaultDB', {
  servesOneBank: true,
  makeVaultDB: () => {
    const inner = new MemoryVaultDB()
    const vaultDB = VaultMinder.make(TH.ThingBank, { vaultDB: inner, bank: TH.PlainCarBank })
    InnerOf.set(vaultDB, inner)
    return vaultDB
  },
  _cheat_rowsOf: (vaultDB) => {
    const inner = InnerOf.get(vaultDB)!
    return {
      plant:  (scope, raw) => { inner._cheat_things(scope)[scope.modelkind].set(scope.labelpath, structuredClone(raw)) },
      remove: (scope) => { inner._cheat_things(scope)[scope.modelkind].delete(scope.labelpath) },
    }
  },  // It has no watch: what it tells its listeners is below.
  watches: false,
})

/** A refused answer carrying no record, named for the verb that answers it. */
function stubAnswerOf(verbname: string): never { return { ok: false, ask: {}, verbname, dbhas: null, parentage: [], deltas: [], read_tc: readTcNow(), banktok: SX.VoidLifeTok, tracked: 'unread' } as never }

/** A vaultDB whose every verb answers {@link stubAnswerOf} its own name, and whose watch answers `stop`. */
function stubVaultDBOf(stop: () => void) {
  return {
    tryGetThing:   vi.fn<VaultDB['tryGetThing']>(() => Promise.resolve(stubAnswerOf('got'))),
    tryWriteThing: vi.fn<VaultDB['tryWriteThing']>(() => Promise.resolve(stubAnswerOf('wrote'))),
    tryListThings: vi.fn<VaultDB['tryListThings']>(() => Promise.resolve(stubAnswerOf('listed'))),
    tryBirthBank:  vi.fn<VaultDB['tryBirthBank']>(() => Promise.resolve(stubAnswerOf('born'))),
    tryGetBank:    vi.fn<VaultDB['tryGetBank']>(() => Promise.resolve(stubAnswerOf('bank'))),
    tryStats:      vi.fn<VaultDB['tryStats']>(() => Promise.resolve(stubAnswerOf('stats'))),
    watch:         vi.fn<VaultDB['watch']>(() => stop),
  } satisfies VaultDB
}

/** A VaultMinder over a MemoryVaultDB, watching it, and that MemoryVaultDB, to write beside it. */
function sortedOverMemory(): { vaultDB: VaultMinder<TH.PlainThing>, inner: MemoryVaultDB } {
  const inner = new MemoryVaultDB()
  return { vaultDB: VaultMinder.make(TH.ThingBank, { vaultDB: inner, bank: TH.PlainCarBank }).connect(), inner }
}

/** The track of a sender that knows only the root box, at its revision. */
const RootOnlyTrack = TH.trackOf(TH.gateShellOf())

/** A box's revisions: `two`, which a {@link TH.RefusingThing} takes, and `three` after it, which it refuses. */
const Revs = (() => {
  const two = TH.nextOf(TH.nextOf(TH.boxThingOf()))
  return { two, three: TH.nextOf(two) }
})()

/** True for a refusal of a {@link TH.RefusingThing}'s: an `unexpected_error` whose cause says the record is refused. */
function isThingRefusal(news: Errors.VaultError): boolean { return (news.refusalkind === 'unexpected_error') && ((news.cause as Error).message === TH.RefusingThing.Refusal) }

/** A VaultMinder of {@link TH.RefusingThing}s over a MemoryVaultDB whose own watch notifies nothing, and that MemoryVaultDB. */
function refusingOverQuietMemory(): { vaultDB: VaultMinder<TH.RefusingThing>, inner: MemoryVaultDB } {
  const inner = new MemoryVaultDB()
  vi.spyOn(inner, 'watch').mockReturnValue(noop)
  return { vaultDB: VaultMinder.make(TH.ThingBank, { vaultDB: inner, bank: { makeThing: (shell) => TH.RefusingThing.make(shell) } }), inner }
}

/** A VaultMinder over a MemoryVaultDB whose own watch notifies nothing, so that every event it tells is of an answer's records. */
function sortedOverQuietMemory(): { vaultDB: VaultMinder<TH.PlainThing>, inner: MemoryVaultDB } {
  const inner = new MemoryVaultDB()
  vi.spyOn(inner, 'watch').mockReturnValue(noop)
  return { vaultDB: VaultMinder.make(TH.ThingBank, { vaultDB: inner, bank: TH.PlainCarBank }), inner }
}

/** The item event a device database might ring for `record`, from `'other_tab'` at `read_tc`. */
function rungOf(record: SeenThing, read_tc: ReadTc = readTcNow()): VaultItemEvent {
  return { ...TH.itemEventOf(record), sourcelabel: 'other_tab', read_tc }
}

/** Put `record` in `inner`'s datastore past its verbs. */
function cheatPlant(inner: MemoryVaultDB, record: ThingRecord): void { inner._cheat_things(record)[record.modelkind].set(record.labelpath, structuredClone(record)) }

/** A listener to `vaultDB`: the events it hears, the bad news it is told, and the end of its listen. */
function heardOf(vaultDB: VaultMinder): { events: VaultEvent[], badNews: Errors.VaultError[], end: () => void } {
  const events: VaultEvent[] = []
  const badNews: Errors.VaultError[] = []
  const end = vaultDB.listen({ hear: (event) => { events.push(event) }, onBadNews: (news) => { badNews.push(news) } })
  return { events, badNews, end }
}

/** The fields of `car`, as a plain object. */
function carFieldsOf(car: ThingCar): Pick<ThingCar, 'thing' | 'lastErr' | 'erred_at' | 'read_tc'> {
  return { thing: car.thing, lastErr: car.lastErr, erred_at: car.erred_at, read_tc: car.read_tc }
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

/** The shorthands of a Thing seen first as the shell. */
function voidSeen(labelpath: string): string[][] { return [['item', labelpath, 'void'], ['life', labelpath, 'died']] }

/** The shorthands of a Thing seen first, sparse and live. */
function firstSeenSparse(labelpath: string): string[][] { return [['item', labelpath, 'soon'], ['life', labelpath, 'born'], ['aged', labelpath, 'bare']] }

describe("VaultMinder, what only a wrapper can show", () => {
  it("hands each verb's ask to the vaultDB it wraps, and answers that vaultDB's own answer", async () => {
    const inner = stubVaultDBOf(() => undefined)
    const vaultDB = VaultMinder.make(TH.ThingBank, { vaultDB: inner, bank: TH.PlainCarBank })
    const asks = { get: TH.getGateAskOf(), write: TH.birthAskOf(), list: TH.listAskAt('box', 'box'), birth: TH.birthBankAskOf(), bank: TH.getBankAskOf(), stats: TH.statsAskOf() }
    expect(await vaultDB.tryGetThing(asks.get)).to.equal(await inner.tryGetThing.mock.results[0]!.value)
    expect(await vaultDB.tryWriteThing(asks.write)).to.equal(await inner.tryWriteThing.mock.results[0]!.value)
    expect(await vaultDB.tryListThings(asks.list)).to.equal(await inner.tryListThings.mock.results[0]!.value)
    expect(await vaultDB.tryBirthBank(asks.birth)).to.equal(await inner.tryBirthBank.mock.results[0]!.value)
    expect(await vaultDB.tryGetBank(asks.bank)).to.equal(await inner.tryGetBank.mock.results[0]!.value)
    expect(await vaultDB.tryStats(asks.stats)).to.equal(await inner.tryStats.mock.results[0]!.value)
    expect(inner.tryGetThing.mock.calls[0]![0]).to.equal(asks.get)
    expect(inner.tryWriteThing.mock.calls[0]![0]).to.equal(asks.write)
    expect(inner.tryListThings.mock.calls[0]![0]).to.equal(asks.list)
    expect(inner.tryBirthBank.mock.calls[0]![0]).to.equal(asks.birth)
    expect(inner.tryGetBank.mock.calls[0]![0]).to.equal(asks.bank)
    expect(inner.tryStats.mock.calls[0]![0]).to.equal(asks.stats)
  })

  it("watches nothing until connected", () => {
    const inner = stubVaultDBOf(vi.fn())
    const vaultDB = VaultMinder.make(TH.ThingBank, { vaultDB: inner, bank: TH.PlainCarBank })
    heardOf(vaultDB)
    expect([inner.watch.mock.calls.length, vaultDB.isWatching]).to.deep.equal([0, false])
  })

  it("watches its bank in the vaultDB it wraps once while connected, however often connected and whoever listens to it, asking nothing", () => {
    const stop = vi.fn()
    const inner = stubVaultDBOf(stop)
    const vaultDB = VaultMinder.make(TH.ThingBank, { vaultDB: inner, bank: TH.PlainCarBank })
    expect(vaultDB.connect().connect()).to.equal(vaultDB)
    expect(inner.watch.mock.calls.map(([scope]) => scope)).to.deep.equal([TH.ThingBank])
    const ends = [heardOf(vaultDB).end, heardOf(vaultDB).end]
    for (const end of ends) { end() }
    heardOf(vaultDB)
    expect([inner.watch.mock.calls.length, stop.mock.calls.length, vaultDB.isWatching]).to.deep.equal([1, 0, true])
    expect([inner.tryGetThing, inner.tryWriteThing, inner.tryListThings, inner.tryBirthBank].every((verb) => verb.mock.calls.length === 0)).to.equal(true)
  })

  it("stops its watch of the vaultDB it wraps at its disconnect, and still tells of an answer's records", async () => {
    const { vaultDB, inner } = sortedOverMemory()
    const { events } = heardOf(vaultDB)
    expect(vaultDB.disconnect().disconnect()).to.equal(vaultDB)
    expect(vaultDB.isWatching).to.equal(false)
    await inner.tryBirthBank(TH.birthBankAskOf())
    await TH.aWhile()
    expect(events).to.deep.equal([])
    await vaultDB.tryGetThing(TH.getGateAskOf())
    expect(shorthandsOf(events)).to.deep.equal([...firstSeen(Gatepath), ...firstSeen('box')])
  })

  it("calls the wrapped watch's stop once, however often disconnected, and watches again at its next connect", () => {
    const stop = vi.fn()
    const inner = stubVaultDBOf(stop)
    const vaultDB = VaultMinder.make(TH.ThingBank, { vaultDB: inner, bank: TH.PlainCarBank }).connect()
    vaultDB.disconnect()
    vaultDB.disconnect()
    expect(stop).toHaveBeenCalledTimes(1)
    vaultDB.connect()
    expect([inner.watch.mock.calls.length, vaultDB.isWatching]).to.deep.equal([2, true])
  })

  it("watches nothing once the wrapped watch ends of itself, and watches again at its next connect", () => {
    const stop = vi.fn()
    const inner = stubVaultDBOf(stop)
    const vaultDB = VaultMinder.make(TH.ThingBank, { vaultDB: inner, bank: TH.PlainCarBank }).connect()
    const onEnded = inner.watch.mock.calls[0]![3]!
    onEnded()
    expect([vaultDB.isWatching, stop.mock.calls.length]).to.deep.equal([false, 0])
    vaultDB.connect()
    expect([inner.watch.mock.calls.length, vaultDB.isWatching]).to.deep.equal([2, true])
  })

  it("calls the onEnded handed to connect once the wrapped watch ends of itself, already watching nothing", () => {
    const inner = stubVaultDBOf(vi.fn())
    const vaultDB = VaultMinder.make(TH.ThingBank, { vaultDB: inner, bank: TH.PlainCarBank })
    const watchingWhenEnded: boolean[] = []
    vaultDB.connect(() => { watchingWhenEnded.push(vaultDB.isWatching) })
    inner.watch.mock.calls[0]![3]!()
    expect(watchingWhenEnded).to.deep.equal([false])
  })

  it("never calls the onEnded of a connect made while watching", () => {
    const inner = stubVaultDBOf(vi.fn())
    const first = vi.fn()
    const second = vi.fn()
    VaultMinder.make(TH.ThingBank, { vaultDB: inner, bank: TH.PlainCarBank }).connect(first).connect(second)
    inner.watch.mock.calls[0]![3]!()
    expect([first.mock.calls.length, second.mock.calls.length, inner.watch.mock.calls.length]).to.deep.equal([1, 0, 1])
  })

  it("refuses an onEnded that is not a function, and watches nothing", () => {
    const inner = stubVaultDBOf(vi.fn())
    const vaultDB = VaultMinder.make(TH.ThingBank, { vaultDB: inner, bank: TH.PlainCarBank })
    TH.expectSyncRefusal(() => { vaultDB.connect('tell me' as never) }, 'bad_record')
    expect([inner.watch.mock.calls.length, vaultDB.isWatching]).to.deep.equal([0, false])
  })

  it("watches nothing when the wrapped watch throws as it connects, and throws that", () => {
    const inner = stubVaultDBOf(vi.fn())
    const thrown = new Error('watch refused')
    inner.watch.mockImplementation(() => { throw thrown })
    const vaultDB = VaultMinder.make(TH.ThingBank, { vaultDB: inner, bank: TH.PlainCarBank })
    expect(() => vaultDB.connect()).to.throw(thrown)
    expect(vaultDB.isWatching).to.equal(false)
  })

  const BadArgs = [
    [TH.ThingBank,                        undefined,                          'no options'],
    [TH.ThingBank,                        {},                                 'no vaultDB'],
    [TH.ThingBank,                        { vaultDB: { tryGetThing: noop } }, 'a vaultDB missing a verb'],
    [TH.ThingBank,                        { vaultDB: new MemoryVaultDB() },   'no bank'],
    [TH.ThingBank,                        { vaultDB: new MemoryVaultDB(), bank: { makeThing: 'plain' } }, 'a bank whose makeThing is no function'],
    [undefined,                           { vaultDB: new MemoryVaultDB(), bank: TH.PlainCarBank }, 'no scope'],
    [{ userid: TH.ThingBank.userid },     { vaultDB: new MemoryVaultDB(), bank: TH.PlainCarBank }, 'a scope with no banklabel'],
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
    const track = { gate: TH.GateStaleTrack.gate, root: TH.RootStaleTrack.root }
    const answer = await vaultDB.tryWriteThing({ ...TH.birthAskOf(TH.gateThingOf({ revtok: TH.OtherRevtok })), track })
    expect(answer).to.deep.include({ ok: false, dbhas: TH.gateThingOf() })
    expect(shorthandsOf(events)).to.deep.equal([...firstSeen(Gatepath), ...firstSeen('box')])
    expect(badNews).to.deep.equal([])
  })

  it("tells of the three roots a get of the bank answers, in root order, the shell at each where none is stored, before it answers", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    const { events, badNews } = heardOf(vaultDB)
    expect(await vaultDB.tryGetBankOnce()).to.deep.include({ ok: true, act: 'got' })
    expect(shorthandsOf(events)).to.deep.equal([...voidSeen(Gatepath), ...voidSeen('box')])
    await inner.tryBirthBank(TH.birthBankAskOf())
    expect(await vaultDB.tryGetBankOnce()).to.deep.include({ ok: true, act: 'got' })
    expect(shorthandsOf(events.slice(4))).to.deep.equal([...firstSeen(Gatepath), ...firstSeen('box')])
    expect(badNews).to.deep.equal([])
  })

  it("tells of a listing's parent, then each Thing listed, sparse and in labelpath order, after the bank and main gate", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await inner.tryBirthBank(TH.birthBankAskOf())
    for (const label of ['openai', 'anthropic']) { await inner.tryWriteThing(TH.birthAskOf(TH.boxThingOf(label), Shell.childCited(TH.Life0))) }
    const { events } = heardOf(vaultDB)
    await vaultDB.tryListThings({ ...TH.listAskAt('box', 'box'), track: RootOnlyTrack })
    expect(shorthandsOf(events)).to.deep.equal([
      ...firstSeen(Gatepath), ...firstSeenSparse('box'), ...firstSeenSparse('box/anthropic'), ...firstSeenSparse('box/openai'),
    ])
    expect(events.filter((event) => event.eventkind === 'item').map((event) => event.val)).to.deep.equal(
      [TH.gateThingOf(), ...[TH.rootBoxOf(), TH.boxThingOf('anthropic'), TH.boxThingOf('openai')].map((thing) => TH.boxSparseOf(thing))],
    )
  })

  it("tells of a birth's roots, each write's record, and a get's record, the answers' own objects", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    const { events } = heardOf(vaultDB)
    const born = await vaultDB.tryBirthBank(TH.birthBankAskOf({ track: TH.trackOf() }))
    expect(shorthandsOf(events)).to.deep.equal([...firstSeen(Gatepath), ...firstSeen('box')])
    const box = TH.boxThingOf()
    const written = await vaultDB.tryWriteThing(TH.birthAskOf(box, Shell.childCited(TH.Life0)))
    const next = TH.nextOf(box)
    cheatPlant(inner, next)
    const got = await vaultDB.tryGetThing(TH.getAskAt('box', box.labelpath))
    const records = events.filter((event) => event.eventkind === 'item').map((event) => event.val)
    expect(records).to.deep.equal([TH.gateThingOf(), TH.rootBoxOf(), box, next])
    expect([records[1], records[2], records[3]]).to.have.ordered.members([born.ok && born.val.root, written.ok && written.val, got.ok && got.val])
  })

  it("tells of nothing for a repeat or an older record", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await inner.tryBirthBank(TH.birthBankAskOf())
    const { events } = heardOf(vaultDB)
    await vaultDB.tryGetThing(TH.getGateAskOf())
    expect(shorthandsOf(events)).to.deep.equal([...firstSeen(Gatepath), ...firstSeen('box')])
    await vaultDB.tryGetThing(TH.getGateAskOf())
    const next = TH.nextGateOf(TH.gateThingOf())
    await vaultDB.tryWriteThing(TH.replaceAskOf(TH.gateThingOf(), next))
    const gate = TH.gateThingOf()
    vaultDB.receive(rungOf(gate))
    await TH.aWhile()
    expect(shorthandsOf(events.slice(4))).to.deep.equal([['item', Gatepath, 'full']])
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
    vaultDB.receive(rungOf(gate, later))
    expect(shorthandsOf(events)).to.deep.equal([...firstSeen(Gatepath), ['item', Gatepath, 'full']])
    expect(events[2]).to.deep.include({ read_tc: later })
  })

  it("tells of a whole record seen sparse first, and of a newer sparse one as aged", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await inner.tryBirthBank(TH.birthBankAskOf())
    const { events } = heardOf(vaultDB)
    const root = TH.rootBoxOf()
    const rootNext = TH.nextOf(root)
    vaultDB.receive(rungOf(TH.boxSparseOf(root)))
    await vaultDB.tryGetThing(TH.getAskAt('box', 'box'))
    vaultDB.receive(rungOf(TH.boxSparseOf(rootNext)))
    expect(shorthandsOf(events)).to.deep.equal([
      ...firstSeenSparse('box'), ...firstSeen(Gatepath), ['item', 'box', 'full'], ['item', 'box', 'soon'], ['aged', 'box', 'cold'],
    ])
  })

  it("tells of the void sentinel a get's answer carries, under its parent's life as the step read it", async () => {
    const { vaultDB } = sortedOverMemory()
    const { events } = heardOf(vaultDB)
    await vaultDB.tryBirthBank(TH.birthBankAskOf())
    const answer = await vaultDB.tryGetThing(TH.getAskAt('box', 'box/openai'))
    expect(answer).to.deep.include({ act: 'gotvoid' })
    expect(shorthandsOf(events.slice(4))).to.deep.equal([['item', 'box/openai', 'void'], ['life', 'box/openai', 'died']])
    const voided = events.find((event) => event.labelpath === 'box/openai')
    const lifepath = `${TH.rootBoxOf().lifepath}/${Shell.VoidLifeseq}`
    expect(voided).to.deep.include({ val: answer.ok && answer.act === 'gotvoid' && answer.dbhas, agerank: `${lifepath}|-000000001|-000000001|${answer.read_tc.slice(0, 8)}` })
    expect(voided).to.deep.include({ val: Shell.of({ ...TH.BoxScope, lifepath }) })
  })

  it("tells of the void sentinel a get's answer carries under a parent it has not seen, and under one not stored", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await inner.tryBirthBank(TH.birthBankAskOf())
    const { events } = heardOf(vaultDB)
    expect(await vaultDB.tryGetThing({ ...TH.getAskAt('box', 'box/openai'), track: RootOnlyTrack })).to.deep.include({ act: 'gotvoid' })
    expect(shorthandsOf(events)).to.deep.equal([...firstSeen(Gatepath), ['item', 'box/openai', 'void'], ['life', 'box/openai', 'died']])
    const unborn = sortedOverMemory()
    const unbornEvents = heardOf(unborn.vaultDB).events
    await unborn.vaultDB.tryGetThing(TH.getAskAt('box', 'box/openai'))
    expect(unbornEvents[0]).to.deep.include({ val: Shell.of({ ...TH.BoxScope, lifepath: `${Shell.VoidLifeseq}/${Shell.VoidLifeseq}` }) })
  })

  it("tells of the shell a write refused over nothing stored carries", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await inner.tryBirthBank(TH.birthBankAskOf())
    const { events } = heardOf(vaultDB)
    const answer = await vaultDB.tryWriteThing({ ...TH.birthAskOf(TH.boxThingOf(), Shell.childCited(TH.Life0)), ifAbsent: 'fail' })
    expect(answer).to.deep.include({ ok: false, act: 'void' })
    expect(shorthandsOf(events)).to.deep.equal([...firstSeen(Gatepath), ...firstSeen('box'), ['item', 'box/openai', 'void'], ['life', 'box/openai', 'died']])
    expect(events[4]).to.deep.include({ val: Shell.of({ ...TH.BoxScope, lifepath: `${TH.Life0}/${Shell.VoidLifeseq}` }) })
  })

  it("tells of the void at a root as the root's own shell", async () => {
    const { vaultDB } = sortedOverMemory()
    const { events } = heardOf(vaultDB)
    const answer = await vaultDB.tryGetThing(TH.getGateAskOf())
    expect(answer).to.deep.include({ act: 'gotvoid' })
    expect(shorthandsOf(events)).to.deep.equal([['item', Gatepath, 'void'], ['life', Gatepath, 'died']])
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

  it("refuses an ask of another bank where it enters, asking the vaultDB nothing and telling nothing", async () => {
    const { vaultDB, inner } = sortedOverMemory()
    const { events, badNews } = heardOf(vaultDB)
    const asked = [vi.spyOn(inner, 'tryGetThing'), vi.spyOn(inner, 'tryWriteThing'), vi.spyOn(inner, 'tryListThings'), vi.spyOn(inner, 'tryBirthBank')]
    for (const userOrBank of [{ banklabel: 'other' }, { userid: 'u2' }]) {
      await TH.expectBad(vaultDB.tryGetThing({ ...TH.getGateAskOf(), ...userOrBank }), 'bad_record')
      await TH.expectBad(vaultDB.tryWriteThing({ ...TH.birthAskOf(), ...userOrBank }), 'bad_record')
      expect(await vaultDB.tryListThings({ ...TH.listAskAt('box', 'box'), ...userOrBank })).to.deep.include({ ok: false, dbhas: null, parentage: [], deltas: [], incompatible_rows: [] })
      await TH.expectBad(vaultDB.tryBirthBank({ ...TH.birthBankAskOf(), ...userOrBank }), 'bad_record')
    }
    for (const spy of asked) { expect(spy).not.toHaveBeenCalled() }
    expect([events, badNews]).to.deep.equal([[], []])
    expect(vaultDB.thingAt(TH.GateScope)).to.be.undefined
  })

  it("tells every listener's onBadNews of a record of an answer it refuses, and answers unchanged", async () => {
    const theirs = { ok: true, act: 'born', ask: TH.ThingBank, banktok: SX.VoidLifeTok, tracked: { gate: 'same', root: 'same' }, read_tc: readTcNow(), val: TH.gateThingOf({ lifepath: 'not a lifepath' }) }
    const inner  = { ...stubVaultDBOf(noop), tryWriteThing: vi.fn<VaultDB['tryWriteThing']>(() => Promise.resolve(theirs as never)) }
    const vaultDB = VaultMinder.make(TH.ThingBank, { vaultDB: inner, bank: TH.PlainCarBank })
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
    const track = { gate: TH.GateStaleTrack.gate, root: TH.RootStaleTrack.root }
    const answer = await vaultDB.tryGetThing({ ...TH.getGateAskOf(), track })
    expect(events).to.have.lengthOf(4)
    for (const event of events) { expect(event).to.deep.include({ sourcelabel: VaultMinder.VaultDBSourcelabel, read_tc: answer.read_tc, banktok: TH.gateThingOf().banktok }) }
    expect(VaultMinder.VaultDBSourcelabel).to.eq('vault_db')
  })

  it("stamps an answer's events with its own banktok, never its ask's, and a received event's with its own, else the newest banktok heard", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    const { events } = heardOf(vaultDB)
    const { banktok } = TH.gateThingOf()
    const [askBanktok, rungBanktok] = [crypto.randomUUID(), crypto.randomUUID()]
    vaultDB.receive(rungOf(TH.boxThingOf('mistral')))
    await vaultDB.tryBirthBank(TH.birthBankAskOf())
    await inner.tryWriteThing(TH.birthAskOf(TH.boxThingOf(), Shell.childCited(TH.Life0)))
    await vaultDB.tryGetThing({ ...TH.getAskAt('box', 'box/openai'), banktok: askBanktok })
    vaultDB.receive(rungOf(TH.boxThingOf('anthropic')))
    vaultDB.receive({ ...rungOf(TH.boxThingOf('cohere')), banktok: rungBanktok })
    // Each box first seen gives two events, an item and a life; the birth, four.
    expect(events.map((event) => event.banktok)).to.deep.equal([
      SX.VoidLifeTok, SX.VoidLifeTok, ...Array.from({ length: 4 }, () => banktok), banktok, banktok, banktok, banktok, rungBanktok, rungBanktok,
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
    expect(shorthandsOf(rung)).to.deep.equal([['item', Gatepath, 'full'], ...firstSeen('box/openai')])
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
    const scope = { userid: box.userid, banklabel: box.banklabel, labelpath: box.labelpath, modelkind: 'box' as const, banktok: SX.VoidLifeTok, sourcelabel: 'other_tab', read_tc: readTcNow() }
    vaultDB.receive({ ...scope, eventkind: 'life', lifekind: 'born', agerank: 'zzz', agerankWas: VacantAgerank })
    vaultDB.receive({ ...scope, eventkind: 'aged', agekind: 'bare', agekindWas: 'vacant', agerank: 'zzz', agerankWas: VacantAgerank })
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
    expect(await vaultDB.tryGetThing(TH.getAskAt('box', 'box/openai'))).to.deep.include({ act: 'gotvoid' })
    expect(events).to.have.lengthOf(6)
  })

  const BoxTomb = TH.boxTombOf(TH.boxThingOf())
  const BadEvents = [
    [{ ...rungOf(TH.gateThingOf()), sourcelabel: 'Other Tab' },                         'a sourcelabel that is not a label'],
    [{ ...rungOf(TH.gateThingOf()), sourcelabel: undefined },                           'no sourcelabel'],
    [rungOf(TH.gateThingOf(), crypto.randomUUID()),                                    'a read_tc that is no UUID version 7'],
    [{ ...rungOf(TH.gateThingOf()), eventkind: 'told' },                                'an eventkind it does not know'],
    [undefined,                                                                          'no event'],
    [{ ...rungOf(TH.gateThingOf()), val: 'not a Thing' },                                'a val that is not a Thing'],
    [rungOf(TH.gateThingOf({ banklabel: 'other', labelpath: 'other', label: 'other' })), 'an event of another bank'],
    [{ ...rungOf(TH.boxThingOf('openai', { banklabel: 'other' })), banklabel: 'acme' }, 'a record of another bank than its event'],
    [rungOf(TH.gateThingOf({ labelpath: 'other', label: 'other' })),                    "a gate at another labelpath than its banklabel"],
    [{ ...rungOf(TH.boxThingOf()), labelpath: 'box/anthropic' },                         'a record of another Thing than its event'],
    [rungOf(TH.boxThingOf('openai', { lifepath: TH.Life0 })),                           'a lifepath shallower than its labelpath'],
    [{ ...rungOf(TH.gateThingOf()), liveness: 'dead' },                                 'a liveness it does not know'],
    [{ ...rungOf(TH.gateThingOf()), liveness: 'void' },                                 'a void event whose val is not the void sentinel'],
    [{ ...rungOf(Shell.of({ ...TH.BoxScope, lifepath: Shell.childCited(TH.Life0).lifepath })), liveness: 'gone' }, 'an event not void whose val is the void sentinel'],
    [rungOf(Thing.sparseOf(TH.gateThingOf()) as never),                                 "a gate's sparse record"],
    [rungOf(Thing.sparseOf(BoxTomb) as never),                                          "a box tombstone's sparse record"],
    [rungOf(omit(TH.boxThingOf(), ['sidecar']) as never),                               'a live box with half its body'],
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
  it("answers the one Thing it caches at a labelpath, the same object across records and lives", async () => {
    const { vaultDB } = sortedOverQuietMemory()
    await vaultDB.tryBirthBank(TH.birthBankAskOf())
    const thing = vaultDB.thingAt(TH.RootScope)!
    expect(thing.pickle()).to.deep.include({ labelpath: 'box', revseq: 0 })
    const tomb = TH.boxThingOf('box', { labelpath: 'box', am: 'x', lifepath: TH.lifepathPlus(TH.Life0, 1), lifeseq: TH.lifepathPlus(TH.Life0, 1), revseq: 1 })
    const soon = TH.boxSparseOf(TH.rootBoxOf({ revseq: 3 }))
    vaultDB.receive(rungOf(soon))
    vaultDB.receive(rungOf(tomb))
    expect(vaultDB.thingAt(TH.RootScope)).to.equal(thing)
    expect(thing.pickle()).to.equal(tomb)
    expect(thing).to.include({ am: 'x', lifepath: tomb.lifepath })
  })

  it("answers undefined for a labelpath it has learned of no record at, and a Thing at the shell where it learned only of a record its Thing refused", () => {
    const inner = stubVaultDBOf(noop)
    const vaultDB = VaultMinder.make(TH.ThingBank, { vaultDB: inner, bank: TH.PlainCarBank }).connect()
    const { badNews } = heardOf(vaultDB)
    expect(vaultDB.thingAt(TH.BoxScope)).to.eq(undefined)
    const [, onNotice] = inner.watch.mock.calls[0]!
    onNotice({ ...TH.itemEventOf(TH.boxThingOf()), read_tc: crypto.randomUUID() })
    expect(badNews.map((news) => news.refusalkind)).to.deep.equal(['bad_record'])
    expect(vaultDB.thingAt(TH.BoxScope)?.pickle()).to.deep.equal(Shell.inParentLivesOf(TH.boxThingOf()))
  })

  it("answers a Thing to its own subscriber as it is told of its first record", () => {
    const found: unknown[] = []
    const vaultDB: VaultMinder<TH.PlainThing> = VaultMinder.make(TH.ThingBank, {
      vaultDB: new MemoryVaultDB(),
      bank:   {
        makeThing: (shell) => {
          const thing = TH.makePlainThing(shell)
          thing.subscribe(() => { found.push(vaultDB.thingAt(shell)) })
          return thing
        },
      },
    })
    vaultDB.receive(rungOf(TH.boxThingOf()))
    expect(found).to.have.lengthOf(1)
    expect(found[0]).to.equal(vaultDB.thingAt(TH.BoxScope))
  })

  it("makes each Thing once, at the shell, at the first record it learns of at that labelpath", () => {
    const makeThing = vi.fn(TH.makePlainThing)
    const vaultDB = VaultMinder.make(TH.ThingBank, { vaultDB: new MemoryVaultDB(), bank: { makeThing } })
    heardOf(vaultDB)
    const soon = TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 2 }))
    vaultDB.receive(rungOf(soon))
    vaultDB.receive(rungOf(TH.boxThingOf('openai', { revseq: 2 })))
    vaultDB.receive(rungOf(TH.boxThingOf('openai', { revseq: 1 })))
    vaultDB.receive(rungOf(TH.boxThingOf('other')))
    expect(makeThing.mock.calls).to.deep.equal([[Shell.inParentLivesOf(soon)], [Shell.inParentLivesOf(TH.boxThingOf('other'))]])
    expect(vaultDB.thingAt(TH.BoxScope)).to.equal(makeThing.mock.results[0]!.value)
  })

  it("refuses a scope of another bank", () => {
    const { vaultDB } = sortedOverMemory()
    TH.expectSyncRefusal(() => vaultDB.thingAt({ ...TH.BoxScope, banklabel: 'other' }), 'bad_record')
    TH.expectSyncRefusal(() => vaultDB.thingAt({ ...TH.ThingBank } as never), 'bad_record')
  })
})

describe("VaultMinder's listeners, of bad news", () => {
  it("are told the scope of a record its Thing refuses, and null for what their hear throws", () => {
    const { vaultDB } = refusingOverQuietMemory()
    const told: [string, ThingScope | null][] = []
    vaultDB.listen({ hear: () => { throw new Error('host bug') }, onBadNews: (news, scope) => { told.push([news.refusalkind, scope]) } })
    vaultDB.receive(rungOf(Revs.three))
    expect(told).to.deep.equal([['unexpected_error', TH.BoxScope]])
    told.length = 0
    vaultDB.receive(rungOf(Revs.two))
    expect(told.every(([, scope]) => scope === null)).to.equal(true)
    expect(told.length).to.be.greaterThan(0)
  })
  it("are told once of a root its Thing refuses, carried in an answer's tracked", async () => {
    const { vaultDB, inner } = refusingOverQuietMemory()
    await inner.tryBirthBank(TH.birthBankAskOf())
    const gateTwo = TH.nextGateOf(TH.nextGateOf(TH.gateThingOf()))
    const gate    = TH.nextGateOf(gateTwo)
    cheatPlant(inner, gate)
    const told: [string, ThingScope | null][] = []
    vaultDB.listen({ hear: noop, onBadNews: (news, scope) => { told.push([news.refusalkind, scope]) } })
    await TH.expectGood(vaultDB.tryGetThing(TH.getAskAt('box', 'box')))
    expect(gate.revseq).to.eq(TH.RefusingThing.RefusedRevseq)
    expect(told).to.deep.equal([['unexpected_error', TH.GateScope]])
  })
  it("are told once of a root its Thing refuses, carried in a refused birth's dbhas and its tracked", async () => {
    const { vaultDB, inner } = refusingOverQuietMemory()
    const gateTwo  = TH.nextGateOf(TH.nextGateOf(TH.gateThingOf()))
    const gateGone = TH.gateTombOf(gateTwo)
    cheatPlant(inner, gateGone)
    const told: [string, ThingScope | null][] = []
    vaultDB.listen({ hear: noop, onBadNews: (news, scope) => { told.push([news.refusalkind, scope]) } })
    expect(await vaultDB.tryBirthBank(TH.birthBankAskOf())).to.deep.include({ ok: false, act: 'stale' })
    expect(gateGone.revseq).to.eq(TH.RefusingThing.RefusedRevseq)
    expect(told).to.deep.equal([['unexpected_error', TH.GateScope]])
  })
})

describe("VaultMinder, a bank labelled box", () => {
  it("keeps the car of the gate and the car of the root box apart, both at box", () => {
    const bank    = { ...TH.ThingBank, banklabel: 'box' }
    const vaultDB = VaultMinder.make(bank, { vaultDB: new MemoryVaultDB(), bank: TH.PlainCarBank }).connect()
    const gate    = TH.gateThingOf({ banklabel: 'box', labelpath: 'box', label: 'box' })
    const root    = TH.rootBoxOf({ banklabel: 'box' })
    vaultDB.receive(rungOf(gate))
    vaultDB.receive(rungOf(root))
    expect(vaultDB.thingAt({ ...bank, modelkind: 'gate', labelpath: 'box' })?.pickle()).to.deep.equal(gate)
    expect(vaultDB.thingAt({ ...bank, modelkind: 'box', labelpath: 'box' })?.pickle()).to.deep.equal(root)
    expect(vaultDB.carAt({ ...bank, modelkind: 'gate', labelpath: 'box' })).to.not.equal(vaultDB.carAt({ ...bank, modelkind: 'box', labelpath: 'box' }))
  })

  it("answers the gate's ask and the root box's ask from the table of each kind", async () => {
    const bank    = { ...TH.ThingBank, banklabel: 'box' }
    const inner   = new MemoryVaultDB()
    const vaultDB = VaultMinder.make(bank, { vaultDB: inner, bank: TH.PlainCarBank }).connect()
    const gate    = TH.gateThingOf({ banklabel: 'box', labelpath: 'box', label: 'box' })
    const root    = TH.rootBoxOf({ banklabel: 'box' })
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf({ ...bank, gate, root })))
    expect(await vaultDB.tryGetOnce({ ...bank, modelkind: 'gate', labelpath: 'box' })).to.deep.include({ ok: true, act: 'gotlive' })
    expect(await vaultDB.getOnce({ ...bank, modelkind: 'box', labelpath: 'box' })).to.deep.include({ modelkind: 'box', labelpath: 'box' })
    expect(await vaultDB.getOnce({ ...bank, modelkind: 'gate', labelpath: 'box' })).to.deep.include({ modelkind: 'gate', labelpath: 'box' })
  })
})

describe("VaultMinder.ensureRootCars()", () => {
  it("makes each root a vacant car whose Thing models the shell, where no record of it was received", () => {
    const { vaultDB } = sortedOverQuietMemory()
    expect(vaultDB.carAt(TH.GateScope)).to.equal(undefined)
    const { gate, root } = vaultDB.ensureRootCars()
    expect([gate.agekind, root.agekind]).to.deep.equal(['vacant', 'vacant'])
    expect(gate.thing.pickle()).to.deep.equal(TH.gateShellOf())
    expect(root.thing.pickle()).to.deep.include({ modelkind: 'box', labelpath: 'box', revseq: -1 })
  })

  it("answers the same cars again, and those a record was received at", async () => {
    const { vaultDB } = sortedOverQuietMemory()
    const made = vaultDB.ensureRootCars()
    await vaultDB.tryBirthBank(TH.birthBankAskOf())
    const { gate, root } = vaultDB.ensureRootCars()
    expect([gate, root]).to.deep.equal([made.gate, made.root])
    expect(gate).to.equal(vaultDB.carAt(TH.GateScope))
    expect(root.thing.pickle()).to.deep.include({ am: 'a', revseq: 0 })
  })
})

describe("VaultMinder.carAt(scoped)", () => {
  it("has the refusal its Thing last threw at a record, and when, and clears it at a record taken, keeping when", async () => {
    const { vaultDB, inner } = refusingOverQuietMemory()
    const { badNews } = heardOf(vaultDB)
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    const read_tc = readTcNow()
    vaultDB.receive(rungOf(Revs.two, read_tc))
    expect(carFieldsOf(vaultDB.carAt(TH.BoxScope)!)).to.deep.equal({ thing: vaultDB.thingAt(TH.BoxScope), lastErr: null, erred_at: null, read_tc })
    cheatPlant(inner, Revs.three)
    await TH.expectRefusal(vaultDB.getOnce(TH.BoxScope), 'unexpected_error')
    const refused = vaultDB.carAt(TH.BoxScope)!
    expect(refused.lastErr).to.equal(badNews[0])
    expect(isThingRefusal(badNews[0]!)).to.equal(true)
    expect(refused.erred_at).to.be.a('number')
    const erredAt = refused.erred_at
    vaultDB.receive(rungOf(Revs.two))
    expect(carFieldsOf(vaultDB.carAt(TH.BoxScope)!)).to.deep.equal({ thing: refused.thing, lastErr: null, erred_at: erredAt, read_tc })
  })

  it("has when its Thing's last news was read: the vacant read_tc before any, unchanged at a repeat in the same tcchunk, moved in a later one", () => {
    const { vaultDB } = refusingOverQuietMemory()
    const earlierAt = (Math.floor(Date.now() / 65_536) - 10) * 65_536
    const earlier   = uuidv7({ msecs: earlierAt })
    vaultDB.receive(rungOf(Revs.three, earlier))
    expect(vaultDB.carAt(TH.BoxScope)!.read_tc).to.eq(VacantReadTc)
    vaultDB.receive(rungOf(Revs.two, earlier))
    expect(vaultDB.carAt(TH.BoxScope)!.read_tc).to.eq(earlier)
    vaultDB.receive(rungOf(Revs.two, uuidv7({ msecs: earlierAt + 1 })))
    expect(vaultDB.carAt(TH.BoxScope)!.read_tc).to.eq(earlier)
    const later = readTcNow()
    vaultDB.receive(rungOf(Revs.two, later))
    expect(vaultDB.carAt(TH.BoxScope)!.read_tc).to.eq(later)
  })

  it("is the same object across a refusal and a record taken, which change what it has", () => {
    const { vaultDB } = refusingOverQuietMemory()
    heardOf(vaultDB)
    vaultDB.receive(rungOf(Revs.two))
    const car = vaultDB.carAt(TH.BoxScope)!
    vaultDB.receive(rungOf(Revs.three))
    expect(vaultDB.carAt(TH.BoxScope)).to.equal(car)
    expect(car.lastErr).to.not.be.null
    vaultDB.receive(rungOf(TH.nextOf(Revs.three)))
    expect(vaultDB.carAt(TH.BoxScope)).to.equal(car)
    expect(car.lastErr).to.be.null
  })

  it("answers undefined where no record is learned of, or the record's scope is refused before a Thing is made", () => {
    const { vaultDB } = refusingOverQuietMemory()
    TH.expectSyncRefusal(() => { vaultDB.receive(rungOf({ ...Revs.two, lifepath: 'not a lifepath' })) }, 'bad_record')
    expect(vaultDB.carAt(TH.BoxScope)).to.eq(undefined)
    TH.expectSyncRefusal(() => vaultDB.carAt({ ...TH.BoxScope, banklabel: 'other' }), 'bad_record')
  })
})

describe("VaultMinder.listen(listener)", () => {
  it("tells every listener every event, in one order, each the same frozen event", async () => {
    const { vaultDB } = sortedOverMemory()
    const listeners = [heardOf(vaultDB), heardOf(vaultDB)]
    await vaultDB.tryBirthBank(TH.birthBankAskOf())
    expect(listeners[0]!.events).to.have.lengthOf(4)
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
    expect(thrown).to.have.lengthOf(4)
    expect(other.events).to.have.lengthOf(4)
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
    expect(shorthandsOf(heard)).to.deep.equal([['item', Gatepath, 'full'], ['item', Gatepath, 'full'], ['life', Gatepath, 'born'], ['life', Gatepath, 'born']])
    endFirst()
    vaultDB.receive(rungOf(TH.nextGateOf(gate)))
    expect(heard).to.have.lengthOf(5)
  })
})

describe("VaultMinder's asks: makeGetAsk, makeListAsk, makePutAsk and makeDelAsk", () => {
  it("fill in the bank's scope, the modelkind and the default flags, and carry the void banktok and track each root at the void revision before the bank is heard of", () => {
    const { vaultDB } = sortedOverMemory()
    const unknown = { track: VoidTrack, banktok: SX.VoidLifeTok }
    expect(vaultDB.makeGetAsk({ modelkind: 'box', labelpath: 'box/openai' })).to.deep.equal({ ...TH.ThingBank, labelpath: 'box/openai', op: 'get', modelkind: 'box', ifAbsent: 'nil', ...unknown })
    expect(vaultDB.makeListAsk({ modelkind: 'box', labelpath: 'box' })).to.deep.equal({ ...TH.ThingBank, labelpath: 'box', op: 'list', modelkind: 'box', ...unknown })
    const box = TH.boxThingOf()
    expect(vaultDB.makePutAsk({ cited: Shell.childCited(TH.Life0), record: box })).to.deep.include(unknown)
  })

  it("carry the bank's banktok, and track the revision each root's Thing has once both are cached", async () => {
    const { vaultDB } = sortedOverMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    const known = { track: TH.trackOf(), banktok: TH.gateThingOf().banktok }
    expect(vaultDB.makeGetAsk({ modelkind: 'box', labelpath: 'box/openai' })).to.deep.equal({ ...TH.ThingBank, labelpath: 'box/openai', op: 'get', modelkind: 'box', ifAbsent: 'nil', ...known })
    expect(vaultDB.makeListAsk({ modelkind: 'box', labelpath: 'box' })).to.deep.include(known)
    const next = TH.nextGateOf(TH.gateThingOf())
    expect(vaultDB.makePutAsk({ cited: TH.gateThingOf(), record: next })).to.deep.include({ ...TH.GateScope, op: 'put', modelkind: 'gate', ifAbsent: 'add', ifPresent: 'repl', ...known })
    const box = TH.boxThingOf()
    expect(vaultDB.makeDelAsk({ cited: box, record: TH.boxTombOf(box) })).to.deep.include({ ...TH.ThingBank, op: 'del', modelkind: 'box', ifAbsent: 'fail', ...known })
  })

  it("track each root at the void revision while its Thing is not cached, or has only its shell, so a get's answer sends each actual root whole", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await TH.expectGood(inner.tryBirthBank(TH.birthBankAskOf()))
    expect(vaultDB.makeGetAsk({ modelkind: 'box', labelpath: 'box/openai' }).track).to.deep.equal(VoidTrack)
    const soon = TH.boxSparseOf(TH.rootBoxOf({ revseq: 3 }))
    vaultDB.receive(rungOf(soon))
    expect(vaultDB.thingAt(TH.RootScope)?.pickle()).to.deep.equal(Shell.of(TH.RootScope))
    expect(vaultDB.makeGetAsk({ modelkind: 'box', labelpath: 'box/openai' }).track).to.deep.equal(VoidTrack)
    const answer = await vaultDB.tryGetThing(vaultDB.makeGetAsk({ modelkind: 'gate', labelpath: Gatepath }))
    expect(answer).to.deep.include({ ok: true, tracked: { gate: TH.gateThingOf(), root: TH.rootBoxOf() } })
    expect(vaultDB.makeGetAsk({ modelkind: 'box', labelpath: 'box/openai' })).to.deep.include({ banktok: TH.gateThingOf().banktok, track: TH.trackOf() })
  })

  it("track a root known newer only sparse at the whole record its Thing has, so the answer sends the newer whole", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    const root1 = TH.nextOf(TH.rootBoxOf())
    cheatPlant(inner, root1)
    vaultDB.receive(rungOf(TH.boxSparseOf(root1)))
    expect(vaultDB.makeGetAsk({ modelkind: 'gate', labelpath: Gatepath }).track.root).to.deep.equal({ revseq: 0, lifepath: TH.Life0 })
    const answer = await vaultDB.tryGetThing(vaultDB.makeGetAsk({ modelkind: 'gate', labelpath: Gatepath }))
    expect(answer).to.deep.include({ ok: true, tracked: { gate: 'same', root: root1 } })
    expect(vaultDB.thingAt(TH.RootScope)?.pickle()).to.deep.equal(root1)
  })

  it("carry the banktok of the gate's tombstone, the bank's end, which keeps it, and track it", async () => {
    const { vaultDB } = sortedOverMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    const tomb = TH.gateTombOf(TH.gateThingOf())
    vaultDB.receive(rungOf(tomb))
    const ask = vaultDB.makeGetAsk({ modelkind: 'box', labelpath: 'box' })
    expect(ask).to.deep.include({ banktok: TH.FirstBanktok })
    expect(ask.track.gate).to.deep.equal({ revseq: 1, lifepath: tomb.lifepath })
  })

  it("carry the bank's banktok to the answer's ask, which a vaultDB neither compares with the actual bank nor refuses on", async () => {
    const { vaultDB, inner } = sortedOverMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    const answer = await inner.tryGetThing(vaultDB.makeGetAsk({ modelkind: 'gate', labelpath: Gatepath }))
    expect(answer).to.deep.include({ ok: true, act: 'gotlive' })
    expect(answer.ask).to.deep.include({ banktok: TH.gateThingOf().banktok })
    const elsewise = await inner.tryGetThing({ ...vaultDB.makeGetAsk({ modelkind: 'gate', labelpath: Gatepath }), banktok: TH.OtherBanktok })
    expect(elsewise).to.deep.include({ ok: true, act: 'gotlive' })
  })

  it("track the gate a watch notified it of, written elsewhere", async () => {
    const { vaultDB, inner } = sortedOverMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    const next = TH.nextGateOf(TH.gateThingOf())
    const ask  = TH.replaceAskOf(TH.gateThingOf(), next)
    await TH.expectGood(inner.tryWriteThing(ask))
    expect(vaultDB.makeGetAsk({ modelkind: 'gate', labelpath: Gatepath }).track.gate).to.deep.equal({ revseq: 1, lifepath: next.lifepath })
  })
})

describe("VaultMinder.tryGetOnce(scoped) and getOnce(scoped)", () => {
  it("resolve the record the Thing at the scope has, its events told before it resolves, with the bank's own get ask", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    const box = TH.boxThingOf()
    cheatPlant(inner, box)
    const asked = vi.spyOn(inner, 'tryGetThing')
    const { events } = heardOf(vaultDB)
    const ask   = vaultDB.makeGetAsk({ modelkind: 'box', labelpath: 'box/openai', ifAbsent: 'nil' })
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

  it("resolve the record the Thing has for an answer older than a whole record it knows", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    cheatPlant(inner, TH.boxThingOf())
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
    cheatPlant(inner, box)
    const reborn = TH.boxRebornOf(TH.boxTombOf(box))
    vaultDB.receive(rungOf(TH.boxSparseOf(reborn)))
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

  it("throw the refusal a cached Thing throws at a newer record, which keeps its older record, and its try form answers it", async () => {
    const { vaultDB, inner } = refusingOverQuietMemory()
    const { badNews } = heardOf(vaultDB)
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    cheatPlant(inner, Revs.two)
    expect(await vaultDB.getOnce(TH.BoxScope)).to.deep.equal(Revs.two)
    cheatPlant(inner, Revs.three)
    const err = await TH.expectRefusal(vaultDB.getOnce(TH.BoxScope), 'unexpected_error')
    expect(isThingRefusal(err)).to.equal(true)
    expect(vaultDB.thingAt(TH.BoxScope)?.pickle()).to.deep.equal(Revs.two)
    const answer = await vaultDB.tryGetOnce(TH.BoxScope)
    expect(answer).to.deep.include({ ok: false, act: 'unclassified_storing', dbhas: Revs.three, err: badNews[1] })
    expect(badNews).to.deep.equal([err, badNews[1]])
  })

  it("throw the refusal thrown at a first record, its car staying with the Thing at the shell", async () => {
    const { vaultDB, inner } = refusingOverQuietMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    cheatPlant(inner, Revs.three)
    const err = await TH.expectRefusal(vaultDB.getOnce(TH.BoxScope), 'unexpected_error')
    const car = vaultDB.carAt(TH.BoxScope)!
    expect(car.thing.pickle()).to.deep.equal(Shell.inParentLivesOf(Revs.three))
    expect(car.lastErr).to.equal(err)
  })

  it("resolve a later answer its Thing takes as a repeat, clearing the refusal", async () => {
    const { vaultDB, inner } = refusingOverQuietMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    cheatPlant(inner, Revs.two)
    await vaultDB.getOnce(TH.BoxScope)
    cheatPlant(inner, Revs.three)
    await TH.expectRefusal(vaultDB.getOnce(TH.BoxScope), 'unexpected_error')
    cheatPlant(inner, Revs.two)
    expect(await vaultDB.getOnce(TH.BoxScope)).to.deep.equal(Revs.two)
    expect(vaultDB.carAt(TH.BoxScope)?.lastErr).to.be.null
  })

  it("resolve a box whose answer carries a root its Thing refuses, telling onBadNews of the root", async () => {
    const { vaultDB, inner } = refusingOverQuietMemory()
    const { badNews } = heardOf(vaultDB)
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    cheatPlant(inner, Revs.two)
    cheatPlant(inner, TH.gateThingOf({ revseq: TH.RefusingThing.RefusedRevseq, revtok: TH.revtokOf('three') }))
    expect(await vaultDB.getOnce(TH.BoxScope)).to.deep.equal(Revs.two)
    expect(badNews.length > 0 && badNews.every((news) => isThingRefusal(news))).to.equal(true)
    expect(vaultDB.carAt(TH.GateScope)?.lastErr).to.equal(badNews.at(-1))
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

describe("VaultMinder.tryListOnce(scoped) and listOnce(scoped)", () => {
  it("resolve the listing once the parent and each child are told, with the bank's own list ask", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    cheatPlant(inner, TH.boxThingOf())
    const listed = vi.spyOn(inner, 'tryListThings')
    const ask  = vaultDB.makeListAsk({ modelkind: 'box', labelpath: 'box' })
    const kids = await vaultDB.listOnce(TH.RootScope)
    expect(Object.keys(kids.items)).to.deep.equal(['openai'])
    expect(vaultDB.carAt(TH.BoxScope)?.citable).to.deep.equal(TH.boxSparseOf(TH.boxThingOf()))
    expect(listed.mock.calls).to.deep.equal([[ask]])
  })

  it("refuse a parent never stored, and one deleted, telling its tombstone", async () => {
    const { vaultDB } = sortedOverMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    await TH.expectRefusal(vaultDB.listOnce({ ...TH.RootScope, labelpath: 'box/nope' }), 'absent_thing')
    const box = await vaultDB.putOnce({ cited: Shell.childCited(TH.Life0), record: TH.boxThingOf() })
    const tomb = await vaultDB.delOnce({ record: TH.boxTombOf(box) })
    expect(await vaultDB.tryListOnce(box)).to.deep.include({ ok: false, act: 'gone', dbhas: tomb })
    expect(vaultDB.thingAt(box)?.pickle()).to.deep.equal(tomb)
  })

  it("tell each listener's onBadNews of an incompatible child, and list the rest", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    cheatPlant(inner, TH.boxThingOf())
    inner._cheat_things(TH.ThingBank).box.set('box/bad', { ...TH.boxThingOf('bad'), revseq: -2 })
    const { badNews } = heardOf(vaultDB)
    const answer = await vaultDB.tryListOnce(TH.RootScope)
    expect(answer).to.deep.include({ ok: true })
    expect(badNews.map((news) => [news.refusalkind, news.meta?.labelpaths])).to.deep.equal([['incompatible_row', ['box/bad']]])
  })

  it("answer, or throw, the vaultDB's refusal", async () => {
    const { vaultDB } = sortedOverMemory()
    await TH.expectBad(vaultDB.tryListOnce({ ...TH.RootScope, labelpath: 'Box' }), 'bad_record')
    await TH.expectRefusal(vaultDB.listOnce({ ...TH.RootScope, labelpath: 'Box' }), 'bad_record')
  })
})

describe("VaultMinder's writes: tryPutOnce, putOnce, tryDelOnce and delOnce", () => {
  it("put over the citable of the Thing at the record's labelpath, resolving the actual record, which the Thing has", async () => {
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
    cheatPlant(inner, box1)
    vaultDB.receive(rungOf(TH.boxSparseOf(box1)))
    expect(vaultDB.carAt(TH.BoxScope)?.agekind).to.eq('cold')
    const box2 = TH.nextOf(box1)
    const asked = vi.spyOn(inner, 'tryWriteThing')
    expect(await vaultDB.putOnce({ record: box2 })).to.deep.equal(box2)
    expect(asked.mock.calls[0]![0].cited).to.deep.equal(TH.boxSparseOf(box1))
  })

  it("throw a stale write's refusal once the actual record is told, and its try form answers it", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    const root1 = TH.nextOf(TH.rootBoxOf())
    cheatPlant(inner, root1)
    const mine = TH.nextOf(TH.rootBoxOf(), { revtok: TH.revtokOf('mine') })
    const err  = await TH.expectRefusal(vaultDB.putOnce({ record: mine }))
    expect(err.refusalkind).to.eq('stale_write')
    expect(vaultDB.thingAt(TH.RootScope)?.pickle()).to.deep.equal(root1)
    expect(await vaultDB.tryPutOnce({ record: TH.nextOf(root1) })).to.deep.include({ ok: true })
  })

  it("cite the void revision where no Thing is cached at the labelpath and no cited is given", async () => {
    const { vaultDB, inner } = sortedOverMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    const asked = vi.spyOn(inner, 'tryWriteThing')
    expect(await vaultDB.tryPutOnce({ record: TH.boxThingOf() })).to.deep.include({ ok: true, act: 'born' })
    expect(asked.mock.calls[0]![0].cited).to.deep.equal(Shell.childCited(TH.Life0))
    const planted = TH.boxThingOf('anthropic')
    cheatPlant(inner, planted)
    const record = { ...planted, revtok: TH.revtokOf('other') }
    expect(await vaultDB.tryPutOnce({ record })).to.deep.include({ ok: false, act: 'stale', dbhas: planted })
  })

  it("refuse a record past its first revision where no Thing is cached and no cited is given, which the void revision cannot precede", async () => {
    const { vaultDB } = sortedOverMemory()
    const record = TH.nextOf(TH.gateThingOf())
    await TH.expectBad(vaultDB.tryPutOnce({ record }), 'bad_record')
  })

  it("answer a refusal for a record of another bank, asking the vaultDB nothing", async () => {
    const { vaultDB, inner } = sortedOverMemory()
    const asked = vi.spyOn(inner, 'tryWriteThing')
    await TH.expectBad(vaultDB.tryPutOnce({ record: TH.boxThingOf('openai', { banklabel: 'other' }) }), 'bad_record')
    await TH.expectBad(vaultDB.tryDelOnce(null as never), 'unexpected_error')
    expect(asked).not.toHaveBeenCalled()
  })

  it("throw the refusal its Thing throws at the record written, which keeps its older record, and the try forms answer it", async () => {
    for (const record of [Revs.three, TH.boxTombOf(Revs.two)]) {
      const { vaultDB } = refusingOverQuietMemory()
      await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
      const one = await vaultDB.putOnce({ record: TH.boxThingOf(), cited: Shell.childCited(TH.Life0) })
      await vaultDB.putOnce({ record: TH.nextOf(one) })
      await vaultDB.putOnce({ record: Revs.two })
      const answer = (record.am === 'a') ? await vaultDB.tryPutOnce({ record }) : await vaultDB.tryDelOnce({ record })
      expect(answer).to.deep.include({ ok: false, act: 'unclassified_storing', dbhas: record })
      expect(isThingRefusal((answer as { err: Errors.VaultError }).err)).to.equal(true)
      expect(vaultDB.thingAt(TH.BoxScope)?.pickle()).to.deep.equal(Revs.two)
      await TH.expectRefusal((record.am === 'a') ? vaultDB.putOnce({ record, cited: Revs.two }) : vaultDB.delOnce({ record, cited: Revs.two }), 'unexpected_error')
    }
  })

  it("delete over the citable of the Thing, resolving the actual tombstone, which the Thing has", async () => {
    const { vaultDB } = sortedOverMemory()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    const box = await vaultDB.putOnce({ record: TH.boxThingOf(), cited: Shell.childCited(TH.Life0) })
    const tomb = TH.boxTombOf(box)
    expect(await vaultDB.delOnce({ record: tomb })).to.deep.equal(tomb)
    expect(vaultDB.thingAt(TH.BoxScope)?.pickle()).to.deep.equal(tomb)
    expect(await vaultDB.tryDelOnce({ record: tomb })).to.deep.include({ ok: false })
  })
})
