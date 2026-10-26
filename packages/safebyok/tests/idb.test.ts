// fake-indexeddb installs a Node-side indexedDB global before the store loads: these tests
// exercise real IndexedDB semantics (structured clone included) without a browser.
import 'fake-indexeddb/auto'
import { createStore, set } from 'idb-keyval'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { idbDeviceDB, inspectIdbDeviceDB, type IdbOpts } from '../src/idb'
import * as Entry from '../src/idb'
import { VaultError } from '../src/errors'
import * as Scopepath from '../src/scopepath'
import * as TH from './test-helpers'

/**
 * Has every `indexedDB.open` fail as a browser fails it for storage it withholds (site data
 * blocked, a sandboxed frame): the request it hands back fires `onerror`, its `error` a
 * DOMException named `SecurityError`. Undone as the test ends.
 */
const failOpens = () => {
  const opening = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
    const request: { error: DOMException, onerror: ((event: Event) => void) | null } = { error: new DOMException('The operation is insecure.', 'SecurityError'), onerror: null }
    queueMicrotask(() => { request.onerror?.(new Event('error')) })
    return request as unknown as IDBOpenDBRequest
  })
  onTestFinished(() => { opening.mockRestore() })
}

/**
 * Has every write's transaction abort as a browser's does when the origin is out of room: its
 * `error` a DOMException named `QuotaExceededError`, through fake-indexeddb's own abort. Reads
 * and deletions go on. Undone as the test ends.
 */
const failWritesOverQuota = () => {
  const put = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, 'put')?.value as IDBObjectStore['put']
  const putting = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function overQuota(this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
    const request = put.apply(this, args)
    ;(this.transaction as unknown as { _abort: (errName: string) => void })._abort('QuotaExceededError')
    return request
  })
  onTestFinished(() => { putting.mockRestore() })
}

// Each test gets its own database, so tests never see each other's rows. Its blocked store is one
// whose every open the browser refuses, as describeDeviceDB's second example runs it.
TH.describeDeviceDB('idbDeviceDB', () => idbDeviceDB({ dbName: TH.freshDbName() }), () => {
  // Every open refused as a browser refuses one from an opaque origin, until the test ends.
  const opening = vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new DOMException('The operation is insecure.', 'SecurityError') })
  onTestFinished(() => { opening.mockRestore() })
  return idbDeviceDB({ dbName: TH.freshDbName() })
})

describe("idbDeviceDB over storage the browser withholds", () => {
  it("answers a write over quota as storage_blocked, the browser's QuotaExceededError its cause, and keeps nothing of it", async () => {
    const deviceDB = idbDeviceDB({ dbName: TH.freshDbName() })
    failWritesOverQuota()
    const refused = await TH.expectBad(deviceDB.putLease(await TH.leaseOf('u1')), 'storage_blocked')
    expect(refused.cause).to.have.property('name', 'QuotaExceededError')
    await TH.expectBad(deviceDB.raiseDeviceRecord(TH.deviceRecordOf('u1')), 'storage_blocked')
    const scope = TH.scopeOf('u1')
    expect(await TH.expectGood(deviceDB.getLease(scope))).to.be.null
    expect(await TH.expectGood(deviceDB.getDeviceRecord(scope))).to.be.null
  })

  it("answers every verb as storage_blocked when the browser refuses each open through its request's onerror, its SecurityError the cause", async () => {
    const deviceDB = idbDeviceDB({ dbName: TH.freshDbName() })
    failOpens()
    const scope = TH.scopeOf('u1')
    const refused = await TH.expectBad(deviceDB.getLease(scope), 'storage_blocked')
    expect(refused.cause).to.be.instanceOf(DOMException).and.to.have.property('name', 'SecurityError')
    await TH.expectBad(deviceDB.putLease(await TH.leaseOf('u1')), 'storage_blocked')
    await TH.expectBad(deviceDB.delLease(scope), 'storage_blocked')
    await TH.expectBad(deviceDB.getDeviceRecord(scope), 'storage_blocked')
    await TH.expectBad(deviceDB.raiseDeviceRecord(TH.deviceRecordOf('u1')), 'storage_blocked')
    await TH.expectBad(deviceDB.delDeviceRecord(scope), 'storage_blocked')
    await TH.expectBad(deviceDB.delAll(), 'storage_blocked')
  })
})

/** The shelf `idbDeviceDB` keeps `dbName`'s records on, as idb-keyval opens it. */
const shelfOf = (dbName: string) => createStore(`${dbName}:device_db`, 'records')

