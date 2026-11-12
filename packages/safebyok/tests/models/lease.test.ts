import { describe, expect, it, vi } from 'vitest'
import { ForeverMillis } from '../../src/helpers/consts'
import { makeLeaseKey, makeVaultKey } from '../../src/helpers/crypto'
import { VaultError } from '../../src/refusals/errors'
import { Lease } from '../../src/models/lease'
import { type LeaseGrantOpts, type LeaseRecord, type VaultStamp, LeaseFormat, isLeaseKey } from '../../src/shapes/shapes-gateish'
import { bad } from '../../src/refusals/outcome'
import * as TH from '../test-helpers'
import { type FakeLeaseFriend, FriendLeaseMillis, GrantedAs, fakeLeaseFriendOf, isZeroed, makeGrantedLease, sealStampOf, T0, useFakeClock, WorldStamp } from '../test-helpers/proving-world'

useFakeClock()

const StampFieldnames = ['fmt', 'applabel', 'user_id', 'vaultlabel', 'vault_tok', 'registered_at', 'gate_epoch', 'proved_at', 'wayinkind']

const Stamped = { ...WorldStamp, fmt: LeaseFormat, proved_at: T0, ...GrantedAs }

const WhisperText = '{"val":"sk-test-0000"}'

/** A lease granted and cached, beside the friend that hears it. */
async function grantedWorld(opts?: LeaseGrantOpts): Promise<{ friend: FakeLeaseFriend, lease: Lease }> {
  const friend = fakeLeaseFriendOf()
  const lease = await makeGrantedLease(friend, opts)
  await lease.cacheAsCacheCan()
  return { friend, lease }
}

