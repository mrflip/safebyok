import * as Z from 'zod/mini'
import { cipherCtx, makeLeaseKey, unwrapKeyUnder, wrapKeyUnder, type Ciphered } from './crypto'
import { VaultError } from './errors'
import { sameScope } from './names'
import { type Outcome, bad, good } from './outcome'
import { FarFuture, LeaseRecord, type VaultProps } from './types'
import type { Vault } from './vault'
import type { VaultKeyPair } from './wayin'

/** Leases: what lets a vault open on this device without a proof, across page loads, until its `ask_passphrase_at`.
 * A lease's wrap is bound to the scope, the props' `vault_tok` and `gate_epoch` at the grant, and
 * the deadline. An opened lease is the one place the vault keeps the vaultKey between calls: it
 * wraps and unwraps boxKeys under it, and never hands it out. When to grant, when to ask, and the
 * write to the device store are the vault's.
 */

/** The slice of a {@link Vault} a lease reads: the scope every lease of it names, how long a grant lasts, and the time a lease is granted and judged by. */
export type LeaseVault = Pick<Vault, 'applabel' | 'user_id' | 'vaultlabel' | 'leaseMillis' | 'now'>

/** The vault props a lease is granted under: their `vault_tok` and `gate_epoch`, which its wrap is bound to. A whole {@link VaultProps} is one. */
export type LeaseStanding = Pick<VaultProps, 'vault_tok' | 'gate_epoch'>

/** A lease's visible fields, each once: which vault it opens and until when, as `{ ...lease }` and `lease.toJSON()` hold them. */
export type LeaseView = Pick<LeaseRecord, 'applabel' | 'user_id' | 'vaultlabel' | 'vault_tok' | 'gate_epoch' | 'ask_passphrase_at'>

/** The ctx's first part: the lease record's format. */
const LeaseFormat = 'safebyok-lease-v1'

/** The usages of the handle an opened lease holds: wrapping and unwrapping boxKeys, never exported. */
const SessionUsage = { extractable: false, usage: ['wrapKey', 'unwrapKey'] } as const

/** What {@link Lease.grant} binds: the scope, the vault props it was proven against, and the deadline, held to what its record will hold. */
const LeaseGrant = Z.pick(LeaseRecord, { applabel: true, user_id: true, vaultlabel: true, vault_tok: true, gate_epoch: true, ask_passphrase_at: true })

/** The fields of a lease its wrap is bound to: every field of its record but its format, the leaseKey and the wrap. */
type LeaseBinding = Z.infer<typeof LeaseGrant>

/** The ctx a lease's wrap is bound to: every field of its record but the leaseKey and the wrap, and the purpose.
 * A lease is one; so is what {@link Lease.grant} is about to make one of.
 */
const leaseCtxOf = (lease: LeaseBinding): Uint8Array => (
  cipherCtx(LeaseFormat, lease.applabel, lease.user_id, lease.vaultlabel, lease.vault_tok, lease.gate_epoch, lease.ask_passphrase_at, 'vault_key_lease_wrapped')
)

