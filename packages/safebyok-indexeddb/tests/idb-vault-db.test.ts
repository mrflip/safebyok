// fake-indexeddb installs a Node-side indexedDB global before the adapter loads: these tests
// exercise real IndexedDB semantics -- transactions, structured clone -- without a browser.
import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { createStore, get, set } from 'idb-keyval'
import type { UseStore } from 'idb-keyval'
import { Ckeys, memoryDeviceDB, VaultError } from 'safebyok'
import { idbVaultDB } from '../src/idb-vault-db'
import type { IdbVaultDBOpts } from '../src/idb-opts'
import { inspectIdbVaultDB } from '../src/inspect-idb-vault-db'
import * as TH from './test-helpers'


/** The turnstile of each database a race made its devices over, by the name idb-keyval opens it under. */
const turnstiles = vi.hoisted(() => new Map<string, { pass: () => Promise<void> }>())

// A device's round trip to IndexedDB is a transaction, which idb-keyval opens inside the store
// function createStore returns: this passes a race's turnstile just before each one opens, so a
// race can hold a device between two transactions. A database no race made goes straight through.
vi.mock('idb-keyval', async (importOriginal) => {
  const keyval = await importOriginal<typeof import('idb-keyval')>()
  const throughTurnstile = (dbName: string, storeName: string): UseStore => {
    const useStore = keyval.createStore(dbName, storeName)
    return async (txMode, callback) => {
      await turnstiles.get(dbName)?.pass()
      return useStore(txMode, callback)
    }
  }
  return { ...keyval, createStore: throughTurnstile }
})

/**
 * Devices over a fresh database: each an idbVaultDB of its own, each transaction passing the race's
 * turnstile. In one page they share the database's connection and its bell, as two tabs would not;
 * IndexedDB runs transactions that write one store one after another, whichever connection opened
 * them, as a browser does across tabs.
 */
const devicesOverOneDatabase: TH.MakeVaultDBDevices = (turnstile) => {
  const dbName = TH.freshDbName()
  turnstiles.set(`${dbName}:vault_db`, turnstile)
  return () => idbVaultDB({ dbName })
}

TH.describeVaultDB('idbVaultDB', (vaultDBOpts) => idbVaultDB({ ...vaultDBOpts, dbName: TH.freshDbName() }), { pushes: true, makeDevices: devicesOverOneDatabase })

describe("idbVaultDB's devices, for the battery's races", () => {
  it("open every write's transaction through the race's turnstile", async () => {
    await TH.expectRoundTripsThroughTurnstile(devicesOverOneDatabase)
  })
})

/** The shelf's object store, opened as the adapter opens it, for a test to read or plant rows. */
const rawShelf = (dbName: string) => createStore(`${dbName}:vault_db`, 'records')

/** Option bags idbVaultDB never takes: each refused as it is made, before a database opens. */
const BadOpts = [
  [{ dbName: "" },                             'an empty dbName'],
  [{ dbName: 42 },                             'a dbName that is not text'],
  [{ dbName: null },                           'a null dbName'],
  ["acme",                                     'a dbName passed bare, not in a bag'],
] as const

describe("idbVaultDB's options", () => {
  for (const [opts, blurb] of BadOpts) {
    it(`refuses ${blurb} with kind 'bad_option'`, () => {
      expect(() => idbVaultDB(opts as unknown as IdbVaultDBOpts)).to.throw(VaultError, /^idbVaultDB takes an optional dbName/).with.property('refusalkind', 'bad_option')
    })
  }

  it("keeps its records in 'safebyok' given no options, or no dbName", async () => {
    await TH.expectGood(idbVaultDB().ensureVaultProps(TH.vaultPropsOf('default_u1')))
    expect(await get('vault^acme^default_u1^main', rawShelf('safebyok'))).to.deep.equal(TH.vaultPropsOf('default_u1'))
    expect(await TH.expectingGood(idbVaultDB({ dbName: undefined })).getVaultProps(TH.scopeOf('default_u1'))).to.deep.equal(TH.vaultPropsOf('default_u1'))
  })
})

