import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { Crypto, GX } from 'safebyok-big/internals'
import { BaseBox } from '../../src/models/base-box'
import { Lease, withoutSecrets } from '../../src/models/lease'
import { NOVEL, PassphraseProving } from '../../src/models/proving'
import type { BoxCleartexts, Sealer, TombstoneOf } from '../../src/shapes/shapes-sealers'
import { LeaseFormat, type LeaseRecord } from '../../src/shapes/shapes-stamps'
import { type EpochMillis, Lifeseq } from '../../src/shapes/primitives'
import { type BoxRecord } from '../../src/shapes/shapes-thing'
import * as TH from '../test-helpers'

TH.useFakeClock()

const StampFieldnames = ['fmt', 'userid', 'banklabel', 'lifeseq', 'born_at', 'gate_labelpath', 'gate_lifeseq', 'gate_revtok', 'proved_at', 'wayinkind'] as const satisfies readonly (keyof LeaseRecord)[]

const Stamped = { ...TH.WorldBankStamp, fmt: LeaseFormat, gate_labelpath: 'gate', gate_lifeseq: TH.WorldGate.lifeseq, gate_revtok: TH.WorldGate.revtok, proved_at: TH.T0, wayinkind: 'passphrase' }

const Cleartexts = Object.freeze({ whisper: TH.Whisper })

/** What a box's first seal takes in the clear: its sidecar. */
const PublicProps = Object.freeze({ sidecar: TH.Sidecar })

const SealerMembernames = [
  'donorPropsOf', 'publicPropsOf', 'secretPropsOf', 'nextRevisionOf', 'tombstoneOf', 'tombstoneSecrets', 'stampOf', 'tags', 'purposes', 'encode', 'decode', 'sealedOf', 'recordOf',
] as const satisfies readonly (keyof Sealer<BoxRecord, BoxCleartexts>)[]

/** BaseBox's members, as a plain object. */
const BoxSealerBag = Object.freeze({
  donorPropsOf:     BaseBox.donorPropsOf.bind(BaseBox),
  publicPropsOf:    BaseBox.publicPropsOf.bind(BaseBox),
  secretPropsOf:    BaseBox.secretPropsOf.bind(BaseBox),
  nextRevisionOf:   BaseBox.nextRevisionOf.bind(BaseBox),
  tombstoneOf:      BaseBox.tombstoneOf.bind(BaseBox),
  tombstoneSecrets: BaseBox.tombstoneSecrets,
  stampOf:          BaseBox.stampOf.bind(BaseBox),
  tags:             BaseBox.tags,
  purposes:         BaseBox.purposes,
  encode:           BaseBox.encode.bind(BaseBox),
  decode:           BaseBox.decode.bind(BaseBox),
  sealedOf:         BaseBox.sealedOf.bind(BaseBox),
  recordOf:         BaseBox.recordOf.bind(BaseBox),
})

/** A passphrase proving of {@link TH.WorldGateStamp} with a wayin under a new bankKey: each lease it builds holds that bankKey. */
async function provingWithWayin(): Promise<PassphraseProving> {
  const proving = await PassphraseProving.buildNovel(TH.provingDeviceOf(), TH.WorldBankStamp, TH.WorldGateStamp, TH.TestPassphrase)
  await proving.buildWayin(NOVEL)
  return proving
}

/** A lease on a fake bank, beside that bank, the record it was made of, and the proving that built it. */
async function leaseWorld() {
  const proving = await provingWithWayin()
  const bank = TH.fakeLeaseBankOf()
  const { lease, record } = await TH._cheat_grantedLease(proving, bank)
  return { proving, bank, lease, record }
}

