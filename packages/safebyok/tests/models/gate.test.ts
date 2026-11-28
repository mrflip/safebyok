import { describe, expect, it, vi } from 'vitest'
import { noop } from 'es-toolkit'
import { Crypto } from 'safebyok-big/internals'
import { BaseBox } from '../../src/models/base-box'
import { Gate } from '../../src/models/gate'
import { Lease } from '../../src/models/lease'
import { NOVEL, PasskeyProving, PassphraseProving } from '../../src/models/proving'
import { Wayin } from '../../src/models/wayin'
import type { BadNews } from '../../src/shapes/shapes-bankish'
import type { BankGateFriend } from '../../src/shapes/shapes-gateish'
import type { LiveOf, ShellOf } from '../../src/shapes/shapes-sealers'
import { type GateRecord, ThingFormat } from '../../src/shapes/shapes-thing'
import { Lifeseq } from '../../src/shapes/primitives'
import { readTcNow } from '../../src/storage/agerank'
import * as TH from '../test-helpers'

TH.useFakeClock()

const ThingFields = ['userid', 'banklabel', 'labelpath', 'modelkind', 'label', 'fmt', 'banktok', 'lifepath', 'lifeseq', 'revtok', 'revseq', 'born_at', 'written_at', 'am']
const GateFields = [...ThingFields, 'wayins', 'auth', 'sigs', 'meta']

/** The lease verbs of a bank, for a gate made alone, on which no test here builds a lease. */
const AloneFriend: BankGateFriend = {
  leaseFollowed: () => { throw new Error("No lease is built on a gate made alone.") },
  attachLease:   noop,
}

/** The gate of `record`, made alone on `device`, by default a new device of {@link TH.WorldScope}. */
function makeGate(record: GateRecord | ShellOf<GateRecord>, device = TH.makeDevice()): Gate { return Gate.make(TH.begunOf(record), { bank: device.bank }, AloneFriend) }

interface DnaWayins { main: Wayin, passkey0: Wayin | null }

/** What a new gate of {@link TH.WorldGateLife} is made of beside its wayins: its life. */
const GateDnaLife = TH.WorldGateLife

/** The wayins of a new gate of {@link TH.WorldGateLife}: its passphrase's, and a passkey's if `isPasskeyed`. */
async function wayinsOf(isPasskeyed = false): Promise<DnaWayins> {
  const proving = await PassphraseProving.buildNovel(TH.provingDeviceOf(), TH.WorldGateLife, TH.TestPassphrase)
  const main = await proving.buildWayin(NOVEL)
  if (! isPasskeyed) { return { main, passkey0: null } }
  const passkeyProving = await PasskeyProving.buildNovel(TH.provingDeviceOf(), TH.WorldGateLife, TH.passkeyAnswerOf())
  return { main, passkey0: await passkeyProving.buildWayin(proving) }
}

/** The record of a new gate of {@link TH.WorldGateLife}, with a passkey's wayin if `isPasskeyed`. */
async function gateRecordOf(isPasskeyed = false): Promise<LiveOf<GateRecord>> {
  return Gate.makeRecord({ ...GateDnaLife, wayins: await wayinsOf(isPasskeyed) })
}

