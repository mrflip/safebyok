import { describe, expect, it, vi } from 'vitest'
import { Crypto, GX } from 'safebyok-big/internals'
import { Lease } from '../../src/models/lease'
import { NOVEL, PassphraseProving } from '../../src/models/proving'
import { BoxWhisper } from '../../src/models/sealers'
import { LeaseFormat, type LeaseRecord } from '../../src/models/stamps'
import { lifeseqOf } from '../../src/storage/shapes-thing'
import * as TH from '../test-helpers'

TH.useFakeClock()

const StampFieldnames = ['fmt', 'userid', 'banklabel', 'lifeseq', 'born_at', 'gatelabel', 'gate_tok', 'gate_revision_tok', 'proved_at', 'wayinkind']

const Stamped = { ...TH.WorldBankStamp, fmt: LeaseFormat, gatelabel: 'main', gate_tok: TH.WorldGate.gate_tok, gate_revision_tok: TH.WorldGate.revision_tok, proved_at: TH.T0, wayinkind: 'passphrase' }

const Cleartexts = Object.freeze({ whisper: TH.Whisper })

/** A passphrase proving of {@link TH.WorldGateStamp} with a wayin under a new bankKey: each lease it builds holds that bankKey. */
async function provingWithWayin(): Promise<PassphraseProving> {
  const proving = await PassphraseProving.buildNovel(TH.WorldBankStamp, TH.WorldGateStamp, TH.TestPassphrase, TH.provingDeviceOf())
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
    const sealed = await lease.seal('BoxWhisper', TH.boxShellOf(), Cleartexts)
    expect(await Lease.make(record, { bank }).unseal('BoxWhisper', sealed)).to.deep.equal(Cleartexts)
  })

  const MalformedCases = [
    [(record: LeaseRecord) => ({ ...record, fmt: 7000 }),                                             'of another fmt'],
    [(record: LeaseRecord) => ({ ...record, bank_key_lease_wrapped: undefined }),                     'with no wrapped bankKey'],
    [(record: LeaseRecord) => ({ ...record, proved_at: undefined }),                                  'with no proved_at'],
    [(record: LeaseRecord) => ({ ...record, wayinkind: 'carrier_pigeon' }),                           'of an unknown wayinkind'],
    [(record: LeaseRecord) => ({ ...record, extra: 'field' }),                                        'with a field no lease has'],
    [() => 'a lease',                                                                                    'that is not a record at all'],
  ] as const

  for (const [tamper, blurb] of MalformedCases) {
    it(`refuses a record ${blurb}, quoting none of it`, async () => {
      const { bank, record } = await leaseWorld()
      const err = TH.expectSyncRefusal(() => Lease.make(tamper(record) as never, { bank }), 'bad_option')
      expect(TH.thrownText(err)).to.not.include(record.bank_key_lease_wrapped.ciphertext_b64)
    })
  }

  it("refuses a record whose leaseKey is an extractable key", async () => {
    const { bank, record } = await leaseWorld()
    const bankKey = await Crypto.makeBankKey()
    TH.expectSyncRefusal(() => Lease.make({ ...record, lease_key: bankKey }, { bank }), 'bad_option')
  })

  const OtherBankCases = [
    [{ lifeseq: lifeseqOf(2) },   'another life of the bank, by its lifeseq'],
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

  it("refuses a bank with no lock, one with no stamp, and no opts at all", async () => {
    const { record } = await leaseWorld()
    TH.expectSyncRefusal(() => Lease.make(record, { bank: { stamp: TH.WorldBankStamp } } as never), 'bad_option')
    TH.expectSyncRefusal(() => Lease.make(record, { bank: { lock: vi.fn() } } as never), 'bad_option')
    TH.expectSyncRefusal(() => Lease.make(record, undefined as never), 'bad_option')
  })
})

