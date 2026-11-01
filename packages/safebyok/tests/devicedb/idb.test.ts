// fake-indexeddb installs a Node-side indexedDB global before the store loads: these tests
// exercise real IndexedDB semantics (structured clone included) without a browser.
import 'fake-indexeddb/auto'
import { createStore, get, set } from 'idb-keyval'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { deviceRecordOf } from '../../src/devicedb/devicedb'
import { idbDeviceDB } from '../../src/devicedb/idb'
import * as Scopepath from '../../src/scopepath'
import * as TH from '../test-helpers'
import { bankScopeOf, cacheableOf, describeModelsDeviceDB, modelsLeaseOf } from '../test-helpers/models-device-db'

// Each test gets its own database, so tests never see each other's rows.
describeModelsDeviceDB('idbDeviceDB', () => idbDeviceDB({ dbName: TH.freshDbName() }))

const u1 = TH.scopeOf('u1')
const bank1 = bankScopeOf('u1')

/** The idb-keyval store under an idbDeviceDB of `dbName`, for a test that plants a row or looks at one as stored. */
const shelfOf = (dbName: string) => createStore(`${dbName}:devicedb`, 'rows')

describe("idbDeviceDB(opts)", () => {
  it("keeps its rows in a database of its own, apart from the device store of safebyok/idb", async () => {
    const dbName = TH.freshDbName()
    const lease = await modelsLeaseOf('u1')
    await idbDeviceDB({ dbName }).putLease(lease)
    expect(await get(Scopepath.lease(u1), shelfOf(dbName))).to.deep.equal(lease)
  })

  it("keeps a leaseKey as a handle through structured clone: still a non-extractable CryptoKey that unwraps what it wrapped", async () => {
    const dbName = TH.freshDbName()
    const lease = await modelsLeaseOf('u1')
    await idbDeviceDB({ dbName }).putLease(lease)
    const stored = await idbDeviceDB({ dbName }).getLease(u1) as typeof lease
    expect(stored.lease_key).to.not.equal(lease.lease_key)
    expect(stored.lease_key.extractable).to.be.false
    const inner = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt'])
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const wrapped = await crypto.subtle.wrapKey('raw', inner, lease.lease_key, { name: 'AES-GCM', iv })
    const unwrapped = await crypto.subtle.unwrapKey('raw', wrapped, stored.lease_key, { name: 'AES-GCM', iv }, { name: 'AES-GCM' }, true, ['encrypt'])
    expect(new Uint8Array(await crypto.subtle.exportKey('raw', unwrapped))).to.deep.equal(new Uint8Array(await crypto.subtle.exportKey('raw', inner)))
  })

  it("erases a misfiled copy its find meets, and writes over a damaged device record at the next advance", async () => {
    const dbName = TH.freshDbName()
    const deviceDB = idbDeviceDB({ dbName })
    await set(Scopepath.vault(u1), cacheableOf(TH.scopeOf('u1', 'other')), shelfOf(dbName))
    await set(Scopepath.bank(bank1), { fmt: 'junk' }, shelfOf(dbName))
    expect(await deviceDB.findCachedVaults(bank1)).to.deep.equal([])
    expect(await get(Scopepath.vault(u1), shelfOf(dbName))).to.be.undefined
    expect(await deviceDB.getDeviceRecord(bank1)).to.be.null
    const record = deviceRecordOf(bank1, 'device-a')
    expect(await deviceDB.advanceDeviceRecord(record)).to.deep.equal(record)
  })

  it("settles a doDelDamaged with its transaction: a throw from isSound rejects it, and the row stays", async () => {
    const dbName = TH.freshDbName()
    const deviceDB = idbDeviceDB({ dbName }) as unknown as { doDelDamaged: (scopepath: string, isSound: (row: unknown) => boolean) => Promise<void> }
    await set(Scopepath.vault(u1), 'damaged', shelfOf(dbName))
    await expect(deviceDB.doDelDamaged(Scopepath.vault(u1), () => { throw new Error("isSound threw") })).rejects.toThrow()
    expect(await get(Scopepath.vault(u1), shelfOf(dbName))).to.eq('damaged')
  })

  it("refuses 'bad_option' a dbName that is not non-empty text, or an option it does not take", () => {
    TH.expectSyncRefusal(() => idbDeviceDB({ dbName: '' }), 'bad_option')
    TH.expectSyncRefusal(() => idbDeviceDB({ dbName: 'acme', stray: 1 } as never), 'bad_option')
  })
})

describe("idbDeviceDB over a store the browser withholds", () => {
  it("answers 'storage_blocked' when every open is refused", async () => {
    const opening = vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new DOMException("The operation is insecure.", 'SecurityError') })
    onTestFinished(() => { opening.mockRestore() })
    const deviceDB = idbDeviceDB({ dbName: TH.freshDbName() })
    await TH.expectBad(deviceDB.tryGetLease(u1), 'storage_blocked')
    await TH.expectBad(deviceDB.tryAdvanceDeviceRecord(deviceRecordOf(bank1, 'device-a')), 'storage_blocked')
    await TH.expectBad(deviceDB.tryFindCachedVaults(bank1), 'storage_blocked')
  })

  it("answers 'storage_blocked' in a context with no IndexedDB at all, touching none until first use", async () => {
    vi.stubGlobal('indexedDB', undefined)
    onTestFinished(() => { vi.unstubAllGlobals() })
    const deviceDB = idbDeviceDB({ dbName: TH.freshDbName() })
    const refusal = await TH.expectBad(deviceDB.tryDelAll(), 'storage_blocked')
    expect(refusal.message).to.include("The device store threw NotSupportedError.")
  })
})
