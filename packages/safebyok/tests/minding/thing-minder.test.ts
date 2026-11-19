import * as TSQ from '@tanstack/query-core'
import { Errors } from 'safebyok-big/internals'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import {
  type BankCar, type BoxCar, type DeliverableThing, type GateCar, type MinderEvent, type MinderFriend, type QueryCacheOpts, type TSQAnswer, type ThingCar, DefaultQueryCacheOpts, MaxTimerMillis,
} from '../../src/shapes/shapes-minder'
import { carOf } from '../../src/minding/thing-car'
import { ThingMinder } from '../../src/minding/thing-minder'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import type { Labelpath, Revtok } from '../../src/shapes/primitives'
import { type GateRecord, type ThingRecord, type ThingScope, Shell } from '../../src/shapes/shapes-thing'
import { BoxChecks } from '../../src/shapes/shapes-thingkinds'
import { Thing } from '../../src/models/thing'
import { type GetAsk, getAskOf, listAskOf } from '../../src/shapes/shapes-asks'
import type { GetThingAnswer, ThingNotice } from '../../src/storage/vault-db'
import * as TH from '../test-helpers'

/** The get ask a minder sends the vaultDB for the main gate: the bank's, tracking the roots at revision 0. */
const GateGetAsk: GetAsk = getAskOf({ ...TH.GateScope, ifAbsent: 'nil', track: TH.trackOf() })

/** A bank as a minder reads it: its scope, its get and list asks tracking the roots at revision 0, and a spy for its bad news. */
function fakeBankOf() {
  return {
    scope:       { ...TH.ThingBank },
    rootBox:     { ...TH.rootBoxOf(), am: 'a' },
    makeGetAsk:  (args: { labelpath: Labelpath, ifAbsent?: 'nil' | 'fail' }) => getAskOf({ ...args, ...TH.ThingBank, track: TH.trackOf() }),
    makeListAsk: (args: { labelpath: Labelpath, ifAbsent?: 'nil' | 'fail' }) => listAskOf({ ...args, ...TH.ThingBank, track: TH.trackOf() }),
    tellBadNews: vi.fn<(badnews: readonly unknown[]) => void>(),
  } satisfies MinderFriend
}

/** The bad news told to `bank`, a {@link fakeBankOf} bank, each by its refusalkind. */
function badnewsOf(bank: ReturnType<typeof fakeBankOf>): string[] {
  return bank.tellBadNews.mock.calls.flatMap(([told]) => told.map((news) => (news as Errors.VaultError).refusalkind))
}

/** A vaultDB whose gets read the store at once, and answer only when the test calls `release`. */
class LateVaultDB extends MemoryVaultDB {
  readonly #releases: (() => void)[] = []

