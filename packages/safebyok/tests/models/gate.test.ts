import { describe, expect, it } from 'vitest'
import { Gate } from '../../src/models/gate'
import { NOVEL, PasskeyProving, PassphraseProving } from '../../src/models/proving'
import { Wayin } from '../../src/models/wayin'
import type { GateOpts } from '../../src/shapes/shapes-gateish'
import { type GateRecord, ThingFormat } from '../../src/shapes/shapes-thing'
import { Lifeseq } from '../../src/shapes/primitives'
import * as TH from '../test-helpers'

TH.useFakeClock()

const ThingFields = ['userid', 'banklabel', 'labelpath', 'label', 'fmt', 'lifepath', 'lifeseq', 'revtok', 'revseq', 'born_at', 'written_at', 'am']
const GateFields = [...ThingFields, 'wayins', 'auth', 'sigs', 'meta']

/** What a gate of {@link TH.WorldBankStamp}'s bank is made with: a new device of its scope, that device's vaultDB, and the bank's stamp. */
function worldOpts(): GateOpts {
  const device = TH.makeDevice()
  return { device, vaultDB: device.vaultDB, bankStamp: TH.WorldBankStamp }
}

interface DnaWayins { main: Wayin, passkey0: Wayin | null }

/** The wayins of a new gate of {@link TH.WorldGateStamp}: its passphrase's, and a passkey's if `isPasskeyed`. */
async function wayinsOf(isPasskeyed = false): Promise<DnaWayins> {
  const proving = await PassphraseProving.buildNovel(TH.provingDeviceOf(), TH.WorldBankStamp, TH.WorldGateStamp, TH.TestPassphrase)
  const main = await proving.buildWayin(NOVEL)
  if (! isPasskeyed) { return { main, passkey0: null } }
  const passkeyProving = await PasskeyProving.buildNovel(TH.provingDeviceOf(), TH.WorldBankStamp, TH.WorldGateStamp, TH.passkeyAnswerOf())
  return { main, passkey0: await passkeyProving.buildWayin(proving) }
}

/** The record of a new gate of {@link TH.WorldGateStamp}, with a passkey's wayin if `isPasskeyed`. */
async function gateRecordOf(isPasskeyed = false): Promise<GateRecord> {
  return Gate.makeRecord({ ...TH.WorldGateStamp, wayins: await wayinsOf(isPasskeyed) })
}

describe("Gate.makeRecord(dna)", () => {
  it("is a gate Thing at the first revision of its life, of the stamp, with the wayins handed", async () => {
    const wayins = await wayinsOf()
    const record = Gate.makeRecord({ ...TH.WorldGateStamp, wayins })
    expect(record).to.include({ ...TH.WorldGateStamp, label: 'gate', fmt: ThingFormat, revseq: 0, lifepath: TH.WorldGateStamp.lifeseq, written_at: TH.T0, am: 'a' })
    expect(record.wayins).to.deep.equal({ main: wayins.main.pickle(), passkey0: null })
    expect(record).to.deep.include({ auth: {}, sigs: {}, meta: {} })
    const gate = Gate.make(record, worldOpts())
    expect(gate.main.pickle()).to.deep.equal(wayins.main.pickle())
    expect(gate.passkey0).to.be.null
  })

  it("lays a passkey's wayin beside the passphrase's", async () => {
    const wayins = await wayinsOf(true)
    const record = Gate.makeRecord({ ...TH.WorldGateStamp, wayins })
    expect(record.wayins).to.deep.equal({ main: wayins.main.pickle(), passkey0: wayins.passkey0!.pickle() })
  })

  it("mints a new revtok for each record", async () => {
    const wayins = await wayinsOf()
    const one = Gate.makeRecord({ ...TH.WorldGateStamp, wayins })
    const two = Gate.makeRecord({ ...TH.WorldGateStamp, wayins })
    expect(one.revtok).to.not.eq(two.revtok)
  })

  const DnaCases = [
    [(wayins: DnaWayins) => ({ ...TH.WorldGateStamp, wayins: { ...wayins, main: wayins.main.pickle() } }), 'a wayin record in place of a Wayin'],
    [(wayins: DnaWayins) => ({ ...TH.WorldGateStamp, wayins: { main: wayins.main } }),                    'no passkey0, where a gate with no passkey has null'],
    [(wayins: DnaWayins) => ({ ...TH.WorldGateStamp, labelpath: 'box/gate', wayins }),                    'the labelpath of a box'],
    [(wayins: DnaWayins) => ({ ...TH.WorldGateStamp, lifeseq: undefined, wayins }),                       'no lifeseq'],
    [(wayins: DnaWayins) => ({ ...TH.WorldGateStamp, lifeseq: Lifeseq.ofLifenum(1), wayins }),                    'the lifeseq of a gone life'],
    [() => null,                                                                                        'null'],
  ] as const

  for (const [dnaOf, blurb] of DnaCases) {
    it(`refuses a dna with ${blurb}`, async () => {
      const dna = dnaOf(await wayinsOf())
      TH.expectSyncRefusal(() => Gate.makeRecord(dna as never))
    })
  }
})

