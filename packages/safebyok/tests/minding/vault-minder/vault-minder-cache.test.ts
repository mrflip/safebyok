import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { MaxTimerMillis } from '../../../src/shapes/shapes-minder'
import { MemoryVaultDB } from '../../../src/storage/memory-vault-db'
import { type BoxRecord, type Sparse, type ThingRecord, type Tombstone, Shell } from '../../../src/shapes/shapes-thing'
import { Thing } from '../../../src/models/thing'
import * as TH from '../../test-helpers'
import { Hours24, BoxGetAsk, DownVaultDB, QuietVaultDB, fakeBankOf, minderOf, minderWorldOf, bornOf, storedBoxOf, noticeOf, sparseNoticeOf, actOf, boxScopeOf, cheatBox, boxBirthAskOf } from './world'

describe("VaultMinder.at", () => {
  it("has nothing before any get", async () => {
    const { minder } = await minderWorldOf(new MemoryVaultDB())
    expect(minder.at(TH.BoxScope)).to.be.undefined
  })

  it("has the whole record however old it is, deeply frozen", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB, 0)
    const { minder } = await minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    expect(minder.isStaleAt(TH.BoxScope, { staleTime: 0 })).to.be.true
    const record = minder.at(TH.BoxScope)
    expect(record).to.deep.equal(box)
    expect([Object.isFrozen(record), Object.isFrozen((record as typeof box).sidecar)]).to.deep.equal([true, true])
  })

  it("has nothing of a list's sparse record, and keeps the item it had", async () => {
    const vaultDB = new MemoryVaultDB()
    const box0    = await storedBoxOf(vaultDB)
    const { minder } = await minderWorldOf(vaultDB)
    await minder.list('box')
    expect(minder.at(TH.BoxScope)).to.be.undefined
    await minder.get(TH.BoxScope)
    cheatBox(vaultDB, TH.nextOf(box0))
    await minder.list('box')
    expect(minder.at(TH.BoxScope)).to.deep.equal(box0)
  })

  const ForeignScopes = [
    [{ ...TH.BoxScope, userid: 'u2' },            "refuses bad_record for another user's scope"],
    [{ ...TH.BoxScope, banklabel: 'zz' },         "refuses bad_record for another bank's scope"],
    [{ ...TH.BoxScope, labelpath: 'Box/openai' }, "refuses bad_record for a labelpath that is no Thing's"],
    [TH.GateScope,                                'refuses bad_record for the main gate, which is no box'],
    [{ ...TH.ThingBank, labelpath: 'bank' },      'refuses bad_record for the bank, which is no box'],
    [TH.RootScope,                                'refuses bad_record for the root box, which has no item here'],
  ] as const
  for (const [scoped, blurb] of ForeignScopes) {
    it(blurb, async () => {
      const { minder } = await minderWorldOf(new MemoryVaultDB())
      TH.expectSyncRefusal(() => minder.at(scoped), 'bad_record')
    })
  }

  it("has the item of a box, leaving the bank, main gate and root box to the BankMinder", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB)
    const { minder, bankMinder } = await minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    expect(minder.at(TH.BoxScope)).to.deep.equal(box)
    expect(bankMinder.worldAt(TH.ThingBank)).to.deep.equal({ bank: TH.bankThingOf(), gate: TH.gateThingOf(), root: TH.rootBoxOf() })
  })

  it("types the record by the labelpath's kind, where it is known when compiled", async () => {
    const { minder } = await minderWorldOf(new MemoryVaultDB())
    // Known only when run, as a host's labels are.
    const [label, labelpath] = ['openai' as string, 'box/openai' as string]
    expectTypeOf(minder.at(TH.BoxScope)).toEqualTypeOf<BoxRecord | Tombstone<BoxRecord> | undefined>()
    expectTypeOf(minder.at({ ...TH.ThingBank, labelpath: `box/${label}` as const })).toEqualTypeOf<BoxRecord | Tombstone<BoxRecord> | undefined>()
    expectTypeOf(minder.at({ ...TH.ThingBank, labelpath })).toEqualTypeOf<ThingRecord | Tombstone<ThingRecord> | undefined>()
  })
})

