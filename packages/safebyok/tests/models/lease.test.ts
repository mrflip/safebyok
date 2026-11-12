import { describe, expect, it, vi } from 'vitest'
import { ForeverMillis } from '../../src/helpers/consts'
import { makeLeaseKey, makeBankKey } from '../../src/helpers/crypto'
import { VaultError } from '../../src/refusals/errors'
import { Lease } from '../../src/models/lease'
import { type BankStamp, type CitedGate, type LeaseGrantOpts, type LeaseRecord, LeaseFormat, isLeaseKey } from '../../src/shapes/shapes-gateish'
import { bad } from '../../src/refusals/outcome'
import * as TH from '../test-helpers'
import { type FakeLeaseFriend, FriendLeaseMillis, GrantedAs, fakeLeaseFriendOf, isZeroed, makeGrantedLease, sealStampOf, sealStampsOf, T0, useFakeClock, WorldBankStamp, WorldGate, WorldVaultStamp } from '../test-helpers/proving-world'

useFakeClock()

const StampFieldnames = ['fmt', 'user_id', 'banklabel', 'bank_tok', 'registered_at', 'gatelabel', 'gate_tok', 'gate_revision_tok', 'proved_at', 'wayinkind']

const Stamped = { ...WorldBankStamp, fmt: LeaseFormat, gatelabel: 'main', gate_tok: WorldGate.gate_tok, gate_revision_tok: WorldGate.revision_tok, proved_at: T0, wayinkind: 'passphrase' }

/** {@link WorldGate} at its next revision, as a gate verb leaves it. */
const NextGate: CitedGate = { ...WorldGate, revision_tok: 'gate-revision-tok-2' }

/** {@link WorldGate}'s gatelabel in another life of the gate. */
const RebornGate: CitedGate = { ...WorldGate, gate_tok: 'gate-tok-reborn' }

const WhisperText = '{"val":"sk-test-0000"}'

/** A lease granted and cached, beside the friend that hears it. */
async function grantedWorld(opts?: LeaseGrantOpts): Promise<{ friend: FakeLeaseFriend, lease: Lease }> {
  const friend = fakeLeaseFriendOf()
  const lease = await makeGrantedLease(friend, opts)
  await lease.cacheAsCacheCan()
  return { friend, lease }
}

/** A friend of {@link WorldBankStamp} whose scopepath has a record cached under `stamp`. */
async function friendWithRowOf(stamp: Partial<BankStamp>): Promise<FakeLeaseFriend> {
  const elsewhere = fakeLeaseFriendOf(stamp)
  const lease = await makeGrantedLease(elsewhere)
  await lease.cacheAsCacheCan()
  const friend = fakeLeaseFriendOf()
  friend.cached = elsewhere.cached
  return friend
}

describe("a revoke whose forget is refused", () => {
  it("throws, and leaves the lease out of force", async () => {
    const friend = fakeLeaseFriendOf()
    const lease = await makeGrantedLease(friend)
    await lease.cacheAsCacheCan()
    friend.forgetLease.mockRejectedValueOnce(new VaultError('unexpected_error', 'the datastore is down'))
    await TH.expectRefusal(lease.revoke())
    expect(lease.isGranted).to.be.false
    await lease.revoke()
    expect(friend.forgetLease).toHaveBeenCalledTimes(1)
    expect(friend.cached).to.not.be.null
  })
})

