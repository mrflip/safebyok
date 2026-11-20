import { Errors } from 'safebyok-big/internals'
import { describe, expect, it, vi } from 'vitest'
import { MaxTimerMillis } from '../../../src/shapes/shapes-minder'
import { carOf } from '../../../src/minding/thing-car'
import { MemoryVaultDB } from '../../../src/storage/memory-vault-db'
import * as TH from '../../test-helpers'
import { badnewsOf, listenerOf, minderWorldOf, bornOf, storedGateOf, storedBoxOf, noticeOf, revtokAt, toldOf } from './world'

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

  it("counts a bare or bhnd car stale under a staleTime of Infinity or 'static', and a get under Infinity fetches it", async () => {
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
    expect(minder.at(TH.BoxScope)).to.have.property('liveness', 'bhnd')
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

  it("caches the one Thing a notice carries, of any kind", () => {
    const { minder, receive } = minderWorldOf(new MemoryVaultDB())
    const [gate, box] = [TH.gateThingOf(), TH.boxThingOf()]
    receive(noticeOf(box))
    expect(minder.at(TH.BankScope)).to.be.undefined
    expect(minder.at(TH.GateScope)).to.be.undefined
    expect(minder.at(TH.BoxScope)).to.deep.equal(carOf(box))
    receive(noticeOf(gate))
    expect(minder.at(TH.GateScope)).to.deep.equal(carOf(gate))
  })

  it("keeps the main gate's car when the watch tells of it again, and tells a listener each time", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder } = minderWorldOf(vaultDB, { isRootHeard: false })
    const staleGet = { ...TH.getAskAt('box'), track: TH.GateStaleTrack }
    await TH.expectGood(vaultDB.tryGetThing(staleGet))
    const car = minder.at(TH.GateScope)
    expect(car).to.deep.equal(carOf(TH.gateThingOf()))
    const listener = listenerOf()
    minder.listen(listener)
    await TH.expectGood(vaultDB.tryGetThing(staleGet))
    expect(minder.at(TH.GateScope)).to.eq(car)
    expect(toldOf(listener)).to.deep.equal([['gate', 'full']])
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
