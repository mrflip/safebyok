import { describe, expect, it } from 'vitest'
import { BX } from 'safebyok-big/internals'
import { Gate } from '../../src/models/gate'
import { NOVEL, PasskeyProving, PassphraseProving } from '../../src/models/proving'
import { Wayin } from '../../src/models/wayin'
import * as TH from '../test-helpers'

TH.useFakeClock()

const GateFields = ['user_id', 'banklabel', 'gatelabel', 'fmt', 'revision_tok', 'revision_seq', 'registered_at', 'written_at', 'am', 'bank_tok', 'gate_tok', 'wayins', 'auth', 'sigs', 'meta']

/** What a gate is given of its bank: {@link TH.WorldBankStamp}'s stamp. */
const WorldBank = Object.freeze({ stamp: TH.WorldBankStamp })

/** The wayins of a new gate of {@link TH.WorldGateStamp}: its passphrase's, and a passkey's if `isPasskeyed`. */
async function wayinsOf(isPasskeyed = false): Promise<{ main: Wayin, passkey0: Wayin | null }> {
  const proving = await PassphraseProving.buildNovel(TH.WorldBankStamp, TH.WorldGateStamp, TH.TestPassphrase, TH.provingDeviceOf())
  const main = await proving.buildWayin(NOVEL)
  if (! isPasskeyed) { return { main, passkey0: null } }
  const passkeyProving = await PasskeyProving.buildNovel(TH.WorldBankStamp, TH.WorldGateStamp, TH.passkeyAnswerOf(), TH.provingDeviceOf())
  return { main, passkey0: await passkeyProving.buildWayin(proving) }
}

/** The record of a new gate of {@link TH.WorldGateStamp}, with a passkey's wayin if `isPasskeyed`. */
async function gateRecordOf(isPasskeyed = false): Promise<BX.GateRecord> {
  return Gate.makeRecord(TH.WorldBankStamp, { ...TH.WorldGateStamp, wayins: await wayinsOf(isPasskeyed) })
}

describe("Gate.makeRecord(bankStamp, dna)", () => {
  it("is a gate row at its first revision, of the stamps, with the wayins handed", async () => {
    const wayins = await wayinsOf()
    const record = Gate.makeRecord(TH.WorldBankStamp, { ...TH.WorldGateStamp, wayins })
    expect(record).to.include({ ...TH.WorldGateStamp, fmt: BX.GateFormat, revision_seq: 0, written_at: TH.T0, am: 'a', bank_tok: TH.WorldBankStamp.bank_tok })
    expect(record.wayins).to.deep.equal({ main: wayins.main.pickle() })
    expect(record).to.deep.include({ auth: {}, sigs: {}, meta: {} })
    const gate = Gate.make(record, { bank: WorldBank })
    expect(gate.main.pickle()).to.deep.equal(wayins.main.pickle())
    expect(gate.passkey0).to.be.null
  })

  it("lays a passkey's wayin beside the passphrase's", async () => {
    const wayins = await wayinsOf(true)
    const record = Gate.makeRecord(TH.WorldBankStamp, { ...TH.WorldGateStamp, wayins })
    expect(record.wayins).to.deep.equal({ main: wayins.main.pickle(), passkey0: wayins.passkey0!.pickle() })
  })

  it("mints a new revision_tok for each record", async () => {
    const wayins = await wayinsOf()
    const one = Gate.makeRecord(TH.WorldBankStamp, { ...TH.WorldGateStamp, wayins })
    const two = Gate.makeRecord(TH.WorldBankStamp, { ...TH.WorldGateStamp, wayins })
    expect(one.revision_tok).to.not.eq(two.revision_tok)
  })

  const DnaCases = [
    [(wayins: { main: Wayin, passkey0: Wayin | null }) => ({ ...TH.WorldGateStamp, wayins: { ...wayins, main: wayins.main.pickle() } }),  'a wayin record in place of a Wayin'],
    [(wayins: { main: Wayin, passkey0: Wayin | null }) => ({ ...TH.WorldGateStamp, wayins: { main: wayins.main } }),                     'no passkey0, where a gate with no passkey has null'],
    [(wayins: { main: Wayin, passkey0: Wayin | null }) => ({ ...TH.WorldGateStamp, gatelabel: 'other', wayins }),                         'a gatelabel no gate has'],
    [(wayins: { main: Wayin, passkey0: Wayin | null }) => ({ ...TH.WorldGateStamp, gate_tok: undefined, wayins }),                        'no gate_tok'],
    [() => null,                                                                                                                       'null'],
  ] as const

  for (const [dnaOf, blurb] of DnaCases) {
    it(`refuses a dna with ${blurb}`, async () => {
      const dna = dnaOf(await wayinsOf())
      TH.expectSyncRefusal(() => Gate.makeRecord(TH.WorldBankStamp, dna as never))
    })
  }

  it("refuses a bank stamp with no bank_tok", async () => {
    const wayins = await wayinsOf()
    TH.expectSyncRefusal(() => Gate.makeRecord(TH.omitting(TH.WorldBankStamp, 'bank_tok'), { ...TH.WorldGateStamp, wayins }), 'bad_option')
  })
})

