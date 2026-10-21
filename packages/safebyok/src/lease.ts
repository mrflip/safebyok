import * as Z from 'zod/mini'
import { cipherCtx, makeLeaseKey, unwrapKeyUnder, wrapKeyUnder, type Ciphered } from './crypto'
import { VaultError } from './errors'
import { sameScope } from './names'
import { type Outcome, bad, good } from './outcome'
import { FarFuture, LeaseRecord, type VaultProps } from './types'
import { decorate } from './adorn'
import type { Vault } from './vault'
import type { VaultKeyPair } from './wayin'

/**
 * Leases: what lets a vault open on this device without a proof, across page loads, until its
 * `ask_passphrase_at`, and what holds the vaultKey while it is open. A {@link Lease} is the
 * vaultKey wrapped under a leaseKey this browser made and can never export, bound to `leaseCtx`:
 * the scope, the `vault_id` and `unlock_epoch` of the vault props it was granted under, and the
 * deadline. `Lease.grant` makes one, opened, around a vaultKey a proof just opened;
 * `lease.tryOpen(standing)` hands back the lease opened, while the vault props still stand as they
 * did and the deadline has not passed. An opened lease is the one place the vault keeps the
 * vaultKey between calls: it wraps and unwraps boxKeys under it, and never hands it out. When to
 * grant, when to ask, and the write to the device store are the vault's.
 */

/**
 * The slice of a {@link Vault} a lease reads: its scope, which every lease of it names; the lease
 * length it grants; and the time, by which a lease is granted and judged.
 */
export type LeaseVault = Pick<Vault, 'applabel' | 'user_id' | 'vaultlabel' | 'leaseMillis' | 'now'>

/** The vault props a lease is granted under: their `vault_id` and `unlock_epoch`, which its wrap is bound to. A whole {@link VaultProps} is one. */
export type LeaseStanding = Pick<VaultProps, 'vault_id' | 'unlock_epoch'>

/** The ctx's first part: the lease record's format. */
const LeaseFormat = 'safebyok-lease-v1'

/** The usages of the handle an opened lease holds: wrapping and unwrapping boxKeys, never exported. */
const SessionUsage = { extractable: false, usage: ['wrapKey', 'unwrapKey'] } as const

/** What {@link Lease.grant} binds: the scope, the vault props it was proven against, and the deadline, held to what its record will hold. */
const LeaseGrant = Z.pick(LeaseRecord, { applabel: true, user_id: true, vaultlabel: true, vault_id: true, unlock_epoch: true, ask_passphrase_at: true })

/** The fields of a lease its wrap is bound to: every field of its record but its format, the leaseKey and the wrap. */
type LeaseBinding = Z.infer<typeof LeaseGrant>

/**
 * The ctx a lease's wrap is bound to: the lease's scope, `vault_id`, `unlock_epoch` and
 * deadline, and the purpose. Every field of the record but the leaseKey and the wrap. A lease is
 * one; so is what {@link Lease.grant} is about to make one of.
 */
const leaseCtxOf = (lease: LeaseBinding): Uint8Array => (
  cipherCtx(LeaseFormat, lease.applabel, lease.user_id, lease.vaultlabel, lease.vault_id, lease.unlock_epoch, lease.ask_passphrase_at, 'vault_key_lease_wrapped')
)

/**
 * This device's lease on one vault: the vaultKey under a leaseKey that never leaves this browser
 * profile, and the instant it ends. Its stored fields are its own, read-only; `props` is the
 * stored record, frozen, and `toJSON()` every field of it but the leaseKey and the wrap, so a log
 * line never carries the vaultKey's wrap. The record is what the device store keeps, by
 * structured clone: the leaseKey has no other form, and nothing of a lease reaches the
 * backend.
 *
 * A lease is opened or not. One read from the device store is not, until `tryOpen` hands back
 * one that is; one `Lease.grant` makes is. An opened lease holds the vaultKey, as a
 * non-extractable handle in a private field that no loop, spread, log line or `JSON.stringify`
 * sees, and wraps and unwraps boxKeys under it until it ends: what a box seals and opens with.
 *
 * Anyone who can use this browser profile while a lease stands can open the vault: `leaseHours`
 * is that tradeoff, and `lock()` erases the lease at once.
 *
 * @example
 *   const record = valOf(await deviceDB.getLease(scope))   // null when this device holds none
 *   const lease = Lease.make(vault, record)                 // once it is not null
 *   lease.ask_passphrase_at               // when the vault asks again
 *   const { ok, val: opened } = await lease.tryOpen(vaultProps)   // the lease, opened, to seal and open boxes with
 */
