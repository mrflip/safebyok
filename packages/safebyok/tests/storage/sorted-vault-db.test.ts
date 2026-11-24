import { noop } from 'es-toolkit'
import { describe, expect, it, vi } from 'vitest'
import type { Errors } from 'safebyok-big/internals'
import { Thing } from '../../src/models/thing'
import { type ThingRecord, Shell } from '../../src/shapes/shapes-thing'
import type { SeenThing, VaultEvent, VaultItemEvent } from '../../src/shapes/shapes-vault-event'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import { SortedVaultDB } from '../../src/storage/sorted-vault-db'
import { readTcNow } from '../../src/storage/thing-classifier'
import type { ReadTc, VaultDB } from '../../src/storage/vault-db'
import * as TH from '../test-helpers'

/** The store in memory each SortedVaultDB the battery makes stands over. */
const InnerOf = new WeakMap<SortedVaultDB, MemoryVaultDB>()

TH.describeVaultDBBattery('SortedVaultDB over a MemoryVaultDB', {
  makeVaultDB: () => {
    const inner = new MemoryVaultDB()
    const vaultDB = SortedVaultDB.make(TH.ThingBank, { vaultDB: inner })
    InnerOf.set(vaultDB, inner)
    return vaultDB
  },
  _cheat_rowsOf: (vaultDB) => {
    const inner = InnerOf.get(vaultDB)!
    return {
      plant:  (scope, raw) => { inner._cheat_things(scope).set(scope.labelpath, structuredClone(raw)) },
      remove: (scope) => { inner._cheat_things(scope).delete(scope.labelpath) },
    }
  },  // Its notices are sorted: their cases are below.
  watches: false,
})

/** An answer of no bank, named for the verb that answers it. */
function stubAnswerOf(verbname: string): never { return { ask: {}, verbname } as never }

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

/** A SortedVaultDB over a MemoryVaultDB, and that MemoryVaultDB, to write beside it. */
function sortedOverMemory(): { vaultDB: SortedVaultDB, inner: MemoryVaultDB } {
  const inner = new MemoryVaultDB()
  return { vaultDB: SortedVaultDB.make(TH.ThingBank, { vaultDB: inner }), inner }
}

/** A SortedVaultDB over a MemoryVaultDB whose own watch notifies nothing, so that every notice is of an answer's records. */
function sortedOverQuietMemory(): { vaultDB: SortedVaultDB, inner: MemoryVaultDB } {
  const inner = new MemoryVaultDB()
  vi.spyOn(inner, 'watch').mockReturnValue(noop)
  return { vaultDB: SortedVaultDB.make(TH.ThingBank, { vaultDB: inner }), inner }
}

/** The item notice a device database might ring for `record`, from `'other_tab'` at `read_tc`. */
function rungOf(record: SeenThing, read_tc: ReadTc = readTcNow()): VaultItemEvent {
  return { ...TH.itemEventOf(record), sourcelabel: 'other_tab', read_tc }
}

/** Store `record` in `inner` past its verbs. */
function cheatStored(inner: MemoryVaultDB, record: ThingRecord): void { inner._cheat_things(record).set(record.labelpath, structuredClone(record)) }

