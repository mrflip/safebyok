import { describe, expect, it, vi } from 'vitest'
import { Crypto, Errors, SX } from 'safebyok-big/internals'
import { Bank, type BankMakeRecord } from '../../src/models/bank'
import { Gate } from '../../src/models/gate'
import { Lease } from '../../src/models/lease'
import { NOVEL, PassphraseProving, Proving } from '../../src/models/proving'
import type { BoxRecord, BoxTombstone } from '../../src/models/sealers'
import { BankThingFormat, BoxThingFormat, GateThingFormat, ShellCited, ShellLifeseq, boxThing, getAskOf, sparseOf, lifeseqOfLifenum } from '../../src/storage/shapes-thing'
import type { BirthBankAnswer } from '../../src/storage/vault-db'
import * as TH from '../test-helpers'

TH.useFakeClock()

/** The fields of a bank's Thing, which has no body. */
const BankFields = Object.keys(TH.bankThingOf())

/** The lifeseqs of a box's first lives: live, gone, live again, gone again. Life 0 is the root box's too. */
const Life0 = lifeseqOfLifenum(0)
const Life1 = lifeseqOfLifenum(1)
const Life2 = lifeseqOfLifenum(2)
const Life3 = lifeseqOfLifenum(3)

/** A stored proving of `bank`'s main gate, by {@link TH.TestPassphrase}. */
function storedProvingOf(bank: Bank): Promise<PassphraseProving> { return PassphraseProving.buildStored(bank.device, bank.maingate, TH.TestPassphrase) }

/** What a birth on `device` is given, as the gating attempt makes it: the record of a bank of {@link TH.WorldBankStamp}, and opts with its passphrase's proving. */
async function birthArgsOf(device = TH.makeDevice()) {
  const proving = await PassphraseProving.buildNovel(device, TH.WorldBankStamp, TH.WorldGateStamp, TH.TestPassphrase)
  const record = Bank.makeRecord({ ...TH.WorldBankStamp, maingate: { ...TH.WorldGateStamp, wayins: { main: await proving.buildWayin(NOVEL), passkey0: null } } })
  return { device, record, opts: { device, vaultDB: device.vaultDB, proving } }
}

describe("Bank.mintStamps(scope)", () => {
  it("mints the stamp of the bank's first life and its main gate's, of the scope, born now", () => {
    const { bankStamp, gateStamp } = Bank.mintStamps(TH.WorldScope)
    expect(bankStamp).to.deep.equal({ ...TH.ThingBank, lifeseq: Life0, born_at: TH.T0 })
    expect(gateStamp).to.deep.equal({ ...TH.ThingBank, labelpath: 'gate', lifeseq: Life0, born_at: TH.T0 })
  })

  it("mints the first lifeseqs on every call, born when it is called", () => {
    const one = Bank.mintStamps(TH.WorldScope)
    vi.setSystemTime(TH.T0 + 5)
    const two = Bank.mintStamps(TH.WorldScope)
    expect([one.bankStamp.lifeseq, two.bankStamp.lifeseq, one.gateStamp.lifeseq, two.gateStamp.lifeseq]).to.deep.equal([Life0, Life0, Life0, Life0])
    expect([two.bankStamp.born_at, two.gateStamp.born_at]).to.deep.equal([TH.T0 + 5, TH.T0 + 5])
  })

  it("takes the scope of anything that has one, such as a device", () => {
    const { bankStamp } = Bank.mintStamps(TH.makeDevice())
    expect(bankStamp).to.include(TH.ThingBank)
    expect(bankStamp).to.not.have.property('device_tok')
  })

  const ScopeCases = [
    [null,                               'null'],
    [{ user_id: 'u1' },                  'a scope with no banklabel'],
    [{ ...TH.WorldScope, banklabel: '' }, 'an empty banklabel'],
  ] as const

  for (const [scope, blurb] of ScopeCases) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => Bank.mintStamps(scope as never))
    })
  }
})

describe("Bank.makeRecord(dna)", () => {
  it("is the bank's Thing at its first revision, of its stamp, with its main gate's first record and its root box's", async () => {
    const { record, bank } = await TH.buildBornBank()
    expect(record).to.include({ ...TH.WorldBankStamp, labelpath: 'bank', label: 'bank', fmt: BankThingFormat, revseq: 0, am: 'a', lifepath: Life0, written_at: TH.T0 })
    expect(record.maingate).to.include({ ...TH.WorldGateStamp, label: 'gate', fmt: GateThingFormat, revseq: 0, am: 'a', lifepath: Life0, written_at: TH.T0 })
    expect(record.maingate.wayins).to.deep.equal({ main: bank.maingate.main.pickle(), passkey0: null })
    expect(Object.keys(record)).to.have.members([...BankFields, 'maingate', 'rootBox'])
  })

  it("makes the root box its shell, which the birth seals as the first revision of its first life", async () => {
    const { record, bank } = await TH.buildBornBank()
    expect(record.rootBox).to.deep.equal({ ...TH.RootScope, label: 'box', fmt: BoxThingFormat, ...ShellCited, lifeseq: ShellLifeseq, born_at: SX.VoidTime, written_at: SX.VoidTime })
    expect(bank.rootBox).to.include({ ...TH.RootScope, revseq: 0, am: 'a', lifeseq: Life0, lifepath: Life0, born_at: TH.T0, written_at: TH.T0 })
    expect(sparseOf(bank.rootBox)).to.deep.equal(bank.rootBox)
  })

  it("refuses a dna with no main gate, a malformed one, or none at all", async () => {
    const { record } = await TH.buildBornBank()
    TH.expectSyncRefusal(() => Bank.makeRecord({ ...TH.WorldBankStamp } as never))
    TH.expectSyncRefusal(() => Bank.makeRecord({ ...TH.WorldBankStamp, maingate: { ...TH.WorldGateStamp, wayins: record.maingate.wayins } } as never))
    TH.expectSyncRefusal(() => Bank.makeRecord(null as never))
  })

  it("refuses a dna with no lifeseq", async () => {
    const { record, device } = await TH.buildBornBank()
    const bank = Bank.make(record, { device, vaultDB: device.vaultDB })
    const dna = { ...TH.omitting(TH.WorldBankStamp, 'lifeseq'), maingate: { ...TH.WorldGateStamp, wayins: { main: bank.maingate.main, passkey0: null } } }
    TH.expectSyncRefusal(() => Bank.makeRecord(dna), 'bad_option')
  })
})

