/** BankFunctionsSql on PGlite, called past the adapter: each function stores only what its checks allow, whatever the core's classifier would say, and tells what it stored. */

import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { bankChannelOf } from '../src/index'
import { BirthBoxSql, PutGateSql, ReviseBankSql } from '../src/bank-queries'
import * as BH from './bank-helpers'
import * as TH from './test-helpers'

BH.bootDatabaseFirst()

const { BW } = TH
const WithPasskey = { main: BW.mainWayin, passkey0: BW.passkey0Wayin }

/** The one row a write function answers. */
type Answered = { ok: boolean, act: string | null, presence: string | null }

/** Run a write function's statement, with each object parameter as JSON text. */
async function answerOf(text: string, params: unknown[]): Promise<Answered & Record<string, unknown>> {
  const db = await BH.database()
  const { rows } = await db.query<Answered & Record<string, unknown>>(text, params.map((param) => ((typeof param === 'object') && (param !== null)) ? JSON.stringify(param) : param))
  expect(rows).to.have.lengthOf(1)
  return rows[0]!
}

/** A bankDB holding the bank `bank1`, built with its `main` gate. */
async function builtBankDB() {
  const bankDB = await BH.makeBankDB()
  await bankDB.buildBank(BW.bankBuildAskOf())
  return bankDB
}

/** Collect the notices sent on the battery user's channel until the test ends. */
async function hearing(): Promise<unknown[]> {
  const told: unknown[] = []
  const unlisten = await BH.listen(bankChannelOf(BW.bankScope.user_id), (text) => { told.push(JSON.parse(text)) })
  onTestFinished(() => { unlisten() })
  return told
}

describe("safebyok_put_gate", () => {
  it("stores a gate verb's record only where the verb's policy allows it, and tells of it with the bank row above", async () => {
    await builtBankDB()
    const told = await hearing()
    const { record, expected } = BW.gatePutAskOf('addPasskey', BW.gateAt(), WithPasskey)
    expect(await answerOf(PutGateSql, [record, expected, 'addPasskey'])).to.deep.include({ ok: true, act: 'replaced', presence: 'live', bank: BW.bankAt(), gate: record })
    expect(await BH.rowsOf().gateRowOf(BW.gateScope)).to.deep.equal(record)
    await vi.waitFor(() => { expect(told).to.deep.equal([{ at: BW.gateScope, parent: BW.bankAt(), row: record }]) })
  })

  it("stores nothing, and answers the rows it found, for each breach of the policy", async () => {
    await builtBankDB()
    const gate = BW.gateAt()
    const withPasskey = BW.gateAt(0, 'bank1', WithPasskey)
    const breaches: [string, Record<string, unknown>, unknown, string][] = [
      ['a moved registered_at',              { ...BW.gatePutAskOf('replacePassphrase', gate, { main: BW.otherMainWayin }).record, registered_at: 1 }, gate, 'replacePassphrase'],
      ['a passkey wayin added by replace',   BW.gatePutAskOf('replacePassphrase', gate, { main: BW.otherMainWayin, passkey0: BW.passkey0Wayin }).record, gate, 'replacePassphrase'],
      ['the main wayin moved by addPasskey', BW.gatePutAskOf('addPasskey', gate, { main: BW.otherMainWayin, passkey0: BW.passkey0Wayin }).record, gate, 'addPasskey'],
      ['a revokePasskey with none stored',   BW.gatePutAskOf('revokePasskey', gate, BW.MainOnly).record, gate, 'revokePasskey'],
      ['a stale revision',                   BW.gatePutAskOf('replacePassphrase', withPasskey, { main: BW.otherMainWayin }).record, { ...gate, revision_tok: 'gone' }, 'replacePassphrase'],
      ['another bank life',                  { ...BW.gatePutAskOf('addPasskey', gate, WithPasskey).record, bank_tok: 'bank0' }, gate, 'addPasskey'],
    ]
    for (const [breach, record, expected, gateVerb] of breaches) {
      expect(await answerOf(PutGateSql, [record, expected, gateVerb]), breach).to.deep.include({ ok: false, act: null, presence: null, bank: BW.bankAt(), gate })
    }
    expect(await BH.rowsOf().gateRowOf(BW.gateScope)).to.deep.equal(gate)
  })

  it("stores nothing for an addPasskey over a stored passkey wayin", async () => {
    const bankDB = await builtBankDB()
    const { val: withPasskey } = await bankDB.addPasskey(BW.gatePutAskOf('addPasskey', BW.gateAt(), WithPasskey))
    const { record } = BW.gatePutAskOf('addPasskey', withPasskey, { main: BW.mainWayin, passkey0: { ...BW.passkey0Wayin, credential_id: 'cred2' } })
    expect(await answerOf(PutGateSql, [record, withPasskey, 'addPasskey'])).to.deep.include({ ok: false, gate: withPasskey })
  })

  it("stores nothing under a deleted bank", async () => {
    const bankDB = await builtBankDB()
    await bankDB.delBank(BW.bankDelAskOf(BW.bankAt()))
    const { record, expected } = BW.gatePutAskOf('addPasskey', BW.gateAt(), WithPasskey)
    expect(await answerOf(PutGateSql, [record, expected, 'addPasskey'])).to.deep.include({ ok: false, bank: BW.bankTombstoneOf(BW.bankAt()), gate: null })
  })
})