describe("Gate.makeRecord(dna)", () => {
  it("is a gate Thing at the first revision of its life, of the life, with the wayins handed", async () => {
    const wayins = await wayinsOf()
    const record = Gate.makeRecord({ ...GateDnaLife, wayins })
    expect(record).to.include({ ...GateDnaLife, label: TH.WorldScope.banklabel, fmt: ThingFormat, revseq: 0, lifepath: TH.WorldGateLife.lifepath, written_at: TH.T0, am: 'a' })
    expect(record.wayins).to.deep.equal({ main: wayins.main.pickle(), passkey0: null })
    expect(record).to.deep.include({ auth: {}, sigs: {}, meta: {} })
    const gate = makeGate(record)
    expect(gate.main.pickle()).to.deep.equal(wayins.main.pickle())
    expect(gate.passkey0).to.be.null
  })

  it("lays a passkey's wayin beside the passphrase's", async () => {
    const wayins = await wayinsOf(true)
    const record = Gate.makeRecord({ ...GateDnaLife, wayins })
    expect(record.wayins).to.deep.equal({ main: wayins.main.pickle(), passkey0: wayins.passkey0!.pickle() })
  })

  it("mints a new revtok for each record", async () => {
    const wayins = await wayinsOf()
    const one = Gate.makeRecord({ ...GateDnaLife, wayins })
    const two = Gate.makeRecord({ ...GateDnaLife, wayins })
    expect(one.revtok).to.not.eq(two.revtok)
  })

  const DnaCases = [
    [(wayins: DnaWayins) => ({ ...GateDnaLife, wayins: { main: wayins.main } }),                    'no passkey0, where a gate with no passkey has null'],
    [(wayins: DnaWayins) => ({ ...GateDnaLife, labelpath: 'box/gate', wayins }),                    'the labelpath of a box'],
    [(wayins: DnaWayins) => ({ ...GateDnaLife, lifepath: undefined, wayins }),                      'no lifepath'],
    [(wayins: DnaWayins) => ({ ...GateDnaLife, banktok: undefined, wayins }),                       'no banktok'],
    [(wayins: DnaWayins) => ({ ...GateDnaLife, labelpath: 'other', wayins }),                       'a labelpath other than its banklabel'],
    [(wayins: DnaWayins) => ({ ...GateDnaLife, lifepath: Lifeseq.ofLifenum(1), wayins }),           'the lifepath of a gone life'],
    [() => null,                                                                                        'null'],
  ] as const

  for (const [dnaOf, blurb] of DnaCases) {
    it(`refuses a dna with ${blurb}`, async () => {
      const dna = dnaOf(await wayinsOf())
      TH.expectSyncRefusal(() => Gate.makeRecord(dna as never))
    })
  }
})

