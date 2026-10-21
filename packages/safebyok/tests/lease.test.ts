import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import * as Z from 'zod/mini'
import { cipherCtx, makeBoxKey, makeVaultKey, unwrapKeyUnder } from '../src/crypto'
import { Lease, type LeaseStanding } from '../src/lease'
import { FarFuture, ForeverMillis, MinuteMillis, type LeaseRecord } from '../src/types'
import * as TH from './test-helpers'

const GrantedAt = TH.SliceNow
const HourMillis = 60 * MinuteMillis
const LeaseMillis = 7 * 24 * HourMillis
const Deadline = GrantedAt + LeaseMillis

/** The vault props every lease here is granted under: u1's `main` vault, at gate epoch 3. */
const standing: LeaseStanding = { vault_tok: 'vault-tok-u1', gate_epoch: 3 }

/** A slice of u1's `main` vault whose clock reads what `clock.at` holds: GrantedAt, unless a test moves it. */
const vaultAt = (clock?: { at: number }, overrides: Partial<TH.VaultSlice> = {}) => (
  TH.vaultSliceOf('u1', TH.testDeriver, { now: () => clock?.at ?? GrantedAt, ...overrides })
)

/** A vaultKey, as a way in hands it over: here one extractable key in both roles. */
const vaultKeyPairOf = async () => {
  const vaultKey = await makeVaultKey()
  return { transientKey: vaultKey, sessionKey: vaultKey }
}

/** True when `lease`, opened, wraps a boxKey that `vaultKey` unwraps: the two hold one AES key. */
const holdsKey = async (lease: Lease, vaultKey: CryptoKey): Promise<boolean> => {
  const ctx = cipherCtx('a test', 'of keys')
  const wrapped = await lease.wrapBoxKey(await makeBoxKey(), ctx)
  try {
    await unwrapKeyUnder(vaultKey, wrapped, ctx, { extractable: false, usage: ['decrypt'] })
    return true
  } catch {
    return false
  }
}

/** A lease granted to u1 at `GrantedAt` until `Deadline`, the vaultKey it was made from, and the clock its vault reads. */
const grantedLease = async () => {
  const clock = { at: GrantedAt }
  const pair = await vaultKeyPairOf()
  const lease = await Lease.grant(vaultAt(clock), standing, pair)
  return { pair, lease, clock }
}