describe("idbVaultDB", () => {
  it("declares no per-record or per-vault limit, in bytes or in boxes, nor on a name: IndexedDB has none", () => {
    expect(idbVaultDB().maxRecordBytes).to.eq(Infinity)
    expect(idbVaultDB().maxVaultBytes).to.eq(Infinity)
    expect(idbVaultDB().maxBoxes).to.eq(Infinity)
    expect(idbVaultDB().maxNameBytes).to.eq(Infinity)
  })

  it("keeps each record as itself, field by field, at the ckey it always had", async () => {
    const dbName = TH.freshDbName()
    const vaultDB = idbVaultDB({ dbName })
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    await TH.expectingGood(vaultDB).putBox(TH.scopeOf('u1'), { vault_tok: 'vault-tok-u1', revision_tok: null }, TH.boxOf('anthropic', 'one'))
    expect(await inspectIdbVaultDB({ dbName }).rows()).to.deep.equal([
      { ckey: 'box^acme^u1^main^anthropic', row: TH.boxOf('anthropic', 'one') },
      { ckey: 'vault^acme^u1^main',         row: TH.vaultPropsOf('u1') },
    ])
  })

  it("reads rows filed under the ckeys of earlier versions as absent, and leaves them be", async () => {
    const dbName = TH.freshDbName()
    await set('vault:acme:u1:main', TH.vaultPropsOf('u1'), rawShelf(dbName))
    await set('box:acme:u1:main:anthropic', TH.boxOf('anthropic', 'one'), rawShelf(dbName))
    await set('["vault","acme","u1","main"]', TH.vaultPropsOf('u1'), rawShelf(dbName))
    await set('["box","acme","u1","main","anthropic"]', TH.boxOf('anthropic', 'one'), rawShelf(dbName))
    const vaultDB = idbVaultDB({ dbName })
    expect(await TH.expectingGood(vaultDB).getVaultProps(TH.scopeOf('u1'))).to.be.null
    expect(await TH.expectingGood(vaultDB).getBox(TH.scopeOf('u1'), 'anthropic')).to.be.null
    expect(await TH.expectingGood(vaultDB).listBoxes(TH.scopeOf('u1'))).to.have.lengthOf(0)
    expect(await inspectIdbVaultDB({ dbName }).rows()).to.have.lengthOf(4)
  })

  it("lists a vault's boxes by a key range over its prefix, reading no other vault's rows", async () => {
    const dbName = TH.freshDbName()
    const vaultDB = idbVaultDB({ dbName })
    const lookalike = TH.scopeOf('u1","main')
    for (const user of ['u1', 'u12', 'u2']) {
      await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf(user))
      await TH.expectingGood(vaultDB).putBox(TH.scopeOf(user), { vault_tok: `vault-tok-${user}`, revision_tok: null }, TH.boxOf('anthropic', user))
    }
    await set(Ckeys.box(lookalike, 'x'), TH.boxOf('x', 'lookalike'), rawShelf(dbName))
    const rangedGetAll = vi.spyOn(IDBObjectStore.prototype, 'getAll')
    const rangedGetAllKeys = vi.spyOn(IDBObjectStore.prototype, 'getAllKeys')
    const cursoring = vi.spyOn(IDBObjectStore.prototype, 'openCursor')
    try {
      const listed = await TH.expectingGood(vaultDB).listBoxes(TH.scopeOf('u1'))
      expect(listed.map((box) => box.boxlabel)).to.deep.equal(['anthropic'])
      expect(rangedGetAll).toHaveBeenCalledTimes(1)
      expect(rangedGetAll.mock.calls[0]?.[0]).to.be.instanceOf(IDBKeyRange)
      expect(rangedGetAllKeys).toHaveBeenCalledTimes(1)
      expect(rangedGetAllKeys.mock.calls[0]?.[0]).to.be.instanceOf(IDBKeyRange)
      expect(cursoring).not.toHaveBeenCalled()
    } finally {
      rangedGetAll.mockRestore()
      rangedGetAllKeys.mockRestore()
      cursoring.mockRestore()
    }
  })

  it("lists a row that is no box as damaged, under the boxlabel it is stored under", async () => {
    const dbName = TH.freshDbName()
    await set(Ckeys.vaultProps(TH.scopeOf('u1')), TH.vaultPropsOf('u1'), rawShelf(dbName))
    await set(Ckeys.box(TH.scopeOf('u1'), 'anthropic'), 'not a box', rawShelf(dbName))
    await set(Ckeys.box(TH.scopeOf('u1'), 'openai'), TH.boxOf('openai', 'two'), rawShelf(dbName))
    const listed = await TH.expectGood(idbVaultDB({ dbName }).listBoxes(TH.scopeOf('u1')))
    expect(listed[0]).to.deep.equal({ boxlabel: 'anthropic', damaged: true, revision_tok: null })
    expect(listed[1]).to.include({ boxlabel: 'openai', damaged: false })
  })

  it("deletes a row that is no box, listed with no revision, as the one a deletion naming none means", async () => {
    const dbName = TH.freshDbName()
    await set(Ckeys.vaultProps(TH.scopeOf('u1')), TH.vaultPropsOf('u1'), rawShelf(dbName))
    await set(Ckeys.box(TH.scopeOf('u1'), 'anthropic'), 'not a box', rawShelf(dbName))
    const vaultDB = idbVaultDB({ dbName })
    expect(await TH.expectingGood(vaultDB).delBox(TH.scopeOf('u1'), 'anthropic', TH.deleting(null))).to.deep.equal({ outcome: 'deleted' })
    const ckey = Ckeys.box(TH.scopeOf('u1'), 'anthropic')
    expect(await get(ckey, rawShelf(dbName))).to.be.undefined
  })

  it("refuses damaged vault props as damaged_vault, and leaves them as they are", async () => {
    const dbName = TH.freshDbName()
    await set(Ckeys.vaultProps(TH.scopeOf('u1')), { vault_tok: 'vault-tok-u1', gate_epoch: 'one' }, rawShelf(dbName))
    await TH.expectBad(idbVaultDB({ dbName }).getVaultProps(TH.scopeOf('u1')), 'damaged_vault')
    expect(await get('vault^acme^u1^main', rawShelf(dbName))).to.deep.equal({ vault_tok: 'vault-tok-u1', gate_epoch: 'one' })
  })

  it("lands no update on damaged vault props, even ones that show the expected vault_tok, refusing as a read of them does", async () => {
    const dbName = TH.freshDbName()
    await set(Ckeys.vaultProps(TH.scopeOf('u1')), { vault_tok: 'vault-tok-u1' }, rawShelf(dbName))
    const next = TH.vaultPropsOf('u1', { gate_epoch: 2 })
    await TH.expectBad(idbVaultDB({ dbName }).putVaultProps(next, { vault_tok: 'vault-tok-u1', gate_epoch: 1 }), 'damaged_vault')
    const standing: unknown = await get(Ckeys.vaultProps(TH.scopeOf('u1')), rawShelf(dbName))
    expect(standing).to.deep.equal({ vault_tok: 'vault-tok-u1' })
  })

  it("reads a vault's props and every box in one transaction, and ensures a gateless one, ringing other tabs once it is made", async () => {
    const dbName = TH.freshDbName()
    const vaultDB = idbVaultDB({ dbName })
    const { heard, onChange } = TH.changeCounter()
    const unsubscribe = vaultDB.subscribe(TH.scopeOf('u1'), onChange)
    await TH.expectingGood(vaultDB).ensureVault(TH.scopeOf('u1'), TH.gatelessOf('u1'))
    await TH.eventually(() => heard.count > 0)
    const rungOnMaking = heard.count
    await TH.expectingGood(vaultDB).ensureVault(TH.scopeOf('u1'), TH.gatelessOf('u1', { vault_tok: 'vault-tok-late' }))
    await TH.aWhile()
    expect(heard.count, 'an ensure that found the vault standing rang anyone').to.eq(rungOnMaking)
    unsubscribe()
    expect(await TH.expectingGood(vaultDB).getVault(TH.scopeOf('u1'))).to.deep.equal({ vaultProps: TH.gatelessOf('u1'), boxes: [] })
  })

  it("deletes a vault whose vault props are damaged -- delDamagedVault reads its vault_tok as stored -- and only that vault", async () => {
    const dbName = TH.freshDbName()
    const vaultDB = idbVaultDB({ dbName })
    for (const user of ['u1', 'u2']) {
      await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf(user))
      await TH.expectingGood(vaultDB).putBox(TH.scopeOf(user), { vault_tok: `vault-tok-${user}`, revision_tok: null }, TH.boxOf('anthropic', 'one'))
    }
    await set(Ckeys.vaultProps(TH.scopeOf('u1')), { vault_tok: 'vault-tok-u1', gate_epoch: 'one' }, rawShelf(dbName))
    await TH.expectBad(vaultDB.delDamagedVault(TH.scopeOf('u2')), 'bad_option')
    await TH.expectingGood(vaultDB).delDamagedVault(TH.scopeOf('u1'))
    const shelf = rawShelf(dbName)
    const ourVaultProps = Ckeys.vaultProps(TH.scopeOf('u1'))
    const ourBox = Ckeys.box(TH.scopeOf('u1'), 'anthropic')
    expect(await get(ourVaultProps, shelf)).to.be.undefined
    expect(await get(ourBox, shelf)).to.be.undefined
    expect(await TH.expectingGood(vaultDB).getVaultProps(TH.scopeOf('u2'))).to.deep.equal(TH.vaultPropsOf('u2'))
    const theirs = await TH.expectingGood(vaultDB).listBoxes(TH.scopeOf('u2'))
    expect(theirs.map((box) => box.boxlabel)).to.deep.equal(['anthropic'])
  })

  it("refuses trouble from IndexedDB itself as storage_unavailable", async () => {
    const vaultDB = idbVaultDB({ dbName: TH.freshDbName() })
    const blocked = vi.spyOn(globalThis.indexedDB, 'open').mockImplementation(() => { throw new DOMException('IndexedDB is off', 'InvalidStateError') })
    try {
      await TH.expectBad(vaultDB.getVaultProps(TH.scopeOf('u1')), 'storage_unavailable')
    } finally {
      blocked.mockRestore()
    }
  })

  const WithheldCases = [
    ["SecurityError",       'storage withheld from the page: site data blocked, a sandboxed frame'],
    ["QuotaExceededError",  'no room: a quota of zero, as some private windows give, or a full disk'],
    ["NotSupportedError",   'no storage of the kind'],
  ] as const

  for (const [errName, blurb] of WithheldCases) {
    it(`refuses a browser's ${errName} as storage_blocked, by the rule the vault says its device store's by: ${blurb}`, async () => {
      const vaultDB = idbVaultDB({ dbName: TH.freshDbName() })
      const withheld = new DOMException('The browser refused.', errName)
      const blocked = vi.spyOn(globalThis.indexedDB, 'open').mockImplementation(() => { throw withheld })
      try {
        const refusal = await TH.expectBad(vaultDB.getVaultProps(TH.scopeOf('u1')), 'storage_blocked')
        expect(refusal.message).to.include('will not help until that changes')
        expect((refusal as { cause?: unknown }).cause).to.eq(withheld)
      } finally {
        blocked.mockRestore()
      }
    })
  }

  it("refuses as storage_blocked in a context with no IndexedDB at all", async () => {
    const vaultDB = idbVaultDB({ dbName: TH.freshDbName() })
    vi.stubGlobal('indexedDB', undefined)
    try {
      const refusal = await TH.expectBad(vaultDB.ensureVaultProps(TH.vaultPropsOf('u1')), 'storage_blocked')
      expect(refusal.message).to.include('no IndexedDB')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("has hello() refuse as storage_blocked when the browser withholds the vault's storage", async () => {
    const vaultDB = idbVaultDB({ dbName: TH.freshDbName() })
    const opts = { applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB, keyDeriver: TH.testDeriver, strengthChecker: TH.anyStrengthChecker, deviceDB: memoryDeviceDB() }
    const blocked = vi.spyOn(globalThis.indexedDB, 'open').mockImplementation(() => { throw new DOMException('The operation is insecure.', 'SecurityError') })
    try {
      await TH.expectRefusal(TH.settledVault(opts), 'storage_blocked')
    } finally {
      blocked.mockRestore()
    }
  })

  it("reports a write aborted from outside with the error its request failed with, never a null cause", async () => {
    const vaultDB = idbVaultDB({ dbName: TH.freshDbName() })
    // A transaction aborted from outside has a null error; its pending put fails with an AbortError.
    const aborting = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(function (this: IDBObjectStore, ...args) {
      const request = this.put(...args)
      this.transaction.abort()
      return request
    })
    try {
      const refusal = await TH.expectBad(vaultDB.ensureVaultProps(TH.vaultPropsOf('u1')), 'storage_unavailable')
      const { cause } = refusal as { cause?: unknown }
      expect(cause).to.be.instanceOf(Error)
      expect((cause as Error).name).to.eq('AbortError')
    } finally {
      aborting.mockRestore()
    }
    expect(await TH.expectingGood(vaultDB).getVaultProps(TH.scopeOf('u1'))).to.be.null
  })

  it("serves Vault.make and hello(): a vault made, stored in and reopened over it", async () => {
    const dbName = TH.freshDbName()
    const opts = { applabel: 'acme', userId: 'u1', vaultlabel: 'main', keyDeriver: TH.testDeriver, strengthChecker: TH.anyStrengthChecker, deviceDB: memoryDeviceDB() }
    const vault = await TH.settledVault({ ...opts, vaultDB: idbVaultDB({ dbName }) })
    await vault.unlock('correct horse')
    await vault.putBox('anthropic', 'sk-not-a-real-key')
    vault.close()
    const reopened = await TH.settledVault({ ...opts, vaultDB: idbVaultDB({ dbName }) })
    await reopened.unlock('correct horse')
    expect(await reopened.getWhisper('anthropic')).to.eq('sk-not-a-real-key')
    reopened.close()
  })
})

describe("idbVaultDB, every verb one transaction", () => {
  const scope = TH.scopeOf('u1')

  it("deletes a vault's boxes by a key range over its prefix, leaving every other vault's rows", async () => {
    const dbName = TH.freshDbName()
    const vaultDB = idbVaultDB({ dbName })
    const lookalike = TH.scopeOf('u1","main')
    for (const user of ['u1', 'u12', 'u2']) {
      await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf(user))
      await TH.expectingGood(vaultDB).putBox(TH.scopeOf(user), { vault_tok: `vault-tok-${user}`, revision_tok: null }, TH.boxOf('anthropic', user))
    }
    await set(Ckeys.box(lookalike, 'x'), TH.boxOf('x', 'lookalike'), rawShelf(dbName))
    const wholeShelf = vi.spyOn(IDBObjectStore.prototype, 'getAllKeys')
    try {
      await TH.expectingGood(vaultDB).delVault(scope, { vault_tok: 'vault-tok-u1' })
      expect(wholeShelf).not.toHaveBeenCalled()
    } finally {
      wholeShelf.mockRestore()
    }
    const rows = await inspectIdbVaultDB({ dbName }).rows()
    expect(rows.map((row) => row.ckey)).to.deep.equal([
      Ckeys.box(lookalike, 'x'),
      Ckeys.box(TH.scopeOf('u12'), 'anthropic'),
      Ckeys.box(TH.scopeOf('u2'), 'anthropic'),
      Ckeys.vaultProps(TH.scopeOf('u12')),
      Ckeys.vaultProps(TH.scopeOf('u2')),
    ].toSorted((one, two) => one.localeCompare(two)))
  })

  it("deletes a whole vault or none of it: a deletion failing midway undoes the ones before it", async () => {
    const dbName = TH.freshDbName()
    const vaultDB = idbVaultDB({ dbName })
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    await TH.expectingGood(vaultDB).putBox(scope, { vault_tok: 'vault-tok-u1', revision_tok: null }, TH.boxOf('anthropic', 'one'))
    const failing = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementationOnce(function (this: IDBObjectStore, ckey) {
      this.delete(ckey)
      throw new DOMException('the disk is full', 'QuotaExceededError')
    })
    try {
      await TH.expectBad(vaultDB.delVault(scope, { vault_tok: 'vault-tok-u1' }), 'storage_blocked')
    } finally {
      failing.mockRestore()
    }
    expect(await TH.expectingGood(vaultDB).getVaultProps(scope)).to.deep.equal(TH.vaultPropsOf('u1'))
    expect(await TH.expectingGood(vaultDB).getBox(scope, 'anthropic')).to.deep.equal(TH.boxOf('anthropic', 'one'))
  })
})