describe("Lease.buildGranted(friend, bankKey, opts)", () => {
  it("makes a record of the bank: fmt 7003, the bank's stamp, the gate cited, proved_at and wayinkind, a leaseKey handle and the wrapped bankKey", async () => {
    const { friend } = await grantedWorld({ gate: NextGate, wayinkind: 'passkey' })
    const record = friend.cached as LeaseRecord
    expect(record).to.deep.include({ ...WorldBankStamp, fmt: 7003, gatelabel: 'main', gate_tok: WorldGate.gate_tok, gate_revision_tok: NextGate.revision_tok, proved_at: T0, wayinkind: 'passkey' })
    expect(Object.keys(record)).to.have.members([...StampFieldnames, 'lease_key', 'bank_key_lease_wrapped'])
    expect(Object.keys(record.bank_key_lease_wrapped)).to.have.members(['cipher_iv_b64', 'ciphertext_b64'])
  })

  it("caches nothing on its own", async () => {
    const friend = fakeLeaseFriendOf()
    await makeGrantedLease(friend)
    expect(friend.tryCacheLease).not.toHaveBeenCalled()
    expect(friend.cached).to.be.null
  })

  it("makes its leaseKey non-extractable, usable only to wrap and unwrap", async () => {
    const { friend } = await grantedWorld()
    const { lease_key } = friend.cached as LeaseRecord
    expect(isLeaseKey(lease_key)).to.be.true
    expect(lease_key.extractable).to.be.false
  })

  it("shows the record's stamp as the lease's own props, and is in force", async () => {
    const { lease } = await grantedWorld()
    expect(lease).to.deep.include(Stamped)
    expect(lease.isGranted).to.be.true
  })

  const GrantRefusalCases = [
    [() => ({ bankKey: makeLeaseKey() }),                                        'refuses a bankKey that is not extractable'],
    [() => ({ bankKey: 'a bank key' }),                                          'refuses a bankKey that is not a CryptoKey'],
    [() => ({ opts: { ...GrantedAs, gate: TH.omitting(WorldGate, 'revision_tok') } }), 'refuses a cited gate with no revision_tok'],
    [() => ({ opts: { ...GrantedAs, gate: { ...WorldGate, gatelabel: 'other' } } }), 'refuses a cited gate of a gatelabel no gate has'],
    [() => ({ opts: { ...GrantedAs, wayinkind: 'carrier pigeon' } }),             'refuses an unknown wayinkind'],
    [() => ({ opts: {} }),                                                        'refuses opts with neither'],
    [() => ({ friend: { ...fakeLeaseFriendOf(), lock: undefined } }),             'refuses a friend with no lock'],
    [() => ({ friend: { ...fakeLeaseFriendOf(), bank_tok: undefined } }),         'refuses a friend with no bank_tok'],
    [() => ({ friend: { ...fakeLeaseFriendOf(), forgetLease: undefined } }),     'refuses a friend with no forgetLease'],
    [() => ({ friend: { ...fakeLeaseFriendOf(), logger: undefined } }),           'refuses a friend with no logger'],
    [() => ({ friend: { ...fakeLeaseFriendOf(), logger: TH.quietLogger } }),      'refuses a friend with a logger no bank guarded'],
  ] as const

  for (const [argsOf, blurb] of GrantRefusalCases) {
    it(blurb, async () => {
      const { friend = fakeLeaseFriendOf(), bankKey = makeBankKey(), opts = GrantedAs } = argsOf() as Record<string, unknown>
      const handed = await (bankKey as Promise<unknown>)
      await TH.expectRefusal(Lease.buildGranted(friend as FakeLeaseFriend, handed as CryptoKey, opts as LeaseGrantOpts))
    })
  }
})

describe("lease.cacheAsCacheCan()", () => {
  it("puts the record through tryCacheLease", async () => {
    const friend = fakeLeaseFriendOf()
    const lease = await makeGrantedLease(friend)
    await lease.cacheAsCacheCan()
    expect(friend.tryCacheLease).toHaveBeenCalledTimes(1)
    expect(friend.cached).to.deep.include(Stamped)
  })

  it("has nothing to do for a lease built from the cache", async () => {
    const { friend } = await grantedWorld()
    friend.tryCacheLease.mockClear()
    const cached = await Lease.buildFromCache(friend, WorldGate)
    await cached!.cacheAsCacheCan()
    expect(friend.tryCacheLease).not.toHaveBeenCalled()
  })

  it("reports a tryCacheLease refusal as bad news, leaving the lease in force", async () => {
    const friend = fakeLeaseFriendOf()
    const lease = await makeGrantedLease(friend)
    const refusal = new VaultError('unexpected_error', 'the disk is full')
    friend.tryCacheLease.mockResolvedValue(bad(refusal))
    await lease.cacheAsCacheCan()
    expect(friend.tellBadNews).toHaveBeenCalledWith([refusal])
    expect(lease.isGranted).to.be.true
    await lease.sealWith(WhisperText, sealStampsOf('b1'))
  })

  it("refuses once out of force, reporting no bad news and caching nothing", async () => {
    const friend = fakeLeaseFriendOf()
    const lease = await makeGrantedLease(friend)
    lease.evict()
    await TH.expectRefusal(lease.cacheAsCacheCan(), 'bank_locked')
    expect(friend.tellBadNews).not.toHaveBeenCalled()
    expect(friend.cached).to.be.null
  })
})

