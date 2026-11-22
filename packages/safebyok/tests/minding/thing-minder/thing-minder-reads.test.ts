import * as TSQ from '@tanstack/query-core'
import { describe, expect, it, vi } from 'vitest'
import { type DeliverableThing, MinderEventFormat } from '../../../src/shapes/shapes-minder'
import { MemoryVaultDB } from '../../../src/storage/memory-vault-db'
import { Shell } from '../../../src/shapes/shapes-thing'
import { BoxChecks } from '../../../src/shapes/shapes-thingkinds'
import { Thing } from '../../../src/models/thing'
import * as TH from '../../test-helpers'
import { badnewsOf, LateVaultDB, DownVaultDB, minderWorldOf, bornOf, storedGateOf, storedBoxOf, noticeOf, revtokAt, listenerOf, toldOf } from './world'

describe("ThingMinder.get", () => {
  it("refuses bad_record for a scope of another bank", async () => {
    const { minder } = minderWorldOf(new MemoryVaultDB())
    await TH.expectRefusal(minder.get({ ...TH.GateScope, banklabel: 'zz' }), 'bad_record')
  })

  it("treats a staleTime given as undefined as the minder's own", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    await minder.get(TH.GateScope, { staleTime: undefined })
    await minder.get(TH.GateScope, { staleTime: undefined })
    expect(asked.mock.calls).to.have.lengthOf(1)
  })

  it("returns the record stored, and reads the cache after", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = await storedGateOf(vaultDB, 1)
    const { minder } = minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    expect(await minder.get(TH.GateScope)).to.deep.equal(gate)
    expect(await minder.get(TH.GateScope)).to.deep.equal(gate)
    expect(asked.mock.calls).to.have.lengthOf(1)
  })

  it("returns, for a box under the root box, its shell under the root box it caches, which the box's birth cites", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder } = minderWorldOf(vaultDB)
    const shell = await minder.get(TH.BoxScope)
    expect(Thing.isVoidSentinel(shell)).to.be.true
    expect(shell).to.deep.equal(Shell.of(TH.BoxScope, TH.rootBoxOf()))
    expect(shell).to.deep.include({ ...TH.BoxScope, label: 'openai', revseq: -1, am: 'x', lifepath: `${TH.Life0}/${Shell.VoidLifeseq}` })
    expect(BoxChecks.sealable.safeParse(shell).success).to.be.true
    const birth = TH.birthAskOf(TH.boxThingOf(), shell)
    await TH.expectGood(vaultDB.tryWriteThing(birth))
  })

  it("answers a get of an empty box with its shell in the bank's root box's life, though the root box has no item", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder } = minderWorldOf(vaultDB, { isRootHeard: false })
    expect(await minder.get(TH.BoxScope)).to.deep.equal(Shell.of(TH.BoxScope, TH.rootBoxOf()))
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

  it("caches a main gate the ask tracks stale only once its own notice arrives, never from the get of the bank", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate1   = await storedGateOf(vaultDB, 1)
    const { minder } = minderWorldOf(vaultDB)
    await TH.wakeupAtNextTick()
    expect(minder.at(TH.GateScope)).to.be.undefined
    expect(await minder.get(TH.BankScope)).to.have.property('labelpath', 'bank')
    await TH.eventually(() => revtokAt(minder) === gate1.revtok)
    expect(minder.at(TH.GateScope)).to.deep.equal(gate1)
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
    expect(await getting).to.deep.equal(gate1)
  })

  it("returns a birth that lands during the get over the get's void", async () => {
    const vaultDB = await bornOf(new LateVaultDB())
    const { minder } = minderWorldOf(vaultDB)
    const getting = minder.get(TH.BoxScope)
    await TH.eventually(() => vaultDB.isHolding)
    const box   = TH.boxThingOf()
    const shell = Shell.of(TH.BoxScope, TH.rootBoxOf())
    await TH.expectGood(vaultDB.tryWriteThing(TH.birthAskOf(box, shell)))
    await TH.eventually(() => minder.at(TH.BoxScope)?.revtok === box.revtok)
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
      const { minder } = minderWorldOf(vaultDB)
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
      expect(await minder.get(TH.GateScope)).to.deep.equal(gate)
    } finally { TSQ.onlineManager.setOnline(true) }
  })

  it("refuses a record the vaultDB answers of another Thing than asked, and caches nothing", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = minderWorldOf(vaultDB)
    const theirs = TH.boxThingOf('anthropic')
    vi.spyOn(vaultDB, 'tryGetThing').mockImplementation((ask) => Promise.resolve({ ok: true, act: 'gotlive', ask, world: null, val: theirs }))
    await TH.expectRefusal(minder.get(TH.BoxScope), 'unexpected_error')
    expect(minder.at(TH.BoxScope)).to.be.undefined
  })

  it("throws the vaultDB's refusal, without trying again", async () => {
    const vaultDB = await bornOf(new DownVaultDB())
    const { minder } = minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    await TH.expectRefusal(minder.get(TH.GateScope), 'storage_unavailable')
    expect(asked.mock.calls).to.have.lengthOf(1)
  })

})