/** A watch of the test bank over `vaultDB`: the notices it gets, the bad news, and its stop. */
function noticesOf(vaultDB: VaultDB): { events: VaultEvent[], badNews: Errors.VaultError[], stop: () => void } {
  const events: VaultEvent[] = []
  const badNews: Errors.VaultError[] = []
  const stop = vaultDB.watch(TH.ThingBank, (event) => { events.push(event) }, (news) => { badNews.push(news) })
  return { events, badNews, stop }
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

describe("SortedVaultDB, what only a wrapper can show", () => {
  it("hands each verb's ask to the vaultDB it wraps, and answers that vaultDB's own answer", async () => {
    const inner = stubVaultDBOf(() => undefined)
    const vaultDB = SortedVaultDB.make(TH.ThingBank, { vaultDB: inner })
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

  it("watches its bank in the vaultDB it wraps once, from when it is made, whoever watches it, asking nothing", () => {
    const stop = vi.fn()
    const inner = stubVaultDBOf(stop)
    const vaultDB = SortedVaultDB.make(TH.ThingBank, { vaultDB: inner })
    expect(inner.watch.mock.calls.map(([scope]) => scope)).to.deep.equal([TH.ThingBank])
    const stops = [noticesOf(vaultDB).stop, noticesOf(vaultDB).stop]
    for (const unwatch of stops) { unwatch() }
    noticesOf(vaultDB)
    expect([inner.watch.mock.calls.length, stop.mock.calls.length]).to.deep.equal([1, 0])
    expect([inner.tryGetThing, inner.tryWriteThing, inner.tryListThings, inner.tryBirthBank].every((verb) => verb.mock.calls.length === 0)).to.equal(true)
  })

  it("stops its watch of the vaultDB it wraps at its sweep, and still notifies an answer's records", async () => {
    const { vaultDB, inner } = sortedOverMemory()
    const { events } = noticesOf(vaultDB)
    expect(vaultDB.sweep().sweep()).to.equal(vaultDB)
    await inner.tryBirthBank(TH.birthBankAskOf())
    await TH.aWhile()
    expect(events).to.deep.equal([])
    await vaultDB.tryGetThing(TH.getGateAskOf())
    expect(shorthandsOf(events)).to.deep.equal([...firstSeen('bank'), ...firstSeen('gate')])
  })

  it("calls the wrapped watch's stop once, however often swept", () => {
    const stop = vi.fn()
    const vaultDB = SortedVaultDB.make(TH.ThingBank, { vaultDB: stubVaultDBOf(stop) })
    vaultDB.sweep()
    vaultDB.sweep()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  const BadArgs = [
    [TH.ThingBank,                        undefined,                          'no options'],
    [TH.ThingBank,                        {},                                 'no vaultDB'],
    [TH.ThingBank,                        { vaultDB: { tryGetThing: noop } }, 'a vaultDB missing a verb'],
    [undefined,                           { vaultDB: new MemoryVaultDB() },   'no scope'],
    [{ userid: TH.ThingBank.userid },     { vaultDB: new MemoryVaultDB() },   'a scope with no banklabel'],
  ] as const

  for (const [scope, opts, blurb] of BadArgs) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => SortedVaultDB.make(scope as never, opts as never), 'bad_record')
    })
  }

  it("refuses a watch of a bank other than its own, or one with no onBadNews", () => {
    const { vaultDB } = sortedOverMemory()
    noticesOf(vaultDB)
    TH.expectSyncRefusal(() => vaultDB.watch({ ...TH.ThingBank, banklabel: 'other' }, noop, noop))
    TH.expectSyncRefusal(() => vaultDB.watch(TH.ThingBank, noop, undefined as never), 'bad_record')
  })
})

describe("SortedVaultDB's watch, of what an answer carries", () => {
  it("notifies of a refused write's bank, main gate and root box, out to in, before the write answers, and of its dbhas seen once", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await inner.tryBirthBank(TH.birthBankAskOf())
    const { events, badNews } = noticesOf(vaultDB)
    const track = { bank: TH.BankStaleTrack.bank, gate: TH.GateStaleTrack.gate, box: TH.RootStaleTrack.box }
    const answer = await vaultDB.tryWriteThing({ ...TH.birthAskOf(TH.gateThingOf({ revtok: TH.OtherRevtok })), track })
    expect(answer).to.deep.include({ ok: false, dbhas: TH.gateThingOf() })
    expect(shorthandsOf(events)).to.deep.equal([...firstSeen('bank'), ...firstSeen('gate'), ...firstSeen('box')])
    expect(badNews).to.deep.equal([])
  })

  it("notifies of a listing's parent, then each Thing listed, sparse and in labelpath order, after the bank and main gate", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await inner.tryBirthBank(TH.birthBankAskOf())
    for (const label of ['openai', 'anthropic']) { await inner.tryWriteThing(TH.birthAskOf(TH.boxThingOf(label), Shell.childCited(TH.Life0))) }
    const { events } = noticesOf(vaultDB)
    await vaultDB.tryListThings(TH.listAskAt('box'))
    expect(shorthandsOf(events)).to.deep.equal([
      ...firstSeen('bank'), ...firstSeen('gate'), ...firstSeenSparse('box'), ...firstSeenSparse('box/anthropic'), ...firstSeenSparse('box/openai'),
    ])
    expect(events.filter((event) => event.eventkind === 'item').map((event) => event.val)).to.deep.equal(
      [TH.bankThingOf(), TH.gateThingOf(), ...[TH.rootBoxOf(), TH.boxThingOf('anthropic'), TH.boxThingOf('openai')].map((thing) => Thing.sparseOf(thing))],
    )
  })

  it("notifies of a birth's roots, each write's record, and a get's record, the answers' own objects", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    const { events } = noticesOf(vaultDB)
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

  it("notifies of nothing for a repeat or an older record", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await inner.tryBirthBank(TH.birthBankAskOf())
    const { events } = noticesOf(vaultDB)
    await vaultDB.tryGetThing(TH.getGateAskOf())
    expect(shorthandsOf(events)).to.deep.equal([...firstSeen('bank'), ...firstSeen('gate')])
    await vaultDB.tryGetThing(TH.getGateAskOf())
    const next = TH.nextGateOf(TH.gateThingOf())
    await vaultDB.tryWriteThing(TH.replaceAskOf(TH.gateThingOf(), next))
    const gate = TH.gateThingOf()
    vaultDB.bell(rungOf(gate))
    vaultDB.bell(rungOf(Thing.sparseOf(gate)))
    await TH.aWhile()
    expect(shorthandsOf(events.slice(4))).to.deep.equal([['item', 'gate', 'full']])
  })

  it("notifies of the newest revision seen again in a later span of time, and of nothing for it again in that span", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await inner.tryBirthBank(TH.birthBankAskOf())
    const { events } = noticesOf(vaultDB)
    const read_tc  = readTcNow()
    const nextTime = Number.parseInt(read_tc.slice(0, 8), 16) + 1
    const later    = `${nextTime.toString(16).padStart(8, '0')}${read_tc.slice(8)}`
    const gate     = TH.gateThingOf()
    vaultDB.bell(rungOf(gate, read_tc))
    vaultDB.bell(rungOf(gate, later))
    vaultDB.bell(rungOf(Thing.sparseOf(gate), later))
    expect(shorthandsOf(events)).to.deep.equal([...firstSeen('gate'), ['item', 'gate', 'full']])
    expect(events[2]).to.deep.include({ read_tc: later })
  })

  it("notifies of a whole record seen sparse first, and of a newer sparse one as aged", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await inner.tryBirthBank(TH.birthBankAskOf())
    const { events } = noticesOf(vaultDB)
    const root = TH.rootBoxOf()
    const rootNext = TH.nextOf(root)
    vaultDB.bell(rungOf(Thing.sparseOf(root)))
    await vaultDB.tryGetThing(TH.getAskAt('box'))
    vaultDB.bell(rungOf(Thing.sparseOf(rootNext)))
    expect(shorthandsOf(events)).to.deep.equal([
      ...firstSeenSparse('box'), ...firstSeen('bank'), ...firstSeen('gate'), ['item', 'box', 'full'], ['item', 'box', 'soon'], ['aged', 'box', 'cold'],
    ])
  })

  it("notifies of the void sentinel a get's answer carries, under its parent's life as the step read it", async () => {
    const { vaultDB } = sortedOverMemory()
    const { events } = noticesOf(vaultDB)
    await vaultDB.tryBirthBank(TH.birthBankAskOf())
    const answer = await vaultDB.tryGetThing(TH.getAskAt('box/openai'))
    expect(answer).to.deep.include({ act: 'gotvoid' })
    expect(shorthandsOf(events.slice(6))).to.deep.equal([['item', 'box/openai', 'void'], ['life', 'box/openai', 'died']])
    const voided = events.find((event) => event.labelpath === 'box/openai')
    const lifepath = `${TH.rootBoxOf().lifepath}/${Shell.VoidLifeseq}`
    expect(voided).to.deep.include({ val: answer.ok && answer.act === 'gotvoid' && answer.dbhas, agerank: `${lifepath}|-000000001|-000000001|${answer.read_tc.slice(0, 8)}` })
    expect(voided).to.deep.include({ val: Shell.of({ ...TH.BoxScope, lifepath }) })
  })

  it("notifies of the void sentinel a get's answer carries under a parent it has not seen, and under one not stored", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await inner.tryBirthBank(TH.birthBankAskOf())
    const { events } = noticesOf(vaultDB)
    expect(await vaultDB.tryGetThing(TH.getAskAt('box/openai'))).to.deep.include({ act: 'gotvoid' })
    expect(shorthandsOf(events)).to.deep.equal([...firstSeen('bank'), ...firstSeen('gate'), ['item', 'box/openai', 'void'], ['life', 'box/openai', 'died']])
    const unborn = sortedOverMemory()
    const unbornEvents = noticesOf(unborn.vaultDB).events
    await unborn.vaultDB.tryGetThing(TH.getAskAt('box/openai'))
    expect(unbornEvents[0]).to.deep.include({ val: Shell.of({ ...TH.BoxScope, lifepath: `${Shell.VoidLifeseq}/${Shell.VoidLifeseq}` }) })
  })

  it("notifies of the shell a write refused over nothing stored carries", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await inner.tryBirthBank(TH.birthBankAskOf())
    const { events } = noticesOf(vaultDB)
    const answer = await vaultDB.tryWriteThing({ ...TH.birthAskOf(TH.boxThingOf(), Shell.childCited(TH.Life0)), ifAbsent: 'fail' })
    expect(answer).to.deep.include({ ok: false, act: 'void' })
    expect(shorthandsOf(events)).to.deep.equal([...firstSeen('bank'), ...firstSeen('gate'), ['item', 'box/openai', 'void'], ['life', 'box/openai', 'died']])
    expect(events[4]).to.deep.include({ val: Shell.of({ ...TH.BoxScope, lifepath: `${TH.Life0}/${Shell.VoidLifeseq}` }) })
  })

  it("notifies of the void at a root as the root's own shell", async () => {
    const { vaultDB } = sortedOverMemory()
    const { events } = noticesOf(vaultDB)
    const answer = await vaultDB.tryGetThing(TH.getGateAskOf())
    expect(answer).to.deep.include({ act: 'gotvoid' })
    expect(shorthandsOf(events)).to.deep.equal([['item', 'gate', 'void'], ['life', 'gate', 'died']])
    expect(events[0]).to.deep.include({ agerank: `${Shell.VoidLifeseq}|-000000001|-000000001|${answer.read_tc.slice(0, 8)}` })
  })

  it("sorts an answer's records while no one watches it, so that they reach no one, then or later", async () => {
    const { vaultDB } = sortedOverMemory()
    await vaultDB.tryBirthBank(TH.birthBankAskOf())
    vaultDB.bell(rungOf(TH.boxThingOf()))
    const { events } = noticesOf(vaultDB)
    await TH.aWhile()
    await vaultDB.tryGetThing(TH.getGateAskOf())
    vaultDB.bell(rungOf(TH.boxThingOf()))
    expect(events).to.deep.equal([])
  })

  it("notifies of nothing from an answer of another bank", async () => {
    const { vaultDB } = sortedOverMemory()
    const { events, badNews } = noticesOf(vaultDB)
    expect(await vaultDB.tryGetThing({ ...TH.getGateAskOf(), banklabel: 'other' })).to.deep.include({ act: 'gotvoid' })
    await TH.aWhile()
    expect([...events, ...badNews]).to.deep.equal([])
  })

  it("sends every watcher's onBadNews a record of an answer the sorter refuses, and answers unchanged", async () => {
    const theirs = { ok: true, act: 'born', ask: TH.ThingBank, world: null, read_tc: readTcNow(), val: TH.gateThingOf({ lifepath: 'not a lifepath' }) }
    const inner  = { ...stubVaultDBOf(noop), tryWriteThing: vi.fn<VaultDB['tryWriteThing']>(() => Promise.resolve(theirs as never)) }
    const vaultDB = SortedVaultDB.make(TH.ThingBank, { vaultDB: inner })
    const watches = [noticesOf(vaultDB), noticesOf(vaultDB)]
    expect(await vaultDB.tryWriteThing(TH.birthAskOf())).to.equal(theirs)
    for (const { events, badNews } of watches) {
      expect(events).to.deep.equal([])
      expect(badNews.map((news) => news.refusalkind)).to.deep.equal(['bad_record'])
    }
  })
})