describe("Lease.make(record, { bank })", () => {
  it("makes a lease of the record, showing its stamp, in force", async () => {
    const { bank, record } = await leaseWorld()
    const lease = Lease.make(record, { bank })
    expect(lease).to.deep.include(Stamped)
    expect(lease.isEvicted).to.be.false
    expect(lease.modelkind).to.eq('lease')
  })

  it("is handed a record of the bank's stamp, the gate cited, proved_at and wayinkind, a leaseKey and the wrapped bankKey", async () => {
    const { record } = await leaseWorld()
    expect(record).to.deep.include(Stamped)
    expect(Object.keys(record)).to.have.members([...StampFieldnames, 'lease_key', 'bank_key_lease_wrapped'])
    expect(GX.isLeaseKey(record.lease_key)).to.be.true
    expect(record.lease_key.extractable).to.be.false
  })

  it("opens what another lease of the same record sealed", async () => {
    const { bank, lease, record } = await leaseWorld()
    const sealed = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    expect(await Lease.make(record, { bank }).unseal(BaseBox, sealed)).to.deep.include(Cleartexts)
  })

  const MalformedCases = [
    [(record: LeaseRecord) => ({ ...record, fmt: 'a007103' }),                                        'of another fmt'],
    [(record: LeaseRecord) => ({ ...record, fmt: 7102 }),                                             'whose fmt is a number'],
    [(record: LeaseRecord) => ({ ...record, bank_key_lease_wrapped: undefined }),                     'with no wrapped bankKey'],
    [(record: LeaseRecord) => ({ ...record, proved_at: undefined }),                                  'with no proved_at'],
    [(record: LeaseRecord) => ({ ...record, wayinkind: 'carrier_pigeon' }),                           'of an unknown wayinkind'],
    [(record: LeaseRecord) => ({ ...record, extra: 'field' }),                                        'with a field no lease has'],
    [({ gate_labelpath, ...record }: LeaseRecord) => ({ ...record, gatelabelpath: gate_labelpath }),  'with its gate labelpath at gatelabelpath'],
    [() => 'a lease',                                                                                    'that is not a record at all'],
  ] as const

  for (const [tamper, blurb] of MalformedCases) {
    it(`refuses a record ${blurb}, quoting none of it`, async () => {
      const { bank, record } = await leaseWorld()
      const err = TH.expectSyncRefusal(() => Lease.make(tamper(record) as never, { bank }), 'bad_record')
      expect(TH.thrownText(err)).to.not.include(record.bank_key_lease_wrapped.ciphertext_b64)
    })
  }

  it("refuses a record whose leaseKey is an extractable key", async () => {
    const { bank, record } = await leaseWorld()
    const bankKey = await Crypto.makeBankKey()
    TH.expectSyncRefusal(() => Lease.make({ ...record, lease_key: bankKey }, { bank }), 'bad_record')
  })

  const OtherBankCases = [
    [{ lifeseq: Lifeseq.ofLifenum(2) },   'another life of the bank, by its lifeseq'],
    [{ born_at: TH.T0 + 1 },         'another life of the bank, by its born_at'],
    [{ userid: 'u2' },               "another user's bank"],
    [{ banklabel: 'work' },          'another bank of the same user'],
  ] as const

  for (const [stamp, blurb] of OtherBankCases) {
    it(`refuses a bank of ${blurb}`, async () => {
      const { record } = await leaseWorld()
      TH.expectSyncRefusal(() => Lease.make(record, { bank: TH.fakeLeaseBankOf(stamp) }), 'damaged_lease')
    })
  }

  it("refuses a bank with no lock, one with no stamp, one with no enabled check, and no opts at all", async () => {
    const { record } = await leaseWorld()
    const { isEnabled: _isEnabled, demandEnabled: _demandEnabled, ...unchecked } = TH.fakeLeaseBankOf()
    TH.expectSyncRefusal(() => Lease.make(record, { bank: { ...TH.fakeLeaseBankOf(), lock: undefined } } as never), 'bad_record')
    TH.expectSyncRefusal(() => Lease.make(record, { bank: { ...TH.fakeLeaseBankOf(), stamp: undefined } } as never), 'bad_record')
    TH.expectSyncRefusal(() => Lease.make(record, { bank: unchecked } as never), 'bad_record')
    TH.expectSyncRefusal(() => Lease.make(record, undefined as never), 'bad_record')
  })
})

