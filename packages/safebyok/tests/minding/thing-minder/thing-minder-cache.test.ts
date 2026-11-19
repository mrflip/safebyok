import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { type BankCar, type BoxCar, type GateCar, type ThingCar, MaxTimerMillis } from '../../../src/shapes/shapes-minder'
import { carOf } from '../../../src/minding/thing-car'
import { MemoryVaultDB } from '../../../src/storage/memory-vault-db'
import { type ThingRecord, Shell } from '../../../src/shapes/shapes-thing'
import * as TH from '../../test-helpers'
import { GateGetAsk, DownVaultDB, QuietVaultDB, minderOf, minderWorldOf, bornOf, storedGateOf, storedBoxOf, noticeOf, actOf, boxScopeOf, cheatBox, boxBirthAskOf } from './world'

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

describe("ThingMinder.listingAt", () => {
  it("holds the root box's listing from hello, with each box a get or a notice tells of before a list", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB)
    const { minder, receive } = minderWorldOf(vaultDB, { isRootHeard: false })
    expect(minder.listingAt(TH.RootScope)).to.deep.equal([])
    await minder.get(TH.BoxScope)
    receive(noticeOf(TH.nextOf(box)))
    receive(noticeOf(TH.boxThingOf('anthropic')))
    expect(minder.listingAt(TH.RootScope)).to.deep.equal(['box/anthropic', 'box/openai'])
  })

  it("holds the labelpaths a list answers, tombstones included, in labelpath order, frozen", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    cheatBox(vaultDB, TH.boxTombOf(TH.boxThingOf('anthropic')))
    const { minder } = minderWorldOf(vaultDB)
    await minder.list('box')
    const listing = minder.listingAt(TH.RootScope)
    expect(listing).to.deep.equal(['box/anthropic', 'box/openai'])
    expect(Object.isFrozen(listing)).to.be.true
  })

  it("adds a box a get or a notice tells of, live or gone, but never a shell", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder, receive } = minderWorldOf(vaultDB)
    await minder.list('box')
    cheatBox(vaultDB, TH.boxThingOf('anthropic'))
    await minder.get(boxScopeOf('anthropic'))
    const mistralTomb = TH.boxTombOf(TH.boxThingOf('mistral'))
    receive(noticeOf(mistralTomb))
    const { liveness } = await minder.get(boxScopeOf('cohere'))
    expect(liveness).to.eq('void')
    expect(minder.listingAt(TH.RootScope)).to.deep.equal(['box/anthropic', 'box/mistral', 'box/openai'])
  })

  it("keeps a listed box whose tombstone arrives", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder, receive } = minderWorldOf(vaultDB)
    await minder.list('box')
    const tombstone = TH.boxTombOf(TH.boxThingOf())
    receive(noticeOf(tombstone))
    expect(minder.listingAt(TH.RootScope)).to.deep.equal(['box/openai'])
  })

  it("keeps a labelpath a later list does not answer", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = minderWorldOf(vaultDB)
    await minder.list('box')
    vaultDB._cheat_things(TH.ThingBank).delete(TH.BoxScope.labelpath)
    expect(await minder.list('box')).to.deep.equal([])
    expect(minder.listingAt(TH.RootScope)).to.deep.equal(['box/openai'])
  })

  it("keeps the same array until a labelpath joins it", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB)
    const { minder, receive } = minderWorldOf(vaultDB)
    await minder.list('box')
    const listing = minder.listingAt(TH.RootScope)
    receive(noticeOf(TH.nextOf(box)))
    await minder.get(TH.BoxScope)
    await minder.list('box')
    expect(minder.listingAt(TH.RootScope)).to.eq(listing)
    receive(noticeOf(TH.boxThingOf('anthropic')))
    expect(minder.listingAt(TH.RootScope)).to.not.eq(listing)
    expect(minder.listingAt(TH.RootScope)).to.deep.equal(['box/anthropic', 'box/openai'])
  })

  it("lists a box born on another device by the watch alone", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = minderWorldOf(vaultDB)
    await minder.list('box')
    const shell = Shell.of(boxScopeOf('anthropic'), TH.rootBoxOf())
    const birth = TH.birthAskOf(TH.boxThingOf('anthropic'), shell)
    await TH.expectGood(vaultDB.tryWriteThing(birth))
    await TH.eventually(() => minder.listingAt(TH.RootScope)?.length === 2)
    expect(minder.listingAt(TH.RootScope)).to.deep.equal(['box/anthropic', 'box/openai'])
  })

  it("holds the listing of a Thing other than the root box only once it is listed, empty where it has no children", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = minderWorldOf(vaultDB)
    expect(minder.listingAt(TH.GateScope)).to.be.undefined
    await minder.list('gate')
    expect(minder.listingAt(TH.GateScope)).to.deep.equal([])
  })

  it("caches nothing a list answers after goodbye", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = minderWorldOf(vaultDB)
    const listing = minder.list('box')
    minder.goodbye()
    await listing
    expect(minder.listingAt(TH.RootScope)).to.be.undefined
  })

  it("collects a listing under the host's gcTime, from its first list, and a later list restores it", async () => {
    vi.useFakeTimers()
    try {
      const vaultDB = new MemoryVaultDB()
      await storedBoxOf(vaultDB)
      const minder  = minderOf(vaultDB, { gcTime: 10 })
      minder.hello()
      await minder.list('gate')
      await vi.advanceTimersByTimeAsync(6)
      await minder.list('gate')
      await vi.advanceTimersByTimeAsync(6)
      expect(minder.listingAt(TH.GateScope)).to.be.undefined
      await minder.list('gate')
      expect(minder.listingAt(TH.GateScope)).to.deep.equal([])
    } finally {
      vi.useRealTimers()
    }
  })

  it("keeps the root box's listing until goodbye, whatever the host's gcTime", async () => {
    vi.useFakeTimers()
    try {
      const vaultDB = new MemoryVaultDB()
      await storedBoxOf(vaultDB)
      const minder  = minderOf(vaultDB, { gcTime: 10 })
      minder.hello()
      await vi.advanceTimersByTimeAsync(20)
      expect(minder.listingAt(TH.RootScope)).to.deep.equal([])
      await minder.list('box')
      await vi.advanceTimersByTimeAsync(20)
      expect(minder.listingAt(TH.RootScope)).to.deep.equal(['box/openai'])
      minder.goodbye()
      expect(minder.listingAt(TH.RootScope)).to.be.undefined
    } finally {
      vi.useRealTimers()
    }
  })

  const ForeignScopes = [
    [{ ...TH.RootScope, userid: 'u2' },        "refuses bad_record for another user's scope"],
    [{ ...TH.RootScope, banklabel: 'other' },  "refuses bad_record for another bank's scope"],
    [{ ...TH.RootScope, labelpath: 'Box' },    "refuses bad_record for a labelpath that is no Thing's"],
  ] as const
  for (const [scoped, blurb] of ForeignScopes) {
    it(blurb, () => {
      const { minder } = minderWorldOf(new MemoryVaultDB())
      TH.expectSyncRefusal(() => minder.listingAt(scoped), 'bad_record')
    })
  }
})

