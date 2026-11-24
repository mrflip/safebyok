import * as TSQ from '@tanstack/query-core'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { MaxTimerMillis } from '../../../src/shapes/shapes-minder'
import { MemoryVaultDB } from '../../../src/storage/memory-vault-db'
import { SortedVaultDB } from '../../../src/storage/sorted-vault-db'
import { type BoxRecord, type Sparse, type ThingRecord, type Tombstone } from '../../../src/shapes/shapes-thing'
import { Thing } from '../../../src/models/thing'
import * as TH from '../../test-helpers'
import { Hours24, BoxGetAsk, DownVaultDB, fakeBankOf, minderOf, minderWorldOf, sortedOf, bornOf, storedBoxOf, noticeOf, sparseNoticeOf, actOf, boxScopeOf, cheatBox, boxBirthAskOf, isListingStaleAt, labelpathsOf } from './world'

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
  ] as const
  for (const [scoped, blurb] of ForeignScopes) {
    it(blurb, async () => {
      const { minder } = await minderWorldOf(new MemoryVaultDB())
      TH.expectSyncRefusal(() => minder.at(scoped), 'bad_record')
    })
  }

  it("has the item of a box, and none of the bank, main gate or root box its answer carried", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB)
    const { minder } = await minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    expect(minder.at(TH.BoxScope)).to.deep.equal(box)
    for (const labelpath of ['bank', 'gate', 'box']) { expect(minder.at({ ...TH.ThingBank, labelpath })).to.be.undefined }
  })

  it("types the record by the labelpath's kind, where it is known when compiled", async () => {
    const { minder } = await minderWorldOf(new MemoryVaultDB())
    // Known only when run, as a host's labels are.
    const [label, labelpath] = ['openai' as string, 'box/openai' as string]
    expectTypeOf(minder.at(TH.BoxScope)).toEqualTypeOf<BoxRecord | null | undefined>()
    expectTypeOf(minder.at({ ...TH.ThingBank, labelpath: `box/${label}` as const })).toEqualTypeOf<BoxRecord | null | undefined>()
    expectTypeOf(minder.at({ ...TH.ThingBank, labelpath })).toEqualTypeOf<ThingRecord | null | undefined>()
    expectTypeOf(minder.deadAt(TH.BoxScope)).toEqualTypeOf<Tombstone<BoxRecord> | undefined>()
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
  it("has nothing before the first list, whatever boxes arrive", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB)
    const { minder, receive } = await minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    receive(noticeOf(TH.nextOf(box)))
    receive(noticeOf(TH.boxThingOf('anthropic')))
    expect(minder.listingAt(TH.RootScope)).to.be.undefined
  })

  it("has the Kids value a list answers, the live and the tombstones apart, frozen", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB)
    const gone    = TH.boxTombOf(TH.boxThingOf('anthropic'))
    cheatBox(vaultDB, gone)
    const { minder } = await minderWorldOf(vaultDB)
    const kids    = await minder.list('box')
    expect(minder.listingAt(TH.RootScope)).to.deep.equal({
      modelkind: 'kids', parentpath: 'box', parentlife: TH.rootBoxOf().lifepath,
      items: { openai: { lifeseq: box.lifeseq } }, gones: { anthropic: { lifeseq: gone.lifeseq } }, read_tc: kids.read_tc,
    })
    expect(Object.isFrozen(minder.listingAt(TH.RootScope)?.items)).to.be.true
  })

  it("is replaced whole by a later list, never joined to", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder, receive } = await minderWorldOf(vaultDB)
    await minder.list('box')
    receive(noticeOf(TH.boxThingOf('anthropic')))
    expect(labelpathsOf(minder.listingAt(TH.RootScope))).to.deep.equal(['box/openai'])
    vaultDB._cheat_things(TH.ThingBank).delete(TH.BoxScope.labelpath)
    await minder.list('box')
    expect(labelpathsOf(minder.listingAt(TH.RootScope))).to.deep.equal([])
  })

  it("keeps a listing read later than one set after it", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = await minderWorldOf(vaultDB)
    const earlier = await minder.list('box')
    const later   = await minder.list('box')
    minder.tsqClient.setQueryData(minder.listQueryKey(TH.RootScope), earlier)
    expect(minder.listingAt(TH.RootScope)?.read_tc).to.eq(later.read_tc)
  })

  it("keeps its items and gones the same objects while each list answers them the same", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = await minderWorldOf(vaultDB)
    await minder.list('box')
    const first = minder.listingAt(TH.RootScope)
    await minder.list('box')
    expect(minder.listingAt(TH.RootScope)).to.not.eq(first)
    expect([minder.listingAt(TH.RootScope)?.items, minder.listingAt(TH.RootScope)?.gones]).to.deep.equal([first?.items, first?.gones])
    expect(minder.listingAt(TH.RootScope)?.items).to.eq(first?.items)
  })

  it("has another Thing's listing only once it is listed", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = await minderWorldOf(vaultDB)
    expect(minder.listingAt(TH.BoxScope)).to.be.undefined
    await minder.list('box/openai')
    expect(minder.listingAt(TH.BoxScope)).to.deep.include({ parentpath: 'box/openai', items: {}, gones: {} })
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
      const minder  = minderOf()
      minder.hello(sortedOf(vaultDB))
      await minder.list('box')
      await vi.advanceTimersByTimeAsync(Hours24)
      expect(labelpathsOf(minder.listingAt(TH.RootScope))).to.deep.equal(['box/openai'])
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

/** A minder over one stored box, its root box's listing listed. */
async function listedWorld() {
  const vaultDB = new MemoryVaultDB()
  const box     = await storedBoxOf(vaultDB)
  const world   = await minderWorldOf(vaultDB)
  await world.minder.list('box')
  return { ...world, vaultDB, box }
}

describe("VaultMinder, a child's first landing", () => {

  it("leaves the root listing not stale once it has been listed over a stored box", async () => {
    const { minder } = await listedWorld()
    expect(isListingStaleAt(minder, TH.RootScope)).to.be.false
  })

  it("marks the parent's listing stale for a box new to it, whole or sparse", async () => {
    for (const notice of [noticeOf(TH.boxThingOf('anthropic')), sparseNoticeOf(TH.boxThingOf('anthropic'))]) {
      const { minder, receive } = await listedWorld()
      receive(notice)
      expect(isListingStaleAt(minder, TH.RootScope)).to.be.true
      expect(labelpathsOf(minder.listingAt(TH.RootScope))).to.deep.equal(['box/openai'])
    }
  })

  it("marks the parent's listing stale for a box born on another device, by the watch alone", async () => {
    const { minder, vaultDB } = await listedWorld()
    await TH.expectGood(vaultDB.tryWriteThing(boxBirthAskOf('anthropic')))
    await TH.eventually(() => isListingStaleAt(minder, TH.RootScope))
  })

  it("marks the parent's listing stale for a box this device writes over the null it got", async () => {
    const { minder } = await listedWorld()
    expect(await minder.get(boxScopeOf('anthropic'))).to.be.null
    expect(isListingStaleAt(minder, TH.RootScope)).to.be.false
    await TH.expectGood(minder.tryWrite(boxBirthAskOf('anthropic')))
    expect(isListingStaleAt(minder, TH.RootScope)).to.be.true
    await minder.list('box')
    expect(labelpathsOf(minder.listingAt(TH.RootScope))).to.deep.equal(['box/anthropic', 'box/openai'])
  })

  it("marks nothing stale for the first get of a box a list brought in, nor a later revision of it", async () => {
    const { minder, receive, box } = await listedWorld()
    await minder.get(TH.BoxScope)
    receive(noticeOf(TH.nextOf(box)))
    expect(isListingStaleAt(minder, TH.RootScope)).to.be.false
  })

  it("marks nothing stale where the parent has no listing cached", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder, receive } = await minderWorldOf(vaultDB)
    receive(noticeOf(TH.boxThingOf('anthropic')))
    expect(minder.listingAt(TH.RootScope)).to.be.undefined
    expect(minder.tsqClient.getQueryState(minder.listQueryKey(TH.RootScope))).to.be.undefined
  })

  it("lists again while a host observes the listing", async () => {
    const { minder, vaultDB, receive } = await listedWorld()
    const observer = new TSQ.QueryObserver(minder.tsqClient, { queryKey: minder.listQueryKey(TH.RootScope) })
    const unsubscribe = observer.subscribe(() => undefined)
    try {
      // A listing is stale at once, so the observer lists as it mounts.
      await TH.eventually(() => ! observer.getCurrentResult().isFetching)
      cheatBox(vaultDB, TH.boxThingOf('anthropic'))
      receive(noticeOf(TH.boxThingOf('anthropic')))
      await TH.eventually(() => labelpathsOf(minder.listingAt(TH.RootScope))?.length === 2)
      expect(isListingStaleAt(minder, TH.RootScope)).to.be.false
    } finally {
      unsubscribe()
    }
  })
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

  it("answers gotvoid, with null and a null dbhas, where storage has nothing", async () => {
    const { minder } = await minderWorldOf(await bornOf(new MemoryVaultDB()))
    await minder.get(TH.BoxScope)
    const answer = minder.tryAt(TH.BoxScope)
    expect(answer).to.deep.include({ ok: true, act: 'gotvoid', val: null, dbhas: null, record: null, isTimely: true })
  })

  it("answers gotgone with null, and the tombstone as its dbhas", async () => {
    const { minder, receive } = await minderWorldOf(new MemoryVaultDB())
    const tombstone = TH.boxTombOf(TH.boxThingOf())
    receive(noticeOf(tombstone))
    expect(minder.tryAt(TH.BoxScope)).to.deep.include({ ok: true, act: 'gotgone', val: null, dbhas: tombstone })
  })

  it("answers gotlive for a box born again, its old tombstone left in the dead record", async () => {
    const { minder, receive } = await minderWorldOf(new MemoryVaultDB())
    const tombstone = TH.boxTombOf(TH.boxThingOf())
    const reborn    = TH.boxRebornOf(tombstone)
    receive(noticeOf(tombstone))
    receive(noticeOf(reborn))
    expect(minder.tryAt(TH.BoxScope)).to.deep.include({ ok: true, act: 'gotlive', val: reborn })
    expect(minder.deadAt(TH.BoxScope)).to.equal(tombstone)
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

  it("answers unexpected_error, not a storage refusal, for anything else its own code throws", () => {
    const minder = minderOf({}, fakeBankOf())
    minder.hello(sortedOf(new MemoryVaultDB()))
    const asking = vi.spyOn(SortedVaultDB.prototype, 'makeGetAsk').mockImplementationOnce(() => { throw new Error('ask broke') })
    const answer = minder.tryAt(TH.BoxScope)
    asking.mockRestore()
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
