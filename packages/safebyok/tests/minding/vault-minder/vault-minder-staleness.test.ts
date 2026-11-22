import { Errors } from 'safebyok-big/internals'
import { describe, expect, it, vi } from 'vitest'
import { MaxTimerMillis, MinderEventFormat } from '../../../src/shapes/shapes-minder'
import { MemoryVaultDB } from '../../../src/storage/memory-vault-db'
import * as TH from '../../test-helpers'
import { badnewsOf, listenerOf, minderWorldOf, bornOf, storedGateOf, storedBoxOf, noticeOf, revtokAt, toldOf } from './world'

describe("VaultMinder.isStaleAt", () => {
  it("is true before any get, false after, and true past staleTime", async () => {
    const { minder } = minderWorldOf(await bornOf(new MemoryVaultDB()))
    expect(minder.isStaleAt(TH.GateScope)).to.be.true
    await minder.get(TH.GateScope)
    expect(minder.isStaleAt(TH.GateScope)).to.be.false
    expect(minder.isStaleAt(TH.GateScope, { staleTime: 0 })).to.be.true
  })

  it("treats a staleTime given as undefined as the minder's own", async () => {
    const { minder } = minderWorldOf(await bornOf(new MemoryVaultDB()))
    await minder.get(TH.GateScope)
    expect(minder.isStaleAt(TH.GateScope, { staleTime: undefined })).to.be.false
  })

  it("accepts an ask or a record as its scope", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    await minder.get(TH.GateScope)
    expect([minder.isStaleAt(TH.GateScope), minder.isStaleAt(gate)]).to.deep.equal([false, false])
  })

  it("counts an item missing or behind a newer sparse record stale under a staleTime of Infinity, and a get under it fetches it", async () => {
    const vaultDB = new MemoryVaultDB()
    const box0    = await storedBoxOf(vaultDB)
    const { minder } = minderWorldOf(vaultDB)
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
    const { minder, gate1 } = await refusedGetWorldOf()
    expect(minder.at(TH.GateScope)).to.deep.equal(gate1)
    expect(minder.isStaleAt(TH.GateScope, { staleTime: Infinity })).to.be.true
  })

  it("fetches an item whose last get was refused, under a staleTime of Infinity", async () => {
    const { minder, vaultDB, gate1 } = await refusedGetWorldOf()
    vaultDB._cheat_things(TH.ThingBank).set(TH.GateScope.labelpath, gate1)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    await minder.get(TH.GateScope, { staleTime: Infinity })
    expect(asked.mock.calls).to.have.lengthOf(1)
    expect(minder.isStaleAt(TH.GateScope, { staleTime: Infinity })).to.be.false
  })

  it("accepts a staleTime up to MaxTimerMillis", async () => {
    const { minder } = minderWorldOf(await bornOf(new MemoryVaultDB()))
    await minder.get(TH.GateScope)
    expect(minder.isStaleAt(TH.GateScope, { staleTime: MaxTimerMillis })).to.be.false
  })

  const BadArgs = [
    [{ ...TH.GateScope, labelpath: 'Gate' }, {},                     "a labelpath that is no Thing's"],
    [{ ...TH.GateScope, banklabel: 'zz' }, {},                       "another bank's scope"],
    [TH.GateScope,                         { staleTime: -1 },        'a negative staleTime'],
    [TH.GateScope,                         { staleTime: 'never' },   'a staleTime of another word'],
    [TH.GateScope,                         { staleTime: 'static' },  "a staleTime of 'static', which a minder never takes"],
    [TH.GateScope,                         { staleTime: MaxTimerMillis + 1 }, 'a staleTime past MaxTimerMillis'],
  ] as const
  for (const [scoped, opts, blurb] of BadArgs) {
    it(`refuses bad_record for ${blurb}`, () => {
      const { minder } = minderWorldOf(new MemoryVaultDB())
      TH.expectSyncRefusal(() => minder.isStaleAt(scoped, opts as never), 'bad_record')
    })
  }
})

/** A minder whose get of the main gate was refused stale_read after it fetched `gate1`; the minder, its vaultDB, which still has the older gate, and `gate1`. */
async function refusedGetWorldOf() {
  const vaultDB = new MemoryVaultDB()
  const gate1   = await storedGateOf(vaultDB, 1)
  const { minder } = minderWorldOf(vaultDB)
  await minder.get(TH.GateScope)
  vaultDB._cheat_things(TH.ThingBank).set(TH.GateScope.labelpath, TH.gateThingOf())
  await TH.expectRefusal(minder.get(TH.GateScope, { staleTime: 0 }), 'stale_read')
  return { minder, vaultDB, gate1 }
}

