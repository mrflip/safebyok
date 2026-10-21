import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { VaultError } from 'safebyok'
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

    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    await TH.expectingGood(vaultDB).putBox(TH.scopeOf('u1'), { vault_id: 'vault-id-u1', revision_tok: null, vault_key_epoch: 1 }, TH.boxOf('anthropic', 'one'))
    const rows = await inspector.rows()
    expect(rows.map((row) => row.ckey)).to.deep.equal(['box^acme^u1^main^anthropic', 'vault^acme^u1^main'])
    await vi.waitFor(() => { expect(heardCount).to.eq(2) })

    await inspector.wipe()
    expect(await inspector.rows()).to.have.lengthOf(0)
    expect(await TH.expectingGood(vaultDB).getVaultProps(TH.scopeOf('u1'))).to.be.null
    await vi.waitFor(() => { expect(heardCount).to.eq(3) })
    unsubscribe()
  })

  it("meets trouble from IndexedDB as an Error, never a null, as the vault's own reads do", async () => {
    const dbName = TH.freshDbName()
    await TH.expectGood(idbVaultDB({ dbName }).ensureVaultProps(TH.vaultPropsOf('u1')))
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
    await TH.expectGood(idbVaultDB().ensureVaultProps(TH.vaultPropsOf('inspected_u1')))
    const rows = await inspectIdbVaultDB().rows()
    expect(rows.map((row) => row.ckey)).to.include('vault^acme^inspected_u1^main')
  })

  it("refuses a dbName that is not non-empty text with kind 'bad_option'", () => {
    for (const dbName of ['', 42, null]) {
      expect(() => inspectIdbVaultDB({ dbName } as unknown as IdbVaultDBOpts)).to.throw(VaultError, /^inspectIdbVaultDB takes an optional dbName/).with.property('refusalkind', 'bad_option')
    }
  })

  it("refuses a listener that is not a function as it subscribes, so no later write meets it", async () => {
    const dbName = TH.freshDbName()
    const inspector = inspectIdbVaultDB({ dbName })
    expect(() => inspector.subscribe('not a listener' as unknown as () => void)).to.throw(VaultError, /listener function/).with.property('refusalkind', 'bad_option')
    await TH.expectGood(idbVaultDB({ dbName }).ensureVaultProps(TH.vaultPropsOf('u1')))
    expect(await inspector.rows()).to.have.lengthOf(1)
  })
})
