import { describe, expect, it, vi } from 'vitest'
import { BX, Errors, SX } from 'safebyok-big/internals'
import { Bank, type BankRecord } from '../../src/models/bank'
import { Gate } from '../../src/models/gate'
import { Lease } from '../../src/models/lease'
import { NOVEL, PassphraseProving, Proving } from '../../src/models/proving'
import { PutNotBuilt } from '../../src/phrases'
import * as TH from '../test-helpers'

TH.useFakeClock()

const BankFields = ['user_id', 'banklabel', 'fmt', 'bank_tok', 'am', 'revision_tok', 'revision_seq', 'registered_at', 'written_at']

/** `val` changed, keeping its type: a number one more, a string with a letter added. */
function changed(val: unknown): unknown { return ((typeof val === 'number') ? val + 1 : `${String(val)}x`) }

/** A stored proving of `bank`'s main gate, by {@link TH.TestPassphrase}. */
function storedProvingOf(bank: Bank): Promise<PassphraseProving> { return PassphraseProving.buildStored(bank.maingate, TH.TestPassphrase, bank.device) }

describe("Bank.mintStamps(scope)", () => {
  it("mints a bank's stamp and its main gate's, of the scope, registered now", () => {
    const { bankStamp, gateStamp } = Bank.mintStamps(TH.WorldScope)
    expect(bankStamp).to.include({ ...TH.WorldScope, registered_at: TH.T0 })
    expect(gateStamp).to.include({ ...TH.WorldScope, gatelabel: 'main', registered_at: TH.T0 })
    expect(Object.keys(bankStamp)).to.have.members(['user_id', 'banklabel', 'bank_tok', 'registered_at'])
    expect(Object.keys(gateStamp)).to.have.members(['user_id', 'banklabel', 'gatelabel', 'gate_tok', 'registered_at'])
  })

  it("mints fresh life tokens on every call", () => {
    const one = Bank.mintStamps(TH.WorldScope)
    const two = Bank.mintStamps(TH.WorldScope)
    expect(one.bankStamp.bank_tok).to.not.eq(two.bankStamp.bank_tok)
    expect(one.gateStamp.gate_tok).to.not.eq(two.gateStamp.gate_tok)
    expect(one.bankStamp.bank_tok).to.not.eq(one.gateStamp.gate_tok)
  })

  it("takes the scope of anything that has one, such as a device", () => {
    const { bankStamp } = Bank.mintStamps(TH.makeDevice())
    expect(bankStamp).to.include(TH.WorldScope)
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
  it("is a bank row at its first revision, of its stamp, with its main gate's first record", async () => {
    const { record, bank } = await TH.buildBornBank()
    expect(record).to.include({ ...TH.WorldBankStamp, fmt: BX.BankFormat, revision_seq: 0, written_at: TH.T0, am: 'a' })
    expect(record.maingate).to.include({ ...TH.WorldGateStamp, fmt: BX.GateFormat, revision_seq: 0, bank_tok: TH.WorldBankStamp.bank_tok })
    expect(record.maingate.wayins.main).to.deep.equal(bank.maingate.main.pickle())
    expect(Object.keys(record)).to.have.members([...BankFields, 'maingate'])
  })

  it("refuses a dna with no main gate, a malformed one, or none at all", async () => {
    const { record } = await TH.buildBornBank()
    TH.expectSyncRefusal(() => Bank.makeRecord({ ...TH.WorldBankStamp } as never))
    TH.expectSyncRefusal(() => Bank.makeRecord({ ...TH.WorldBankStamp, maingate: { ...TH.WorldGateStamp, wayins: record.maingate.wayins } } as never))
    TH.expectSyncRefusal(() => Bank.makeRecord(null as never))
  })

  it("refuses a dna with no bank_tok", async () => {
    const { record } = await TH.buildBornBank()
    const bank = Bank.make(record, { device: TH.makeDevice() })
    const dna = { ...TH.omitting(TH.WorldBankStamp, 'bank_tok'), maingate: { ...TH.WorldGateStamp, wayins: { main: bank.maingate.main, passkey0: null } } }
    TH.expectSyncRefusal(() => Bank.makeRecord(dna), 'bad_option')
  })
})

describe("Bank.make(record, { device })", () => {
  it("makes a locked bank of the record, its main gate a Gate of the same life, on the device", async () => {
    const { record, device } = await TH.buildBornBank()
    const bank = Bank.make(record, { device })
    expect(bank.isLocked).to.be.true
    expect(bank.isUnlocked).to.be.false
    expect(bank.stamp).to.deep.equal(TH.WorldBankStamp)
    expect(bank.scope).to.deep.equal(TH.WorldScope)
    expect(bank.device).to.equal(device)
    expect(bank.device_tok).to.eq(TH.DeviceTok)
    expect(bank.maingate).to.be.instanceOf(Gate)
    expect(bank.maingate.pickle()).to.deep.equal(record.maingate)
    expect(bank.maingate.bankStamp).to.deep.equal(TH.WorldBankStamp)
    expect([bank.revision_tok, bank.revision_seq, bank.written_at]).to.deep.equal([record.revision_tok, 0, TH.T0])
  })

  it("pickles to its row alone, frozen, without its main gate", async () => {
    const { record, bank } = await TH.buildBornBank()
    const pickle = bank.pickle()
    expect(Object.keys(pickle)).to.have.members(BankFields)
    const { maingate: _maingate, ...row } = record
    expect(pickle).to.deep.equal(row)
    expect(Object.isFrozen(pickle)).to.be.true
  })

  it("shows its stamp alone, frozen, and serializes no wrapped bankKey", async () => {
    const { bank } = await TH.buildBornBank()
    expect(Object.keys(bank)).to.have.members(['user_id', 'banklabel', 'bank_tok', 'registered_at'])
    expect(Object.isFrozen(bank)).to.be.true
    expect(() => { (bank as { bank_tok: string }).bank_tok = 'bank-tok-other' }).to.throw(TypeError)
    expect(JSON.stringify(bank)).to.not.include('ciphertext_b64')
    expect(bank.modelkind).to.eq('bank')
  })

  const RecordCases = [
    [(record: BankRecord) => ({ ...record, am: 'x' }),                    'a tombstone'],
    [(record: BankRecord) => ({ ...record, fmt: 3000 }),                  'another fmt'],
    [(record: BankRecord) => TH.omitting(record, 'bank_tok'),             'no bank_tok'],
    [(record: BankRecord) => ({ ...record, vaultlabel: 'main' }),         'a field no bank row has'],
    [(record: BankRecord) => TH.omitting(record, 'maingate'),             'no main gate'],
    [(record: BankRecord) => ({ ...record, maingate: null }),             'a null main gate'],
    [(record: BankRecord) => ({ ...record, registered_at: 'yesterday' }), 'a registered_at that is not epoch millis'],
    [() => null,                                                          'null'],
  ] as const

  for (const [recordOf, blurb] of RecordCases) {
    it(`refuses a record with ${blurb}`, async () => {
      const { record, device } = await TH.buildBornBank()
      TH.expectSyncRefusal(() => Bank.make(recordOf(record) as never, { device }), 'bad_option')
    })
  }

  const OtherDeviceCases = [
    [{ user_id: 'u2' },     "another user's device"],
    [{ banklabel: 'work' }, "a device of the user's other bank"],
  ] as const

  for (const [moved, blurb] of OtherDeviceCases) {
    it(`refuses ${blurb}`, async () => {
      const { record } = await TH.buildBornBank()
      TH.expectSyncRefusal(() => Bank.make(record, { device: TH.makeDevice(moved) }), 'record_conflict')
    })
  }

  it("refuses a main gate of another life of the bank", async () => {
    const { record, device } = await TH.buildBornBank()
    TH.expectSyncRefusal(() => Bank.make({ ...record, maingate: { ...record.maingate, bank_tok: 'bank-tok-other' } }, { device }), 'record_conflict')
  })

  it("refuses a device that is not a Device, and no opts at all", async () => {
    const { record, device } = await TH.buildBornBank()
    TH.expectSyncRefusal(() => Bank.make(record, { device: { ...device.toJSON(), scope: device.scope, isEnabled: true } } as never), 'bad_option')
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
    expect(make.mock.calls[0]![0]).to.include({ gate_tok: bank.maingate.gate_tok, gate_revision_tok: bank.maingate.revision_tok, wayinkind: 'passphrase', proved_at: TH.T0 })
  })

  it("cites the gate revision it is given", async () => {
    const { bank } = await TH.buildBornBank()
    const make = vi.spyOn(Lease, 'make')
    await bank.unlockByProving(await storedProvingOf(bank), { ...TH.WorldGate, revision_tok: 'gate-revision-tok-9' })
    expect(make.mock.calls[0]![0]).to.include({ gate_revision_tok: 'gate-revision-tok-9' })
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
    const theirs = await PassphraseProving.buildNovel({ ...TH.WorldBankStamp, bank_tok: 'bank-tok-other' }, TH.WorldGateStamp, TH.TestPassphrase, bank.device)
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

describe("bank.sealBox(ante, cleartexts) and bank.unsealBox(box)", () => {
  it("seals a new box over its shell, at its first revision, in a new life", async () => {
    const { bank } = await TH.buildBornBank()
    vi.setSystemTime(TH.T0 + 7)
    const ante = TH.boxAnteOf()
    const box = await bank.sealBox(ante, { whisper: TH.Whisper })
    expect(box).to.include({ boxlabel: 'anthropic_api_key', am: 'a', revision_seq: 0, registered_at: TH.T0 + 7, written_at: TH.T0 + 7 })
    expect(box.box_tok).to.not.eq(ante.box_tok)
    expect(box.box_tok).to.not.eq(SX.VoidLifeTok)
    expect(box.revision_tok).to.not.eq(ante.revision_tok)
    expect(box.sidecar).to.deep.equal(ante.sidecar)
    expect(JSON.stringify(box)).to.not.include('sk-test-0000')
    expect(BX.boxRecord.parse(box)).to.deep.equal(box)
  })

  it("unseals the box's whisper, leaving out its sealed fields", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxAnteOf(), { whisper: TH.Whisper })
    const unsealed = await bank.unsealBox(box)
    const { box_key_wrapped: _keyWrapped, whisper_ciphered: _ciphered, ...rest } = box
    expect(unsealed).to.deep.equal({ ...rest, whisper: TH.Whisper })
    expect(unsealed).to.not.have.property('box_key_wrapped')
    expect(unsealed).to.not.have.property('whisper_ciphered')
  })

  it("seals the next revision of a live box, keeping its life", async () => {
    const { bank } = await TH.buildBornBank()
    const first = await bank.sealBox(TH.boxAnteOf(), { whisper: TH.Whisper })
    vi.setSystemTime(TH.T0 + 9)
    const { box_key_wrapped: _keyWrapped, whisper_ciphered: _ciphered, ...ante } = first
    const next = await bank.sealBox({ ...ante, sidecar: { account: 'home' } }, { whisper: { apiKey: 'sk-test-1111' } })
    expect(next).to.include({ box_tok: first.box_tok, registered_at: first.registered_at, revision_seq: 1, written_at: TH.T0 + 9, am: 'a' })
    expect(next.revision_tok).to.not.eq(first.revision_tok)
    expect(await bank.unsealBox(next)).to.deep.include({ whisper: { apiKey: 'sk-test-1111' }, sidecar: { account: 'home' } })
  })

  it("starts a new life over a tombstone", async () => {
    const { bank } = await TH.buildBornBank()
    const first = await bank.sealBox(TH.boxAnteOf(), { whisper: TH.Whisper })
    const { box_key_wrapped: _keyWrapped, whisper_ciphered: _ciphered, ...rest } = first
    const reborn = await bank.sealBox({ ...rest, am: 'x' }, { whisper: TH.Whisper })
    expect(reborn.box_tok).to.not.eq(first.box_tok)
    expect(reborn.revision_seq).to.eq(first.revision_seq + 1)
  })

  it("seals the same whisper differently each time: a fresh boxKey and cipherIv", async () => {
    const { bank } = await TH.buildBornBank()
    const ante = TH.boxAnteOf()
    const one = await bank.sealBox(ante, { whisper: TH.Whisper })
    const two = await bank.sealBox(ante, { whisper: TH.Whisper })
    expect(one.whisper_ciphered.ciphertext_b64).to.not.eq(two.whisper_ciphered.ciphertext_b64)
    expect(one.box_key_wrapped.ciphertext_b64).to.not.eq(two.box_key_wrapped.ciphertext_b64)
  })

  it("unseals a box sealed before the bank locked and unlocked again", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxAnteOf(), { whisper: TH.Whisper })
    bank.lock()
    await bank.unlockByProving(await storedProvingOf(bank))
    const { whisper } = await bank.unsealBox(box)
    expect(whisper).to.deep.equal(TH.Whisper)
  })

  it("unseals with its sidecar altered, as the seal leaves the sidecar out", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxAnteOf(), { whisper: TH.Whisper })
    const unsealed = await bank.unsealBox({ ...box, sidecar: { account: 'home' } })
    expect(unsealed).to.deep.include({ whisper: TH.Whisper, sidecar: { account: 'home' } })
  })

  // The box's user_id, banklabel and bank_tok are bound too, but a box claiming another bank is refused before the unseal, below.
  const SparseFields = ['vaultlabel', 'boxlabel', 'vault_tok', 'box_tok', 'revision_tok', 'revision_seq', 'registered_at', 'written_at'] as const

  for (const fieldname of SparseFields) {
    it(`refuses 'damaged_whisper' for a box whose ${fieldname} was altered`, async () => {
      const { bank } = await TH.buildBornBank()
      const box = await bank.sealBox(TH.boxAnteOf(), { whisper: TH.Whisper })
      await TH.expectRefusal(bank.unsealBox({ ...box, [fieldname]: changed(box[fieldname]) }), 'damaged_whisper')
    })
  }

  const FixedFields = [
    ['fmt',                    SX.BoxFormat + 1],
    ['whisper_codec',          'json_v2'],
    ['whisper_schema_version', 2],
    ['am',                     'x'],
  ] as const

  for (const [fieldname, altered] of FixedFields) {
    it(`refuses a box whose ${fieldname} is not its one value, before unsealing`, async () => {
      const { bank } = await TH.buildBornBank()
      const box = await bank.sealBox(TH.boxAnteOf(), { whisper: TH.Whisper })
      await TH.expectRefusal(bank.unsealBox({ ...box, [fieldname]: altered }), 'bad_option')
    })
  }

  it("refuses 'damaged_whisper' for one box's sealed fields on another box", async () => {
    const { bank } = await TH.buildBornBank()
    const one = await bank.sealBox(TH.boxAnteOf(), { whisper: TH.Whisper })
    const two = await bank.sealBox(TH.boxAnteOf({ boxlabel: 'openai_api_key' }), { whisper: { apiKey: 'sk-test-2222' } })
    await TH.expectRefusal(bank.unsealBox({ ...two, box_key_wrapped: one.box_key_wrapped, whisper_ciphered: one.whisper_ciphered }), 'damaged_whisper')
    await TH.expectRefusal(bank.unsealBox({ ...two, whisper_ciphered: one.whisper_ciphered }), 'damaged_whisper')
    await TH.expectRefusal(bank.unsealBox({ ...two, box_key_wrapped: one.box_key_wrapped }), 'damaged_whisper')
  })

  it("refuses 'damaged_whisper' for tampered ciphertext, quoting none of it", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxAnteOf(), { whisper: TH.Whisper })
    const ciphertext_b64 = TH.tweakB64(box.whisper_ciphered.ciphertext_b64)
    const err = await TH.expectRefusal(bank.unsealBox({ ...box, whisper_ciphered: { ...box.whisper_ciphered, ciphertext_b64 } }), 'damaged_whisper')
    expect(TH.thrownText(err)).to.not.include(ciphertext_b64)
  })

  it("refuses 'damaged_whisper' for a box another bank of the same stamp sealed", async () => {
    const { bank } = await TH.buildBornBank()
    const { bank: other } = await TH.buildBornBank()
    const box = await other.sealBox(TH.boxAnteOf(), { whisper: TH.Whisper })
    await TH.expectRefusal(bank.unsealBox(box), 'damaged_whisper')
    expect(bank.isUnlocked).to.be.true
  })

  const OtherBanks = [
    [{ user_id: 'u2' },              "another user's"],
    [{ banklabel: 'other' },         'another banklabel'],
    [{ bank_tok: 'bank-tok-other' }, "another life of the bank's"],
  ] as const

  for (const [moved, blurb] of OtherBanks) {
    it(`refuses 'record_conflict' at the seal and the unseal for a box claiming ${blurb}`, async () => {
      const { bank } = await TH.buildBornBank()
      await TH.expectRefusal(bank.sealBox(TH.boxAnteOf(moved), { whisper: TH.Whisper }), 'record_conflict')
      const box = await bank.sealBox(TH.boxAnteOf(), { whisper: TH.Whisper })
      await TH.expectRefusal(bank.unsealBox({ ...box, ...moved }), 'record_conflict')
      expect(bank.isUnlocked).to.be.true
    })
  }

  it("refuses 'bank_locked' at the seal and the unseal once the bank locks", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxAnteOf(), { whisper: TH.Whisper })
    bank.lock()
    await TH.expectRefusal(bank.unsealBox(box), 'bank_locked')
    await TH.expectRefusal(bank.sealBox(TH.boxAnteOf(), { whisper: TH.Whisper }), 'bank_locked')
  })

  it("refuses at the seal and the unseal on a swept device", async () => {
    const { bank, device } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxAnteOf(), { whisper: TH.Whisper })
    device.sweep()
    await TH.expectRefusal(bank.unsealBox(box), 'disabled')
    await TH.expectRefusal(bank.sealBox(TH.boxAnteOf(), { whisper: TH.Whisper }), 'disabled')
  })

  const AnteCases = [
    [() => ({ ...TH.boxAnteOf(), box_key_wrapped: TH.fakeCiphered('k') }), 'an ante carrying a sealed field'],
    [() => ({ ...TH.boxAnteOf(), am: 'd' }),                               'an ante of a damaged row'],
    [() => TH.omitting(TH.boxAnteOf(), 'sidecar'),                         'an ante with no sidecar'],
    [() => null,                                                           'null'],
  ] as const

  for (const [anteOf, blurb] of AnteCases) {
    it(`refuses to seal ${blurb}`, async () => {
      const { bank } = await TH.buildBornBank()
      await TH.expectRefusal(bank.sealBox(anteOf() as never, { whisper: TH.Whisper }), 'bad_option')
    })
  }

  const WhisperCases = [
    [{ whisper: 'sk-test-0000' },    'a whisper that is a string'],
    [{ whisper: null },              'a null whisper'],
    [{},                             'no whisper'],
    [null,                           'no cleartexts at all'],
  ] as const

  for (const [cleartexts, blurb] of WhisperCases) {
    it(`refuses to seal ${blurb}`, async () => {
      const { bank } = await TH.buildBornBank()
      await TH.expectRefusal(bank.sealBox(TH.boxAnteOf(), cleartexts as never))
    })
  }

  it("refuses to unseal a tombstone, a box with no sealed fields, or null", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxAnteOf(), { whisper: TH.Whisper })
    const { box_key_wrapped: _keyWrapped, whisper_ciphered: _ciphered, ...ante } = box
    await TH.expectRefusal(bank.unsealBox({ ...ante, am: 'x' } as never), 'bad_option')
    await TH.expectRefusal(bank.unsealBox(ante as never), 'bad_option')
    await TH.expectRefusal(bank.unsealBox(null as never), 'bad_option')
  })
})

describe("bank.put(opts)", () => {
  it("rejects in this layer, which stores nothing", async () => {
    const { bank } = await TH.buildBornBank()
    const err = await TH.expectRefusal(bank.put({ ifPresent: 'fail' }), 'unexpected_error')
    expect(err.message).to.eq(PutNotBuilt)
  })
})

