import { omit, pick } from 'es-toolkit'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { Crypto, Errors, GX, SX } from 'safebyok-big/internals'
import { maskUuid } from '../../src/helpers/mask-uuid'
import { BaseBox } from '../../src/models/base-box'
import { Lease, withoutSecrets } from '../../src/models/lease'
import { NOVEL, PassphraseProving } from '../../src/models/proving'
import { BaseThing, ThingFieldnames } from '../../src/models/base-thing'
import { MemoryDeviceDB } from '../../src/storage/memory-device-db'
import type { BoxCleartexts, LiveOf, Sealer, ShellOf, TombstoneOf } from '../../src/shapes/shapes-sealers'
import { type LeaseRecord, type LeaseStamp, type LeaseTombstone, LeaseFormat, leaseLifepathOf } from '../../src/shapes/shapes-stamps'
import { type EpochMillis, Lifeseq } from '../../src/shapes/primitives'
import { type BoxRecord, type Sparse, type ThingFieldname, type ThingRecord, type Tombstone, Shell, ThingChecks } from '../../src/shapes/shapes-thing'
import * as TH from '../test-helpers'

TH.useFakeClock()

const StampFieldnames = ['fmt', 'userid', 'banklabel', 'bank_lifeseq', 'bank_born_at', 'bank_lifetok', 'gate_labelpath', 'gate_lifeseq', 'gate_revtok', 'born_at', 'proved_at', 'wayinkind'] as const satisfies readonly (keyof LeaseStamp)[]

/** What a lease shows: every field of its record but its keys. */
const ShownFieldnames = [
  ...StampFieldnames, 'labelpath', 'label', 'am', 'lifeseq', 'lifepath', 'revseq', 'revtok', 'written_at', 'ends_at', 'gate_revseq',
] as const satisfies readonly (keyof LiveLeaseRecord)[]

/** A live lease record. */
type LiveLeaseRecord = LiveOf<LeaseRecord>

const Stamped = {
  fmt: LeaseFormat, userid: 'u1', banklabel: 'acme', bank_lifeseq: TH.WorldBankStamp.lifeseq, bank_born_at: TH.WorldBankStamp.born_at, bank_lifetok: TH.WorldBankStamp.lifetok,
  gate_labelpath: 'gate', gate_lifeseq: TH.WorldGate.lifeseq, gate_revtok: TH.WorldGate.revtok, born_at: TH.T0, proved_at: TH.T0, wayinkind: 'passphrase',
}

const Cleartexts = Object.freeze({ whisper: TH.Whisper })

/** The public props of a box's first seal: its sidecar. */
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

/** A passphrase proving of {@link TH.WorldGateStamp} with a wayin under a new bankKey: each lease it builds has that bankKey. */
async function provingWithWayin(): Promise<PassphraseProving> {
  const proving = await PassphraseProving.buildNovel(TH.provingDeviceOf(), TH.WorldBankStamp, TH.WorldGateStamp, TH.TestPassphrase)
  await proving.buildWayin(NOVEL)
  return proving
}

/** A lease granted to a fake gate, beside that gate, the record it was made of, and the proving that built it. */
async function leaseWorld() {
  const proving = await provingWithWayin()
  const gate = TH.fakeLeaseGateOf()
  const { lease, record } = await TH._cheat_grantedLease(proving, gate)
  return { proving, gate, lease, record }
}