/** A friend of {@link WorldStamp} whose scopepath has a record cached under `stamp`. */
async function friendWithRowOf(stamp: Partial<VaultStamp>): Promise<FakeLeaseFriend> {
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

describe("Lease.buildGranted(friend, vaultKey, opts)", () => {
  it("makes a record of the vault: fmt 7001, the vault's stamp, the epoch, proved_at and wayinkind, a leaseKey handle and the wrapped vaultKey", async () => {
    const { friend } = await grantedWorld({ gate_epoch: 3, wayinkind: 'passkey' })
    const record = friend.cached as LeaseRecord
    expect(record).to.deep.include({ ...WorldStamp, fmt: LeaseFormat, gate_epoch: 3, proved_at: T0, wayinkind: 'passkey' })
    expect(Object.keys(record)).to.have.members([...StampFieldnames, 'lease_key', 'vault_key_lease_wrapped'])
    expect(Object.keys(record.vault_key_lease_wrapped)).to.have.members(['cipher_iv_b64', 'ciphertext_b64'])
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
    [() => ({ vaultKey: makeLeaseKey() }),                                        'refuses a vaultKey that is not extractable'],
    [() => ({ vaultKey: 'a vault key' }),                                         'refuses a vaultKey that is not a CryptoKey'],
    [() => ({ opts: { ...GrantedAs, gate_epoch: 0 } }),                           'refuses gate_epoch 0'],
    [() => ({ opts: { ...GrantedAs, gate_epoch: 1.5 } }),                         'refuses a gate_epoch that is not whole'],
    [() => ({ opts: { ...GrantedAs, wayinkind: 'carrier pigeon' } }),             'refuses an unknown wayinkind'],
    [() => ({ opts: {} }),                                                        'refuses opts with neither'],
    [() => ({ friend: { ...fakeLeaseFriendOf(), lock: undefined } }),             'refuses a friend with no lock'],
    [() => ({ friend: { ...fakeLeaseFriendOf(), vault_tok: undefined } }),        'refuses a friend with no vault_tok'],
    [() => ({ friend: { ...fakeLeaseFriendOf(), forgetLease: undefined } }),     'refuses a friend with no forgetLease'],
    [() => ({ friend: { ...fakeLeaseFriendOf(), logger: undefined } }),           'refuses a friend with no logger'],
    [() => ({ friend: { ...fakeLeaseFriendOf(), logger: TH.quietLogger } }),      'refuses a friend with a logger no bank guarded'],
  ] as const

  for (const [argsOf, blurb] of GrantRefusalCases) {
    it(blurb, async () => {
      const { friend = fakeLeaseFriendOf(), vaultKey = makeVaultKey(), opts = GrantedAs } = argsOf() as Record<string, unknown>
      const handed = await (vaultKey as Promise<unknown>)
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
    const cached = await Lease.buildFromCache(friend, GrantedAs.gate_epoch)
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
    await lease.sealWith(WhisperText, sealStampOf('b1'))
  })

  it("refuses once out of force, reporting no bad news and caching nothing", async () => {
    const friend = fakeLeaseFriendOf()
    const lease = await makeGrantedLease(friend)
    lease.evict()
    await TH.expectRefusal(lease.cacheAsCacheCan(), 'vault_locked')
    expect(friend.tellBadNews).not.toHaveBeenCalled()
    expect(friend.cached).to.be.null
  })
})

describe("Lease.buildFromCache(friend, gate_epoch)", () => {
  it("returns null when the device has no cached lease", async () => {
    expect(await Lease.buildFromCache(fakeLeaseFriendOf(), GrantedAs.gate_epoch)).to.be.null
  })

  it("returns the cached lease of this vault and epoch, which opens what the granted lease sealed", async () => {
    const { friend, lease: granted } = await grantedWorld()
    const stamp = sealStampOf('b1')
    const sealed = await granted.sealWith('{"val":"cached"}', stamp)
    const got = await Lease.buildFromCache(friend, GrantedAs.gate_epoch)
    expect(got?.toJSON()).to.deep.equal(granted.toJSON())
    expect(await got!.unsealWith(sealed, stamp)).to.eq('{"val":"cached"}')
  })

  it("returns a lease proved exactly the autolock duration ago, which still opens what the granted lease sealed", async () => {
    const { friend, lease: granted } = await grantedWorld()
    const stamp = sealStampOf('b1')
    const sealed = await granted.sealWith('{"val":"cached"}', stamp)
    vi.setSystemTime(T0 + FriendLeaseMillis)
    const got = await Lease.buildFromCache(friend, GrantedAs.gate_epoch)
    expect(await got?.unsealWith(sealed, stamp)).to.eq('{"val":"cached"}')
    expect(friend.tryForgetLease).not.toHaveBeenCalled()
  })

  it("returns null past autolock and leaves the row untouched", async () => {
    const { friend } = await grantedWorld()
    const row = friend.cached
    vi.setSystemTime(T0 + FriendLeaseMillis + 1)
    expect(await Lease.buildFromCache(friend, GrantedAs.gate_epoch)).to.be.null
    expect(friend.tryForgetLease).not.toHaveBeenCalled()
    expect(friend.cached).to.eq(row)
    expect(friend.logged).to.deep.equal([])
  })

  it("opens a row past autolock again once the clock is set back", async () => {
    const { friend } = await grantedWorld()
    vi.setSystemTime(T0 + FriendLeaseMillis + 1)
    expect(await Lease.buildFromCache(friend, GrantedAs.gate_epoch)).to.be.null
    vi.setSystemTime(T0)
    const got = await Lease.buildFromCache(friend, GrantedAs.gate_epoch)
    expect(got?.isGranted).to.be.true
  })

  it("forgets a row of another epoch even past autolock", async () => {
    const { friend } = await grantedWorld()
    vi.setSystemTime(T0 + FriendLeaseMillis + 1)
    expect(await Lease.buildFromCache(friend, GrantedAs.gate_epoch + 1)).to.be.null
    expect(friend.tryForgetLease).toHaveBeenCalledTimes(1)
    expect(friend.cached).to.be.null
  })

  it("never expires a lease under an autolock of ForeverMillis", async () => {
    const friend = fakeLeaseFriendOf({ leaseMillis: ForeverMillis })
    const lease = await makeGrantedLease(friend)
    await lease.cacheAsCacheCan()
    vi.setSystemTime(T0 + (400 * 24 * 60 * 60_000))
    const got = await Lease.buildFromCache(friend, GrantedAs.gate_epoch)
    expect(got?.isGranted).to.be.true
  })

  it("reports a datastore's refusal as bad news, once, and returns null", async () => {
    const friend = fakeLeaseFriendOf()
    const refusal = new VaultError('unexpected_error', 'the datastore is down')
    friend.peekLease.mockRejectedValue(refusal)
    expect(await Lease.buildFromCache(friend, GrantedAs.gate_epoch)).to.be.null
    expect(friend.tellBadNews).toHaveBeenCalledExactlyOnceWith([refusal])
    expect(friend.tryForgetLease).not.toHaveBeenCalled()
  })

  it("refuses a malformed friend, reporting no bad news", async () => {
    const friend = { ...fakeLeaseFriendOf(), peekLease: undefined } as unknown as FakeLeaseFriend
    await TH.expectRefusal(Lease.buildFromCache(friend, GrantedAs.gate_epoch))
    expect(friend.tellBadNews).not.toHaveBeenCalled()
  })

  it("forgets a cached lease of another gate of this vault, reporting no bad news", async () => {
    const { friend } = await grantedWorld()
    expect(await Lease.buildFromCache(friend, GrantedAs.gate_epoch + 1)).to.be.null
    expect(friend.tryForgetLease).toHaveBeenCalledTimes(1)
    expect(friend.cached).to.be.null
    expect(friend.tellBadNews).not.toHaveBeenCalled()
  })

  const OtherStampCases = [
    [{ vault_tok: 'vault-tok-other' }, 'another life of the vault, by its vault_tok'],
    [{ registered_at: T0 + 1 },        'another life of the vault, by its registered_at'],
    [{ user_id: 'u2' },                "another user's vault"],
    [{ vaultlabel: 'work' },           'another vault of the same user'],
  ] as const

  for (const [stamp, blurb] of OtherStampCases) {
    it(`forgets a cached lease of ${blurb}, reports it as bad news and returns null`, async () => {
      const friend = await friendWithRowOf(stamp)
      expect(await Lease.buildFromCache(friend, GrantedAs.gate_epoch)).to.be.null
      expect(friend.tryForgetLease).toHaveBeenCalledTimes(1)
      expect(friend.cached).to.be.null
      expect(friend.tellBadNews).toHaveBeenCalledOnce()
      expect((friend.tellBadNews.mock.calls[0]![0][0] as VaultError).refusalkind).to.eq('damaged_lease')
    })
  }

  it("reports the bad news for a row of another stamp even when its forget is refused", async () => {
    const friend = await friendWithRowOf({ user_id: 'u2' })
    friend.tryForgetLease.mockResolvedValueOnce(bad(new VaultError('unexpected_error', 'the datastore is down')))
    expect(await Lease.buildFromCache(friend, GrantedAs.gate_epoch)).to.be.null
    expect(friend.tellBadNews).toHaveBeenCalledOnce()
  })

  it("rethrows an error that is not a refusal, reporting no bad news", async () => {
    const friend = fakeLeaseFriendOf()
    friend.peekLease.mockRejectedValue(new TypeError('a bug'))
    await expect(Lease.buildFromCache(friend, GrantedAs.gate_epoch)).rejects.to.be.instanceOf(TypeError)
    expect(friend.tellBadNews).not.toHaveBeenCalled()
  })

  it("returns null quietly when forgetting another gate's row is refused", async () => {
    const { friend } = await grantedWorld()
    friend.tryForgetLease.mockResolvedValueOnce(bad(new VaultError('unexpected_error', 'the datastore is down')))
    expect(await Lease.buildFromCache(friend, GrantedAs.gate_epoch + 1)).to.be.null
    expect(friend.tellBadNews).not.toHaveBeenCalled()
    expect(friend.logged).to.deep.equal([])
  })

  const MalformedCases = [
    [(record: LeaseRecord, extractableVaultKey: CryptoKey) => ({ ...record, lease_key: extractableVaultKey }), 'whose leaseKey is extractable'],
    [(record: LeaseRecord) => ({ ...record, fmt: 7000 }),                          'of another fmt'],
    [(record: LeaseRecord) => ({ ...record, vault_key_lease_wrapped: undefined }), 'with no wrapped vaultKey'],
    [(record: LeaseRecord) => ({ ...record, proved_at: undefined }),               'with no proved_at'],
    [(record: LeaseRecord) => ({ ...record, extra: 'field' }),                     'with a field no lease has'],
    [() => 'a lease',                                                              'that is not a record at all'],
  ] as const

  for (const [tamper, blurb] of MalformedCases) {
    it(`reports a cached record ${blurb} as bad news without quoting it`, async () => {
      const { friend } = await grantedWorld()
      const { vault_key_lease_wrapped } = friend.cached as LeaseRecord
      const tampered = tamper(friend.cached as LeaseRecord, await makeVaultKey())
      friend.cached = tampered
      expect(await Lease.buildFromCache(friend, GrantedAs.gate_epoch)).to.be.null
      expect(friend.tellBadNews).toHaveBeenCalledOnce()
      const err = friend.tellBadNews.mock.calls[0]![0][0] as VaultError
      expect(err.refusalkind).to.eq('damaged_lease')
      expect(TH.thrownText(err)).to.not.include(vault_key_lease_wrapped.ciphertext_b64)
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

  it("sealWith and unsealWith refuse 'vault_locked' once revoked", async () => {
    const { lease } = await grantedWorld()
    const stamp = sealStampOf('b1')
    const sealed = await lease.sealWith(WhisperText, stamp)
    await lease.revoke()
    await TH.expectRefusal(lease.sealWith(WhisperText, stamp), 'vault_locked')
    await TH.expectRefusal(lease.unsealWith(sealed, stamp), 'vault_locked')
  })
})

describe("lease.sealWith(whisperText, stamp) and unsealWith(sealed, stamp)", () => {
  it("round-trips a whisper's text under the same stamp", async () => {
    const { lease } = await grantedWorld()
    const stamp = sealStampOf('b1')
    const sealed = await lease.sealWith('{"val":"sk-test-1234"}', stamp)
    expect(Object.keys(sealed)).to.have.members(['box_key_wrapped', 'whisper_ciphered'])
    expect(await lease.unsealWith(sealed, stamp)).to.eq('{"val":"sk-test-1234"}')
  })

  it("zeroes the whisper's bytes once each has sealed or opened them", async () => {
    const { lease } = await grantedWorld()
    const stamp = sealStampOf('b1')
    const encode = vi.spyOn(TextEncoder.prototype, 'encode')
    const decode = vi.spyOn(TextDecoder.prototype, 'decode')
    const sealed = await lease.sealWith(WhisperText, stamp)
    expect(await lease.unsealWith(sealed, stamp)).to.eq(WhisperText)
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
    const stamp = sealStampOf('b1')
    const first  = await lease.sealWith(WhisperText, stamp)
    const second = await lease.sealWith(WhisperText, stamp)
    expect(first.whisper_ciphered.ciphertext_b64).to.not.eq(second.whisper_ciphered.ciphertext_b64)
    expect(first.box_key_wrapped.ciphertext_b64).to.not.eq(second.box_key_wrapped.ciphertext_b64)
  })

  const BadStampCases = [
    [null,                               'null'],
    ['boxlabel=b1',                      'a string'],
    [[['boxlabel', 'b1']],               'an array'],
    [{ boxlabel: 'b1', revision: null }, 'a stamp with a null field'],
    [{ boxlabel: { nested: 'b1' } },     'a stamp that is not flat'],
    [{ revision_seq: NaN },              'a stamp with a number that is not finite'],
  ] as const

  for (const [stamp, blurb] of BadStampCases) {
    it(`refuses ${blurb} for the stamp`, async () => {
      const { lease } = await grantedWorld()
      await TH.expectRefusal(lease.sealWith(WhisperText, stamp as never))
    })
  }

  it("refuses a whisper that is not a string", async () => {
    const { lease } = await grantedWorld()
    await TH.expectRefusal(lease.sealWith(new TextEncoder().encode(WhisperText) as never, sealStampOf('b1')))
  })

  const WrongStampCases = [
    [sealStampOf('b2'),                      "another box's stamp"],
    [sealStampOf('b1', { revision_seq: 2 }), "another revision's stamp"],
  ] as const

  for (const [wrong, blurb] of WrongStampCases) {
    it(`refuses to open under ${blurb}, as 'damaged_whisper', and locks nothing`, async () => {
      const { friend, lease } = await grantedWorld()
      const sealed = await lease.sealWith(WhisperText, sealStampOf('b1'))
      await TH.expectRefusal(lease.unsealWith(sealed, wrong), 'damaged_whisper')
      expect(friend.lock).not.toHaveBeenCalled()
    })
  }

  it("refuses 'damaged_whisper' for one box's wrapped key beside another box's whisper", async () => {
    const { lease } = await grantedWorld()
    const sealedOne = await lease.sealWith(WhisperText, sealStampOf('b1'))
    const sealedTwo = await lease.sealWith(WhisperText, sealStampOf('b2'))
    await TH.expectRefusal(lease.unsealWith({ box_key_wrapped: sealedOne.box_key_wrapped, whisper_ciphered: sealedTwo.whisper_ciphered }, sealStampOf('b2')), 'damaged_whisper')
  })

  it("refuses to open what another vault sealed under the same box stamps, as 'damaged_whisper'", async () => {
    const { lease } = await grantedWorld()
    const other = await makeGrantedLease(fakeLeaseFriendOf({ vault_tok: 'vault-tok-other' }))
    const stamp = sealStampOf('b1')
    const sealed = await other.sealWith(WhisperText, stamp)
    await TH.expectRefusal(lease.unsealWith(sealed, stamp), 'damaged_whisper')
  })

  it("refuses tampered ciphertext as 'damaged_whisper', quoting none of it", async () => {
    const { lease } = await grantedWorld()
    const stamp = sealStampOf('b1')
    const sealed = await lease.sealWith(WhisperText, stamp)
    const tampered = { ...sealed, whisper_ciphered: { ...sealed.whisper_ciphered, ciphertext_b64: TH.tweakB64(sealed.whisper_ciphered.ciphertext_b64) } }
    const err = await TH.expectRefusal(lease.unsealWith(tampered, stamp), 'damaged_whisper')
    expect(TH.thrownText(err)).to.not.include(tampered.whisper_ciphered.ciphertext_b64)
  })

  it("refuses sealed parts that are not ciphertext objects", async () => {
    const { lease } = await grantedWorld()
    const stamp = sealStampOf('b1')
    await TH.expectRefusal(lease.unsealWith({ box_key_wrapped: 'wrapped' } as never, stamp))
  })
})

describe("a tampered lease record", () => {
  const TamperCases = [
    [(record: LeaseRecord) => ({ ...record, proved_at: record.proved_at + 1 }),                'its proved_at moved'],
    [(record: LeaseRecord) => ({ ...record, wayinkind: 'passkey' }),                           'its wayinkind changed'],
    [(record: LeaseRecord, other: LeaseRecord) => ({ ...record, lease_key: other.lease_key }), "another lease's leaseKey"],
    [(record: LeaseRecord, other: LeaseRecord) => ({ ...record, vault_key_lease_wrapped: other.vault_key_lease_wrapped }), "another lease's wrapped vaultKey"],
  ] as const

  for (const [tamper, blurb] of TamperCases) {
    it(`with ${blurb} locks the vault at its first seal or unseal`, async () => {
      const { friend, lease } = await grantedWorld()
      const stamp = sealStampOf('b1')
      const sealed = await lease.sealWith(WhisperText, stamp)
      const other = await grantedWorld()
      friend.cached = tamper(friend.cached as LeaseRecord, other.friend.cached as LeaseRecord)
      const got = await Lease.buildFromCache(friend, GrantedAs.gate_epoch)
      expect(got).to.be.instanceOf(Lease)
      await TH.expectRefusal(got!.unsealWith(sealed, stamp), 'damaged_lease')
      expect(friend.lock).toHaveBeenCalledTimes(1)
      expect(got!.isGranted).to.be.false
      expect(friend.forgetLease).not.toHaveBeenCalled()
      await TH.expectRefusal(got!.sealWith(WhisperText, stamp), 'vault_locked')
      expect(friend.lock).toHaveBeenCalledTimes(1)
    })
  }

  it("refuses to seal once its gate_epoch is changed to the epoch asked for", async () => {
    const { friend } = await grantedWorld()
    friend.cached = { ...(friend.cached as LeaseRecord), gate_epoch: 2 }
    const got = await Lease.buildFromCache(friend, 2)
    const stamp = sealStampOf('b1')
    await TH.expectRefusal(got!.sealWith(WhisperText, stamp), 'damaged_lease')
  })

  it("refuses a damaged lease, quoting none of the record", async () => {
    const { friend } = await grantedWorld()
    friend.cached = { ...(friend.cached as LeaseRecord), proved_at: T0 + 1 }
    const got = await Lease.buildFromCache(friend, GrantedAs.gate_epoch)
    const stamp = sealStampOf('b1')
    const err = await TH.expectRefusal(got!.sealWith(WhisperText, stamp), 'damaged_lease')
    expect(TH.thrownText(err)).to.not.include((friend.cached as LeaseRecord).vault_key_lease_wrapped.ciphertext_b64)
  })
})

describe("what a lease shows", () => {
  it("Object.keys shows its stamp alone: no leaseKey, no wrapped vaultKey, no friend", async () => {
    const { lease } = await grantedWorld()
    expect(Object.keys(lease)).to.have.members(StampFieldnames)
  })

  it("JSON.stringify and toJSON give its stamp alone", async () => {
    const { friend, lease } = await grantedWorld()
    expect(TH.jsonOf(lease)).to.deep.equal(Stamped)
    expect(lease.toJSON()).to.deep.equal(TH.jsonOf(lease))
    expect(JSON.stringify(lease)).to.not.include((friend.cached as LeaseRecord).vault_key_lease_wrapped.ciphertext_b64)
  })

  it("is frozen: its stamp cannot be changed", async () => {
    const { lease } = await grantedWorld()
    expect(Object.isFrozen(lease)).to.be.true
    expect(() => { (lease as { proved_at: number }).proved_at = T0 + 1 }).to.throw(TypeError)
  })
})
