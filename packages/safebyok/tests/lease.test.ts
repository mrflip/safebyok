import { describe, expect, it } from 'vitest'
import * as Z from 'zod/mini'
import { cipherCtx, makeBoxKey, makeVaultKey, unwrapKeyUnder, wrapKeyUnder } from '../src/crypto'
import { Lease, type LeaseVaultProps } from '../src/lease'
import { FarFuture, MinuteMillis, type LeaseRecord } from '../src/types'
import * as TH from './test-helpers'

const GrantedAt = Date.UTC(2026, 9, 19, 12)
const HourMillis = 60 * MinuteMillis
const LeaseMillis = 7 * 24 * HourMillis
const Deadline = GrantedAt + LeaseMillis

/** The vault props every lease here is granted under: u1's `main` vault, at unlock epoch 3. */
const vaultProps: LeaseVaultProps = { ...TH.scopeOf('u1'), vault_id: 'vault-id-u1', unlock_epoch: 3 }

/** A vaultKey, as a way in hands it over: here one extractable key in both roles. */
const vaultKeyPairOf = async () => {
  const vaultKey = await makeVaultKey()
  return { transientKey: vaultKey, sessionKey: vaultKey }
}

/** True when `candidate` is the same AES key as `vaultKey`: what one wraps, the other unwraps. */
const isSameKey = async (candidate: CryptoKey, vaultKey: CryptoKey): Promise<boolean> => {
  const ctx = cipherCtx('a test', 'of keys')
  const wrapped = await wrapKeyUnder(candidate, await makeBoxKey(), ctx)
  try {
    await unwrapKeyUnder(vaultKey, wrapped, ctx, { extractable: false, usage: ['decrypt'] })
    return true
  } catch {
    return false
  }
}

/** A lease granted to u1 until `Deadline`, and the vaultKey it was made from. */
const grantedLease = async () => {
  const pair = await vaultKeyPairOf()
  const lease = await Lease.grant(vaultProps, Deadline, pair)
  return { pair, lease }
}

describe("Lease.grant", () => {
  it("makes a lease of every field the record holds, the scope and epoch its vault props', and the deadline it is handed, as its example shows", async () => {
    const { lease } = await grantedLease()
    expect(lease).to.deep.include({
      format:            'safebyok-lease-v1',
      ...TH.scopeOf('u1'),
      vault_id:          'vault-id-u1',
      unlock_epoch:      3,
      ask_passphrase_at: Deadline,
    })
    expect(lease.vault_key_lease_wrapped).to.have.keys(['cipher_iv_b64', 'ciphertext_b64'])
  })

  it("makes its leaseKey non-extractable, so not even this code can export it", async () => {
    const { lease } = await grantedLease()
    expect(lease.lease_key).to.be.instanceOf(CryptoKey)
    expect(lease.lease_key.extractable).to.be.false
    expect(lease.lease_key.usages).to.have.members(['wrapKey', 'unwrapKey'])
    await expect(crypto.subtle.exportKey('raw', lease.lease_key)).rejects.toThrow()
  })

  it("keeps no handle to the vaultKey it wrapped: nothing on the lease or its record is that key", async () => {
    const { lease, pair } = await grantedLease()
    const held: unknown[] = [...Object.values(lease) as unknown[], ...Object.values(lease.props) as unknown[]]
    expect(held).to.not.include(pair.transientKey)
    expect(held).to.not.include(pair.sessionKey)
  })

  it("makes a fresh leaseKey at each grant", async () => {
    const pair = await vaultKeyPairOf()
    const one = await Lease.grant(vaultProps, Deadline, pair)
    const two = await Lease.grant(vaultProps, Deadline, pair)
    expect(one.lease_key).to.not.eq(two.lease_key)
    expect(one.vault_key_lease_wrapped).to.not.deep.equal(two.vault_key_lease_wrapped)
  })

  it("binds its wrap to the scope, vault_id, unlock_epoch and deadline, under the lease's format and purpose", async () => {
    const { lease } = await grantedLease()
    const leaseCtx = cipherCtx('safebyok-lease-v1', 'acme', 'u1', 'main', 'vault-id-u1', 3, Deadline, 'vault_key_lease_wrapped')
    const unwrapped = await unwrapKeyUnder(lease.lease_key, lease.vault_key_lease_wrapped, leaseCtx, { extractable: false, usage: ['wrapKey'] })
    expect(unwrapped).to.be.instanceOf(CryptoKey)
  })

  it("takes FarFuture as a deadline: how a lease of leaseHours: Infinity ends", async () => {
    const lease = await Lease.grant(vaultProps, FarFuture, await vaultKeyPairOf())
    expect(lease.ask_passphrase_at).to.eq(FarFuture)
  })

  for (const [badProps, blurb] of [
    [{ ...vaultProps, vault_id: '' },              'vault props with an empty vault_id'],
    [{ ...vaultProps, unlock_epoch: 0 },           'vault props at unlock_epoch 0'],
    [TH.omitting(vaultProps, 'unlock_epoch'),      'vault props with no unlock_epoch'],
    [TH.omitting(vaultProps, 'vaultlabel'),        'vault props with no vaultlabel'],
  ] as const) {
    it(`throws, as misuse, at ${blurb}: no lease record could hold them`, async () => {
      await expect(Lease.grant(badProps as LeaseVaultProps, Deadline, await vaultKeyPairOf())).rejects.toThrow(Z.core.$ZodError)
    })
  }

  for (const [deadline, blurb] of [
    [NaN,              'a deadline that is no number'],
    [Deadline + 0.5,   'a deadline with a fraction of a millisecond'],
    [0,                'a deadline before any lease could be granted'],
    [FarFuture + 1,    'a deadline past FarFuture'],
  ] as const) {
    it(`throws, as misuse, at ${blurb}: no lease record could hold it`, async () => {
      await expect(Lease.grant(vaultProps, deadline, await vaultKeyPairOf())).rejects.toThrow(Z.core.$ZodError)
    })
  }

  it("takes whole vault props, keeping only their scope, vault_id and unlock_epoch", async () => {
    const whole = TH.vaultPropsOf('u1', { vault_id: 'vault-id-u1', unlock_epoch: 3 })
    const lease = await Lease.grant(whole, Deadline, await vaultKeyPairOf())
    expect(lease.vault_id).to.eq('vault-id-u1')
    expect(lease.unlock_epoch).to.eq(3)
    expect(lease.props).to.not.have.property('passphrase')
  })
})