/** A host's listener that throws, as a careless one might. */
const throwing = () => { throw new Error('a listener of the host') }

describe("idbVaultDB's subscribe", () => {
  it("rings for no write that was refused", async () => {
    const vaultDB = idbVaultDB({ dbName: TH.freshDbName() })
    let heardCount = 0
    vaultDB.subscribe(TH.scopeOf('u1'), () => { heardCount += 1 })
    await TH.expectBad(vaultDB.putVaultProps(TH.vaultPropsOf('u1'), { vault_tok: 'vault-tok-u1', gate_epoch: 1 }), 'stale_write')
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1', { vault_tok: 'too-late' }))
    await TH.wakeupAtNextTick()
    expect(heardCount).to.eq(1)
  })

  it("rings for a deletion that removed a box, and for none that found nothing to remove", async () => {
    const vaultDB = idbVaultDB({ dbName: TH.freshDbName() })
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    await TH.expectingGood(vaultDB).putBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one'))
    await TH.wakeupAtNextTick()
    let heardCount = 0
    vaultDB.subscribe(TH.scopeOf('u1'), () => { heardCount += 1 })
    expect(await TH.expectingGood(vaultDB).delBox(TH.scopeOf('u1'), 'anthropic', TH.deleting('rev-one'))).to.deep.equal({ outcome: 'deleted' })
    await TH.wakeupAtNextTick()
    expect(heardCount).to.eq(1)
    expect(await TH.expectingGood(vaultDB).delBox(TH.scopeOf('u1'), 'anthropic', TH.deleting('rev-one'))).to.deep.equal({ outcome: 'absent' })
    await TH.wakeupAtNextTick()
    expect(heardCount).to.eq(1)
  })

  it("hears another tab's write, over the BroadcastChannel", async () => {
    const dbName = TH.freshDbName()
    let heardCount = 0
    idbVaultDB({ dbName }).subscribe(TH.scopeOf('u1'), () => { heardCount += 1 })
    const otherTab = new BroadcastChannel(`safebyok-idb:${dbName}:vault_db`)
    otherTab.postMessage('changed')
    await vi.waitFor(() => { expect(heardCount).to.eq(1) })
    otherTab.close()
  })

  it("tells other tabs of a write, though nothing in this tab listens", async () => {
    const dbName = TH.freshDbName()
    const otherTab = new BroadcastChannel(`safebyok-idb:${dbName}:vault_db`)
    let heardCount = 0
    otherTab.addEventListener('message', () => { heardCount += 1 })
    await TH.expectGood(idbVaultDB({ dbName }).ensureVaultProps(TH.vaultPropsOf('u1')))
    await vi.waitFor(() => { expect(heardCount).to.eq(1) })
    otherTab.close()
  })

  it("closes the bell's channel when the last subscriber leaves, and not before", () => {
    const dbName = TH.freshDbName()
    const vaultDB = idbVaultDB({ dbName })
    const closing = vi.spyOn(BroadcastChannel.prototype, 'close')
    try {
      const stopOne = vaultDB.subscribe(TH.scopeOf('u1'), () => undefined)
      const stopTwo = vaultDB.subscribe(TH.scopeOf('u1'), () => undefined)
      stopOne()
      expect(closing).not.toHaveBeenCalled()
      stopTwo()
      expect(closing).toHaveBeenCalledTimes(1)
    } finally {
      closing.mockRestore()
    }
  })

  it("closes the bell's channel when its vault closes", async () => {
    const dbName = TH.freshDbName()
    const vault = await TH.settledVault({ applabel: 'acme', userId: 'u1', vaultlabel: 'main', keyDeriver: TH.testDeriver, strengthChecker: TH.anyStrengthChecker, deviceDB: memoryDeviceDB(), vaultDB: idbVaultDB({ dbName }) })
    const closing = vi.spyOn(BroadcastChannel.prototype, 'close')
    try {
      vault.close()
      expect(closing).toHaveBeenCalledTimes(1)
    } finally {
      closing.mockRestore()
    }
  })

  it("lands a write whose subscriber throws, and calls the others, letting nothing escape uncaught", async () => {
    const vaultDB = idbVaultDB({ dbName: TH.freshDbName() })
    let heardCount = 0
    const thrower = vi.fn(throwing)
    vaultDB.subscribe(TH.scopeOf('u1'), thrower)
    vaultDB.subscribe(TH.scopeOf('u1'), () => { heardCount += 1 })
    // Whatever would escape the bell's microtasks, as the platform's uncaught error, lands here.
    const escaped: unknown[] = []
    const queueMicrotask = globalThis.queueMicrotask.bind(globalThis)
    const catching = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((task) => {
      queueMicrotask(() => {
        try {
          task()
        } catch (err) {
          escaped.push(err)
        }
      })
    })
    try {
      await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
      await vi.waitFor(() => { expect(heardCount).to.eq(1) })
      await TH.wakeupAtNextTick()
    } finally {
      catching.mockRestore()
    }
    expect(await TH.expectingGood(vaultDB).getVaultProps(TH.scopeOf('u1'))).to.deep.equal(TH.vaultPropsOf('u1'))
    expect(thrower).toHaveBeenCalledOnce()
    expect(escaped).to.be.empty
  })
})