describe("ThingMinder.isListingBareAt", () => {
  it("is true of the root box's listing from hello, as each box a get, a write or a notice tells of joins it", async () => {
    const vaultDB = new QuietVaultDB()
    await storedBoxOf(vaultDB)
    const { minder, receive } = minderWorldOf(vaultDB)
    expect(minder.isListingBareAt(TH.RootScope)).to.be.true
    await minder.get(TH.BoxScope)
    receive(noticeOf(TH.boxThingOf('mistral')))
    await TH.expectGood(minder.tryWrite(boxBirthAskOf('cohere')))
    expect(minder.listingAt(TH.RootScope)).to.deep.equal(['box/cohere', 'box/mistral', 'box/openai'])
    expect(minder.isListingBareAt(TH.RootScope)).to.be.true
  })

  it("is true of the root box's listing after an invalidate and a join", () => {
    const { minder, receive } = minderWorldOf(new MemoryVaultDB())
    minder.invalidate('box', { list: 'all' })
    receive(noticeOf(TH.boxThingOf()))
    expect(minder.isListingBareAt(TH.RootScope)).to.be.true
  })

  it("is false once a list sets the listing, even one that answers nothing, and after a box joins it", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder, receive } = minderWorldOf(vaultDB)
    expect(await minder.list('box')).to.deep.equal([])
    expect(minder.isListingBareAt(TH.RootScope)).to.be.false
    receive(noticeOf(TH.boxThingOf()))
    expect(minder.isListingBareAt(TH.RootScope)).to.be.false
  })

  it("is false of a listing not cached: another Thing's before a list, and the root box's after goodbye", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder } = minderWorldOf(vaultDB)
    expect(minder.isListingBareAt(TH.GateScope)).to.be.false
    await minder.list('gate')
    expect(minder.isListingBareAt(TH.GateScope)).to.be.false
    minder.goodbye()
    expect(minder.isListingBareAt(TH.RootScope)).to.be.false
  })

  it("is true of the root box's listing, empty again, after goodbye and hello", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = minderWorldOf(vaultDB)
    await minder.list('box')
    minder.goodbye()
    minder.hello()
    expect(minder.listingAt(TH.RootScope)).to.deep.equal([])
    expect(minder.isListingBareAt(TH.RootScope)).to.be.true
  })

  const ForeignScopes = [
    [{ ...TH.RootScope, userid: 'u2' },        "refuses bad_record for another user's scope"],
    [{ ...TH.RootScope, labelpath: 'Box' },    "refuses bad_record for a labelpath that is no Thing's"],
  ] as const
  for (const [scoped, blurb] of ForeignScopes) {
    it(blurb, () => {
      const { minder } = minderWorldOf(new MemoryVaultDB())
      TH.expectSyncRefusal(() => minder.isListingBareAt(scoped), 'bad_record')
    })
  }
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