/** This device's lease on one vault: the vaultKey under a leaseKey that never leaves this browser profile, and the instant it ends.
 * Its visible fields (the scope, `vault_tok`, `gate_epoch` and `ask_passphrase_at`) are its own,
 * read-only: `{ ...lease }`, `toJSON()` and a log line show each once. The leaseKey, the wrap and
 * the format stay in its `record`, which the device store keeps by structured clone. Nothing of a
 * lease reaches the backend.
 *
 * A lease is opened or not. One read from the device store is not, until `tryOpen` hands back
 * one that is; one `Lease.grant` makes is. An opened lease holds the vaultKey, as a
 * non-extractable handle in a private field that no loop, spread, log line or `JSON.stringify`
 * sees, as are its record and its vault, and wraps and unwraps boxKeys under it until it ends:
 * what a box seals and opens with.
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
  /** The stored record, frozen, its wrap with it: the one source of every field. */
  readonly #record: LeaseRecord
  /** The vault it is a lease on: its scope, its lease length and its clock. */
  readonly #vault: LeaseVault
  /** The vaultKey, while this lease is opened: the handle boxKeys are wrapped and unwrapped under. Null until it is. */
  readonly #vaultKey: CryptoKey | null

  /** The app of the vault it is for. */
  readonly applabel:          string
  /** The user of the vault it is for. */
  readonly user_id:           string
  /** The label of the vault it is for. */
  readonly vaultlabel:        string
  /** The token of the vault props it was granted under. */
  readonly vault_tok:         string
  /** The vault props' `gate_epoch` when it was granted: a change of wayins voids it. */
  readonly gate_epoch:        number
  /** The instant from which the lease opens nothing, and the vault asks for a proof. */
  readonly ask_passphrase_at: number

  private constructor(vault: LeaseVault, record: LeaseRecord, vaultKey: CryptoKey | null) {
    this.#record = Object.freeze({ ...record, vault_key_lease_wrapped: Object.freeze({ ...record.vault_key_lease_wrapped }) })
    this.#vault = vault
    this.#vaultKey = vaultKey
    this.applabel          = record.applabel
    this.user_id           = record.user_id
    this.vaultlabel        = record.vaultlabel
    this.vault_tok         = record.vault_tok
    this.gate_epoch        = record.gate_epoch
    this.ask_passphrase_at = record.ask_passphrase_at
    Object.freeze(this)
  }

  /** The stored record, frozen: what the device store keeps of this lease, its leaseKey and wrap among it. */
  get record(): LeaseRecord {
    return this.#record
  }

  /** The lease a stored record stands for on `vault`, not opened; refuses 'corrupt_record' for one this package does not write, or another vault's.
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
    return new Lease(vault, checked.data, null)
  }

  /** A fresh lease on `vault`, opened, under a new non-extractable leaseKey, around the vaultKey a proof just opened against `standing`.
   * It ends the vault's `leaseMillis` from now, never past {@link FarFuture}, which is how
   * `leaseHours: Infinity` reads. It writes nothing: the vault puts `record` in the device store. It
   * throws a Zod error, as misuse, for vault props a {@link LeaseRecord} could not hold.
   *
   * @param standing - The vault props the vaultKey was proven against.
   * @param vaultKeyPair - The vaultKey as a wayin handed it over: its `transientKey` is wrapped, and its `sessionKey` held.
   *
   * @example const lease = await Lease.grant(vault, vaultProps, opened)   // lease.ask_passphrase_at: leaseHours from now
   */
  static async grant(vault: LeaseVault, standing: LeaseStanding, vaultKeyPair: VaultKeyPair): Promise<Lease> {
    const granted = LeaseGrant.parse({
      applabel:          vault.applabel,
      user_id:           vault.user_id,
      vaultlabel:        vault.vaultlabel,
      vault_tok:         standing.vault_tok,
      gate_epoch:        standing.gate_epoch,
      ask_passphrase_at: Math.min(vault.now() + vault.leaseMillis, FarFuture),
    })
    const leaseKey = await makeLeaseKey()
    const wrapped = await wrapKeyUnder(leaseKey, vaultKeyPair.transientKey, leaseCtxOf(granted))
    return new Lease(vault, { format: LeaseFormat, ...granted, lease_key: leaseKey, vault_key_lease_wrapped: wrapped }, vaultKeyPair.sessionKey)
  }

  /** This lease, opened, as a new Lease, while it still fits: `standing` has its `vault_tok` and `gate_epoch`, and the vault's clock reads before its deadline.
   * This lease is left as it was. It refuses 'vault_locked' when the lease has ended, or was granted
   * before a change of wayins or before the vault was made anew. It refuses 'corrupt_record' when it
   * fits and still does not open, its wrap or its leaseKey damaged.
   *
   * @param standing - The vault props as the vault read them now.
   *
   * @example const { ok, val: opened } = await lease.tryOpen(vaultProps)
   * @example await lease.tryOpen({ ...vaultProps, gate_epoch: vaultProps.gate_epoch + 1 })       // refused 'vault_locked': a way in changed since
   */
  async tryOpen(standing: LeaseStanding): Promise<Outcome<Lease>> {
    if (standing.vault_tok !== this.vault_tok || standing.gate_epoch !== this.gate_epoch) {
      return bad(new VaultError('vault_locked', "This device's lease was granted before the vault's ways in changed, or before it was deleted and made anew, so it opens nothing: the vault asks for a proof instead."))
    }
    if (this.endsBy(this.#vault.now())) {
      return bad(new VaultError('vault_locked', "This device's lease has ended: the vault asks for a proof again."))
    }
    try {
      const vaultKey = await unwrapKeyUnder(this.#record.lease_key, this.#record.vault_key_lease_wrapped, leaseCtxOf(this), SessionUsage)
      return good(new Lease(this.#vault, this.#record, vaultKey))
    } catch {
      return bad(new VaultError('corrupt_record', "This device's lease would not open: it may have been damaged where it is kept. The vault asks for a proof instead."))
    }
  }

  /** True when this lease has ended by `instant`: its `ask_passphrase_at` is at or before it.
   * `endsBy(now + renewMillis)` is how `ensureLease({ renewMinutes })` asks ahead of the end.
   *
   * @example lease.endsBy(vault.now())                       // true once it has ended
   * @example lease.endsBy(vault.now() + 60 * MinuteMillis)   // true when it ends within the hour
   */
  endsBy(instant: number): boolean {
    return this.ask_passphrase_at <= instant
  }

  /** `boxKey`, wrapped under the vaultKey this lease holds, bound to `ctx`: what a box seals its boxKey with.
   * Refuses 'vault_locked' when this lease is not opened, or has ended by its vault's clock.
   * `Box.seal` is the call: it builds the ctx.
   *
   * @example const boxKeyWrapped = await lease.wrapBoxKey(boxKey, ctx)
   */
  async wrapBoxKey(boxKey: CryptoKey, ctx: Uint8Array): Promise<Ciphered> {
    return await wrapKeyUnder(this.#openedKey(), boxKey, ctx)
  }

  /** The boxKey `boxKeyWrapped` holds, unwrapped under the vaultKey this lease holds and bound to `ctx`: a non-extractable handle that only deciphers.
   * Refuses 'vault_locked' as {@link wrapBoxKey} does. A wrap that will not open throws WebCrypto's
   * own error, for the box to say as damage. `box.tryOpen` is the call: it builds the ctx.
   *
   * @example const boxKey = await lease.unwrapBoxKey(record.box_key_wrapped, ctx)
   */
  async unwrapBoxKey(boxKeyWrapped: Ciphered, ctx: Uint8Array): Promise<CryptoKey> {
    return await unwrapKeyUnder(this.#openedKey(), boxKeyWrapped, ctx, { extractable: false, usage: ['decrypt'] })
  }

  /** Which vault it opens and until when, each once: all JSON and a log line show of it. */
  toJSON(): LeaseView {
    const { ...visible } = this
    return visible
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