describe("Bank.make(record, { device, vaultDB })", () => {
  it("makes a locked bank of the record, its main gate a Gate of the same life, on the device", async () => {
    const { record, device } = await TH.buildBornBank()
    const bank = Bank.make(record, { device, vaultDB: device.vaultDB })
    expect(bank.isLocked).to.be.true
    expect(bank.isUnlocked).to.be.false
    expect(bank.stamp).to.deep.equal(TH.WorldBankStamp)
    expect(bank.scope).to.deep.equal(TH.ThingBank)
    expect(bank.device).to.equal(device)
    expect(bank.device_tok).to.eq(TH.DeviceTok)
    expect(bank.maingate).to.be.instanceOf(Gate)
    expect(bank.maingate.pickle()).to.deep.equal(record.maingate)
    expect(bank.maingate.bankStamp).to.deep.equal(TH.WorldBankStamp)
    expect(bank.rootBox).to.deep.equal(record.rootBox)
    expect([bank.revtok, bank.revseq, bank.written_at]).to.deep.equal([record.revtok, 0, TH.T0])
  })

  it("pickles to its Thing alone, frozen, without its main gate or root box", async () => {
    const { record, bank } = await TH.buildBornBank()
    const pickle = bank.pickle()
    expect(Object.keys(pickle)).to.have.members(BankFields)
    const { maingate: _maingate, rootBox: _rootBox, ...thing } = record
    expect(pickle).to.deep.equal(thing)
    expect(Object.isFrozen(pickle)).to.be.true
  })

  it("shows its Thing fields alone, frozen, and serializes no wrapped bankKey", async () => {
    const { bank } = await TH.buildBornBank()
    expect(Object.keys(bank)).to.have.members(BankFields)
    expect(Object.isFrozen(bank)).to.be.true
    expect(() => { (bank as { lifeseq: string }).lifeseq = Life2 }).to.throw(TypeError)
    expect(JSON.stringify(bank)).to.not.include('ciphertext_b64')
    expect(bank.modelkind).to.eq('bank')
  })

  const RecordCases = [
    [(record: BankMakeRecord) => ({ ...record, am: 'x' }),                    'a tombstone'],
    [(record: BankMakeRecord) => ({ ...record, fmt: 3000 }),                  'another fmt'],
    [(record: BankMakeRecord) => TH.omitting(record, 'lifeseq'),              'no lifeseq'],
    [(record: BankMakeRecord) => ({ ...record, lifepath: Life2 }),            'a lifepath not its lifeseq'],
    [(record: BankMakeRecord) => ({ ...record, labelpath: 'gate' }),          'the labelpath of another kind'],
    [(record: BankMakeRecord) => ({ ...record, vaultlabel: 'main' }),         'a field no bank Thing has'],
    [(record: BankMakeRecord) => TH.omitting(record, 'maingate'),             'no main gate'],
    [(record: BankMakeRecord) => ({ ...record, maingate: null }),             'a null main gate'],
    [(record: BankMakeRecord) => TH.omitting(record, 'rootBox'),              'no root box'],
    [(record: BankMakeRecord) => ({ ...record, rootBox: { ...record.rootBox, am: 'd' } }), 'a root box of a damaged row'],
    [(record: BankMakeRecord) => ({ ...record, born_at: 'yesterday' }),       'a born_at that is not epoch millis'],
    [() => null,                                                          'null'],
  ] as const

  for (const [recordOf, blurb] of RecordCases) {
    it(`refuses a record with ${blurb}`, async () => {
      const { record, device } = await TH.buildBornBank()
      TH.expectSyncRefusal(() => Bank.make(recordOf(record) as never, { device, vaultDB: device.vaultDB }), 'bad_option')
    })
  }

  const OtherDeviceCases = [
    [{ user_id: 'u2' },     "another user's device"],
    [{ banklabel: 'work' }, "a device of the user's other bank"],
  ] as const

  for (const [moved, blurb] of OtherDeviceCases) {
    it(`refuses ${blurb}`, async () => {
      const { record } = await TH.buildBornBank()
      const device = TH.makeDevice(moved)
      TH.expectSyncRefusal(() => Bank.make(record, { device, vaultDB: device.vaultDB }), 'record_conflict')
    })
  }

  it("refuses a main gate of another bank", async () => {
    const { record, device } = await TH.buildBornBank()
    TH.expectSyncRefusal(() => Bank.make({ ...record, maingate: { ...record.maingate, banklabel: 'work' } }, { device, vaultDB: device.vaultDB }), 'record_conflict')
  })

  // A gate's life is its own: a main gate born again stands in the bank's life it was born in.
  it("accepts a main gate of a later life of its own", async () => {
    const { record, device } = await TH.buildBornBank()
    const bank = Bank.make({ ...record, maingate: { ...record.maingate, lifeseq: Life2, lifepath: Life2 } }, { device, vaultDB: device.vaultDB })
    expect(bank.maingate.lifeseq).to.eq(Life2)
  })

  const OtherRootCases = [
    [{ userid: 'u2' },       "another user's"],
    [{ banklabel: 'work' },  "the user's other bank's"],
  ] as const

  for (const [moved, blurb] of OtherRootCases) {
    it(`refuses ${blurb} root box`, async () => {
      const { record, device } = await TH.buildBornBank()
      TH.expectSyncRefusal(() => Bank.make({ ...record, rootBox: { ...record.rootBox, ...moved } }, { device, vaultDB: device.vaultDB }), 'record_conflict')
    })
  }

  it("refuses a box other than the root box as its root box", async () => {
    const { record, device } = await TH.buildBornBank()
    const box = TH.boxThingOf('openai')
    TH.expectSyncRefusal(() => Bank.make({ ...record, rootBox: box }, { device, vaultDB: device.vaultDB }), 'record_conflict')
  })

  it("refuses a device that is not a Device, a vaultDB that is not a VaultDB, and no opts at all", async () => {
    const { record, device } = await TH.buildBornBank()
    TH.expectSyncRefusal(() => Bank.make(record, { device: { ...device.toJSON(), scope: device.scope, isEnabled: true }, vaultDB: device.vaultDB } as never), 'bad_option')
    TH.expectSyncRefusal(() => Bank.make(record, { device, vaultDB: { ...device.vaultDB, tryGetThing: null } } as never), 'bad_option')
    TH.expectSyncRefusal(() => Bank.make(record, { device } as never), 'bad_option')
    TH.expectSyncRefusal(() => Bank.make(record, undefined as never), 'bad_option')
  })
})