describe("Lease.buildFromCache(friend, gate)", () => {
  it("returns null when the device has no cached lease", async () => {
    expect(await Lease.buildFromCache(fakeLeaseFriendOf(), WorldGate)).to.be.null
  })

  it("returns the cached lease of this bank citing the gate, which opens what the granted lease sealed", async () => {
    const { friend, lease: granted } = await grantedWorld()
    const stamps = sealStampsOf('b1')
    const sealed = await granted.sealWith('{"val":"cached"}', stamps)
    const got = await Lease.buildFromCache(friend, WorldGate)
    expect(got?.toJSON()).to.deep.equal(granted.toJSON())
    expect(await got!.unsealWith(sealed, stamps)).to.eq('{"val":"cached"}')
  })

  it("returns a lease proved exactly the autolock duration ago, which still opens what the granted lease sealed", async () => {
    const { friend, lease: granted } = await grantedWorld()
    const stamps = sealStampsOf('b1')
    const sealed = await granted.sealWith('{"val":"cached"}', stamps)
    vi.setSystemTime(T0 + FriendLeaseMillis)
    const got = await Lease.buildFromCache(friend, WorldGate)
    expect(await got?.unsealWith(sealed, stamps)).to.eq('{"val":"cached"}')
    expect(friend.tryForgetLease).not.toHaveBeenCalled()
  })

  it("returns null past autolock and leaves the row untouched", async () => {
    const { friend } = await grantedWorld()
    const row = friend.cached
    vi.setSystemTime(T0 + FriendLeaseMillis + 1)
    expect(await Lease.buildFromCache(friend, WorldGate)).to.be.null
    expect(friend.tryForgetLease).not.toHaveBeenCalled()
    expect(friend.cached).to.eq(row)
    expect(friend.logged).to.deep.equal([])
  })

  it("opens a row past autolock again once the clock is set back", async () => {
    const { friend } = await grantedWorld()
    vi.setSystemTime(T0 + FriendLeaseMillis + 1)
    expect(await Lease.buildFromCache(friend, WorldGate)).to.be.null
    vi.setSystemTime(T0)
    const got = await Lease.buildFromCache(friend, WorldGate)
    expect(got?.isGranted).to.be.true
  })

  it("forgets a row citing another revision of the gate even past autolock", async () => {
    const { friend } = await grantedWorld()
    vi.setSystemTime(T0 + FriendLeaseMillis + 1)
    expect(await Lease.buildFromCache(friend, NextGate)).to.be.null
    expect(friend.tryForgetLease).toHaveBeenCalledTimes(1)
    expect(friend.cached).to.be.null
  })

  it("never expires a lease under an autolock of ForeverMillis", async () => {
    const friend = fakeLeaseFriendOf({ leaseMillis: ForeverMillis })
    const lease = await makeGrantedLease(friend)
    await lease.cacheAsCacheCan()
    vi.setSystemTime(T0 + (400 * 24 * 60 * 60_000))
    const got = await Lease.buildFromCache(friend, WorldGate)
    expect(got?.isGranted).to.be.true
  })

  it("reports a datastore's refusal as bad news, once, and returns null", async () => {
    const friend = fakeLeaseFriendOf()
    const refusal = new VaultError('unexpected_error', 'the datastore is down')
    friend.peekLease.mockRejectedValue(refusal)
    expect(await Lease.buildFromCache(friend, WorldGate)).to.be.null
    expect(friend.tellBadNews).toHaveBeenCalledExactlyOnceWith([refusal])
    expect(friend.tryForgetLease).not.toHaveBeenCalled()
  })

  it("refuses a malformed friend, reporting no bad news", async () => {
    const friend = { ...fakeLeaseFriendOf(), peekLease: undefined } as unknown as FakeLeaseFriend
    await TH.expectRefusal(Lease.buildFromCache(friend, WorldGate))
    expect(friend.tellBadNews).not.toHaveBeenCalled()
  })

  const OtherGateCases = [
    [NextGate,   'another revision of the gate'],
    [RebornGate, 'another life of the gate'],
  ] as const

  for (const [cited, blurb] of OtherGateCases) {
    it(`forgets a cached lease citing ${blurb}, reporting no bad news`, async () => {
      const { friend } = await grantedWorld()
      expect(await Lease.buildFromCache(friend, cited)).to.be.null
      expect(friend.tryForgetLease).toHaveBeenCalledTimes(1)
      expect(friend.cached).to.be.null
      expect(friend.tellBadNews).not.toHaveBeenCalled()
    })
  }

  const OtherStampCases = [
    [{ bank_tok: 'bank-tok-other' },   'another life of the bank, by its bank_tok'],
    [{ registered_at: T0 + 1 },        'another life of the bank, by its registered_at'],
    [{ user_id: 'u2' },                "another user's bank"],
    [{ banklabel: 'work' },            'another bank of the same user'],
  ] as const

  for (const [stamp, blurb] of OtherStampCases) {
    it(`forgets a cached lease of ${blurb}, reports it as bad news and returns null`, async () => {
      const friend = await friendWithRowOf(stamp)
      expect(await Lease.buildFromCache(friend, WorldGate)).to.be.null
      expect(friend.tryForgetLease).toHaveBeenCalledTimes(1)
      expect(friend.cached).to.be.null
      expect(friend.tellBadNews).toHaveBeenCalledOnce()
      expect((friend.tellBadNews.mock.calls[0]![0][0] as VaultError).refusalkind).to.eq('damaged_lease')
    })
  }

  it("reports the bad news for a row of another stamp even when its forget is refused", async () => {
    const friend = await friendWithRowOf({ user_id: 'u2' })
    friend.tryForgetLease.mockResolvedValueOnce(bad(new VaultError('unexpected_error', 'the datastore is down')))
    expect(await Lease.buildFromCache(friend, WorldGate)).to.be.null
    expect(friend.tellBadNews).toHaveBeenCalledOnce()
  })

  it("rethrows an error that is not a refusal, reporting no bad news", async () => {
    const friend = fakeLeaseFriendOf()
    friend.peekLease.mockRejectedValue(new TypeError('a bug'))
    await expect(Lease.buildFromCache(friend, WorldGate)).rejects.to.be.instanceOf(TypeError)
    expect(friend.tellBadNews).not.toHaveBeenCalled()
  })

  it("returns null quietly when forgetting a row citing another revision is refused", async () => {
    const { friend } = await grantedWorld()
    friend.tryForgetLease.mockResolvedValueOnce(bad(new VaultError('unexpected_error', 'the datastore is down')))
    expect(await Lease.buildFromCache(friend, NextGate)).to.be.null
    expect(friend.tellBadNews).not.toHaveBeenCalled()
    expect(friend.logged).to.deep.equal([])
  })

  const MalformedCases = [
    [(record: LeaseRecord, extractableBankKey: CryptoKey) => ({ ...record, lease_key: extractableBankKey }), 'whose leaseKey is extractable'],
    [(record: LeaseRecord) => ({ ...record, fmt: 7000 }),                          'of another fmt'],
    [(record: LeaseRecord) => ({ ...record, bank_key_lease_wrapped: undefined }), 'with no wrapped bankKey'],
    [(record: LeaseRecord) => ({ ...record, proved_at: undefined }),               'with no proved_at'],
    [(record: LeaseRecord) => ({ ...record, extra: 'field' }),                     'with a field no lease has'],
    [() => 'a lease',                                                              'that is not a record at all'],
  ] as const

  for (const [tamper, blurb] of MalformedCases) {
    it(`reports a cached record ${blurb} as bad news without quoting it`, async () => {
      const { friend } = await grantedWorld()
      const { bank_key_lease_wrapped } = friend.cached as LeaseRecord
      const tampered = tamper(friend.cached as LeaseRecord, await makeBankKey())
      friend.cached = tampered
      expect(await Lease.buildFromCache(friend, WorldGate)).to.be.null
      expect(friend.tellBadNews).toHaveBeenCalledOnce()
      const err = friend.tellBadNews.mock.calls[0]![0][0] as VaultError
      expect(err.refusalkind).to.eq('damaged_lease')
      expect(TH.thrownText(err)).to.not.include(bank_key_lease_wrapped.ciphertext_b64)
      expect(friend.cached).to.equal(tampered)
      expect(friend.tryForgetLease).not.toHaveBeenCalled()
    })
  }
})

