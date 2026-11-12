// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { OutageVaultDB } from '../../src/lib/outage-vault-db'

const Scope = { applabel: 'acme', user_id: 'u1' }

/** Make an OutageVaultDB on a fresh database. */
const makeOutage = () => new OutageVaultDB({ dbName: `outage_${crypto.randomUUID()}` })

describe("OutageVaultDB", () => {
  it("passes a call through while online", async () => {
    const vaultDB = makeOutage()
    expect(vaultDB.isOnline).to.be.true
    const listed = await vaultDB.tryListVaults({ op: 'list', ...Scope })
    expect(listed.ok).to.be.true
  })

  it("refuses each verb while offline", async () => {
    const vaultDB = makeOutage()
    vaultDB.setOnline(false)
    const listed = await vaultDB.tryListVaults({ op: 'list', ...Scope })
    expect(listed.ok ? null : listed.err.refusalkind).to.eq('storage_unavailable')
    const tidied = await vaultDB.tryTidyGone({ op: 'tidy_gone', ...Scope })
    expect(tidied.ok ? null : tidied.err.message).to.match(/switched off/)
    vaultDB.setOnline(true)
    const relisted = await vaultDB.tryListVaults({ op: 'list', ...Scope })
    expect(relisted.ok).to.be.true
  })

  it("notifies its subscribers each time it goes offline or online, until they unsubscribe", () => {
    const vaultDB = makeOutage()
    const heard: boolean[] = []
    const unsubscribe = vaultDB.subscribe(() => { heard.push(vaultDB.getSnapshot()) })
    vaultDB.setOnline(false)
    vaultDB.setOnline(true)
    unsubscribe()
    vaultDB.setOnline(false)
    expect(heard).to.deep.equal([false, true])
  })
})