describe("Lease.grant", () => {
  it("makes a lease whose record holds the scope its vault's, its ids the vault props', and its deadline leaseMillis from now, as its example shows", async () => {
    const { lease } = await grantedLease()
    const visible = { ...TH.scopeOf('u1'), vault_tok: 'vault-tok-u1', gate_epoch: 3, ask_passphrase_at: Deadline }
    expect(lease.record).to.deep.include({ format: 'safebyok-lease-v1', ...visible })
    expect(TH.shownOf(lease)).to.deep.equal(visible)
    expect(lease.record.vault_key_lease_wrapped).to.have.keys(['cipher_iv_b64', 'ciphertext_b64'])
  })

  it("makes its leaseKey non-extractable, so not even this code can export it", async () => {
    const { lease } = await grantedLease()
    expect(lease.record.lease_key).to.be.instanceOf(CryptoKey)
    expect(lease.record.lease_key.extractable).to.be.false
    expect(lease.record.lease_key.usages).to.have.members(['wrapKey', 'unwrapKey'])
    await expect(crypto.subtle.exportKey('raw', lease.record.lease_key)).rejects.toThrow()
  })

  it("is opened, holding the vaultKey out of sight: no field, record field or JSON of it is that key", async () => {
    const { lease, pair } = await grantedLease()
    expect(await holdsKey(lease, pair.transientKey)).to.be.true
    const held: unknown[] = [...Object.values(lease) as unknown[], ...Object.values(lease.record) as unknown[]]
    expect(held).to.not.include(pair.transientKey)
    expect(held).to.not.include(pair.sessionKey)
    expect(JSON.stringify(lease)).to.not.include('vaultKey')
  })

  it("makes a fresh leaseKey at each grant", async () => {
    const pair = await vaultKeyPairOf()
    const one = await Lease.grant(vaultAt(), standing, pair)
    const two = await Lease.grant(vaultAt(), standing, pair)
    expect(one.record.lease_key).to.not.eq(two.record.lease_key)
    expect(one.record.vault_key_lease_wrapped).to.not.deep.equal(two.record.vault_key_lease_wrapped)
  })

  it("binds its wrap to the scope, vault_tok, gate_epoch and deadline, under the lease's format and purpose", async () => {
    const { lease } = await grantedLease()
    const leaseCtx = cipherCtx('safebyok-lease-v1', 'acme', 'u1', 'main', 'vault-tok-u1', 3, Deadline, 'vault_key_lease_wrapped')
    const unwrapped = await unwrapKeyUnder(lease.record.lease_key, lease.record.vault_key_lease_wrapped, leaseCtx, { extractable: false, usage: ['wrapKey'] })
    expect(unwrapped).to.be.instanceOf(CryptoKey)
  })

  it("ends at FarFuture for a vault whose leases last until lock(): how leaseHours: Infinity ends", async () => {
    const lease = await Lease.grant(vaultAt(undefined, { leaseMillis: ForeverMillis }), standing, await vaultKeyPairOf())
    expect(lease.ask_passphrase_at).to.eq(FarFuture)
  })

  for (const [badStanding, blurb] of [
    [{ ...standing, vault_tok: '' },             'vault props with an empty vault_tok'],
    [{ ...standing, gate_epoch: 0 },             'vault props at gate_epoch 0'],
    [TH.omitting(standing, 'gate_epoch'),        'vault props with no gate_epoch'],
  ] as const) {
    it(`throws, as misuse, at ${blurb}: no lease record could hold them`, async () => {
      await expect(Lease.grant(vaultAt(), badStanding as LeaseStanding, await vaultKeyPairOf())).rejects.toThrow(Z.core.$ZodError)
    })
  }

  for (const [at, blurb] of [
    [NaN,              'a clock that reads no number'],
    [GrantedAt + 0.5,  'a clock read with a fraction of a millisecond'],
    [0,                'a clock reading before any lease could be granted'],
  ] as const) {
    it(`throws, as misuse, at ${blurb}: no lease record could hold the deadline`, async () => {
      await expect(Lease.grant(vaultAt({ at }), standing, await vaultKeyPairOf())).rejects.toThrow(Z.core.$ZodError)
    })
  }

  it("takes whole vault props, keeping only their vault_tok and gate_epoch", async () => {
    const whole = TH.vaultPropsOf('u1', { vault_tok: 'vault-tok-u1', gate_epoch: 3 })
    const lease = await Lease.grant(vaultAt(), whole, await vaultKeyPairOf())
    expect(lease.vault_tok).to.eq('vault-tok-u1')
    expect(lease.gate_epoch).to.eq(3)
    expect(lease.record).to.not.have.property('passphrase')
  })
})

