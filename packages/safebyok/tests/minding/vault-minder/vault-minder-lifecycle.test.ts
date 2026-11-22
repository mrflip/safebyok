import { describe, expect, it, vi } from 'vitest'
import { DefaultQueryCacheOpts, MaxTimerMillis } from '../../../src/shapes/shapes-minder'
import { VaultMinder } from '../../../src/minding/vault-minder'
import { MemoryVaultDB } from '../../../src/storage/memory-vault-db'
import { Shell } from '../../../src/shapes/shapes-thing'
import { Thing } from '../../../src/models/thing'
import * as TH from '../../test-helpers'
import { Hours24, fakeBankOf, minderOf, minderWorldOf, bornOf, storedGateOf, storedBoxOf, noticeOf } from './world'

describe("VaultMinder.make", () => {
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
    [{ queryCacheOpts: { gcTime: 10 } },                    null,                'refuses a gcTime, which no host sets'],
    [{ queryCacheOpts: { staleTime: 'static' } },           null,                "refuses a staleTime of 'static' for the minder's own"],
  ] as const
  for (const [optsOver, bank, blurb] of MakeCases) {
    it(blurb, () => {
      // @ts-expect-error -- sloppy input is the point
      TH.expectSyncRefusal(() => VaultMinder.make({ vaultDB, ...optsOver }, bank ?? fakeBankOf()), 'bad_record')
    })
  }

  it("has the bank's scope", () => {
    const { minder } = minderWorldOf(new MemoryVaultDB(), { isStarted: false })
    expect(minder.scope).to.deep.equal(TH.ThingBank)
  })
})

describe("VaultMinder.hello", () => {
  it("counts an item timely for the staleTime the minder was made with, an hour by default", async () => {
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

  it("accepts a staleTime of Infinity as the minder's own, under which a whole record never ages and a sparse one alone is stale", async () => {
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
    expect(await minder.get(TH.RootScope)).to.deep.equal(TH.rootBoxOf())
    expect(asked.mock.calls).to.have.lengthOf(1)
  })

  it("refuses a get until its bank is stored, when made before the bank is born", async () => {
    const { minder } = minderWorldOf(new MemoryVaultDB(), { isRootHeard: false })
    await TH.expectRefusal(minder.get(TH.BoxScope), 'storage_issue')
  })

  it("answers under the root box the birth's notice delivers, after a get was refused", async () => {
    const vaultDB = new MemoryVaultDB()
    const { minder, receive } = minderWorldOf(vaultDB, { isRootHeard: false })
    await TH.expectRefusal(minder.get(TH.BoxScope), 'storage_issue')
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    receive(noticeOf(TH.rootBoxOf()))
    const shell = Shell.of(TH.BoxScope, TH.rootBoxOf())
    expect(await minder.get(TH.BoxScope)).to.deep.equal(shell)
  })

  it("has every cached item, soon and listing until goodbye, however long after", async () => {
    vi.useFakeTimers()
    try {
      const vaultDB = new MemoryVaultDB()
      const box     = await storedBoxOf(vaultDB)
      const minder  = minderOf(vaultDB)
      minder.hello()
      await minder.get(TH.RootScope)
      await minder.list('box')
      await vi.advanceTimersByTimeAsync(Hours24)
      expect(minder.at(TH.RootScope)).to.deep.equal(TH.rootBoxOf())
      expect(minder.soonAt(TH.BoxScope)).to.deep.equal(Thing.sparseOf(box))
      expect(minder.listingAt(TH.RootScope)).to.deep.equal(['box/openai'])
      minder.goodbye()
      expect([minder.at(TH.RootScope), minder.soonAt(TH.BoxScope)]).to.deep.equal([undefined, undefined])
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

/** A minder that has fetched the main gate, over its vaultDB and the gate stored; goodbye not yet said. */
async function fetchedWorldOf() {
  const vaultDB = new MemoryVaultDB()
  const gate0   = await storedGateOf(vaultDB, 0)
  const { minder } = minderWorldOf(vaultDB)
  await minder.get(TH.GateScope)
  expect(minder.at(TH.RootScope)).to.deep.equal(TH.rootBoxOf())
  return { minder, vaultDB, gate0 }
}

describe("VaultMinder.goodbye", () => {
  it("empties the cache", async () => {
    const { minder } = await fetchedWorldOf()
    minder.goodbye()
    expect([minder.at(TH.RootScope), minder.at(TH.GateScope)]).to.deep.equal([undefined, undefined])
  })

  it("stops watching the vaultDB", async () => {
    const { minder, vaultDB, gate0 } = await fetchedWorldOf()
    minder.goodbye()
    const gate1 = TH.nextGateOf(gate0)
    await TH.expectGood(vaultDB.tryWriteThing(TH.replaceAskOf(gate0, gate1)))
    await TH.wakeupAtNextTick()
    expect(minder.at(TH.GateScope)).to.be.undefined
  })

  it("refuses later reads", async () => {
    const { minder } = await fetchedWorldOf()
    minder.goodbye()
    await TH.expectBad(minder.tryAt(TH.GateScope), 'disabled')
    await TH.expectRefusal(minder.get(TH.GateScope), 'disabled')
  })

  it("lets hello start the minder again, with the staleTime it was made with", async () => {
    vi.useFakeTimers()
    try {
      const vaultDB = new MemoryVaultDB()
      await storedBoxOf(vaultDB)
      const gate    = TH.gateThingOf()
      const minder  = minderOf(vaultDB, { staleTime: 5 })
      minder.hello()
      minder.goodbye()
      minder.hello()
      expect(await minder.get(TH.GateScope)).to.deep.equal(gate)
      await minder.get(TH.RootScope)
      await vi.advanceTimersByTimeAsync(5)
      expect(minder.isStaleAt(TH.GateScope)).to.be.true
      await vi.advanceTimersByTimeAsync(Hours24)
      expect([minder.at(TH.GateScope), minder.at(TH.RootScope)]).to.deep.equal([gate, TH.rootBoxOf()])
    } finally {
      vi.useRealTimers()
    }
  })
})
