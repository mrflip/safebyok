import { describe, expect, it, vi } from 'vitest'
import { DefaultQueryCacheOpts, MaxTimerMillis } from '../../../src/shapes/shapes-minder'
import { carOf } from '../../../src/minding/thing-car'
import { ThingMinder } from '../../../src/minding/thing-minder'
import { MemoryVaultDB } from '../../../src/storage/memory-vault-db'
import { Shell } from '../../../src/shapes/shapes-thing'
import { Thing } from '../../../src/models/thing'
import * as TH from '../../test-helpers'
import { fakeBankOf, minderOf, minderWorldOf, bornOf, storedGateOf, storedBoxOf, noticeOf } from './world'

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
