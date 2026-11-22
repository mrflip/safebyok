import * as TSQ from '@tanstack/query-core'
import { describe, expect, it, vi } from 'vitest'
import { type DeliverableThing, MinderEventFormat } from '../../../src/shapes/shapes-minder'
import { MemoryVaultDB } from '../../../src/storage/memory-vault-db'
import { Shell } from '../../../src/shapes/shapes-thing'
import { Thing } from '../../../src/models/thing'
import * as TH from '../../test-helpers'
import { badnewsOf, LateVaultDB, DownVaultDB, minderWorldOf, bornOf, storedBoxOf, noticeOf, revtokAt, listenerOf, toldOf, labelpathsOf } from './world'

describe("VaultMinder.get", () => {
  it("refuses bad_record for a scope of another bank", async () => {
    const { minder } = await minderWorldOf(new MemoryVaultDB())
    await TH.expectRefusal(minder.get({ ...TH.BoxScope, banklabel: 'zz' }), 'bad_record')
  })

  it("treats a staleTime given as undefined as the minder's own", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB, 0)
    const { minder } = await minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    await minder.get(TH.BoxScope, { staleTime: undefined })
    await minder.get(TH.BoxScope, { staleTime: undefined })
    expect(asked.mock.calls).to.have.lengthOf(1)
  })

  it("returns the record stored, and reads the cache after", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB, 1)
    const { minder } = await minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    expect(await minder.get(TH.BoxScope)).to.deep.equal(box)
    expect(await minder.get(TH.BoxScope)).to.deep.equal(box)
    expect(asked.mock.calls).to.have.lengthOf(1)
  })

  it("returns null for a box not stored, with no tombstone", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder } = await minderWorldOf(vaultDB)
    expect(await minder.get(TH.BoxScope)).to.be.null
    expect(minder.at(TH.BoxScope)).to.be.null
    expect(minder.deadAt(TH.BoxScope)).to.be.undefined
  })

  it("returns null for a deleted box, its tombstone cached by the time the get resolves", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const tombstone = TH.boxTombOf(TH.boxThingOf())
    vaultDB._cheat_things(TH.ThingBank).set(TH.BoxScope.labelpath, tombstone)
    const { minder } = await minderWorldOf(vaultDB)
    expect(await minder.get(TH.BoxScope)).to.be.null
    expect(minder.deadAt(TH.BoxScope)).to.deep.equal(tombstone)
    expect(minder.tryAt(TH.BoxScope)).to.deep.include({ act: 'gotgone', val: null, dbhas: tombstone })
  })

  it("returns null for a box not stored while its BankMinder has no world of the bank", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder } = await minderWorldOf(vaultDB, { isWorldHeard: false })
    expect(await minder.get(TH.BoxScope)).to.be.null
  })

  it("asks the vaultDB once for two gets under way together", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB, 0)
    const { minder } = await minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    const [first, second] = await Promise.all([minder.get(TH.BoxScope), minder.get(TH.BoxScope)])
    expect(first).to.deep.equal(second)
    expect(asked.mock.calls).to.have.lengthOf(1)
  })

  it("asks the vaultDB again once the record is older than staleTime", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB, 0)
    const { minder } = await minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    await minder.get(TH.BoxScope)
    await minder.get(TH.BoxScope, { staleTime: 0 })
    expect(asked.mock.calls).to.have.lengthOf(2)
  })

  it("returns a notice that lands during the get over the get's older answer", async () => {
    const vaultDB = new LateVaultDB()
    const box0   = await storedBoxOf(vaultDB, 0)
    const { minder } = await minderWorldOf(vaultDB)
    const getting = minder.get(TH.BoxScope)
    await TH.eventually(() => vaultDB.isHolding)
    const box1 = TH.nextOf(box0)
    await TH.expectGood(vaultDB.tryWriteThing(TH.replaceAskOf(box0, box1)))
    await TH.eventually(() => revtokAt(minder) === box1.revtok)
    vaultDB.release()
    expect(await getting).to.deep.equal(box1)
  })

  it("returns a birth that lands during the get over the get's void", async () => {
    const vaultDB = await bornOf(new LateVaultDB())
    const { minder } = await minderWorldOf(vaultDB)
    const getting = minder.get(TH.BoxScope)
    await TH.eventually(() => vaultDB.isHolding)
    const box   = TH.boxThingOf()
    const shell = Shell.of(TH.BoxScope, TH.rootBoxOf())
    await TH.expectGood(vaultDB.tryWriteThing(TH.birthAskOf(box, shell)))
    await TH.eventually(() => TH.itemRevtokOf(minder.at(TH.BoxScope)) === box.revtok)
    vaultDB.release()
    expect(await getting).to.deep.equal(box)
  })

  // A box, which no ask tracks: a tracked Thing stored is never missing (notes/wontfix.md).
  const BackwardCases = [
    [(vaultDB: MemoryVaultDB, box0: DeliverableThing) => { vaultDB._cheat_things(TH.ThingBank).set(TH.BoxScope.labelpath, box0) }, 'an older revision'],
    [(vaultDB: MemoryVaultDB) => { vaultDB._cheat_things(TH.ThingBank).delete(TH.BoxScope.labelpath) },                            'nothing stored'],
  ] as const
  for (const [goBack, blurb] of BackwardCases) {
    it(`refuses 'stale_read' a get answered with ${blurb}, behind the record cached before it, and leaves that record untimely`, async () => {
      const vaultDB = new MemoryVaultDB()
      const box0    = await storedBoxOf(vaultDB)
      const box1    = TH.nextOf(box0)
      await TH.expectGood(vaultDB.tryWriteThing(TH.replaceAskOf(box0, box1)))
      const { minder } = await minderWorldOf(vaultDB)
      await minder.get(TH.BoxScope)
      goBack(vaultDB, box0)
      await TH.expectRefusal(minder.get(TH.BoxScope, { staleTime: 0 }), 'stale_read')
      expect(minder.at(TH.BoxScope)).to.deep.equal(box1)
      expect(minder.tryAt(TH.BoxScope)).to.deep.include({ act: 'untimely', isTimely: false })
      expect(minder.tryAt(TH.BoxScope)).to.have.nested.property('lastErr.refusalkind', 'stale_read')
      const asked = vi.spyOn(vaultDB, 'tryGetThing')
      await TH.expectRefusal(minder.get(TH.BoxScope), 'stale_read')
      expect(asked.mock.calls).to.have.lengthOf(1)
    })
  }

  it("refuses 'stale_read' a get answered with null for a tombstone older than the record cached, which lands nowhere", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const tombstone = TH.boxTombOf(TH.boxThingOf())
    const reborn    = TH.boxRebornOf(tombstone)
    vaultDB._cheat_things(TH.ThingBank).set(TH.BoxScope.labelpath, reborn)
    const { minder } = await minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    vaultDB._cheat_things(TH.ThingBank).set(TH.BoxScope.labelpath, tombstone)
    await TH.expectRefusal(minder.get(TH.BoxScope, { staleTime: 0 }), 'stale_read')
    expect(minder.at(TH.BoxScope)).to.deep.equal(reborn)
    expect(minder.deadAt(TH.BoxScope)).to.be.undefined
  })

  it("makes a notice of a newer record timely again after a stale read", async () => {
    const vaultDB = new MemoryVaultDB()
    const box1   = await storedBoxOf(vaultDB, 1)
    const { minder, receive } = await minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    vaultDB._cheat_things(TH.ThingBank).set(TH.BoxScope.labelpath, TH.boxThingOf())
    await TH.expectRefusal(minder.get(TH.BoxScope, { staleTime: 0 }), 'stale_read')
    const box2 = TH.nextOf(box1)
    receive(noticeOf(box2))
    expect(minder.tryAt(TH.BoxScope)).to.deep.include({ act: 'gotlive', val: box2, isTimely: true })
  })

  it("asks the vaultDB while the browser reports itself offline", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB, 0)
    const { minder } = await minderWorldOf(vaultDB)
    TSQ.onlineManager.setOnline(false)
    try {
      expect(await minder.get(TH.BoxScope)).to.deep.equal(box)
    } finally { TSQ.onlineManager.setOnline(true) }
  })

  it("refuses a record the vaultDB answers of another Thing than asked, and caches nothing", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = await minderWorldOf(vaultDB)
    const theirs = TH.boxThingOf('anthropic')
    vi.spyOn(vaultDB, 'tryGetThing').mockImplementation((ask) => Promise.resolve({ ok: true, act: 'gotlive', ask, world: null, val: theirs }))
    await TH.expectRefusal(minder.get(TH.BoxScope), 'unexpected_error')
    expect(minder.at(TH.BoxScope)).to.be.undefined
  })

  it("throws the vaultDB's refusal, without trying again", async () => {
    const vaultDB = await bornOf(new DownVaultDB())
    const { minder } = await minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    await TH.expectRefusal(minder.get(TH.BoxScope), 'storage_unavailable')
    expect(asked.mock.calls).to.have.lengthOf(1)
  })

})

