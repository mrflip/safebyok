import { describe, expect, it, vi } from 'vitest'
import { makeLeaseKey, makeVaultKey } from '../../src/helpers/crypto'
import { VaultError } from '../../src/refusals/errors'
import { Lease } from '../../src/models/lease'
import { type LeaseGrantOpts, type LeaseRecord, LeaseFormat, isLeaseKey } from '../../src/shapes/shapes-gateish'
import { bad } from '../../src/refusals/outcome'
import * as TH from '../test-helpers'
import { type FakeLeaseFriend, FriendLeaseMillis, GrantedAs, fakeLeaseFriendOf, makeGrantedLease, sealStampOf, T0, useFakeClock, WorldStamp } from '../test-helpers/proving-world'

useFakeClock()

const StampFieldnames = ['fmt', 'applabel', 'user_id', 'vaultlabel', 'vault_tok', 'registered_at', 'gate_epoch', 'proved_at', 'wayinkind']

const Stamped = { ...WorldStamp, fmt: LeaseFormat, proved_at: T0, ...GrantedAs }

const WhisperText = '{"val":"sk-test-0000"}'

/** A lease granted and cached, beside the friend that hears it. */
const grantedWorld = async (opts?: LeaseGrantOpts): Promise<{ friend: FakeLeaseFriend, lease: Lease }> => {
  const friend = fakeLeaseFriendOf()
  const lease = await makeGrantedLease(friend, opts)
  await lease.cache()
  return { friend, lease }
}

describe("Lease.buildGranted(friend, vaultKey, opts)", () => {
  it("makes a record of the vault: fmt 7001, the vault's stamp, the epoch, proved_at and wayinkind, a leaseKey handle and the wrapped vaultKey", async () => {
    const { friend } = await grantedWorld({ gate_epoch: 3, wayinkind: 'passkey' })
    const record = friend.cached as LeaseRecord
    expect(record).to.deep.include({ ...WorldStamp, fmt: LeaseFormat, gate_epoch: 3, proved_at: T0, wayinkind: 'passkey' })
    expect(Object.keys(record)).to.have.members([...StampFieldnames, 'lease_key', 'vault_key_lease_wrapped'])
    expect(Object.keys(record.vault_key_lease_wrapped)).to.have.members(['cipher_iv_b64', 'ciphertext_b64'])
  })

  it("caches nothing of itself: a lease is cached by tryCache", async () => {
    const friend = fakeLeaseFriendOf()
    await makeGrantedLease(friend)
    expect(friend.tryCacheLease).not.toHaveBeenCalled()
    expect(friend.cached).to.be.null
  })

  it("makes its leaseKey non-extractable, usable only to wrap and unwrap (G4)", async () => {
    const { friend } = await grantedWorld()
    const { lease_key } = friend.cached as LeaseRecord
    expect(isLeaseKey(lease_key)).to.be.true
    expect(lease_key.extractable).to.be.false
  })

  it("shows the record's stamp as the lease's own props, and is in force", async () => {
    const { lease } = await grantedWorld()
    expect(lease).to.deep.include(Stamped)
    expect(lease.isInForce).to.be.true
    expect(lease.isForgotten).to.be.false
  })

  const GrantRefusalCases = [
    [() => ({ vaultKey: makeLeaseKey() }),                                        'refuses a vaultKey that is not extractable'],
    [() => ({ vaultKey: 'a vault key' }),                                         'refuses a vaultKey that is no CryptoKey'],
    [() => ({ opts: { ...GrantedAs, gate_epoch: 0 } }),                           'refuses gate_epoch 0'],
    [() => ({ opts: { ...GrantedAs, gate_epoch: 1.5 } }),                         'refuses a gate_epoch that is not whole'],
    [() => ({ opts: { ...GrantedAs, wayinkind: 'carrier pigeon' } }),             'refuses a kind of proving there is none of'],
    [() => ({ opts: {} }),                                                        'refuses opts with neither'],
    [() => ({ friend: { ...fakeLeaseFriendOf(), lock: undefined } }),             'refuses a friend with no lock'],
    [() => ({ friend: { ...fakeLeaseFriendOf(), vault_tok: undefined } }),        'refuses a friend with no vault_tok'],
    [() => ({ friend: { ...fakeLeaseFriendOf(), tryUncacheLease: undefined } }),  'refuses a friend with no tryUncacheLease'],
    [() => ({ friend: { ...fakeLeaseFriendOf(), logger: undefined } }),           'refuses a friend with no logger'],
  ] as const

  for (const [argsOf, blurb] of GrantRefusalCases) {
    it(`${blurb}, as 'bad_option'`, async () => {
      const { friend = fakeLeaseFriendOf(), vaultKey = makeVaultKey(), opts = GrantedAs } = argsOf() as Record<string, unknown>
      const handed = await (vaultKey as Promise<unknown>)
      await TH.expectRefusal(Lease.buildGranted(friend as FakeLeaseFriend, handed as CryptoKey, opts as LeaseGrantOpts), 'bad_option')
    })
  }
})