describe("VaultMinder.soonAt", () => {
  it("has a list's sparse record where no item is cached", async () => {
    const vaultDB = new MemoryVaultDB()
    const box0    = await storedBoxOf(vaultDB)
    const { minder } = await minderWorldOf(vaultDB)
    await minder.list('box')
    const soon = minder.soonAt(TH.BoxScope)
    expect(soon).to.deep.equal(Thing.sparseOf(box0))
    expect(Object.isFrozen(soon)).to.be.true
  })

  it("has a sparse record newer than the item, until a get catches the item up", async () => {
    const vaultDB = new MemoryVaultDB()
    const box0    = await storedBoxOf(vaultDB)
    const { minder } = await minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    const box1    = TH.nextOf(box0)
    cheatBox(vaultDB, box1)
    await minder.list('box')
    expect(minder.soonAt(TH.BoxScope)).to.deep.equal(Thing.sparseOf(box1))
    await minder.get(TH.BoxScope)
    expect(minder.soonAt(TH.BoxScope)).to.be.undefined
    expect(minder.at(TH.BoxScope)).to.deep.equal(box1)
  })

  it("has nothing of a sparse record no newer than the item", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = await minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    await minder.list('box')
    expect(minder.soonAt(TH.BoxScope)).to.be.undefined
  })

  it("keeps the newer of two sparse records, in either order", async () => {
    const box0 = TH.boxThingOf()
    const box1 = TH.nextOf(box0)
    for (const order of [[box0, box1], [box1, box0]]) {
      const { minder, receive } = await minderWorldOf(new MemoryVaultDB())
      for (const box of order) { receive(sparseNoticeOf(box)) }
      expect(minder.soonAt(TH.BoxScope)).to.deep.equal(Thing.sparseOf(box1))
    }
  })

  it("has nothing once a whole record no older arrives", async () => {
    const { minder, receive } = await minderWorldOf(new MemoryVaultDB())
    const box0 = TH.boxThingOf()
    receive(sparseNoticeOf(box0))
    receive(noticeOf(box0))
    expect([minder.soonAt(TH.BoxScope), minder.at(TH.BoxScope)]).to.deep.equal([undefined, box0])
  })

  it("types the sparse record by the labelpath's kind", async () => {
    const { minder } = await minderWorldOf(new MemoryVaultDB())
    expectTypeOf(minder.soonAt(TH.BoxScope)).toEqualTypeOf<Sparse<BoxRecord> | undefined>()
  })

  it("refuses bad_record for another bank's scope", async () => {
    const { minder } = await minderWorldOf(new MemoryVaultDB())
    TH.expectSyncRefusal(() => minder.soonAt({ ...TH.GateScope, banklabel: 'zz' }), 'bad_record')
  })
})

describe("VaultMinder.isBehindAt", () => {
  it("is true while a newer sparse record is cached, with no item or a whole older one, and false once a record no older lands", async () => {
    const { minder, receive } = await minderWorldOf(new MemoryVaultDB())
    const box0 = TH.boxThingOf()
    const box1 = TH.nextOf(box0)
    expect(minder.isBehindAt(TH.BoxScope)).to.be.false
    receive(sparseNoticeOf(box0))
    expect(minder.isBehindAt(TH.BoxScope)).to.be.true
    receive(noticeOf(box0))
    expect(minder.isBehindAt(TH.BoxScope)).to.be.false
    receive(sparseNoticeOf(box1))
    expect(minder.isBehindAt(TH.BoxScope)).to.be.true
    receive(noticeOf(box1))
    expect(minder.isBehindAt(TH.BoxScope)).to.be.false
  })

  it("refuses bad_record for another bank's scope", async () => {
    const { minder } = await minderWorldOf(new MemoryVaultDB())
    TH.expectSyncRefusal(() => minder.isBehindAt({ ...TH.BoxScope, banklabel: 'zz' }), 'bad_record')
  })
})