describe("bank.unlockByProving(proved, cited) and bank.lock()", () => {
  it("unlocks with a stored proving of its main gate, citing that gate by default", async () => {
    const { bank } = await TH.buildBornBank()
    bank.lock()
    const make = vi.spyOn(Lease, 'make')
    expect(await bank.unlockByProving(await storedProvingOf(bank))).to.equal(bank)
    expect(bank.isUnlocked).to.be.true
    expect(make.mock.calls[0]![0]).to.include({ gate_labelpath: 'gate', gate_lifeseq: Life0, gate_revtok: bank.maingate.revtok, wayinkind: 'passphrase', proved_at: TH.T0 })
  })

  it("cites the gate revision it is given", async () => {
    const { bank } = await TH.buildBornBank()
    const make = vi.spyOn(Lease, 'make')
    await bank.unlockByProving(await storedProvingOf(bank), { ...TH.WorldGate, revtok: 'gate-revision-tok-9' })
    expect(make.mock.calls[0]![0]).to.include({ gate_revtok: 'gate-revision-tok-9' })
  })

  it("evicts the lease an unlock replaces", async () => {
    const { bank } = await TH.buildBornBank()
    const evict = vi.spyOn(Lease.prototype, 'evict')
    await bank.unlockByProving(await storedProvingOf(bank))
    expect(evict).toHaveBeenCalledTimes(1)
    expect(bank.isUnlocked).to.be.true
  })

  it("locks, evicting its lease, and locks again with nothing to evict", async () => {
    const { bank } = await TH.buildBornBank()
    const evict = vi.spyOn(Lease.prototype, 'evict')
    expect(bank.lock()).to.equal(bank)
    expect(bank.isLocked).to.be.true
    bank.lock()
    expect(evict).toHaveBeenCalledTimes(1)
  })

  it("refuses a proving of another bank, and stays locked", async () => {
    const { bank } = await TH.buildBornBank()
    const { bank: other } = await TH.buildBornBank()
    bank.lock()
    const theirs = await PassphraseProving.buildNovel(bank.device, { ...TH.WorldBankStamp, lifeseq: Life2 }, TH.WorldGateStamp, TH.TestPassphrase)
    await theirs.buildWayin(NOVEL)
    await TH.expectRefusal(bank.unlockByProving(theirs))
    expect(bank.isLocked).to.be.true
    expect(other.isUnlocked).to.be.true
  })

  it("refuses what is not a Proving, and stays locked", async () => {
    const { bank } = await TH.buildBornBank()
    bank.lock()
    await TH.expectRefusal(bank.unlockByProving({ wayinkind: 'passphrase' } as never), 'bad_option')
    await TH.expectRefusal(bank.unlockByProving(null as never), 'bad_option')
    expect(bank.isLocked).to.be.true
  })

  it("refuses on a swept device", async () => {
    const { bank, device } = await TH.buildBornBank()
    const proving = await storedProvingOf(bank)
    bank.lock()
    device.sweep()
    expect(bank.isEnabled).to.be.false
    await TH.expectRefusal(bank.unlockByProving(proving), 'disabled')
    expect(bank.isLocked).to.be.true
  })

  it("leaves the lease attached when the proving's buildLease refuses", async () => {
    const { bank } = await TH.buildBornBank()
    vi.spyOn(Proving.prototype, 'buildLease').mockRejectedValueOnce(new Errors.VaultError('unexpected_error', 'no lease today'))
    await TH.expectRefusal(bank.unlockByProving(await storedProvingOf(bank)), 'unexpected_error')
    expect(bank.isUnlocked).to.be.true
  })
})