describe("lease.revoke(), lease.evict() and isGranted", () => {
  it("revoke forgets the cached record and leaves the lease out of force", async () => {
    const { friend, lease } = await grantedWorld()
    await lease.revoke()
    expect(friend.forgetLease).toHaveBeenCalledTimes(1)
    expect(friend.cached).to.be.null
    expect(lease.isGranted).to.be.false
  })

  it("is idempotent: a second revoke forgets nothing more", async () => {
    const { friend, lease } = await grantedWorld()
    await lease.revoke()
    await lease.revoke()
    expect(friend.forgetLease).toHaveBeenCalledTimes(1)
  })

  it("throws what forgetLease refuses, leaving the lease out of force", async () => {
    const { friend, lease } = await grantedWorld()
    friend.forgetLease.mockRejectedValueOnce(new VaultError('unexpected_error', 'the datastore is down'))
    await TH.expectRefusal(lease.revoke())
    expect(lease.isGranted).to.be.false
    const other = await grantedWorld()
    other.friend.forgetLease.mockRejectedValueOnce(new VaultError('unexpected_error', 'the datastore is down'))
    await TH.expectBad(other.lease.tryRevoke())
    expect(other.lease.isGranted).to.be.false
  })

  it("Lease.forget forgets a record with no lease granted, starting before it returns", async () => {
    const friend = fakeLeaseFriendOf()
    friend.cached = 'a row of an earlier session'
    const forgetting = Lease.tryForget(friend)
    expect(friend.forgetLease).toHaveBeenCalledTimes(1)
    expect(friend.cached).to.be.null
    await TH.expectGood(forgetting)
    await Lease.forget(friend)
    expect(friend.forgetLease).toHaveBeenCalledTimes(2)
  })

  it("Lease.forget throws what forgetLease refuses", async () => {
    const friend = fakeLeaseFriendOf()
    friend.forgetLease.mockRejectedValueOnce(new VaultError('unexpected_error', 'the datastore is down'))
    await TH.expectRefusal(Lease.forget(friend))
    friend.forgetLease.mockRejectedValueOnce(new VaultError('unexpected_error', 'the datastore is down'))
    await TH.expectBad(Lease.tryForget(friend))
  })

  it("Lease.forget refuses a malformed friend, forgetting nothing", async () => {
    const friend = { ...fakeLeaseFriendOf(), lock: undefined } as unknown as FakeLeaseFriend
    await TH.expectRefusal(Lease.forget(friend))
    expect(friend.forgetLease).not.toHaveBeenCalled()
  })

  it("evict drops the keys and leaves the record cached", async () => {
    const { friend, lease } = await grantedWorld()
    lease.evict()
    expect(lease.isGranted).to.be.false
    expect(friend.forgetLease).not.toHaveBeenCalled()
    expect(friend.cached).to.not.be.null
  })

  it("sealWith and unsealWith refuse 'bank_locked' once revoked", async () => {
    const { lease } = await grantedWorld()
    const stamps = sealStampsOf('b1')
    const sealed = await lease.sealWith(WhisperText, stamps)
    await lease.revoke()
    await TH.expectRefusal(lease.sealWith(WhisperText, stamps), 'bank_locked')
    await TH.expectRefusal(lease.unsealWith(sealed, stamps), 'bank_locked')
  })
})

