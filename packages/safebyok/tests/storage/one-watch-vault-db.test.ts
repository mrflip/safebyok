import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { noop } from 'es-toolkit'
import { Errors } from 'safebyok-big/internals'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import { OneWatchVaultDB, oneWatchVaultDB, watchnameOf } from '../../src/storage/one-watch-vault-db'
import type { VaultEvent } from '../../src/shapes/shapes-vault-event'
import type { VaultDB } from '../../src/storage/vault-db'
import * as TH from '../test-helpers'

// Each "tab" is a OneWatchVaultDB of its own over one MemoryVaultDB, in one Node process: Node's BroadcastChannel
// carries a post between two channels of one name in the same process, as a browser's carries it between tabs.

/** The Web Locks manager this Node has, if any, before a test stubs its own. */
const RealLocks = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks

/** A tab's watch of the bank: what it is notified of, its bad news, how many bad news it had heard at each time it ended, and its stop. */
type TabWatch = { events: VaultEvent[], badNews: Errors.VaultError[], endings: number[], stop: () => void }

/** Start a watch of the bank through `vaultDB`, as a tab does. */
function watchOf(vaultDB: OneWatchVaultDB): TabWatch {
  const events: VaultEvent[] = []
  const badNews: Errors.VaultError[] = []
  const endings: number[] = []
  const stop = vaultDB.watch(TH.ThingBank, (event) => { events.push(event) }, (news) => { badNews.push(news) }, () => { endings.push(badNews.length) })
  return { events, badNews, endings, stop }
}