describe("lease.cache() and lease.tryCache()", () => {
  it("puts the record through tryCacheLease", async () => {
    const friend = fakeLeaseFriendOf()
    const lease = await makeGrantedLease(friend)
    await lease.cache()
    expect(friend.tryCacheLease).toHaveBeenCalledTimes(1)
    expect(friend.cached).to.deep.include(Stamped)
  })

  it("has nothing to do for a lease built from the cache", async () => {
    const { friend } = await grantedWorld()
    friend.tryCacheLease.mockClear()
    const cached = await Lease.buildFromCache(friend, GrantedAs.gate_epoch)
    await cached!.cache()
    expect(friend.tryCacheLease).not.toHaveBeenCalled()
  })

  it("throws what tryCacheLease refuses, and leaves the lease in force; tryCache answers it as a bad Outcome", async () => {
    const friend = fakeLeaseFriendOf()
    const lease = await makeGrantedLease(friend)
    friend.tryCacheLease.mockResolvedValue(bad(new VaultError('unexpected_error', 'the disk is full')))
    await TH.expectRefusal(lease.cache(), 'unexpected_error')
    await TH.expectBad(lease.tryCache(), 'unexpected_error')
    expect(lease.isInForce).to.be.true
    await lease.sealWith(WhisperText, sealStampOf('b1'))
  })

  it("refuses 'vault_locked' once out of force, so nothing is cached", async () => {
    const friend = fakeLeaseFriendOf()
    const lease = await makeGrantedLease(friend)
    lease.evict()
    await TH.expectBad(lease.tryCache(), 'vault_locked')
    expect(friend.cached).to.be.null
  })
})

