import { describe, expect, it, vi } from 'vitest'
import { FarFuture, MaxTimerMillis } from '../../src/consts'
import { makeLeaseKey, makeVaultKey } from '../../src/crypto'
import { VaultError } from '../../src/errors'
import { Lease } from '../../src/models/lease'
import { type LeaseGrantOpts, type LeaseRecord, LeaseFormat } from '../../src/models/models-shapes'
import { bad } from '../../src/outcome'
import { isLeaseKey } from '../../src/shapes/device'
import * as TH from '../test-helpers'
import { type DuckVault, type FakeDBFriend, duckVaultOf, fakeDBFriendOf, makeGrantedLease, isZeroed, sealStampsOf, T0, useFakeClock, WeekMillis, WorldStamp } from '../test-helpers/proving-world'

useFakeClock()

const StampFieldnames = ['fmt', 'applabel', 'user_id', 'vaultlabel', 'vault_tok', 'registered_at', 'autolock_at']

/** A whisper's serialized bytes, fresh each call: a test checks they are zeroed. */
const whisperBytesOf = (text = '{"val":"sk-test-0000"}'): Uint8Array => new TextEncoder().encode(text)

const textOf = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)

const grantedWorld = async (opts?: LeaseGrantOpts): Promise<{ vault: DuckVault, friend: FakeDBFriend, lease: Lease }> => {
  const vault = duckVaultOf()
  const friend = fakeDBFriendOf()
  const lease = await makeGrantedLease(vault, friend, opts)
  return { vault, friend, lease }
}

describe("Lease.grant(vault, dbfriend, vaultKey, opts)", () => {
  it("keeps a lease record of the vault through tryPutLease: fmt 7001, the vault's stamp, autolock_at leaseMillis from now, a leaseKey handle and the wrapped vaultKey", async () => {
    const { friend } = await grantedWorld()
    expect(friend.tryPutLease).toHaveBeenCalledTimes(1)
    const record = friend.cached as LeaseRecord
    expect(record).to.deep.include({ ...WorldStamp, fmt: LeaseFormat, autolock_at: T0 + WeekMillis })
    expect(Object.keys(record)).to.have.members([...StampFieldnames, 'lease_key', 'vault_key_lease_wrapped'])
    expect(Object.keys(record.vault_key_lease_wrapped)).to.have.members(['cipher_iv_b64', 'ciphertext_b64'])
  })

  it("makes its leaseKey non-extractable, usable only to wrap and unwrap (G4)", async () => {
    const { friend } = await grantedWorld()
    const { lease_key } = friend.cached as LeaseRecord
    expect(isLeaseKey(lease_key)).to.be.true
    expect(lease_key.extractable).to.be.false
  })

  it("shows the record's stamp as the lease's own props, and is in force", async () => {
    const { lease } = await grantedWorld()
    expect(lease).to.deep.include({ ...WorldStamp, fmt: LeaseFormat, autolock_at: T0 + WeekMillis })
    expect(lease.isInForce).to.be.true
    expect(lease.isForgotten).to.be.false
  })

  it("autolocks at FarFuture for leaseMillis Infinity, and arms no timer for it", async () => {
    const { lease } = await grantedWorld({ leaseMillis: Infinity })
    expect(lease.autolock_at).to.eq(FarFuture)
    expect(vi.getTimerCount()).to.eq(0)
    expect(lease.isInForce).to.be.true
  })

  it("warns, rather than throws, when tryPutLease is refused, and the lease it hands back still seals", async () => {
    const vault = duckVaultOf()
    const friend = fakeDBFriendOf()
    friend.tryPutLease.mockResolvedValueOnce(bad(new VaultError('unexpected_error', 'the disk is full')))
    const lease = await makeGrantedLease(vault, friend)
    expect(friend.logged.map(({ level, story }) => [level, story])).to.deep.equal([['warn', { call: 'Lease.grant', refusalkind: 'unexpected_error' }]])
    const { boxKeyStamp, whisperStamp } = sealStampsOf('b1')
    await lease.sealWith(whisperBytesOf(), boxKeyStamp, whisperStamp)
  })

  const GrantRefusalCases = [
    [() => ({ vaultKey: makeLeaseKey() }),                                  'refuses a vaultKey that is not extractable'],
    [() => ({ vaultKey: 'a vault key' }),                                   'refuses a vaultKey that is no CryptoKey'],
    [() => ({ opts: { leaseMillis: 0 } }),                                  'refuses leaseMillis 0'],
    [() => ({ opts: { leaseMillis: -1000 } }),                              'refuses a negative leaseMillis'],
    [() => ({ opts: { leaseMillis: 1.5 } }),                                'refuses a leaseMillis that is not whole'],
    [() => ({ opts: {} }),                                                  'refuses opts with no leaseMillis'],
    [() => ({ vault: { ...duckVaultOf(), lock: undefined } }),              'refuses a vault with no lock()'],
    [() => ({ vault: { ...duckVaultOf(), vault_tok: undefined } }),         'refuses a vault with no vault_tok'],
    [() => ({ dbfriend: { ...fakeDBFriendOf(), tryDelLease: undefined } }), 'refuses a dbfriend with no tryDelLease'],
    [() => ({ dbfriend: { ...fakeDBFriendOf(), logger: undefined } }),      'refuses a dbfriend with no logger'],
  ] as const

  for (const [argsOf, blurb] of GrantRefusalCases) {
    it(`${blurb}, as 'bad_option', and keeps nothing`, async () => {
      const friend = fakeDBFriendOf()
      const { vault = duckVaultOf(), dbfriend = friend, vaultKey = makeVaultKey(), opts = { leaseMillis: WeekMillis } } = argsOf() as Record<string, unknown>
      const handed = await (vaultKey as Promise<unknown>)
      await TH.expectRefusal(Lease.grant(vault as DuckVault, dbfriend as FakeDBFriend, handed as CryptoKey, opts as LeaseGrantOpts), 'bad_option')
      expect(friend.tryPutLease).not.toHaveBeenCalled()
    })
  }
})

