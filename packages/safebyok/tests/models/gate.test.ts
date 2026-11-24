import { describe, expect, it, vi } from 'vitest'
import { Errors } from 'safebyok-big/internals'
import { BaseBox } from '../../src/models/base-box'
import { Gate } from '../../src/models/gate'
import { Lease } from '../../src/models/lease'
import { NOVEL, PasskeyProving, PassphraseProving } from '../../src/models/proving'
import { Wayin } from '../../src/models/wayin'
import type { GateOpts } from '../../src/shapes/shapes-gateish'
import type { ShellOf } from '../../src/shapes/shapes-sealers'
import { type GateRecord, Shell, ThingFormat } from '../../src/shapes/shapes-thing'
import { Lifeseq } from '../../src/shapes/primitives'
import * as TH from '../test-helpers'

TH.useFakeClock()

const ThingFields = ['userid', 'banklabel', 'labelpath', 'label', 'fmt', 'lifepath', 'lifeseq', 'revtok', 'revseq', 'born_at', 'written_at', 'am']
const GateFields = [...ThingFields, 'wayins', 'auth', 'sigs', 'meta']

/** What a gate of {@link TH.WorldBankStamp}'s bank is made with: a new device of its scope, and the bank's stamp. */
function worldOpts(): GateOpts {
  const device = TH.makeDevice()
  return { device, bankStamp: TH.WorldBankStamp }
}

/** The gate of `record` made by the world of `opts.device`, which hands `Gate.make` its friend. */
function makeGate(record: GateRecord | ShellOf<GateRecord>, opts: GateOpts = worldOpts()): Gate { return opts.device.world.makeGate(record, opts.bankStamp) }

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
    const gate = makeGate(record)
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