describe("Lease.buildFromCache(friend, gate_epoch)", () => {
  it("answers null when the device caches no lease", async () => {
    expect(await Lease.buildFromCache(fakeLeaseFriendOf(), GrantedAs.gate_epoch)).to.be.null
  })

  it("answers the cached lease of this vault and epoch, which opens what the granted lease sealed", async () => {
    const { friend, lease: granted } = await grantedWorld()
    const stamp = sealStampOf('b1')
    const sealed = await granted.sealWith('{"val":"cached"}', stamp)
    const got = await Lease.buildFromCache(friend, GrantedAs.gate_epoch)
    expect(got?.toJSON()).to.deep.equal(granted.toJSON())
    expect(await got!.unsealWith(sealed, stamp)).to.eq('{"val":"cached"}')
  })

  it("answers a lease proved exactly the autolock duration ago, which still opens what the granted lease sealed", async () => {
    const { friend, lease: granted } = await grantedWorld()
    const stamp = sealStampOf('b1')
    const sealed = await granted.sealWith('{"val":"cached"}', stamp)
    vi.setSystemTime(T0 + FriendLeaseMillis)
    const got = await Lease.buildFromCache(friend, GrantedAs.gate_epoch)
    expect(await got?.unsealWith(sealed, stamp)).to.eq('{"val":"cached"}')
    expect(friend.tryUncacheLease).not.toHaveBeenCalled()
  })

  it("answers null past autolock, so the vault asks for a proof, and leaves the row untouched, warning of nothing", async () => {
    const { friend } = await grantedWorld()
    const row = friend.cached
    vi.setSystemTime(T0 + FriendLeaseMillis + 1)
    expect(await Lease.buildFromCache(friend, GrantedAs.gate_epoch)).to.be.null
    expect(friend.tryUncacheLease).not.toHaveBeenCalled()
    expect(friend.cached).to.eq(row)
    expect(friend.logged).to.deep.equal([])
  })

  it("opens a row past autolock again once the clock is set back, as the row was left", async () => {
    const { friend } = await grantedWorld()
    vi.setSystemTime(T0 + FriendLeaseMillis + 1)
    expect(await Lease.buildFromCache(friend, GrantedAs.gate_epoch)).to.be.null
    vi.setSystemTime(T0)
    const got = await Lease.buildFromCache(friend, GrantedAs.gate_epoch)
    expect(got?.isInForce).to.be.true
  })

  it("uncaches a row of another epoch even past autolock: the epoch is judged first", async () => {
    const { friend } = await grantedWorld()
    vi.setSystemTime(T0 + FriendLeaseMillis + 1)
    expect(await Lease.buildFromCache(friend, GrantedAs.gate_epoch + 1)).to.be.null
    expect(friend.tryUncacheLease).toHaveBeenCalledTimes(1)
    expect(friend.cached).to.be.null
  })

  it("throws a clock that throws, as a bug, and uncaches nothing", async () => {
    const { friend } = await grantedWorld()
    await expect(Lease.buildFromCache({ ...friend, clock: { now: () => { throw new Error('the clock broke') } } }, GrantedAs.gate_epoch)).rejects.toThrow('the clock broke')
    expect(friend.tryUncacheLease).not.toHaveBeenCalled()
  })

  it("finds nothing past an autolock of Infinity: a lease cached long ago is in force", async () => {
    const friend = fakeLeaseFriendOf({ leaseMillis: Infinity })
    const lease = await makeGrantedLease(friend)
    await lease.cache()
    vi.setSystemTime(T0 + (400 * 24 * 60 * 60_000))
    const got = await Lease.buildFromCache(friend, GrantedAs.gate_epoch)
    expect(got?.isInForce).to.be.true
  })

  it("tells a store's refusal as bad news, once, and answers null", async () => {
    const friend = fakeLeaseFriendOf()
    const refusal = new VaultError('unexpected_error', 'the store is down')
    friend.tryPeekLease.mockResolvedValue(bad(refusal))
    expect(await Lease.buildFromCache(friend, GrantedAs.gate_epoch)).to.be.null
    expect(friend.tellBadNews).toHaveBeenCalledExactlyOnceWith([refusal])
    expect(friend.tryUncacheLease).not.toHaveBeenCalled()
  })

  it("refuses 'bad_option' a friend its check refuses, where it tells no bad news", async () => {
    const friend = { ...fakeLeaseFriendOf(), tryPeekLease: undefined } as unknown as FakeLeaseFriend
    await TH.expectRefusal(Lease.buildFromCache(friend, GrantedAs.gate_epoch), 'bad_option')
    expect(friend.tellBadNews).not.toHaveBeenCalled()
  })

  const NotThisLeaseCases = [
    [{ vault_tok: 'vault-tok-other' }, GrantedAs.gate_epoch,     'another life of the vault, by its vault_tok'],
    [{ registered_at: T0 + 1 },        GrantedAs.gate_epoch,     'another life of the vault, by its registered_at'],
    [{ user_id: 'u2' },                GrantedAs.gate_epoch,     "another user's vault"],
    [{ vaultlabel: 'work' },           GrantedAs.gate_epoch,     'another vault of the same user'],
    [{},                               GrantedAs.gate_epoch + 1, 'another gate of this vault'],
  ] as const

  for (const [stamp, gate_epoch, blurb] of NotThisLeaseCases) {
    it(`forgets a cached lease of ${blurb}: it answers null and is uncached, so the vault asks for a proof`, async () => {
      const elsewhere = fakeLeaseFriendOf(stamp)
      const lease = await makeGrantedLease(elsewhere)
      await lease.cache()
      const friend = fakeLeaseFriendOf()
      friend.cached = elsewhere.cached
      expect(await Lease.buildFromCache(friend, gate_epoch)).to.be.null
      expect(friend.tryUncacheLease).toHaveBeenCalledTimes(1)
      expect(friend.cached).to.be.null
    })
  }

  it("warns of an uncache refused as it forgets, quoting only the refusalkind, and still answers null", async () => {
    const { friend } = await grantedWorld()
    friend.tryUncacheLease.mockResolvedValueOnce(bad(new VaultError('unexpected_error', 'the store is down')))
    expect(await Lease.buildFromCache(friend, GrantedAs.gate_epoch + 1)).to.be.null
    expect(friend.logged.map(({ level, story }) => [level, story])).to.deep.equal([['warn', { call: 'Lease.buildFromCache', refusalkind: 'unexpected_error' }]])
  })

  const MalformedCases = [
    [(record: LeaseRecord, extractableVaultKey: CryptoKey) => ({ ...record, lease_key: extractableVaultKey }), 'whose leaseKey is extractable (G4)'],
    [(record: LeaseRecord) => ({ ...record, fmt: 7000 }),                          'of another fmt'],
    [(record: LeaseRecord) => ({ ...record, vault_key_lease_wrapped: undefined }), 'with no wrapped vaultKey'],
    [(record: LeaseRecord) => ({ ...record, proved_at: undefined }),               'with no proved_at'],
    [(record: LeaseRecord) => ({ ...record, extra: 'field' }),                     'with a field no lease has'],
    [() => 'a lease',                                                              'that is no record at all'],
  ] as const

  for (const [tamper, blurb] of MalformedCases) {
    it(`tells a cached record ${blurb} as 'damaged_lease' bad news, quoting none of it, answers null and leaves it in place`, async () => {
      const { friend } = await grantedWorld()
      const { vault_key_lease_wrapped } = friend.cached as LeaseRecord
      const tampered = tamper(friend.cached as LeaseRecord, await makeVaultKey())
      friend.cached = tampered
      expect(await Lease.buildFromCache(friend, GrantedAs.gate_epoch)).to.be.null
      expect(friend.tellBadNews).toHaveBeenCalledOnce()
      const err = friend.tellBadNews.mock.calls[0]![0][0]!
      expect(err.refusalkind).to.eq('damaged_lease')
      expect(TH.thrownText(err)).to.not.include(vault_key_lease_wrapped.ciphertext_b64)
      expect(friend.cached).to.equal(tampered)
      expect(friend.tryUncacheLease).not.toHaveBeenCalled()
    })
  }
})

