import * as Z from 'zod/mini'
import { cipherCtx, makeLeaseKey, unwrapKeyUnder, wrapKeyUnder, type Ciphered } from './crypto'
import { VaultError } from './errors'
import { sameScope } from './names'
import { type Outcome, bad, good } from './outcome'
import { FarFuture, LeaseRecord, type VaultProps } from './types'
import { decorate } from './adorn'
import type { Vault } from './vault'
import type { VaultKeyPair } from './wayin'

/** Leases: what lets a vault open on this device without a proof, across page loads, until its `ask_passphrase_at`.
 * A lease's wrap is bound to the scope, the props' `vault_id` and `unlock_epoch` at the grant, and
 * the deadline. A lease is only its fields and its crypto: when to grant, when to ask, and the
 * write to the device store are the vault's.
 */

/** The slice of a {@link Vault} a lease reads: the scope its wrap is bound to, the clock its deadline is read by, and how long a grant lasts. */
export type LeaseVault = Pick<Vault, 'applabel' | 'user_id' | 'vaultlabel' | 'clock' | 'leaseMillis'>

/** The vault props a lease is granted under, as far as it reads them: a whole {@link VaultProps} is one.
 * A change of wayins moves the `unlock_epoch`, and a vault made anew has another `vault_id`:
 * either way, a lease granted before opens nothing.
 */
export type LeaseHolder = Pick<VaultProps, 'vault_id' | 'unlock_epoch'>

/** The ctx's first part: the lease record's format. */
const LeaseFormat = 'safebyok-lease-v1'

/** The usages of the vaultKey a lease hands back: wrapping and unwrapping boxKeys, never exported. */
const SessionUsage = { extractable: false, usage: ['wrapKey', 'unwrapKey'] } as const

/** What {@link Lease.grant} is handed beside the vaultKey, held to what its record will hold. */
const GrantHolder = Z.pick(LeaseRecord, { vault_id: true, unlock_epoch: true })

/** The deadline {@link Lease.grant} works out from its vault's clock and `leaseMillis`, held to what its record will hold. */
const GrantDeadline = LeaseRecord.shape.ask_passphrase_at

/** The deadline of a lease granted at `nowMillis`: `leaseMillis` later, in whole ms, but never past {@link FarFuture}. */
const deadlineAfter = (nowMillis: number, leaseMillis: number): number => Math.min(Math.floor(nowMillis + leaseMillis), FarFuture)

/** The ctx a lease's wrap is bound to: every field of its record but the leaseKey and the wrap, and the purpose. */
const leaseCtxOf = (vault: LeaseVault, holder: LeaseHolder, askPassphraseAt: number): Uint8Array => (
  cipherCtx(LeaseFormat, vault.applabel, vault.user_id, vault.vaultlabel, holder.vault_id, holder.unlock_epoch, askPassphraseAt, 'vault_key_lease_wrapped')
)

/** This device's lease on one vault: the vaultKey under a leaseKey that never leaves this browser profile, and the instant it ends.
 * Every field is read-only. `toJSON()` leaves out the leaseKey and the wrap. The device store keeps
 * `props` by structured clone, and nothing of a lease reaches the backend.
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
  /** The vault this lease belongs to. Not enumerable. */
  declare readonly vault: LeaseVault
  /** The stored record, frozen. Not enumerable. */
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
  /** The vault props' `unlock_epoch` when it was granted: a change of wayins voids it. */
  readonly unlock_epoch:            number
  /** This browser's leaseKey: non-extractable, usable only to wrap and unwrap the vaultKey. */
  readonly lease_key:               CryptoKey
  /** The vaultKey, wrapped under `lease_key`, bound to the lease's ctx. */
  readonly vault_key_lease_wrapped: Ciphered
  /** The instant from which the lease opens nothing, and the vault asks for a proof. */
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

  /** The lease a stored record stands for; refuses 'corrupt_record' for one this package does not write, or another vault's.
   * The refusal quotes nothing of it, as a lease holds key material. It touches no storage and no key.
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

  /** A fresh lease, under a new non-extractable leaseKey, around the vaultKey a proof just opened, ending `vault.leaseMillis` from now.
   * The deadline is never past {@link FarFuture}, which is how `leaseHours: Infinity` reads. It
   * writes nothing: the vault puts `props` in the device store. It throws a Zod error, as misuse,
   * for a holder or deadline a {@link LeaseRecord} could not hold.
   *
   * @param givenHolder - The vault props the vaultKey was proven against.
   * @param vaultKeyPair - The vaultKey as a wayin handed it over: only its `transientKey` is read, and not kept.
   *
   * @example const lease = await Lease.grant(vault, vaultProps, opened)   // lease.ask_passphrase_at: leaseHours from now
   */
  static async grant(vault: LeaseVault, givenHolder: LeaseHolder, vaultKeyPair: VaultKeyPair): Promise<Lease> {
    const holder = GrantHolder.parse(givenHolder)
    const askPassphraseAt = GrantDeadline.parse(deadlineAfter(vault.clock.now(), vault.leaseMillis))
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

  /** The vaultKey, non-extractable, while the lease still fits: `holder` has its `vault_id` and `unlock_epoch`, and its deadline has not passed.
   * It refuses 'vault_locked' when the lease has ended, or was granted before a change of wayins or
   * before the vault was made anew. It refuses 'corrupt_record' when it fits and still does not
   * open, its wrap or its leaseKey damaged.
   *
   * @param holder - The vault props as the vault read them now.
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

  /** True when this lease ends within `millis` of now by the vault's clock; `endsWithin(0)` once it has ended.
   * It is how `ensureLease({ renewMinutes })` asks ahead of the end.
   *
   * @example lease.endsWithin(0)                 // true once it has ended
   * @example lease.endsWithin(60 * MinuteMillis)   // true when it ends within the hour
   */
  endsWithin(millis: number): boolean {
    const remaining = this.ask_passphrase_at - this.vault.clock.now()
    // A deadline or a clock reading that is no number counts as ended, never as standing.
    return remaining <= millis || Number.isNaN(remaining)
  }

  /** Which vault it opens and until when: all JSON and a log line show of it. */
  toJSON(): Omit<LeaseRecord, 'lease_key' | 'vault_key_lease_wrapped'> {
    const { format, applabel, user_id, vaultlabel, vault_id, unlock_epoch, ask_passphrase_at } = this
    return { format, applabel, user_id, vaultlabel, vault_id, unlock_epoch, ask_passphrase_at }
  }
}