describe("lease.seal(sealerkind, prior, cleartexts) and lease.unseal(sealerkind, record)", () => {
  it("round-trips a box's whisper, its sealed part carrying the sealer's tags", async () => {
    const { lease } = await leaseWorld()
    const sealed = await lease.seal('BoxWhisper', TH.boxShellOf(), Cleartexts)
    expect(sealed.whisper_sealed).to.include(BoxWhisper.tags)
    expect(sealed.whisper_sealed).to.have.all.keys('key_wrapped', 'ciphered', 'codectag', 'schematag')
    expect(await lease.unseal('BoxWhisper', sealed)).to.deep.equal(Cleartexts)
  })

  it("round-trips a tombstone's empty whisper", async () => {
    const { lease } = await leaseWorld()
    const live = await lease.seal('BoxWhisper', TH.boxShellOf(), Cleartexts)
    const tombstone = await lease.seal('BoxTombstone', live, { whisper: {} })
    expect(tombstone).to.include({ am: 'x', revseq: live.revseq + 1 })
    expect(await lease.unseal('BoxTombstone', tombstone)).to.deep.equal({ whisper: {} })
  })

  it("zeroes the whisper's bytes once each has sealed or opened them", async () => {
    const { lease } = await leaseWorld()
    const text = BoxWhisper.encode(Cleartexts)
    const encode = vi.spyOn(TextEncoder.prototype, 'encode')
    const decode = vi.spyOn(TextDecoder.prototype, 'decode')
    const sealed = await lease.seal('BoxWhisper', TH.boxShellOf(), Cleartexts)
    expect(await lease.unseal('BoxWhisper', sealed)).to.deep.equal(Cleartexts)
    const sealedBytes = encode.mock.results[encode.mock.calls.findIndex(([encoded]) => encoded === text)]?.value as Uint8Array
    const openedBytes = decode.mock.calls[decode.mock.results.findIndex((decoded) => decoded.value === text)]?.[0] as Uint8Array
    encode.mockRestore()
    decode.mockRestore()
    expect(sealedBytes.length).to.eq(text.length)
    expect(openedBytes.length).to.eq(text.length)
    expect(TH.isZeroed(sealedBytes)).to.be.true
    expect(TH.isZeroed(openedBytes)).to.be.true
  })

  const SealerkindCases = [
    [BoxWhisper,         'a sealer'],
    [null,               'null'],
    ['sealerkindVals',   "another of the module's exports"],
    ['boxwhisper',       'a kind in the wrong case'],
    ['toString',         "a name every object has"],
  ] as const

  for (const [sealerkind, blurb] of SealerkindCases) {
    it(`refuses ${blurb} in place of a sealerkind, at the seal and the unseal`, async () => {
      const { lease } = await leaseWorld()
      const sealed = await lease.seal('BoxWhisper', TH.boxShellOf(), Cleartexts)
      await TH.expectRefusal(lease.seal(sealerkind as never, TH.boxShellOf(), Cleartexts), 'bad_option')
      await TH.expectRefusal(lease.unseal(sealerkind as never, sealed), 'bad_option')
    })
  }

  it("refuses 'damaged_whisper' for what another bankKey sealed, and locks nothing", async () => {
    const { bank, lease } = await leaseWorld()
    const { lease: other } = await TH._cheat_grantedLease(await provingWithWayin(), TH.fakeLeaseBankOf())
    const sealed = await other.seal('BoxWhisper', TH.boxShellOf(), Cleartexts)
    await TH.expectRefusal(lease.unseal('BoxWhisper', sealed), 'damaged_whisper')
    expect(bank.lock).not.toHaveBeenCalled()
    expect(lease.isEvicted).to.be.false
  })
})

describe("lease.evict() and isEvicted", () => {
  it("drops the keys, so that a seal or an unseal refuses 'bank_locked', and locks nothing", async () => {
    const { bank, lease } = await leaseWorld()
    const sealed = await lease.seal('BoxWhisper', TH.boxShellOf(), Cleartexts)
    lease.evict()
    expect(lease.isEvicted).to.be.true
    await TH.expectRefusal(lease.seal('BoxWhisper', TH.boxShellOf(), Cleartexts), 'bank_locked')
    await TH.expectRefusal(lease.unseal('BoxWhisper', sealed), 'bank_locked')
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
    const sealing = lease.seal('BoxWhisper', TH.boxShellOf(), Cleartexts)
    lease.evict()
    await TH.expectRefusal(sealing, 'bank_locked')
  })
})

describe("a tampered lease record", () => {
  const TamperCases = [
    [(record: LeaseRecord) => ({ ...record, proved_at: record.proved_at + 1 }),                            'its proved_at moved'],
    [(record: LeaseRecord) => ({ ...record, wayinkind: 'passkey' }),                                       'its wayinkind changed'],
    [(record: LeaseRecord) => ({ ...record, gate_revision_tok: 'gate-revision-tok-2' }),                   'its gate_revision_tok changed'],
    [(record: LeaseRecord) => ({ ...record, gate_tok: 'gate-tok-reborn' }),                                'its gate_tok changed'],
    [(record: LeaseRecord, other: LeaseRecord) => ({ ...record, lease_key: other.lease_key }),          "another lease's leaseKey"],
    [(record: LeaseRecord, other: LeaseRecord) => ({ ...record, bank_key_lease_wrapped: other.bank_key_lease_wrapped }), "another lease's wrapped bankKey"],
  ] as const

  for (const [tamper, blurb] of TamperCases) {
    it(`with ${blurb} locks its bank at its first unseal, and is evicted`, async () => {
      const { proving, bank, lease, record } = await leaseWorld()
      const sealed = await lease.seal('BoxWhisper', TH.boxShellOf(), Cleartexts)
      const { record: other } = await TH._cheat_grantedLease(proving, bank)
      const tampered = Lease.make(tamper(record, other) as LeaseRecord, { bank })
      const err = await TH.expectRefusal(tampered.unseal('BoxWhisper', sealed), 'damaged_lease')
      expect(TH.thrownText(err)).to.not.include(record.bank_key_lease_wrapped.ciphertext_b64)
      expect(bank.lock).toHaveBeenCalledTimes(1)
      expect(tampered.isEvicted).to.be.true
      await TH.expectRefusal(tampered.seal('BoxWhisper', TH.boxShellOf(), Cleartexts), 'bank_locked')
      expect(bank.lock).toHaveBeenCalledTimes(1)
    })
  }

  it("refuses at its first seal too, sealing nothing", async () => {
    const { bank, record } = await leaseWorld()
    const tampered = Lease.make({ ...record, proved_at: TH.T0 + 1 }, { bank })
    await TH.expectRefusal(tampered.seal('BoxWhisper', TH.boxShellOf(), Cleartexts), 'damaged_lease')
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
    expect(() => { (lease as { proved_at: number }).proved_at = TH.T0 + 1 }).to.throw(TypeError)
  })
})