describe("ThingMinder.tryGet", () => {
  it("resolves the record stored as a good outcome", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = await storedGateOf(vaultDB, 1)
    const { minder } = minderWorldOf(vaultDB)
    expect(await TH.expectGood(minder.tryGet(TH.GateScope))).to.deep.equal(gate)
  })

  it("resolves the vaultDB's refusal as a bad outcome", async () => {
    const { minder } = minderWorldOf(await bornOf(new DownVaultDB()))
    await TH.expectBad(minder.tryGet(TH.GateScope), 'storage_unavailable')
  })

  it("resolves a get after goodbye as a bad outcome", async () => {
    const { minder } = minderWorldOf(await bornOf(new MemoryVaultDB()))
    minder.goodbye()
    await TH.expectBad(minder.tryGet(TH.GateScope), 'disabled')
  })

  it("resolves a scope of another bank as a bad outcome", async () => {
    const { minder } = minderWorldOf(new MemoryVaultDB())
    await TH.expectBad(minder.tryGet({ ...TH.GateScope, banklabel: 'zz' }), 'bad_record')
  })
})

describe("ThingMinder.backgroundRefresh", () => {
  it("returns at once, and caches the record the vaultDB answers", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = await storedGateOf(vaultDB, 1)
    const { minder } = minderWorldOf(vaultDB)
    minder.backgroundRefresh(TH.GateScope)
    expect(minder.at(TH.GateScope)).to.be.undefined
    await TH.eventually(() => minder.at(TH.GateScope) !== undefined)
    expect(minder.at(TH.GateScope)).to.deep.equal(gate)
  })

  it("asks the vaultDB nothing while the item is timely", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    await minder.get(TH.GateScope)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    minder.backgroundRefresh(TH.GateScope)
    await TH.wakeupAtNextTick()
    expect(asked.mock.calls).to.have.lengthOf(0)
  })

  it("shares its fetch with a get made while it waits", async () => {
    const vaultDB = new LateVaultDB()
    const gate    = await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    minder.backgroundRefresh(TH.GateScope)
    const getting = minder.get(TH.GateScope)
    await TH.eventually(() => vaultDB.isHolding)
    vaultDB.release()
    expect(await getting).to.deep.equal(gate)
    expect(asked.mock.calls).to.have.lengthOf(1)
  })

  it("neither throws nor tells a storage refusal, which shows as lastErr in the next tryAt", async () => {
    const vaultDB = await bornOf(new DownVaultDB())
    const { bank, minder } = minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    minder.backgroundRefresh(TH.GateScope)
    await TH.eventually(() => asked.mock.calls.length === 1)
    await TH.wakeupAtNextTick()
    expect(badnewsOf(bank)).to.deep.equal([])
    expect(minder.tryAt(TH.GateScope)).to.have.nested.property('lastErr.refusalkind', 'storage_unavailable')
  })

  const RefusedArgs = [
    [{ ...TH.GateScope, userid: 'u2' }, {},                       'a scope of another bank'],
    [TH.GateScope,                      { ifStale: 'refresh' },   'an option it does not know'],
    [TH.GateScope,                      { staleTime: -1 },        'a negative staleTime'],
    [TH.GateScope,                      { staleTime: 'static' },  "a staleTime of 'static'"],
  ] as const
  for (const [scoped, opts, blurb] of RefusedArgs) {
    it(`neither throws nor asks the vaultDB anything for ${blurb}`, async () => {
      const vaultDB = await bornOf(new MemoryVaultDB())
      const { bank, minder } = minderWorldOf(vaultDB)
      const asked = vi.spyOn(vaultDB, 'tryGetThing')
      minder.backgroundRefresh(scoped, opts as never)
      await TH.wakeupAtNextTick()
      expect(asked.mock.calls).to.have.lengthOf(0)
      expect(badnewsOf(bank)).to.deep.equal([])
    })
  }
})

