import { describe, expect, it } from 'vitest'
import { Gate } from '../../src/models/gate'
import { type GateRecord, GateFormat } from '../../src/shapes/shapes-bankdb'
import { NOVEL, PassphraseProving } from '../../src/models/proving'
import * as TH from '../test-helpers'
import { builtGateOf, passkeyAnswerOf, provingWorldOf, TestPassphrase, useFakeClock, WorldBankStamp, WorldGateStamp } from '../test-helpers/proving-world'

useFakeClock()

function builtGate({ passkey = false } = {}) { return builtGateOf(passkey ? passkeyAnswerOf() : undefined) }

const GateFields = ['user_id', 'banklabel', 'gatelabel', 'fmt', 'revision_tok', 'revision_seq', 'registered_at', 'written_at', 'am', 'bank_tok', 'gate_tok', 'wayins', 'auth', 'sigs', 'meta']

describe("Gate.make(bank, gate, main, passkey0)", () => {
  it("is a gate row at its first revision, of the stamps, with the wayins handed", async () => {
    const proving = await PassphraseProving.buildNovel(WorldBankStamp, WorldGateStamp, TestPassphrase, provingWorldOf())
    const wayin = await proving.buildWayin(NOVEL)
    const gate = Gate.make(WorldBankStamp, WorldGateStamp, wayin, null)
    expect(gate).to.include({ ...WorldGateStamp, fmt: GateFormat, revision_seq: 0, am: 'a', bank_tok: WorldBankStamp.bank_tok })
    expect(gate.wayins).to.deep.equal({ main: wayin.pickle() })
    expect(gate.main.pickle()).to.deep.equal(wayin.pickle())
    expect(gate.passkey0).to.be.null
  })

  it("refuses a wayin record in place of a Wayin", async () => {
    const { gate } = await builtGate()
    TH.expectSyncRefusal(() => Gate.make(WorldBankStamp, WorldGateStamp, gate.wayins.main as never, null))
  })
})

describe("new Gate(bank, record): the record check", () => {
  it("makes the same gate again from a gate's pickle", async () => {
    const { gate } = await builtGate({ passkey: true })
    const again = new Gate(WorldBankStamp, gate.pickle())
    expect(again.pickle()).to.deep.equal(gate.pickle())
    expect(again.toJSON()).to.deep.equal(gate.toJSON())
  })

  const RecordCases = [
    [(record: GateRecord) => ({ ...record, wayins: { main: record.wayins.passkey0, passkey0: record.wayins.main } }), "its two wayins in each other's field"],
    [(record: GateRecord) => ({ ...record, wayins: { ...record.wayins, passkey0: record.wayins.main } }),             'a passphrase wayin in the passkey field'],
    [(record: GateRecord) => ({ ...record, wayins: { passkey0: record.wayins.passkey0 } }),                           'no passphrase wayin'],
    [(record: GateRecord) => ({ ...record, wayins: { ...record.wayins, passkey0: null } }),                           'passkey0 null, where a gate with no passkey has none'],
    [(record: GateRecord) => TH.omitting(record, 'gate_tok'),                                                         'no gate_tok'],
    [(record: GateRecord) => ({ ...record, bank_tok: 'bank-tok-other' }),                                             "another life's bank_tok"],
    [(record: GateRecord) => ({ ...record, banklabel: 'other' }),                                                     'another banklabel'],
    [(record: GateRecord) => ({ ...record, user_id: 'u2' }),                                                          'another user_id'],
    [() => null,                                                                                                      'null'],
  ] as const

  for (const [recordOf, blurb] of RecordCases) {
    it(`refuses a record with ${blurb}`, async () => {
      const { gate } = await builtGate({ passkey: true })
      TH.expectSyncRefusal(() => new Gate(WorldBankStamp, recordOf(gate.pickle()) as GateRecord))
    })
  }

  it("refuses a bank stamp with no bank_tok", async () => {
    const { gate } = await builtGate()
    TH.expectSyncRefusal(() => new Gate(TH.omitting(WorldBankStamp, 'bank_tok'), gate.pickle()))
  })

  it("quotes none of a refused record in its refusal: no ciphertext", async () => {
    const { gate } = await builtGate({ passkey: true })
    const record = gate.pickle()
    const { main, passkey0 } = record.wayins
    const err = TH.expectSyncRefusal(() => new Gate(WorldBankStamp, { ...record, wayins: { main: passkey0, passkey0: main } } as never))
    expect(TH.thrownText(err)).to.not.include(main.vault_key_wayin_wrapped.ciphertext_b64)
  })
})

describe("gate.pickle() and gate.toJSON()", () => {
  it("pickle() is the gate row, its wayin records frozen", async () => {
    const { gate } = await builtGate({ passkey: true })
    const pickle = gate.pickle()
    expect(Object.keys(pickle)).to.have.members(GateFields)
    expect(pickle.wayins.main).to.deep.equal(gate.main.pickle())
    expect(pickle.wayins.passkey0).to.deep.equal(gate.passkey0!.pickle())
    expect(Object.isFrozen(pickle)).to.be.true
    expect(Object.isFrozen(pickle.wayins.main)).to.be.true
  })

  it("toJSON() is the row with each wayin's header, with no wrapped vaultKey", async () => {
    const { gate } = await builtGate({ passkey: true })
    expect(TH.jsonOf(gate)).to.deep.equal(TH.jsonOf({ ...gate.pickle(), wayins: { main: gate.main.toJSON(), passkey0: gate.passkey0!.toJSON() } }))
    expect(JSON.stringify(gate)).to.not.include('ciphertext_b64')
  })

  it("toJSON() shows no passkey0 for a gate with no passkey", async () => {
    const { gate } = await builtGate()
    expect(gate.toJSON().wayins).to.not.have.property('passkey0')
  })

  it("Object.keys shows the row's fields alone: no Wayin, no stamp", async () => {
    const { gate } = await builtGate({ passkey: true })
    expect(Object.keys(gate)).to.have.members(GateFields)
  })

  it("is frozen, its fields read-only", async () => {
    const { gate } = await builtGate()
    expect(Object.isFrozen(gate)).to.be.true
    expect(() => { (gate as { revision_tok: unknown }).revision_tok = 'r2' }).to.throw(TypeError)
  })

  it("keeps the bank's stamp it was given, and its own", async () => {
    const { gate } = await builtGate()
    expect(gate.bankStamp).to.deep.equal(WorldBankStamp)
    expect(gate.stamp).to.deep.equal(WorldGateStamp)
  })
})

describe("gate.demandPasskeyAddable()", () => {
  it("passes a gate with no passkey and refuses one that has one", async () => {
    const { gate } = await builtGate()
    expect(() => { gate.demandPasskeyAddable() }).to.not.throw()
    const { gate: both } = await builtGate({ passkey: true })
    TH.expectSyncRefusal(() => { both.demandPasskeyAddable() })
  })
})