describe("idbDeviceDB, reading a lease it cannot read", () => {
  it("discards a row that will not read back as a lease, and answers none", async () => {
    const dbName = TH.freshDbName()
    const deviceDB = idbDeviceDB({ dbName })
    await set(Scopepath.lease(TH.scopeOf('u1')), { format: 'safebyok-lease-v1', mangled: true }, shelfOf(dbName))
    const found = await TH.expectGood(deviceDB.getLease(TH.scopeOf('u1')))
    expect(found).to.be.null
    const rows = await inspectIdbDeviceDB({ dbName }).rows()
    expect(rows).to.deep.equal([])
  })

  it("never discards a lease written after the unreadable row it found: a putLease made as the read began stands", async () => {
    const dbName = TH.freshDbName()
    const deviceDB = idbDeviceDB({ dbName })
    await set(Scopepath.lease(TH.scopeOf('u1')), { format: 'safebyok-lease-v1', mangled: true }, shelfOf(dbName))
    const lease = await TH.leaseOf('u1')
    // The read is made first, so it finds the mangled row; the write is made at once after, and
    // lands after it: the discard the read follows with must not take the new lease with it.
    const [found, written] = await Promise.all([deviceDB.getLease(TH.scopeOf('u1')), deviceDB.putLease(lease)])
    expect(found).to.deep.equal({ ok: true, val: null })
    expect(written).to.deep.equal({ ok: true, val: lease })
    const kept = await TH.expectGood(deviceDB.getLease(TH.scopeOf('u1')))
    expect(kept).to.deep.equal(lease)
  })
})

describe("idbDeviceDB, as its examples have it", () => {
  it("answers a fresh device's lease as a good Outcome of null, in the default database, as its first example shows", async () => {
    const deviceDB = idbDeviceDB()
    expect(await deviceDB.getLease({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })).to.deep.equal({ ok: true, val: null })
  })

  it("answers a fresh device's record as a good Outcome of null, as its second example shows", async () => {
    const deviceDB = idbDeviceDB()
    expect(await deviceDB.getDeviceRecord({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })).to.deep.equal({ ok: true, val: null })
  })
})

describe("idbDeviceDB, two tabs raising at once", () => {
  it("keeps the higher epoch when two tabs over one database raise the device record at once, in either order", async () => {
    for (const [first, second] of [[7, 6], [6, 7]] as const) {
      const dbName = TH.freshDbName()
      const thisTab = idbDeviceDB({ dbName })
      const otherTab = idbDeviceDB({ dbName })
      const thisRecord = TH.deviceRecordOf('u1', { highest_vault_epoch: first })
      const otherRecord = TH.deviceRecordOf('u1', { highest_vault_epoch: second })
      const [thisRaised, otherRaised] = await Promise.all([TH.expectGood(thisTab.raiseDeviceRecord(thisRecord)), TH.expectGood(otherTab.raiseDeviceRecord(otherRecord))])
      // Each resolves what it stored: the one that landed second saw the first's raise.
      expect(Math.max(thisRaised.highest_vault_epoch, otherRaised.highest_vault_epoch)).to.eq(7)
      const highest = TH.deviceRecordOf('u1', { highest_vault_epoch: 7 })
      const scope = TH.scopeOf('u1')
      expect(await TH.expectGood(thisTab.getDeviceRecord(scope))).to.deep.equal(highest)
      expect(await TH.expectGood(otherTab.getDeviceRecord(scope))).to.deep.equal(highest)
    }
  })
})

describe("safebyok/idb", () => {
  it("exports the device store, its inspector and the change bell, and no vault store: that is safebyok-indexeddb's", () => {
    expect(Object.keys(Entry)).to.have.members(['idbDeviceDB', 'inspectIdbDeviceDB', 'ChangeBell'])
    expect(Object.keys(Entry.ChangeBell)).to.have.members(['ring', 'listen'])
  })
})

/** Option bags no IndexedDB adapter takes: each refused as it is made, before a database opens. */
const BadIdbOpts = [
  [{ dbName: "" },                             'an empty dbName'],
  [{ dbName: 42 },                             'a dbName that is not text'],
  [{ dbName: null },                           'a null dbName'],
  ["acme",                                     'a dbName passed bare, not in a bag'],
] as const