describe("ThingMinder.list", () => {
  it("lists the boxes under the root box, and caches each sparse and stale", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB)
    const { minder } = minderWorldOf(vaultDB)
    expect(await minder.list('box')).to.deep.equal([TH.BoxScope.labelpath])
    expect([minder.at(TH.BoxScope), minder.soonAt(TH.BoxScope)]).to.deep.equal([undefined, Thing.sparseOf(box)])
    expect(minder.isStaleAt(TH.BoxScope)).to.be.true
    expect(await minder.get(TH.BoxScope)).to.deep.equal(box)
  })

  it("leaves a whole box in the cache unchanged, and timely", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB)
    const { minder } = minderWorldOf(vaultDB)
    const got = await minder.get(TH.BoxScope)
    await minder.list('box')
    expect(minder.at(TH.BoxScope)).to.eq(got)
    expect(got).to.deep.equal(box)
    expect(minder.isStaleAt(TH.BoxScope)).to.be.false
  })

  it("leaves a box the cache has at an older revision stale, still showing the older record whole", async () => {
    const vaultDB = new MemoryVaultDB()
    const box0    = await storedBoxOf(vaultDB)
    const { minder } = minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    const box1 = TH.nextOf(box0)
    vaultDB._cheat_things(TH.ThingBank).set(TH.BoxScope.labelpath, box1)
    await minder.list('box')
    expect([minder.at(TH.BoxScope), minder.soonAt(TH.BoxScope)]).to.deep.equal([box0, Thing.sparseOf(box1)])
    expect(minder.isStaleAt(TH.BoxScope)).to.be.true
    expect(await minder.get(TH.BoxScope)).to.deep.equal(box1)
  })

  it("caches a box listed as a tombstone in its item, and answers it from the cache", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    const tombstone = TH.boxTombOf(TH.boxThingOf())
    vaultDB._cheat_things(TH.ThingBank).set(TH.BoxScope.labelpath, tombstone)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    await minder.list('box')
    expect(minder.at(TH.BoxScope)).to.deep.equal(Thing.sparseOf(tombstone))
    expect(minder.tryAt(TH.BoxScope)).to.deep.include({ act: 'gotgone', isTimely: true })
    expect(await minder.get(TH.BoxScope)).to.deep.equal(Thing.sparseOf(tombstone))
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
    const { minder, receive } = minderWorldOf(vaultDB)
    receive(noticeOf(box0))
    const heard = listenerOf()
    minder.listen(heard, MinderEventFormat)
    await minder.list('box')
    expect(toldOf(heard)).to.deep.equal([['soon', 'box/anthropic', 0], ['listing'], ['soon', 'box/openai', box1.revseq], ['box/openai', 'behind'], ['listing']])
  })

  it("leaves out a box stored damaged, and tells the bank's tellBadNews its labelpath", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder, bank } = minderWorldOf(vaultDB)
    await minder.list('box')
    expect(badnewsOf(bank)).to.deep.equal([])
    vaultDB._cheat_things(TH.ThingBank).set('box/bad', { ...TH.boxThingOf('bad'), whisper_sealed: {} })
    expect(await minder.list('box')).to.deep.equal([TH.BoxScope.labelpath])
    expect(minder.listingAt(TH.RootScope)).to.deep.equal([TH.BoxScope.labelpath])
    expect(badnewsOf(bank)).to.deep.equal(['damaged_row'])
    expect(bank.tellBadNews.mock.calls[0]?.[0][0]).to.have.nested.property('meta.labelpaths').that.deep.equals(['box/bad'])
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

describe("ThingMinder.tryList", () => {
  it("resolves the labelpaths listed as its good outcome", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = minderWorldOf(vaultDB)
    expect(await minder.tryList('box')).to.deep.equal({ ok: true, val: [TH.BoxScope.labelpath] })
    expect(minder.listingAt(TH.RootScope)).to.deep.equal([TH.BoxScope.labelpath])
  })

  it("answers the vaultDB's refusal", async () => {
    const { minder } = minderWorldOf(new MemoryVaultDB())
    await TH.expectBad(minder.tryList('box'), 'storage_issue')
  })

  it("answers a labelpath that is no Thing's as a refusal, without asking the vaultDB", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder } = minderWorldOf(vaultDB)
    const listed = vi.spyOn(vaultDB, 'tryListThings')
    await TH.expectBad(minder.tryList('vault'), 'bad_record')
    expect(listed.mock.calls).to.have.lengthOf(0)
  })

  it("answers a list after goodbye as a refusal", async () => {
    const { minder } = minderWorldOf(await bornOf(new MemoryVaultDB()))
    minder.goodbye()
    await TH.expectBad(minder.tryList('box'), 'disabled')
  })
})