describe("lease.seal(sealer, donor, publicProps, secretProps) and lease.unseal(sealer, record)", () => {
  it("round-trips a box's whisper, its sealed part carrying the sealer's tags", async () => {
    const { lease } = await leaseWorld()
    const sealed = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    expect(sealed.whisper_sealed).to.include(BaseBox.tags)
    expect(sealed.whisper_sealed).to.have.all.keys('key_wrapped', 'ciphered', 'codectag', 'schematag')
    expect(await lease.unseal(BaseBox, sealed)).to.deep.include(Cleartexts)
  })

  it("unseals to the record, its whisper in place of its sealed whisper", async () => {
    const { lease } = await leaseWorld()
    const sealed = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    const { whisper_sealed: _sealed, ...unsealed } = sealed
    const opened = await lease.unseal(BaseBox, sealed)
    expect(opened).to.deep.equal({ ...unsealed, whisper: TH.Whisper })
    expect(Object.isFrozen(opened)).to.be.true
  })

  it("answers a copy of the record as the sealer checks it: a field beside the record refuses", async () => {
    const { lease } = await leaseWorld()
    const sealed = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    const { whisper_sealed: _sealed, ...unsealed } = sealed
    await TH.expectRefusal(lease.unseal(BaseBox, { ...sealed, extra: 'not a box field' } as never), 'bad_record')
    const answer = await lease.unseal(BaseBox, sealed)
    expect(answer).to.not.equal(sealed)
    expect(answer).to.deep.equal({ ...unsealed, whisper: TH.Whisper })
  })

  it("seals the next revision of a whole unsealed box, or a whole sealed one, carrying nothing of its whisper but the new seal", async () => {
    const { lease } = await leaseWorld()
    const first = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    const unsealed = await lease.unseal(BaseBox, first)
    const whisper = { apiKey: 'sk-test-1111' }
    for (const donor of [unsealed, first]) {
      const next = await lease.seal(BaseBox, donor, {}, { whisper })
      expect(next).to.include({ revseq: first.revseq + 1, lifeseq: first.lifeseq })
      expect(next).to.not.have.property('whisper')
      expect(next.whisper_sealed).to.not.deep.equal(first.whisper_sealed)
      expect(await lease.unseal(BaseBox, next)).to.deep.include({ whisper, sidecar: TH.Sidecar })
    }
  })

  it("lays the sidecar given over the donor's", async () => {
    // seal @example
    const { lease } = await leaseWorld()
    const first = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    const next = await lease.seal(BaseBox, first, { sidecar: { account: 'home' } }, Cleartexts)
    expect(next.sidecar).to.deep.equal({ account: 'home' })
  })

  it("refuses a misspelt key in publicProps, and a key beside the whisper in secretProps", async () => {
    const { lease } = await leaseWorld()
    await TH.expectRefusal(lease.seal(BaseBox, TH.boxShellOf(), { sidcar: TH.Sidecar } as never, Cleartexts), 'bad_record')
    await TH.expectRefusal(lease.seal(BaseBox, TH.boxShellOf(), PublicProps, { ...Cleartexts, sidecar: TH.Sidecar } as never), 'bad_record')
  })

  it("refuses when neither the donor nor the publicProps has a sidecar, sealing nothing", async () => {
    const { lease } = await leaseWorld()
    const sealer = { ...BoxSealerBag }
    const encode = vi.spyOn(sealer, 'encode')
    await TH.expectRefusal(lease.seal(sealer, TH.boxShellOf(), {}, Cleartexts), 'bad_record')
    expect(encode).not.toHaveBeenCalled()
  })

  it("writes the box at the written_at given, and signs it: a box whose written_at moved will not unseal", async () => {
    const { lease } = await leaseWorld()
    const sealed = await lease.seal(BaseBox, TH.boxShellOf(), { ...PublicProps, written_at: TH.T0 - 5 }, Cleartexts)
    expect(sealed).to.include({ written_at: TH.T0 - 5, born_at: TH.T0 - 5 })
    await TH.expectRefusal(lease.unseal(BaseBox, { ...sealed, written_at: TH.T0 }), 'damaged_whisper')
  })

  it("refuses the tombstone of a tombstone, or of the shell", async () => {
    const { lease } = await leaseWorld()
    const live = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    const tombstone = await lease.seal(BaseBox, live, { am: 'x' })
    await TH.expectRefusal(lease.seal(BaseBox, tombstone, { am: 'x' }), 'bad_record')
    await TH.expectRefusal(lease.seal(BaseBox, TH.boxShellOf(), { am: 'x' }), 'bad_record')
  })

  it("writes a tombstone at the written_at given, and signs it: a tombstone whose written_at moved will not unseal", async () => {
    const { lease } = await leaseWorld()
    const live = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    const tombstone = await lease.seal(BaseBox, live, { am: 'x', written_at: TH.T0 + 7 })
    expect(tombstone).to.include({ am: 'x', written_at: TH.T0 + 7 })
    expect(await lease.unseal(BaseBox, tombstone)).to.deep.include({ whisper: {} })
    await TH.expectRefusal(lease.unseal(BaseBox, { ...tombstone, written_at: TH.T0 + 8 }), 'damaged_whisper')
  })

  it("refuses a tombstone given a sidecar other than `{}`, as BaseBox makes it", async () => {
    const { lease } = await leaseWorld()
    const live = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    await TH.expectRefusal(lease.seal(BaseBox, live, { am: 'x', sidecar: TH.Sidecar }), 'bad_record')
  })

  it("writes a tombstone given the sidecar `{}`, a tombstone's own, as BaseBox makes it", async () => {
    const { lease } = await leaseWorld()
    const live = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    const tombstone = await lease.seal(BaseBox, live, { am: 'x', sidecar: {} })
    expectTypeOf(tombstone).toEqualTypeOf<TombstoneOf<BoxRecord>>()
    expect(tombstone).to.deep.include({ am: 'x', sidecar: {} })
  })

  it("refuses a tombstone given secret props, sealing nothing", async () => {
    const { lease } = await leaseWorld()
    const live = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    const sealer = { ...BoxSealerBag }
    const encode = vi.spyOn(sealer, 'encode')
    const err = await TH.expectRefusal(lease.seal(sealer, live, { am: 'x' }, Cleartexts), 'bad_record')
    expect(TH.thrownText(err)).to.not.include(TH.Whisper.apiKey)
    expect(encode).not.toHaveBeenCalled()
  })

  it("strips every cleartext and sealed part from what the sealer's donorPropsOf gives, before it makes the revision", async () => {
    const { lease } = await leaseWorld()
    const leaky = { ...BoxSealerBag, donorPropsOf: (donor: unknown) => ({ ...BaseBox.donorPropsOf(donor as never), whisper: TH.Whisper, notes_sealed: 'sealed notes' }) }
    const nextRevisionOf = vi.spyOn(leaky, 'nextRevisionOf')
    await lease.seal(leaky, TH.boxShellOf(), PublicProps, Cleartexts)
    expect(nextRevisionOf.mock.calls[0]?.[0]).to.not.have.any.keys('whisper', 'notes_sealed')
  })

  it("binds the bank's stamp first, its fields alone: a field beside them on the bank binds nothing", async () => {
    const proving = await provingWithWayin()
    const { lease: plain } = await TH._cheat_grantedLease(proving, TH.fakeLeaseBankOf())
    const padded = TH.fakeLeaseBankOf()
    const { lease } = await TH._cheat_grantedLease(proving, { ...padded, stamp: { ...padded.stamp, lifepath: 'not-a-stamp-field' } } as never)
    const sealed = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    expect(await plain.unseal(BaseBox, sealed)).to.deep.include(Cleartexts)
  })

  it("round-trips a tombstone's empty whisper", async () => {
    // seal @example
    const { lease } = await leaseWorld()
    const live = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    const tombstone = await lease.seal(BaseBox, live, { am: 'x' })
    expect(tombstone).to.include({ am: 'x', revseq: live.revseq + 1 })
    expect(await lease.unseal(BaseBox, tombstone)).to.deep.include({ whisper: {} })
  })

  it("zeroes the whisper's bytes once each has sealed or opened them", async () => {
    const { lease } = await leaseWorld()
    const text = BaseBox.encode(Cleartexts)
    const encode = vi.spyOn(TextEncoder.prototype, 'encode')
    const decode = vi.spyOn(TextDecoder.prototype, 'decode')
    const sealed = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    expect(await lease.unseal(BaseBox, sealed)).to.deep.include(Cleartexts)
    const sealedBytes = encode.mock.results[encode.mock.calls.findIndex(([encoded]) => encoded === text)]?.value as Uint8Array
    const openedBytes = decode.mock.calls[decode.mock.results.findIndex((decoded) => decoded.value === text)]?.[0] as Uint8Array
    encode.mockRestore()
    decode.mockRestore()
    expect(sealedBytes.length).to.eq(text.length)
    expect(openedBytes.length).to.eq(text.length)
    expect(TH.isZeroed(sealedBytes)).to.be.true
    expect(TH.isZeroed(openedBytes)).to.be.true
  })

  it("takes any value with a sealer's members, as it takes the class", async () => {
    const { lease } = await leaseWorld()
    const sealed = await lease.seal(BoxSealerBag, TH.boxShellOf(), PublicProps, Cleartexts)
    expect(await lease.unseal(BoxSealerBag, sealed)).to.deep.include(Cleartexts)
    expect(await lease.unseal(BaseBox, sealed)).to.deep.include(Cleartexts)
  })

  const SealerCases = [
    ...SealerMembernames.map((membername) => [TH.omitting(BoxSealerBag, membername), `a sealer missing its ${membername}`] as const),
    [{ ...BoxSealerBag, tags: { codectag: 'json_v1' } },              'a sealer whose tags lack a schematag'],
    [{ ...BoxSealerBag, purposes: { ...BaseBox.purposes, key: 7 } },  'a sealer whose key purpose is not a string'],
    [{ ...BoxSealerBag, encode: 'json' },                             'a sealer whose encode is not a function'],
    [() => 'sealed',                                                  'a function with no members'],
    ['BoxWhisper',                                                    "a sealer's name"],
    [null,                                                            'null'],
  ] as const

  for (const [sealer, blurb] of SealerCases) {
    it(`refuses ${blurb} in place of a sealer, at the seal and the unseal`, async () => {
      const { lease } = await leaseWorld()
      const sealed = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
      await TH.expectRefusal(lease.seal(sealer as never, TH.boxShellOf(), PublicProps, Cleartexts), 'bad_record')
      await TH.expectRefusal(lease.unseal(sealer as never, sealed), 'bad_record')
    })
  }

  it("refuses 'damaged_whisper' for what another bankKey sealed, and locks nothing", async () => {
    const { bank, lease } = await leaseWorld()
    const { lease: other } = await TH._cheat_grantedLease(await provingWithWayin(), TH.fakeLeaseBankOf())
    const sealed = await other.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    await TH.expectRefusal(lease.unseal(BaseBox, sealed), 'damaged_whisper')
    expect(bank.lock).not.toHaveBeenCalled()
    expect(lease.isEvicted).to.be.false
  })
})