describe("VaultMinder.listingAt", () => {
  it("lists each box received before the root box's first list", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB)
    const { minder, receive } = await minderWorldOf(vaultDB, { isWorldHeard: false })
    expect(minder.listingAt(TH.RootScope)).to.deep.equal([])
    await minder.get(TH.BoxScope)
    receive(noticeOf(TH.nextOf(box)))
    receive(noticeOf(TH.boxThingOf('anthropic')))
    expect(minder.listingAt(TH.RootScope)).to.deep.equal(['box/anthropic', 'box/openai'])
  })

  it("has the labelpaths a list answers, tombstones included, in labelpath order, frozen", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    cheatBox(vaultDB, TH.boxTombOf(TH.boxThingOf('anthropic')))
    const { minder } = await minderWorldOf(vaultDB)
    await minder.list('box')
    const listing = minder.listingAt(TH.RootScope)
    expect(listing).to.deep.equal(['box/anthropic', 'box/openai'])
    expect(Object.isFrozen(listing)).to.be.true
  })

  it("adds a box a get or a notice delivers, live or gone, but never a shell", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder, receive } = await minderWorldOf(vaultDB)
    await minder.list('box')
    cheatBox(vaultDB, TH.boxThingOf('anthropic'))
    await minder.get(boxScopeOf('anthropic'))
    const mistralTomb = TH.boxTombOf(TH.boxThingOf('mistral'))
    receive(noticeOf(mistralTomb))
    const cohere = await minder.get(boxScopeOf('cohere'))
    expect(Thing.isVoidSentinel(cohere)).to.be.true
    expect(minder.listingAt(TH.RootScope)).to.deep.equal(['box/anthropic', 'box/mistral', 'box/openai'])
  })

  it("still lists a box whose tombstone arrives", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder, receive } = await minderWorldOf(vaultDB)
    await minder.list('box')
    const tombstone = TH.boxTombOf(TH.boxThingOf())
    receive(noticeOf(tombstone))
    expect(minder.listingAt(TH.RootScope)).to.deep.equal(['box/openai'])
  })

  it("still lists a labelpath a later list does not answer", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = await minderWorldOf(vaultDB)
    await minder.list('box')
    vaultDB._cheat_things(TH.ThingBank).delete(TH.BoxScope.labelpath)
    expect(await minder.list('box')).to.deep.equal([])
    expect(minder.listingAt(TH.RootScope)).to.deep.equal(['box/openai'])
  })

  it("returns the same array until a labelpath joins it", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB)
    const { minder, receive } = await minderWorldOf(vaultDB)
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
    const { minder } = await minderWorldOf(vaultDB)
    await minder.list('box')
    const shell = Shell.of(boxScopeOf('anthropic'), TH.rootBoxOf())
    const birth = TH.birthAskOf(TH.boxThingOf('anthropic'), shell)
    await TH.expectGood(vaultDB.tryWriteThing(birth))
    await TH.eventually(() => minder.listingAt(TH.RootScope)?.length === 2)
    expect(minder.listingAt(TH.RootScope)).to.deep.equal(['box/anthropic', 'box/openai'])
  })

  it("has another Thing's listing only once it is listed", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = await minderWorldOf(vaultDB)
    expect(minder.listingAt(TH.BoxScope)).to.be.undefined
    await minder.list('box/openai')
    expect(minder.listingAt(TH.BoxScope)).to.deep.equal([])
  })

  it("caches nothing a list answers after goodbye", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = await minderWorldOf(vaultDB)
    const listing = minder.tryList('box')
    minder.goodbye()
    await listing
    expect(minder.listingAt(TH.RootScope)).to.be.undefined
  })

  it("has the root box's listing until goodbye, however long after", async () => {
    vi.useFakeTimers()
    try {
      const vaultDB = new MemoryVaultDB()
      await storedBoxOf(vaultDB)
      const minder  = await minderOf(vaultDB)
      minder.hello()
      await vi.advanceTimersByTimeAsync(Hours24)
      expect(minder.listingAt(TH.RootScope)).to.deep.equal([])
      await minder.list('box')
      await vi.advanceTimersByTimeAsync(Hours24)
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
    it(blurb, async () => {
      const { minder } = await minderWorldOf(new MemoryVaultDB())
      TH.expectSyncRefusal(() => minder.listingAt(scoped), 'bad_record')
    })
  }
})