  /** True while a get has read the store and waits to answer. */
  get isHolding(): boolean { return this.#releases.length > 0 }

  override async tryGetThing(ask: GetAsk): Promise<GetThingAnswer> {
    const answer = await super.tryGetThing(ask)
    await new Promise<void>((resolve) => { this.#releases.push(resolve) })
    return answer
  }

  /** Let every get that waits answer what it read. */
  release(): void { for (const resolve of this.#releases.splice(0)) { resolve() } }
}

/** A vaultDB whose datastore cannot be reached. */
class DownVaultDB extends MemoryVaultDB {
  protected override doGetThing(): never { throw new Error('connection refused') }
}

/** A minder of `bank` over `vaultDB`. */
function minderOf(vaultDB: MemoryVaultDB, queryCacheOpts: Partial<QueryCacheOpts> = {}, bank: MinderFriend = fakeBankOf()): ThingMinder {
  return ThingMinder.make({ vaultDB, queryCacheOpts }, bank)
}

/** A bank's minder, what it stands on, and a way to hand its watch a notice. */
interface MinderWorld<VaultDBT extends MemoryVaultDB> {
  vaultDB: VaultDBT
  bank:    ReturnType<typeof fakeBankOf>
  minder:  ThingMinder
  receive: (notice: ThingNotice) => void
}

/** The minder of a bank over `vaultDB`, made, and started unless `isStarted` is false, after which it has heard the root box's notice unless `isRootHeard` is false. */
function minderWorldOf<VaultDBT extends MemoryVaultDB>(vaultDB: VaultDBT, { isStarted = true, isRootHeard = true } = {}): MinderWorld<VaultDBT> {
  const bank     = fakeBankOf()
  const watching = vi.spyOn(vaultDB as MemoryVaultDB, 'watch')
  const minder   = minderOf(vaultDB, {}, bank)
  if (isStarted) { minder.hello() }
  function receive(notice: ThingNotice): void {
    for (const watched of watching.mock.calls) { watched[1](notice) }
  }
  if (isStarted && isRootHeard) { receive(noticeOf(TH.rootBoxOf())) }
  return { vaultDB, bank, minder, receive }
}

/** `vaultDB`, holding a born bank: its roots at revision 0, the asks above track. */
async function bornOf<VaultDBT extends MemoryVaultDB>(vaultDB: VaultDBT): Promise<VaultDBT> {
  await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
  return vaultDB
}

/** A vaultDB holding a born bank with its main gate at revision `revseq`, and the gate it holds. */
async function storedGateOf(vaultDB: MemoryVaultDB, revseq: number): Promise<GateRecord> {
  let gate = TH.gateThingOf()
  await bornOf(vaultDB)
  for (let ii = 0; ii < revseq; ii++) {
    const next = TH.nextGateOf(gate)
    await TH.expectGood(vaultDB.tryWriteThing(TH.replaceAskOf(gate, next)))
    gate = next
  }
  return gate
}

/** A vaultDB holding a born bank and the box under its root box, and the box. */
async function storedBoxOf(vaultDB: MemoryVaultDB): Promise<ThingNotice['val']> {
  await bornOf(vaultDB)
  const box   = TH.boxThingOf()
  const shell = Shell.of(TH.BoxScope, TH.rootBoxOf())
  await TH.expectGood(vaultDB.tryWriteThing(TH.birthAskOf(box, shell)))
  return box
}

/** A watch notice of `thing`, as the vaultDB sends one, with `world` beside it. */
function noticeOf(thing: ThingNotice['val'], world: ThingNotice['world'] = null): ThingNotice {
  return { ok: true, act: (thing.am === 'a') ? 'gotlive' : 'gotgone', val: thing, world }
}

/** The revtok of the newest record the minder has for the main gate, or undefined for nothing or the void sentinel. */
function revtokAt(minder: ThingMinder): Revtok | undefined {
  const record: DeliverableThing | undefined = minder.at(TH.GateScope)?.newest
  return ((record === undefined) || Thing.isVoidSentinel(record)) ? undefined : record.revtok
}

/** The act of `answer`, a tryAt's answer. */
function actOf(answer: TSQAnswer): string { return answer.act }

describe("ThingMinder.make", () => {
  const vaultDB = new MemoryVaultDB()
  const { makeGetAsk: _makeGetAsk, ...noAsks } = fakeBankOf()
  const { makeListAsk: _makeListAsk, ...noListAsks } = fakeBankOf()
  const MakeCases = [
    [{},                                                    { ...TH.ThingBank }, 'refuses a bank without its scope'],
    [{},                                                    noAsks,              'refuses a bank that builds no get asks'],
    [{},                                                    noListAsks,          'refuses a bank that builds no list asks'],
    [{ vaultDB: { tryGetThing: () => 1, watch: () => 1 } }, null,                'refuses a vaultDB without the brand'],
    [{ queryCacheOpts: { networkMode: 'online' } },         null,                'refuses a networkMode, which no host sets'],
    [{ queryCacheOpts: { retry: 3 } },                      null,                'refuses a retry, which no host sets'],
    [{ queryCacheOpts: { staleTime: -1 } },                 null,                'refuses a negative staleTime'],
    [{ queryCacheOpts: { staleTime: MaxTimerMillis + 1 } }, null,                'refuses a staleTime past MaxTimerMillis'],
    [{ queryCacheOpts: { gcTime: MaxTimerMillis + 1 } },    null,                'refuses a gcTime past MaxTimerMillis'],
    [{ queryCacheOpts: { staleTime: 'static' } },           null,                "refuses a staleTime of 'static' for the minder's own"],
  ] as const
  for (const [optsOver, bank, blurb] of MakeCases) {
    it(blurb, () => {
      // @ts-expect-error -- sloppy input is the point
      TH.expectSyncRefusal(() => ThingMinder.make({ vaultDB, ...optsOver }, bank ?? fakeBankOf()), 'bad_record')
    })
  }

  it("takes its scope from the bank", () => {
    const { minder } = minderWorldOf(new MemoryVaultDB(), { isStarted: false })
    expect(minder.scope).to.deep.equal(TH.ThingBank)
  })
})

describe("ThingMinder.hello", () => {
  it("keeps a car timely for the staleTime the minder was made with, an hour by default", async () => {
    vi.useFakeTimers()
    try {
      const vaultDB = await bornOf(new MemoryVaultDB())
      expect(DefaultQueryCacheOpts.staleTime).to.eq(60 * 60 * 1000)
      for (const [queryCacheOpts, staleTime] of [[{}, 60 * 60 * 1000], [{ staleTime: 5 }, 5]] as const) {
        const minder = minderOf(vaultDB, queryCacheOpts)
        minder.hello()
        await minder.get(TH.GateScope)
        await vi.advanceTimersByTimeAsync(staleTime - 1)
        expect(minder.isStaleAt(TH.GateScope), String(staleTime - 1)).to.be.false
        await vi.advanceTimersByTimeAsync(1)
        expect(minder.isStaleAt(TH.GateScope), String(staleTime)).to.be.true
        minder.goodbye()
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it("takes a staleTime of Infinity for the minder's own, under which a full car never ages and a bare one is stale", async () => {
    vi.useFakeTimers()
    try {
      const vaultDB = new MemoryVaultDB()
      await storedBoxOf(vaultDB)
      const minder  = minderOf(vaultDB, { staleTime: Infinity })
      minder.hello()
      await minder.list('box')
      expect(minder.isStaleAt(TH.BoxScope)).to.be.true
      await minder.get(TH.BoxScope)
      await vi.advanceTimersByTimeAsync(MaxTimerMillis)
      expect(minder.isStaleAt(TH.BoxScope)).to.be.false
      minder.goodbye()
    } finally {
      vi.useRealTimers()
    }
  })

  it("watches the bank once, for every kind of Thing", () => {
    const vaultDB  = new MemoryVaultDB()
    const watching = vi.spyOn(vaultDB, 'watch')
    minderWorldOf(vaultDB)
    expect(watching.mock.calls.map(([scope]) => scope)).to.deep.equal([TH.ThingBank])
  })

  it("opens no second watch when called again", () => {
    const vaultDB  = new MemoryVaultDB()
    const watching = vi.spyOn(vaultDB, 'watch')
    const { minder } = minderWorldOf(vaultDB)
    minder.hello()
    expect(watching.mock.calls).to.have.lengthOf(1)
  })

  it("caches nothing at hello, so the first get of the root box fetches it whole", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder } = minderWorldOf(vaultDB, { isRootHeard: false })
    expect(minder.at(TH.RootScope)).to.be.undefined
    expect(minder.at(TH.GateScope)).to.be.undefined
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    expect(await minder.get(TH.RootScope)).to.deep.equal(carOf(TH.rootBoxOf()))
    expect(asked.mock.calls).to.have.lengthOf(1)
  })

  it("is made before its bank is born, refuses until the bank is stored, then answers under the root box the birth's notice delivers", async () => {
    const vaultDB = new MemoryVaultDB()
    const { minder, receive } = minderWorldOf(vaultDB, { isRootHeard: false })
    await TH.expectRefusal(minder.get(TH.BoxScope), 'storage_issue')
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    receive(noticeOf(TH.rootBoxOf()))
    const shell = Shell.of(TH.BoxScope, TH.rootBoxOf())
    expect(await minder.get(TH.BoxScope)).to.deep.equal(carOf(shell))
  })

  it("keeps the root box cached past the host's gcTime, which collects the boxes under it, until goodbye", async () => {
    vi.useFakeTimers()
    try {
      const vaultDB = new MemoryVaultDB()
      const box     = await storedBoxOf(vaultDB)
      const minder  = minderOf(vaultDB, { gcTime: 10 })
      minder.hello()
      await minder.get(TH.RootScope)
      await minder.list('box')
      expect(minder.at(TH.BoxScope)).to.have.property('liveness', 'bare')
      await vi.advanceTimersByTimeAsync(20)
      expect(minder.at(TH.RootScope)?.newest).to.deep.equal(TH.rootBoxOf())
      expect(minder.at(TH.BoxScope)).to.be.undefined
      await minder.list('box')
      expect(minder.at(TH.BoxScope)).to.deep.equal(carOf(Thing.sparseOf(box)))
      minder.goodbye()
      expect([minder.at(TH.RootScope), minder.at(TH.BoxScope)]).to.deep.equal([undefined, undefined])
    } finally {
      vi.useRealTimers()
    }
  })

  it("comes before any read: until then, each refuses disabled", async () => {
    const { minder } = minderWorldOf(new MemoryVaultDB(), { isStarted: false })
    await TH.expectBad(minder.tryAt(TH.GateScope), 'disabled')
    await TH.expectRefusal(minder.get(TH.GateScope), 'disabled')
    await TH.expectRefusal(minder.list('box'), 'disabled')
  })
})

describe("ThingMinder.goodbye", () => {
  it("empties the cache, stops watching, and refuses later reads", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate0   = await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    await minder.get(TH.GateScope)
    expect(minder.at(TH.RootScope)).to.have.property('liveness', 'full')
    minder.goodbye()
    expect([minder.at(TH.RootScope), minder.at(TH.GateScope)]).to.deep.equal([undefined, undefined])
    const gate1 = TH.nextGateOf(gate0)
    await TH.expectGood(vaultDB.tryWriteThing(TH.replaceAskOf(gate0, gate1)))
    await TH.wakeupAtNextTick()
    expect(minder.at(TH.GateScope)).to.be.undefined
    await TH.expectBad(minder.tryAt(TH.GateScope), 'disabled')
    await TH.expectRefusal(minder.get(TH.GateScope), 'disabled')
  })

  it("refuses a get under way disabled, and caches nothing it answers after", async () => {
    const vaultDB = await bornOf(new LateVaultDB())
    const { minder } = minderWorldOf(vaultDB)
    const getting = minder.get(TH.GateScope)
    await TH.eventually(() => vaultDB.isHolding)
    minder.goodbye()
    vaultDB.release()
    await TH.expectRefusal(getting, 'disabled')
    expect(minder.at(TH.GateScope)).to.be.undefined
  })

  it("lets hello start the minder again, with the cache's timings it was made with", async () => {
    vi.useFakeTimers()
    try {
      const vaultDB = new MemoryVaultDB()
      await storedBoxOf(vaultDB)
      const gate    = TH.gateThingOf()
      const minder  = minderOf(vaultDB, { staleTime: 5, gcTime: 10 })
      minder.hello()
      minder.goodbye()
      minder.hello()
      expect(await minder.get(TH.GateScope)).to.deep.equal(carOf(gate))
      await minder.get(TH.RootScope)
      await vi.advanceTimersByTimeAsync(5)
      expect(minder.isStaleAt(TH.GateScope)).to.be.true
      await vi.advanceTimersByTimeAsync(20)
      expect([minder.at(TH.GateScope), minder.at(TH.RootScope)?.liveness]).to.deep.equal([undefined, 'full'])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("ThingMinder.at", () => {
  it("holds nothing before any get", () => {
    const { minder } = minderWorldOf(new MemoryVaultDB())
    expect(minder.at(TH.GateScope)).to.be.undefined
  })

  it("has the car however old it is, its record in both newest and fullest", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    await minder.get(TH.GateScope)
    expect(minder.isStaleAt(TH.GateScope, { staleTime: 0 })).to.be.true
    const car = minder.at(TH.GateScope)
    expect(car).to.deep.equal({ liveness: 'full', newest: gate, fullest: gate })
    expect(car?.newest).to.eq(car?.fullest)
    expect(Object.isFrozen(car)).to.be.true
  })

  const ForeignScopes = [
    [{ ...TH.GateScope, userid: 'u2' },       "refuses bad_record for another user's scope"],
    [{ ...TH.GateScope, banklabel: 'zz' },    "refuses bad_record for another bank's scope"],
    [{ ...TH.GateScope, labelpath: 'Gate' },  "refuses bad_record for a labelpath that is no Thing's"],
  ] as const
  for (const [scoped, blurb] of ForeignScopes) {
    it(blurb, () => {
      const { minder } = minderWorldOf(new MemoryVaultDB())
      TH.expectSyncRefusal(() => minder.at(scoped), 'bad_record')
    })
  }

  it("holds the car of every kind of Thing in the bank", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB)
    const { minder } = minderWorldOf(vaultDB)
    await Promise.all([minder.get(TH.BankScope), minder.get(TH.GateScope), minder.get(TH.BoxScope)])
    expect(minder.at(TH.BankScope)?.newest).to.deep.equal(TH.bankThingOf())
    expect(minder.at(TH.GateScope)?.newest).to.deep.equal(TH.gateThingOf())
    expect(minder.at(TH.RootScope)?.newest).to.deep.equal(TH.rootBoxOf())
    expect(minder.at(TH.BoxScope)?.newest).to.deep.equal(box)
  })

  it("types the car by the labelpath's kind, where it is known when compiled", () => {
    const { minder } = minderWorldOf(new MemoryVaultDB())
    // Known only when run, as a host's labels are.
    const [label, labelpath] = ['openai' as string, 'box/openai' as string]
    expectTypeOf(minder.at(TH.GateScope)).toEqualTypeOf<GateCar | undefined>()
    expectTypeOf(minder.at(TH.RootScope)).toEqualTypeOf<BoxCar | undefined>()
    expectTypeOf(minder.at({ ...TH.ThingBank, labelpath: `box/${label}` as const })).toEqualTypeOf<BoxCar | undefined>()
    expectTypeOf(minder.at(TH.BankScope)).toEqualTypeOf<BankCar | undefined>()
    expectTypeOf(minder.at({ ...TH.ThingBank, labelpath })).toEqualTypeOf<ThingCar<ThingRecord> | undefined>()
  })
})

describe("ThingMinder.tryAt", () => {
  it("answers vacant where the cache holds nothing", () => {
    const { minder } = minderWorldOf(new MemoryVaultDB())
    expect(minder.tryAt(TH.GateScope)).to.deep.include({ ok: true, act: 'vacant', val: undefined, car: undefined, isTimely: false, refreshedAt: 0, isFetching: false, lastErr: null })
  })

  it("answers gotlive with the record where it is timely", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    await minder.get(TH.GateScope)
    expect(minder.tryAt(TH.GateScope)).to.deep.include({ ok: true, act: 'gotlive', val: gate, car: carOf(gate), isTimely: true, isFetching: false, lastErr: null })
  })

  it("takes options given as undefined as no opinion", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    await minder.get(TH.GateScope)
    expect(minder.tryAt(TH.GateScope, { staleTime: undefined, ifStale: undefined })).to.deep.include({ ok: true, act: 'gotlive', val: gate, isTimely: true })
  })

  it("answers gotlive for a full car under a staleTime of Infinity or 'static'", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    await minder.get(TH.GateScope)
    for (const staleTime of [Infinity, 'static'] as const) {
      expect(minder.tryAt(TH.GateScope, { staleTime })).to.deep.include({ ok: true, act: 'gotlive', val: gate, isTimely: true })
    }
  })

  it("answers untimely for a bare or behind car, even under a staleTime of Infinity", async () => {
    const vaultDB = new MemoryVaultDB()
    const box0    = await storedBoxOf(vaultDB)
    const { minder } = minderWorldOf(vaultDB)
    await minder.list('box')
    expect(minder.tryAt(TH.BoxScope, { staleTime: Infinity })).to.deep.include({ ok: true, act: 'untimely', isTimely: false })
    await minder.get(TH.BoxScope)
    vaultDB._cheat_things(TH.ThingBank).set(TH.BoxScope.labelpath, TH.nextOf(box0))
    await minder.list('box')
    expect(minder.tryAt(TH.BoxScope, { staleTime: Infinity })).to.deep.include({ ok: true, act: 'untimely', isTimely: false })
  })

  it("answers untimely, without the record but with its car, where it is older than staleTime", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    await minder.get(TH.GateScope)
    const answer = minder.tryAt(TH.GateScope, { staleTime: 0 })
    expect(answer).to.deep.include({ ok: true, act: 'untimely', val: undefined, car: carOf(gate), isTimely: false })
    expect(answer).to.have.property('refreshedAt').above(0)
  })

  it("answers gotvoid, with a null val, where storage holds nothing", async () => {
    const { minder } = minderWorldOf(await bornOf(new MemoryVaultDB()))
    await minder.get(TH.BoxScope)
    expect(minder.tryAt(TH.BoxScope)).to.deep.include({ ok: true, act: 'gotvoid', val: null, isTimely: true })
  })

  it("answers gotgone with a tombstone", () => {
    const { minder, receive } = minderWorldOf(new MemoryVaultDB())
    const tombstone = TH.boxTombOf(TH.boxThingOf())
    receive(noticeOf(tombstone))
    expect(minder.tryAt(TH.BoxScope)).to.deep.include({ ok: true, act: 'gotgone', val: tombstone })
  })

  it("reads the cache alone under ifStale: 'get'", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    expect(minder.tryAt(TH.GateScope, { ifStale: 'get' })).to.deep.include({ act: 'vacant', isFetching: false })
    await TH.wakeupAtNextTick()
    expect(asked.mock.calls).to.have.lengthOf(0)
  })

  it("fetches a vacant record in the background under ifStale: 'refresh'", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    expect(minder.tryAt(TH.GateScope, { ifStale: 'refresh' })).to.deep.include({ act: 'vacant', isFetching: true })
    await TH.eventually(() => actOf(minder.tryAt(TH.GateScope)) === 'gotlive')
    expect(minder.at(TH.GateScope)).to.deep.equal(carOf(gate))
  })

  it("fetches nothing under ifStale: 'refresh' while the record is timely", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    await minder.get(TH.GateScope)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    expect(minder.tryAt(TH.GateScope, { ifStale: 'refresh' })).to.deep.include({ act: 'gotlive', isFetching: false })
    await TH.wakeupAtNextTick()
    expect(asked.mock.calls).to.have.lengthOf(0)
  })

  it("answers a background get's refusal as lastErr", async () => {
    const { minder } = minderWorldOf(new DownVaultDB())
    minder.tryAt(TH.GateScope, { ifStale: 'refresh' })
    await TH.eventually(() => ('lastErr' in minder.tryAt(TH.GateScope)) && (minder.tryAt(TH.GateScope) as { lastErr: unknown }).lastErr !== null)
    const answer = minder.tryAt(TH.GateScope)
    expect(answer).to.deep.include({ ok: true, act: 'vacant', isFetching: false })
    expect(answer).to.have.nested.property('lastErr.refusalkind', 'storage_unavailable')
  })

  const RefusedScopes = [
    [{ ...TH.GateScope, userid: 'u2' },      {},                                'refuses bad_record for a scope of another bank'],
    [{ ...TH.GateScope, labelpath: 'Gate' }, {},                                "refuses bad_record for a labelpath that is no Thing's"],
    [TH.GateScope,                           { ifStale: 'keep' },               'refuses bad_record for an ifStale it does not know'],
    [TH.GateScope,                           { staleTime: MaxTimerMillis + 1 }, 'refuses bad_record for a staleTime past MaxTimerMillis'],
  ] as const
  for (const [scoped, opts, blurb] of RefusedScopes) {
    it(blurb, async () => {
      const { minder } = minderWorldOf(new MemoryVaultDB())
      await TH.expectBad(minder.tryAt(scoped, opts as never), 'bad_record')
    })
  }

  it("sends the vaultDB the bank's get ask for the scope", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder } = minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    minder.tryAt(TH.GateScope, { ifStale: 'refresh' })
    await TH.eventually(() => asked.mock.calls.length === 1)
    expect(asked.mock.calls).to.deep.equal([[GateGetAsk]])
  })
})