describe("Lease.get(vault, dbfriend) and Lease.tryGet", () => {
  it("answers null when the device keeps no lease", async () => {
    expect(await Lease.get(duckVaultOf(), fakeDBFriendOf())).to.be.null
  })

  it("answers the cached lease of this vault, which opens what the granted lease sealed", async () => {
    const { friend, lease: granted } = await grantedWorld()
    const { boxKeyStamp, whisperStamp } = sealStampsOf('b1')
    const sealed = await granted.sealWith(whisperBytesOf('{"val":"kept"}'), boxKeyStamp, whisperStamp)
    const got = await Lease.get(duckVaultOf(), friend)
    expect(got?.toJSON()).to.deep.equal(granted.toJSON())
    expect(textOf(await got!.unsealWith(sealed, boxKeyStamp, whisperStamp))).to.eq('{"val":"kept"}')
  })

  it("tryGet answers the lease as a good Outcome", async () => {
    const { friend } = await grantedWorld()
    const got = await TH.expectGood(Lease.tryGet(duckVaultOf(), friend))
    expect(got).to.be.instanceOf(Lease)
  })

  it("throws the refusal of tryGetLease; tryGet answers it as a bad Outcome", async () => {
    const friend = fakeDBFriendOf()
    const refusal = new VaultError('unexpected_error', 'the store is down')
    friend.tryGetLease.mockResolvedValue(bad(refusal))
    const thrown = await TH.expectRefusal(Lease.get(duckVaultOf(), friend), 'unexpected_error')
    expect(thrown).to.equal(refusal)
    const answered = await TH.expectBad(Lease.tryGet(duckVaultOf(), friend), 'unexpected_error')
    expect(answered).to.equal(refusal)
  })

  it("tryGet answers a bad Outcome, never a rejection, for a dbfriend its check refuses", async () => {
    await TH.expectBad(Lease.tryGet(duckVaultOf(), { ...fakeDBFriendOf(), tryGetLease: undefined } as unknown as FakeDBFriend), 'bad_option')
  })

  const NotThisVaultCases = [
    [{ vault_tok: 'vault-tok-other' },   'another life of the vault, by its vault_tok'],
    [{ registered_at: T0 + 1 },          'another life of the vault, by its registered_at'],
    [{ user_id: 'u2' },                  "another user's vault"],
    [{ vaultlabel: 'work' },             'another vault of the same user'],
  ] as const

  for (const [stamp, blurb] of NotThisVaultCases) {
    it(`reads a cached lease of ${blurb} as none, with a warning, and leaves it where it lies`, async () => {
      const friend = fakeDBFriendOf()
      await makeGrantedLease(duckVaultOf(stamp), friend)
      const { cached } = friend
      expect(await Lease.get(duckVaultOf(), friend)).to.be.null
      expect(friend.logged.map(({ level, story }) => [level, story])).to.deep.equal([['warn', { call: 'Lease.get' }]])
      expect(friend.cached).to.equal(cached)
      expect(friend.tryDelLease).not.toHaveBeenCalled()
    })
  }

  it("warns of a lease of another vault quoting none of its record: neither its ciphertext nor its stamp", async () => {
    const friend = fakeDBFriendOf()
    await makeGrantedLease(duckVaultOf({ vault_tok: 'vault-tok-SIBLING' }), friend)
    const { vault_key_lease_wrapped } = friend.cached as LeaseRecord
    await Lease.get(duckVaultOf(), friend)
    const logged = TH.loggedText(friend.logged)
    expect(logged).to.not.include(vault_key_lease_wrapped.ciphertext_b64)
    expect(logged).to.not.include('vault-tok-SIBLING')
  })

  const MalformedCases = [
    [(record: LeaseRecord, extractableVaultKey: CryptoKey) => ({ ...record, lease_key: extractableVaultKey }), 'whose leaseKey is extractable (G4)'],
    [(record: LeaseRecord) => ({ ...record, fmt: 7000 }),                          'of another fmt'],
    [(record: LeaseRecord) => ({ ...record, vault_key_lease_wrapped: undefined }), 'with no wrapped vaultKey'],
    [(record: LeaseRecord) => ({ ...record, extra: 'field' }),                     'with a field no lease has'],
    [() => 'a lease',                                                              'that is no record at all'],
  ] as const

  for (const [tamper, blurb] of MalformedCases) {
    it(`reads a cached record ${blurb} as none, with a warning`, async () => {
      const { friend } = await grantedWorld()
      friend.cached = tamper(friend.cached as LeaseRecord, await makeVaultKey())
      expect(await Lease.get(duckVaultOf(), friend)).to.be.null
      expect(friend.logged.map(({ level }) => level)).to.deep.equal(['warn'])
    })
  }

  it("answers null for a cached lease whose autolock_at has passed, erasing its record once and locking nothing", async () => {
    const friend = fakeDBFriendOf()
    await makeGrantedLease(duckVaultOf(), friend)
    vi.setSystemTime(T0 + (2 * WeekMillis))
    const vault = duckVaultOf()
    expect(await Lease.get(vault, friend)).to.be.null
    expect(friend.tryDelLease).toHaveBeenCalledTimes(1)
    expect(friend.cached).to.be.null
    expect(vault.lock).not.toHaveBeenCalled()
  })
})

