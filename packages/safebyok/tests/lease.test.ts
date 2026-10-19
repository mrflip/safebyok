import { describe, expect, it } from 'vitest'
import * as Z from 'zod/mini'
import { cipherCtx, makeBoxKey, makeVaultKey, unwrapKeyUnder, wrapKeyUnder } from '../src/crypto'
import { Lease, type LeaseHolder, type LeaseVault } from '../src/lease'
import { MinuteMillis, type LeaseRecord } from '../src/types'
import * as TH from './test-helpers'

const GrantedAt = Date.UTC(2026, 9, 19, 12)
const HourMillis = 60 * MinuteMillis
const Deadline = GrantedAt + (7 * 24 * HourMillis)

/** A stand-in for the vault a lease reads: u1's scope, and a clock the test moves. */
const leaseVaultOf = (userId = 'u1') => {
  let nowMillis = GrantedAt
  const vault: LeaseVault = { ...TH.scopeOf(userId), clock: { now: () => nowMillis } }
  const setNow = (at: number) => { nowMillis = at }
  return { vault, setNow }
}

const holder: LeaseHolder = { vault_id: 'vault-id-u1', unlock_epoch: 3 }

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

/** A lease granted to u1 at `GrantedAt`, until `Deadline`, and what it was made from. */
const grantedLease = async () => {
  const { vault, setNow } = leaseVaultOf()
  const pair = await vaultKeyPairOf()
  const lease = await Lease.grant(vault, holder, pair, Deadline)
  return { vault, setNow, pair, lease }
}

describe("Lease.grant", () => {
  it("makes a lease of every field the record holds, the scope its vault's and the epoch its holder's, as its example shows", async () => {
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
    const held: unknown[] = [...Object.values(lease) as unknown[], ...Object.values(lease.props) as unknown[], lease.vault]
    expect(held).to.not.include(pair.transientKey)
    expect(held).to.not.include(pair.sessionKey)
  })

  it("makes a fresh leaseKey at each grant", async () => {
    const { vault } = leaseVaultOf()
    const pair = await vaultKeyPairOf()
    const one = await Lease.grant(vault, holder, pair, Deadline)
    const two = await Lease.grant(vault, holder, pair, Deadline)
    expect(one.lease_key).to.not.eq(two.lease_key)
    expect(one.vault_key_lease_wrapped).to.not.deep.equal(two.vault_key_lease_wrapped)
  })

  it("binds its wrap to the scope, vault_id, unlock_epoch and deadline, under the lease's format and purpose", async () => {
    const { lease } = await grantedLease()
    const leaseCtx = cipherCtx('safebyok-lease-v1', 'acme', 'u1', 'main', 'vault-id-u1', 3, Deadline, 'vault_key_lease_wrapped')
    const unwrapped = await unwrapKeyUnder(lease.lease_key, lease.vault_key_lease_wrapped, leaseCtx, { extractable: false, usage: ['wrapKey'] })
    expect(unwrapped).to.be.instanceOf(CryptoKey)
  })
  for (const [badHolder, badDeadline, blurb] of [
    [holder, NaN, 'a deadline that is no number'],
    [holder, Infinity, 'an infinite deadline'],
    [holder, Deadline + 0.5, 'a deadline in part-milliseconds'],
    [holder, 'soon', 'a deadline that is a string'],
    [{ vault_id: '', unlock_epoch: 3 }, Deadline, 'a holder with an empty vault_id'],
    [{ vault_id: 'vault-id-u1', unlock_epoch: 0 }, Deadline, 'a holder at unlock_epoch 0'],
    [{ vault_id: 'vault-id-u1' }, Deadline, 'a holder with no unlock_epoch'],
  ] as const) {
    it(`throws, as misuse, at ${blurb}: no lease record could hold it`, async () => {
      const { vault } = leaseVaultOf()
      await expect(Lease.grant(vault, badHolder as LeaseHolder, await vaultKeyPairOf(), badDeadline as number)).rejects.toThrow(Z.core.$ZodError)
    })
  }

  it("takes whole vault props as its holder, keeping only their vault_id and unlock_epoch", async () => {
    const { vault } = leaseVaultOf()
    const vaultProps = TH.vaultPropsOf('u1', { vault_id: 'vault-id-u1', unlock_epoch: 3 })
    const lease = await Lease.grant(vault, vaultProps, await vaultKeyPairOf(), Deadline)
    expect(lease.vault_id).to.eq('vault-id-u1')
    expect(lease.unlock_epoch).to.eq(3)
  })
})