describe("VaultMinder.tryGet", () => {
  it("resolves the record stored as a good outcome", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB, 1)
    const { minder } = await minderWorldOf(vaultDB)
    expect(await TH.expectGood(minder.tryGet(TH.BoxScope))).to.deep.equal(box)
  })

  it("resolves the vaultDB's refusal as a bad outcome", async () => {
    const { minder } = await minderWorldOf(await bornOf(new DownVaultDB()))
    await TH.expectBad(minder.tryGet(TH.BoxScope), 'storage_unavailable')
  })

  it("resolves a get after goodbye as a bad outcome", async () => {
    const { minder } = await minderWorldOf(await bornOf(new MemoryVaultDB()))
    minder.goodbye()
    await TH.expectBad(minder.tryGet(TH.BoxScope), 'disabled')
  })

  it("resolves a scope of another bank as a bad outcome", async () => {
    const { minder } = await minderWorldOf(new MemoryVaultDB())
    await TH.expectBad(minder.tryGet({ ...TH.BoxScope, banklabel: 'zz' }), 'bad_record')
  })
})

describe("VaultMinder.backgroundRefresh", () => {
  it("returns at once, and caches the record the vaultDB answers", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB, 1)
    const { minder } = await minderWorldOf(vaultDB)
    minder.backgroundRefresh(TH.BoxScope)
    expect(minder.at(TH.BoxScope)).to.be.undefined
    await TH.eventually(() => minder.at(TH.BoxScope) !== undefined)
    expect(minder.at(TH.BoxScope)).to.deep.equal(box)
  })

  it("asks the vaultDB nothing while the item is timely", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB, 0)
    const { minder } = await minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    minder.backgroundRefresh(TH.BoxScope)
    await TH.wakeupAtNextTick()
    expect(asked.mock.calls).to.have.lengthOf(0)
  })

  it("shares its fetch with a get made while it waits", async () => {
    const vaultDB = new LateVaultDB()
    const box     = await storedBoxOf(vaultDB, 0)
    const { minder } = await minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    minder.backgroundRefresh(TH.BoxScope)
    const getting = minder.get(TH.BoxScope)
    await TH.eventually(() => vaultDB.isHolding)
    vaultDB.release()
    expect(await getting).to.deep.equal(box)
    expect(asked.mock.calls).to.have.lengthOf(1)
  })

  it("neither throws nor tells a storage refusal, which shows as lastErr in the next tryAt", async () => {
    const vaultDB = await bornOf(new DownVaultDB())
    const { bank, minder } = await minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    minder.backgroundRefresh(TH.BoxScope)
    await TH.eventually(() => asked.mock.calls.length === 1)
    await TH.wakeupAtNextTick()
    expect(badnewsOf(bank)).to.deep.equal([])
    expect(minder.tryAt(TH.BoxScope)).to.have.nested.property('lastErr.refusalkind', 'storage_unavailable')
  })

  const RefusedArgs = [
    [{ ...TH.BoxScope, userid: 'u2' }, {},                       'a scope of another bank'],
    [TH.BoxScope,                      { ifStale: 'refresh' },   'an option it does not know'],
    [TH.BoxScope,                      { staleTime: -1 },        'a negative staleTime'],
    [TH.BoxScope,                      { staleTime: 'static' },  "a staleTime of 'static'"],
  ] as const
  for (const [scoped, opts, blurb] of RefusedArgs) {
    it(`neither throws nor asks the vaultDB anything for ${blurb}`, async () => {
      const vaultDB = await bornOf(new MemoryVaultDB())
      const { bank, minder } = await minderWorldOf(vaultDB)
      const asked = vi.spyOn(vaultDB, 'tryGetThing')
      minder.backgroundRefresh(scoped, opts as never)
      await TH.wakeupAtNextTick()
      expect(asked.mock.calls).to.have.lengthOf(0)
      expect(badnewsOf(bank)).to.deep.equal([])
    })
  }
})