describe("ThingMinder.get", () => {
  it("refuses bad_record for a scope of another bank", async () => {
    const { minder } = minderWorldOf(new MemoryVaultDB())
    await TH.expectRefusal(minder.get({ ...TH.GateScope, banklabel: 'zz' }), 'bad_record')
  })

  it("takes a staleTime given as undefined as the minder's own", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    await minder.get(TH.GateScope, { staleTime: undefined })
    await minder.get(TH.GateScope, { staleTime: undefined })
    expect(asked.mock.calls).to.have.lengthOf(1)
  })

  it("returns the car of the record stored, and reads the cache after", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = await storedGateOf(vaultDB, 1)
    const { minder } = minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    expect(await minder.get(TH.GateScope)).to.deep.equal(carOf(gate))
    expect(await minder.get(TH.GateScope)).to.deep.equal(carOf(gate))
    expect(asked.mock.calls).to.have.lengthOf(1)
  })

  it("returns, for a box under the root box, its shell under the root box it caches, which the box's birth cites", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder } = minderWorldOf(vaultDB)
    const { liveness, newest: shell } = await minder.get(TH.BoxScope)
    expect(liveness).to.eq('void')
    expect(shell).to.deep.equal(Shell.of(TH.BoxScope, TH.rootBoxOf()))
    expect(shell).to.deep.include({ ...TH.BoxScope, label: 'openai', revseq: -1, am: 'x', lifepath: `${TH.Life0}/${Shell.VoidLifeseq}` })
    expect(BoxChecks.sealable.safeParse(shell).success).to.be.true
    const birth = TH.birthAskOf(TH.boxThingOf(), shell)
    await TH.expectGood(vaultDB.tryWriteThing(birth))
  })

  it("answers a get of an empty box with a void car in the bank's root box's life, though no car of the root box is cached", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder } = minderWorldOf(vaultDB, { isRootHeard: false })
    const { liveness, newest } = await minder.get(TH.BoxScope)
    expect(liveness).to.eq('void')
    expect(newest).to.deep.equal(Shell.of(TH.BoxScope, TH.rootBoxOf()))
  })

  it("asks the vaultDB once for two gets under way together", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    const [first, second] = await Promise.all([minder.get(TH.GateScope), minder.get(TH.GateScope)])
    expect(first).to.deep.equal(second)
    expect(asked.mock.calls).to.have.lengthOf(1)
  })

  it("asks the vaultDB again once the record is older than staleTime", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    await minder.get(TH.GateScope)
    await minder.get(TH.GateScope, { staleTime: 0 })
    expect(asked.mock.calls).to.have.lengthOf(2)
  })

  it("caches nothing of the world beside the record, and a main gate the ask tracks stale comes to the minder as its own notice", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate1   = await storedGateOf(vaultDB, 1)
    const { minder } = minderWorldOf(vaultDB)
    await TH.wakeupAtNextTick()
    expect(minder.at(TH.GateScope)).to.be.undefined
    expect(await minder.get(TH.BankScope)).to.have.nested.property('newest.labelpath', 'bank')
    await TH.eventually(() => revtokAt(minder) === gate1.revtok)
    expect(minder.at(TH.GateScope)).to.deep.equal(carOf(gate1))
  })

  it("returns a notice that lands during the get over the get's older answer", async () => {
    const vaultDB = new LateVaultDB()
    const gate0   = await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    const getting = minder.get(TH.GateScope)
    await TH.eventually(() => vaultDB.isHolding)
    const gate1 = TH.nextGateOf(gate0)
    await TH.expectGood(vaultDB.tryWriteThing(TH.replaceAskOf(gate0, gate1)))
    await TH.eventually(() => revtokAt(minder) === gate1.revtok)
    vaultDB.release()
    expect(await getting).to.deep.equal(carOf(gate1))
  })

  it("returns a birth that lands during the get over the get's void", async () => {
    const vaultDB = await bornOf(new LateVaultDB())
    const { minder } = minderWorldOf(vaultDB)
    const getting = minder.get(TH.BoxScope)
    await TH.eventually(() => vaultDB.isHolding)
    const box   = TH.boxThingOf()
    const shell = Shell.of(TH.BoxScope, TH.rootBoxOf())
    await TH.expectGood(vaultDB.tryWriteThing(TH.birthAskOf(box, shell)))
    await TH.eventually(() => minder.at(TH.BoxScope)?.newest.revtok === box.revtok)
    vaultDB.release()
    expect(await getting).to.deep.equal(carOf(box))
  })

  // A box, which no ask tracks: a tracked Thing stored is never missing (notes/wontfix.md).
  const BackwardCases = [
    [(vaultDB: MemoryVaultDB, box0: DeliverableThing) => { vaultDB._cheat_things(TH.ThingBank).set(TH.BoxScope.labelpath, box0) }, 'an older revision'],
    [(vaultDB: MemoryVaultDB) => { vaultDB._cheat_things(TH.ThingBank).delete(TH.BoxScope.labelpath) },                            'nothing stored'],
  ] as const
  for (const [goBack, blurb] of BackwardCases) {
    it(`refuses 'stale_read' a get answered with ${blurb}, behind the record cached before it, and keeps that record untimely`, async () => {
      const vaultDB = new MemoryVaultDB()
      const box0    = await storedBoxOf(vaultDB)
      const box1    = TH.nextOf(box0)
      await TH.expectGood(vaultDB.tryWriteThing(TH.replaceAskOf(box0, box1)))
      const { minder } = minderWorldOf(vaultDB)
      await minder.get(TH.BoxScope)
      goBack(vaultDB, box0)
      await TH.expectRefusal(minder.get(TH.BoxScope, { staleTime: 0 }), 'stale_read')
      expect(minder.at(TH.BoxScope)).to.deep.equal(carOf(box1))
      expect(minder.tryAt(TH.BoxScope)).to.deep.include({ act: 'untimely', isTimely: false })
      expect(minder.tryAt(TH.BoxScope)).to.have.nested.property('lastErr.refusalkind', 'stale_read')
      const asked = vi.spyOn(vaultDB, 'tryGetThing')
      await TH.expectRefusal(minder.get(TH.BoxScope), 'stale_read')
      expect(asked.mock.calls).to.have.lengthOf(1)
    })
  }

  it("makes a notice of a newer record timely again after a stale read", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate1   = await storedGateOf(vaultDB, 1)
    const { minder, receive } = minderWorldOf(vaultDB)
    await minder.get(TH.GateScope)
    vaultDB._cheat_things(TH.ThingBank).set(TH.GateScope.labelpath, TH.gateThingOf())
    await TH.expectRefusal(minder.get(TH.GateScope, { staleTime: 0 }), 'stale_read')
    const gate2 = TH.nextGateOf(gate1)
    receive(noticeOf(gate2))
    expect(minder.tryAt(TH.GateScope)).to.deep.include({ act: 'gotlive', val: gate2, isTimely: true })
  })

  it("asks the vaultDB while the browser reports itself offline", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    TSQ.onlineManager.setOnline(false)
    try {
      expect(await minder.get(TH.GateScope)).to.deep.equal(carOf(gate))
    } finally { TSQ.onlineManager.setOnline(true) }
  })

  it("throws the vaultDB's refusal, without trying again", async () => {
    const vaultDB = await bornOf(new DownVaultDB())
    const { minder } = minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    await TH.expectRefusal(minder.get(TH.GateScope), 'storage_unavailable')
    expect(asked.mock.calls).to.have.lengthOf(1)
  })

})

