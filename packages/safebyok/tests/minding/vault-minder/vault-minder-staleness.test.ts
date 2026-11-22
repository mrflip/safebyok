import { Errors } from 'safebyok-big/internals'
import { describe, expect, it, vi } from 'vitest'
import { MaxTimerMillis, MinderEventFormat } from '../../../src/shapes/shapes-minder'
import { MemoryVaultDB } from '../../../src/storage/memory-vault-db'
import * as TH from '../../test-helpers'
import { badnewsOf, listenerOf, minderWorldOf, bornOf, storedBoxOf, noticeOf, revtokAt, toldOf } from './world'

describe("VaultMinder.isStaleAt", () => {
  it("is true before any get, false after, and true past staleTime", async () => {
    const { minder } = await minderWorldOf(await bornOf(new MemoryVaultDB()))
    expect(minder.isStaleAt(TH.BoxScope)).to.be.true
    await minder.get(TH.BoxScope)
    expect(minder.isStaleAt(TH.BoxScope)).to.be.false
    expect(minder.isStaleAt(TH.BoxScope, { staleTime: 0 })).to.be.true
  })

  it("treats a staleTime given as undefined as the minder's own", async () => {
    const { minder } = await minderWorldOf(await bornOf(new MemoryVaultDB()))
    await minder.get(TH.BoxScope)
    expect(minder.isStaleAt(TH.BoxScope, { staleTime: undefined })).to.be.false
  })

  it("accepts an ask or a record as its scope", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB, 0)
    const { minder } = await minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    expect([minder.isStaleAt(TH.BoxScope), minder.isStaleAt(box)]).to.deep.equal([false, false])
  })

  it("counts an item missing or behind a newer sparse record stale under a staleTime of Infinity, and a get under it fetches it", async () => {
    const vaultDB = new MemoryVaultDB()
    const box0    = await storedBoxOf(vaultDB)
    const { minder } = await minderWorldOf(vaultDB)
    await minder.list('box')
    expect(minder.isStaleAt(TH.BoxScope, { staleTime: Infinity })).to.be.true
    await minder.get(TH.BoxScope)
    const box1 = TH.nextOf(box0)
    vaultDB._cheat_things(TH.ThingBank).set(TH.BoxScope.labelpath, box1)
    await minder.list('box')
    expect(minder.isStaleAt(TH.BoxScope, { staleTime: Infinity })).to.be.true
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    expect(await minder.get(TH.BoxScope, { staleTime: Infinity })).to.deep.equal(box1)
    expect(asked.mock.calls).to.have.lengthOf(1)
    expect(minder.isStaleAt(TH.BoxScope, { staleTime: Infinity })).to.be.false
    const box2 = TH.nextOf(box1)
    vaultDB._cheat_things(TH.ThingBank).set(TH.BoxScope.labelpath, box2)
    await minder.list('box')
    expect(await minder.get(TH.BoxScope, { staleTime: Infinity })).to.deep.equal(box2)
    expect(asked.mock.calls).to.have.lengthOf(2)
  })

  it("counts an item whose last get was refused stale under a staleTime of Infinity", async () => {
    const { minder, box1 } = await refusedGetWorldOf()
    expect(minder.at(TH.BoxScope)).to.deep.equal(box1)
    expect(minder.isStaleAt(TH.BoxScope, { staleTime: Infinity })).to.be.true
  })

  it("fetches an item whose last get was refused, under a staleTime of Infinity", async () => {
    const { minder, vaultDB, box1 } = await refusedGetWorldOf()
    vaultDB._cheat_things(TH.ThingBank).set(TH.BoxScope.labelpath, box1)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    await minder.get(TH.BoxScope, { staleTime: Infinity })
    expect(asked.mock.calls).to.have.lengthOf(1)
    expect(minder.isStaleAt(TH.BoxScope, { staleTime: Infinity })).to.be.false
  })

  it("accepts a staleTime up to MaxTimerMillis", async () => {
    const { minder } = await minderWorldOf(await bornOf(new MemoryVaultDB()))
    await minder.get(TH.BoxScope)
    expect(minder.isStaleAt(TH.BoxScope, { staleTime: MaxTimerMillis })).to.be.false
  })

  const BadArgs = [
    [{ ...TH.BoxScope, labelpath: 'Box/openai' }, {},                "a labelpath that is no Thing's"],
    [{ ...TH.BoxScope, banklabel: 'zz' }, {},                        "another bank's scope"],
    [TH.BoxScope,                         { staleTime: -1 },        'a negative staleTime'],
    [TH.BoxScope,                         { staleTime: 'never' },   'a staleTime of another word'],
    [TH.BoxScope,                         { staleTime: 'static' },  "a staleTime of 'static', which a minder never takes"],
    [TH.BoxScope,                         { staleTime: MaxTimerMillis + 1 }, 'a staleTime past MaxTimerMillis'],
  ] as const
  for (const [scoped, opts, blurb] of BadArgs) {
    it(`refuses bad_record for ${blurb}`, async () => {
      const { minder } = await minderWorldOf(new MemoryVaultDB())
      TH.expectSyncRefusal(() => minder.isStaleAt(scoped, opts as never), 'bad_record')
    })
  }
})

/** A minder whose get of the box at `TH.BoxScope` was refused stale_read after it fetched `box1`; the minder, its vaultDB, which still has the older box, and `box1`. */
async function refusedGetWorldOf() {
  const vaultDB = new MemoryVaultDB()
  const box1    = await storedBoxOf(vaultDB, 1)
  const { minder } = await minderWorldOf(vaultDB)
  await minder.get(TH.BoxScope)
  vaultDB._cheat_things(TH.ThingBank).set(TH.BoxScope.labelpath, TH.boxThingOf())
  await TH.expectRefusal(minder.get(TH.BoxScope, { staleTime: 0 }), 'stale_read')
  return { minder, vaultDB, box1 }
}