describe("Gate.make(record, { device, vaultDB, bankStamp })", () => {
  it("makes the same gate again from a gate's pickle", async () => {
    const gate = Gate.make(await gateRecordOf(true), worldOpts())
    const again = Gate.make(gate.pickle(), worldOpts())
    expect(again.pickle()).to.deep.equal(gate.pickle())
    expect(again.stamp).to.deep.equal(gate.stamp)
  })

  const RecordCases = [
    [(record: GateRecord) => ({ ...record, wayins: { main: record.wayins.passkey0, passkey0: record.wayins.main } }), "its two wayins in each other's field"],
    [(record: GateRecord) => ({ ...record, wayins: { ...record.wayins, passkey0: record.wayins.main } }),             'a passphrase wayin in the passkey field'],
    [(record: GateRecord) => ({ ...record, wayins: { passkey0: record.wayins.passkey0 } }),                           'no passphrase wayin'],
    [(record: GateRecord) => ({ ...record, wayins: { main: record.wayins.main } }),                                   'no passkey0, where a gate with no passkey has null'],
    [(record: GateRecord) => TH.omitting(record, 'revtok'),                                                           'no revtok'],
    [(record: GateRecord) => ({ ...record, lifeseq: Lifeseq.ofLifenum(2) }),                                                  'a lifeseq its lifepath does not end with'],
    [(record: GateRecord) => ({ ...record, am: 'x', lifeseq: Lifeseq.ofLifenum(1), lifepath: Lifeseq.ofLifenum(1) }),                 'am x, where the main gate is never deleted'],
    [(record: GateRecord) => ({ ...record, maingate: record }),                                                       'a field no gate Thing has'],
    [() => null,                                                                                                     'null'],
  ] as const

  for (const [recordOf, blurb] of RecordCases) {
    it(`refuses a record with ${blurb}`, async () => {
      const record = recordOf(await gateRecordOf(true))
      TH.expectSyncRefusal(() => Gate.make(record as never, worldOpts()), 'bad_record')
    })
  }

  const OtherBankCases = [
    [{ banklabel: 'other' }, 'another banklabel'],
    [{ userid: 'u2' },       'another userid'],
  ] as const

  for (const [moved, blurb] of OtherBankCases) {
    it(`refuses a record with ${blurb} than its bank's`, async () => {
      const record = { ...await gateRecordOf(), ...moved }
      TH.expectSyncRefusal(() => Gate.make(record, worldOpts()), 'record_conflict')
    })
  }

  it("accepts a record of another life than its bank's: only the bank's scope is checked", async () => {
    const later = Lifeseq.ofLifenum(2)
    const record = { ...await gateRecordOf(), lifeseq: later, lifepath: later }
    expect(Gate.make(record, worldOpts()).lifeseq).to.eq(later)
  })

  it("refuses opts with no bankStamp, no device, a device that is not a Device, or no opts at all", async () => {
    const record = await gateRecordOf()
    const opts = worldOpts()
    TH.expectSyncRefusal(() => Gate.make(record, { ...opts, bankStamp: undefined } as never), 'bad_record')
    TH.expectSyncRefusal(() => Gate.make(record, { ...opts, device: undefined } as never), 'bad_record')
    TH.expectSyncRefusal(() => Gate.make(record, { ...opts, device: TH.provingDeviceOf() } as never), 'bad_record')
    TH.expectSyncRefusal(() => Gate.make(record, undefined as never))
  })

  it("quotes none of a refused record in its refusal: no ciphertext", async () => {
    const record = await gateRecordOf(true)
    const { main, passkey0 } = record.wayins
    const err = TH.expectSyncRefusal(() => Gate.make({ ...record, wayins: { main: passkey0, passkey0: main } } as never, worldOpts()))
    expect(TH.thrownText(err)).to.not.include(main.bank_key_wayin_wrapped.ciphertext_b64)
  })
})