describe("VaultMinder.isListingBareAt", () => {
  it("is true of the root box's listing while boxes join it", async () => {
    const vaultDB = new QuietVaultDB()
    await storedBoxOf(vaultDB)
    const { minder, receive } = await minderWorldOf(vaultDB)
    expect(minder.isListingBareAt(TH.RootScope)).to.be.true
    await minder.get(TH.BoxScope)
    receive(noticeOf(TH.boxThingOf('mistral')))
    await TH.expectGood(minder.tryWrite(boxBirthAskOf('cohere')))
    expect(minder.listingAt(TH.RootScope)).to.deep.equal(['box/cohere', 'box/mistral', 'box/openai'])
    expect(minder.isListingBareAt(TH.RootScope)).to.be.true
  })

  it("is true of the root box's listing after an invalidate and a join", async () => {
    const { minder, receive } = await minderWorldOf(new MemoryVaultDB())
    minder.invalidate('box', { list: 'all' })
    receive(noticeOf(TH.boxThingOf()))
    expect(minder.isListingBareAt(TH.RootScope)).to.be.true
  })

  it("is false from the first list on, whatever it answers", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder, receive } = await minderWorldOf(vaultDB)
    expect(await minder.list('box')).to.deep.equal([])
    expect(minder.isListingBareAt(TH.RootScope)).to.be.false
    receive(noticeOf(TH.boxThingOf()))
    expect(minder.isListingBareAt(TH.RootScope)).to.be.false
  })

  it("is false of a listing not cached or set by a list", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder } = await minderWorldOf(vaultDB)
    expect(minder.isListingBareAt(TH.BoxScope)).to.be.false
    await minder.list('box/openai')
    expect(minder.isListingBareAt(TH.BoxScope)).to.be.false
    minder.goodbye()
    expect(minder.isListingBareAt(TH.RootScope)).to.be.false
  })

  it("is true of the root box's listing, empty again, after goodbye and hello", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = await minderWorldOf(vaultDB)
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
    it(blurb, async () => {
      const { minder } = await minderWorldOf(new MemoryVaultDB())
      TH.expectSyncRefusal(() => minder.isListingBareAt(scoped), 'bad_record')
    })
  }
})