describe("Lease.make", () => {
  it("makes the lease a stored record stands for, as its first example shows", async () => {
    const { vault, lease } = await grantedLease()
    const made = Lease.make(vault, lease.props)
    expect(made.props).to.deep.equal(lease.props)
    expect(made.lease_key).to.eq(lease.lease_key)
    expect(made.ask_passphrase_at).to.eq(Deadline)
  })

  it("keeps its record frozen as props, its fields read-only, and its vault out of sight", async () => {
    const { vault, lease } = await grantedLease()
    const made = Lease.make(vault, { ...lease.props })
    expect(Object.isFrozen(made)).to.be.true
    expect(Object.isFrozen(made.props)).to.be.true
    expect(Object.isFrozen(made.props.vault_key_lease_wrapped)).to.be.true
    expect(made.vault).to.eq(vault)
    expect(Object.keys(made)).to.not.include('vault').and.to.not.include('props')
  })

  it("shows its record alone to JSON.stringify, the leaseKey as {}", async () => {
    const { lease } = await grantedLease()
    expect(JSON.stringify(lease)).to.eq(JSON.stringify(lease.props))
    expect(JSON.stringify(lease)).to.include('"lease_key":{}')
    expect(lease.toJSON()).to.eq(lease.props)
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
      const { vault, lease } = await grantedLease()
      const err = TH.expectSyncRefusal(() => Lease.make(vault, { ...lease.props, ...spoil }), 'corrupt_record')
      expect(err.message).to.not.include('vault-id-u1')
      expect(err.message).to.not.include(lease.vault_key_lease_wrapped.ciphertext_b64)
    })
  }

  it("refuses a record naming another user as 'corrupt_record', as its third example shows: it is another vault's", async () => {
    const { vault, lease } = await grantedLease()
    const err = TH.expectSyncRefusal(() => Lease.make(vault, { ...lease.props, user_id: 'someone_else' }), 'corrupt_record')
    expect(err.message).to.match(/another app, user or vault/)
    expect(err.message).to.not.include('someone_else')
  })

  it("refuses a lease granted under another user's vault as 'corrupt_record': it can never reach tryOpen here", async () => {
    const { vault } = leaseVaultOf('u2')
    const theirs = await Lease.grant(vault, holder, await vaultKeyPairOf(), Deadline)
    const { vault: mine } = leaseVaultOf('u1')
    TH.expectSyncRefusal(() => Lease.make(mine, theirs.props), 'corrupt_record')
  })

  it("refuses null and a bare string as 'corrupt_record'", () => {
    const { vault } = leaseVaultOf()
    TH.expectSyncRefusal(() => Lease.make(vault, null), 'corrupt_record')
    TH.expectSyncRefusal(() => Lease.make(vault, 'lease'), 'corrupt_record')
  })
})

describe("lease.tryOpen", () => {
  it("hands back the vaultKey it was granted around, as its first example shows", async () => {
    const { lease, pair } = await grantedLease()
    const vaultKey = await TH.expectGood(lease.tryOpen(holder))
    expect(await isSameKey(vaultKey, pair.transientKey)).to.be.true
  })

  it("hands it back non-extractable, for wrapping and unwrapping boxKeys only", async () => {
    const { lease } = await grantedLease()
    const vaultKey = await TH.expectGood(lease.tryOpen(holder))
    expect(vaultKey.extractable).to.be.false
    expect(vaultKey.usages).to.have.members(['wrapKey', 'unwrapKey'])
  })

  it("opens for a whole VaultProps as its holder", async () => {
    const { lease } = await grantedLease()
    await TH.expectGood(lease.tryOpen({ ...TH.vaultPropsOf('u1'), vault_id: 'vault-id-u1', unlock_epoch: 3 }))
  })

  it("opens until the last millisecond before its deadline", async () => {
    const { lease, setNow } = await grantedLease()
    setNow(Deadline - 1)
    await TH.expectGood(lease.tryOpen(holder))
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
      await TH.expectBad(lease.tryOpen({ ...holder, ...moved }), 'vault_locked')
    })
  }

  it("refuses as 'vault_locked' once its deadline comes", async () => {
    const { lease, setNow } = await grantedLease()
    setNow(Deadline)
    const err = await TH.expectBad(lease.tryOpen(holder), 'vault_locked')
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
      const { vault, lease } = await grantedLease()
      const tampered = Lease.make(vault, await tamper(lease.props))
      const err = await TH.expectBad(tampered.tryOpen(holder), 'corrupt_record')
      expect(err.message).to.not.include('vault-id-u1')
      expect(err.cause).to.be.undefined
    })
  }
})

describe("lease.endsWithin", () => {
  it("is true once the lease has ended, as its first example shows", async () => {
    const { lease, setNow } = await grantedLease()
    expect(lease.endsWithin(0)).to.be.false
    setNow(Deadline - 1)
    expect(lease.endsWithin(0)).to.be.false
    setNow(Deadline)
    expect(lease.endsWithin(0)).to.be.true
    setNow(Deadline + 1)
    expect(lease.endsWithin(0)).to.be.true
  })

  it("is true when the lease ends within the hour, as its second example shows", async () => {
    const { lease, setNow } = await grantedLease()
    setNow(Deadline - (2 * HourMillis))
    expect(lease.endsWithin(60 * MinuteMillis)).to.be.false
    setNow(Deadline - HourMillis)
    expect(lease.endsWithin(60 * MinuteMillis)).to.be.true
  })

  it("counts the lease as ended when the clock reads no number, and opens nothing", async () => {
    const { lease, setNow } = await grantedLease()
    setNow(NaN)
    expect(lease.endsWithin(0)).to.be.true
    await TH.expectBad(lease.tryOpen(holder), 'vault_locked')
  })

  it("reads the vault's clock at each call, never a time it kept", async () => {
    const { lease, setNow } = await grantedLease()
    expect(lease.endsWithin(HourMillis)).to.be.false
    setNow(Deadline - MinuteMillis)
    expect(lease.endsWithin(HourMillis)).to.be.true
  })
})