describe("what a gate shows", () => {
  it("pickle() is the gate Thing, its wayin records frozen", async () => {
    const gate = Gate.make(await gateRecordOf(true), worldOpts())
    const pickle = gate.pickle()
    expect(Object.keys(pickle)).to.have.members(GateFields)
    expect(pickle.wayins.main).to.deep.equal(gate.main.pickle())
    expect(pickle.wayins.passkey0).to.deep.equal(gate.passkey0!.pickle())
    expect(gate.wayins).to.equal(pickle.wayins)
    expect(Object.isFrozen(pickle)).to.be.true
    expect(Object.isFrozen(pickle.wayins)).to.be.true
    expect(Object.isFrozen(pickle.wayins.main)).to.be.true
  })

  it("Object.keys shows its Thing fields alone: no Wayin, no wayin record", async () => {
    const gate = Gate.make(await gateRecordOf(true), worldOpts())
    expect(Object.keys(gate)).to.have.members(ThingFields)
    expect(JSON.stringify(gate)).to.not.include('ciphertext_b64')
  })

  it("keeps its Thing fields read-only", async () => {
    const gate = Gate.make(await gateRecordOf(), worldOpts())
    expect(() => { (gate as { revtok: unknown }).revtok = 'gate-revision-tok-other' }).to.throw(TypeError)
    expect(() => { (gate as { banklabel: unknown }).banklabel = 'other' }).to.throw(TypeError)
  })

  it("has the bank's stamp, the device and the vaultDB it was given, and its own stamp", async () => {
    const record = await gateRecordOf()
    const opts = worldOpts()
    const gate = Gate.make(record, opts)
    expect(gate.device).to.eq(opts.device)
    expect(gate.vaultDB).to.eq(opts.vaultDB)
    expect(gate.bankStamp).to.deep.equal(TH.WorldBankStamp)
    expect(gate.stamp).to.deep.equal(TH.WorldGateStamp)
    expect(gate.scope).to.deep.equal({ userid: TH.WorldScope.userid, banklabel: TH.WorldScope.banklabel, labelpath: 'gate' })
    expect([gate.revtok, gate.revseq, gate.written_at]).to.deep.equal([record.revtok, 0, TH.T0])
  })

  it("is a gate by its modelkind", async () => {
    expect(Gate.make(await gateRecordOf(), worldOpts()).modelkind).to.eq('gate')
  })
})

describe("gate.demandPasskeyAddable()", () => {
  it("passes a gate with no passkey and refuses one that has one", async () => {
    const gate = Gate.make(await gateRecordOf(), worldOpts())
    expect(() => { gate.demandPasskeyAddable() }).to.not.throw()
    const both = Gate.make(await gateRecordOf(true), worldOpts())
    TH.expectSyncRefusal(() => { both.demandPasskeyAddable() })
  })
})