/** A minder after the watch has notified the main gate a second time, and a listener on it from before the second. */
async function renotifiedWorldOf() {
  const vaultDB = await bornOf(new MemoryVaultDB())
  const { minder } = await minderWorldOf(vaultDB)
  const staleGet = { ...TH.getAskAt('box'), track: TH.GateStaleTrack }
  await TH.expectGood<unknown>(vaultDB.tryGetThing(staleGet))
  const listener = listenerOf()
  minder.listen(listener, MinderEventFormat)
  await TH.expectGood<unknown>(vaultDB.tryGetThing(staleGet))
  return { minder, listener }
}

describe("VaultMinder's watch", () => {
  it("caches each box written", async () => {
    const vaultDB = new MemoryVaultDB()
    const { minder } = await minderWorldOf(vaultDB)
    const box = await storedBoxOf(vaultDB, 0)
    await TH.eventually(() => revtokAt(minder) === box.revtok)
    expect(minder.at(TH.BoxScope)).to.deep.equal(box)
  })

  it("caches the box a notice carries, and drops the main gate one carries", async () => {
    const { minder, bankMinder, receive } = await minderWorldOf(new MemoryVaultDB())
    const [gate, box] = [TH.nextGateOf(TH.gateThingOf()), TH.boxThingOf()]
    receive(noticeOf(box))
    expect(minder.at(TH.BoxScope)).to.deep.equal(box)
    receive(noticeOf(gate))
    expect(bankMinder.worldAt()?.gate).to.deep.equal(TH.gateThingOf())
    expect(minder.at(TH.GateScope)).to.be.undefined
  })

  it("tells a listener nothing when the watch notifies the main gate", async () => {
    const { listener } = await renotifiedWorldOf()
    expect(toldOf(listener)).to.deep.equal([])
  })

  it("skips a Thing while the minder is not minding", async () => {
    const { minder, receive } = await minderWorldOf(new MemoryVaultDB())
    minder.goodbye()
    receive(noticeOf(TH.boxThingOf()))
    expect(minder.at(TH.BoxScope)).to.be.undefined
  })

  it("tells its trouble to the bank's onBadNews", async () => {
    const vaultDB  = new MemoryVaultDB()
    const watching = vi.spyOn(vaultDB, 'watch')
    const { bank } = await minderWorldOf(vaultDB)
    watching.mock.calls[0]?.[2](new Errors.VaultError('damaged_row', 'a row failed its checks'))
    expect(badnewsOf(bank)).to.deep.equal(['damaged_row'])
  })

  it("puts a record of a later life after one of a higher revseq", async () => {
    const { minder, receive } = await minderWorldOf(new MemoryVaultDB())
    const oldLife = TH.boxThingOf('openai', { lifeseq: '0000000000', lifepath: '0000000000/0000000000', revtok: TH.revtokOf('old'), revseq: 3 })
    const newLife = TH.boxThingOf('openai', { lifeseq: '0000000002', lifepath: '0000000000/0000000002', revtok: TH.revtokOf('new'), revseq: 0 })
    receive(noticeOf(oldLife))
    receive(noticeOf(newLife))
    expect(revtokAt(minder)).to.eq(TH.revtokOf('new'))
    receive(noticeOf(oldLife))
    expect(revtokAt(minder)).to.eq(TH.revtokOf('new'))
  })

  it("puts any record after the shell", async () => {
    const { minder, receive } = await minderWorldOf(await bornOf(new MemoryVaultDB()))
    await minder.get(TH.BoxScope)
    const box = TH.boxThingOf()
    receive(noticeOf(box))
    expect(minder.at(TH.BoxScope)).to.deep.equal(box)
  })

  it("drops a whole record older than the item: the item keeps its time, and nothing is told", async () => {
    vi.useFakeTimers({ now: 1000 })
    try {
      const { minder, receive } = await minderWorldOf(new MemoryVaultDB())
      const box0 = TH.boxThingOf()
      const box1 = TH.nextOf(box0)
      receive(noticeOf(box1))
      const listener = listenerOf()
      minder.listen(listener, MinderEventFormat)
      vi.advanceTimersByTime(5000)
      receive(noticeOf(box0))
      expect(minder.at(TH.BoxScope)).to.eq(box1)
      expect(minder.tryAt(TH.BoxScope)).to.deep.include({ refreshedAt: 1000 })
      expect(listener.mock.calls).to.deep.equal([])
    } finally {
      vi.useRealTimers()
    }
  })

  it("lands a whole record at the item's revision: the item is fresh as of then, and success is told", async () => {
    vi.useFakeTimers({ now: 1000 })
    try {
      const { minder, receive } = await minderWorldOf(new MemoryVaultDB())
      const box  = TH.boxThingOf()
      receive(noticeOf(box))
      const listener = listenerOf()
      minder.listen(listener, MinderEventFormat)
      vi.advanceTimersByTime(5000)
      receive(noticeOf(structuredClone(box)))
      expect(minder.at(TH.BoxScope)).to.eq(box)
      expect(minder.tryAt(TH.BoxScope)).to.deep.include({ refreshedAt: 6000 })
      expect(listener.mock.calls.map(([event]) => event.action?.type)).to.deep.equal(['success'])
    } finally {
      vi.useRealTimers()
    }
  })

  it("caches a newer record as it arrived", async () => {
    const { minder, receive } = await minderWorldOf(new MemoryVaultDB())
    const box0 = TH.boxThingOf()
    receive(noticeOf(box0))
    const box1 = structuredClone(TH.nextOf(box0))
    receive(noticeOf(box1))
    expect(minder.at(TH.BoxScope)).to.eq(box1)
  })
})