describe("lease.sealWith(whisperText, stamps) and unsealWith(sealed, stamps)", () => {
  it("round-trips a whisper's text under the same stamps", async () => {
    const { lease } = await grantedWorld()
    const stamps = sealStampsOf('b1')
    const sealed = await lease.sealWith('{"val":"sk-test-1234"}', stamps)
    expect(Object.keys(sealed)).to.have.members(['box_key_wrapped', 'whisper_ciphered'])
    expect(await lease.unsealWith(sealed, stamps)).to.eq('{"val":"sk-test-1234"}')
  })

  it("zeroes the whisper's bytes once each has sealed or opened them", async () => {
    const { lease } = await grantedWorld()
    const stamps = sealStampsOf('b1')
    const encode = vi.spyOn(TextEncoder.prototype, 'encode')
    const decode = vi.spyOn(TextDecoder.prototype, 'decode')
    const sealed = await lease.sealWith(WhisperText, stamps)
    expect(await lease.unsealWith(sealed, stamps)).to.eq(WhisperText)
    const sealedBytes = encode.mock.results[encode.mock.calls.findIndex(([text]) => text === WhisperText)]?.value as Uint8Array
    const openedBytes = decode.mock.calls[decode.mock.results.findIndex((decoded) => decoded.value === WhisperText)]?.[0] as Uint8Array
    encode.mockRestore()
    decode.mockRestore()
    expect(sealedBytes.length).to.eq(WhisperText.length)
    expect(openedBytes.length).to.eq(WhisperText.length)
    expect(isZeroed(sealedBytes)).to.be.true
    expect(isZeroed(openedBytes)).to.be.true
  })

  it("seals the same whisper under the same stamps differently each time: a fresh boxKey and cipherIv", async () => {
    const { lease } = await grantedWorld()
    const stamps = sealStampsOf('b1')
    const first  = await lease.sealWith(WhisperText, stamps)
    const second = await lease.sealWith(WhisperText, stamps)
    expect(first.whisper_ciphered.ciphertext_b64).to.not.eq(second.whisper_ciphered.ciphertext_b64)
    expect(first.box_key_wrapped.ciphertext_b64).to.not.eq(second.box_key_wrapped.ciphertext_b64)
  })

  const BadStampsCases = [
    [null,                                                'null'],
    ['boxlabel=b1',                                       'a string'],
    [[],                                                  'no stamps at all'],
    [sealStampOf('b1'),                                   'a bare stamp, not a list of them'],
    [[['boxlabel', 'b1']],                                'a list of pairs'],
    [[WorldVaultStamp, { boxlabel: 'b1', revision: null }], 'a stamp with a null field'],
    [[WorldVaultStamp, { boxlabel: { nested: 'b1' } }],   'a stamp that is not flat'],
    [[WorldVaultStamp, { revision_seq: NaN }],            'a stamp with a number that is not finite'],
  ] as const

  for (const [stamps, blurb] of BadStampsCases) {
    it(`refuses ${blurb} for the stamps`, async () => {
      const { lease } = await grantedWorld()
      await TH.expectRefusal(lease.sealWith(WhisperText, stamps as never))
    })
  }

  it("refuses a whisper that is not a string", async () => {
    const { lease } = await grantedWorld()
    await TH.expectRefusal(lease.sealWith(new TextEncoder().encode(WhisperText) as never, sealStampsOf('b1')))
  })

  const WrongStampCases = [
    [sealStampsOf('b2'),                                                       "another box's stamp"],
    [sealStampsOf('b1', { revision_seq: 2 }),                                  "another revision's stamp"],
    [[{ ...WorldVaultStamp, vault_tok: 'vault-tok-other' }, sealStampOf('b1')], "another vault's stamp"],
    [[sealStampOf('b1')],                                                      'the box stamp alone, without its vault'],
  ] as const

  for (const [wrong, blurb] of WrongStampCases) {
    it(`refuses to open under ${blurb}, as 'damaged_whisper', and locks nothing`, async () => {
      const { friend, lease } = await grantedWorld()
      const sealed = await lease.sealWith(WhisperText, sealStampsOf('b1'))
      await TH.expectRefusal(lease.unsealWith(sealed, wrong), 'damaged_whisper')
      expect(friend.lock).not.toHaveBeenCalled()
    })
  }

  it("refuses 'damaged_whisper' for one box's wrapped key beside another box's whisper", async () => {
    const { lease } = await grantedWorld()
    const sealedOne = await lease.sealWith(WhisperText, sealStampsOf('b1'))
    const sealedTwo = await lease.sealWith(WhisperText, sealStampsOf('b2'))
    await TH.expectRefusal(lease.unsealWith({ box_key_wrapped: sealedOne.box_key_wrapped, whisper_ciphered: sealedTwo.whisper_ciphered }, sealStampsOf('b2')), 'damaged_whisper')
  })

  it("refuses to open what another bank sealed under the same stamps, as 'damaged_whisper'", async () => {
    const { lease } = await grantedWorld()
    const other = await makeGrantedLease(fakeLeaseFriendOf({ bank_tok: 'bank-tok-other' }))
    const stamps = sealStampsOf('b1')
    const sealed = await other.sealWith(WhisperText, stamps)
    await TH.expectRefusal(lease.unsealWith(sealed, stamps), 'damaged_whisper')
  })

  it("refuses tampered ciphertext as 'damaged_whisper', quoting none of it", async () => {
    const { lease } = await grantedWorld()
    const stamps = sealStampsOf('b1')
    const sealed = await lease.sealWith(WhisperText, stamps)
    const tampered = { ...sealed, whisper_ciphered: { ...sealed.whisper_ciphered, ciphertext_b64: TH.tweakB64(sealed.whisper_ciphered.ciphertext_b64) } }
    const err = await TH.expectRefusal(lease.unsealWith(tampered, stamps), 'damaged_whisper')
    expect(TH.thrownText(err)).to.not.include(tampered.whisper_ciphered.ciphertext_b64)
  })

  it("refuses sealed parts that are not ciphertext objects", async () => {
    const { lease } = await grantedWorld()
    const stamps = sealStampsOf('b1')
    await TH.expectRefusal(lease.unsealWith({ box_key_wrapped: 'wrapped' } as never, stamps))
  })
})

