import * as Z from 'zod/mini'
import { cipherCtx, makeLeaseKey, unwrapKeyUnder, wrapKeyUnder, type Ciphered } from './crypto'
import { VaultError } from './errors'
import { sameScope } from './names'
import { type Outcome, bad, good } from './outcome'
import { LeaseRecord, type VaultProps, type VaultScope } from './types'
import { decorate } from './adorn'
import type { VaultKeyPair } from './wayin'

/**
 * Leases: what lets a vault open on this device without a proof, across page loads, until its
 * `ask_passphrase_at`. A {@link Lease} is the vaultKey wrapped under a leaseKey this browser
 * made and can never export, bound to `leaseCtx`: the scope, the vault props' `vault_id` and
 * `unlock_epoch` as they stood at the grant, and the deadline. `Lease.grant` makes one around a
 * vaultKey a proof just opened; `lease.tryOpen(vaultProps, now)` hands the vaultKey back while the
 * vault props still stand as they did and the deadline has not passed. When to grant, when to
 * ask, the time it is, and the write to the device store are the vault's: a lease is its fields
 * and its crypto.
 */

/**
 * The vault props a lease is granted under, as far as its wrap is bound to them: the scope (app,
 * user and vault label), the vault's id and its `unlock_epoch`. With the deadline, that is the
 * whole of its ctx. A whole {@link VaultProps} is one; the vault builds one from its own scope and
 * the vault props it holds. A change to the ways in moves the epoch, and a vault deleted and made
 * anew has another id: either way, a lease granted before opens nothing.
 */
export type LeaseVaultProps = Pick<VaultProps, 'applabel' | 'user_id' | 'vaultlabel' | 'vault_id' | 'unlock_epoch'>

/** The ctx's first part: the lease record's format. */
const LeaseFormat = 'safebyok-lease-v1'

/** The usages of the handle a lease hands back: what the vault keeps, wrapping and unwrapping boxKeys, never exported. */
const SessionUsage = { extractable: false, usage: ['wrapKey', 'unwrapKey'] } as const

/** What {@link Lease.grant} is handed beside the vaultKey -- the vault props and the deadline -- held to what its record will hold. */
const LeaseGrant = Z.pick(LeaseRecord, { applabel: true, user_id: true, vaultlabel: true, vault_id: true, unlock_epoch: true, ask_passphrase_at: true })

/**
 * The ctx a lease's wrap is bound to: the scope, `vault_id` and `unlock_epoch` of `vaultProps`,
 * the deadline, and the purpose. Every field of the record but the leaseKey and the wrap.
 */
const leaseCtxOf = (vaultProps: LeaseVaultProps, askPassphraseAt: number): Uint8Array => (
  cipherCtx(LeaseFormat, vaultProps.applabel, vaultProps.user_id, vaultProps.vaultlabel, vaultProps.vault_id, vaultProps.unlock_epoch, askPassphraseAt, 'vault_key_lease_wrapped')
)

/**
 * This device's lease on one vault: the vaultKey under a leaseKey that never leaves this browser
 * profile, and the instant it ends. Its stored fields are its own, read-only; `props` is the
 * stored record, frozen, and `toJSON()` every field of it but the leaseKey and the wrap, so a log
 * line never carries the vaultKey's wrap. The record is what the device store keeps, by
 * structured clone: the leaseKey has no other form, and nothing of a lease reaches the
 * backend.
 *
 * Anyone who can use this browser profile while a lease stands can open the vault: `leaseHours`
 * is that tradeoff, and `lock()` erases the lease at once.
 *
 * @example
 *   const record = valOf(await deviceDB.getLease(scope))   // null when this device holds none
 *   const lease = Lease.make(scope, record)                 // once it is not null
 *   lease.ask_passphrase_at               // when the vault asks again
 *   const { ok, val } = await lease.tryOpen(vaultProps, Date.now())   // val: the vaultKey, to hold for the session
 */
export class Lease {
  /** The stored record, frozen: what crosses to the device store. Not enumerable. */
  declare readonly props: LeaseRecord