describe("bank.sealBox(donor, publicProps, secretProps) and bank.unsealBox(box)", () => {
  it("seals a new box over its shell: the first revision of its first life, born now", async () => {
    const { bank } = await TH.buildBornBank()
    vi.setSystemTime(TH.T0 + 7)
    const shell = TH.boxShellOf()
    const box = await bank.sealBox(shell, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    expect(box).to.include({ labelpath: 'box/anthropic_api_key', am: 'a', revseq: 0, lifeseq: Life0, lifepath: `${Life0}/${Life0}`, born_at: TH.T0 + 7, written_at: TH.T0 + 7 })
    expect(box.revtok).to.not.eq(shell.revtok)
    expect(box.sidecar).to.deep.equal(TH.Sidecar)
    expect(box.whisper_sealed).to.include({ codectag: 'json_v1', schematag: 'whisper_v1' })
    expect(JSON.stringify(box)).to.not.include('sk-test-0000')
    expect(boxThing.parse(box)).to.deep.equal(box)
  })

  it("unseals the box's whisper in place of its sealed one", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const unsealed = await bank.unsealBox(box)
    const { whisper_sealed: _sealed, ...rest } = box
    expect(unsealed).to.deep.equal({ ...rest, whisper: TH.Whisper })
    expect(Object.isFrozen(unsealed)).to.be.true
  })

  it("seals the next revision of a live box, keeping its life, from the stored box with a new sidecar", async () => {
    // sealBox @example
    const { bank } = await TH.buildBornBank()
    const first = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    vi.setSystemTime(TH.T0 + 9)
    const next = await bank.sealBox(first, { sidecar: { account: 'home' } }, { whisper: { apiKey: 'sk-test-1111' } })
    expect(next).to.include({ lifeseq: first.lifeseq, lifepath: first.lifepath, born_at: first.born_at, revseq: 1, written_at: TH.T0 + 9, am: 'a' })
    expect(next.revtok).to.not.eq(first.revtok)
    expect(await bank.unsealBox(next)).to.deep.include({ whisper: { apiKey: 'sk-test-1111' }, sidecar: { account: 'home' } })
  })

  it("seals the same whisper differently each time: a fresh part key and cipher iv", async () => {
    const { bank } = await TH.buildBornBank()
    const shell = TH.boxShellOf()
    const one = await bank.sealBox(shell, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const two = await bank.sealBox(shell, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    expect(one.whisper_sealed.ciphered.ciphertext_b64).to.not.eq(two.whisper_sealed.ciphered.ciphertext_b64)
    expect(one.whisper_sealed.key_wrapped.ciphertext_b64).to.not.eq(two.whisper_sealed.key_wrapped.ciphertext_b64)
  })

  it("unseals a box sealed before the bank locked and unlocked again", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    bank.lock()
    await bank.unlockByProving(await storedProvingOf(bank))
    const { whisper } = await bank.unsealBox(box)
    expect(whisper).to.deep.equal(TH.Whisper)
  })

  it("unseals with its sidecar altered, as the seal leaves the sidecar out", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const unsealed = await bank.unsealBox({ ...box, sidecar: { account: 'home' } })
    expect(unsealed).to.deep.include({ whisper: TH.Whisper, sidecar: { account: 'home' } })
  })

  // Each alteration still passes the box's check, so only the seal can catch it. The box's userid and banklabel are bound
  // too, but a box claiming another bank is refused before the unseal, below.
  const AlteredCases = [
    [(box: BoxRecord) => ({ ...box, revtok: `${box.revtok}x` }),                                   'its revtok'],
    [(box: BoxRecord) => ({ ...box, revseq: box.revseq + 1 }),                                             'its revseq'],
    [(box: BoxRecord) => ({ ...box, born_at: box.born_at + 1 }),                                           'its born_at'],
    [(box: BoxRecord) => ({ ...box, written_at: box.written_at + 1 }),                                     'its written_at'],
    [(box: BoxRecord) => ({ ...box, labelpath: 'box/openai_api_key', label: 'openai_api_key' }),           'its labelpath and label'],
    [(box: BoxRecord) => ({ ...box, lifeseq: Life2, lifepath: `${Life0}/${Life2}` }),                       'its lifeseq'],
    [(box: BoxRecord) => ({ ...box, whisper_sealed: { ...box.whisper_sealed, codectag: 'json_v2' } }),     'its codectag'],
    [(box: BoxRecord) => ({ ...box, whisper_sealed: { ...box.whisper_sealed, schematag: 'whisper_v2' } }), 'its schematag'],
  ] as const

  for (const [alter, blurb] of AlteredCases) {
    it(`refuses 'damaged_whisper' for a box with ${blurb} altered`, async () => {
      const { bank } = await TH.buildBornBank()
      const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
      await TH.expectRefusal(bank.unsealBox(alter(box)), 'damaged_whisper')
    })
  }

  const UncheckedCases = [
    [(box: BoxRecord) => ({ ...box, fmt: BoxThingFormat + 1 }),                                        'its fmt not its one value'],
    [(box: BoxRecord) => ({ ...box, am: 'd' }),                                                        'am d'],
    [(box: BoxRecord) => ({ ...box, label: 'openai_api_key' }),                                        'a label not the last of its labelpath'],
    [(box: BoxRecord) => ({ ...box, whisper_sealed: { ...box.whisper_sealed, codectag: 'JSON v1' } }), 'a codectag that is not a label'],
    [(box: BoxRecord) => ({ ...box, whisper_sealed: { ...box.whisper_sealed, extra: 'field' } }),      'a field no sealed part has'],
    [(box: BoxRecord) => TH.omitting(box, 'whisper_sealed'),                                           'no sealed whisper'],
    [() => null,                                                                                       'null'],
  ] as const

  for (const [alter, blurb] of UncheckedCases) {
    it(`refuses a box with ${blurb}, before unsealing`, async () => {
      const { bank } = await TH.buildBornBank()
      const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
      await TH.expectRefusal(bank.unsealBox(alter(box) as never), 'bad_option')
    })
  }

  it("refuses 'damaged_whisper' for one box's sealed whisper on another box", async () => {
    const { bank } = await TH.buildBornBank()
    const one = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const two = await bank.sealBox(TH.boxShellOf({ labelpath: 'box/openai_api_key', label: 'openai_api_key' }), { sidecar: TH.Sidecar }, { whisper: { apiKey: 'sk-test-2222' } })
    await TH.expectRefusal(bank.unsealBox({ ...two, whisper_sealed: one.whisper_sealed }), 'damaged_whisper')
    await TH.expectRefusal(bank.unsealBox({ ...two, whisper_sealed: { ...two.whisper_sealed, ciphered: one.whisper_sealed.ciphered } }), 'damaged_whisper')
    await TH.expectRefusal(bank.unsealBox({ ...two, whisper_sealed: { ...two.whisper_sealed, key_wrapped: one.whisper_sealed.key_wrapped } }), 'damaged_whisper')
  })

  it("refuses 'damaged_whisper' for tampered ciphertext, quoting none of it", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const ciphertext_b64 = TH.tweakB64(box.whisper_sealed.ciphered.ciphertext_b64)
    const whisper_sealed = { ...box.whisper_sealed, ciphered: { ...box.whisper_sealed.ciphered, ciphertext_b64 } }
    const err = await TH.expectRefusal(bank.unsealBox({ ...box, whisper_sealed }), 'damaged_whisper')
    expect(TH.thrownText(err)).to.not.include(ciphertext_b64)
  })

  it("refuses 'damaged_whisper' for a box another bank of the same stamp sealed", async () => {
    const { bank } = await TH.buildBornBank()
    const { bank: other } = await TH.buildBornBank()
    const box = await other.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    await TH.expectRefusal(bank.unsealBox(box), 'damaged_whisper')
    expect(bank.isUnlocked).to.be.true
  })

  const OtherBanks = [
    [{ userid: 'u2' },       "another user's"],
    [{ banklabel: 'other' }, 'another banklabel'],
  ] as const

  for (const [moved, blurb] of OtherBanks) {
    it(`refuses 'record_conflict' at the seal, the tombstone and the unseal for a box claiming ${blurb}`, async () => {
      const { bank } = await TH.buildBornBank()
      await TH.expectRefusal(bank.sealBox(TH.boxShellOf(moved), { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'record_conflict')
      const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
      await TH.expectRefusal(bank.tombstoneBox({ ...box, ...moved }), 'record_conflict')
      await TH.expectRefusal(bank.unsealBox({ ...box, ...moved }), 'record_conflict')
      expect(bank.isUnlocked).to.be.true
    })
  }

  // A box sealed under another life of the bank's root box would refuse 'damaged_whisper' at the unseal, as its root
  // lifeseq is bound; the bank refuses it before any seal.
  it("refuses at the seal, the tombstone and the unseal a box under another life of the root box", async () => {
    const { bank } = await TH.buildBornBank()
    await TH.expectRefusal(bank.sealBox(TH.boxShellOf({ lifepath: `${Life2}/${ShellLifeseq}` }), { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'record_conflict')
    const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const moved = { lifepath: `${Life2}/${box.lifeseq}` }
    await TH.expectRefusal(bank.tombstoneBox({ ...box, ...moved }), 'record_conflict')
    await TH.expectRefusal(bank.unsealBox({ ...box, ...moved }), 'record_conflict')
    expect(bank.isUnlocked).to.be.true
  })

  it("refuses 'bank_locked' at the seal, the tombstone and the unseal once the bank locks", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    bank.lock()
    await TH.expectRefusal(bank.unsealBox(box), 'bank_locked')
    await TH.expectRefusal(bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'bank_locked')
    await TH.expectRefusal(bank.tombstoneBox(box), 'bank_locked')
  })

  it("refuses at the seal, the tombstone and the unseal on a swept device", async () => {
    const { bank, device } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    device.sweep()
    await TH.expectRefusal(bank.unsealBox(box), 'disabled')
    await TH.expectRefusal(bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'disabled')
    await TH.expectRefusal(bank.tombstoneBox(box), 'disabled')
  })

  const DonorCases = [
    [() => ({ ...TH.boxShellOf(), am: 'd' }),                'a donor of a damaged row'],
    [() => ({ ...TH.boxShellOf(), revseq: 0 }),              'half the shell: its revseq moved, its revtok and lifeseq not'],
    [() => ({ ...TH.boxShellOf(), labelpath: 'gate/main' }), 'a donor of another kind'],
    [() => ({ ...TH.boxShellOf(), revseq: -2 }),             'a revseq below the shell'],
    [() => null,                                             'null'],
  ] as const

  for (const [donorOf, blurb] of DonorCases) {
    it(`refuses to seal ${blurb}`, async () => {
      const { bank } = await TH.buildBornBank()
      await TH.expectRefusal(bank.sealBox(donorOf() as never, { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'bad_option')
    })
  }

  it("refuses to seal a box when neither the donor nor publicProps has a sidecar", async () => {
    const { bank } = await TH.buildBornBank()
    await TH.expectRefusal(bank.sealBox(TH.boxShellOf(), {}, { whisper: TH.Whisper }), 'bad_option')
  })

  const WhisperCases = [
    [{ whisper: 'sk-test-0000' },    'a whisper that is a string'],
    [{ whisper: null },              'a null whisper'],
    [{},                             'no whisper'],
    [null,                           'no cleartexts at all'],
  ] as const

  for (const [cleartexts, blurb] of WhisperCases) {
    it(`refuses to seal ${blurb}`, async () => {
      const { bank } = await TH.buildBornBank()
      await TH.expectRefusal(bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, cleartexts as never))
    })
  }
})

describe("bank.tombstoneBox(donor), and the unseal of a tombstone", () => {
  it("makes the tombstone of a live box: its next revision, at the next lifeseq, with no sidecar, born when the box was", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    vi.setSystemTime(TH.T0 + 11)
    const tombstone = await bank.tombstoneBox(box)
    expect(tombstone).to.include({ am: 'x', revseq: box.revseq + 1, lifeseq: Life1, lifepath: `${Life0}/${Life1}`, born_at: box.born_at, written_at: TH.T0 + 11 })
    expect(tombstone.revtok).to.not.eq(box.revtok)
    expect(tombstone).to.not.have.property('sidecar')
    expect(tombstone.whisper_sealed).to.include({ codectag: 'json_v1', schematag: 'whisper_v1' })
    expect(boxThing.parse(tombstone)).to.deep.equal(tombstone)
  })

  it("unseals a tombstone to its Thing fields and an empty whisper", async () => {
    const { bank } = await TH.buildBornBank()
    const tombstone = await bank.tombstoneBox(await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper }))
    const { whisper_sealed: _sealed, ...rest } = tombstone
    expect(await bank.unsealBox(tombstone)).to.deep.equal({ ...rest, whisper: {} })
  })

  it("starts the box's next life over its tombstone, born now", async () => {
    const { bank } = await TH.buildBornBank()
    const tombstone = await bank.tombstoneBox(await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper }))
    vi.setSystemTime(TH.T0 + 13)
    const reborn = await bank.sealBox(tombstone, { sidecar: { account: 'home' } }, { whisper: TH.Whisper })
    expect(reborn).to.include({ am: 'a', revseq: tombstone.revseq + 1, lifeseq: Life2, lifepath: `${Life0}/${Life2}`, born_at: TH.T0 + 13 })
    expect(await bank.unsealBox(reborn)).to.deep.include({ whisper: TH.Whisper, sidecar: { account: 'home' } })
  })

  it("refuses the tombstone of a tombstone or of the shell", async () => {
    const { bank } = await TH.buildBornBank()
    const tombstone = await bank.tombstoneBox(await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper }))
    await TH.expectRefusal(bank.tombstoneBox(tombstone), 'bad_option')
    await TH.expectRefusal(bank.tombstoneBox(TH.boxShellOf()), 'bad_option')
  })

  // A tombstone's signature is its sealed empty whisper, and the unseal is its check.
  it("refuses 'damaged_whisper' for a tombstone made up without the bankKey, or signed by its live box's seal", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const { sidecar: _sidecar, ...sparse } = box
    const madeUp = { ...sparse, revtok: 'rev-made-up', revseq: box.revseq + 1, am: 'x', lifeseq: Life1, lifepath: `${Life0}/${Life1}`, whisper_sealed: TH.FakeSealed } as const
    await TH.expectRefusal(bank.unsealBox(madeUp), 'damaged_whisper')
    await TH.expectRefusal(bank.unsealBox({ ...madeUp, whisper_sealed: box.whisper_sealed }), 'damaged_whisper')
  })

  it("refuses 'damaged_whisper' for a tombstone carrying another tombstone's signature", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const one = await bank.tombstoneBox(box)
    const two = await bank.tombstoneBox(box)
    await TH.expectRefusal(bank.unsealBox({ ...two, whisper_sealed: one.whisper_sealed }), 'damaged_whisper')
  })

  const AlteredCases = [
    [(tombstone: BoxTombstone) => ({ ...tombstone, revtok: `${tombstone.revtok}x` }),              'its revtok'],
    [(tombstone: BoxTombstone) => ({ ...tombstone, written_at: tombstone.written_at + 1 }),            'its written_at'],
    [(tombstone: BoxTombstone) => ({ ...tombstone, lifeseq: Life3, lifepath: `${Life0}/${Life3}` }),   'its lifeseq'],
  ] as const

  for (const [alter, blurb] of AlteredCases) {
    it(`refuses 'damaged_whisper' for a tombstone with ${blurb} altered`, async () => {
      const { bank } = await TH.buildBornBank()
      const tombstone = await bank.tombstoneBox(await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper }))
      await TH.expectRefusal(bank.unsealBox(alter(tombstone)), 'damaged_whisper')
    })
  }
})

