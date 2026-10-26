// fake-indexeddb installs a Node-side indexedDB global before the adapter loads: these tests
// exercise real IndexedDB semantics -- transactions, structured clone -- without a browser.
import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { createStore, get, set } from 'idb-keyval'
import type { UseStore } from 'idb-keyval'
import { Scopepath, memoryDeviceDB, VaultError } from 'safebyok'
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
    await TH.ensureGated(idbVaultDB(), TH.vaultPropsOf('default_u1'))
    expect(await get('vault^acme^default_u1^main', rawShelf('safebyok'))).to.deep.equal(TH.vaultPropsOf('default_u1'))
    expect(await TH.propsOf(idbVaultDB({ dbName: undefined }), TH.scopeOf('default_u1'))).to.deep.equal(TH.vaultPropsOf('default_u1'))
  })
})

describe("idbVaultDB", () => {
  it("declares no per-record or per-vault limit, in bytes or in boxes, nor on a name: IndexedDB has none", () => {
    expect(idbVaultDB().maxRecordBytes).to.eq(Infinity)
    expect(idbVaultDB().maxVaultBytes).to.eq(Infinity)
    expect(idbVaultDB().maxBoxes).to.eq(Infinity)
    expect(idbVaultDB().maxNameBytes).to.eq(Infinity)
  })

  it("keeps each record as itself, field by field, at the scopepath it always had", async () => {
    const dbName = TH.freshDbName()
    const vaultDB = idbVaultDB({ dbName })
    await TH.ensureGated(vaultDB, TH.vaultPropsOf('u1'))
    await TH.expectingGood(vaultDB).putBox(TH.scopeOf('u1'), { vault_tok: 'vault-tok-u1', revision_tok: null }, TH.boxOf('anthropic', 'one'))
    expect(await inspectIdbVaultDB({ dbName }).rows()).to.deep.equal([
      { ckey: 'box^acme^u1^main^anthropic', row: TH.boxOf('anthropic', 'one') },
      { ckey: 'vault^acme^u1^main',         row: TH.vaultPropsOf('u1') },
    ])
  })

  it("reads rows filed under the keys of earlier versions as absent, and leaves them be", async () => {
    const dbName = TH.freshDbName()
    await set('vault:acme:u1:main', TH.vaultPropsOf('u1'), rawShelf(dbName))
    await set('box:acme:u1:main:anthropic', TH.boxOf('anthropic', 'one'), rawShelf(dbName))
    await set('["vault","acme","u1","main"]', TH.vaultPropsOf('u1'), rawShelf(dbName))
    await set('["box","acme","u1","main","anthropic"]', TH.boxOf('anthropic', 'one'), rawShelf(dbName))
    const vaultDB = idbVaultDB({ dbName })
    expect(await TH.propsOf(vaultDB, TH.scopeOf('u1'))).to.be.null
    await TH.expectBad(vaultDB.getBox(TH.scopeOf('u1'), 'anthropic', TH.inThisVault), 'vault_mismatch')
    expect(await inspectIdbVaultDB({ dbName }).rows()).to.have.lengthOf(4)
  })

  it("passes over a row under the vault's prefix that no box is filed under, listing the rest rather than failing the read", async () => {
    const dbName = TH.freshDbName()
    const vaultDB = idbVaultDB({ dbName })
    await TH.ensureGated(vaultDB, TH.vaultPropsOf('u1'))
    await TH.expectingGood(vaultDB).putBox(TH.scopeOf('u1'), { vault_tok: 'vault-tok-u1', revision_tok: null }, TH.boxOf('anthropic', 'one'))
    for (const tail of ['Open AI', 'x^y', '']) {
      await set(Scopepath.withinVaultScopepathPrefix(TH.scopeOf('u1')) + tail, TH.boxOf('openai', 'two'), rawShelf(dbName))
    }
    const listed = await TH.boxesOf(vaultDB, TH.scopeOf('u1'))
    expect(listed.map((box) => box.boxlabel)).to.deep.equal(['anthropic'])
    const capacity = await TH.expectingGood(vaultDB).getCapacity(TH.scopeOf('u1'))
    expect(capacity.boxes.used).to.eq(4)
  })

  it("lists a vault's boxes by a key range over its prefix, reading no other vault's rows", async () => {
    const dbName = TH.freshDbName()
    const vaultDB = idbVaultDB({ dbName })
    const lookalike = TH.scopeOf('u1', 'main2')
    for (const user of ['u1', 'u12', 'u2']) {
      await TH.ensureGated(vaultDB, TH.vaultPropsOf(user))
      await TH.expectingGood(vaultDB).putBox(TH.scopeOf(user), { vault_tok: `vault-tok-${user}`, revision_tok: null }, TH.boxOf('anthropic', user))
    }
    await set(Scopepath.box({ ...lookalike, boxlabel: 'xx' }), TH.boxOf('xx', 'lookalike'), rawShelf(dbName))
    const rangedGetAll = vi.spyOn(IDBObjectStore.prototype, 'getAll')
    const rangedGetAllKeys = vi.spyOn(IDBObjectStore.prototype, 'getAllKeys')
    const cursoring = vi.spyOn(IDBObjectStore.prototype, 'openCursor')
    try {
      const listed = await TH.boxesOf(vaultDB, TH.scopeOf('u1'))
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
    await set(Scopepath.vault(TH.scopeOf('u1')), TH.vaultPropsOf('u1'), rawShelf(dbName))
    await set(Scopepath.box({ ...TH.scopeOf('u1'), boxlabel: 'anthropic' }), 'not a box', rawShelf(dbName))
    await set(Scopepath.box({ ...TH.scopeOf('u1'), boxlabel: 'openai' }), TH.boxOf('openai', 'two'), rawShelf(dbName))
    const listed = await TH.boxesOf(idbVaultDB({ dbName }), TH.scopeOf('u1'))
    expect(listed[0]).to.deep.equal({ boxlabel: 'anthropic', damaged: true, revision_tok: null })
    expect(listed[1]).to.include({ boxlabel: 'openai', damaged: false })
  })

  it("deletes a row that is no box, listed with no revision, as the one a deletion naming none means", async () => {
    const dbName = TH.freshDbName()
    await set(Scopepath.vault(TH.scopeOf('u1')), TH.vaultPropsOf('u1'), rawShelf(dbName))
    await set(Scopepath.box({ ...TH.scopeOf('u1'), boxlabel: 'anthropic' }), 'not a box', rawShelf(dbName))
    const vaultDB = idbVaultDB({ dbName })
    expect(await TH.expectingGood(vaultDB).delBox(TH.scopeOf('u1'), 'anthropic', TH.deleting(null))).to.deep.equal({ outcome: 'deleted' })
    const boxScopepath = Scopepath.box({ ...TH.scopeOf('u1'), boxlabel: 'anthropic' })
    expect(await get(boxScopepath, rawShelf(dbName))).to.be.undefined
  })

  it("refuses damaged vault props as damaged_vault, and leaves them as they are", async () => {
    const dbName = TH.freshDbName()
    await set(Scopepath.vault(TH.scopeOf('u1')), { vault_tok: 'vault-tok-u1', gate_epoch: 'one' }, rawShelf(dbName))
    await TH.expectBad(idbVaultDB({ dbName }).getVault(TH.scopeOf('u1')), 'damaged_vault')
    expect(await get('vault^acme^u1^main', rawShelf(dbName))).to.deep.equal({ vault_tok: 'vault-tok-u1', gate_epoch: 'one' })
  })

  it("lands no update on damaged vault props, even ones that show the expected vault_tok, refusing as a read of them does", async () => {
    const dbName = TH.freshDbName()
    await set(Scopepath.vault(TH.scopeOf('u1')), { vault_tok: 'vault-tok-u1' }, rawShelf(dbName))
    const next = TH.vaultPropsOf('u1', { gate_epoch: 2 })
    await TH.expectBad(idbVaultDB({ dbName }).putVaultProps(next, { vault_tok: 'vault-tok-u1', gate_epoch: 1 }), 'damaged_vault')
    const standing: unknown = await get(Scopepath.vault(TH.scopeOf('u1')), rawShelf(dbName))
    expect(standing).to.deep.equal({ vault_tok: 'vault-tok-u1' })
  })

  it("reads a vault's props and every box in one transaction, and ensures a gateless one, ringing other tabs once it is made", async () => {
    const dbName = TH.freshDbName()
    const vaultDB = idbVaultDB({ dbName })
    const { heard, onChange } = TH.changeCounter()
    const unsubscribe = vaultDB.subscribe(TH.scopeOf('u1'), onChange)
    await TH.expectingGood(vaultDB).ensureVault(TH.gatelessOf('u1'))
    await TH.eventually(() => heard.count > 0)
    const rungOnMaking = heard.count
    await TH.expectingGood(vaultDB).ensureVault(TH.gatelessOf('u1', { vault_tok: 'vault-tok-late' }))
    await TH.aWhile()
    expect(heard.count, 'an ensure that found the vault standing rang anyone').to.eq(rungOnMaking)
    unsubscribe()
    expect(await TH.expectingGood(vaultDB).getVault(TH.scopeOf('u1'))).to.deep.equal({ vaultProps: TH.gatelessOf('u1'), boxes: [] })
  })

  it("deletes a vault whose vault props are damaged -- delDamagedVault reads its vault_tok as stored -- and only that vault", async () => {
    const dbName = TH.freshDbName()
    const vaultDB = idbVaultDB({ dbName })
    for (const user of ['u1', 'u2']) {
      await TH.ensureGated(vaultDB, TH.vaultPropsOf(user))
      await TH.expectingGood(vaultDB).putBox(TH.scopeOf(user), { vault_tok: `vault-tok-${user}`, revision_tok: null }, TH.boxOf('anthropic', 'one'))
    }
    await set(Scopepath.vault(TH.scopeOf('u1')), { vault_tok: 'vault-tok-u1', gate_epoch: 'one' }, rawShelf(dbName))
    await TH.expectBad(vaultDB.delDamagedVault(TH.scopeOf('u2')), 'bad_option')
    await TH.expectingGood(vaultDB).delDamagedVault(TH.scopeOf('u1'))
    const shelf = rawShelf(dbName)
    const ourVaultProps = Scopepath.vault(TH.scopeOf('u1'))
    const ourBox = Scopepath.box({ ...TH.scopeOf('u1'), boxlabel: 'anthropic' })
    expect(await get(ourVaultProps, shelf), 'a tombstone in the place of the vault props').to.deep.include({ format: 'safebyok-tombstone-v1', vault_epoch: 1 })
    expect(await get(ourBox, shelf)).to.be.undefined
    expect(await TH.propsOf(vaultDB, TH.scopeOf('u2'))).to.deep.equal(TH.vaultPropsOf('u2'))
    const theirs = await TH.boxesOf(vaultDB, TH.scopeOf('u2'))
    expect(theirs.map((box) => box.boxlabel)).to.deep.equal(['anthropic'])
  })

  it("lays the tombstone of a deleted vault in the row its vault props were in, boxes gone, and replaces it with the new life", async () => {
    const dbName = TH.freshDbName()
    const vaultDB = idbVaultDB({ dbName })
    await TH.ensureGated(vaultDB, TH.vaultPropsOf('u1'))
    await TH.expectingGood(vaultDB).putBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one'))
    await TH.expectingGood(vaultDB).delVault(TH.scopeOf('u1'), TH.thisVault)
    const leftRows = await inspectIdbVaultDB({ dbName }).rows()
    const left = leftRows.map((row) => [row.ckey, row.row])
    expect(left).to.deep.equal([[Scopepath.vault(TH.scopeOf('u1')), { format: 'safebyok-tombstone-v1', ...TH.scopeOf('u1'), vault_epoch: 2 }]])
    await TH.expectingGood(vaultDB).ensureVault(TH.gatelessOf('u1', { vault_tok: 'vault-tok-reborn' }))
    const rebornRows = await inspectIdbVaultDB({ dbName }).rows()
    const reborn = rebornRows.map((row) => row.row)
    expect(reborn).to.deep.equal([TH.gatelessOf('u1', { vault_tok: 'vault-tok-reborn', vault_epoch: 2 })])
  })

  it("refuses trouble from IndexedDB itself as storage_unavailable", async () => {
    const vaultDB = idbVaultDB({ dbName: TH.freshDbName() })
    const blocked = vi.spyOn(globalThis.indexedDB, 'open').mockImplementation(() => { throw new DOMException('IndexedDB is off', 'InvalidStateError') })
    try {
      await TH.expectBad(vaultDB.getVault(TH.scopeOf('u1')), 'storage_unavailable')
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
        const refusal = await TH.expectBad(vaultDB.getVault(TH.scopeOf('u1')), 'storage_blocked')
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
      const refusal = await TH.expectBad(vaultDB.ensureVault(TH.gatelessOf('u1')), 'storage_blocked')
      expect(refusal.message).to.include('no IndexedDB')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("has hello() refuse as storage_blocked when the browser withholds the vault's storage", async () => {
    const vaultDB = idbVaultDB({ dbName: TH.freshDbName() })
    const opts = { applabel: 'acme', user_id: 'u1', vaultlabel: 'main', vaultDB, keyDeriver: TH.testDeriver, strengthChecker: TH.anyStrengthChecker, deviceDB: memoryDeviceDB() }
    const blocked = vi.spyOn(globalThis.indexedDB, 'open').mockImplementation(() => { throw new DOMException('The operation is insecure.', 'SecurityError') })
    try {
      await TH.expectRefusal(TH.settledVault(opts), 'storage_blocked')
    } finally {
      blocked.mockRestore()
    }
  })

  it("reports a write aborted from outside with the error its request failed with, never a null cause", async () => {
    const vaultDB = idbVaultDB({ dbName: TH.freshDbName() })
    await TH.ensureGated(vaultDB, TH.vaultPropsOf('u1'))
    await TH.expectingGood(vaultDB).putBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one'))
    // A transaction aborted from outside has a null error; its pending delete fails with an AbortError.
    const aborting = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementationOnce(function (this: IDBObjectStore, ...args) {
      const request = this.delete(...args)
      this.transaction.abort()
      return request
    })
    try {
      const refusal = await TH.expectBad(vaultDB.delBox(TH.scopeOf('u1'), 'anthropic', TH.deleting('rev-one')), 'storage_unavailable')
      const { cause } = refusal as { cause?: unknown }
      expect(cause).to.be.instanceOf(Error)
      expect((cause as Error).name).to.eq('AbortError')
    } finally {
      aborting.mockRestore()
    }
    expect(await TH.boxesOf(vaultDB, TH.scopeOf('u1'))).to.have.lengthOf(1)
  })

  it("serves Bank.make and ensureVault(): a vault born, stored in and born again over it", async () => {
    const dbName = TH.freshDbName()
    const opts = { applabel: 'acme', user_id: 'u1', vaultlabel: 'main', keyDeriver: TH.testDeriver, strengthChecker: TH.anyStrengthChecker, deviceDB: memoryDeviceDB() }
    const vault = await TH.settledVault({ ...opts, vaultDB: idbVaultDB({ dbName }) })
    await TH.unlock(vault, 'correct horse')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-not-a-real-key')
    TH.closeVault(vault)
    const reopened = await TH.settledVault({ ...opts, vaultDB: idbVaultDB({ dbName }) })
    await TH.unlock(reopened, 'correct horse')
    expect(await reopened.getWhisper('anthropic')).to.eq('sk-not-a-real-key')
    TH.closeVault(reopened)
  })
})

describe("idbVaultDB, every verb one transaction", () => {
  const scope = TH.scopeOf('u1')

  it("deletes a vault's boxes by a key range over its prefix, leaving every other vault's rows", async () => {
    const dbName = TH.freshDbName()
    const vaultDB = idbVaultDB({ dbName })
    const lookalike = TH.scopeOf('u1', 'main2')
    for (const user of ['u1', 'u12', 'u2']) {
      await TH.ensureGated(vaultDB, TH.vaultPropsOf(user))
      await TH.expectingGood(vaultDB).putBox(TH.scopeOf(user), { vault_tok: `vault-tok-${user}`, revision_tok: null }, TH.boxOf('anthropic', user))
    }
    await set(Scopepath.box({ ...lookalike, boxlabel: 'xx' }), TH.boxOf('xx', 'lookalike'), rawShelf(dbName))
    const wholeShelf = vi.spyOn(IDBObjectStore.prototype, 'getAllKeys')
    try {
      await TH.expectingGood(vaultDB).delVault(scope, { vault_tok: 'vault-tok-u1', gate_epoch: 1 })
      expect(wholeShelf).not.toHaveBeenCalled()
    } finally {
      wholeShelf.mockRestore()
    }
    const rows = await inspectIdbVaultDB({ dbName }).rows()
    expect(rows.map((row) => row.ckey)).to.deep.equal([
      Scopepath.box({ ...lookalike, boxlabel: 'xx' }),
      Scopepath.box({ ...TH.scopeOf('u12'), boxlabel: 'anthropic' }),
      Scopepath.box({ ...TH.scopeOf('u2'), boxlabel: 'anthropic' }),
      Scopepath.vault(scope),
      Scopepath.vault(TH.scopeOf('u12')),
      Scopepath.vault(TH.scopeOf('u2')),
    ].toSorted((one, two) => one.localeCompare(two)))
  })

  it("deletes a whole vault or none of it: a deletion failing midway undoes the ones before it", async () => {
    const dbName = TH.freshDbName()
    const vaultDB = idbVaultDB({ dbName })
    await TH.ensureGated(vaultDB, TH.vaultPropsOf('u1'))
    await TH.expectingGood(vaultDB).putBox(scope, { vault_tok: 'vault-tok-u1', revision_tok: null }, TH.boxOf('anthropic', 'one'))
    const failing = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementationOnce(function (this: IDBObjectStore, ckey) {
      this.delete(ckey)
      throw new DOMException('the disk is full', 'QuotaExceededError')
    })
    try {
      await TH.expectBad(vaultDB.delVault(scope, { vault_tok: 'vault-tok-u1', gate_epoch: 1 }), 'storage_blocked')
    } finally {
      failing.mockRestore()
    }
    expect(await TH.propsOf(vaultDB, scope)).to.deep.equal(TH.vaultPropsOf('u1'))
    expect(await TH.expectingGood(vaultDB).getBox(scope, 'anthropic', TH.inThisVault)).to.deep.equal(TH.boxOf('anthropic', 'one'))
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
    await TH.expectingGood(vaultDB).ensureVault(TH.gatelessOf('u1'))
    await TH.expectingGood(vaultDB).ensureVault(TH.gatelessOf('u1', { vault_tok: 'too-late' }))
    await TH.wakeupAtNextTick()
    expect(heardCount).to.eq(1)
  })

  it("rings for a deletion that removed a box, and for none that found nothing to remove", async () => {
    const vaultDB = idbVaultDB({ dbName: TH.freshDbName() })
    await TH.ensureGated(vaultDB, TH.vaultPropsOf('u1'))
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
    await TH.ensureGated(idbVaultDB({ dbName }), TH.vaultPropsOf('u1'))
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

  it("closes the bell's channel when its vault is let go", async () => {
    const dbName = TH.freshDbName()
    const vault = await TH.settledVault({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main', keyDeriver: TH.testDeriver, strengthChecker: TH.anyStrengthChecker, deviceDB: memoryDeviceDB(), vaultDB: idbVaultDB({ dbName }) })
    const closing = vi.spyOn(BroadcastChannel.prototype, 'close')
    try {
      TH.closeVault(vault)
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
      await TH.ensureGated(vaultDB, TH.vaultPropsOf('u1'))
      await vi.waitFor(() => { expect(heardCount).to.eq(2) })
      await TH.wakeupAtNextTick()
    } finally {
      catching.mockRestore()
    }
    expect(await TH.propsOf(vaultDB, TH.scopeOf('u1'))).to.deep.equal(TH.vaultPropsOf('u1'))
    expect(thrower).toHaveBeenCalledTimes(2)
    expect(escaped).to.be.empty
  })
})