describe("a tampered lease record", () => {
  const TamperCases = [
    [(record: LeaseRecord) => ({ ...record, proved_at: record.proved_at + 1 }),                'its proved_at moved'],
    [(record: LeaseRecord) => ({ ...record, wayinkind: 'passkey' }),                           'its wayinkind changed'],
    [(record: LeaseRecord, other: LeaseRecord) => ({ ...record, lease_key: other.lease_key }), "another lease's leaseKey"],
    [(record: LeaseRecord, other: LeaseRecord) => ({ ...record, bank_key_lease_wrapped: other.bank_key_lease_wrapped }), "another lease's wrapped bankKey"],
  ] as const

  for (const [tamper, blurb] of TamperCases) {
    it(`with ${blurb} locks the vault at its first seal or unseal`, async () => {
      const { friend, lease } = await grantedWorld()
      const stamps = sealStampsOf('b1')
      const sealed = await lease.sealWith(WhisperText, stamps)
      const other = await grantedWorld()
      friend.cached = tamper(friend.cached as LeaseRecord, other.friend.cached as LeaseRecord)
      const got = await Lease.buildFromCache(friend, WorldGate)
      expect(got).to.be.instanceOf(Lease)
      await TH.expectRefusal(got!.unsealWith(sealed, stamps), 'damaged_lease')
      expect(friend.lock).toHaveBeenCalledTimes(1)
      expect(got!.isGranted).to.be.false
      expect(friend.forgetLease).not.toHaveBeenCalled()
      await TH.expectRefusal(got!.sealWith(WhisperText, stamps), 'bank_locked')
      expect(friend.lock).toHaveBeenCalledTimes(1)
    })
  }

  const CitationCases = [
    [NextGate,   { gate_revision_tok: NextGate.revision_tok }, 'its gate_revision_tok changed to the revision asked for'],
    [RebornGate, { gate_tok: RebornGate.gate_tok },            'its gate_tok changed to the life asked for'],
  ] as const

  for (const [cited, citation, blurb] of CitationCases) {
    it(`refuses to seal with ${blurb}`, async () => {
      const { friend } = await grantedWorld()
      friend.cached = { ...(friend.cached as LeaseRecord), ...citation }
      const got = await Lease.buildFromCache(friend, cited)
      await TH.expectRefusal(got!.sealWith(WhisperText, sealStampsOf('b1')), 'damaged_lease')
    })
  }

  it("refuses a damaged lease, quoting none of the record", async () => {
    const { friend } = await grantedWorld()
    friend.cached = { ...(friend.cached as LeaseRecord), proved_at: T0 + 1 }
    const got = await Lease.buildFromCache(friend, WorldGate)
    const stamps = sealStampsOf('b1')
    const err = await TH.expectRefusal(got!.sealWith(WhisperText, stamps), 'damaged_lease')
    expect(TH.thrownText(err)).to.not.include((friend.cached as LeaseRecord).bank_key_lease_wrapped.ciphertext_b64)
  })
})

describe("what a lease shows", () => {
  it("Object.keys shows its stamp alone: no leaseKey, no wrapped bankKey, no friend", async () => {
    const { lease } = await grantedWorld()
    expect(Object.keys(lease)).to.have.members(StampFieldnames)
  })

  it("JSON.stringify and toJSON give its stamp alone", async () => {
    const { friend, lease } = await grantedWorld()
    expect(TH.jsonOf(lease)).to.deep.equal(Stamped)
    expect(lease.toJSON()).to.deep.equal(TH.jsonOf(lease))
    expect(JSON.stringify(lease)).to.not.include((friend.cached as LeaseRecord).bank_key_lease_wrapped.ciphertext_b64)
  })

  it("is frozen: its stamp cannot be changed", async () => {
    const { lease } = await grantedWorld()
    expect(Object.isFrozen(lease)).to.be.true
    expect(() => { (lease as { proved_at: number }).proved_at = T0 + 1 }).to.throw(TypeError)
  })
})