describe("lease.vacate(), lease.evict(), isForgotten and isInForce", () => {
  it("vacate uncaches the record and leaves the lease forgotten and out of force", async () => {
    const { friend, lease } = await grantedWorld()
    await lease.vacate()
    expect(friend.tryUncacheLease).toHaveBeenCalledTimes(1)
    expect(friend.cached).to.be.null
    expect(lease.isForgotten).to.be.true
    expect(lease.isInForce).to.be.false
  })

  it("is idempotent: a second vacate uncaches nothing more", async () => {
    const { friend, lease } = await grantedWorld()
    await lease.vacate()
    await lease.vacate()
    expect(friend.tryUncacheLease).toHaveBeenCalledTimes(1)
  })

  it("throws what tryUncacheLease refuses, the lease out of force all the same; tryVacate answers it as a bad Outcome", async () => {
    const { friend, lease } = await grantedWorld()
    friend.tryUncacheLease.mockResolvedValueOnce(bad(new VaultError('unexpected_error', 'the store is down')))
    await TH.expectRefusal(lease.vacate(), 'unexpected_error')
    expect(lease.isInForce).to.be.false
    const other = await grantedWorld()
    other.friend.tryUncacheLease.mockResolvedValueOnce(bad(new VaultError('unexpected_error', 'the store is down')))
    await TH.expectBad(other.lease.tryVacate(), 'unexpected_error')
    expect(other.lease.isInForce).to.be.false
  })

  it("Lease.uncache erases a record with no lease held, on each call, and starts before it answers, so erases land in call order", async () => {
    const friend = fakeLeaseFriendOf()
    friend.cached = 'a row of an earlier session'
    const uncaching = Lease.tryUncache(friend)
    expect(friend.tryUncacheLease).toHaveBeenCalledTimes(1)
    expect(friend.cached).to.be.null
    await TH.expectGood(uncaching)
    await Lease.uncache(friend)
    expect(friend.tryUncacheLease).toHaveBeenCalledTimes(2)
  })

  it("Lease.uncache throws what tryUncacheLease refuses; tryUncache answers it as a bad Outcome", async () => {
    const friend = fakeLeaseFriendOf()
    friend.tryUncacheLease.mockResolvedValueOnce(bad(new VaultError('unexpected_error', 'the store is down')))
    await TH.expectRefusal(Lease.uncache(friend), 'unexpected_error')
    friend.tryUncacheLease.mockResolvedValueOnce(bad(new VaultError('unexpected_error', 'the store is down')))
    await TH.expectBad(Lease.tryUncache(friend), 'unexpected_error')
  })

  it("Lease.uncache refuses 'bad_option' a friend its check refuses, uncaching nothing", async () => {
    const friend = { ...fakeLeaseFriendOf(), lock: undefined } as unknown as FakeLeaseFriend
    await TH.expectRefusal(Lease.uncache(friend), 'bad_option')
    expect(friend.tryUncacheLease).not.toHaveBeenCalled()
  })

  it("evict drops the keys and leaves the record cached", async () => {
    const { friend, lease } = await grantedWorld()
    lease.evict()
    expect(lease.isForgotten).to.be.true
    expect(friend.tryUncacheLease).not.toHaveBeenCalled()
    expect(friend.cached).to.not.be.null
  })

  it("refuses sealWith and unsealWith once vacated, as 'vault_locked'", async () => {
    const { lease } = await grantedWorld()
    const stamp = sealStampOf('b1')
    const sealed = await lease.sealWith(WhisperText, stamp)
    await lease.vacate()
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
    it(`refuses ${blurb} for the stamp as 'bad_option'`, async () => {
      const { lease } = await grantedWorld()
      await TH.expectRefusal(lease.sealWith(WhisperText, stamp as never), 'bad_option')
    })
  }

  it("refuses a whisper that is no string as 'bad_option'", async () => {
    const { lease } = await grantedWorld()
    await TH.expectRefusal(lease.sealWith(new TextEncoder().encode(WhisperText) as never, sealStampOf('b1')), 'bad_option')
  })

  const WrongStampCases = [
    [sealStampOf('b2'),                      "another box's stamp"],
    [sealStampOf('b1', { revision_seq: 2 }), "another revision's stamp"],
  ] as const

  for (const [wrong, blurb] of WrongStampCases) {
    it(`refuses to open under ${blurb}, as 'damaged_box', and locks nothing`, async () => {
      const { friend, lease } = await grantedWorld()
      const sealed = await lease.sealWith(WhisperText, sealStampOf('b1'))
      await TH.expectRefusal(lease.unsealWith(sealed, wrong), 'damaged_box')
      expect(friend.lock).not.toHaveBeenCalled()
    })
  }

  it("refuses to open the box key and whisper of one box laid under another's: 'damaged_box'", async () => {
    const { lease } = await grantedWorld()
    const sealedOne = await lease.sealWith(WhisperText, sealStampOf('b1'))
    const sealedTwo = await lease.sealWith(WhisperText, sealStampOf('b2'))
    await TH.expectRefusal(lease.unsealWith({ box_key_wrapped: sealedOne.box_key_wrapped, whisper_ciphered: sealedTwo.whisper_ciphered }, sealStampOf('b2')), 'damaged_box')
  })

  it("refuses to open what another vault sealed under the same box stamps, as 'damaged_box'", async () => {
    const { lease } = await grantedWorld()
    const other = await makeGrantedLease(fakeLeaseFriendOf({ vault_tok: 'vault-tok-other' }))
    const stamp = sealStampOf('b1')
    const sealed = await other.sealWith(WhisperText, stamp)
    await TH.expectRefusal(lease.unsealWith(sealed, stamp), 'damaged_box')
  })

  it("refuses tampered ciphertext as 'damaged_box', quoting none of it", async () => {
    const { lease } = await grantedWorld()
    const stamp = sealStampOf('b1')
    const sealed = await lease.sealWith(WhisperText, stamp)
    const tampered = { ...sealed, whisper_ciphered: { ...sealed.whisper_ciphered, ciphertext_b64: TH.tweakB64(sealed.whisper_ciphered.ciphertext_b64) } }
    const err = await TH.expectRefusal(lease.unsealWith(tampered, stamp), 'damaged_box')
    expect(TH.thrownText(err)).to.not.include(tampered.whisper_ciphered.ciphertext_b64)
  })

  it("refuses sealed parts that are no ciphered bags as 'bad_option'", async () => {
    const { lease } = await grantedWorld()
    const stamp = sealStampOf('b1')
    await TH.expectRefusal(lease.unsealWith({ box_key_wrapped: 'wrapped' } as never, stamp), 'bad_option')
  })
})

describe("a tampered lease record", () => {
  const TamperCases = [
    [(record: LeaseRecord) => ({ ...record, proved_at: record.proved_at + 1 }),                'its proved_at moved'],
    [(record: LeaseRecord) => ({ ...record, wayinkind: 'passkey' }),                           'its kind of proving changed'],
    [(record: LeaseRecord, other: LeaseRecord) => ({ ...record, lease_key: other.lease_key }), "another lease's leaseKey"],
    [(record: LeaseRecord, other: LeaseRecord) => ({ ...record, vault_key_lease_wrapped: other.vault_key_lease_wrapped }), "another lease's wrapped vaultKey"],
  ] as const

  for (const [tamper, blurb] of TamperCases) {
    it(`reads as a lease, but with ${blurb} its first seal or unseal locks the vault, refuses 'damaged_lease' and lets the lease go, uncaching nothing itself, so the next refuses 'vault_locked'`, async () => {
      const { friend, lease } = await grantedWorld()
      const stamp = sealStampOf('b1')
      const sealed = await lease.sealWith(WhisperText, stamp)
      const other = await grantedWorld()
      friend.cached = tamper(friend.cached as LeaseRecord, other.friend.cached as LeaseRecord)
      const got = await Lease.buildFromCache(friend, GrantedAs.gate_epoch)
      expect(got).to.be.instanceOf(Lease)
      await TH.expectRefusal(got!.unsealWith(sealed, stamp), 'damaged_lease')
      expect(friend.lock).toHaveBeenCalledTimes(1)
      expect(got!.isForgotten).to.be.true
      expect(friend.tryUncacheLease).not.toHaveBeenCalled()
      await TH.expectRefusal(got!.sealWith(WhisperText, stamp), 'vault_locked')
      expect(friend.lock).toHaveBeenCalledTimes(1)
    })
  }

  it("will not open once its gate_epoch is moved to the one asked: the epoch is bound by the wrap", async () => {
    const { friend } = await grantedWorld()
    friend.cached = { ...(friend.cached as LeaseRecord), gate_epoch: 2 }
    const got = await Lease.buildFromCache(friend, 2)
    const stamp = sealStampOf('b1')
    await TH.expectRefusal(got!.sealWith(WhisperText, stamp), 'damaged_lease')
  })

  it("refuses 'damaged_lease' quoting none of the record", async () => {
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