describe("withoutSecrets(bag)", () => {
  it("drops the whisper and every field ending _sealed, keeping the rest", () => {
    const bag = { label: 'k', whisper: TH.Whisper, whisper_sealed: 'sealed', notes_sealed: 'sealed notes', notes: 'kept', sealed_at: 1 }
    expect(withoutSecrets(bag)).to.deep.equal({ label: 'k', notes: 'kept', sealed_at: 1 })
  })
})

describe("lease.evict() and isEvicted", () => {
  it("drops the keys, so that a seal or an unseal refuses 'bank_locked', and locks nothing", async () => {
    const { bank, lease } = await leaseWorld()
    const sealed = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    lease.evict()
    expect(lease.isEvicted).to.be.true
    await TH.expectRefusal(lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts), 'bank_locked')
    await TH.expectRefusal(lease.unseal(BaseBox, sealed), 'bank_locked')
    expect(bank.lock).not.toHaveBeenCalled()
  })

  it("is idempotent", async () => {
    const { lease } = await leaseWorld()
    lease.evict()
    lease.evict()
    expect(lease.isEvicted).to.be.true
  })

  it("refuses 'bank_locked' for a seal already under way when it lands", async () => {
    const { lease } = await leaseWorld()
    const sealing = lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    lease.evict()
    await TH.expectRefusal(sealing, 'bank_locked')
  })
})