/** The revision of `bank`'s Thing after the one in hand, written a millisecond later. */
function nextBankThingOf(bank: Bank) {
  return { ...bank.pickle(), revtok: Crypto.randomId(), revseq: bank.revseq + 1, written_at: bank.written_at + 1 }
}

describe("bank.track, and the asks the bank builds", () => {
  it("track the revseq and lifepath this object holds of the bank, its main gate and its root box", async () => {
    const { bank } = await TH.buildBornBank()
    expect(bank.track).to.deep.equal(TH.trackOf(bank.pickle(), bank.maingate.pickle(), bank.rootBox as never))
  })

  it("fill in the bank's scope, the modelkind, the default flags and the track", async () => {
    const { bank } = await TH.buildBornBank()
    const { scope, track } = bank
    expect(bank.makeGetAsk({ labelpath: 'box/openai' })).to.deep.equal({ ...scope, labelpath: 'box/openai', op: 'get', modelkind: 'box', ifAbsent: 'nil', track })
    expect(bank.makeListAsk({ labelpath: 'box' })).to.deep.equal({ ...scope, labelpath: 'box', op: 'list', modelkind: 'box', ifAbsent: 'fail', track })
    const record = nextBankThingOf(bank)
    expect(bank.makePutAsk({ cited: bank.pickle(), record })).to.deep.include({ ...scope, labelpath: 'bank', op: 'put', modelkind: 'bank', ifAbsent: 'add', ifPresent: 'repl', track })
    const box = TH.boxThingOf()
    expect(bank.makeDelAsk({ cited: box, record: TH.boxTombOf(box) })).to.deep.include({ ...scope, op: 'del', modelkind: 'box', ifAbsent: 'fail', track })
  })

  it("track what this object holds, though the bank stored has moved on: the answer's tracked says so", async () => {
    const { bank, device } = await TH.buildBornBank()
    const record = nextBankThingOf(bank)
    await bank.put({ cited: bank.pickle(), record })
    const answer = await device.vaultDB.tryGetThing(bank.makeGetAsk({ labelpath: 'bank' }))
    expect(answer).to.deep.include({ ok: true, tracked: { bank: record, gate: 'same', box: 'same' } })
  })
})