describe("the IndexedDB device store's options", () => {
  const Makers = [
    ['idbDeviceDB',        (opts: IdbOpts) => idbDeviceDB(opts)],
    ['inspectIdbDeviceDB', (opts: IdbOpts) => inspectIdbDeviceDB(opts)],
  ] as const
  for (const [makerTitle, make] of Makers) {
    for (const [opts, blurb] of BadIdbOpts) {
      it(`${makerTitle} refuses ${blurb} with kind 'bad_option'`, () => {
        expect(() => make(opts as unknown as IdbOpts)).to.throw(VaultError, /dbName/).with.property('refusalkind', 'bad_option')
      })
    }
    it(`${makerTitle} keeps its records in 'safebyok' given no options, or no dbName`, () => {
      expect(() => make(undefined as unknown as IdbOpts)).to.not.throw()
      expect(() => make({ dbName: undefined })).to.not.throw()
    })
  }
})

describe("idbDeviceDB", () => {
  const NoIndexedDBCases = [
    [undefined,  'a runtime with no indexedDB global'],
    [null,       'a browser with IndexedDB turned off, its indexedDB null'],
  ] as const

  for (const [factory, blurb] of NoIndexedDBCases) {
    it(`refuses at its first use as 'storage_blocked', a NotSupportedError its cause, in ${blurb}`, async () => {
      const deviceDB = idbDeviceDB({ dbName: TH.freshDbName() })
      vi.stubGlobal('indexedDB', factory)
      try {
        const err = await TH.expectBad(deviceDB.getDeviceRecord(TH.scopeOf('u1')), 'storage_blocked')
        expect(err.cause).to.have.property('name', 'NotSupportedError')
      } finally {
        vi.unstubAllGlobals()
      }
    })

    it(`has its inspector's rows() and wipe() refuse with a NotSupportedError too, in ${blurb}`, async () => {
      const inspector = inspectIdbDeviceDB({ dbName: TH.freshDbName() })
      vi.stubGlobal('indexedDB', factory)
      try {
        await expect(inspector.rows()).rejects.toThrow(expect.objectContaining({ name: 'NotSupportedError' }))
        await expect(inspector.wipe()).rejects.toThrow(expect.objectContaining({ name: 'NotSupportedError' }))
      } finally {
        vi.unstubAllGlobals()
      }
    })
  }

  it("refuses with a DOMException as its cause where the runtime has one", async () => {
    const deviceDB = idbDeviceDB({ dbName: TH.freshDbName() })
    vi.stubGlobal('indexedDB', undefined)
    try {
      const { cause } = await TH.expectBad(deviceDB.getDeviceRecord(TH.scopeOf('u1')), 'storage_blocked')
      expect(cause).to.be.instanceOf(DOMException)
      expect(cause).to.have.property('name', 'NotSupportedError')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("refuses with a plain Error named NotSupportedError as its cause where the runtime has no DOMException, as Hermes has none", async () => {
    const deviceDB = idbDeviceDB({ dbName: TH.freshDbName() })
    vi.stubGlobal('indexedDB', undefined)
    vi.stubGlobal('DOMException', undefined)
    try {
      const { cause } = await TH.expectBad(deviceDB.getDeviceRecord(TH.scopeOf('u1')), 'storage_blocked')
      expect(cause).to.be.instanceOf(Error)
      expect(cause).to.have.property('name', 'NotSupportedError')
      expect(cause).to.have.property('message').that.includes('no IndexedDB')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("sweeps a lease filed under an earlier version's key at the first read, never reading it", async () => {
    const dbName = TH.freshDbName()
    const shelf = createStore(`${dbName}:device_db`, 'records')
    await set('unlock:acme:u1:main', await TH.leaseOf('u1'), shelf)
    await set(['unlock', 'acme', 'u1', 'main'], await TH.leaseOf('u1'), shelf)
    const deviceDB = TH.expectingGood(idbDeviceDB({ dbName }))
    await deviceDB.putLease(await TH.leaseOf('u2'))
    const gets = vi.spyOn(IDBObjectStore.prototype, 'get')
    const getAlls = vi.spyOn(IDBObjectStore.prototype, 'getAll')
    const cursors = vi.spyOn(IDBObjectStore.prototype, 'openCursor')
    try {
      expect(await deviceDB.getLease(TH.scopeOf('u1'))).to.be.null
      expect(gets.mock.calls.map(([ckey]) => ckey)).to.deep.equal([Scopepath.lease(TH.scopeOf('u1'))])
      expect(getAlls).to.have.callCount(0)
      expect(cursors).to.have.callCount(0)
    } finally {
      vi.restoreAllMocks()
    }
    const rows = await inspectIdbDeviceDB({ dbName }).rows()
    expect(rows.map((row) => row.ckey)).to.deep.equal([Scopepath.lease(TH.scopeOf('u2'))])
  })

  it("sweeps them at an erase too, keeping every lease it filed", async () => {
    const dbName = TH.freshDbName()
    const shelf = createStore(`${dbName}:device_db`, 'records')
    await set('unlock:acme:u1:main', await TH.leaseOf('u1'), shelf)
    const deviceDB = TH.expectingGood(idbDeviceDB({ dbName }))
    await deviceDB.putLease(await TH.leaseOf('u2'))
    await deviceDB.delLease(TH.scopeOf('u3'))
    expect(await deviceDB.getLease(TH.scopeOf('u2'))).to.not.be.null
    const rows = await inspectIdbDeviceDB({ dbName }).rows()
    expect(rows.map((row) => row.ckey)).to.deep.equal([Scopepath.lease(TH.scopeOf('u2'))])
  })

  it("discards a device's lease from before the rename, filed under unlock^, keeping its device record: the user proves once more", async () => {
    const dbName = TH.freshDbName()
    const shelf = createStore(`${dbName}:device_db`, 'records')
    const deviceDB = TH.expectingGood(idbDeviceDB({ dbName }))
    await deviceDB.raiseDeviceRecord(TH.deviceRecordOf('u1'))
    // Even a record that would read today is swept unread: its key is not a scopepath this version files.
    await set('unlock^acme^u1^main', await TH.leaseOf('u1'), shelf)
    expect(await deviceDB.getLease(TH.scopeOf('u1'))).to.be.null
    const rows = await inspectIdbDeviceDB({ dbName }).rows()
    expect(rows.map((row) => row.ckey)).to.deep.equal(['device^acme^u1^main'])
    expect(await deviceDB.getDeviceRecord(TH.scopeOf('u1'))).to.deep.equal(TH.deviceRecordOf('u1'))
  })

  it("keeps every device record through a sweep: a device record's scopepath is one this version files", async () => {
    const dbName = TH.freshDbName()
    const shelf = createStore(`${dbName}:device_db`, 'records')
    await set('unlock:acme:u1:main', await TH.leaseOf('u1'), shelf)
    const deviceDB = TH.expectingGood(idbDeviceDB({ dbName }))
    await deviceDB.raiseDeviceRecord(TH.deviceRecordOf('u1'))
    await deviceDB.getLease(TH.scopeOf('u1'))
    const rows = await inspectIdbDeviceDB({ dbName }).rows()
    expect(rows.map((row) => row.ckey)).to.deep.equal([Scopepath.device(TH.scopeOf('u1'))])
  })

  it("sweeps a lease or device record filed under a name no scope check passes, which no read would ever reach", async () => {
    const dbName = TH.freshDbName()
    const shelf = createStore(`${dbName}:device_db`, 'records')
    await set('lease^acme^u1^Main', await TH.leaseOf('u1'), shelf)
    await set('lease^acme^u1^main^extra', await TH.leaseOf('u1'), shelf)
    await set('device^acme^u 1^main', TH.deviceRecordOf('u1'), shelf)
    const deviceDB = TH.expectingGood(idbDeviceDB({ dbName }))
    await deviceDB.putLease(await TH.leaseOf('u2'))
    await deviceDB.getLease(TH.scopeOf('u1'))
    const rows = await inspectIdbDeviceDB({ dbName }).rows()
    expect(rows.map((row) => row.ckey)).to.deep.equal([Scopepath.lease(TH.scopeOf('u2'))])
  })

  it("sweeps a device mark an earlier version filed under mark^ at the first read, keeping the device record", async () => {
    const dbName = TH.freshDbName()
    const shelf = createStore(`${dbName}:device_db`, 'records')
    await set('mark^acme^u1^main', { format: 'safebyok-mark-v1', applabel: 'acme', user_id: 'u1', vaultlabel: 'main' }, shelf)
    const deviceDB = TH.expectingGood(idbDeviceDB({ dbName }))
    await deviceDB.raiseDeviceRecord(TH.deviceRecordOf('u1'))
    await deviceDB.getLease(TH.scopeOf('u1'))
    const rows = await inspectIdbDeviceDB({ dbName }).rows()
    expect(rows.map((row) => row.ckey)).to.deep.equal([Scopepath.device(TH.scopeOf('u1'))])
  })

  it("reads a device record that does not pass its check as none, and drops it", async () => {
    const dbName = TH.freshDbName()
    const shelf = createStore(`${dbName}:device_db`, 'records')
    await set(Scopepath.device(TH.scopeOf('u1')), { ...TH.deviceRecordOf('u1'), highest_vault_epoch: 'one' }, shelf)
    const deviceDB = TH.expectingGood(idbDeviceDB({ dbName }))
    expect(await deviceDB.getDeviceRecord(TH.scopeOf('u1'))).to.be.null
    expect(await inspectIdbDeviceDB({ dbName }).rows()).to.have.lengthOf(0)
  })

  it("rings the device shelf's bell when a read sweeps, so an inspector stops showing the swept rows", async () => {
    const dbName = TH.freshDbName()
    const shelf = createStore(`${dbName}:device_db`, 'records')
    await set('unlock:acme:u1:main', await TH.leaseOf('u1'), shelf)
    const deviceDB = TH.expectingGood(idbDeviceDB({ dbName }))
    let heardCount = 0
    const unsubscribe = inspectIdbDeviceDB({ dbName }).subscribe(() => { heardCount += 1 })
    await deviceDB.getLease(TH.scopeOf('u2'))
    expect(heardCount).to.equal(1)
    await deviceDB.getLease(TH.scopeOf('u2'))
    expect(heardCount).to.equal(1)
    unsubscribe()
  })

  it("rings another tab's inspector for a write with nothing in this tab listening", async () => {
    const dbName = TH.freshDbName()
    // Another tab's inspector of the device shelf: a channel of the shelf's bell, opened apart.
    const otherTab = new BroadcastChannel(`safebyok-idb:${dbName}:device_db`)
    const otherHeard: unknown[] = []
    otherTab.addEventListener('message', (event) => { otherHeard.push(event.data) })
    try {
      await idbDeviceDB({ dbName }).delLease(TH.scopeOf('u1'))
      await vi.waitFor(() => { expect(otherHeard).to.deep.equal(['changed']) })
    } finally {
      otherTab.close()
    }
  })

  it("erases the scope's own lease even when the sweep fails", async () => {
    const dbName = TH.freshDbName()
    const shelfDB = idbDeviceDB({ dbName })
    await TH.expectGood(shelfDB.putLease(await TH.leaseOf('u1')))
    vi.spyOn(IDBObjectStore.prototype, 'getAllKeys').mockImplementation(() => { throw new Error('the shelf will not list') })
    try {
      const { cause } = await TH.expectBad(shelfDB.delLease(TH.scopeOf('u1')), 'storage_unavailable')
      expect(cause).to.have.property('message', 'the shelf will not list')
    } finally {
      vi.restoreAllMocks()
    }
    expect(await inspectIdbDeviceDB({ dbName }).rows()).to.have.lengthOf(0)
  })

  it("clears the whole shelf at delAll, a lease filed under the colon-joined ckey of 0.2 and before included", async () => {
    const dbName = TH.freshDbName()
    const shelf = createStore(`${dbName}:device_db`, 'records')
    await set('unlock:acme:u1:main', await TH.leaseOf('u1'), shelf)
    const deviceDB = TH.expectingGood(idbDeviceDB({ dbName }))
    await deviceDB.putLease(await TH.leaseOf('u2'))
    await deviceDB.delAll()
    expect(await inspectIdbDeviceDB({ dbName }).rows()).to.have.lengthOf(0)
  })
})

describe("inspectIdbDeviceDB", () => {
  it("shows the raw rows of the device shelf, hears writes, and wipes it clean", async () => {
    const dbName = TH.freshDbName()
    const deviceDB = TH.expectingGood(idbDeviceDB({ dbName }))
    const inspector = inspectIdbDeviceDB({ dbName })
    let heardCount = 0
    const unsubscribe = inspector.subscribe(() => { heardCount += 1 })

    await deviceDB.putLease(await TH.leaseOf('u1'))
    const rows = await inspector.rows()
    expect(rows.map((row) => row.ckey)).to.deep.equal(['lease^acme^u1^main'])
    await vi.waitFor(() => { expect(heardCount).to.be.greaterThan(0) })

    await inspector.wipe()
    expect(await inspector.rows()).to.have.lengthOf(0)
    expect(await deviceDB.getLease(TH.scopeOf('u1'))).to.be.null
    unsubscribe()
  })

  it("refuses a listener that is not a function as it subscribes, so no later write meets it", async () => {
    const dbName = TH.freshDbName()
    const inspector = inspectIdbDeviceDB({ dbName })
    expect(() => inspector.subscribe('not a listener' as unknown as () => void)).to.throw(VaultError, /listener function/)
    await idbDeviceDB({ dbName }).putLease(await TH.leaseOf('u1'))
    expect(await inspector.rows()).to.have.lengthOf(1)
  })
})