export class Lease {
  /** The stored record, frozen: what crosses to the device store. Not enumerable. */
  declare readonly props: LeaseRecord
  /** The vault it is a lease on: its scope, its lease length and its clock. */
  readonly #vault: LeaseVault
  /** The vaultKey, while this lease is opened: the handle boxKeys are wrapped and unwrapped under. Null until it is. */
  readonly #vaultKey: CryptoKey | null

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

  private constructor(vault: LeaseVault, record: LeaseRecord, vaultKey: CryptoKey | null) {
    const props = Object.freeze({ ...record, vault_key_lease_wrapped: Object.freeze({ ...record.vault_key_lease_wrapped }) })
    decorate<Lease>(this, { props })
    this.#vault = vault
    this.#vaultKey = vaultKey
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
   * The lease a stored record stands for, on `vault`, not opened: checked through
   * {@link LeaseRecord}, and refused with kind 'corrupt_record' when it is not one this package
   * writes, or names another app, user or vault than `vault`'s scope -- a record out of place is
   * as unreadable as a mangled one. The refusal quotes nothing of it: a lease holds key material.
   * Touches nothing: no storage, no key.
   *
   * @param vault - The vault it belongs to: its scope, lease length and clock.
   * @param record - The lease as the device store keeps it.
   * @returns The lease, not opened.
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
    return new Lease(vault, checked.data, null)
  }

  /**
   * A fresh lease on `vault`, opened, around the vaultKey a proof just opened against `standing`,
   * ending the vault's `leaseMillis` from now and never past {@link FarFuture}. A new leaseKey is
   * made non-extractable, so not even this code can export it. The vaultKey's extractable handle
   * is wrapped under it, bound to the lease's ctx, and not kept; its non-extractable handle is
   * what the lease holds. Writes nothing: the vault puts the record (`props`) in the device store,
   * in place of any before. Throws a Zod error, as misuse, for vault props a lease record could
   * not hold (`LeaseRecord`'s checks): a vault hands it only what it read and checked.
   *
   * @param vault - The vault it is a lease on: its scope, lease length and clock.
   * @param standing - The vault props the vaultKey was proven against: their `vault_id` and `unlock_epoch` are bound into the wrap.
   * @param vaultKeyPair - The vaultKey as a way in handed it over: its `transientKey` is wrapped, its `sessionKey` held.
   * @returns The lease, opened.
   *
   * @example const lease = await Lease.grant(vault, vaultProps, opened)   // lease.ask_passphrase_at: leaseHours from now
   */
  static async grant(vault: LeaseVault, standing: LeaseStanding, vaultKeyPair: VaultKeyPair): Promise<Lease> {
    const granted = LeaseGrant.parse({
      applabel:          vault.applabel,
      user_id:           vault.user_id,
      vaultlabel:        vault.vaultlabel,
      vault_id:          standing.vault_id,
      unlock_epoch:      standing.unlock_epoch,
      ask_passphrase_at: Math.min(vault.now() + vault.leaseMillis, FarFuture),
    })
    const leaseKey = await makeLeaseKey()
    const wrapped = await wrapKeyUnder(leaseKey, vaultKeyPair.transientKey, leaseCtxOf(granted))
    return new Lease(vault, { format: LeaseFormat, ...granted, lease_key: leaseKey, vault_key_lease_wrapped: wrapped }, vaultKeyPair.sessionKey)
  }