describe("ThingMinder.list", () => {
  it("lists the boxes under the root box, and caches each bare and stale", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB)
    const { minder } = minderWorldOf(vaultDB)
    expect(await minder.list('box')).to.deep.equal([TH.BoxScope.labelpath])
    expect(minder.at(TH.BoxScope)).to.deep.equal({ liveness: 'bare', newest: Thing.sparseOf(box), fullest: undefined })
    expect(minder.isStaleAt(TH.BoxScope)).to.be.true
    expect(await minder.get(TH.BoxScope)).to.deep.equal(carOf(box))
  })

  it("leaves a box the cache holds whole as it is, and timely", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB)
    const { minder } = minderWorldOf(vaultDB)
    const got = await minder.get(TH.BoxScope)
    await minder.list('box')
    expect(minder.at(TH.BoxScope)).to.eq(got)
    expect(got).to.deep.equal(carOf(box))
    expect(minder.isStaleAt(TH.BoxScope)).to.be.false
  })

  it("leaves a box the cache has at an older revision behind and stale, still showing the older record whole", async () => {
    const vaultDB = new MemoryVaultDB()
    const box0    = await storedBoxOf(vaultDB)
    const { minder } = minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    const box1 = TH.nextOf(box0)
    vaultDB._cheat_things(TH.ThingBank).set(TH.BoxScope.labelpath, box1)
    await minder.list('box')
    expect(minder.at(TH.BoxScope)).to.deep.equal({ liveness: 'behind', newest: Thing.sparseOf(box1), fullest: box0 })
    expect(minder.isStaleAt(TH.BoxScope)).to.be.true
    expect(await minder.get(TH.BoxScope)).to.deep.equal(carOf(box1))
  })

  it("caches a box listed as a tombstone as gone, and answers it from the cache", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    const tombstone = TH.boxTombOf(TH.boxThingOf())
    vaultDB._cheat_things(TH.ThingBank).set(TH.BoxScope.labelpath, tombstone)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    await minder.list('box')
    expect(minder.at(TH.BoxScope)).to.deep.equal(carOf(Thing.sparseOf(tombstone)))
    expect(minder.tryAt(TH.BoxScope)).to.deep.include({ act: 'gotgone', isTimely: true })
    const { liveness } = await minder.get(TH.BoxScope)
    expect(liveness).to.eq('gone')
    expect(asked.mock.calls).to.have.lengthOf(0)
  })

  it("tells a listener of a listed box once, with its bare or behind car", async () => {
    const vaultDB = new MemoryVaultDB()
    const box0    = await storedBoxOf(vaultDB)
    const box1    = TH.nextOf(box0)
    await TH.expectGood(vaultDB.tryWriteThing(TH.replaceAskOf(box0, box1)))
    const otherShell = Shell.of({ ...TH.ThingBank, labelpath: 'box/anthropic' }, TH.rootBoxOf())
    const otherBirth = TH.birthAskOf(TH.boxThingOf('anthropic'), otherShell)
    await TH.expectGood(vaultDB.tryWriteThing(otherBirth))
    const { minder, receive } = minderWorldOf(vaultDB)
    receive(noticeOf(box0))
    const heard = listenerOf()
    minder.listen(heard)
    await minder.list('box')
    expect(toldOf(heard)).to.deep.equal([['box/anthropic', 'bare'], ['box/openai', 'behind']])
  })

  it("lists nothing under a root box with no boxes under it", async () => {
    const { minder } = minderWorldOf(await bornOf(new MemoryVaultDB()))
    expect(await minder.list('box')).to.deep.equal([])
  })

  it("sends the bank's list ask, which tracks the roots, and refuses where the bank is not stored", async () => {
    const { minder } = minderWorldOf(new MemoryVaultDB())
    await TH.expectRefusal(minder.list('box'), 'storage_issue')
  })

  it("sends the bank's list ask for the labelpath it is given", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder, bank } = minderWorldOf(vaultDB)
    const listed = vi.spyOn(vaultDB, 'tryListThings')
    expect(await minder.list('gate')).to.deep.equal([])
    expect(listed.mock.calls).to.deep.equal([[bank.makeListAsk({ labelpath: 'gate', ifAbsent: 'nil' })]])
  })

  it("refuses bad_record for a labelpath that is no Thing's", async () => {
    const { minder } = minderWorldOf(await bornOf(new MemoryVaultDB()))
    await TH.expectRefusal(minder.list('vault'), 'bad_record')
  })
})

