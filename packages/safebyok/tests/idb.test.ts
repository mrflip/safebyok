// fake-indexeddb installs a Node-side indexedDB global before the store loads: these tests
// exercise real IndexedDB semantics (structured clone included) without a browser.
import 'fake-indexeddb/auto'
import { createStore, set } from 'idb-keyval'
import { describe, expect, it, vi } from 'vitest'
import { idbDeviceDB, inspectIdbDeviceDB, type IdbOpts } from '../src/idb'
import * as Entry from '../src/idb'
import { VaultError } from '../src/errors'
import * as Ckeys from '../src/ckeys'
import * as TH from './test-helpers'

// Each test gets its own database, so tests never see each other's rows.
TH.describeDeviceDB('idbDeviceDB', () => idbDeviceDB({ dbName: TH.freshDbName() }))

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
        expect(() => make(opts as unknown as IdbOpts)).to.throw(VaultError, /dbName/).with.property('kind', 'bad_option')
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
    it(`refuses at its first use with a NotSupportedError, in ${blurb}`, async () => {
      const deviceDB = idbDeviceDB({ dbName: TH.freshDbName() })
      vi.stubGlobal('indexedDB', factory)
      try {
        await expect(deviceDB.readMark(TH.scopeOf('u1'))).rejects.toThrow(expect.objectContaining({ name: 'NotSupportedError' }))
      } finally {
        vi.unstubAllGlobals()
      }
    })
  }

  it("sweeps an unlock filed under an earlier version's ckey at the first read, never reading it", async () => {
    const dbName = TH.freshDbName()
    const shelf = createStore(`${dbName}:device_db`, 'records')
    await set('unlock:acme:u1:main', await TH.unlockOf('u1'), shelf)
    await set(['unlock', 'acme', 'u1', 'main'], await TH.unlockOf('u1'), shelf)
    const deviceDB = idbDeviceDB({ dbName })
    await deviceDB.writeUnlock(await TH.unlockOf('u2'), TH.NoLocks)
    const gets = vi.spyOn(IDBObjectStore.prototype, 'get')
    const getAlls = vi.spyOn(IDBObjectStore.prototype, 'getAll')
    const cursors = vi.spyOn(IDBObjectStore.prototype, 'openCursor')
    try {
      expect(await deviceDB.readUnlock(TH.scopeOf('u1'))).to.be.null
      expect(gets.mock.calls.map(([ckey]) => ckey)).to.deep.equal([Ckeys.unlock(TH.scopeOf('u1'))])
      expect(getAlls).to.have.callCount(0)
      expect(cursors).to.have.callCount(0)
    } finally {
      vi.restoreAllMocks()
    }
    const rows = await inspectIdbDeviceDB({ dbName }).rows()
    expect(rows.map((row) => row.ckey)).to.deep.equal([Ckeys.unlock(TH.scopeOf('u2'))])
  })

  it("sweeps them at an erase too, keeping every unlock it filed", async () => {
    const dbName = TH.freshDbName()
    const shelf = createStore(`${dbName}:device_db`, 'records')
    await set('unlock:acme:u1:main', await TH.unlockOf('u1'), shelf)
    const deviceDB = idbDeviceDB({ dbName })
    await deviceDB.writeUnlock(await TH.unlockOf('u2'), TH.NoLocks)
    await deviceDB.eraseUnlock(TH.scopeOf('u3'))
    expect(await deviceDB.readUnlock(TH.scopeOf('u2'))).to.not.be.null
    const rows = await inspectIdbDeviceDB({ dbName }).rows()
    expect(rows.map((row) => row.ckey)).to.deep.equal([Ckeys.unlock(TH.scopeOf('u2'))])
  })

  it("keeps every device mark through a sweep: a mark's ckey is one this version files", async () => {
    const dbName = TH.freshDbName()
    const shelf = createStore(`${dbName}:device_db`, 'records')
    await set('unlock:acme:u1:main', await TH.unlockOf('u1'), shelf)
    const deviceDB = idbDeviceDB({ dbName })
    await deviceDB.writeMark(TH.markOf('u1'))
    await deviceDB.readUnlock(TH.scopeOf('u1'))
    const rows = await inspectIdbDeviceDB({ dbName }).rows()
    expect(rows.map((row) => row.ckey)).to.deep.equal([Ckeys.mark(TH.scopeOf('u1'))])
  })

  it("reads a mark that does not pass its check as none, and drops it", async () => {
    const dbName = TH.freshDbName()
    const shelf = createStore(`${dbName}:device_db`, 'records')
    await set(Ckeys.mark(TH.scopeOf('u1')), { ...TH.markOf('u1', { seen: null }), seen: { ...TH.markOf('u1').seen, unlock_epoch: 'one' } }, shelf)
    const deviceDB = idbDeviceDB({ dbName })
    expect(await deviceDB.readMark(TH.scopeOf('u1'))).to.be.null
    expect(await inspectIdbDeviceDB({ dbName }).rows()).to.have.lengthOf(0)
  })

  it("rings the device shelf's bell when a read sweeps, so an inspector stops showing the swept rows", async () => {
    const dbName = TH.freshDbName()
    const shelf = createStore(`${dbName}:device_db`, 'records')
    await set('unlock:acme:u1:main', await TH.unlockOf('u1'), shelf)
    const deviceDB = idbDeviceDB({ dbName })
    let heardCount = 0
    const unsubscribe = inspectIdbDeviceDB({ dbName }).subscribe(() => { heardCount += 1 })
    await deviceDB.readUnlock(TH.scopeOf('u2'))
    expect(heardCount).to.equal(1)
    await deviceDB.readUnlock(TH.scopeOf('u2'))
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
      await idbDeviceDB({ dbName }).eraseUnlock(TH.scopeOf('u1'))
      await vi.waitFor(() => { expect(otherHeard).to.deep.equal(['changed']) })
    } finally {
      otherTab.close()
    }
  })

  it("forgets the scope's own unlock at an erase even when the sweep fails", async () => {
    const dbName = TH.freshDbName()
    const deviceDB = idbDeviceDB({ dbName })
    await deviceDB.writeUnlock(await TH.unlockOf('u1'), TH.NoLocks)
    vi.spyOn(IDBObjectStore.prototype, 'getAllKeys').mockImplementation(() => { throw new Error('the shelf will not list') })
    try {
      await expect(deviceDB.eraseUnlock(TH.scopeOf('u1'))).rejects.toThrow('the shelf will not list')
    } finally {
      vi.restoreAllMocks()
    }
    expect(await inspectIdbDeviceDB({ dbName }).rows()).to.have.lengthOf(0)
  })

  it("clears the whole shelf at eraseAll, an unlock filed under the colon-joined ckey of 0.2 and before included", async () => {
    const dbName = TH.freshDbName()
    const shelf = createStore(`${dbName}:device_db`, 'records')
    await set('unlock:acme:u1:main', await TH.unlockOf('u1'), shelf)
    const deviceDB = idbDeviceDB({ dbName })
    await deviceDB.writeUnlock(await TH.unlockOf('u2'), TH.NoLocks)
    await deviceDB.eraseAll()
    expect(await inspectIdbDeviceDB({ dbName }).rows()).to.have.lengthOf(0)
  })
})