describe("lease.forget(), isForgotten and isInForce", () => {
  it("erases the cached record through tryDelLease, disposes the autolock, and leaves the lease forgotten and not in force", async () => {
    const { friend, lease } = await grantedWorld()
    expect(vi.getTimerCount()).to.eq(1)
    await lease.forget()
    expect(friend.tryDelLease).toHaveBeenCalledTimes(1)
    expect(friend.cached).to.be.null
    expect(vi.getTimerCount()).to.eq(0)
    expect(lease.isForgotten).to.be.true
    expect(lease.isInForce).to.be.false
  })

  it("is idempotent: a second forget erases nothing more", async () => {
    const { friend, lease } = await grantedWorld()
    await lease.forget()
    await lease.forget()
    expect(friend.tryDelLease).toHaveBeenCalledTimes(1)
  })

  it("throws the refusal of tryDelLease", async () => {
    const { friend, lease } = await grantedWorld()
    friend.tryDelLease.mockResolvedValueOnce(bad(new VaultError('unexpected_error', 'the store is down')))
    await TH.expectRefusal(lease.forget(), 'unexpected_error')
  })

  it("refuses sealWith and unsealWith once forgotten, as 'vault_locked', and still zeroes the whisper bytes", async () => {
    const { lease } = await grantedWorld()
    const { boxKeyStamp, whisperStamp } = sealStampsOf('b1')
    const sealed = await lease.sealWith(whisperBytesOf(), boxKeyStamp, whisperStamp)
    await lease.forget()
    const bytes = whisperBytesOf()
    await TH.expectRefusal(lease.sealWith(bytes, boxKeyStamp, whisperStamp), 'vault_locked')
    expect(isZeroed(bytes)).to.be.true
    await TH.expectRefusal(lease.unsealWith(sealed, boxKeyStamp, whisperStamp), 'vault_locked')
  })

  it("is not in force once the clock passes autolock_at, though its timer has yet to fire", async () => {
    const { lease } = await grantedWorld()
    vi.setSystemTime(T0 + WeekMillis)
    expect(lease.isInForce).to.be.false
    expect(lease.isForgotten).to.be.false
  })

  it("refuses sealWith and unsealWith as 'vault_locked' once the clock passes autolock_at, though its timer has yet to fire", async () => {
    const { lease } = await grantedWorld()
    const { boxKeyStamp, whisperStamp } = sealStampsOf('b1')
    const sealed = await lease.sealWith(whisperBytesOf(), boxKeyStamp, whisperStamp)
    vi.setSystemTime(T0 + WeekMillis + 1)
    await TH.expectRefusal(lease.sealWith(whisperBytesOf(), boxKeyStamp, whisperStamp), 'vault_locked')
    await TH.expectRefusal(lease.unsealWith(sealed, boxKeyStamp, whisperStamp), 'vault_locked')
  })
})