describe("Gate.make(record, { bank })", () => {
  it("makes the same gate again from a gate's pickle", async () => {
    const gate = Gate.make(await gateRecordOf(true), { bank: WorldBank })
    const again = Gate.make(gate.pickle(), { bank: WorldBank })
    expect(again.pickle()).to.deep.equal(gate.pickle())
    expect(again.stamp).to.deep.equal(gate.stamp)
  })

  const RecordCases = [
    [(record: BX.GateRecord) => ({ ...record, wayins: { main: record.wayins.passkey0, passkey0: record.wayins.main } }), "its two wayins in each other's field"],
    [(record: BX.GateRecord) => ({ ...record, wayins: { ...record.wayins, passkey0: record.wayins.main } }),             'a passphrase wayin in the passkey field'],
    [(record: BX.GateRecord) => ({ ...record, wayins: { passkey0: record.wayins.passkey0 } }),                           'no passphrase wayin'],
    [(record: BX.GateRecord) => ({ ...record, wayins: { ...record.wayins, passkey0: null } }),                           'passkey0 null, where a gate with no passkey has none'],
    [(record: BX.GateRecord) => TH.omitting(record, 'gate_tok'),                                                         'no gate_tok'],
    [(record: BX.GateRecord) => ({ ...record, am: 'x' }),                                                                'am x, where a gate row is always live'],
    [(record: BX.GateRecord) => ({ ...record, maingate: record }),                                                       'a field no gate row has'],
    [() => null,                                                                                                         'null'],
  ] as const

  for (const [recordOf, blurb] of RecordCases) {
    it(`refuses a record with ${blurb}`, async () => {
      const record = recordOf(await gateRecordOf(true))
      TH.expectSyncRefusal(() => Gate.make(record as never, { bank: WorldBank }), 'bad_option')
    })
  }

  const OtherBankCases = [
    [{ bank_tok: 'bank-tok-other' }, "another life's bank_tok"],
    [{ banklabel: 'other' },         'another banklabel'],
    [{ user_id: 'u2' },              'another user_id'],
  ] as const

  for (const [moved, blurb] of OtherBankCases) {
    it(`refuses a record with ${blurb} than its bank's`, async () => {
      const record = { ...await gateRecordOf(), ...moved }
      TH.expectSyncRefusal(() => Gate.make(record, { bank: WorldBank }), 'record_conflict')
    })
  }

  it("refuses a bank with no stamp, and no opts at all", async () => {
    const record = await gateRecordOf()
    TH.expectSyncRefusal(() => Gate.make(record, { bank: {} } as never), 'bad_option')
    TH.expectSyncRefusal(() => Gate.make(record, undefined as never))
  })

  it("quotes none of a refused record in its refusal: no ciphertext", async () => {
    const record = await gateRecordOf(true)
    const { main, passkey0 } = record.wayins
    const err = TH.expectSyncRefusal(() => Gate.make({ ...record, wayins: { main: passkey0, passkey0: main } } as never, { bank: WorldBank }))
    expect(TH.thrownText(err)).to.not.include(main.bank_key_wayin_wrapped.ciphertext_b64)
  })
})

describe("what a gate shows", () => {
  it("pickle() is the gate row, its wayin records frozen", async () => {
    const gate = Gate.make(await gateRecordOf(true), { bank: WorldBank })
    const pickle = gate.pickle()
    expect(Object.keys(pickle)).to.have.members(GateFields)
    expect(pickle.wayins.main).to.deep.equal(gate.main.pickle())
    expect(pickle.wayins.passkey0).to.deep.equal(gate.passkey0!.pickle())
    expect(gate.wayins).to.equal(pickle.wayins)
    expect(Object.isFrozen(pickle)).to.be.true
    expect(Object.isFrozen(pickle.wayins)).to.be.true
    expect(Object.isFrozen(pickle.wayins.main)).to.be.true
  })

  it("Object.keys shows its stamp and its bank's life alone: no Wayin, no wayin record", async () => {
    const gate = Gate.make(await gateRecordOf(true), { bank: WorldBank })
    expect(Object.keys(gate)).to.have.members(['user_id', 'banklabel', 'gatelabel', 'gate_tok', 'registered_at', 'bank_tok'])
    expect(JSON.stringify(gate)).to.not.include('ciphertext_b64')
  })

  it("is frozen, its scope and lives read-only", async () => {
    const gate = Gate.make(await gateRecordOf(), { bank: WorldBank })
    expect(Object.isFrozen(gate)).to.be.true
    expect(() => { (gate as { gate_tok: unknown }).gate_tok = 'gate-tok-other' }).to.throw(TypeError)
    expect(() => { (gate as { banklabel: unknown }).banklabel = 'other' }).to.throw(TypeError)
  })

  it("keeps the bank's stamp it was given, and its own", async () => {
    const record = await gateRecordOf()
    const gate = Gate.make(record, { bank: WorldBank })
    expect(gate.bankStamp).to.deep.equal(TH.WorldBankStamp)
    expect(gate.stamp).to.deep.equal(TH.WorldGateStamp)
    expect(gate.scope).to.deep.equal({ ...TH.WorldScope, gatelabel: 'main' })
    expect([gate.revision_tok, gate.revision_seq, gate.written_at]).to.deep.equal([record.revision_tok, 0, TH.T0])
  })

  it("is a gate by its modelkind", async () => {
    expect(Gate.make(await gateRecordOf(), { bank: WorldBank }).modelkind).to.eq('gate')
  })
})

describe("gate.demandPasskeyAddable()", () => {
  it("passes a gate with no passkey and refuses one that has one", async () => {
    const gate = Gate.make(await gateRecordOf(), { bank: WorldBank })
    expect(() => { gate.demandPasskeyAddable() }).to.not.throw()
    const both = Gate.make(await gateRecordOf(true), { bank: WorldBank })
    TH.expectSyncRefusal(() => { both.demandPasskeyAddable() })
  })
})