/** A lease on a bank born on a device of its own, beside the bank and device. */
async function bornLeaseWorld() {
  const { bank, device, proving } = await TH.buildBornBank()
  const { lease } = await TH._cheat_grantedLease(proving, bank)
  return { bank, device, lease }
}

describe("lease.isEnabled and lease.demandEnabled(), over its bank's device", () => {
  it("is enabled while in force on an enabled device, and not once evicted", async () => {
    const { lease } = await bornLeaseWorld()
    expect(lease.isEnabled).to.be.true
    expect(lease.demandEnabled()).to.equal(lease)
    lease.evict()
    expect(lease.isEnabled).to.be.false
    TH.expectSyncRefusal(() => lease.demandEnabled(), 'bank_locked')
  })

  it("is not enabled once its device is swept, though not evicted, and throws the device's refusal before 'bank_locked'", async () => {
    const { device, lease } = await bornLeaseWorld()
    device.sweep()
    expect([lease.isEnabled, lease.isEvicted]).to.deep.equal([false, false])
    const swept = TH.expectSyncRefusal(() => lease.demandEnabled(), 'disabled')
    lease.evict()
    const sweptAndEvicted = TH.expectSyncRefusal(() => lease.demandEnabled(), 'disabled')
    expect([swept, sweptAndEvicted]).to.deep.equal([device.endCause, device.endCause])
  })

  it("refuses a seal and an unseal with the device's refusal once the device is swept", async () => {
    const { device, lease } = await bornLeaseWorld()
    const sealed = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    const shell = TH.boxShellOf()
    device.sweep()
    expect(await TH.expectRefusal(lease.seal(BaseBox, shell, PublicProps, Cleartexts), 'disabled')).to.equal(device.endCause)
    expect(await TH.expectRefusal(lease.unseal(BaseBox, sealed), 'disabled')).to.equal(device.endCause)
  })

  // As a lock refuses a seal or an unseal under way, so does a sweep.
  it("refuses a seal and an unseal already under way when the device is swept as they run", async () => {
    const { device, lease } = await bornLeaseWorld()
    const sealed = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    const sealing = TH.expectRefusal(lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts), 'disabled')
    const unsealing = TH.expectRefusal(lease.unseal(BaseBox, sealed), 'disabled')
    device.sweep()
    expect(await sealing).to.equal(device.endCause)
    expect(await unsealing).to.equal(device.endCause)
  })
})

