// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { OutageBankDB } from '../../src/lib/outage-bank-db'

const Scope = { user_id: 'u1', banklabel: 'acme' }

/** Make an OutageBankDB on a fresh database. */
const makeOutage = () => new OutageBankDB({ dbName: `outage_${crypto.randomUUID()}` })

describe("OutageBankDB", () => {
  it("passes a call through while online", async () => {
    const bankDB = makeOutage()
    expect(bankDB.isOnline).to.be.true
    const listed = await bankDB.tryEnsureBank({ op: 'ensure', ...Scope, gates: ['main'] })
    expect(listed.ok).to.be.true
  })

  it("refuses each verb while offline", async () => {
    const bankDB = makeOutage()
    bankDB.setOnline(false)
    const listed = await bankDB.tryEnsureBank({ op: 'ensure', ...Scope, gates: ['main'] })
    expect(listed.ok ? null : listed.err.refusalkind).to.eq('storage_unavailable')
    const tidied = await bankDB.tryTidyGone({ op: 'tidy_gone', ...Scope })
    expect(tidied.ok ? null : tidied.err.message).to.match(/switched off/)
    bankDB.setOnline(true)
    const relisted = await bankDB.tryEnsureBank({ op: 'ensure', ...Scope, gates: ['main'] })
    expect(relisted.ok).to.be.true
  })

  it("notifies its subscribers each time it goes offline or online, until they unsubscribe", () => {
    const bankDB = makeOutage()
    const heard: boolean[] = []
    const unsubscribe = bankDB.subscribe(() => { heard.push(bankDB.getSnapshot()) })
    bankDB.setOnline(false)
    bankDB.setOnline(true)
    unsubscribe()
    bankDB.setOnline(false)
    expect(heard).to.deep.equal([false, true])
  })
})