  /** The record's format, `safebyok-lease-v1`. */
  readonly format:                  LeaseRecord['format']
  /** The app of the vault it is for. */
  readonly applabel:                string
  /** The user of the vault it is for. */
  readonly user_id:                 string
  /** The label of the vault it is for. */
  readonly vaultlabel:              string
  /** The id of the vault props it was granted under. */
  readonly vault_id:                string
  /** The vault props' `unlock_epoch` when it was granted: a change to the ways in voids it. */
  readonly unlock_epoch:            number
  /** This browser's leaseKey: non-extractable, usable only to wrap and unwrap the vaultKey. */
  readonly lease_key:               CryptoKey
  /** The vaultKey, wrapped under `lease_key`, bound to the lease's ctx. */
  readonly vault_key_lease_wrapped: Ciphered
  /** The instant from which the lease opens nothing, and the vault asks for a proof: epoch milliseconds. */
  readonly ask_passphrase_at:       number

  private constructor(record: LeaseRecord) {
    const props = Object.freeze({ ...record, vault_key_lease_wrapped: Object.freeze({ ...record.vault_key_lease_wrapped }) })
    decorate<Lease>(this, { props })
    this.format                  = props.format
    this.applabel                = props.applabel
    this.user_id                 = props.user_id
    this.vaultlabel              = props.vaultlabel
    this.vault_id                = props.vault_id
    this.unlock_epoch            = props.unlock_epoch
    this.lease_key               = props.lease_key
    this.vault_key_lease_wrapped = props.vault_key_lease_wrapped
    this.ask_passphrase_at       = props.ask_passphrase_at
    Object.freeze(this)
  }

  /**
   * The lease a stored record stands for, in the vault `scope` names: checked through
   * {@link LeaseRecord}, and refused with kind 'corrupt_record' when it is not one this package
   * writes, or names another app, user or vault than `scope` -- a record out of place is as
   * unreadable as a mangled one. The refusal quotes nothing of it: a lease holds key material.
   * Touches nothing: no storage, no key.
   *
   * @param scope - The vault it belongs to, by its scope.
   * @param record - The lease as the device store keeps it.
   * @returns The lease.
   *
   * @example const lease = Lease.make(scope, record)   // record: what deviceDB.getLease resolved, once it is not null
   * @example Lease.make(scope, { ...record, ask_passphrase_at: 'soon' })   // throws 'corrupt_record'
   * @example Lease.make(scope, { ...record, user_id: 'someone_else' })   // throws 'corrupt_record': another vault's
   */
  static make(scope: VaultScope, record: unknown): Lease {
    const checked = LeaseRecord.safeParse(record)
    if (! checked.success) {
      throw new VaultError('corrupt_record', "This device's lease is not in a form this package writes, so it can't be taken up: the vault asks for a proof instead.")
    }
    if (! sameScope(checked.data, scope)) {
      throw new VaultError('corrupt_record', "This device's lease names another app, user or vault than the one opening it, so it can't be taken up: the vault asks for a proof instead.")
    }
    return new Lease(checked.data)
  }

  /**
   * A fresh lease around the vaultKey a proof just opened, ending at `askPassphraseAt`. A new
   * leaseKey is made non-extractable, so not even this code can export it. The vaultKey's
   * extractable handle is wrapped under it, bound to the lease's ctx, and not kept. Writes
   * nothing: the vault puts the record (`props`) in the device store, in place of any before.
   * Throws a Zod error, as misuse, for vault props or a deadline a lease record could not hold
   * (`LeaseRecord`'s checks): a vault hands it only what it read and checked.
   *
   * @param vaultProps - The vault props the vaultKey was proven against: their scope, `vault_id` and `unlock_epoch` are bound into the wrap.
   * @param askPassphraseAt - The deadline, in epoch milliseconds: the vault's `leaseMillis` from now, never past `FarFuture`.
   * @param vaultKeyPair - The vaultKey as a way in handed it over; only its `transientKey` is read, to be wrapped.
   * @returns The lease.
   *
   * @example const lease = await Lease.grant(vaultProps, Math.min(Date.now() + vault.leaseMillis, FarFuture), opened)   // lease.ask_passphrase_at: leaseHours from now
   */
  static async grant(vaultProps: LeaseVaultProps, askPassphraseAt: number, vaultKeyPair: VaultKeyPair): Promise<Lease> {
    const granted = LeaseGrant.parse({ ...vaultProps, ask_passphrase_at: askPassphraseAt })
    const leaseKey = await makeLeaseKey()
    const wrapped = await wrapKeyUnder(leaseKey, vaultKeyPair.transientKey, leaseCtxOf(granted, granted.ask_passphrase_at))
    return new Lease({ format: LeaseFormat, ...granted, lease_key: leaseKey, vault_key_lease_wrapped: wrapped })
  }