describe("Lease.make", () => {
  it("makes the lease a stored record stands for, not opened, as its first example shows", async () => {
    const { lease } = await grantedLease()
    const made = Lease.make(vaultAt(), lease.record)
    expect(made.record).to.deep.equal(lease.record)
    expect(made.record.lease_key).to.eq(lease.record.lease_key)
    expect(made.ask_passphrase_at).to.eq(Deadline)
    await TH.expectRefusal(made.wrapBoxKey(await makeBoxKey(), cipherCtx('a test')), 'vault_locked')
  })

  it("keeps its record frozen as record, out of sight, its fields read-only", async () => {
    const { lease } = await grantedLease()
    const made = Lease.make(vaultAt(), { ...lease.record })
    expect(Object.isFrozen(made)).to.be.true
    expect(Object.isFrozen(made.record)).to.be.true
    expect(Object.isFrozen(made.record.vault_key_lease_wrapped)).to.be.true
    expect(Reflect.set(made, 'vault_tok', 'other')).to.be.false
  })

  it("shows each visible field once in a key list, JSON and a log line -- which vault it opens and until when -- and neither its leaseKey, its wrap, its format nor the vaultKey", async () => {
    const { lease } = await grantedLease()
    const visible = ['applabel', 'user_id', 'vaultlabel', 'vault_tok', 'gate_epoch', 'ask_passphrase_at']
    expect(Object.keys(lease)).to.deep.equal(visible)
    expect(Object.keys(TH.jsonOf(lease))).to.deep.equal(visible)
    expect(lease.toJSON()).to.deep.equal(TH.shownOf(lease))
    const wrapped = lease.record.vault_key_lease_wrapped
    for (const hidden of ['lease_key', 'vault_key_lease_wrapped', 'CryptoKey', 'safebyok-lease', wrapped.ciphertext_b64, wrapped.cipher_iv_b64]) {
      expect(JSON.stringify(lease)).to.not.include(hidden)
      expect(inspect(lease)).to.not.include(hidden)
    }
    expect(inspect(lease).match(/vault_tok/g)).to.have.lengthOf(1)
  })

  const MangledCases = [
    // what a device store, or a host's own, might hand back:
    [{ ask_passphrase_at: 'soon' },                'a deadline that is not epoch milliseconds, as its second example shows'],
    [{ lease_key: 'not a key handle' },            'a leaseKey that is no CryptoKey: the record was serialized'],
    [{ format: 'safebyok-lease-v2' },              'a format this version does not write'],
    [{ gate_epoch: 0 },                            'a gate_epoch below one'],
    [{ vault_tok: '' },                            'an empty vault_tok'],
  ] as const

  for (const [spoil, blurb] of MangledCases) {
    it(`refuses ${blurb} as 'corrupt_record'`, async () => {
      const { lease } = await grantedLease()
      const err = TH.expectSyncRefusal(() => Lease.make(vaultAt(), { ...lease.record, ...spoil }), 'corrupt_record')
      expect(err.message).to.not.include('vault-tok-u1')
      expect(err.message).to.not.include(lease.record.vault_key_lease_wrapped.ciphertext_b64)
    })
  }

  it("refuses a record naming another user as 'corrupt_record', as its third example shows: it is another vault's", async () => {
    const { lease } = await grantedLease()
    const err = TH.expectSyncRefusal(() => Lease.make(vaultAt(), { ...lease.record, user_id: 'someone_else' }), 'corrupt_record')
    expect(err.message).to.match(/another app, user or vault/)
    expect(err.message).to.not.include('someone_else')
  })

  it("refuses a lease granted under another user's vault as 'corrupt_record': it can never reach tryOpen here", async () => {
    const theirs = await Lease.grant(vaultAt(undefined, TH.scopeOf('u2')), standing, await vaultKeyPairOf())
    TH.expectSyncRefusal(() => Lease.make(vaultAt(), theirs.record), 'corrupt_record')
  })

  it("refuses null and a bare string as 'corrupt_record'", () => {
    TH.expectSyncRefusal(() => Lease.make(vaultAt(), null), 'corrupt_record')
    TH.expectSyncRefusal(() => Lease.make(vaultAt(), 'lease'), 'corrupt_record')
  })
})