describe("VaultMinder.tryAt", () => {
  it("answers vacant where the cache has nothing", async () => {
    const { minder } = await minderWorldOf(new MemoryVaultDB())
    expect(minder.tryAt(TH.BoxScope)).to.deep.include({ ok: true, act: 'vacant', val: undefined, record: undefined, isTimely: false, refreshedAt: 0, isFetching: false, lastErr: null })
  })

  it("answers gotlive with the record where it is timely", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB, 0)
    const { minder } = await minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    expect(minder.tryAt(TH.BoxScope)).to.deep.include({ ok: true, act: 'gotlive', val: box, record: box, isTimely: true, isFetching: false, lastErr: null })
  })

  it("treats options given as undefined as left out", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB, 0)
    const { minder } = await minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    expect(minder.tryAt(TH.BoxScope, { staleTime: undefined, ifStale: undefined })).to.deep.include({ ok: true, act: 'gotlive', val: box, isTimely: true })
  })

  it("answers gotlive for a whole record under a staleTime of Infinity", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB, 0)
    const { minder } = await minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    expect(minder.tryAt(TH.BoxScope, { staleTime: Infinity })).to.deep.include({ ok: true, act: 'gotlive', val: box, isTimely: true })
  })

  it("answers untimely beside a newer sparse record, with no item or behind one, even under a staleTime of Infinity", async () => {
    const vaultDB = new MemoryVaultDB()
    const box0    = await storedBoxOf(vaultDB)
    const { minder } = await minderWorldOf(vaultDB)
    await minder.list('box')
    expect(minder.tryAt(TH.BoxScope, { staleTime: Infinity })).to.deep.include({ ok: true, act: 'untimely', record: undefined, isTimely: false })
    await minder.get(TH.BoxScope)
    vaultDB._cheat_things(TH.ThingBank).set(TH.BoxScope.labelpath, TH.nextOf(box0))
    await minder.list('box')
    expect(minder.tryAt(TH.BoxScope, { staleTime: Infinity })).to.deep.include({ ok: true, act: 'untimely', record: box0, isTimely: false })
  })

  it("answers untimely, without val but with the item's record, where it is older than staleTime", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB, 0)
    const { minder } = await minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    const answer = minder.tryAt(TH.BoxScope, { staleTime: 0 })
    expect(answer).to.deep.include({ ok: true, act: 'untimely', val: undefined, record: box, isTimely: false })
    expect(answer).to.have.property('refreshedAt').above(0)
  })

  it("answers gotvoid, with a null val, where storage has nothing", async () => {
    const { minder } = await minderWorldOf(await bornOf(new MemoryVaultDB()))
    await minder.get(TH.BoxScope)
    expect(minder.tryAt(TH.BoxScope)).to.deep.include({ ok: true, act: 'gotvoid', val: null, isTimely: true })
  })

  it("answers gotgone with a tombstone", async () => {
    const { minder, receive } = await minderWorldOf(new MemoryVaultDB())
    const tombstone = TH.boxTombOf(TH.boxThingOf())
    receive(noticeOf(tombstone))
    expect(minder.tryAt(TH.BoxScope)).to.deep.include({ ok: true, act: 'gotgone', val: tombstone })
  })

  it("reads the cache alone under ifStale: 'get'", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB, 0)
    const { minder } = await minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    expect(minder.tryAt(TH.BoxScope, { ifStale: 'get' })).to.deep.include({ act: 'vacant', isFetching: false })
    await TH.wakeupAtNextTick()
    expect(asked.mock.calls).to.have.lengthOf(0)
  })

  it("fetches a vacant record in the background under ifStale: 'refresh'", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB, 0)
    const { minder } = await minderWorldOf(vaultDB)
    expect(minder.tryAt(TH.BoxScope, { ifStale: 'refresh' })).to.deep.include({ act: 'vacant', isFetching: true })
    await TH.eventually(() => actOf(minder.tryAt(TH.BoxScope)) === 'gotlive')
    expect(minder.at(TH.BoxScope)).to.deep.equal(box)
  })

  it("fetches nothing under ifStale: 'refresh' while the record is timely", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB, 0)
    const { minder } = await minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    expect(minder.tryAt(TH.BoxScope, { ifStale: 'refresh' })).to.deep.include({ act: 'gotlive', isFetching: false })
    await TH.wakeupAtNextTick()
    expect(asked.mock.calls).to.have.lengthOf(0)
  })

  it("answers a background get's refusal as lastErr", async () => {
    const { minder } = await minderWorldOf(new DownVaultDB())
    minder.tryAt(TH.BoxScope, { ifStale: 'refresh' })
    await TH.eventually(() => ('lastErr' in minder.tryAt(TH.BoxScope)) && (minder.tryAt(TH.BoxScope) as { lastErr: unknown }).lastErr !== null)
    const answer = minder.tryAt(TH.BoxScope)
    expect(answer).to.deep.include({ ok: true, act: 'vacant', isFetching: false })
    expect(answer).to.have.nested.property('lastErr.refusalkind', 'storage_unavailable')
  })

  it("answers unexpected_error, not a storage refusal, for anything else its own code throws", async () => {
    const bank = { ...fakeBankOf(), makeGetAsk: () => { throw new Error('ask broke') } }
    const minder = await minderOf(new MemoryVaultDB(), {}, bank)
    minder.hello()
    const answer = minder.tryAt(TH.BoxScope)
    expect(answer).to.deep.include({ ok: false, act: 'unclassified_storing' })
    expect(answer).to.have.nested.property('err.refusalkind', 'unexpected_error')
  })

  const RefusedScopes = [
    [{ ...TH.BoxScope, userid: 'u2' },      {},                                'refuses bad_record for a scope of another bank'],
    [{ ...TH.BoxScope, labelpath: 'Box/openai' }, {},                                "refuses bad_record for a labelpath that is no Thing's"],
    [TH.BoxScope,                           { ifStale: 'keep' },               'refuses bad_record for an ifStale it does not know'],
    [TH.BoxScope,                           { staleTime: MaxTimerMillis + 1 }, 'refuses bad_record for a staleTime past MaxTimerMillis'],
  ] as const
  for (const [scoped, opts, blurb] of RefusedScopes) {
    it(blurb, async () => {
      const { minder } = await minderWorldOf(new MemoryVaultDB())
      await TH.expectBad(minder.tryAt(scoped, opts as never), 'bad_record')
    })
  }

  it("sends the vaultDB the bank's get ask for the scope", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder } = await minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    minder.tryAt(TH.BoxScope, { ifStale: 'refresh' })
    await TH.eventually(() => asked.mock.calls.length === 1)
    expect(asked.mock.calls).to.deep.equal([[BoxGetAsk]])
  })
})