describe("inspectIdbDeviceDB", () => {
  it("shows the raw rows of the device shelf, hears writes, and wipes it clean", async () => {
    const dbName = TH.freshDbName()
    const deviceDB = idbDeviceDB({ dbName })
    const inspector = inspectIdbDeviceDB({ dbName })
    let heardCount = 0
    const unsubscribe = inspector.subscribe(() => { heardCount += 1 })

    await deviceDB.writeUnlock(await TH.unlockOf('u1'), TH.NoLocks)
    const rows = await inspector.rows()
    expect(rows.map((row) => row.ckey)).to.deep.equal(['unlock^acme^u1^main'])
    await vi.waitFor(() => { expect(heardCount).to.be.greaterThan(0) })

    await inspector.wipe()
    expect(await inspector.rows()).to.have.lengthOf(0)
    expect(await deviceDB.readUnlock(TH.scopeOf('u1'))).to.be.null
    unsubscribe()
  })

  it("refuses a listener that is not a function as it subscribes, so no later write meets it", async () => {
    const dbName = TH.freshDbName()
    const inspector = inspectIdbDeviceDB({ dbName })
    expect(() => inspector.subscribe('not a listener' as unknown as () => void)).to.throw(VaultError, /listener function/)
    await idbDeviceDB({ dbName }).writeUnlock(await TH.unlockOf('u1'), TH.NoLocks)
    expect(await inspector.rows()).to.have.lengthOf(1)
  })
})