describe("safebyok_revise_bank", () => {
  it("deletes every gate, vault and box row under the bank in the call that stores its tombstone, and tells of the bank alone", async () => {
    const bankDB = await builtBankDB()
    await bankDB.putVault(BW.vaultPutAskOf(BW.vaultAt()))
    await bankDB.putBox(BW.boxPutAskOf(BW.boxAt()))
    await BH.rowsOf().plantBoxRow(BW.boxscope, 'bank0', 'life0', BW.boxAt(0, 'bank0', 'life0'))
    const told = await hearing()
    const tombstone = BW.bankTombstoneOf(BW.bankAt())
    expect(await answerOf(ReviseBankSql, [tombstone, null, BW.bankAt()])).to.deep.include({ ok: true, act: 'deleted', presence: 'live', bank: tombstone, gate: null })
    const db = await BH.database()
    const { rows } = await db.query('SELECT (SELECT count(*) FROM safebyok_gates) AS gates, (SELECT count(*) FROM safebyok_vaults) AS vaults, (SELECT count(*) FROM safebyok_boxes) AS boxes')
    expect(rows).to.deep.equal([{ gates: 0, vaults: 0, boxes: 0 }])
    await vi.waitFor(() => { expect(told).to.deep.equal([{ at: BW.bankScope, row: tombstone }]) })
  })

  it("stores nothing over a bank row of another revision, and deletes nothing under it", async () => {
    await builtBankDB()
    const tombstone = BW.bankTombstoneOf(BW.bankAt())
    expect(await answerOf(ReviseBankSql, [tombstone, null, { ...BW.bankAt(), revision_tok: 'gone' }])).to.deep.include({ ok: false, bank: BW.bankAt(), gate: BW.gateAt() })
    expect(await BH.rowsOf().gateRowOf(BW.gateScope)).to.deep.equal(BW.gateAt())
  })
})

describe("safebyok_birth_box", () => {
  it("adds a box beside a row of its boxlabel under another life pair, never over it, counting only its own life's rows", async () => {
    const bankDB = await builtBankDB()
    await bankDB.putVault(BW.vaultPutAskOf(BW.vaultAt()))
    const stray = BW.boxAt(4, 'bank1', 'oldlife')
    await BH.rowsOf().plantBoxRow(BW.boxscope, 'bank1', 'oldlife', stray)
    const { record, expected } = BW.boxPutAskOf(BW.boxAt())
    expect(await answerOf(BirthBoxSql, [record, expected, 100])).to.deep.include({ ok: true, act: 'born', box: record, parent: BW.vaultAt(), boxcount: 0 })
    const strays = await BH.rowsOf().boxRowsOf(BW.vaultScope, 'bank1', 'oldlife')
    expect(strays.get('openai')).to.deep.equal(stray)
  })
})