describe("the autolock", () => {
  it("does nothing a moment before autolock_at", async () => {
    const { vault, friend, lease } = await grantedWorld()
    await vi.advanceTimersByTimeAsync(WeekMillis - 1)
    expect(vault.lock).not.toHaveBeenCalled()
    expect(friend.tryDelLease).not.toHaveBeenCalled()
    expect(lease.isInForce).to.be.true
  })

  it("at autolock_at locks the vault, then lets the lease go, erasing nothing itself: the vault's lock() erases the cached record", async () => {
    const { vault, friend, lease } = await grantedWorld()
    await vi.advanceTimersByTimeAsync(WeekMillis)
    expect(vault.lock).toHaveBeenCalledTimes(1)
    expect(friend.tryDelLease).not.toHaveBeenCalled()
    expect(lease.isForgotten).to.be.true
    expect(vi.getTimerCount()).to.eq(0)
  })

  it("warns when the vault.lock() it launches throws, quoting only the refusalkind", async () => {
    const { vault, friend } = await grantedWorld()
    vault.lock.mockImplementationOnce(() => { throw new VaultError('unexpected_error', 'the store is down') })
    await vi.advanceTimersByTimeAsync(WeekMillis)
    expect(friend.logged.map(({ level, story }) => [level, story])).to.deep.equal([['warn', { call: 'Lease.autolock', refusalkind: 'unexpected_error' }]])
  })

  it("fires once only, however far the clock then runs", async () => {
    const { vault } = await grantedWorld()
    await vi.advanceTimersByTimeAsync(WeekMillis * 3)
    expect(vault.lock).toHaveBeenCalledTimes(1)
  })

  it("notes/wontfix.md:44, 'no autolock timer past the Trigger's cap': a lease longer than MaxTimerMillis arms no timer, so a day past its autolock_at it has locked nothing, yet refuses its seal 'vault_locked'", async () => {
    const leaseMillis = MaxTimerMillis + WeekMillis
    const { vault, lease } = await grantedWorld({ leaseMillis })
    expect(vi.getTimerCount()).to.eq(0)
    await vi.advanceTimersByTimeAsync(leaseMillis + (24 * 3_600_000))
    expect(vault.lock).not.toHaveBeenCalled()
    expect(lease.isForgotten).to.be.false
    const { boxKeyStamp, whisperStamp } = sealStampsOf('b1')
    await TH.expectRefusal(lease.sealWith(whisperBytesOf(), boxKeyStamp, whisperStamp), 'vault_locked')
  })
})