describe("bank.tellBadNews(badnews)", () => {
  it("passes the news to its device's onBadNews", async () => {
    const onBadNews = vi.fn()
    const { bank } = await TH.buildBornBank({ device: TH.makeDevice({}, { onBadNews }) })
    bank.tellBadNews([new Errors.VaultError('storage_unavailable', "Down.")])
    await TH.eventually(() => onBadNews.mock.calls.length === 1)
    expect(onBadNews.mock.calls[0]?.[0]).to.deep.include({ device: bank.device })
  })
})

describe("bank.put(args)", () => {
  it("writes the bank's next revision, answering it as stored, and leaves the bank in hand as it was", async () => {
    const { bank, device } = await TH.buildBornBank()
    const record = nextBankThingOf(bank)
    expect(await bank.put({ cited: bank.pickle(), record })).to.deep.equal(record)
    expect(bank.revtok).to.not.eq(record.revtok)
    const got = await device.vaultDB.tryGetThing(getAskOf({ ...bank.scope, labelpath: 'bank' }))
    expect(got).to.deep.include({ ok: true, val: record })
  })

  it("throws the vaultDB's refusal, as for a revision it does not cite", async () => {
    const { bank } = await TH.buildBornBank()
    await TH.expectRefusal(bank.put({ cited: { ...bank.pickle(), revtok: 'rev-stale' }, record: nextBankThingOf(bank) }))
    expect(await bank.put({ cited: bank.pickle(), record: nextBankThingOf(bank) })).to.include({ revseq: 1 })
  })

  it("refuses a record of another bank, writing nothing", async () => {
    const { bank, device } = await TH.buildBornBank()
    const record = { ...nextBankThingOf(bank), banklabel: 'work' }
    await TH.expectRefusal(bank.put({ cited: { ...bank.pickle(), banklabel: 'work' }, record }))
    const got = await device.vaultDB.tryGetThing(getAskOf({ ...bank.scope, labelpath: 'bank' }))
    expect(got).to.deep.include({ ok: true, val: bank.pickle() })
  })

  it("refuses on a swept device, before it reaches the vaultDB", async () => {
    const { bank, device } = await TH.buildBornBank()
    const tryWriteThing = vi.spyOn(device.vaultDB, 'tryWriteThing')
    device.sweep()
    const err = await TH.expectRefusal(bank.put({ cited: bank.pickle(), record: nextBankThingOf(bank) }), 'disabled')
    expect(err).to.equal(device.endCause)
    expect(tryWriteThing).not.toHaveBeenCalled()
  })
})