describe("SortedVaultDB's watch, where each notice came from and when it was read", () => {
  it("stamps every notice of an answer with the wrapped vaultDB as its source and the answer's own read_tc", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await inner.tryBirthBank(TH.birthBankAskOf())
    const { events } = noticesOf(vaultDB)
    const track = { bank: TH.BankStaleTrack.bank, gate: TH.GateStaleTrack.gate, box: TH.RootStaleTrack.box }
    const answer = await vaultDB.tryGetThing({ ...TH.getGateAskOf(), track })
    expect(events).to.have.lengthOf(6)
    for (const event of events) { expect(event).to.deep.include({ sourcelabel: SortedVaultDB.VaultDBSourcelabel, read_tc: answer.read_tc, bank_lifetok: TH.bankThingOf().lifetok }) }
    expect(SortedVaultDB.VaultDBSourcelabel).to.eq('vault_db')
  })

  it("stamps an answer's notices with its ask's bank_lifetok, else its world's, and a ring's with its own, else the newest world's", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    const { events } = noticesOf(vaultDB)
    const { lifetok } = TH.bankThingOf()
    const [askLifetok, rungLifetok] = [crypto.randomUUID(), crypto.randomUUID()]
    vaultDB.bell(rungOf(TH.boxThingOf('mistral')))
    await vaultDB.tryBirthBank(TH.birthBankAskOf())
    await inner.tryWriteThing(TH.birthAskOf(TH.boxThingOf(), Shell.childCited(TH.Life0)))
    await vaultDB.tryGetThing({ ...TH.getAskAt('box/openai'), bank_lifetok: askLifetok })
    vaultDB.bell(rungOf(TH.boxThingOf('anthropic')))
    vaultDB.bell({ ...rungOf(TH.boxThingOf('cohere')), bank_lifetok: rungLifetok })
    // Each box first seen gives two notices, an item and a life; the birth, six.
    expect(events.map((event) => event.bank_lifetok)).to.deep.equal([
      undefined, undefined, ...Array.from({ length: 6 }, () => lifetok), askLifetok, askLifetok, lifetok, lifetok, rungLifetok, rungLifetok,
    ])
  })

  it("notifies of a Thing the wrapped vaultDB's watch reports, at the read_tc of its notice", async () => {
    const { vaultDB, inner } = sortedOverMemory()
    await vaultDB.tryBirthBank(TH.birthBankAskOf())
    const { events } = noticesOf(vaultDB)
    const box = TH.boxThingOf()
    const answer = await inner.tryWriteThing(TH.birthAskOf(box, Shell.childCited(TH.Life0)))
    await TH.eventually(() => events.length === 2)
    expect(shorthandsOf(events)).to.deep.equal(firstSeen('box/openai'))
    expect(events[0]).to.deep.include({ sourcelabel: 'vault_db', val: box })
    expect(events[0]!.read_tc).to.match(TH.ReadTcPattern).and.not.eq(answer.read_tc)
    expect(events[1]!.read_tc).to.eq(events[0]!.read_tc)
  })
})

