// fake-indexeddb installs a Node-side indexedDB global before the adapters load, so the device
// store browserOpts makes is a real IndexedDB one.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { browserOpts } from '../src/browser'
import { VaultError } from '../src/errors'
import { argon2idWebV1Deriver } from '../src/key-deriver'
import { inspectIdbDeviceDB } from '../src/idb'
import { memoryStore } from '../src/string-store'
import { localVaultDB } from '../src/vault-db'
import { openVault } from '../src/vault'
import * as TH from './test-helpers'

describe("browserOpts", () => {
  it("supplies the pinned Argon2id deriver and an IndexedDB device store, and nothing else", () => {
    const bag = browserOpts()
    expect(Object.keys(bag)).to.have.members(['keyDeriver', 'deviceDB'])
    expect(bag.keyDeriver).to.eq(argon2idWebV1Deriver)
  })

  it("never supplies the vault store: the backend is every host's own choice", () => {
    expect(browserOpts()).to.not.have.property('vaultDB')
  })

  it("keeps the device store's records in the database it names", async () => {
    const dbName = TH.freshDbName()
    await browserOpts({ dbName }).deviceDB.writeUnlock(await TH.unlockOf('u1'))
    const rows = await inspectIdbDeviceDB({ dbName }).rows()
    expect(rows.map((row) => row.ckey)).to.deep.equal(['unlock^acme^u1^main'])
    expect(await browserOpts().deviceDB.readUnlock(TH.scopeOf('u1'))).to.be.null
  })

  it("answers the same frozen bag for the same dbName, so a render may call it", () => {
    expect(browserOpts({ dbName: 'acme' })).to.eq(browserOpts({ dbName: 'acme' }))
    expect(browserOpts()).to.eq(browserOpts({ dbName: 'safebyok' }))
    expect(browserOpts({ dbName: 'acme' })).to.not.eq(browserOpts({ dbName: 'other' }))
    expect(Object.isFrozen(browserOpts())).to.be.true
  })

  it("refuses a dbName that is not non-empty text with kind 'bad_option', quoting none of it", () => {
    for (const dbName of ['', 42, null]) {
      expect(() => browserOpts({ dbName } as unknown as { dbName: string }))
        .to.throw(VaultError, /dbName/).with.property('kind', 'bad_option')
    }
  })

  it("spreads into openVault beside the host's vault store", async () => {
    const vault = await openVault({ applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB: localVaultDB(memoryStore()), ...browserOpts({ dbName: TH.freshDbName() }) })
    expect(vault.getSnapshot().state).to.eq('absent')
    vault.close()
  })

  it("yields to a field the host passes after it", async () => {
    const { deviceDB } = browserOpts({ dbName: TH.freshDbName() })
    const opts = { ...browserOpts({ dbName: 'acme' }), applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB: localVaultDB(memoryStore()), deviceDB }
    expect(opts.deviceDB).to.eq(deviceDB)
    const vault = await openVault(opts)
    expect(vault.getSnapshot().state).to.eq('absent')
    vault.close()
  })
})