describe("Gate.make(begun, { bank }, friend)", () => {
  it("pickles to the very record its item event carried", async () => {
    const record = await gateRecordOf(true)
    expect(makeGate(record).pickle()).to.eq(record)
  })

  it("makes the same gate again from a gate's pickle", async () => {
    const gate = makeGate(await gateRecordOf(true))
    const again = makeGate(TH.livePickleOf(gate))
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
    [(record: GateRecord) => ({ ...record, labelpath: 'other', label: 'other' }),                                     'a labelpath other than its banklabel'],
    [(record: GateRecord) => ({ ...record, maingate: record }),                                                       'a field no gate Thing has'],
  ] as const

  for (const [recordOf, blurb] of RecordCases) {
    it(`refuses an item event of a record with ${blurb}`, async () => {
      const record = recordOf(await gateRecordOf(true))
      TH.expectSyncRefusal(() => makeGate(record as never), 'bad_record')
    })
  }

  const OtherBankCases = [
    [{ banklabel: 'other', labelpath: 'other', label: 'other' }, 'another banklabel'],
    [{ userid: 'u2' },                                           'another userid'],
  ] as const

  for (const [moved, blurb] of OtherBankCases) {
    it(`refuses a record with ${blurb} than its bank's`, async () => {
      const ownRecord = await gateRecordOf()
      const record = { ...ownRecord, ...moved }
      TH.expectSyncRefusal(() => makeGate(record), 'record_conflict')
    })
  }

  const OtherDeviceCases = [
    [{ banklabel: 'other' }, 'another banklabel'],
    [{ userid: 'u2' },       'another userid'],
  ] as const

  for (const [moved, blurb] of OtherDeviceCases) {
    it(`refuses a device of ${blurb} than its bank's`, async () => {
      const record = await gateRecordOf()
      const device = TH.makeDevice(moved)
      TH.expectSyncRefusal(() => makeGate(record, device), 'record_conflict')
    })
  }

  it("accepts a record of another life than its bank's: only the bank's scope is checked", async () => {
    const later = Lifeseq.ofLifenum(2)
    const ownRecord = await gateRecordOf()
    const record = { ...ownRecord, lifeseq: later, lifepath: later }
    expect(makeGate(record).lifeseq).to.eq(later)
  })

  it("refuses no opts at all, or no friend", async () => {
    const record = await gateRecordOf()
    TH.expectSyncRefusal(() => Gate.make(TH.thingEventOf<GateRecord>(record), undefined as never, undefined as never))
    TH.expectSyncRefusal(() => Gate.make(TH.thingEventOf<GateRecord>(record), { bank: TH.makeDevice().bank }, undefined as never), 'bad_record')
  })

  it("refuses nothing at all, a whole record with no item event, and another kind's shell", async () => {
    const { bank } = TH.makeDevice()
    const record    = await gateRecordOf()
    TH.expectSyncRefusal(() => Gate.make(null as never, { bank }, AloneFriend), 'bad_record')
    TH.expectSyncRefusal(() => Gate.make(record as never, { bank }, AloneFriend), 'bad_record')
    TH.expectSyncRefusal(() => Gate.make(TH.boxShellOf() as never, { bank }, AloneFriend), 'bad_record')
  })

  it("quotes none of a refused record in its refusal: no ciphertext", async () => {
    const record = await gateRecordOf(true)
    const { main, passkey0 } = record.wayins
    const err = TH.expectSyncRefusal(() => makeGate({ ...record, wayins: { main: passkey0, passkey0: main } } as never))
    expect(TH.thrownText(err)).to.not.include(main.bank_key_wayin_wrapped.ciphertext_b64)
  })
})

describe("what a gate shows", () => {
  it("pickle() is the gate Thing, its wayin records frozen", async () => {
    const gate = makeGate(await gateRecordOf(true))
    const pickle = TH.livePickleOf(gate)
    expect(Object.keys(pickle)).to.have.members(GateFields)
    expect(pickle.wayins.main).to.deep.equal(gate.main.pickle())
    expect(pickle.wayins.passkey0).to.deep.equal(gate.passkey0!.pickle())
    expect(gate.wayins).to.equal(pickle.wayins)
    expect(Object.isFrozen(pickle)).to.be.true
    expect(Object.isFrozen(pickle.wayins)).to.be.true
    expect(Object.isFrozen(pickle.wayins.main)).to.be.true
  })

  it("Object.keys shows its Thing fields alone: no Wayin, no wayin record", async () => {
    const gate = makeGate(await gateRecordOf(true))
    expect(Object.keys(gate)).to.have.members(ThingFields)
    expect(JSON.stringify(gate)).to.not.include('ciphertext_b64')
  })

  it("spreads to its Thing fields alone, each a string or a number: nothing secret and nothing opaque", async () => {
    const gate = makeGate(await gateRecordOf(true))
    // The spread is this test's subject: what a log line or a host's `{ ...thing }` sees of a gate, its wayins aside.
    const spread = { ...gate } // eslint-disable-line @typescript-eslint/no-misused-spread
    expect(Object.keys(spread)).to.have.members(ThingFields)
    expect(Object.values(spread).every((val) => ['string', 'number'].includes(typeof val))).to.be.true
  })

  it("sets each of its Thing fields non-writable, the fields of its life as well as its revision's", async () => {
    const gate = makeGate(await gateRecordOf())
    for (const fieldname of ThingFields) {
      expect(Object.getOwnPropertyDescriptor(gate, fieldname), fieldname).to.include({ writable: false })
    }
  })

  it("keeps its Thing fields read-only", async () => {
    const gate = makeGate(await gateRecordOf())
    expect(() => { (gate as { revtok: unknown }).revtok = 'gate-revision-tok-other' }).to.throw(TypeError)
    expect(() => { (gate as { banklabel: unknown }).banklabel = 'other' }).to.throw(TypeError)
  })

  it("has the device it was given, its own life and its own stamp", async () => {
    const record = await gateRecordOf()
    const device = TH.makeDevice()
    const gate = makeGate(record, device)
    expect(gate.device).to.eq(device)
    expect(gate.life).to.deep.equal(TH.WorldGateLife)
    expect(gate.stamp).to.deep.equal({ ...TH.WorldGate, revtok: record.revtok })
    expect(gate.scope).to.deep.equal({ modelkind: 'gate', userid: TH.WorldScope.userid, banklabel: TH.WorldScope.banklabel, labelpath: TH.WorldScope.banklabel })
    expect([gate.revtok, gate.revseq, gate.written_at]).to.deep.equal([record.revtok, 0, TH.T0])
  })

  it("has the life of its bank's gate once the bank is born", async () => {
    const { bank } = await TH.buildBornBank()
    expect(bank.gate.life).to.deep.equal(TH.WorldGateLife)
  })

  it("is a gate by its modelkind", async () => {
    expect(makeGate(await gateRecordOf()).modelkind).to.eq('gate')
  })
})

describe("a gate over the shell or a tombstone", () => {
  const RefusingMembers = [
    [(gate: Gate) => gate.stamp,                     'its stamp'],
    [(gate: Gate) => gate.main,                      'its passphrase wayin'],
    [(gate: Gate) => gate.passkey0,                  'its passkey wayin'],
    [(gate: Gate) => { gate.demandPasskeyAddable() }, 'its check that a passkey may be added'],
  ] as const

  for (const [read, blurb] of RefusingMembers) {
    it(`refuses ${blurb} over the shell`, () => {
      TH.expectSyncRefusal(() => read(makeGate(TH.gateShellOf())), 'absent_thing')
    })
  }

  it("is made from the shell, which it pickles to, with no wayins and the scope and citation of the shell", () => {
    const gate = makeGate(TH.gateShellOf())
    expect(gate.pickle()).to.deep.equal(TH.gateShellOf())
    expect(Object.hasOwn(gate, 'wayins')).to.be.false
    expect(gate.wayins).to.be.undefined
    expect(gate.scope).to.deep.equal(TH.GateScope)
    expect(gate.modelkind).to.eq('gate')
  })

  it("refuses a shell of another bank than its bank's", () => {
    TH.expectSyncRefusal(() => makeGate({ ...TH.gateShellOf(), banklabel: 'other', labelpath: 'other', label: 'other' }), 'record_conflict')
  })

  it("is made from a whole tombstone, the bank's end, which keeps its bank's banktok", async () => {
    const tomb = TH.gateTombOf(await gateRecordOf())
    const gate = makeGate(tomb)
    expect(gate.pickle()).to.equal(tomb)
    expect([gate.am, gate.banktok]).to.deep.equal(['x', TH.WorldBankLife.banktok])
    TH.expectSyncRefusal(() => gate.main, 'absent_thing')
  })

  it("takes in a gating's cleartexts over the shell, and refuses and vacates it at its attempt", async () => {
    const gate = makeGate(TH.gateShellOf())
    const form = new FormData()
    form.set('passphrase', TH.TestPassphrase)
    const gating = gate.unlockGating(form)
    expect(form.has('passphrase')).to.be.false
    await TH.expectRefusal(gating.attempt(), 'absent_thing')
    await TH.expectRefusal(gating.attempt(), 'gating_concluded')
  })

  it("refuses every form verb over the shell", async () => {
    const gate = makeGate(TH.gateShellOf())
    await TH.expectRefusal(gate.unlock({ passphraseCleartext: TH.TestPassphrase }), 'absent_thing')
    await TH.expectRefusal(gate.replacePassphrase({ passphraseCleartext: TH.TestPassphrase, nextPassphraseCleartext: 'a different passphrase, just as long' }), 'absent_thing')
    await TH.expectRefusal(gate.addPasskey({ passphraseCleartext: TH.TestPassphrase, nextPasskeyCleartext: TH.passkeyAnswerOf() }), 'absent_thing')
    await TH.expectRefusal(gate.revokePasskey({ passphraseCleartext: TH.TestPassphrase }), 'absent_thing')
  })

  it("receives a whole record over the shell, and then answers its wayins, frozen", async () => {
    const gate = makeGate(TH.gateShellOf())
    const record = await gateRecordOf(true)
    expect(gate.receive(TH.thingEventOf<GateRecord>(record))).to.eq(true)
    expect(gate.stamp).to.deep.equal({ ...TH.WorldGate, revtok: record.revtok })
    expect(gate.main.pickle()).to.deep.equal(record.wayins.main)
    expect(gate.passkey0!.pickle()).to.deep.equal(record.wayins.passkey0)
    expect(gate.wayins).to.deep.equal(record.wayins)
    expect(Object.isFrozen(gate.wayins)).to.be.true
    expect(Object.isFrozen(gate.wayins?.main)).to.be.true
  })

  it("adopts the gate's tombstone it receives, the bank's end, which keeps its banktok", async () => {
    const record = await gateRecordOf()
    const gate = makeGate(record)
    const tombstone = TH.gateTombOf(record)
    gate.receive(TH.thingEventOf<GateRecord>(tombstone))
    expect(gate.pickle()).to.equal(tombstone)
    expect(gate.banktok).to.equal(record.banktok)
  })

  it("adopts a newer revision it receives, answering that revision's wayins", async () => {
    const gate = makeGate(await gateRecordOf())
    const next = Gate.makeNextRecord(TH.livePickleOf(gate), await wayinsOf(true))
    gate.receive(TH.thingEventOf<GateRecord>(next))
    expect(gate.revseq).to.eq(1)
    expect(gate.passkey0!.pickle()).to.deep.equal(next.wayins.passkey0)
  })
})

describe("gate.demandPasskeyAddable()", () => {
  it("passes a gate with no passkey and refuses one that has one", async () => {
    const gate = makeGate(await gateRecordOf())
    expect(() => { gate.demandPasskeyAddable() }).to.not.throw()
    const both = makeGate(await gateRecordOf(true))
    TH.expectSyncRefusal(() => { both.demandPasskeyAddable() })
  })
})

describe("gate.subscribe(listener)", () => {
  it("tells its subscribers of each gate change, this device's or another's, and of no lock, unlock or wait", async () => {
    const { bank, device } = await TH.buildBornBank()
    const { gate } = bank
    const counter = TH.countCalls(gate.subscribe)
    gate.lock()
    const ensuring = TH.expectRefusal(gate.ensureUnlocked(), 'dismissed')
    gate.dismissUnlock()
    await ensuring
    await gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    expect(counter.calls).to.eq(0)
    const ante = gate.pickle()
    await gate.addPasskey({ passphraseCleartext: TH.TestPassphrase, nextPasskeyCleartext: TH.passkeyAnswerOf() })
    expect(counter.calls).to.eq(1)
    expect(gate.pickle()).to.not.equal(ante)
    const elsewhere = { ...gate.pickle(), revtok: Crypto.randomId(), revseq: gate.revseq + 1, written_at: TH.T0 + 1 }
    device.bank.demandVaultMinder().receive({ ...TH.itemEventOf(elsewhere), sourcelabel: 'other_device', read_tc: readTcNow() })
    expect(counter.calls).to.eq(2)
    expect(gate.pickle()).to.deep.equal(elsewhere)
  })

  it("tells every subscriber when one throws, and passes the throw to the device's onBadNews", async () => {
    const onBadNews = vi.fn()
    const { bank } = await TH.buildBornBank({ device: TH.makeDevice({}, { onBadNews }) })
    bank.gate.subscribe(() => { throw new Error("a bug in the host") })
    const listener = vi.fn()
    bank.gate.subscribe(listener)
    await bank.gate.addPasskey({ passphraseCleartext: TH.TestPassphrase, nextPasskeyCleartext: TH.passkeyAnswerOf() })
    expect(listener).toHaveBeenCalledOnce()
    await TH.eventually(() => onBadNews.mock.calls.length === 1)
    expect((onBadNews.mock.calls[0]![0] as BadNews).news).to.include({ refusalkind: 'unexpected_error' })
  })

  it("refuses a listener that is not a function", async () => {
    const gate = makeGate(await gateRecordOf())
    TH.expectSyncRefusal(() => gate.subscribe('call me' as never), 'bad_record')
  })
})

describe("gate.seal(sealer, donor, publicProps, secretProps) and gate.unseal(sealer, record)", () => {
  it("seal and unseal under the gate's lease while it is unlocked", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.gate.seal(BaseBox, TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    expect(await bank.gate.unseal(BaseBox, box)).to.deep.include({ whisper: TH.Whisper })
    expect(await bank.device.vault!.unsealBox(box)).to.deep.include({ whisper: TH.Whisper })
  })

  it("refuse 'bank_locked' while the gate is locked, and its end cause once its device is disabled", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.gate.seal(BaseBox, TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    bank.gate.lock()
    await TH.expectRefusal(bank.gate.seal(BaseBox, TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'bank_locked')
    await TH.expectRefusal(bank.gate.unseal(BaseBox, box), 'bank_locked')
    bank.device.disable()
    expect(await TH.expectRefusal(bank.gate.unseal(BaseBox, box), 'disabled')).to.equal(bank.gate.endCause)
  })
})

describe("a gate whose device is disabled", () => {
  it("is locked and disabled for good, with its device's end cause, as its bank is", async () => {
    const { bank, device } = await TH.buildBornBank()
    device.disable()
    expect([bank.gate.isEnabled, bank.gate.isLocked]).to.deep.equal([false, true])
    expect(bank.gate.endCause).to.equal(device.endCause).and.equal(bank.endCause)
    expect(TH.expectSyncRefusal(() => bank.gate.demandEnabled(), 'disabled')).to.equal(bank.gate.endCause)
  })
})

describe("the lease a proof grants a gate", () => {
  it("renews the lease the gate has: it keeps that lease's born_at, and is proved now", async () => {
    const { bank } = await TH.buildBornBank()
    vi.setSystemTime(TH.T0 + 5)
    const make = vi.spyOn(Lease, 'make')
    await bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    expect(make.mock.calls[0]![0]).to.include({ born_at: TH.T0, proved_at: TH.T0 + 5 })
    expect(bank.gate.leaseEndsAt).to.equal(TH.T0 + 5 + bank.device.leaseMillis)
  })

  it("shows its loggable through the gate's leaseLoggable, and null once the gate locks", async () => {
    const { bank } = await TH.buildBornBank()
    expect(bank.gate.leaseLoggable).to.include({ born_at: TH.T0, proved_at: TH.T0, labelpath: `lease/${TH.WorldScope.banklabel}`, gate_labelpath: TH.WorldScope.banklabel, wayinkind: 'passphrase', isEvicted: false })
    bank.gate.lock()
    expect(bank.gate.leaseLoggable).to.be.null
  })

  it("is born when it is proved, where the gate has no lease", async () => {
    const { bank } = await TH.buildBornBank()
    bank.gate.lock()
    vi.setSystemTime(TH.T0 + 5)
    const make = vi.spyOn(Lease, 'make')
    await bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    expect(make.mock.calls[0]![0]).to.include({ born_at: TH.T0 + 5, proved_at: TH.T0 + 5 })
  })

  it("renews the lease the gate has across a gate verb, citing the revision it writes, and leaves it out of its softlock", async () => {
    const { bank } = await TH.buildBornBank()
    vi.setSystemTime(TH.T0 + 5)
    const make = vi.spyOn(Lease, 'make')
    await bank.gate.replacePassphrase({ passphraseCleartext: TH.TestPassphrase, nextPassphraseCleartext: 'a different passphrase, just as long' })
    // The gate's news softlocks the lease first; the renewal follows that softlock.
    expect(make.mock.calls.map(([record]) => record.revseq)).to.deep.equal([1, 2])
    expect(make.mock.lastCall![0]).to.include({ born_at: TH.T0, proved_at: TH.T0 + 5, gate_revtok: bank.gate.revtok })
    expect(bank.gate.isSoftlocked).to.be.false
  })
})