describe("SortedVaultDB.bell(event)", () => {
  it("notifies of the record of an item notice rung, sorted with an answer's, at the notice's own sourcelabel and read_tc", async () => {
    const { vaultDB, inner } = sortedOverQuietMemory()
    await inner.tryBirthBank(TH.birthBankAskOf())
    const { events } = noticesOf(vaultDB)
    await vaultDB.tryGetThing(TH.getGateAskOf())
    const next = TH.nextGateOf(TH.gateThingOf())
    const read_tc = readTcNow()
    vaultDB.bell(rungOf(next, read_tc))
    vaultDB.bell(rungOf(TH.boxThingOf(), read_tc))
    const rung = events.slice(4)
    expect(shorthandsOf(rung)).to.deep.equal([['item', 'gate', 'full'], ...firstSeen('box/openai')])
    for (const event of rung) { expect(event).to.deep.include({ sourcelabel: 'other_tab', read_tc }) }
    expect(rung[0]).to.deep.include({ val: next })
    await vaultDB.tryGetThing(TH.getGateAskOf())
    expect(events).to.have.lengthOf(7)
  })

  it("notifies of nothing for a repeat rung, or for a life or aged notice, whatever its agerank", async () => {
    const { vaultDB } = sortedOverMemory()
    const { events } = noticesOf(vaultDB)
    await vaultDB.tryBirthBank(TH.birthBankAskOf())
    const sorted = [...events]
    for (const event of sorted) { vaultDB.bell(event) }
    const box = TH.boxThingOf()
    const scope = { userid: box.userid, banklabel: box.banklabel, labelpath: box.labelpath, modelkind: 'box' as const, bank_lifetok: undefined, sourcelabel: 'other_tab', read_tc: readTcNow() }
    vaultDB.bell({ ...scope, eventkind: 'life', lifekind: 'born', agerank: 'zzz', agerankWas: undefined })
    vaultDB.bell({ ...scope, eventkind: 'aged', agekind: 'bare', agekindWas: undefined, agerank: 'zzz', agerankWas: undefined })
    expect(events).to.deep.equal(sorted)
  })

  it("notifies of the void sentinel of a void item rung, at the lifepath it carries, sorted with an answer's records", async () => {
    const { vaultDB } = sortedOverMemory()
    const { events } = noticesOf(vaultDB)
    const voidSentinel = Shell.of({ ...TH.BoxScope, lifepath: Shell.childCited(TH.Life0).lifepath })
    vaultDB.bell(rungOf(voidSentinel))
    expect(shorthandsOf(events)).to.deep.equal([['item', 'box/openai', 'void'], ['life', 'box/openai', 'died']])
    expect(events[0]).to.deep.include({ val: voidSentinel })
    await vaultDB.tryBirthBank(TH.birthBankAskOf())
    expect(await vaultDB.tryGetThing(TH.getAskAt('box/openai'))).to.deep.include({ act: 'gotvoid' })
    expect(events).to.have.lengthOf(8)
  })

  const BadRings = [
    [{ ...rungOf(TH.gateThingOf()), sourcelabel: 'Other Tab' },                         'a sourcelabel that is not a label'],
    [{ ...rungOf(TH.gateThingOf()), sourcelabel: undefined },                           'no sourcelabel'],
    [rungOf(TH.gateThingOf(), crypto.randomUUID()),                                    'a read_tc that is no UUID version 7'],
    [{ ...rungOf(TH.gateThingOf()), eventkind: 'told' },                                'an eventkind it does not know'],
    [undefined,                                                                          'no notice'],
    [{ ...rungOf(TH.gateThingOf()), val: 'not a Thing' },                                'a val that is not a Thing'],
    [rungOf(TH.gateThingOf({ banklabel: 'other' })),                                    'a notice of another bank'],
    [{ ...rungOf(TH.gateThingOf({ banklabel: 'other' })), banklabel: 'acme' },          'a record of another bank than its notice'],
    [{ ...rungOf(TH.boxThingOf()), labelpath: 'box/anthropic' },                         'a record of another Thing than its notice'],
    [rungOf(TH.boxThingOf('openai', { lifepath: TH.Life0 })),                           'a lifepath shallower than its labelpath'],
    [{ ...rungOf(TH.gateThingOf()), liveness: 'dead' },                                 'a liveness it does not know'],
    [{ ...rungOf(TH.gateThingOf()), liveness: 'void' },                                 'a void notice whose val is not the void sentinel'],
    [{ ...rungOf(Shell.of({ ...TH.BoxScope, lifepath: Shell.childCited(TH.Life0).lifepath })), liveness: 'gone' }, 'a notice not void whose val is the void sentinel'],
  ] as const

  for (const [event, blurb] of BadRings) {
    it(`refuses ${blurb}, notifying nothing`, () => {
      const { vaultDB } = sortedOverMemory()
      const { events } = noticesOf(vaultDB)
      TH.expectSyncRefusal(() => { vaultDB.bell(event as never) })
      expect(events).to.deep.equal([])
    })
  }
})

