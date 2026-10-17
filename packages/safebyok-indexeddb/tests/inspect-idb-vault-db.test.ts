import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { VaultError, type VaultLogger } from 'safebyok'
import { idbVaultDB } from '../src/idb-vault-db'
import type { IdbVaultDBOpts } from '../src/idb-opts'
import { inspectIdbVaultDB } from '../src/inspect-idb-vault-db'
import * as TH from './test-helpers'

describe("inspectIdbVaultDB", () => {
  it("shows the raw rows sorted by ckey, hears writes, and wipes the shelf clean", async () => {
    const dbName = TH.freshDbName()
    const vaultDB = idbVaultDB({ dbName })
    const inspector = inspectIdbVaultDB({ dbName })
    let heardCount = 0
    const unsubscribe = inspector.subscribe(() => { heardCount += 1 })

    await vaultDB.createBundle(TH.bundleOf('u1'))
    await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), { vault_id: 'vault-id-u1', revision_id: null, vault_key_epoch: 1 })
    const rows = await inspector.rows()
    expect(rows.map((row) => row.ckey)).to.deep.equal(['box^acme^u1^main^anthropic', 'vault^acme^u1^main'])
    await vi.waitFor(() => { expect(heardCount).to.eq(2) })

    await inspector.wipe()
    expect(await inspector.rows()).to.have.lengthOf(0)
    expect(await vaultDB.readBundle(TH.scopeOf('u1'))).to.be.null
    await vi.waitFor(() => { expect(heardCount).to.eq(3) })
    unsubscribe()
  })

  it("meets trouble from IndexedDB as an Error, never a null, as the vault's own reads do", async () => {
    const dbName = TH.freshDbName()
    await idbVaultDB({ dbName }).createBundle(TH.bundleOf('u1'))
    const failing = vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementationOnce(function (this: IDBObjectStore) {
      const request = this.getAll()
      this.transaction.abort()
      return request
    })
    try {
      await expect(inspectIdbVaultDB({ dbName }).rows()).rejects.toThrow(Error)
    } finally {
      failing.mockRestore()
    }
  })

  it("looks at 'safebyok' given no options", async () => {
    await idbVaultDB().createBundle(TH.bundleOf('inspected_u1'))
    const rows = await inspectIdbVaultDB().rows()
    expect(rows.map((row) => row.ckey)).to.include('vault^acme^inspected_u1^main')
  })

  it("refuses a dbName that is not non-empty text with kind 'bad_option'", () => {
    for (const dbName of ['', 42, null]) {
      expect(() => inspectIdbVaultDB({ dbName } as unknown as IdbVaultDBOpts)).to.throw(VaultError, /^inspectIdbVaultDB takes an optional dbName/).with.property('kind', 'bad_option')
    }
  })

  it("refuses a listener that is not a function as it subscribes, so no later write meets it", async () => {
    const dbName = TH.freshDbName()
    const inspector = inspectIdbVaultDB({ dbName })
    expect(() => inspector.subscribe('not a listener' as unknown as () => void)).to.throw(VaultError, /listener function/).with.property('kind', 'bad_option')
    await idbVaultDB({ dbName }).createBundle(TH.bundleOf('u1'))
    expect(await inspector.rows()).to.have.lengthOf(1)
  })

  it("tells the logger it was made with of a listener that throws", async () => {
    const dbName = TH.freshDbName()
    const spy = TH.spyLogger()
    const thrown = new Error('a listener that throws')
    const unsubscribe = inspectIdbVaultDB({ dbName, logger: spy.logger }).subscribe(() => { throw thrown })
    await idbVaultDB({ dbName }).createBundle(TH.bundleOf('u1'))
    await vi.waitFor(() => { expect(spy.calls.map((call) => [call.level, call.story, call.err])).to.deep.equal([['error', { call: 'ChangeBell' }, thrown]]) })
    unsubscribe()
  })

  it("refuses a logger that is not one as it is made, with kind 'bad_option'", () => {
    expect(() => inspectIdbVaultDB({ logger: {} as unknown as VaultLogger })).to.throw(VaultError, /log, warn and error functions/).with.property('kind', 'bad_option')
  })
})
