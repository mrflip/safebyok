import * as Z from 'zod/mini'
import { cipherCtx, makeLeaseKey, unwrapKeyUnder, wrapKeyUnder, type Ciphered } from './crypto'
import { VaultError } from './errors'
import { sameScope } from './names'
import { type Outcome, bad, good } from './outcome'
import { LeaseRecord, type VaultProps } from './types'
import { decorate } from './adorn'
import type { Vault } from './vault'
import type { VaultKeyPair } from './wayin'

/**
 * Leases: what lets a vault open on this device without a proof, across page loads, until its
 * `ask_passphrase_at`. A {@link Lease} is the vaultKey wrapped under a leaseKey this browser
 * made and can never export, bound to `leaseCtx`: the scope, the vault props' `vault_id` and
 * `unlock_epoch` as they stood at the grant, and the deadline. `Lease.grant` makes one around a
 * vaultKey a proof just opened; `lease.tryOpen(holder)` hands the vaultKey back while the vault
 * props still stand as they did and the deadline has not passed. When to grant, when to ask, and
 * the write to the device store are the vault's: a lease is its fields and its crypto.
 */

/** The slice of a {@link Vault} a lease reads: the scope its wrap is bound to, and the clock its deadline is read by. */
export type LeaseVault = Pick<Vault, 'applabel' | 'user_id' | 'vaultlabel' | 'clock'>

/**
 * The vault props a lease is granted under, as far as it reads them: the vault's id and its
 * `unlock_epoch`, which its wrap is bound to. A whole {@link VaultProps} is one. A change to the
 * ways in moves the epoch, and a vault deleted and made anew has another id: either way, a lease
 * granted before opens nothing.
 */
export type LeaseHolder = Pick<VaultProps, 'vault_id' | 'unlock_epoch'>

/** The ctx's first part: the lease record's format. */
const LeaseFormat = 'safebyok-lease-v1'

/** The usages of the handle a lease hands back: what the vault keeps, wrapping and unwrapping boxKeys, never exported. */
const SessionUsage = { extractable: false, usage: ['wrapKey', 'unwrapKey'] } as const

/** What {@link Lease.grant} is handed beside the vaultKey, held to what its record will hold. */
const GrantArgs = Z.object({
  holder:          Z.pick(LeaseRecord, { vault_id: true, unlock_epoch: true }),
  askPassphraseAt: LeaseRecord.shape.ask_passphrase_at,
})

/**
 * The ctx a lease's wrap is bound to: the scope of `vault`, the `vault_id` and `unlock_epoch` of
 * `holder`, the deadline, and the purpose. Every field of the record but the leaseKey and the wrap.
 */
const leaseCtxOf = (vault: LeaseVault, holder: LeaseHolder, askPassphraseAt: number): Uint8Array => (
  cipherCtx(LeaseFormat, vault.applabel, vault.user_id, vault.vaultlabel, holder.vault_id, holder.unlock_epoch, askPassphraseAt, 'vault_key_lease_wrapped')
)

/**
 * This device's lease on one vault: the vaultKey under a leaseKey that never leaves this browser
 * profile, and the instant it ends. Its stored fields are its own, read-only; `props` is the
 * stored record, frozen, and `toJSON()` the same, so a log line shows the record alone, and the
 * leaseKey in it as `{}`. It holds `vault`, not enumerable. The record is what the device store
 * keeps, by structured clone: the leaseKey has no other form, and nothing of a lease reaches the
 * backend.
 *
 * Anyone who can use this browser profile while a lease stands can open the vault: `leaseHours`
 * is that tradeoff, and `lock()` erases the lease at once.
 *
 * @example
 *   const record = valOf(await deviceDB.getLease(scope))   // null when this device holds none
 *   const lease = Lease.make(vault, record)                 // once it is not null
 *   lease.ask_passphrase_at               // when the vault asks again
 *   const { ok, val } = await lease.tryOpen(vaultProps)   // val: the vaultKey, to hold for the session
 */
export class Lease {
  /** The vault this lease belongs to, for its scope and clock. Not enumerable, not in `props`. */
  declare readonly vault: LeaseVault
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