describe("Bank.birth(record, opts)", () => {
  it("births the bank, its main gate and its root box sealed under a new lease, and unlocks under that lease", async () => {
    const { device, record, opts } = await birthArgsOf()
    const births = TH.spyBirths(device)
    const bank = await Bank.birth(record, opts)
    const answer = await (births.tryBirthBank.mock.results[0]!.value as Promise<BirthBankAnswer>)
    expect(answer).to.include({ ok: true, act: 'born' })
    if (! answer.ok) { throw answer.err }
    expect(answer.val.bank).to.deep.equal(bank.pickle())
    expect(answer.val.gate).to.deep.equal(bank.maingate.pickle())
    expect(answer.val.root).to.include({ ...TH.RootScope, revseq: 0, am: 'a', lifeseq: Life0, lifepath: Life0, born_at: TH.T0 })
    expect(births.lockedAtBirths).to.deep.equal([true])
    expect(bank.rootBox).to.deep.equal(sparseOf(answer.val.root))
    expect(bank.isUnlocked).to.be.true
    expect(await bank.unsealBox(answer.val.root)).to.deep.include({ whisper: {} })
  })

  // The vaultDB answers retcon, not passed, to a birth it stored already; passed on this bank is a vaultDB's answer alone.
  it("unlocks where the vaultDB passes on this same bank, taking the root box it answers", async () => {
    const { device, record, opts } = await birthArgsOf()
    const tryBirthBank = device.vaultDB.tryBirthBank.bind(device.vaultDB)
    const births = TH.spyBirths(device, async (ask) => {
      const born = await tryBirthBank(ask)
      return born.ok ? { ...born, act: 'passed' } : born
    })
    const bank = await Bank.birth(record, opts)
    const answer = await (births.tryBirthBank.mock.results[0]!.value as Promise<BirthBankAnswer>)
    expect(answer).to.include({ ok: true, act: 'passed' })
    expect(bank.isUnlocked).to.be.true
    expect(bank.rootBox).to.deep.equal(answer.ok && sparseOf(answer.val.root))
  })

  it("refuses gate_made_elsewhere where the vaultDB passes on another bank, leaving its own bank locked", async () => {
    const { device, record, opts } = await birthArgsOf()
    await Bank.birth(record, opts)
    const theirs = await birthArgsOf(device)
    const births = TH.spyBirths(device)
    const evict = vi.spyOn(Lease.prototype, 'evict')
    await TH.expectRefusal(Bank.birth(theirs.record, theirs.opts), 'gate_made_elsewhere')
    expect(await (births.tryBirthBank.mock.results[0]!.value as Promise<BirthBankAnswer>)).to.include({ ok: true, act: 'passed' })
    expect(births.banks[0]!.isLocked).to.be.true
    expect(births.banks[0]!.rootBox).to.include({ revtok: SX.VoidRevisionTok })
    expect(evict).toHaveBeenCalledTimes(1)
  })

  it("throws the vaultDB's refusal as it came, evicting the new lease and leaving the bank locked", async () => {
    const { device, record, opts } = await birthArgsOf()
    const refusal = new Errors.VaultError('storage_unavailable', 'the disk is full')
    const births = TH.spyBirths(device, (ask) => Promise.resolve({ ok: false, ask, act: 'unclassified_storing', world: null, dbhas: null, err: refusal }))
    const evict = vi.spyOn(Lease.prototype, 'evict')
    expect(await TH.expectRefusal(Bank.birth(record, opts))).to.equal(refusal)
    expect(births.banks[0]!.isLocked).to.be.true
    expect(evict).toHaveBeenCalledTimes(1)
  })

  it("refuses bad_option where opts has no proving", async () => {
    const { record, opts } = await birthArgsOf()
    await TH.expectRefusal(Bank.birth(record, { ...opts, proving: {} as Proving }), 'bad_option')
  })

  it("throws the device's refusal on a swept device, building no lease and writing nothing", async () => {
    const { device, record, opts } = await birthArgsOf()
    const make = vi.spyOn(Lease, 'make')
    const tryBirthBank = vi.spyOn(device.vaultDB, 'tryBirthBank')
    device.sweep()
    expect(await TH.expectRefusal(Bank.birth(record, opts), 'disabled')).to.equal(device.endCause)
    expect(make).not.toHaveBeenCalled()
    expect(tryBirthBank).not.toHaveBeenCalled()
  })

  it("throws the device's refusal where the device is swept as the birth runs, writing nothing", async () => {
    const { device, record, opts } = await birthArgsOf()
    const births = TH.spyBirths(device)
    const birthing = Bank.birth(record, opts)
    device.sweep()
    expect(await TH.expectRefusal(birthing, 'disabled')).to.equal(device.endCause)
    expect(births.tryBirthBank).not.toHaveBeenCalled()
    expect(births.banks[0]!.isLocked).to.be.true
  })
})