describe("Lease.make", () => {
  it("makes the lease a stored record stands for, as its first example shows", async () => {
    const { lease } = await grantedLease()
    const made = Lease.make(TH.scopeOf('u1'), lease.props)
    expect(made.props).to.deep.equal(lease.props)
    expect(made.lease_key).to.eq(lease.lease_key)
    expect(made.ask_passphrase_at).to.eq(Deadline)
  })

  it("keeps its record frozen as props, out of sight, its fields read-only", async () => {
    const { lease } = await grantedLease()
    const made = Lease.make(TH.scopeOf('u1'), { ...lease.props })
    expect(Object.isFrozen(made)).to.be.true
    expect(Object.isFrozen(made.props)).to.be.true
    expect(Object.isFrozen(made.props.vault_key_lease_wrapped)).to.be.true
    expect(Object.keys(made)).to.not.include('props')
  })

  it("shows JSON.stringify which vault it opens and until when, and neither its leaseKey nor its wrap", async () => {
    const { lease } = await grantedLease()
    const { lease_key: _leaseKey, vault_key_lease_wrapped: wrapped, ...rest } = lease.props
    expect(lease.toJSON()).to.deep.equal(rest)
    for (const stored of ['lease_key', 'vault_key_lease_wrapped', wrapped.ciphertext_b64, wrapped.cipher_iv_b64]) {
      expect(JSON.stringify(lease)).to.not.include(stored)
    }
  })

  const MangledCases = [
    // what a device store, or a host's own, might hand back:
    [{ ask_passphrase_at: 'soon' },                'a deadline that is not epoch milliseconds, as its second example shows'],
    [{ lease_key: 'not a key handle' },            'a leaseKey that is no CryptoKey: the record was serialized'],
    [{ format: 'safebyok-lease-v2' },              'a format this version does not write'],
    [{ unlock_epoch: 0 },                          'an unlock_epoch below one'],
    [{ vault_id: '' },                             'an empty vault_id'],
  ] as const

  for (const [spoil, blurb] of MangledCases) {
    it(`refuses ${blurb} as 'corrupt_record'`, async () => {
      const { lease } = await grantedLease()
      const err = TH.expectSyncRefusal(() => Lease.make(TH.scopeOf('u1'), { ...lease.props, ...spoil }), 'corrupt_record')
      expect(err.message).to.not.include('vault-id-u1')
      expect(err.message).to.not.include(lease.vault_key_lease_wrapped.ciphertext_b64)
    })
  }

  it("refuses a record naming another user as 'corrupt_record', as its third example shows: it is another vault's", async () => {
    const { lease } = await grantedLease()
    const err = TH.expectSyncRefusal(() => Lease.make(TH.scopeOf('u1'), { ...lease.props, user_id: 'someone_else' }), 'corrupt_record')
    expect(err.message).to.match(/another app, user or vault/)
    expect(err.message).to.not.include('someone_else')
  })

  it("refuses a lease granted under another user's vault as 'corrupt_record': it can never reach tryOpen here", async () => {
    const theirs = await Lease.grant({ ...vaultProps, ...TH.scopeOf('u2') }, Deadline, await vaultKeyPairOf())
    TH.expectSyncRefusal(() => Lease.make(TH.scopeOf('u1'), theirs.props), 'corrupt_record')
  })

  it("refuses null and a bare string as 'corrupt_record'", () => {
    TH.expectSyncRefusal(() => Lease.make(TH.scopeOf('u1'), null), 'corrupt_record')
    TH.expectSyncRefusal(() => Lease.make(TH.scopeOf('u1'), 'lease'), 'corrupt_record')
  })
})