  /**
   * This lease, opened, while it still fits, as a new Lease: `standing`, the vault props just
   * read, are the vault it was granted under (the same `vault_id` and `unlock_epoch`), and its
   * vault's clock reads before `ask_passphrase_at`. The wrap is opened under the leaseKey, bound to
   * this lease's ctx, into a non-extractable handle the opened lease holds. This lease is left as
   * it was.
   *
   * Refuses with kind 'vault_locked' when the lease has ended, or was granted before a way in
   * changed or before the vault was deleted and made anew; and 'corrupt_record' when it fits and
   * still does not open: its wrap or its leaseKey damaged. The vault asks for a proof either way,
   * and erases the lease.
   *
   * @param standing - The vault props as the vault read them now.
   * @returns The lease, opened.
   *
   * @example const { ok, val: opened } = await lease.tryOpen(vaultProps)
   * @example await lease.tryOpen({ ...vaultProps, unlock_epoch: vaultProps.unlock_epoch + 1 })   // refused 'vault_locked': a way in changed since
   */
  async tryOpen(standing: LeaseStanding): Promise<Outcome<Lease>> {
    if (standing.vault_id !== this.vault_id || standing.unlock_epoch !== this.unlock_epoch) {
      return bad(new VaultError('vault_locked', "This device's lease was granted before the vault's ways in changed, or before it was deleted and made anew, so it opens nothing: the vault asks for a proof instead."))
    }
    if (this.endsBy(this.#vault.now())) {
      return bad(new VaultError('vault_locked', "This device's lease has ended: the vault asks for a proof again."))
    }
    try {
      const vaultKey = await unwrapKeyUnder(this.lease_key, this.vault_key_lease_wrapped, leaseCtxOf(this), SessionUsage)
      return good(new Lease(this.#vault, this.props, vaultKey))
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
   * @example lease.endsBy(vault.now())                       // true once it has ended
   * @example lease.endsBy(vault.now() + 60 * MinuteMillis)   // true when it ends within the hour
   */
  endsBy(instant: number): boolean {
    return this.ask_passphrase_at <= instant
  }

  /**
   * `boxKey`, wrapped under the vaultKey this lease holds, bound to `ctx`: what a box seals its
   * boxKey with. Refuses with kind 'vault_locked' when this lease is not opened, or has ended by
   * its vault's clock. `Box.seal` is the call: it builds the ctx.
   *
   * @param boxKey - A boxKey made fresh for one box.
   * @param ctx - The box's ctx for its wrapped boxKey.
   * @returns The boxKey, wrapped.
   *
   * @example const boxKeyWrapped = await lease.wrapBoxKey(boxKey, ctx)
   */
  async wrapBoxKey(boxKey: CryptoKey, ctx: Uint8Array): Promise<Ciphered> {
    return await wrapKeyUnder(this.#openedKey(), boxKey, ctx)
  }

  /**
   * The boxKey `boxKeyWrapped` holds, unwrapped under the vaultKey this lease holds and bound to
   * `ctx`, as a non-extractable handle that only deciphers. Refuses with kind 'vault_locked' as
   * {@link wrapBoxKey} does; a wrap that will not open throws WebCrypto's own error, for the box
   * to say as damage. `box.tryOpen` is the call: it builds the ctx.
   *
   * @param boxKeyWrapped - A box's boxKey, wrapped.
   * @param ctx - The box's ctx for its wrapped boxKey.
   * @returns The boxKey.
   *
   * @example const boxKey = await lease.unwrapBoxKey(record.box_key_wrapped, ctx)
   */
  async unwrapBoxKey(boxKeyWrapped: Ciphered, ctx: Uint8Array): Promise<CryptoKey> {
    return await unwrapKeyUnder(this.#openedKey(), boxKeyWrapped, ctx, { extractable: false, usage: ['decrypt'] })
  }

  /** Which vault it opens and until when: all JSON and a log line show of it, never its leaseKey, its wrap or the vaultKey. */
  toJSON(): Omit<LeaseRecord, 'lease_key' | 'vault_key_lease_wrapped'> {
    const { format, applabel, user_id, vaultlabel, vault_id, unlock_epoch, ask_passphrase_at } = this
    return { format, applabel, user_id, vaultlabel, vault_id, unlock_epoch, ask_passphrase_at }
  }

  /** The vaultKey this lease holds, while it is opened and has not ended: kind 'vault_locked' otherwise. */
  #openedKey(): CryptoKey {
    if (this.#vaultKey === null) {
      throw new VaultError('vault_locked', "This lease is not opened, so it holds no vaultKey: open it with lease.tryOpen, or unlock the vault.")
    }
    if (this.endsBy(this.#vault.now())) {
      throw new VaultError('vault_locked', "This device's lease has ended, so it opens nothing: unlock the vault again.")
    }
    return this.#vaultKey
  }
}