  /**
   * The vaultKey, out of this lease, while it still fits: `vaultProps`, the vault props just read,
   * are the vault it was granted under (the same `vault_id` and `unlock_epoch`), and `now` is
   * before `ask_passphrase_at`. The wrap is opened under the leaseKey, bound to the ctx the vault
   * expects -- `vaultProps`' scope and ids, and this lease's deadline -- into a non-extractable
   * handle for the vault to hold for the session.
   *
   * Refuses with kind 'vault_locked' when the lease has ended, or was granted before a way in
   * changed or before the vault was deleted and made anew; and 'corrupt_record' when it fits and
   * still does not open: its wrap or its leaseKey damaged. The vault asks for a proof either way,
   * and erases the lease.
   *
   * @param vaultProps - The vault props as the vault read them now.
   * @param now - The time it is, in epoch milliseconds.
   * @returns The vaultKey, non-extractable.
   *
   * @example const { ok, val: vaultKey } = await lease.tryOpen(vaultProps, Date.now())
   * @example await lease.tryOpen({ ...vaultProps, unlock_epoch: vaultProps.unlock_epoch + 1 }, Date.now())   // refused 'vault_locked': a way in changed since
   */
  async tryOpen(vaultProps: LeaseVaultProps, now: number): Promise<Outcome<CryptoKey>> {
    if (vaultProps.vault_id !== this.vault_id || vaultProps.unlock_epoch !== this.unlock_epoch) {
      return bad(new VaultError('vault_locked', "This device's lease was granted before the vault's ways in changed, or before it was deleted and made anew, so it opens nothing: the vault asks for a proof instead."))
    }
    if (this.endsBy(now)) {
      return bad(new VaultError('vault_locked', "This device's lease has ended: the vault asks for a proof again."))
    }
    try {
      return good(await unwrapKeyUnder(this.lease_key, this.vault_key_lease_wrapped, leaseCtxOf(vaultProps, this.ask_passphrase_at), SessionUsage))
    } catch {
      return bad(new VaultError('corrupt_record', "This device's lease would not open: it may have been damaged where it is kept. The vault asks for a proof instead."))
    }
  }

  /**
   * True when this lease has ended by `instant`: its `ask_passphrase_at` is at or before it.
   * `endsBy(now)` once it has ended; `endsBy(now + renewMillis)` tells the vault to ask for a
   * proof ahead of the end, as `ensureLease({ renewMinutes })` asks it to.
   *
   * @param instant - The instant to judge it by, in epoch milliseconds.
   *
   * @example lease.endsBy(Date.now())                   // true once it has ended
   * @example lease.endsBy(Date.now() + 60 * MinuteMillis)   // true when it ends within the hour
   */
  endsBy(instant: number): boolean {
    return this.ask_passphrase_at <= instant
  }

  /** Which vault it opens and until when: all JSON and a log line show of it, never its leaseKey or wrap. */
  toJSON(): Omit<LeaseRecord, 'lease_key' | 'vault_key_lease_wrapped'> {
    const { format, applabel, user_id, vaultlabel, vault_id, unlock_epoch, ask_passphrase_at } = this
    return { format, applabel, user_id, vaultlabel, vault_id, unlock_epoch, ask_passphrase_at }
  }
}