/** A listener that records each event it is told. */
function listenerOf() { return vi.fn<(event: MinderEvent) => void>() }

/** The labelpath and the car's liveness of each car `listener` was told of, in order, or the carkind of any other event. */
function toldOf(listener: ReturnType<typeof listenerOf>): (readonly [Labelpath, ThingCar<ThingRecord>['liveness'] | undefined] | readonly [string])[] {
  return listener.mock.calls.map(([event]) => ((event.carkind === 'thing') ? [event.labelpath, event.car?.liveness] as const : [event.carkind] as const))
}

describe("ThingMinder.listen", () => {
  it("tells the cached car of every Thing of every kind, until stopped", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder } = minderWorldOf(vaultDB)
    const heard    = listenerOf()
    const unlisten = minder.listen(heard)
    await minder.get(TH.BoxScope)
    expect(heard.mock.calls).to.deep.equal([[{ carkind: 'thing', modelkind: 'box', labelpath: 'box/openai', car: minder.at(TH.BoxScope) }]])
    const gateCar = await minder.get(TH.GateScope)
    expect(heard.mock.calls.at(-1)?.[0]).to.deep.equal({ carkind: 'thing', modelkind: 'gate', labelpath: 'gate', car: gateCar })
    unlisten()
    heard.mockClear()
    await minder.get(TH.GateScope, { staleTime: 0 })
    expect(heard.mock.calls).to.have.lengthOf(0)
  })

  it("types a car's event by its modelkind", () => {
    expectTypeOf<Extract<MinderEvent, { carkind: 'thing', modelkind: 'box' }>['car']>().toEqualTypeOf<BoxCar | undefined>()
    expectTypeOf<Extract<MinderEvent, { carkind: 'thing', modelkind: 'gate' }>['car']>().toEqualTypeOf<GateCar | undefined>()
  })

  it("tells the car itself, the same object after a record that changes nothing", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = await storedGateOf(vaultDB, 0)
    const { minder, receive } = minderWorldOf(vaultDB)
    const heard   = listenerOf()
    minder.listen(heard)
    await minder.get(TH.GateScope)
    receive(noticeOf(gate))
    const cached = minder.at(TH.GateScope)
    expect(heard.mock.calls).to.have.lengthOf(2)
    expect(heard.mock.calls[0]?.[0]).to.have.property('car', cached)
    expect(heard.mock.calls[1]?.[0]).to.have.property('car', cached)
  })

  it("tells the void car of the shell, and the gone car of a tombstone", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder, receive } = minderWorldOf(vaultDB)
    const heard = listenerOf()
    minder.listen(heard)
    await minder.get(TH.BoxScope)
    const tombstone = TH.boxTombOf(TH.boxThingOf())
    receive(noticeOf(tombstone))
    expect(toldOf(heard)).to.deep.equal([['box/openai', 'void'], ['box/openai', 'gone']])
    expect(heard.mock.calls[1]?.[0]).to.have.nested.property('car.newest', tombstone)
  })

  it("tells nothing while a get waits, then the car it lands", async () => {
    const vaultDB = new LateVaultDB()
    const gate    = await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    const heard   = listenerOf()
    minder.listen(heard)
    const getting = minder.get(TH.GateScope)
    await TH.eventually(() => vaultDB.isHolding)
    expect(heard.mock.calls).to.have.lengthOf(0)
    vaultDB.release()
    await getting
    expect(heard.mock.calls.at(-1)?.[0]).to.deep.equal({ carkind: 'thing', modelkind: 'gate', labelpath: 'gate', car: carOf(gate) })
  })

  it("tells the car as cached after a refused get", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedGateOf(vaultDB, 1)
    const { minder } = minderWorldOf(vaultDB)
    const cached = await minder.get(TH.GateScope)
    const heard  = listenerOf()
    minder.listen(heard)
    vaultDB._cheat_things(TH.ThingBank).set(TH.GateScope.labelpath, TH.gateThingOf())
    await TH.expectRefusal(minder.get(TH.GateScope, { staleTime: 0 }), 'stale_read')
    expect(heard.mock.calls).to.have.lengthOf(1)
    expect(heard.mock.calls[0]?.[0]).to.have.property('car', cached)
  })

  it("tells no car for a first get that is refused, as for a removed one", async () => {
    const vaultDB = await bornOf(new DownVaultDB())
    const { minder } = minderWorldOf(vaultDB)
    const heard = listenerOf()
    minder.listen(heard)
    await TH.expectRefusal(minder.get(TH.GateScope), 'storage_unavailable')
    expect(toldOf(heard)).to.deep.equal([['gate', undefined]])
  })

  it("tells no car for each car goodbye removes", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    await minder.get(TH.GateScope)
    const heard = listenerOf()
    minder.listen(heard)
    minder.goodbye()
    expect(toldOf(heard)).to.have.deep.members([['box', undefined], ['gate', undefined]])
  })

  it("tells the bank's onBadNews what a listener throws, as unexpected_error, and tells the listeners after it", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = await storedGateOf(vaultDB, 0)
    const { minder, bank } = minderWorldOf(vaultDB)
    const later   = listenerOf()
    minder.listen(() => { throw new Error('listener broke') })
    minder.listen(later)
    await minder.get(TH.GateScope)
    expect(later.mock.calls.map(([event]) => event)).to.deep.include({ carkind: 'thing', modelkind: 'gate', labelpath: 'gate', car: carOf(gate) })
    expect(badnewsOf(bank)).to.deep.equal(['unexpected_error'])
    expect(bank.tellBadNews.mock.calls[0]?.[0][0]).to.have.nested.property('cause.message', 'listener broke')
  })

  it("refuses a listener that is not a function", () => {
    const { minder } = minderWorldOf(new MemoryVaultDB())
    // @ts-expect-error -- sloppy input is the point
    TH.expectSyncRefusal(() => minder.listen(undefined), 'bad_record')
  })
})