/** A minder with the main gate's record and a listener, after the watch has notified the gate a second time; the minder, the record it had before, and the listener. */
async function renotifiedWorldOf() {
  const vaultDB = await bornOf(new MemoryVaultDB())
  const { minder } = minderWorldOf(vaultDB, { isRootHeard: false })
  const staleGet = { ...TH.getAskAt('box'), track: TH.GateStaleTrack }
  await TH.expectGood(vaultDB.tryGetThing(staleGet))
  const gate = minder.at(TH.GateScope)
  expect(gate).to.deep.equal(TH.gateThingOf())
  const listener = listenerOf()
  minder.listen(listener, MinderEventFormat)
  await TH.expectGood(vaultDB.tryGetThing(staleGet))
  return { minder, gate, listener }
}

describe("VaultMinder's watch", () => {
  it("caches each gate written", async () => {
    const vaultDB = new MemoryVaultDB()
    const { minder } = minderWorldOf(vaultDB)
    const gate = await storedGateOf(vaultDB, 0)
    await TH.eventually(() => revtokAt(minder) === gate.revtok)
    expect(minder.at(TH.GateScope)).to.deep.equal(gate)
  })

  it("caches the one Thing a notice carries, of any kind", () => {
    const { minder, receive } = minderWorldOf(new MemoryVaultDB())
    const [gate, box] = [TH.gateThingOf(), TH.boxThingOf()]
    receive(noticeOf(box))
    expect(minder.at(TH.BankScope)).to.be.undefined
    expect(minder.at(TH.GateScope)).to.be.undefined
    expect(minder.at(TH.BoxScope)).to.deep.equal(box)
    receive(noticeOf(gate))
    expect(minder.at(TH.GateScope)).to.deep.equal(gate)
  })

  it("still has the main gate's record when the watch notifies it again", async () => {
    const { minder, gate } = await renotifiedWorldOf()
    expect(minder.at(TH.GateScope)).to.eq(gate)
  })

  it("tells a listener each time the watch notifies the main gate", async () => {
    const { listener } = await renotifiedWorldOf()
    expect(toldOf(listener)).to.deep.equal([['gate', 'live']])
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
    expect(minder.at(TH.BoxScope)).to.deep.equal(box)
  })

  it("drops a whole record older than the item: the item keeps its time, and nothing is told", () => {
    vi.useFakeTimers({ now: 1000 })
    try {
      const { minder, receive } = minderWorldOf(new MemoryVaultDB())
      const gate0 = TH.gateThingOf()
      const gate1 = TH.nextGateOf(gate0)
      receive(noticeOf(gate1))
      const listener = listenerOf()
      minder.listen(listener, MinderEventFormat)
      vi.advanceTimersByTime(5000)
      receive(noticeOf(gate0))
      expect(minder.at(TH.GateScope)).to.eq(gate1)
      expect(minder.tryAt(TH.GateScope)).to.deep.include({ refreshedAt: 1000 })
      expect(listener.mock.calls).to.deep.equal([])
    } finally {
      vi.useRealTimers()
    }
  })

  it("lands a whole record at the item's revision: the item is fresh as of then, and success is told", () => {
    vi.useFakeTimers({ now: 1000 })
    try {
      const { minder, receive } = minderWorldOf(new MemoryVaultDB())
      const gate = TH.gateThingOf()
      receive(noticeOf(gate))
      const listener = listenerOf()
      minder.listen(listener, MinderEventFormat)
      vi.advanceTimersByTime(5000)
      receive(noticeOf(structuredClone(gate)))
      expect(minder.at(TH.GateScope)).to.eq(gate)
      expect(minder.tryAt(TH.GateScope)).to.deep.include({ refreshedAt: 6000 })
      expect(listener.mock.calls.map(([event]) => event.action?.type)).to.deep.equal(['success'])
    } finally {
      vi.useRealTimers()
    }
  })

  it("caches a newer record as it arrived", () => {
    const { minder, receive } = minderWorldOf(new MemoryVaultDB())
    const gate0 = TH.gateThingOf()
    receive(noticeOf(gate0))
    const gate1 = structuredClone(TH.nextGateOf(gate0))
    receive(noticeOf(gate1))
    expect(minder.at(TH.GateScope)).to.eq(gate1)
  })
})