describe("SortedVaultDB's watchers", () => {
  it("notifies every watcher of every notice, in one order, each the same frozen notice", async () => {
    const { vaultDB } = sortedOverMemory()
    const watches = [noticesOf(vaultDB), noticesOf(vaultDB)]
    await vaultDB.tryBirthBank(TH.birthBankAskOf())
    expect(watches[0]!.events).to.have.lengthOf(6)
    expect(watches[1]!.events).to.have.ordered.members(watches[0]!.events)
    expect(watches[0]!.events.every((event) => Object.isFrozen(event))).to.be.true
  })

  it("sends a watcher's onBadNews the error its handler throws, and goes on notifying it and the others, and answering", async () => {
    const { vaultDB } = sortedOverMemory()
    const badNews: Errors.VaultError[] = []
    const thrown: VaultEvent[] = []
    vaultDB.watch(TH.ThingBank, (event) => { thrown.push(event); throw new Error('host bug') }, (news) => { badNews.push(news) })
    const other = noticesOf(vaultDB)
    expect(await vaultDB.tryBirthBank(TH.birthBankAskOf())).to.deep.include({ ok: true, act: 'born' })
    expect(thrown).to.have.lengthOf(6)
    expect(other.events).to.have.lengthOf(6)
    expect(new Set(badNews.map((news) => news.refusalkind))).to.deep.equal(new Set(['unexpected_error']))
    expect(other.badNews).to.deep.equal([])
  })

  it("notifies a stopped watcher of nothing more", async () => {
    const { vaultDB } = sortedOverMemory()
    const { events, stop } = noticesOf(vaultDB)
    noticesOf(vaultDB)
    stop()
    await vaultDB.tryBirthBank(TH.birthBankAskOf())
    expect(events).to.deep.equal([])
  })
})