  private constructor(vault: LeaseVault, record: LeaseRecord) {
    const props = Object.freeze({ ...record, vault_key_lease_wrapped: Object.freeze({ ...record.vault_key_lease_wrapped }) })
    decorate<Lease>(this, { vault, props })
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
   * The lease a stored record stands for, belonging to `vault`: checked through
   * {@link LeaseRecord}, and refused with kind 'corrupt_record' when it is not one this package
   * writes, or names another app, user or vault than `vault`'s -- a record out of place is as
   * unreadable as a mangled one. The refusal quotes nothing of it: a lease holds key material.
   * Touches nothing: no storage, no key.
   *
   * @param vault - The vault it belongs to.
   * @param record - The lease as the device store keeps it.
   * @returns The lease.
   *
   * @example const lease = Lease.make(vault, record)   // record: what deviceDB.getLease resolved, once it is not null
   * @example Lease.make(vault, { ...record, ask_passphrase_at: 'soon' })   // throws 'corrupt_record'
   * @example Lease.make(vault, { ...record, user_id: 'someone_else' })   // throws 'corrupt_record': another vault's
   */
  static make(vault: LeaseVault, record: unknown): Lease {
    const checked = LeaseRecord.safeParse(record)
    if (! checked.success) {
      throw new VaultError('corrupt_record', "This device's lease is not in a form this package writes, so it can't be taken up: the vault asks for a proof instead.")
    }
    if (! sameScope(checked.data, vault)) {
      throw new VaultError('corrupt_record', "This device's lease names another app, user or vault than the one opening it, so it can't be taken up: the vault asks for a proof instead.")
    }
    return new Lease(vault, checked.data)
  }

  /**
   * A fresh lease around the vaultKey a proof just opened: a new leaseKey, made non-extractable
   * so not even this code can export it, and the vaultKey's extractable handle wrapped under it,
   * bound to the lease's ctx, and not kept. Writes nothing: the vault puts the record (`props`)
   * in the device store, in place of any before, and computes `askPassphraseAt` from its clock
   * and `leaseHours`. Throws a Zod error, as misuse, for a `holder` or `askPassphraseAt` that a
   * lease record could not hold (`LeaseRecord`'s checks): the vault hands it only what it read
   * and computed.
   *
   * @param vault - The vault it is for: its scope is bound into the wrap.
   * @param holder - The vault props the vaultKey was proven against: their `vault_id` and `unlock_epoch` are bound into the wrap.
   * @param vaultKeyPair - The vaultKey as a way in handed it over; only its `transientKey` is read, to be wrapped.
   * @param askPassphraseAt - When the lease ends, in epoch milliseconds.
   * @returns The lease.
   *
   * @example const lease = await Lease.grant(vault, vaultProps, opened, now + vault.leaseMillis)
   */
  static async grant(vault: LeaseVault, givenHolder: LeaseHolder, vaultKeyPair: VaultKeyPair, givenAskPassphraseAt: number): Promise<Lease> {
    const { holder, askPassphraseAt } = GrantArgs.parse({ holder: givenHolder, askPassphraseAt: givenAskPassphraseAt })
    const leaseKey = await makeLeaseKey()
    const wrapped = await wrapKeyUnder(leaseKey, vaultKeyPair.transientKey, leaseCtxOf(vault, holder, askPassphraseAt))
    return new Lease(vault, {
      format:                  LeaseFormat,
      applabel:                vault.applabel,
      user_id:                 vault.user_id,
      vaultlabel:              vault.vaultlabel,
      vault_id:                holder.vault_id,
      unlock_epoch:            holder.unlock_epoch,
      lease_key:               leaseKey,
      vault_key_lease_wrapped: wrapped,
      ask_passphrase_at:       askPassphraseAt,
    })
  }

  /**
   * The vaultKey, out of this lease, while it still fits: `holder`, the vault props just read, is
   * the vault it was granted under (the same `vault_id` and `unlock_epoch`), and the vault's clock
   * is before `ask_passphrase_at`. The wrap is opened under the leaseKey, bound to the ctx the
   * vault expects, into a non-extractable handle for the vault to hold for the session.
   *
   * Refuses with kind 'vault_locked' when the lease has ended, or was granted before a way in
   * changed or before the vault was deleted and made anew; and 'corrupt_record' when it fits and
   * still does not open: its wrap or its leaseKey damaged. The vault asks for a proof either way,
   * and erases the lease.
   *
   * @param holder - The vault props as the vault read them now.
   * @returns The vaultKey, non-extractable.
   *
   * @example const { ok, val: vaultKey } = await lease.tryOpen(vaultProps)
   * @example await lease.tryOpen({ ...vaultProps, unlock_epoch: vaultProps.unlock_epoch + 1 })   // refused 'vault_locked': a way in changed since
   */
  async tryOpen(holder: LeaseHolder): Promise<Outcome<CryptoKey>> {
    if (holder.vault_id !== this.vault_id || holder.unlock_epoch !== this.unlock_epoch) {
      return bad(new VaultError('vault_locked', "This device's lease was granted before the vault's ways in changed, or before it was deleted and made anew, so it opens nothing: the vault asks for a proof instead."))
    }
    if (this.endsWithin(0)) {
      return bad(new VaultError('vault_locked', "This device's lease has ended: the vault asks for a proof again."))
    }
    try {
      return good(await unwrapKeyUnder(this.lease_key, this.vault_key_lease_wrapped, leaseCtxOf(this.vault, holder, this.ask_passphrase_at), SessionUsage))
    } catch {
      return bad(new VaultError('corrupt_record', "This device's lease would not open: it may have been damaged where it is kept. The vault asks for a proof instead."))
    }
  }

  /**
   * True when this lease ends within `millis` of now, by the vault's clock: `endsWithin(0)` once
   * it has ended. What tells the vault to ask for a proof ahead of the end, as
   * `ensureLease({ renewMinutes })` asks it to.
   *
   * @param millis - How far ahead to look, in milliseconds.
   *
   * @example lease.endsWithin(0)                 // true once it has ended
   * @example lease.endsWithin(60 * MinuteMillis)   // true when it ends within the hour
   */
  endsWithin(millis: number): boolean {
    const remaining = this.ask_passphrase_at - this.vault.clock.now()
    // A deadline or a clock reading that is no number counts as ended, never as standing.
    return remaining <= millis || Number.isNaN(remaining)
  }

  /** The record, as `JSON.stringify` and a log line show this lease: its leaseKey as `{}`. */
  toJSON(): LeaseRecord {
    return this.props
  }
}