describe("ThingMinder.isStaleAt", () => {
  it("is true before any get, false after, and true past staleTime", async () => {
    const { minder } = minderWorldOf(await bornOf(new MemoryVaultDB()))
    expect(minder.isStaleAt(TH.GateScope)).to.be.true
    await minder.get(TH.GateScope)
    expect(minder.isStaleAt(TH.GateScope)).to.be.false
    expect(minder.isStaleAt(TH.GateScope, { staleTime: 0 })).to.be.true
  })

  it("takes a staleTime given as undefined as the minder's own", async () => {
    const { minder } = minderWorldOf(await bornOf(new MemoryVaultDB()))
    await minder.get(TH.GateScope)
    expect(minder.isStaleAt(TH.GateScope, { staleTime: undefined })).to.be.false
  })

  it("takes an ask or a record as its scope", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    await minder.get(TH.GateScope)
    expect([minder.isStaleAt(TH.GateScope), minder.isStaleAt(gate)]).to.deep.equal([false, false])
  })

  it("counts a bare or behind car stale under a staleTime of Infinity or 'static', and a get under Infinity fetches it", async () => {
    const vaultDB = new MemoryVaultDB()
    const box0    = await storedBoxOf(vaultDB)
    const { minder } = minderWorldOf(vaultDB)
    await minder.list('box')
    expect(minder.at(TH.BoxScope)).to.have.property('liveness', 'bare')
    for (const staleTime of [Infinity, 'static'] as const) { expect(minder.isStaleAt(TH.BoxScope, { staleTime })).to.be.true }
    await minder.get(TH.BoxScope)
    const box1 = TH.nextOf(box0)
    vaultDB._cheat_things(TH.ThingBank).set(TH.BoxScope.labelpath, box1)
    await minder.list('box')
    expect(minder.at(TH.BoxScope)).to.have.property('liveness', 'behind')
    for (const staleTime of [Infinity, 'static'] as const) { expect(minder.isStaleAt(TH.BoxScope, { staleTime })).to.be.true }
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    expect(await minder.get(TH.BoxScope, { staleTime: Infinity })).to.deep.equal(carOf(box1))
    expect(asked.mock.calls).to.have.lengthOf(1)
    expect(minder.isStaleAt(TH.BoxScope, { staleTime: Infinity })).to.be.false
  })

  it("counts a full car whose last get was refused stale under a staleTime of Infinity, and timely under 'static', as a get does", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate1   = await storedGateOf(vaultDB, 1)
    const { minder } = minderWorldOf(vaultDB)
    await minder.get(TH.GateScope)
    vaultDB._cheat_things(TH.ThingBank).set(TH.GateScope.labelpath, TH.gateThingOf())
    await TH.expectRefusal(minder.get(TH.GateScope, { staleTime: 0 }), 'stale_read')
    expect(minder.at(TH.GateScope)).to.have.property('liveness', 'full')
    expect(minder.isStaleAt(TH.GateScope, { staleTime: 'static' })).to.be.false
    expect(minder.isStaleAt(TH.GateScope, { staleTime: Infinity })).to.be.true
    vaultDB._cheat_things(TH.ThingBank).set(TH.GateScope.labelpath, gate1)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    await minder.get(TH.GateScope, { staleTime: 'static' })
    expect(asked.mock.calls).to.have.lengthOf(0)
    await minder.get(TH.GateScope, { staleTime: Infinity })
    expect(asked.mock.calls).to.have.lengthOf(1)
    expect(minder.isStaleAt(TH.GateScope, { staleTime: Infinity })).to.be.false
  })

  it("takes a staleTime up to MaxTimerMillis", async () => {
    const { minder } = minderWorldOf(await bornOf(new MemoryVaultDB()))
    await minder.get(TH.GateScope)
    expect(minder.isStaleAt(TH.GateScope, { staleTime: MaxTimerMillis })).to.be.false
  })

  const BadArgs = [
    [{ ...TH.GateScope, labelpath: 'Gate' }, {},                     "a labelpath that is no Thing's"],
    [{ ...TH.GateScope, banklabel: 'zz' }, {},                       "another bank's scope"],
    [TH.GateScope,                         { staleTime: -1 },        'a negative staleTime'],
    [TH.GateScope,                         { staleTime: 'never' },   'a staleTime of another word'],
    [TH.GateScope,                         { staleTime: MaxTimerMillis + 1 }, 'a staleTime past MaxTimerMillis'],
  ] as const
  for (const [scoped, opts, blurb] of BadArgs) {
    it(`refuses bad_record for ${blurb}`, () => {
      const { minder } = minderWorldOf(new MemoryVaultDB())
      TH.expectSyncRefusal(() => minder.isStaleAt(scoped, opts as never), 'bad_record')
    })
  }
})