describe("OneWatchVaultDB", () => {
  let memory: MemoryVaultDB
  let tabs: TabWatch[]
  beforeEach(() => {
    memory = new MemoryVaultDB()
    tabs = []
    vi.stubGlobal('navigator', { locks: TH.fakeLockManager() })
  })
  afterEach(() => {
    for (const tab of tabs) { tab.stop() }
    vi.unstubAllGlobals()
  })

  /** Start a watch of the bank in a new tab, stopped after the test. */
  function openTab(): TabWatch {
    const tab = watchOf(oneWatchVaultDB(memory))
    tabs.push(tab)
    return tab
  }

  describe("watch(scope, onNotice, onBadNews, onEnded)", () => {
    it("runs one watch of the wrapped vaultDB for two tabs, and each tab hears each notice", async () => {
      const innerWatch = vi.spyOn(memory, 'watch')
      const holder = openTab()
      const other = openTab()
      await TH.eventually(() => innerWatch.mock.calls.length === 1)
      await memory.tryWriteThing(TH.birthAskOf())
      await TH.eventually(() => other.events.length === 1)
      await TH.aWhile()
      expect(innerWatch).toHaveBeenCalledTimes(1)
      expect(TH.maskedReadTcsOf(holder.events)).to.deep.equal([TH.itemEventOf(TH.gateThingOf())])
      expect(other.events).to.deep.equal(holder.events)
      expect([...holder.badNews, ...other.badNews]).to.deep.equal([])
    })

    it("hands another tab what the holder heard deeply frozen, with the read_tc the holder heard it at", async () => {
      const holder = openTab()
      const other = openTab()
      await TH.aWhile()
      await memory.tryWriteThing(TH.birthAskOf())
      await TH.eventually(() => other.events.length === 1)
      const [heard] = other.events as [VaultEvent & { val: object }]
      expect(heard.read_tc).to.eq(holder.events[0]?.read_tc)
      expect(Object.isFrozen(heard)).to.be.true
      expect(Object.isFrozen(heard.val)).to.be.true
    })

    it("hands the watch to a waiting tab when the holder stops, and that tab hears what is written after", async () => {
      const innerWatch = vi.spyOn(memory, 'watch')
      const holder = openTab()
      const other = openTab()
      await TH.eventually(() => innerWatch.mock.calls.length === 1)
      holder.stop()
      await TH.eventually(() => innerWatch.mock.calls.length === 2)
      await memory.tryWriteThing(TH.birthAskOf())
      await TH.eventually(() => other.events.length === 1)
      await TH.aWhile()
      expect(TH.maskedReadTcsOf(other.events)).to.deep.equal([TH.itemEventOf(TH.gateThingOf())])
      expect(holder.events).to.deep.equal([])
    })

    it("starts no watch for a tab that stops while it waits for the lock", async () => {
      const innerWatch = vi.spyOn(memory, 'watch')
      const holder = openTab()
      const leaver = openTab()
      await TH.eventually(() => innerWatch.mock.calls.length === 1)
      leaver.stop()
      holder.stop()
      await TH.aWhile()
      expect(innerWatch).toHaveBeenCalledTimes(1)
    })

    it("tells only the holder of the wrapped vaultDB's bad news", async () => {
      const news = new Errors.VaultError('storage_unavailable', 'The datastore is down.')
      vi.spyOn(memory, 'watch').mockImplementation((_scope, _onNotice, onBadNews) => {
        onBadNews(news)
        return noop
      })
      const holder = openTab()
      const other = openTab()
      await TH.eventually(() => holder.badNews.length === 1)
      await TH.aWhile()
      expect(holder.badNews).to.deep.equal([news])
      expect(other.badNews).to.deep.equal([])
    })

    it("ends the watch of a tab whose wrapped watch throws as it starts, telling why after, and hands the lock to the next tab", async () => {
      const innerWatch = vi.spyOn(memory, 'watch').mockImplementationOnce(() => { throw new Error('no subscription today') })
      const holder = openTab()
      const other = openTab()
      await TH.eventually(() => innerWatch.mock.calls.length === 2)
      await memory.tryWriteThing(TH.birthAskOf())
      await TH.eventually(() => other.events.length === 1)
      await TH.aWhile()
      expect([holder.endings, other.endings]).to.deep.equal([[0], []])
      expect(holder.badNews.map((news) => news.refusalkind)).to.deep.equal(['storage_unavailable'])
      expect(other.badNews).to.deep.equal([])
      expect(holder.events).to.deep.equal([])
    })

    it("ends the watch of every tab where each one's wrapped watch throws as it starts, and one watch serves both once started again", async () => {
      const innerWatch = vi.spyOn(memory, 'watch').mockImplementation(() => { throw new Error('no subscription today') })
      const first = openTab()
      const second = openTab()
      await TH.eventually(() => first.endings.length === 1 && second.endings.length === 1)
      innerWatch.mockRestore()
      const restartedInner = vi.spyOn(memory, 'watch')
      const firstAgain = openTab()
      const secondAgain = openTab()
      await TH.eventually(() => restartedInner.mock.calls.length === 1)
      await memory.tryWriteThing(TH.birthAskOf())
      await TH.eventually(() => firstAgain.events.length === 1 && secondAgain.events.length === 1)
      await TH.aWhile()
      expect(restartedInner).toHaveBeenCalledTimes(1)
      expect([first.events, second.events]).to.deep.equal([[], []])
      expect([firstAgain.endings, secondAgain.endings]).to.deep.equal([[], []])
    })

    it("posts each notice to the other tabs though the holder's own handler throws", async () => {
      const holderNews: Errors.VaultError[] = []
      const holderStop = oneWatchVaultDB(memory).watch(TH.ThingBank, () => { throw new Error('a bug in the host') }, (news) => { holderNews.push(news) })
      tabs.push({ events: [], badNews: holderNews, endings: [], stop: holderStop })
      const other = openTab()
      await TH.aWhile()
      await memory.tryWriteThing(TH.birthAskOf())
      await TH.eventually(() => other.events.length === 1)
      expect(holderNews.map((news) => news.refusalkind)).to.deep.equal(['unexpected_error'])
    })

    it("tells a tab's onBadNews what its handler throws at a notice another tab posted", async () => {
      openTab()
      const otherNews: Errors.VaultError[] = []
      const otherStop = oneWatchVaultDB(memory).watch(TH.ThingBank, () => { throw new Error('a bug in the host') }, (news) => { otherNews.push(news) })
      tabs.push({ events: [], badNews: otherNews, endings: [], stop: otherStop })
      await TH.aWhile()
      await memory.tryWriteThing(TH.birthAskOf())
      await TH.eventually(() => otherNews.length === 1)
      expect(otherNews.map((news) => news.refusalkind)).to.deep.equal(['unexpected_error'])
    })

    it("notifies nothing posted on the bank's channel that is not an item event passing its checks", async () => {
      const listener = openTab()
      await TH.aWhile()
      const poster = new BroadcastChannel(watchnameOf(TH.ThingBank))
      const good = TH.itemEventOf(TH.gateThingOf())
      poster.postMessage('not an event')
      poster.postMessage({ ...good, eventkind: 'aged' })
      poster.postMessage({ ...good, labelpath: 'elsewhere' })
      poster.postMessage({ ...good, read_tc: 'yesterday' })
      poster.postMessage({ ...good, read_tc: '01900000-0000-7000-8000-000000000000' })
      poster.close()
      await TH.eventually(() => listener.events.length === 1)
      await TH.aWhile()
      expect(listener.events).to.deep.equal([{ ...good, read_tc: '01900000-0000-7000-8000-000000000000' }])
    })

    it("runs a watch of the wrapped vaultDB in every tab where the platform has no Web Locks, handing it onEnded", async () => {
      vi.stubGlobal('navigator', {})
      const innerWatch = vi.spyOn(memory as VaultDB, 'watch')
      const one = openTab()
      const two = openTab()
      expect(innerWatch).toHaveBeenCalledTimes(2)
      expect(innerWatch.mock.calls.map((call) => typeof call[3])).to.deep.equal(['function', 'function'])
      await memory.tryWriteThing(TH.birthAskOf())
      await TH.eventually(() => one.events.length === 1 && two.events.length === 1)
      await TH.aWhile()
      expect([one.events.length, two.events.length]).to.deep.equal([1, 1])
    })

    it.runIf(RealLocks !== undefined)("hands the watch on under the platform's own Web Locks", async () => {
      vi.stubGlobal('navigator', { locks: RealLocks })
      const innerWatch = vi.spyOn(memory, 'watch')
      const holder = openTab()
      const other = openTab()
      await TH.eventually(() => innerWatch.mock.calls.length === 1)
      holder.stop()
      await TH.eventually(() => innerWatch.mock.calls.length === 2)
      await memory.tryWriteThing(TH.birthAskOf())
      await TH.eventually(() => other.events.length === 1)
      expect(holder.events).to.deep.equal([])
    })

    it("refuses a scope that is not a bank's", () => {
      TH.expectSyncRefusal(() => oneWatchVaultDB(memory).watch({ userid: 'u1' } as never, noop, noop), 'bad_record')
    })

    it("refuses an onEnded that is not a function", () => {
      TH.expectSyncRefusal(() => oneWatchVaultDB(memory).watch(TH.ThingBank, noop, noop, 'later' as never), 'bad_record')
    })
  })

  it("answers each other verb from the wrapped vaultDB", async () => {
    const wrapper = oneWatchVaultDB(memory)
    await TH.expectGood(wrapper.tryWriteThing(TH.birthAskOf()))
    expect(await wrapper.tryGetThing(TH.getGateAskOf())).to.deep.include({ val: TH.gateThingOf() })
    expect(await memory.tryGetThing(TH.getGateAskOf())).to.deep.include({ val: TH.gateThingOf() })
  })

  it("refuses a vaultDB that is not one", () => {
    TH.expectSyncRefusal(() => new OneWatchVaultDB({ tryGetThing: noop } as never), 'bad_record')
  })
})
