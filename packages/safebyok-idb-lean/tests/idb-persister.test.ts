/** Tests for IdbPersister: its options, its throttled writes, and a restore into a fresh device through the persisters plug. */

// Import fake-indexeddb first: it installs IndexedDB's globals before the adapter loads.
import 'fake-indexeddb/auto'
import { noop } from 'es-toolkit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VaultError, isPersister } from 'safebyok/storage'
import type { DevicePersisters, PersistedClient } from 'safebyok/storage'
import { IdbPersister } from '../src/idb-persister'
import * as TH from './test-helpers'

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

/** A snapshot of a client holding nothing, saved at `timestamp`. */
function snapshotAt(timestamp: number): PersistedClient { return { timestamp, buster: 'a010501', clientState: { queries: [], mutations: [] } } }

/** A fresh database name no other test has touched. */
function freshDbName(): string { return `test-${crypto.randomUUID()}` }

/** Let the writes a throttle has just let through reach IndexedDB. */
async function settle(): Promise<void> { await new Promise((resolve) => { setTimeout(resolve, 20) }) }

describe("IdbPersister's options", () => {
  it("makes a Persister from a recordlabel", () => {
    expect(isPersister(new IdbPersister({ recordlabel: 'roots' }))).to.be.true
  })

  it("refuses an option it cannot use, or a field it does not know", () => {
    for (const opts of [{}, { recordlabel: '' }, { recordlabel: 'a', dbName: '' }, { recordlabel: 'a', throttleMs: -1 }, { recordlabel: 'a', onBadNews: 1 }, { recordlabel: 'a', keyname: 'b' }]) {
      expect(() => new IdbPersister(opts as never)).to.throw(VaultError).with.property('refusalkind', 'bad_record')
    }
  })
})

describe("an IdbPersister", () => {
  it("restores nothing until it is handed a snapshot, then the snapshot as an object, and nothing once removed", async () => {
    const persister = new IdbPersister({ recordlabel: 'roots', dbName: freshDbName(), throttleMs: 0 })
    expect(await persister.restoreClient()).to.be.undefined
    persister.persistClient(snapshotAt(1))
    await settle()
    expect(await persister.restoreClient()).to.deep.equal(snapshotAt(1))
    await persister.removeClient()
    expect(await persister.restoreClient()).to.be.undefined
  })

  it("keeps each recordlabel's snapshot apart, and shares them with a persister of the same recordlabel and dbName", async () => {
    const dbName = freshDbName()
    const roots  = new IdbPersister({ recordlabel: 'roots', dbName, throttleMs: 0 })
    const boxes  = new IdbPersister({ recordlabel: 'boxes', dbName, throttleMs: 0 })
    roots.persistClient(snapshotAt(1))
    await settle()
    expect(await boxes.restoreClient()).to.be.undefined
    expect(await new IdbPersister({ recordlabel: 'roots', dbName }).restoreClient()).to.deep.equal(snapshotAt(1))
  })

  it("writes the first snapshot at once and then only the newest, once per throttle", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const persister = new IdbPersister({ recordlabel: 'roots', dbName: freshDbName(), throttleMs: 1000 })
    persister.persistClient(snapshotAt(1))
    persister.persistClient(snapshotAt(2))
    persister.persistClient(snapshotAt(3))
    vi.useRealTimers()
    await settle()
    expect(await persister.restoreClient()).to.deep.equal(snapshotAt(1))
  })

  it("writes the newest snapshot when the throttle has passed", async () => {
    const persister = new IdbPersister({ recordlabel: 'roots', dbName: freshDbName(), throttleMs: 30 })
    persister.persistClient(snapshotAt(1))
    persister.persistClient(snapshotAt(2))
    persister.persistClient(snapshotAt(3))
    await new Promise((resolve) => { setTimeout(resolve, 100) })
    expect(await persister.restoreClient()).to.deep.equal(snapshotAt(3))
  })

  it("drops a write the throttle still holds when removed", async () => {
    const persister = new IdbPersister({ recordlabel: 'roots', dbName: freshDbName(), throttleMs: 30 })
    persister.persistClient(snapshotAt(1))
    persister.persistClient(snapshotAt(2))
    await persister.removeClient()
    await new Promise((resolve) => { setTimeout(resolve, 100) })
    expect(await persister.restoreClient()).to.be.undefined
  })

  it("tells onBadNews of a write that fails", async () => {
    const onBadNews = vi.fn()
    const persister = new IdbPersister({ recordlabel: 'roots', dbName: freshDbName(), throttleMs: 0, onBadNews })
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })
    persister.persistClient(snapshotAt(1))
    await settle()
    expect(onBadNews).toHaveBeenCalledTimes(1)
    expect(onBadNews.mock.calls[0]![0]).to.be.instanceOf(VaultError).with.property('refusalkind', 'storage_unavailable')
  })
})

describe("a device restored through IdbPersisters", () => {
  it("comes up in a fresh device with the boxes its predecessor cached", async () => {
    const dbName = freshDbName()
    function persistersOf(): DevicePersisters {
      return {
        roots: new IdbPersister({ recordlabel: 'roots', dbName, throttleMs: 0, onBadNews: noop }),
        boxes: new IdbPersister({ recordlabel: 'boxes', dbName, throttleMs: 0, onBadNews: noop }),
      }
    }
    const { vault } = await TH.buildBornVault({ device: TH.makeDevice({}, { persisters: persistersOf() }) })
    await vault.putBoxOnce('box/openai', { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    await settle()
    const device = TH.makeDevice({}, { vaultDB: vault.bank.vaultDB, persisters: persistersOf() })
    await device.signIn(TH.WorldScope.userid)
    expect(device.minder.listingAt({ ...TH.WorldScope, labelpath: 'box' })).to.deep.equal(['box/openai'])
  })
})