describe("ThingMinder's watch", () => {
  it("caches each gate written", async () => {
    const vaultDB = new MemoryVaultDB()
    const { minder } = minderWorldOf(vaultDB)
    const gate = await storedGateOf(vaultDB, 0)
    await TH.eventually(() => revtokAt(minder) === gate.revtok)
    expect(minder.at(TH.GateScope)).to.deep.equal(carOf(gate))
  })

  it("caches the Thing a notice carries, of any kind, and drops the world beside it", () => {
    const { minder, receive } = minderWorldOf(new MemoryVaultDB())
    const [bank, gate, box] = [TH.bankThingOf(), TH.gateThingOf(), TH.boxThingOf()]
    receive(noticeOf(box, { ...bank, maingate: gate }))
    expect(minder.at(TH.BankScope)).to.be.undefined
    expect(minder.at(TH.GateScope)).to.be.undefined
    expect(minder.at(TH.BoxScope)).to.deep.equal(carOf(box))
    receive(noticeOf(gate))
    expect(minder.at(TH.GateScope)).to.deep.equal(carOf(gate))
  })

  it("skips a Thing while the minder is not minding", () => {
    const { minder, receive } = minderWorldOf(new MemoryVaultDB())
    minder.goodbye()
    receive(noticeOf(TH.boxThingOf()))
    expect(minder.at(TH.BoxScope)).to.be.undefined
  })

  it("tells its trouble to the bank's onBadNews", () => {
    const vaultDB  = new MemoryVaultDB()
    const watching = vi.spyOn(vaultDB, 'watch')
    const { bank } = minderWorldOf(vaultDB)
    watching.mock.calls[0]?.[2](new Errors.VaultError('damaged_row', 'a row failed its checks'))
    expect(badnewsOf(bank)).to.deep.equal(['damaged_row'])
  })

  it("puts a record of a later life after one of a higher revseq", () => {
    const { minder, receive } = minderWorldOf(new MemoryVaultDB())
    const oldLife = TH.gateThingOf({ lifeseq: '0000000000', lifepath: '0000000000', revtok: TH.revtokOf('old'), revseq: 3 })
    const newLife = TH.gateThingOf({ lifeseq: '0000000002', lifepath: '0000000002', revtok: TH.revtokOf('new'), revseq: 0 })
    receive(noticeOf(oldLife))
    receive(noticeOf(newLife))
    expect(revtokAt(minder)).to.eq(TH.revtokOf('new'))
    receive(noticeOf(oldLife))
    expect(revtokAt(minder)).to.eq(TH.revtokOf('new'))
  })

  it("puts any record after the shell", async () => {
    const { minder, receive } = minderWorldOf(await bornOf(new MemoryVaultDB()))
    await minder.get(TH.BoxScope)
    const box = TH.boxThingOf()
    receive(noticeOf(box))
    expect(minder.at(TH.BoxScope)).to.deep.equal(carOf(box))
  })

  it("caches a newer record as it arrived, in a full car", () => {
    const { minder, receive } = minderWorldOf(new MemoryVaultDB())
    const gate0 = TH.gateThingOf()
    receive(noticeOf(gate0))
    const gate1 = structuredClone(TH.nextGateOf(gate0))
    receive(noticeOf(gate1))
    const held1 = minder.at(TH.GateScope)
    expect(held1?.newest).to.deep.equal(gate1)
    expect(held1?.newest).to.eq(held1?.fullest)
  })
})