describe("VaultMinder.list", () => {
  it("lists the boxes under the root box, and caches each sparse and stale", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB)
    const { minder } = await minderWorldOf(vaultDB)
    expect(labelpathsOf(await minder.list('box'))).to.deep.equal([TH.BoxScope.labelpath])
    expect([minder.at(TH.BoxScope), minder.soonAt(TH.BoxScope)]).to.deep.equal([undefined, Thing.sparseOf(box)])
    expect(minder.isStaleAt(TH.BoxScope)).to.be.true
    expect(await minder.get(TH.BoxScope)).to.deep.equal(box)
  })

  it("leaves a whole box in the cache unchanged, and timely", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB)
    const { minder } = await minderWorldOf(vaultDB)
    const got = await minder.get(TH.BoxScope)
    await minder.list('box')
    expect(minder.at(TH.BoxScope)).to.eq(got)
    expect(got).to.deep.equal(box)
    expect(minder.isStaleAt(TH.BoxScope)).to.be.false
  })

  it("leaves a box the cache has at an older revision stale, still showing the older record whole", async () => {
    const vaultDB = new MemoryVaultDB()
    const box0    = await storedBoxOf(vaultDB)
    const { minder } = await minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    const box1 = TH.nextOf(box0)
    vaultDB._cheat_things(TH.ThingBank).set(TH.BoxScope.labelpath, box1)
    await minder.list('box')
    expect([minder.at(TH.BoxScope), minder.soonAt(TH.BoxScope)]).to.deep.equal([box0, Thing.sparseOf(box1)])
    expect(minder.isStaleAt(TH.BoxScope)).to.be.true
    expect(await minder.get(TH.BoxScope)).to.deep.equal(box1)
  })

  it("caches a box listed as a tombstone in its dead entry and null in its item, and answers it from the cache", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = await minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    const tombstone = TH.boxTombOf(TH.boxThingOf())
    vaultDB._cheat_things(TH.ThingBank).set(TH.BoxScope.labelpath, tombstone)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    await minder.list('box')
    expect(minder.at(TH.BoxScope)).to.be.null
    expect(minder.deadAt(TH.BoxScope)).to.deep.equal(Thing.sparseOf(tombstone))
    expect(minder.tryAt(TH.BoxScope)).to.deep.include({ act: 'gotgone', isTimely: true, dbhas: Thing.sparseOf(tombstone) })
    expect(await minder.get(TH.BoxScope)).to.be.null
    expect(asked.mock.calls).to.have.lengthOf(0)
  })

  it("tells a listener of a listed box only its soon, and then its item falling behind", async () => {
    const vaultDB = new MemoryVaultDB()
    const box0    = await storedBoxOf(vaultDB)
    const box1    = TH.nextOf(box0)
    await TH.expectGood(vaultDB.tryWriteThing(TH.replaceAskOf(box0, box1)))
    const otherShell = Shell.of({ ...TH.ThingBank, labelpath: 'box/anthropic' }, TH.rootBoxOf())
    const otherBirth = TH.birthAskOf(TH.boxThingOf('anthropic'), otherShell)
    await TH.expectGood(vaultDB.tryWriteThing(otherBirth))
    const { minder, receive } = await minderWorldOf(vaultDB)
    receive(noticeOf(box0))
    const heard = listenerOf()
    minder.listen(heard, MinderEventFormat)
    await minder.list('box')
    expect(toldOf(heard)).to.deep.equal([['soon', 'box/anthropic', 0], ['listing'], ['soon', 'box/openai', box1.revseq], ['box/openai', 'behind'], ['listing']])
  })

  it("leaves out a box stored damaged, and tells the bank's tellBadNews its labelpath", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder, bank } = await minderWorldOf(vaultDB)
    await minder.list('box')
    expect(badnewsOf(bank)).to.deep.equal([])
    vaultDB._cheat_things(TH.ThingBank).set('box/bad', { ...TH.boxThingOf('bad'), whisper_sealed: {} })
    expect(labelpathsOf(await minder.list('box'))).to.deep.equal([TH.BoxScope.labelpath])
    expect(labelpathsOf(minder.listingAt(TH.RootScope))).to.deep.equal([TH.BoxScope.labelpath])
    expect(badnewsOf(bank)).to.deep.equal(['damaged_row'])
    expect(bank.tellBadNews.mock.calls[0]?.[0][0]).to.have.nested.property('meta.labelpaths').that.deep.equals(['box/bad'])
  })

  it("lists nothing under a root box with no boxes under it", async () => {
    const { minder } = await minderWorldOf(await bornOf(new MemoryVaultDB()))
    expect(labelpathsOf(await minder.list('box'))).to.deep.equal([])
  })

  it("sends the bank's list ask, which tracks the roots, and refuses where the bank is not stored", async () => {
    const { minder } = await minderWorldOf(new MemoryVaultDB())
    await TH.expectRefusal(minder.list('box'), 'storage_issue')
  })

  it("sends the bank's list ask for the labelpath it is given", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder, bank } = await minderWorldOf(vaultDB)
    const listed = vi.spyOn(vaultDB, 'tryListThings')
    expect(labelpathsOf(await minder.list('box/openai'))).to.deep.equal([])
    expect(listed.mock.calls).to.deep.equal([[bank.makeListAsk({ labelpath: 'box/openai', ifAbsent: 'nil' })]])
  })

  it("refuses bad_record for a labelpath that is no Thing's", async () => {
    const { minder } = await minderWorldOf(await bornOf(new MemoryVaultDB()))
    await TH.expectRefusal(minder.list('vault'), 'bad_record')
  })
})

describe("VaultMinder.tryList", () => {
  it("resolves the Kids value listed as its good outcome", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = await minderWorldOf(vaultDB)
    const outcome = await minder.tryList('box')
    expect(outcome).to.deep.equal({ ok: true, val: minder.listingAt(TH.RootScope) })
    expect(labelpathsOf(minder.listingAt(TH.RootScope))).to.deep.equal([TH.BoxScope.labelpath])
  })

  it("answers the vaultDB's refusal", async () => {
    const { minder } = await minderWorldOf(new MemoryVaultDB())
    await TH.expectBad(minder.tryList('box'), 'storage_issue')
  })

  it("answers a labelpath that is no Thing's as a refusal, without asking the vaultDB", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder } = await minderWorldOf(vaultDB)
    const listed = vi.spyOn(vaultDB, 'tryListThings')
    await TH.expectBad(minder.tryList('vault'), 'bad_record')
    expect(listed.mock.calls).to.have.lengthOf(0)
  })

  it("answers a list after goodbye as a refusal", async () => {
    const { minder } = await minderWorldOf(await bornOf(new MemoryVaultDB()))
    minder.goodbye()
    await TH.expectBad(minder.tryList('box'), 'disabled')
  })
})