describe("lease.tryOpen", () => {
  it("hands back the vaultKey it was granted around, as its first example shows", async () => {
    const { lease, pair } = await grantedLease()
    const vaultKey = await TH.expectGood(lease.tryOpen(vaultProps, GrantedAt))
    expect(await isSameKey(vaultKey, pair.transientKey)).to.be.true
  })

  it("hands it back non-extractable, for wrapping and unwrapping boxKeys only", async () => {
    const { lease } = await grantedLease()
    const vaultKey = await TH.expectGood(lease.tryOpen(vaultProps, GrantedAt))
    expect(vaultKey.extractable).to.be.false
    expect(vaultKey.usages).to.have.members(['wrapKey', 'unwrapKey'])
  })

  it("opens for whole VaultProps", async () => {
    const { lease } = await grantedLease()
    await TH.expectGood(lease.tryOpen({ ...TH.vaultPropsOf('u1'), vault_id: 'vault-id-u1', unlock_epoch: 3 }, GrantedAt))
  })

  it("opens until the last millisecond before its deadline", async () => {
    const { lease } = await grantedLease()
    await TH.expectGood(lease.tryOpen(vaultProps, Deadline - 1))
  })

  const UnfitCases = [
    // what a lease granted before opens nothing under:
    [{ unlock_epoch: 4 },           'a way in changed since, as its second example shows'],
    [{ unlock_epoch: 2 },           'vault props from before it was granted'],
    [{ vault_id: 'vault-id-other' }, 'the vault deleted and made anew'],
  ] as const

  for (const [moved, blurb] of UnfitCases) {
    it(`refuses as 'vault_locked' under ${blurb}`, async () => {
      const { lease } = await grantedLease()
      await TH.expectBad(lease.tryOpen({ ...vaultProps, ...moved }, GrantedAt), 'vault_locked')
    })
  }

  it("refuses as 'vault_locked' once its deadline comes", async () => {
    const { lease } = await grantedLease()
    const err = await TH.expectBad(lease.tryOpen(vaultProps, Deadline), 'vault_locked')
    expect(err.message).to.match(/ended/)
  })

  const TamperCases = [
    // what fits and still must not open:
    [(record: LeaseRecord) => Promise.resolve({ ...record, ask_passphrase_at: record.ask_passphrase_at + HourMillis }), 'a deadline moved later where the record is kept'],
    [(record: LeaseRecord) => Promise.resolve({ ...record, vault_key_lease_wrapped: { ...record.vault_key_lease_wrapped, ciphertext_b64: TH.tweakB64(record.vault_key_lease_wrapped.ciphertext_b64) } }), 'a wrap altered where the record is kept'],
    [async (record: LeaseRecord) => {
      const { lease: another } = await grantedLease()
      return { ...record, lease_key: another.lease_key }
    }, "another lease's leaseKey swapped in"],
  ] as const

  for (const [tamper, blurb] of TamperCases) {
    it(`refuses ${blurb} as 'corrupt_record', quoting nothing of it`, async () => {
      const { lease } = await grantedLease()
      const tampered = Lease.make(TH.scopeOf('u1'), await tamper(lease.props))
      const err = await TH.expectBad(tampered.tryOpen(vaultProps, GrantedAt), 'corrupt_record')
      expect(err.message).to.not.include('vault-id-u1')
      expect(err.cause).to.be.undefined
    })
  }
})

describe("lease.endsBy", () => {
  it("is true once the lease has ended, as its first example shows", async () => {
    const { lease } = await grantedLease()
    expect(lease.endsBy(GrantedAt)).to.be.false
    expect(lease.endsBy(Deadline - 1)).to.be.false
    expect(lease.endsBy(Deadline)).to.be.true
    expect(lease.endsBy(Deadline + 1)).to.be.true
  })

  it("is true when the lease ends within the hour, as its second example shows", async () => {
    const { lease } = await grantedLease()
    expect(lease.endsBy(Deadline - (2 * HourMillis) + (60 * MinuteMillis))).to.be.false
    expect(lease.endsBy(Deadline - HourMillis + (60 * MinuteMillis))).to.be.true
  })
})