/** A minder that has not started, for a test of its keys. */
function minderWithoutStart(): ThingMinder { return minderWorldOf(new MemoryVaultDB(), { isStarted: false }).minder }

describe("ThingMinder keys", () => {
  const DeepScope = { ...TH.BoxScope, labelpath: 'box/openai/deep' }

  it("interleave '/' between the labels, then end with '!' for the Thing's car", () => {
    const minder = minderWithoutStart()
    expect(minder.queryKey(TH.GateScope)).to.deep.equal(['safebyok', 'u1', 'acme', 'gate', '!'])
    expect(minder.queryKey(TH.RootScope)).to.deep.equal(['safebyok', 'u1', 'acme', 'box', '!'])
    expect(minder.queryKey(TH.BoxScope)).to.deep.equal(['safebyok', 'u1', 'acme', 'box', '/', 'openai', '!'])
    expect(minder.queryKey(TH.BankScope)).to.deep.equal(['safebyok', 'u1', 'acme', 'bank', '!'])
  })

  it("put the list of a Thing's children under '#' and 'kids'", () => {
    const minder = minderWithoutStart()
    expect(minder.listingQueryKey(TH.RootScope)).to.deep.equal(['safebyok', 'u1', 'acme', 'box', '#', 'kids'])
    expect(minder.listingQueryKey(TH.BoxScope)).to.deep.equal(['safebyok', 'u1', 'acme', 'box', '/', 'openai', '#', 'kids'])
  })

  it("make a subtree prefix of the labels and '/', which no key of the Thing's own starts", () => {
    const minder = minderWithoutStart()
    expect(minder.subtreeQueryKey(TH.RootScope)).to.deep.equal(['safebyok', 'u1', 'acme', 'box', '/'])
    expect(minder.subtreeQueryKey(TH.BoxScope)).to.deep.equal(['safebyok', 'u1', 'acme', 'box', '/', 'openai', '/'])
  })

  it("match, for a subtree prefix, every key under the Thing and neither of the Thing's own", () => {
    const minder = minderWithoutStart()
    const matches = (prefixScope: ThingScope, keyScope: ThingScope) => {
      const prefix = minder.subtreeQueryKey(prefixScope)
      return [minder.queryKey(keyScope), minder.listingQueryKey(keyScope)].map((queryKey) => TSQ.partialMatchKey(queryKey, prefix))
    }
    expect(matches(TH.RootScope, TH.RootScope)).to.deep.equal([false, false])
    expect(matches(TH.RootScope, TH.BoxScope)).to.deep.equal([true, true])
    expect(matches(TH.RootScope, DeepScope)).to.deep.equal([true, true])
    expect(matches(TH.BoxScope, TH.BoxScope)).to.deep.equal([false, false])
    expect(matches(TH.BoxScope, DeepScope)).to.deep.equal([true, true])
    expect(matches(TH.BoxScope, TH.RootScope)).to.deep.equal([false, false])
    expect(matches(TH.BoxScope, { ...TH.BoxScope, labelpath: 'box/openai2' })).to.deep.equal([false, false])
    expect(matches(TH.RootScope, TH.GateScope)).to.deep.equal([false, false])
  })

  it("start no other key with the root box's car key, the one its gcTime default is set on", () => {
    const minder = minderWithoutStart()
    const queryKeys = [minder.queryKey(TH.RootScope), minder.listingQueryKey(TH.RootScope), minder.queryKey(TH.BoxScope)]
    expect(queryKeys.map((queryKey) => TSQ.partialMatchKey(queryKey, minder.queryKey(TH.RootScope)))).to.deep.equal([true, false, false])
  })
})