describe("lease.tryOpen", () => {
  it("hands back a new lease, opened around the vaultKey it was granted around, as its first example shows", async () => {
    const { lease, pair } = await grantedLease()
    const stored = Lease.make(vaultAt(), lease.record)
    const opened = await TH.expectGood(stored.tryOpen(standing))
    expect(opened).to.not.eq(stored)
    expect(opened.record).to.deep.equal(stored.record)
    expect(await holdsKey(opened, pair.transientKey)).to.be.true
    await TH.expectRefusal(stored.wrapBoxKey(await makeBoxKey(), cipherCtx('a test')), 'vault_locked')
  })

  it("opens for whole VaultProps", async () => {
    const { lease } = await grantedLease()
    await TH.expectGood(lease.tryOpen({ ...TH.vaultPropsOf('u1'), vault_tok: 'vault-tok-u1', gate_epoch: 3 }))
  })

  it("opens until the last millisecond before its deadline", async () => {
    const { lease, clock } = await grantedLease()
    clock.at = Deadline - 1
    await TH.expectGood(lease.tryOpen(standing))
  })

  const UnfitCases = [
    // what a lease granted before opens nothing under:
    [{ gate_epoch: 4 },             'a way in changed since, as its second example shows'],
    [{ gate_epoch: 2 },             'vault props from before it was granted'],
    [{ vault_tok: 'vault-tok-other' }, 'the vault deleted and made anew'],
  ] as const

  for (const [moved, blurb] of UnfitCases) {
    it(`refuses as 'vault_locked' under ${blurb}`, async () => {
      const { lease } = await grantedLease()
      await TH.expectBad(lease.tryOpen({ ...standing, ...moved }), 'vault_locked')
    })
  }

  it("refuses as 'vault_locked' once its deadline comes by its vault's clock", async () => {
    const { lease, clock } = await grantedLease()
    clock.at = Deadline
    const err = await TH.expectBad(lease.tryOpen(standing), 'vault_locked')
    expect(err.message).to.match(/ended/)
  })

  const TamperCases = [
    // what fits and still must not open:
    [(record: LeaseRecord) => Promise.resolve({ ...record, ask_passphrase_at: record.ask_passphrase_at + HourMillis }), 'a deadline moved later where the record is kept'],
    [(record: LeaseRecord) => Promise.resolve({ ...record, vault_key_lease_wrapped: { ...record.vault_key_lease_wrapped, ciphertext_b64: TH.tweakB64(record.vault_key_lease_wrapped.ciphertext_b64) } }), 'a wrap altered where the record is kept'],
    [async (record: LeaseRecord) => {
      const { lease: another } = await grantedLease()
      return { ...record, lease_key: another.record.lease_key }
    }, "another lease's leaseKey swapped in"],
  ] as const

  for (const [tamper, blurb] of TamperCases) {
    it(`refuses ${blurb} as 'corrupt_record', quoting nothing of it`, async () => {
      const { lease } = await grantedLease()
      const tampered = Lease.make(vaultAt(), await tamper(lease.record))
      const err = await TH.expectBad(tampered.tryOpen(standing), 'corrupt_record')
      expect(err.message).to.not.include('vault-tok-u1')
      expect(err.cause).to.be.undefined
    })
  }
})

describe("lease.wrapBoxKey and lease.unwrapBoxKey", () => {
  it("wraps a boxKey under the vaultKey it holds, and unwraps it again, as their examples show", async () => {
    const { lease } = await grantedLease()
    const ctx = cipherCtx('a test', 'of a box')
    const boxKey = await makeBoxKey()
    const unwrapped = await lease.unwrapBoxKey(await lease.wrapBoxKey(boxKey, ctx), ctx)
    expect(unwrapped.extractable).to.be.false
    expect(unwrapped.usages).to.deep.equal(['decrypt'])
  })

  it("refuses as 'vault_locked' once the lease has ended by its vault's clock, and for a lease not opened", async () => {
    const { lease, clock } = await grantedLease()
    const ctx = cipherCtx('a test', 'of a box')
    const wrapped = await lease.wrapBoxKey(await makeBoxKey(), ctx)
    clock.at = Deadline
    await TH.expectRefusal(lease.wrapBoxKey(await makeBoxKey(), ctx), 'vault_locked')
    await TH.expectRefusal(lease.unwrapBoxKey(wrapped, ctx), 'vault_locked')
    clock.at = GrantedAt
    await TH.expectRefusal(Lease.make(vaultAt(clock), lease.record).unwrapBoxKey(wrapped, ctx), 'vault_locked')
  })

  it("throws WebCrypto's own error for a wrap that will not open under its ctx", async () => {
    const { lease } = await grantedLease()
    const wrapped = await lease.wrapBoxKey(await makeBoxKey(), cipherCtx('a test', 'of a box'))
    await expect(lease.unwrapBoxKey(wrapped, cipherCtx('another', 'box'))).rejects.toThrow(DOMException)
  })
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