describe("Lease.make(record, { gate })", () => {
  it("makes a lease of the record, showing its fields but its keys, in force", async () => {
    const { gate, record } = await leaseWorld()
    const lease = Lease.make(record, { gate })
    expect(lease).to.deep.include(Stamped)
    expect(lease).to.deep.include(omit(record, ['lease_key', 'bank_key_lease_wrapped']))
    expect(lease.isEvicted).to.be.false
    expect(lease.modelkind).to.eq('lease')
  })

  it("is handed a live record with its stamp, its Thing fields, its end and its gate's revseq, a leaseKey and the wrapped bankKey", async () => {
    const { record } = await leaseWorld()
    expect(record).to.deep.include(Stamped)
    expect(Object.keys(record)).to.have.members([...ShownFieldnames, 'lease_key', 'bank_key_lease_wrapped'])
    expect(GX.isLeaseKey(record.lease_key)).to.be.true
    expect(record.lease_key.extractable).to.be.false
  })

  it("opens what another lease of the same record sealed", async () => {
    const { gate, lease, record } = await leaseWorld()
    const sealed = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    expect(await Lease.make(record, { gate }).unseal(BaseBox, sealed)).to.deep.include(Cleartexts)
  })

  const MalformedCases = [
    [(record: LeaseRecord) => ({ ...record, fmt: 'a010502' }),                                        'of another fmt'],
    [(record: LeaseRecord) => ({ ...record, fmt: 7102 }),                                             'whose fmt is a number'],
    [(record: LeaseRecord) => ({ ...record, bank_key_lease_wrapped: undefined }),                     'with no wrapped bankKey'],
    [(record: LeaseRecord) => ({ ...record, proved_at: undefined }),                                  'with no proved_at'],
    [(record: LeaseRecord) => ({ ...record, wayinkind: 'carrier_pigeon' }),                           'of an unknown wayinkind'],
    [(record: LeaseRecord) => ({ ...record, extra: 'field' }),                                        'with a field no lease has'],
    [({ gate_labelpath, ...record }: LiveLeaseRecord) => ({ ...record, gatelabelpath: gate_labelpath }),  'with its gate labelpath at gatelabelpath'],
    [(record: LeaseRecord) => ({ ...record, gate_labelpath: 'gate/passkeys' }),                       "whose labelpath is not its gate's"],
    [(record: LeaseRecord) => ({ ...record, ends_at: undefined }),                                    'with no ends_at'],
    [() => TH.leaseTombstoneOf(),                                                                        'that is a tombstone'],
    [() => 'a lease',                                                                                    'that is not a record at all'],
  ] as const

  for (const [tamper, blurb] of MalformedCases) {
    it(`refuses a record ${blurb}, quoting none of it`, async () => {
      const { gate, record } = await leaseWorld()
      const err = TH.expectSyncRefusal(() => Lease.make(tamper(record) as never, { gate }), 'bad_record')
      expect(TH.thrownText(err)).to.not.include(record.bank_key_lease_wrapped.ciphertext_b64)
    })
  }

  it("refuses a record whose leaseKey is an extractable key", async () => {
    const { gate, record } = await leaseWorld()
    const bankKey = await Crypto.makeBankKey()
    TH.expectSyncRefusal(() => Lease.make({ ...record, lease_key: bankKey }, { gate }), 'bad_record')
  })

  const OtherBankCases = [
    [{ lifeseq: Lifeseq.ofLifenum(2) },   'another life of the bank, by its lifeseq'],
    [{ born_at: TH.T0 + 1 },         'another life of the bank, by its born_at'],
    [{ lifetok: TH.revtokOf('life2') }, 'another birth of the bank, by its lifetok'],
    [{ userid: 'u2' },               "another user's bank"],
    [{ banklabel: 'work' },          'another bank of the same user'],
  ] as const

  for (const [stamp, blurb] of OtherBankCases) {
    it(`refuses a gate of ${blurb}`, async () => {
      const { record } = await leaseWorld()
      TH.expectSyncRefusal(() => Lease.make(record, { gate: TH.fakeLeaseGateOf(stamp) }), 'damaged_lease')
    })
  }

  it("refuses a gate with no lock, one with no bank stamp, one with no enabled check, and no opts at all", async () => {
    const { record } = await leaseWorld()
    const { isEnabled: _isEnabled, demandEnabled: _demandEnabled, ...unchecked } = TH.fakeLeaseGateOf()
    TH.expectSyncRefusal(() => Lease.make(record, { gate: { ...TH.fakeLeaseGateOf(), lock: undefined } } as never), 'bad_record')
    TH.expectSyncRefusal(() => Lease.make(record, { gate: { ...TH.fakeLeaseGateOf(), bankStamp: undefined } } as never), 'bad_record')
    TH.expectSyncRefusal(() => Lease.make(record, { gate: unchecked } as never), 'bad_record')
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

  it("answers a checked copy of the record: a field beside the record refuses", async () => {
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

  it("writes the box at the written_at given, and seals it: a box whose written_at moved will not unseal", async () => {
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

  it("writes a tombstone at the written_at given, and seals it: a tombstone whose written_at moved will not unseal", async () => {
    const { lease } = await leaseWorld()
    const live = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    const tombstone = await lease.seal(BaseBox, live, { am: 'x', written_at: TH.T0 + 7 })
    expect(tombstone).to.include({ am: 'x', written_at: TH.T0 + 7 })
    expect(await lease.unseal(BaseBox, tombstone)).to.deep.include({ whisper: {} })
    await TH.expectRefusal(lease.unseal(BaseBox, { ...tombstone, written_at: TH.T0 + 8 }), 'damaged_whisper')
  })

  it("refuses a BaseBox tombstone given a sidecar other than `{}`", async () => {
    const { lease } = await leaseWorld()
    const live = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    await TH.expectRefusal(lease.seal(BaseBox, live, { am: 'x', sidecar: TH.Sidecar }), 'bad_record')
  })

  it("writes a BaseBox tombstone given the sidecar `{}`, a tombstone's own", async () => {
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

  it("binds the bank's stamp first, its fields alone: a field beside them on the gate's bankStamp binds nothing", async () => {
    const proving = await provingWithWayin()
    const { lease: plain } = await TH._cheat_grantedLease(proving, TH.fakeLeaseGateOf())
    const padded = TH.fakeLeaseGateOf()
    const { lease } = await TH._cheat_grantedLease(proving, { ...padded, bankStamp: { ...padded.bankStamp, lifepath: 'not-a-stamp-field' } } as never)
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

  it("accepts any value with a sealer's members, as well as the class", async () => {
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
    const { gate, lease } = await leaseWorld()
    const { lease: other } = await TH._cheat_grantedLease(await provingWithWayin(), TH.fakeLeaseGateOf())
    const sealed = await other.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    await TH.expectRefusal(lease.unseal(BaseBox, sealed), 'damaged_whisper')
    expect(gate.lock).not.toHaveBeenCalled()
    expect(lease.isEvicted).to.be.false
  })
})

describe("withoutSecrets(bag)", () => {
  it("drops the whisper and every field ending _sealed, leaving the rest", () => {
    const bag = { label: 'k', whisper: TH.Whisper, whisper_sealed: 'sealed', notes_sealed: 'sealed notes', notes: 'kept', sealed_at: 1 }
    expect(withoutSecrets(bag)).to.deep.equal({ label: 'k', notes: 'kept', sealed_at: 1 })
  })
})

describe("lease.evict() and isEvicted", () => {
  it("drops the keys, so that a seal or an unseal refuses 'bank_locked', and locks nothing", async () => {
    const { gate, lease } = await leaseWorld()
    const sealed = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    lease.evict()
    expect(lease.isEvicted).to.be.true
    await TH.expectRefusal(lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts), 'bank_locked')
    await TH.expectRefusal(lease.unseal(BaseBox, sealed), 'bank_locked')
    expect(gate.lock).not.toHaveBeenCalled()
  })

  it("is idempotent", async () => {
    const { lease } = await leaseWorld()
    lease.evict()
    lease.evict()
    expect(lease.isEvicted).to.be.true
  })

  it("lets a seal already under way when it lands finish, and refuses an unseal under way 'bank_locked'", async () => {
    const { lease } = await leaseWorld()
    const sealed = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    const sealing = lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    const unsealing = TH.expectRefusal(lease.unseal(BaseBox, sealed), 'bank_locked')
    lease.evict()
    const { whisper_sealed } = await sealing
    expect(whisper_sealed).to.have.all.keys('key_wrapped', 'ciphered', 'codectag', 'schematag')
    await unsealing
  })
})

/** A lease granted to the gate of a bank born on a device of its own, beside the bank and device. The gate's world hands its lease its device's `leaseMillis`. */
async function bornLeaseWorld() {
  const { bank, device, proving } = await TH.buildBornBank()
  const { gate } = bank
  const leaseGate = { bankStamp: gate.bankStamp, leaseMillis: device.leaseMillis, lock: () => { gate.lock() }, get isEnabled() { return gate.isEnabled }, demandEnabled: () => { gate.demandEnabled() } }
  const { lease } = await TH._cheat_grantedLease(proving, leaseGate)
  return { bank, device, lease }
}

/** A fake gate that ends at `end()`: from then on it is not enabled, and its `demandEnabled` throws `endCause`. Nothing in the core ends a gate yet. */
function endableGateOf() {
  const endCause = new Errors.VaultError('disabled', "The device ended.")
  let isEnded = false
  const gate = {
    ...TH.fakeLeaseGateOf(),
    get isEnabled() { return ! isEnded },
    demandEnabled: () => { if (isEnded) { throw endCause } return gate },
    end:           () => { isEnded = true },
  }
  return { gate, endCause }
}

describe("lease.isEnabled and lease.demandEnabled(), over its gate", () => {
  it("is enabled while in force on an enabled gate, and not once evicted", async () => {
    const { lease } = await bornLeaseWorld()
    expect(lease.isEnabled).to.be.true
    expect(lease.demandEnabled()).to.equal(lease)
    lease.evict()
    expect(lease.isEnabled).to.be.false
    TH.expectSyncRefusal(() => lease.demandEnabled(), 'bank_locked')
  })

  it("is not enabled once its gate ends, though not evicted, and throws the gate's refusal before 'bank_locked'", async () => {
    const { gate, endCause } = endableGateOf()
    const { lease } = await TH._cheat_grantedLease(await provingWithWayin(), gate)
    gate.end()
    expect([lease.isEnabled, lease.isEvicted]).to.deep.equal([false, false])
    const ended = TH.expectSyncRefusal(() => lease.demandEnabled(), 'disabled')
    lease.evict()
    const endedAndEvicted = TH.expectSyncRefusal(() => lease.demandEnabled(), 'disabled')
    expect([ended, endedAndEvicted]).to.deep.equal([endCause, endCause])
  })

  it("refuses a seal and an unseal with the gate's refusal once its gate ends", async () => {
    const { gate, endCause } = endableGateOf()
    const { lease } = await TH._cheat_grantedLease(await provingWithWayin(), gate)
    const sealed = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    const shell = TH.boxShellOf()
    gate.end()
    expect(await TH.expectRefusal(lease.seal(BaseBox, shell, PublicProps, Cleartexts), 'disabled')).to.equal(endCause)
    expect(await TH.expectRefusal(lease.unseal(BaseBox, sealed), 'disabled')).to.equal(endCause)
  })

  // As with a lock, a seal under way finishes and an unseal under way refuses.
  it("lets a seal already under way when its gate ends finish, and refuses an unseal under way with the gate's refusal", async () => {
    const { gate, endCause } = endableGateOf()
    const { lease } = await TH._cheat_grantedLease(await provingWithWayin(), gate)
    const sealed = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    const sealing = lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    const unsealing = TH.expectRefusal(lease.unseal(BaseBox, sealed), 'disabled')
    gate.end()
    const { whisper_sealed } = await sealing
    expect(whisper_sealed).to.have.all.keys('key_wrapped', 'ciphered', 'codectag', 'schematag')
    expect(await unsealing).to.equal(endCause)
  })
})

describe("a tampered lease record", () => {
  const TamperCases = [
    [(record: LiveLeaseRecord) => ({ ...record, proved_at: record.proved_at + 1 }),                        'its proved_at moved'],
    [(record: LiveLeaseRecord) => ({ ...record, born_at: record.born_at - 1 }),                            'its born_at moved'],
    [(record: LiveLeaseRecord) => ({ ...record, wayinkind: 'passkey' }),                                   'its wayinkind changed'],
    [(record: LiveLeaseRecord) => ({ ...record, gate_revtok: TH.revtokOf('gate2') }),                      'its gate_revtok changed'],
    [(record: LiveLeaseRecord) => ({ ...record, gate_lifeseq: Lifeseq.ofLifenum(1) }),                     'its gate_lifeseq changed'],
    [(record: LiveLeaseRecord) => ({ ...record, gate_labelpath: 'gate/passkeys', labelpath: 'lease/passkeys', label: 'passkeys' }), 'its gate_labelpath changed'],
    [(record: LiveLeaseRecord, other: LiveLeaseRecord) => ({ ...record, lease_key: other.lease_key }),     "another lease's leaseKey"],
    [(record: LiveLeaseRecord, other: LiveLeaseRecord) => ({ ...record, bank_key_lease_wrapped: other.bank_key_lease_wrapped }), "another lease's wrapped bankKey"],
  ] as const

  for (const [tamper, blurb] of TamperCases) {
    it(`with ${blurb} locks its gate at its first unseal, and is evicted`, async () => {
      const { proving, gate, lease, record } = await leaseWorld()
      const sealed = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
      const { record: other } = await TH._cheat_grantedLease(proving, gate)
      const tampered = Lease.make(tamper(record, other) as LiveLeaseRecord, { gate })
      const err = await TH.expectRefusal(tampered.unseal(BaseBox, sealed), 'damaged_lease')
      expect(TH.thrownText(err)).to.not.include(record.bank_key_lease_wrapped.ciphertext_b64)
      expect(gate.lock).toHaveBeenCalledTimes(1)
      expect(tampered.isEvicted).to.be.true
      await TH.expectRefusal(tampered.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts), 'bank_locked')
      expect(gate.lock).toHaveBeenCalledTimes(1)
    })
  }

  it("refuses at its first seal too, sealing nothing", async () => {
    const { gate, record } = await leaseWorld()
    const tampered = Lease.make({ ...record, proved_at: TH.T0 + 1 }, { gate })
    await TH.expectRefusal(tampered.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts), 'damaged_lease')
    expect(gate.lock).toHaveBeenCalledTimes(1)
  })
})

describe("a lease's Thing fields", () => {
  it("are its record's: its labelpath and label, its life and revision, and am 'a'", async () => {
    const { gate, record } = await leaseWorld()
    const revised = { ...record, revseq: 3, revtok: TH.revtokOf('lease3'), written_at: TH.T0 + 5, lifeseq: Lifeseq.ofLifenum(2), lifepath: leaseLifepathOf(Lifeseq.ofLifenum(2)) }
    const lease = Lease.make(revised, { gate })
    expect(pick(lease, ['labelpath', 'label', 'am', 'lifeseq', 'lifepath', 'revseq', 'revtok', 'born_at', 'written_at'])).to.deep.equal({
      labelpath: 'lease/gate', label: 'gate', am: 'a', lifeseq: Lifeseq.ofLifenum(2), lifepath: leaseLifepathOf(Lifeseq.ofLifenum(2)), revseq: 3, revtok: TH.revtokOf('lease3'), born_at: TH.T0, written_at: TH.T0 + 5,
    })
    expect(lease.scope).to.deep.equal({ userid: 'u1', banklabel: 'acme', labelpath: 'lease/gate' })
  })

  it("give a scope that a check of a Thing's scope refuses", async () => {
    const { lease } = await leaseWorld()
    expect(ThingChecks.thingScope.safeParse(lease.scope).success).to.be.false
  })

  it("stay out of its keys and its stamp", async () => {
    const { lease } = await leaseWorld()
    expect(Object.keys(lease)).to.have.members(ShownFieldnames)
    expect(Object.keys(lease.stamp)).to.have.members(StampFieldnames)
  })
})

describe("Lease.shellOf(gateScope)", () => {
  const GateLabelpathCases = [
    ["gate",          "gate",      "lease/gate",      'the main gate'],
    ["gate/passkeys", "passkeys",  "lease/passkeys",  'a gate with a label'],
  ] as const

  for (const [labelpath, label, leaseLabelpath, blurb] of GateLabelpathCases) {
    it(`is the void record at its gate's label, for ${blurb}`, () => {
      expect(Lease.shellOf({ ...TH.WorldScope, labelpath })).to.deep.equal({
        fmt: LeaseFormat, ...TH.WorldScope, labelpath: leaseLabelpath, label, am: 'x', lifeseq: Shell.VoidLifeseq, lifepath: leaseLifepathOf(Shell.VoidLifeseq),
        revseq: SX.VoidRevisionSeq, revtok: SX.VoidRevisionTok, born_at: SX.VoidTime, written_at: SX.VoidTime,
      })
    })
  }

  it("refuses a scope that is not a gate's", () => {
    TH.expectSyncRefusal(() => Lease.shellOf({ ...TH.WorldScope, labelpath: 'box' }), 'bad_record')
    TH.expectSyncRefusal(() => Lease.shellOf({ ...TH.WorldScope } as never), 'bad_record')
  })
})

describe("Lease.nextRevisionOf(followed, written_at)", () => {
  it("is born in the first life after the shell", () => {
    expect(Lease.nextRevisionOf(TH.leaseShellOf(), TH.T0 + 5)).to.deep.include({
      labelpath: 'lease/gate', am: 'a', lifeseq: Lifeseq.ofLifenum(0), lifepath: leaseLifepathOf(Lifeseq.ofLifenum(0)), revseq: 0, born_at: TH.T0 + 5, written_at: TH.T0 + 5,
    })
  })

  it("is born in the next even life after a tombstone", () => {
    expect(Lease.nextRevisionOf(TH.leaseTombstoneOf({ lifenum: 3, revseq: 2 }), TH.T0 + 5)).to.deep.include({ am: 'a', lifeseq: Lifeseq.ofLifenum(4), revseq: 3, born_at: TH.T0 + 5 })
  })

  it("is a live lease's next revision in the same life, keeping its born_at, with a fresh revtok", async () => {
    const live = await TH.liveLeaseRecordOf({ lifenum: 2, revseq: 4 })
    const revision = Lease.nextRevisionOf(live, TH.T0 + 5)
    expect(revision).to.deep.include({ am: 'a', lifeseq: Lifeseq.ofLifenum(2), revseq: 5, born_at: TH.T0, written_at: TH.T0 + 5 })
    expect(revision.revtok).to.not.eq(live.revtok)
  })

  it("answers its Thing fields alone, and is written now unless told", async () => {
    const revision = Lease.nextRevisionOf(await TH.liveLeaseRecordOf())
    expect(Object.keys(revision)).to.have.members([...ThingFieldnames])
    expect(revision.written_at).to.eq(TH.T0)
  })

  it("follows a Lease as it follows its record", async () => {
    const { lease, record } = await leaseWorld()
    expect(omit(Lease.nextRevisionOf(lease, TH.T0 + 5), ['revtok'])).to.deep.equal(omit(Lease.nextRevisionOf(record, TH.T0 + 5), ['revtok']))
  })

  it("refuses to follow a Thing that is not a lease, or a lease whose lifepath lacks its placeholder", async () => {
    TH.expectSyncRefusal(() => Lease.nextRevisionOf(TH.boxShellOf() as never), 'bad_record')
    const live = await TH.liveLeaseRecordOf()
    TH.expectSyncRefusal(() => Lease.nextRevisionOf({ ...live, lifepath: live.lifeseq }), 'bad_record')
  })
})

describe("Lease.makeNextRecord(live, { ends_at })", () => {
  it("is the next revision with its stamp and keys, ending when told", async () => {
    const live = await TH.liveLeaseRecordOf({ revseq: 2 })
    vi.setSystemTime(TH.T0 + 5)
    const next = Lease.makeNextRecord(live, { ends_at: TH.T0 + 60_000 })
    expect(next).to.deep.include({ ...omit(live, ['revtok', 'revseq', 'written_at', 'ends_at']), revseq: 3, written_at: TH.T0 + 5, ends_at: TH.T0 + 60_000 })
    expect(next.lease_key).to.equal(live.lease_key)
  })

  // A softlock lowers the end of the lease every tab follows, and no proof is at hand to wrap its bankKey again.
  it("still unseals what the lease it revises sealed: the wrap of its bankKey binds no life, revision or end", async () => {
    const { gate, lease, record } = await leaseWorld()
    const sealed = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    vi.setSystemTime(TH.T0 + 5)
    const softlocked = Lease.make(Lease.makeNextRecord(record, { ends_at: TH.T0 + 10 }), { gate })
    expect(softlocked).to.include({ revseq: record.revseq + 1, ends_at: TH.T0 + 10 })
    expect(await softlocked.unseal(BaseBox, sealed)).to.deep.include(Cleartexts)
    const resealed = await softlocked.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    expect(await lease.unseal(BaseBox, resealed)).to.deep.include(Cleartexts)
  })

  it("refuses a tombstone, and an ends_at that is no time", async () => {
    const live = await TH.liveLeaseRecordOf()
    TH.expectSyncRefusal(() => Lease.makeNextRecord(TH.leaseTombstoneOf() as never, { ends_at: TH.T0 }), 'bad_record')
    TH.expectSyncRefusal(() => Lease.makeNextRecord(live, { ends_at: 'soon' } as never), 'bad_record')
  })
})

describe("lease.nextEndingAt(ends_at)", () => {
  it("is a new Lease at the next revision, ending when told, that unseals what this one sealed", async () => {
    const { lease } = await leaseWorld()
    const sealed = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    vi.setSystemTime(TH.T0 + 5)
    const softlocked = lease.nextEndingAt(TH.T0 + 10)
    expect(softlocked).to.not.equal(lease)
    expect(softlocked).to.include({ revseq: lease.revseq + 1, written_at: TH.T0 + 5, ends_at: TH.T0 + 10, born_at: lease.born_at })
    expect(await softlocked.unseal(BaseBox, sealed)).to.deep.include(Cleartexts)
  })

  it("refuses once this lease is evicted, and an ends_at that is no time", async () => {
    const { lease } = await leaseWorld()
    TH.expectSyncRefusal(() => lease.nextEndingAt('soon' as never), 'bad_record')
    lease.evict()
    TH.expectSyncRefusal(() => lease.nextEndingAt(TH.T0 + 10), 'bank_locked')
  })
})

describe("lease.stow(deviceDB)", () => {
  it("stows its record, its keys with it, so that a Lease made of the record peeked unseals what it sealed", async () => {
    const { gate, lease } = await leaseWorld()
    const deviceDB = new MemoryDeviceDB()
    const sealed = await lease.seal(BaseBox, TH.boxShellOf(), PublicProps, Cleartexts)
    await lease.stow(deviceDB)
    const stored = await deviceDB.peekLease(TH.WorldLeaseScope)
    expect(stored).to.deep.include(pick(lease, ShownFieldnames))
    const reloaded = Lease.make(stored as LiveLeaseRecord, { gate })
    expect(await reloaded.unseal(BaseBox, sealed)).to.deep.include(Cleartexts)
  })

  it("leaves a newer record stored in place", async () => {
    const { lease } = await leaseWorld()
    const deviceDB = new MemoryDeviceDB()
    const tombstone = Lease.tombstoneOf(lease)
    await deviceDB.stowLease(tombstone)
    await lease.stow(deviceDB)
    expect(await deviceDB.peekLease(TH.WorldLeaseScope)).to.deep.equal(tombstone)
  })

  it("refuses once this lease is evicted, stowing nothing, and a deviceDB that is not one", async () => {
    const { lease } = await leaseWorld()
    const deviceDB = new MemoryDeviceDB()
    await TH.expectRefusal(lease.stow({ peekLease: vi.fn() } as never), 'bad_record')
    lease.evict()
    await TH.expectRefusal(lease.stow(deviceDB), 'bank_locked')
    expect(await deviceDB.peekLease(TH.WorldLeaseScope)).to.be.null
  })
})

describe("Lease.tombstoneOf(live, written_at)", () => {
  it("is the next odd life at the next revision, with its Thing fields alone and no keys", async () => {
    const live = await TH.liveLeaseRecordOf({ lifenum: 2, revseq: 4 })
    const tombstone = Lease.tombstoneOf(live, TH.T0 + 5)
    expect(tombstone).to.deep.include({ ...TH.WorldScope, labelpath: 'lease/gate', label: 'gate', am: 'x', lifeseq: Lifeseq.ofLifenum(3), lifepath: leaseLifepathOf(Lifeseq.ofLifenum(3)), revseq: 5, born_at: TH.T0, written_at: TH.T0 + 5 })
    expect(Object.keys(tombstone)).to.have.members([...ThingFieldnames])
    expect(BaseThing.cmp(live, tombstone)).to.be.greaterThan(0)
  })

  it("is made from a Lease as from its record, and written now unless told", async () => {
    const { lease } = await leaseWorld()
    expect(Lease.tombstoneOf(lease)).to.deep.include({ am: 'x', lifeseq: Lifeseq.ofLifenum(1), written_at: TH.T0 })
  })

  it("refuses a tombstone and the shell", () => {
    TH.expectSyncRefusal(() => Lease.tombstoneOf(TH.leaseTombstoneOf() as never), 'bad_record')
    TH.expectSyncRefusal(() => Lease.tombstoneOf(TH.leaseShellOf() as never), 'bad_record')
  })
})

describe("a lease record, as a Thing's types read it", () => {
  it("has a live form, a tombstone and a shell, and Tombstone of a Lease or a record is its tombstone", () => {
    expectTypeOf<LeaseTombstone>().toEqualTypeOf<TombstoneOf<LeaseRecord>>()
    expectTypeOf<Tombstone<LeaseRecord>>().toEqualTypeOf<LeaseTombstone>()
    expectTypeOf<Tombstone<Lease | LeaseRecord>>().toEqualTypeOf<LeaseTombstone>()
    expectTypeOf<LiveOf<LeaseRecord>['am']>().toEqualTypeOf<'a'>()
    expectTypeOf<keyof Sparse<LeaseRecord>>().toEqualTypeOf<ThingFieldname>()
    expectTypeOf<ShellOf<LeaseRecord>['revseq']>().toEqualTypeOf<-1>()
    expectTypeOf<Lease>().toExtend<Sparse<ThingRecord>>()
    expectTypeOf<LeaseRecord>().toExtend<Sparse<ThingRecord>>()
  })

  it("orders by BaseThing.cmp: by life, then revision", async () => {
    const live      = await TH.liveLeaseRecordOf({ lifenum: 0, revseq: 3 })
    const renewed   = await TH.liveLeaseRecordOf({ lifenum: 0, revseq: 4 })
    const tombstone = TH.leaseTombstoneOf({ lifenum: 1, revseq: 0 })
    expect([BaseThing.cmp(live, renewed), BaseThing.cmp(renewed, tombstone), BaseThing.cmp(TH.leaseShellOf(), live)].every((order) => order > 0)).to.be.true
  })
})

describe("what a lease shows", () => {
  it("Object.keys shows its record's fields: no leaseKey, no wrapped bankKey, no gate", async () => {
    const { lease } = await leaseWorld()
    expect(Object.keys(lease)).to.have.members(ShownFieldnames)
  })

  it("stamp gives its stamp alone", async () => {
    const { lease } = await leaseWorld()
    expect(lease.stamp).to.deep.equal(Stamped)
  })

  it("JSON.stringify and toJSON give its loggable", async () => {
    const { lease, record } = await leaseWorld()
    expect(TH.jsonOf(lease)).to.deep.equal(lease.loggable)
    expect(lease.toJSON()).to.deep.equal(lease.loggable)
    expect(JSON.stringify(lease)).to.not.include(record.bank_key_lease_wrapped.ciphertext_b64)
  })

  it("spreads to its record's fields but its keys, each a string or a number: nothing secret and nothing opaque", async () => {
    const { lease } = await leaseWorld()
    // The spread is this test's subject: what a log line or a host's `{ ...thing }` sees of a lease.
    const spread = { ...lease } // eslint-disable-line @typescript-eslint/no-misused-spread
    expect(Object.keys(spread)).to.have.members(ShownFieldnames)
    expect(Object.values(spread).every((val) => ['string', 'number'].includes(typeof val))).to.be.true
  })

  it("gives a log its loggable, a frozen object of strings, numbers and a boolean, with nothing secret and nothing opaque", async () => {
    const { lease, record } = await leaseWorld()
    expect(lease.loggable).to.deep.equal({
      fmt: LeaseFormat, userid: 'u1', banklabel: 'acme', labelpath: 'lease/gate', wayinkind: 'passphrase', born_at: TH.T0, proved_at: TH.T0,
      gate_labelpath: 'gate', gate_lifeseq: TH.WorldGate.lifeseq, gate_revtok: maskUuid(TH.WorldGate.revtok),
      bank_lifeseq: TH.WorldBankStamp.lifeseq, bank_born_at: TH.WorldBankStamp.born_at, bank_lifetok: maskUuid(TH.WorldBankStamp.lifetok), isEvicted: false,
    })
    expect(JSON.stringify(lease.loggable)).to.not.include(TH.WorldGate.revtok).and.to.not.include(TH.WorldBankStamp.lifetok)
    expect(Object.isFrozen(lease.loggable)).to.be.true
    expect(Object.values(lease.loggable).every((val) => ['string', 'number', 'boolean'].includes(typeof val))).to.be.true
    expect(JSON.stringify(lease.loggable)).to.not.include(record.bank_key_lease_wrapped.ciphertext_b64)
    lease.evict()
    expect(lease.loggable.isEvicted).to.be.true
  })

  it("is frozen: its fields cannot be changed", async () => {
    const { lease } = await leaseWorld()
    expect(Object.isFrozen(lease)).to.be.true
    expect(() => { (lease as { proved_at: EpochMillis }).proved_at = TH.T0 + 1 }).to.throw(TypeError)
  })
})