describe("a tampered lease record", () => {
  const TamperCases = [
    [(record: LeaseRecord) => ({ ...record, proved_at: record.proved_at + 1 }),                            'its proved_at moved'],
    [(record: LeaseRecord) => ({ ...record, wayinkind: 'passkey' }),                                       'its wayinkind changed'],
    [(record: LeaseRecord) => ({ ...record, gate_revtok: TH.revtokOf('gate2') }),                         'its gate_revtok changed'],
    [(record: LeaseRecord) => ({ ...record, gate_lifeseq: Lifeseq.ofLifenum(1) }),                                 'its gate_lifeseq changed'],
    [(record: LeaseRecord) => ({ ...record, gate_labelpath: 'gate/passkeys' }),                            'its gate_labelpath changed'],
    [(record: LeaseRecord, other: LeaseRecord) => ({ ...record, lease_key: other.lease_key }),          "another lease's leaseKey"],
    [(record: LeaseRecord, other: LeaseRecord) => ({ ...record, bank_key_lease_wrapped: other.bank_key_lease_wrapped }), "another lease's wrapped bankKey"],
  ] as const

  for (const [tamper, blurb] of TamperCases) {
    it(`with ${blurb} locks its bank at its first unseal, and is evicted`, async () => {
      const { proving, bank, lease, record } = await leaseWorld()
      const sealed = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
      const { record: other } = await TH._cheat_grantedLease(proving, bank)
      const tampered = Lease.make(tamper(record, other) as LeaseRecord, { bank })
      const err = await TH.expectRefusal(tampered.unseal(BaseBox, sealed), 'damaged_lease')
      expect(TH.thrownText(err)).to.not.include(record.bank_key_lease_wrapped.ciphertext_b64)
      expect(bank.lock).toHaveBeenCalledTimes(1)
      expect(tampered.isEvicted).to.be.true
      await TH.expectRefusal(tampered.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts), 'bank_locked')
      expect(bank.lock).toHaveBeenCalledTimes(1)
    })
  }

  it("refuses at its first seal too, sealing nothing", async () => {
    const { bank, record } = await leaseWorld()
    const tampered = Lease.make({ ...record, proved_at: TH.T0 + 1 }, { bank })
    await TH.expectRefusal(tampered.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts), 'damaged_lease')
    expect(bank.lock).toHaveBeenCalledTimes(1)
  })
})

describe("what a lease shows", () => {
  it("Object.keys shows its stamp alone: no leaseKey, no wrapped bankKey, no bank", async () => {
    const { lease } = await leaseWorld()
    expect(Object.keys(lease)).to.have.members(StampFieldnames)
  })

  it("JSON.stringify, toJSON and stamp give its stamp alone", async () => {
    const { lease, record } = await leaseWorld()
    expect(TH.jsonOf(lease)).to.deep.equal(Stamped)
    expect(lease.toJSON()).to.deep.equal(Stamped)
    expect(lease.stamp).to.deep.equal(Stamped)
    expect(JSON.stringify(lease)).to.not.include(record.bank_key_lease_wrapped.ciphertext_b64)
  })

  it("is frozen: its stamp cannot be changed", async () => {
    const { lease } = await leaseWorld()
    expect(Object.isFrozen(lease)).to.be.true
    expect(() => { (lease as { proved_at: EpochMillis }).proved_at = TH.T0 + 1 }).to.throw(TypeError)
  })
})