describe("Gate.make(record, { device, bankStamp }, friend), by world.makeGate(record, bankStamp)", () => {
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
    [(record: GateRecord) => ({ ...record, am: 'x', lifeseq: Lifeseq.ofLifenum(1), lifepath: Lifeseq.ofLifenum(1) }),                 'am x, where the main gate is never deleted'],
    [(record: GateRecord) => ({ ...record, maingate: record }),                                                       'a field no gate Thing has'],
    [() => null,                                                                                                     'null'],
  ] as const

  for (const [recordOf, blurb] of RecordCases) {
    it(`refuses a record with ${blurb}`, async () => {
      const record = recordOf(await gateRecordOf(true))
      TH.expectSyncRefusal(() => makeGate(record as never), 'bad_record')
    })
  }

  const OtherBankCases = [
    [{ banklabel: 'other' }, 'another banklabel'],
    [{ userid: 'u2' },       'another userid'],
  ] as const

  for (const [moved, blurb] of OtherBankCases) {
    it(`refuses a record with ${blurb} than its bank's`, async () => {
      const record = { ...await gateRecordOf(), ...moved }
      TH.expectSyncRefusal(() => makeGate(record), 'record_conflict')
    })
  }

  for (const [moved, blurb] of OtherBankCases) {
    it(`refuses a device of ${blurb} than its bank's`, async () => {
      const record = await gateRecordOf()
      const device = TH.makeDevice(moved)
      TH.expectSyncRefusal(() => makeGate(record, { device, bankStamp: TH.WorldBankStamp }), 'record_conflict')
    })
  }

  it("accepts a record of another life than its bank's: only the bank's scope is checked", async () => {
    const later = Lifeseq.ofLifenum(2)
    const record = { ...await gateRecordOf(), lifeseq: later, lifepath: later }
    expect(makeGate(record).lifeseq).to.eq(later)
  })

  it("refuses opts with no bankStamp, no opts at all, or no friend", async () => {
    const record = await gateRecordOf()
    const opts = worldOpts()
    TH.expectSyncRefusal(() => makeGate(record, { ...opts, bankStamp: undefined } as never), 'bad_record')
    TH.expectSyncRefusal(() => Gate.make(record, undefined as never, undefined as never))
    TH.expectSyncRefusal(() => Gate.make(record, opts, undefined as never), 'bad_record')
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

  it("has the bank's stamp, the device it was given, and its own stamp", async () => {
    const record = await gateRecordOf()
    const opts = worldOpts()
    const gate = makeGate(record, opts)
    expect(gate.device).to.eq(opts.device)
    expect(gate.bankStamp).to.deep.equal(TH.WorldBankStamp)
    expect(gate.stamp).to.deep.equal(TH.WorldGateStamp)
    expect(gate.scope).to.deep.equal({ userid: TH.WorldScope.userid, banklabel: TH.WorldScope.banklabel, labelpath: 'gate' })
    expect([gate.revtok, gate.revseq, gate.written_at]).to.deep.equal([record.revtok, 0, TH.T0])
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

  it("is made from the shell, which it pickles to, with no wayins and the scope, bank stamp and citation of the shell", () => {
    const gate = makeGate(TH.gateShellOf())
    expect(gate.pickle()).to.deep.equal(TH.gateShellOf())
    expect(Object.hasOwn(gate, 'wayins')).to.be.false
    expect(gate.wayins).to.be.undefined
    expect(gate.scope).to.deep.equal(TH.GateScope)
    expect(gate.bankStamp).to.deep.equal(TH.WorldBankStamp)
    expect(gate.citable).to.deep.equal(Shell.Cited)
    expect(gate.modelkind).to.eq('gate')
  })

  it("refuses a shell of another bank than its bank's", () => {
    TH.expectSyncRefusal(() => makeGate({ ...TH.gateShellOf(), banklabel: 'other' }), 'record_conflict')
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
    expect(gate.receive(TH.thingEventOf(record)).length).to.be.greaterThan(0)
    expect(gate.stamp).to.deep.equal(TH.WorldGateStamp)
    expect(gate.main.pickle()).to.deep.equal(record.wayins.main)
    expect(gate.passkey0!.pickle()).to.deep.equal(record.wayins.passkey0)
    expect(gate.wayins).to.deep.equal(record.wayins)
    expect(Object.isFrozen(gate.wayins)).to.be.true
    expect(Object.isFrozen(gate.wayins?.main)).to.be.true
  })

  it("stops answering its wayins once it receives a tombstone of a later life", async () => {
    const gate = makeGate(await gateRecordOf())
    const later = Lifeseq.ofLifenum(1)
    const tombstone = { ...TH.GateScope, label: 'gate', fmt: ThingFormat, revtok: TH.revtokOf('gone'), revseq: 1, am: 'x', lifeseq: later, lifepath: later, born_at: TH.T0, written_at: TH.T0 + 1 } as const
    gate.receive(TH.thingEventOf<GateRecord>(tombstone))
    expect(gate.pickle()).to.equal(tombstone)
    expect(Object.hasOwn(gate, 'wayins')).to.be.false
    TH.expectSyncRefusal(() => gate.main, 'absent_thing')
    await TH.expectRefusal(gate.unlock({ passphraseCleartext: TH.TestPassphrase }), 'absent_thing')
  })

  it("adopts a newer revision it receives, answering that revision's wayins", async () => {
    const gate = makeGate(await gateRecordOf())
    const next = Gate.makeNextRecord(TH.livePickleOf(gate), await wayinsOf(true))
    gate.receive(TH.thingEventOf(next))
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
  it("tells its subscribers of a lock, an unlock, a wait opened and dismissed, a gate change and its end, and of nothing after", async () => {
    const { bank } = await TH.buildBornBank()
    const { gate } = bank
    const counter = TH.countCalls(gate.subscribe)
    gate.lock()
    expect([counter.calls, gate.isLocked]).to.deep.equal([1, true])
    const ensuring = TH.expectRefusal(gate.ensureUnlocked(), 'dismissed')
    expect([counter.calls, gate.isUnlockWanted]).to.deep.equal([2, true])
    gate.dismissUnlock()
    await ensuring
    expect([counter.calls, gate.isUnlockWanted]).to.deep.equal([3, false])
    await gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    expect([counter.calls, gate.isUnlocked]).to.deep.equal([4, true])
    await gate.addPasskey({ passphraseCleartext: TH.TestPassphrase, nextPasskeyCleartext: TH.passkeyAnswerOf() })
    expect(counter.calls).to.be.greaterThan(4)
    const beforeSweep = counter.calls
    gate.sweep()
    expect(counter.calls).to.eq(beforeSweep + 1)
    gate.lock()
    expect(counter.calls).to.eq(beforeSweep + 1)
  })

  it("tells every subscriber when one throws, and passes the throw to the device's onBadNews", async () => {
    const onBadNews = vi.fn()
    const { bank } = await TH.buildBornBank({ device: TH.makeDevice({}, { onBadNews }) })
    bank.gate.subscribe(() => { throw new Error("a bug in the host") })
    const listener = vi.fn()
    bank.gate.subscribe(listener)
    bank.gate.lock()
    expect(listener).toHaveBeenCalledOnce()
    await TH.eventually(() => onBadNews.mock.calls.length === 1)
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
    expect(await bank.unsealBox(box)).to.deep.include({ whisper: TH.Whisper })
  })

  it("refuse 'bank_locked' while the gate is locked, and its end cause once it is swept", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.gate.seal(BaseBox, TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    bank.gate.lock()
    await TH.expectRefusal(bank.gate.seal(BaseBox, TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'bank_locked')
    await TH.expectRefusal(bank.gate.unseal(BaseBox, box), 'bank_locked')
    bank.gate.sweep()
    expect(await TH.expectRefusal(bank.gate.unseal(BaseBox, box), 'disabled')).to.equal(bank.gate.endCause)
  })
})

describe("the lease a proof grants a gate", () => {
  it("renews the lease the gate holds: it keeps that lease's born_at, and is proved now", async () => {
    const { bank } = await TH.buildBornBank()
    vi.setSystemTime(TH.T0 + 5)
    const make = vi.spyOn(Lease, 'make')
    await bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    expect(make.mock.calls[0]![0]).to.include({ born_at: TH.T0, proved_at: TH.T0 + 5 })
    expect(bank.gate.leaseEndsAt).to.equal(TH.T0 + 5 + bank.device.leaseMillis)
  })

  it("shows its loggable through the gate's leaseLoggable, and null once the gate locks", async () => {
    const { bank } = await TH.buildBornBank()
    expect(bank.gate.leaseLoggable).to.include({ born_at: TH.T0, proved_at: TH.T0, labelpath: 'lease/gate', gate_labelpath: 'gate', wayinkind: 'passphrase', isEvicted: false })
    bank.gate.lock()
    expect(bank.gate.leaseLoggable).to.be.null
  })

  it("is born when it is proved, where the gate holds no lease", async () => {
    const { bank } = await TH.buildBornBank()
    bank.gate.lock()
    vi.setSystemTime(TH.T0 + 5)
    const make = vi.spyOn(Lease, 'make')
    await bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    expect(make.mock.calls[0]![0]).to.include({ born_at: TH.T0 + 5, proved_at: TH.T0 + 5 })
  })

  it("renews the lease the gate holds across a gate verb, citing the revision it writes", async () => {
    const { bank } = await TH.buildBornBank()
    vi.setSystemTime(TH.T0 + 5)
    const make = vi.spyOn(Lease, 'make')
    await bank.gate.replacePassphrase({ passphraseCleartext: TH.TestPassphrase, nextPassphraseCleartext: 'a different passphrase, just as long' })
    expect(make.mock.calls[0]![0]).to.include({ born_at: TH.T0, proved_at: TH.T0 + 5, gate_revtok: bank.gate.revtok })
  })
})

describe("gate.sweep(endCause)", () => {
  it("drops its world's lease, disables the gate and its bank for good, and rejects a waiter with the end cause given", async () => {
    const { bank } = await TH.buildBornBank()
    const { gate } = bank
    gate.lock()
    const endCause = new Errors.VaultError('disabled', "the bank was swept")
    const ensuring = TH.expectRefusal(gate.ensureUnlocked(), 'disabled')
    gate.sweep(endCause)
    expect(await ensuring).to.equal(endCause)
    expect([gate.isEnabled, gate.isLocked, gate.endCause]).to.deep.equal([false, true, endCause])
    gate.sweep(new Errors.VaultError('disabled', "a second sweep"))
    expect(gate.endCause).to.equal(endCause)
    expect(bank.endCause).to.equal(endCause)
  })

  it("takes its device's end cause, or a 'disabled' refusal of its own, where none is given", async () => {
    const { bank } = await TH.buildBornBank()
    bank.gate.sweep()
    expect(bank.gate.endCause).to.include({ refusalkind: 'disabled' })
    expect(TH.expectSyncRefusal(() => bank.gate.demandEnabled(), 'disabled')).to.equal(bank.gate.endCause)
  })

  it("is swept with its bank's end cause as its bank is swept", async () => {
    const { bank } = await TH.buildBornBank()
    bank.sweep()
    expect(bank.gate.endCause).to.equal(bank.endCause)
  })

  it("refuses an end cause that is not a VaultError, leaving the gate enabled", async () => {
    const gate = makeGate(await gateRecordOf())
    TH.expectSyncRefusal(() => gate.sweep(new Error("not a refusal") as never), 'bad_record')
    expect(gate.isEnabled).to.be.true
  })
})
