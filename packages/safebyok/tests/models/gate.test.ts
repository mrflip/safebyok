import { describe, expect, it } from 'vitest'
import { Gate } from '../../src/models/gate'
import { type GateRecord, GateFormat, gateSparse } from '../../src/shapes/shapes-bankdb'
import { NOVEL, PassphraseProving } from '../../src/models/proving'
import * as TH from '../test-helpers'
import { builtGateOf, listedGateOf, passkeyAnswerOf, provingDeviceOf, TestPassphrase, useFakeClock, WorldBankStamp, WorldGateStamp } from '../test-helpers/proving-world'

useFakeClock()

function builtGate({ passkey = false } = {}) { return builtGateOf(passkey ? passkeyAnswerOf() : undefined) }

const GateFields = ['user_id', 'banklabel', 'gatelabel', 'fmt', 'revision_tok', 'revision_seq', 'registered_at', 'written_at', 'am', 'bank_tok', 'gate_tok', 'wayins', 'auth', 'sigs', 'meta']

describe("Gate.recordOfBirth(bank, gate, main, passkey0)", () => {
  it("is a gate row at its first revision, of the stamps, with the wayins handed", async () => {
    const proving = await PassphraseProving.buildNovel(WorldBankStamp, WorldGateStamp, TestPassphrase, provingDeviceOf())
    const wayin = await proving.buildWayin(NOVEL)
    const record = Gate.recordOfBirth(WorldBankStamp, WorldGateStamp, wayin, null)
    expect(record).to.include({ ...WorldGateStamp, fmt: GateFormat, revision_seq: 0, am: 'a', bank_tok: WorldBankStamp.bank_tok })
    expect(record.wayins).to.deep.equal({ main: wayin.pickle() })
    const gate = await listedGateOf(record)
    expect(gate.main.pickle()).to.deep.equal(wayin.pickle())
    expect(gate.passkey0).to.be.null
  })

  it("refuses a wayin record in place of a Wayin", async () => {
    const { gate } = await builtGate()
    TH.expectSyncRefusal(() => Gate.recordOfBirth(WorldBankStamp, WorldGateStamp, gate.wayins.main as never, null))
  })
})

describe("a gate row as a device's ensureBank lists it: the record check", () => {
  it("lists the same gate again from a gate's pickle", async () => {
    const { gate } = await builtGate({ passkey: true })
    const again = await listedGateOf(gate.pickle())
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
      const record = recordOf(gate.pickle()) as GateRecord
      await TH.expectRefusal(listedGateOf(record))
    })
  }

  it("quotes none of a refused record in its refusal: no ciphertext", async () => {
    const { gate } = await builtGate({ passkey: true })
    const record = gate.pickle()
    const { main, passkey0 } = record.wayins
    const err = await TH.expectRefusal(listedGateOf({ ...record, wayins: { main: passkey0, passkey0: main } } as never))
    expect(TH.thrownText(err)).to.not.include(main.bank_key_wayin_wrapped.ciphertext_b64)
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

  it("toJSON() is the gate's sparse row: no wayin, no wrapped bankKey", async () => {
    const { gate } = await builtGate({ passkey: true })
    const sparse = gateSparse.parse(gate.pickle())
    expect(TH.jsonOf(gate)).to.deep.equal(TH.jsonOf(sparse))
    expect(JSON.stringify(gate)).to.not.include('ciphertext_b64')
  })

  it("its snapshot shows each wayin's registered_at alone, and no passkey0 for a gate with no passkey", async () => {
    const { gate: both } = await builtGate({ passkey: true })
    expect(both.snapshot.wayins).to.deep.equal({ main: { registered_at: both.main.registered_at }, passkey0: { registered_at: both.passkey0!.registered_at } })
    const { gate } = await builtGate()
    expect(gate.snapshot.wayins).to.not.have.property('passkey0')
  })

  it("Object.keys shows its scope, its bank's life and its revision alone: no Wayin, no wayin record", async () => {
    const { gate } = await builtGate({ passkey: true })
    expect(Object.keys(gate)).to.have.members(['user_id', 'banklabel', 'gatelabel', 'bank_tok', 'registered_at', 'revision_tok', 'revision_seq', 'written_at'])
    expect(gate.toJSON()).to.include({ gate_tok: gate.gate_tok })
  })

  it("is sealed, its scope and lives read-only", async () => {
    const { gate } = await builtGate()
    expect(Object.isSealed(gate)).to.be.true
    expect(() => { (gate as { gate_tok: unknown }).gate_tok = 'gate-tok-other' }).to.throw(TypeError)
    expect(() => { (gate as { banklabel: unknown }).banklabel = 'other' }).to.throw(TypeError)
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