describe("lease.sealWith(serializedWhisper, boxKeyStamp, whisperStamp) and unsealWith", () => {
  it("round-trips a whisper's bytes under the same two stamps", async () => {
    const { lease } = await grantedWorld()
    const { boxKeyStamp, whisperStamp } = sealStampsOf('b1')
    const sealed = await lease.sealWith(whisperBytesOf('{"val":"sk-test-1234"}'), boxKeyStamp, whisperStamp)
    expect(Object.keys(sealed)).to.have.members(['box_key_wrapped', 'whisper_ciphered'])
    expect(textOf(await lease.unsealWith(sealed, boxKeyStamp, whisperStamp))).to.eq('{"val":"sk-test-1234"}')
  })

  it("zeroes the whisper bytes it was handed once sealed", async () => {
    const { lease } = await grantedWorld()
    const bytes = whisperBytesOf()
    const { boxKeyStamp, whisperStamp } = sealStampsOf('b1')
    await lease.sealWith(bytes, boxKeyStamp, whisperStamp)
    expect(isZeroed(bytes)).to.be.true
  })

  it("seals the same whisper under the same stamps differently each time: a fresh boxKey and cipherIv", async () => {
    const { lease } = await grantedWorld()
    const { boxKeyStamp, whisperStamp } = sealStampsOf('b1')
    const first  = await lease.sealWith(whisperBytesOf(), boxKeyStamp, whisperStamp)
    const second = await lease.sealWith(whisperBytesOf(), boxKeyStamp, whisperStamp)
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
    it(`refuses ${blurb} for either stamp as 'bad_option', and still zeroes the whisper bytes`, async () => {
      const { lease } = await grantedWorld()
      const { boxKeyStamp, whisperStamp } = sealStampsOf('b1')
      const asBoxKeyStamp = whisperBytesOf()
      await TH.expectRefusal(lease.sealWith(asBoxKeyStamp, stamp as never, whisperStamp), 'bad_option')
      expect(isZeroed(asBoxKeyStamp)).to.be.true
      const asWhisperStamp = whisperBytesOf()
      await TH.expectRefusal(lease.sealWith(asWhisperStamp, boxKeyStamp, stamp as never), 'bad_option')
      expect(isZeroed(asWhisperStamp)).to.be.true
    })
  }

  it("refuses a whisper that is not bytes as 'bad_option'", async () => {
    const { lease } = await grantedWorld()
    const { boxKeyStamp, whisperStamp } = sealStampsOf('b1')
    await TH.expectRefusal(lease.sealWith('{"val":"sk-test-0000"}' as never, boxKeyStamp, whisperStamp), 'bad_option')
  })

  const WrongStampCases = [
    [{ boxKeyStamp: sealStampsOf('b2').boxKeyStamp },                        "another box's boxKey stamp"],
    [{ whisperStamp: sealStampsOf('b1', { revision_seq: 2 }).whisperStamp }, "another revision's whisper stamp"],
    [{ boxKeyStamp: sealStampsOf('b1').whisperStamp, whisperStamp: sealStampsOf('b1').boxKeyStamp }, 'the two stamps swapped'],
  ] as const

  for (const [wrong, blurb] of WrongStampCases) {
    it(`refuses to open under ${blurb}, as 'damaged_box', and locks nothing`, async () => {
      const { vault, lease } = await grantedWorld()
      const right = sealStampsOf('b1')
      const sealed = await lease.sealWith(whisperBytesOf(), right.boxKeyStamp, right.whisperStamp)
      const { boxKeyStamp, whisperStamp } = { ...right, ...wrong }
      await TH.expectRefusal(lease.unsealWith(sealed, boxKeyStamp, whisperStamp), 'damaged_box')
      expect(vault.lock).not.toHaveBeenCalled()
    })
  }

  it("refuses to open the box key and whisper of one box laid under another's: 'damaged_box'", async () => {
    const { lease } = await grantedWorld()
    const one = sealStampsOf('b1')
    const two = sealStampsOf('b2')
    const sealedOne = await lease.sealWith(whisperBytesOf(), one.boxKeyStamp, one.whisperStamp)
    const sealedTwo = await lease.sealWith(whisperBytesOf(), two.boxKeyStamp, two.whisperStamp)
    await TH.expectRefusal(lease.unsealWith({ box_key_wrapped: sealedOne.box_key_wrapped, whisper_ciphered: sealedTwo.whisper_ciphered }, two.boxKeyStamp, two.whisperStamp), 'damaged_box')
  })

  it("refuses to open what another vault sealed under the same box stamps, as 'damaged_box'", async () => {
    const { lease } = await grantedWorld()
    const other = await makeGrantedLease(duckVaultOf({ vault_tok: 'vault-tok-other' }), fakeDBFriendOf())
    const { boxKeyStamp, whisperStamp } = sealStampsOf('b1')
    const sealed = await other.sealWith(whisperBytesOf(), boxKeyStamp, whisperStamp)
    await TH.expectRefusal(lease.unsealWith(sealed, boxKeyStamp, whisperStamp), 'damaged_box')
  })

  it("refuses tampered ciphertext as 'damaged_box', quoting none of it", async () => {
    const { lease } = await grantedWorld()
    const { boxKeyStamp, whisperStamp } = sealStampsOf('b1')
    const sealed = await lease.sealWith(whisperBytesOf(), boxKeyStamp, whisperStamp)
    const tampered = { ...sealed, whisper_ciphered: { ...sealed.whisper_ciphered, ciphertext_b64: TH.tweakB64(sealed.whisper_ciphered.ciphertext_b64) } }
    const err = await TH.expectRefusal(lease.unsealWith(tampered, boxKeyStamp, whisperStamp), 'damaged_box')
    expect(TH.thrownText(err)).to.not.include(tampered.whisper_ciphered.ciphertext_b64)
  })

  it("refuses sealed parts that are no ciphered bags as 'bad_option'", async () => {
    const { lease } = await grantedWorld()
    const { boxKeyStamp, whisperStamp } = sealStampsOf('b1')
    await TH.expectRefusal(lease.unsealWith({ box_key_wrapped: 'wrapped' } as never, boxKeyStamp, whisperStamp), 'bad_option')
  })
})

describe("a tampered lease record", () => {
  const TamperCases = [
    [(record: LeaseRecord) => ({ ...record, autolock_at: record.autolock_at + WeekMillis }),   'its autolock_at pushed a week later'],
    [(record: LeaseRecord, other: LeaseRecord) => ({ ...record, lease_key: other.lease_key }), "another lease's leaseKey"],
    [(record: LeaseRecord, other: LeaseRecord) => ({ ...record, vault_key_lease_wrapped: other.vault_key_lease_wrapped }), "another lease's wrapped vaultKey"],
  ] as const

  for (const [tamper, blurb] of TamperCases) {
    it(`reads as a lease, but with ${blurb} its first seal or unseal locks the vault, refuses 'damaged_lease' and lets the lease go, erasing nothing itself, so the next refuses 'vault_locked'`, async () => {
      const { friend, lease } = await grantedWorld()
      const { boxKeyStamp, whisperStamp } = sealStampsOf('b1')
      const sealed = await lease.sealWith(whisperBytesOf(), boxKeyStamp, whisperStamp)
      const otherFriend = fakeDBFriendOf()
      await makeGrantedLease(duckVaultOf(), otherFriend)
      friend.cached = tamper(friend.cached as LeaseRecord, otherFriend.cached as LeaseRecord)
      const vault = duckVaultOf()
      const got = await Lease.get(vault, friend)
      expect(got).to.be.instanceOf(Lease)
      await TH.expectRefusal(got!.unsealWith(sealed, boxKeyStamp, whisperStamp), 'damaged_lease')
      expect(vault.lock).toHaveBeenCalledTimes(1)
      expect(got!.isForgotten).to.be.true
      expect(friend.tryDelLease).not.toHaveBeenCalled()
      const bytes = whisperBytesOf()
      await TH.expectRefusal(got!.sealWith(bytes, boxKeyStamp, whisperStamp), 'vault_locked')
      expect(isZeroed(bytes)).to.be.true
      expect(vault.lock).toHaveBeenCalledTimes(1)
    })
  }

  it("refuses 'damaged_lease' quoting none of the record", async () => {
    const { friend } = await grantedWorld()
    friend.cached = { ...(friend.cached as LeaseRecord), autolock_at: T0 + (2 * WeekMillis) }
    const got = await Lease.get(duckVaultOf(), friend)
    const { boxKeyStamp, whisperStamp } = sealStampsOf('b1')
    const err = await TH.expectRefusal(got!.sealWith(whisperBytesOf(), boxKeyStamp, whisperStamp), 'damaged_lease')
    expect(TH.thrownText(err)).to.not.include((friend.cached as LeaseRecord).vault_key_lease_wrapped.ciphertext_b64)
  })
})

describe("what a lease shows", () => {
  it("Object.keys shows its stamp alone: no leaseKey, no wrapped vaultKey, no vault, no dbfriend", async () => {
    const { lease } = await grantedWorld()
    expect(Object.keys(lease)).to.have.members(StampFieldnames)
  })

  it("JSON.stringify and toJSON give its stamp alone", async () => {
    const { friend, lease } = await grantedWorld()
    expect(TH.jsonOf(lease)).to.deep.equal({ ...WorldStamp, fmt: LeaseFormat, autolock_at: T0 + WeekMillis })
    expect(lease.toJSON()).to.deep.equal(TH.jsonOf(lease))
    expect(JSON.stringify(lease)).to.not.include((friend.cached as LeaseRecord).vault_key_lease_wrapped.ciphertext_b64)
  })

  it("is frozen: its stamp cannot be changed", async () => {
    const { lease } = await grantedWorld()
    expect(Object.isFrozen(lease)).to.be.true
    expect(() => { (lease as { autolock_at: number }).autolock_at = FarFuture }).to.throw(TypeError)
  })
})
