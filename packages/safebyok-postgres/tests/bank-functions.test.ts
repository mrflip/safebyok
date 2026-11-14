/** BankFunctionsSql on PGlite, called past the adapter: each function stores only what its checks allow, whatever the core's classifier would say, and tells what it stored. */

import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { bankChannelOf } from '../src/index'
import type { BX, StoragePolicy } from 'safebyok-big/storage'
import { BirthBoxSql, PutGateSql, ReviseBankSql } from '../src/bank-queries'
import * as BH from './bank-helpers'
import * as TH from './test-helpers'

BH.bootDatabaseFirst()

const { BW } = TH
const WithPasskey = { main: BW.mainWayin, passkey0: BW.passkey0Wayin }

/** The one row a write function answers. */
type Answered = { ok: boolean, act: string | null, presence: string | null }

/** Run a write function's statement, with each object parameter as JSON text, and each array as an array. */
async function answerOf(text: string, params: unknown[]): Promise<Answered & Record<string, unknown>> {
  const db = await BH.database()
  const { rows } = await db.query<Answered & Record<string, unknown>>(text, params.map((param) => ((typeof param === 'object') && (param !== null) && (! Array.isArray(param))) ? JSON.stringify(param) : param))
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

/** Build the bank `bank1` and return its `main` gate row, with a passkey wayin added where `keyed`. */
async function storedGateOf(keyed: boolean): Promise<BX.GateRecord> {
  const bankDB = await builtBankDB()
  if (! keyed) { return BW.gateAt() }
  const { val } = await bankDB.putGate(BW.gatePutAskOf('add_passkey', BW.gateAt(), WithPasskey))
  return val
}

/** `ask`'s record, registered later than the gate row it replaces. */
function registeredLater({ record }: BX.GatePutAsk) { return { ...record, registered_at: BW.Now + 5 } }

/** A put each policy's clause refuses: its blurb, whether the gate stored has a passkey wayin, and the ask over that gate. */
const PolicyBreaches: [string, boolean, (gate: BX.GateRecord) => { record: unknown, expected: unknown, policy: StoragePolicy }][] = [
  // replace_passphrase:
  ['replace_passphrase with a moved registered_at',        false, (gate) => breachOf(gate, 'replace_passphrase', { main: BW.otherMainWayin }, { registeredLater: true })],
  ['replace_passphrase expecting another main wayin',      false, (gate) => breachOf(gate, 'replace_passphrase', { main: BW.otherMainWayin }, { expectedMain: BW.otherMainWayin })],
  ['replace_passphrase adding a passkey wayin',            false, (gate) => breachOf(gate, 'replace_passphrase', { main: BW.otherMainWayin, passkey0: BW.passkey0Wayin })],
  ['replace_passphrase dropping the passkey wayin',        true,  (gate) => breachOf(gate, 'replace_passphrase', { main: BW.otherMainWayin })],
  // add_passkey:
  ['add_passkey with a moved registered_at',               false, (gate) => breachOf(gate, 'add_passkey', WithPasskey, { registeredLater: true })],
  ['add_passkey over a passkey wayin stored',              true,  (gate) => breachOf(gate, 'add_passkey', { main: BW.mainWayin, passkey0: { ...BW.passkey0Wayin, credential_id: 'cred2' } })],
  ['add_passkey with no passkey wayin',                    false, (gate) => breachOf(gate, 'add_passkey', BW.MainOnly)],
  ['add_passkey moving the main wayin',                    false, (gate) => breachOf(gate, 'add_passkey', { main: BW.otherMainWayin, passkey0: BW.passkey0Wayin })],
  // revoke_passkey:
  ['revoke_passkey with a moved registered_at',            true,  (gate) => breachOf(gate, 'revoke_passkey', BW.MainOnly, { registeredLater: true })],
  ['revoke_passkey with no passkey wayin stored',          false, (gate) => breachOf(gate, 'revoke_passkey', BW.MainOnly)],
  ['revoke_passkey keeping the passkey wayin',             true,  (gate) => breachOf(gate, 'revoke_passkey', WithPasskey)],
  ['revoke_passkey moving the main wayin',                 true,  (gate) => breachOf(gate, 'revoke_passkey', { main: BW.otherMainWayin })],
]

/** The record, expected row and policy of a put of `wayins` over `gate`, its record registered later or its expected main wayin forged where asked. */
function breachOf(gate: BX.GateRecord, policy: StoragePolicy, wayins: BX.Wayins, forged: { registeredLater?: boolean, expectedMain?: BX.Wayins['main'] } = {}) {
  const ask = BW.gatePutAskOf(policy, gate, wayins)
  const record = forged.registeredLater ? registeredLater(ask) : ask.record
  const expected = forged.expectedMain ? { ...ask.expected, wayins: { ...ask.expected.wayins, main: forged.expectedMain } } : ask.expected
  return { record, expected, policy }
}

describe("safebyok_put_gate", () => {
  it("stores a put's record over the expected gate row, and tells of it with the bank row above", async () => {
    await builtBankDB()
    const told = await hearing()
    const { record, expected, options } = BW.gatePutAskOf('add_passkey', BW.gateAt(), WithPasskey)
    expect(await answerOf(PutGateSql, [record, expected, options.policies])).to.deep.include({ ok: true, act: 'replaced', presence: 'live', bank: BW.bankAt(), gate: record })
    expect(await BH.rowsOf().gateRowOf(BW.gateScope)).to.deep.equal(record)
    await vi.waitFor(() => { expect(told).to.deep.equal([{ at: BW.gateScope, parent: BW.bankAt(), row: record }]) })
  })

  it("stores the record of each policy over a gate row its clause passes", async () => {
    await builtBankDB()
    const replace = BW.gatePutAskOf('replace_passphrase', BW.gateAt(), { main: BW.otherMainWayin })
    expect(await answerOf(PutGateSql, [replace.record, replace.expected, ['replace_passphrase']])).to.deep.include({ ok: true, act: 'replaced', gate: replace.record })
    const add = BW.gatePutAskOf('add_passkey', replace.record, { main: BW.otherMainWayin, passkey0: BW.passkey0Wayin })
    expect(await answerOf(PutGateSql, [add.record, add.expected, ['add_passkey']])).to.deep.include({ ok: true, act: 'replaced', gate: add.record })
    const keptPasskey = BW.gatePutAskOf('replace_passphrase', add.record, { main: BW.mainWayin, passkey0: BW.passkey0Wayin })
    expect(await answerOf(PutGateSql, [keptPasskey.record, keptPasskey.expected, ['replace_passphrase']])).to.deep.include({ ok: true, act: 'replaced', gate: keptPasskey.record })
    const revoke = BW.gatePutAskOf('revoke_passkey', keptPasskey.record, BW.MainOnly)
    expect(await answerOf(PutGateSql, [revoke.record, revoke.expected, ['revoke_passkey']])).to.deep.include({ ok: true, act: 'replaced', gate: revoke.record })
    expect(await BH.rowsOf().gateRowOf(BW.gateScope)).to.deep.equal(revoke.record)
  })

  it("stores nothing, and answers the rows it found, for a record over another row or of another life", async () => {
    await builtBankDB()
    const gate = BW.gateAt()
    const withPasskey = BW.gateAt(0, 'bank1', WithPasskey)
    const unfit: [string, Record<string, unknown>, unknown][] = [
      ['a stale revision',          BW.gatePutAskOf('replace_passphrase', withPasskey, { main: BW.otherMainWayin }).record, { ...gate, revision_tok: 'gone' }],
      ['a revision_seq not next',   { ...BW.gatePutAskOf('add_passkey', gate, WithPasskey).record, revision_seq: 3 }, gate],
      ['another gate life',         BW.gatePutAskOf('add_passkey', gate, WithPasskey).record, { ...gate, gate_tok: 'gate2' }],
      ['another bank life',         { ...BW.gatePutAskOf('add_passkey', gate, WithPasskey).record, bank_tok: 'bank0' }, gate],
    ]
    for (const [blurb, record, expected] of unfit) {
      expect(await answerOf(PutGateSql, [record, expected, ['add_passkey']]), blurb).to.deep.include({ ok: false, act: null, presence: null, bank: BW.bankAt(), gate })
    }
    expect(await BH.rowsOf().gateRowOf(BW.gateScope)).to.deep.equal(gate)
  })

  describe("stores nothing, and answers the rows it found, for a put its policy's clause refuses", () => {
    for (const [blurb, keyed, breach] of PolicyBreaches) {
      it(blurb, async () => {
        const gate = await storedGateOf(keyed)
        const { record, expected, policy } = breach(gate)
        expect(await answerOf(PutGateSql, [record, expected, [policy]])).to.deep.include({ ok: false, act: null, presence: null, bank: BW.bankAt(), gate })
        expect(await BH.rowsOf().gateRowOf(BW.gateScope)).to.deep.equal(gate)
      })
    }
  })

  it("stores nothing under a deleted bank", async () => {
    const bankDB = await builtBankDB()
    await bankDB.delBank(BW.bankDelAskOf(BW.bankAt()))
    const { record, expected } = BW.gatePutAskOf('add_passkey', BW.gateAt(), WithPasskey)
    expect(await answerOf(PutGateSql, [record, expected, ['add_passkey']])).to.deep.include({ ok: false, bank: BW.bankTombstoneOf(BW.bankAt()), gate: null })
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
