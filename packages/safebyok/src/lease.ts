/** Leases: what lets a vault open on this device without asking for cleartext, across page loads, until its `ask_passphrase_at`.
 * A lease's wrap and each box's two ciphered fields are bound to two stamps: the vault's, but for
 * its format, and their own ({@link LeaseStamp}, {@link BoxStamp}). A lease holds the vaultKey
 * only wrapped: each cipher and decipher unwraps it for that call alone and keeps nothing. When to
 * grant, when to ask, and the write to the device store are the vault's.
 */

import type { BoxCiphered, BoxRecord, BoxSparse, BoxStamp } from './shapes/box'
import * as BX from './shapes/box'
import { cipherBytes, cipherCtx, decipherBytes, makeBoxKey, makeLeaseKey, unwrapKeyUnder, wrapKeyUnder } from './crypto'
import { VaultError, thrownNameOf } from './errors'
import { heldLeaseOf } from './held-lease'
import * as CX from './shapes/scopes'
import { sameScope } from './names'
import { type Outcome, good, outcomeOf, refusalOf, valOf } from './outcome'
import { Checkers } from './checks/validator'
import { stableJsonify } from './stable-jsonify'
import { LeaseFormat, type LeaseSparse, type LeaseRecord, type LeaseStamp } from './shapes/device'
import * as DX from './shapes/device'
import type { VaultScope } from './shapes/scopes'
import type { VaultSparse, VaultStamp, VaultStampButFormat } from './shapes/vault'
import * as VX from './shapes/vault'
import type { ConsistencyWith } from './types/type-aliases'
import type { Ciphered } from './shapes/fields'
import * as FX from './shapes/fields'
import { FarFuture } from './consts'
import type { Vault } from './vault'
import type { DeviceDB } from './device-db'
import type { VaultLogger } from './logger'

/** The ctx a lease's wrap is bound to: its vault's stamp but for the format, the lease's own {@link LeaseStamp}, and the purpose.
 * Each stamp may come whole, a Vault object or a lease record: only its stamp fields are taken.
 * It refuses 'bad_record' for one missing any of them.
 *
 * @example await wrapKeyUnder(leaseKey, vaultKey, leaseCtxOf(vaultRecord, leaseRecord))
 */
export const leaseCtxOf = (vaultStamp: VaultStampButFormat, leaseStamp: LeaseStamp): Uint8Array => (
  cipherCtx([VX.vaultStampButFormat.parse(vaultStamp), DX.leaseStamp.parse(leaseStamp)], 'vault_key_lease_wrapped')
)

/** The ctx one of a box's two ciphered fields is bound to: its vault's stamp but for the format, the box's own {@link BoxStamp}, and the purpose, which names the field.
 * The box's sidecar is bound as its JSON with keys sorted. The vault's stamp may come whole, a
 * Vault object or a vault record: only its stamp fields are taken. It refuses 'bad_record' for a
 * stamp missing any field, or a box stamp holding any other.
 *
 * @example await cipherBytes(boxKey, whisperBytes, boxCtxOf(vault, { ...visible, vault_tok: vault.vault_tok }, 'whisper_ciphered'))
 */
export const boxCtxOf = (vaultStamp: VaultStampButFormat, boxStamp: BoxStamp, purpose: 'box_key_wrapped' | 'whisper_ciphered'): Uint8Array => {
  const { sidecar, ...stamp } = BX.boxStamp.parse(boxStamp)
  return cipherCtx([VX.vaultStampButFormat.parse(vaultStamp), { ...stamp, sidecar: stableJsonify(sidecar)! }], purpose)
}

/** This device's lease on one vault: the vaultKey wrapped under a leaseKey that never leaves this browser profile, and the instant it ends.
 * A lease is made once and never changed. Its own fields are its {@link LeaseSparse}, frozen: all
 * `{ ...lease }`, JSON and a log line show. `vault.demandConsistentWith` judges its scope,
 * `vault_tok` and `gate_epoch`. The leaseKey and the wrap stay in its private record, which no
 * getter, spread or JSON yields; the device store keeps it by structured clone. Nothing of a lease
 * reaches the backend.
 *
 * Nothing is unwrapped when a lease is made. Each cipher and decipher unwraps the vaultKey for
 * that call alone, as a non-extractable handle, and keeps nothing. Each demands, lease-bound, that
 * the lease is consistent with its vault before and after its wait: a lock, a change of wayins, or
 * the vault deleted or made anew meanwhile refuses as `vault.demandConsistentWith` says.
 *
 * A lease whose vaultKey will not unwrap refuses 'damaged_lease', and the vault drops it as
 * `lock()` does, erasing it from the device store. A hello does not mend it; unlocking again does.
 * A bug met in any method here past its argument checks (a throw that is no VaultError) arrives as
 * 'unexpected_error', never raw; each `try` form is one {@link outcomeOf} over its throwing form.
 *
 * Anyone who can use this browser profile while a lease is in force can open the vault: `leaseHours`
 * is that tradeoff, and `lock()` erases the lease at once.
 *
 * @example
 *   const record = valOf(await deviceDB.tryGetLease(scope))   // null when this device holds none
 *   const lease = Lease.make(vault, record)                 // once it is not null
 *   lease.ask_passphrase_at               // when the vault asks again
 * @example JSON.stringify(lease)   // its format, scope, vault_tok, gate_epoch and ask_passphrase_at: no key material
 */
export class Lease implements LeaseSparse {
  /** The stored record, frozen, its wrap with it: the one source of every field. */
  readonly #record: LeaseRecord
  /** The vault it is a lease on: its stamp, which each ctx here binds, its demand and its lock. Whether the vault holds this lease is asked inside the package, as no getter shows it. */
  readonly #vault: ConsistencyWith<VaultStamp & Pick<Vault, 'tryLock'>>

  /** The lease record's format, `safebyok-lease-v1`. */
  readonly format:            LeaseStamp['format']
  /** The app of the vault it is for. */
  readonly applabel:          string
  /** The user of the vault it is for. */
  readonly user_id:           string
  /** The label of the vault it is for. */
  readonly vaultlabel:        string
  /** The token of the vault it was granted under. */
  readonly vault_tok:         string
  /** The vault record's `gate_epoch` when it was granted: a change of wayins voids it. */
  readonly gate_epoch:        number
  /** The instant from which the lease opens nothing, and the vault asks for cleartext again. */
  readonly ask_passphrase_at: number

  private constructor(vault: ConsistencyWith<VaultStamp & Pick<Vault, 'tryLock'>>, record: LeaseRecord) {
    this.#record = Object.freeze({ ...record, vault_key_lease_wrapped: Object.freeze({ ...record.vault_key_lease_wrapped }) })
    this.#vault = vault
    this.format            = record.format
    this.applabel          = record.applabel
    this.user_id           = record.user_id
    this.vaultlabel        = record.vaultlabel
    this.vault_tok         = record.vault_tok
    this.gate_epoch        = record.gate_epoch
    this.ask_passphrase_at = record.ask_passphrase_at
    Object.freeze(this)
  }

  /** The lease a stored record stands for on `vault`; refuses 'corrupt_record' for one this package does not write, or another vault's.
   * The refusal quotes nothing of it, as a lease holds key material. It touches no storage and no
   * key: a wrap that will not open shows at the first cipher or decipher, as 'damaged_lease'.
   *
   * @example const lease = Lease.make(vault, record)   // record: what deviceDB.getLease resolved, once it is not null
   * @example Lease.make(vault, { ...record, ask_passphrase_at: 'soon' })   // throws 'corrupt_record'
   * @example Lease.make(vault, { ...record, user_id: 'someone_else' })   // throws 'corrupt_record': another vault's
   */
  static make(vault: ConsistencyWith<VaultStamp & Pick<Vault, 'tryLock'>>, record: unknown): Lease {
    const checked = DX.leaseRecord.safeParse(record)
    if (! checked.success) {
      throw new VaultError('corrupt_record', "This device's lease is not in a form this package writes, so it can't be taken up: the vault asks for a proof instead.")
    }
    CX.vaultScope.parseConsistent(checked.data, vault, { kind: 'corrupt_record', message: "This device's lease names another app, user or vault than the one opening it, so it can't be taken up: the vault asks for a proof instead." })
    return new Lease(vault, checked.data)
  }

  /** True when this lease has ended by `instant`: its `ask_passphrase_at` is at or before it.
   *
   * @example lease.endsBy(Date.now())                       // true once it has ended
   * @example lease.endsBy(Date.now() + 60 * MinuteMillis)   // true when it ends within the hour
   */
  endsBy(instant: number): boolean {
    return this.ask_passphrase_at <= instant
  }

  /** `serialized` ciphered under a fresh boxKey, that boxKey wrapped under the vaultKey, both bound to `visible`: a box's two ciphered fields.
   * Each ctx is {@link boxCtxOf}'s, for `visible` and this lease's `vault_tok`. Nothing of either
   * key outlives the call, and `serialized` is zeroed, ciphered or not. When the browser's
   * WebCrypto fails to make, wrap or cipher under the keys, it refuses 'crypto_failed': a fault of
   * the platform, not of the box or the lease. That refusal keeps nothing of the error but its
   * name, and the lease stays held.
   *
   * @example const { box_key_wrapped, whisper_ciphered } = await lease.cipheredWith(whisperBytes, visible)
   */
  async cipheredWith(serialized: Uint8Array, visible: BoxSparse): Promise<BoxCiphered> {
    const bytes = serializedBytes.parse(serialized)
    try {
      const header = BX.boxSparse.parse(visible)
      this.#demand()
      const vaultKey = await this.#vaultKeyOrNull('wrapKey')
      this.#demand()
      if (vaultKey === null) { throw this.#dropDamaged() }
      const boxKeyCtx  = this.#boxCtxOf(header, 'box_key_wrapped')
      const whisperCtx = this.#boxCtxOf(header, 'whisper_ciphered')
      let wrapped: Ciphered
      let ciphered: Ciphered
      // The catch holds the three WebCrypto calls alone, each over arguments built above: a failure under fresh keys is the platform's.
      try {
        const boxKey = await makeBoxKey()
        wrapped  = await wrapKeyUnder(vaultKey, boxKey, boxKeyCtx)
        ciphered = await cipherBytes(boxKey, bytes, whisperCtx)
      } catch (err) {
        throw cryptoFailed(err)
      }
      this.#demand()
      return { box_key_wrapped: FX.box_key_wrapped.parse(wrapped), whisper_ciphered: FX.whisper_ciphered.parse(ciphered) }
    } catch (err) {
      throw refusalOf(err)
    } finally {
      bytes.fill(0)
    }
  }

  /** `serialized` ciphered and its boxKey wrapped, as an {@link Outcome}: the non-throwing form of {@link Lease.cipheredWith}. */
  async tryCipheredWith(serialized: Uint8Array, visible: BoxSparse): Promise<Outcome<BoxCiphered>> {
    return await outcomeOf(() => this.cipheredWith(serialized, visible))
  }

  /** The bytes `ciphered` holds, its boxKey unwrapped under the vaultKey, both bound to `visible`: the inverse of {@link Lease.cipheredWith}.
   * It refuses 'damaged_box' when the boxKey will not unwrap or the bytes will not decipher under
   * the ctx: altered in storage, moved from another boxlabel or vault, or sealed under another
   * vaultKey. A fault of WebCrypto itself reads the same, as nothing tells it from a wrong key or
   * an altered record: never 'crypto_failed'. The bytes are the caller's to zero.
   *
   * @example const whisperBytes = await lease.decipherWith(ciphered, visible)
   */
  async decipherWith(ciphered: BoxCiphered, visible: BoxSparse): Promise<Uint8Array> {
    try {
      const sealed = BX.boxCiphered.parse(ciphered)
      const header = BX.boxSparse.parse(visible)
      this.#demand()
      const vaultKey = await this.#vaultKeyOrNull('unwrapKey')
      this.#demand()
      if (vaultKey === null) { throw this.#dropDamaged() }
      const opened = await this.#openedOrNull(vaultKey, sealed, this.#boxCtxOf(header, 'box_key_wrapped'), this.#boxCtxOf(header, 'whisper_ciphered'))
      try {
        this.#demand()
      } catch (err) {
        opened?.fill(0)
        throw err
      }
      if (opened === null) { throw damagedBox() }
      return opened
    } catch (err) {
      throw refusalOf(err)
    }
  }

  /** The bytes `ciphered` holds, as an {@link Outcome}: the non-throwing form of {@link Lease.decipherWith}. */
  async tryDecipherWith(ciphered: BoxCiphered, visible: BoxSparse): Promise<Outcome<Uint8Array>> {
    return await outcomeOf(() => this.decipherWith(ciphered, visible))
  }

  /** A box record: `visible`, beside the two ciphered fields {@link Lease.cipheredWith} makes of `props.whisper`. It refuses as `cipheredWith` does.
   *
   * @example const record = await lease.sealProps(visible, { whisper: whisperBytes })
   */
  async sealProps(visible: BoxSparse, props: { whisper: Uint8Array }): Promise<BoxRecord> {
    try {
      const { whisper } = leaseSealProps.parse(props)
      const header = BX.boxSparse.parse(visible)
      const ciphered = await this.tryCipheredWith(whisper, header)
      // A lease that refused its own use (damaged_lease) has dropped itself: only the vault half is asked then.
      this.#vault.demandConsistentWith(this, { leaseBound: ciphered.ok })
      return { ...header, ...valOf(ciphered) }
    } catch (err) {
      throw refusalOf(err)
    }
  }

  /** The record `visible` makes with its whisper sealed, as an {@link Outcome}: the non-throwing form of {@link Lease.sealProps}. */
  async trySealProps(visible: BoxSparse, props: { whisper: Uint8Array }): Promise<Outcome<BoxRecord>> {
    return await outcomeOf(() => this.sealProps(visible, props))
  }

  /** Demand, lease-bound, that this lease is consistent with its vault. Ask it before and after each wait. */
  #demand() {
    this.#vault.demandConsistentWith(this, { leaseBound: true })
  }

  /** The vaultKey, unwrapped under the leaseKey as a non-extractable handle that may only `usage`; null when it will not unwrap.
   * Only the unwrap itself can read as null: its ctx is built before the catch, so a vault stamp
   * that fails its check refuses 'bad_record', never as a damaged lease.
   */
  async #vaultKeyOrNull(usage: 'wrapKey' | 'unwrapKey'): Promise<CryptoKey | null> {
    const ctx = leaseCtxOf(this.#vault, this.#record)
    try {
      return await unwrapKeyUnder(this.#record.lease_key, this.#record.vault_key_lease_wrapped, ctx, { extractable: false, usage: [usage] })
    } catch {
      return null
    }
  }

  /** The bytes `sealed` holds: its boxKey unwrapped under `vaultKey`, non-extractable and `decrypt` only, and the bytes deciphered under it, each bound to its ctx; null when either will not.
   * WebCrypto's own refusal says nothing a caller can act on, so each catch holds that one call
   * alone, and nothing else here can read as null.
   */
  async #openedOrNull(vaultKey: CryptoKey, sealed: BoxCiphered, boxKeyCtx: Uint8Array, whisperCtx: Uint8Array): Promise<Uint8Array | null> {
    let boxKey: CryptoKey
    try {
      boxKey = await unwrapKeyUnder(vaultKey, sealed.box_key_wrapped, boxKeyCtx, BoxKeyUsage)
    } catch {
      return null
    }
    try {
      return await decipherBytes(boxKey, sealed.whisper_ciphered, whisperCtx)
    } catch {
      return null
    }
  }

  /** Drop this lease, damaged, as `lock()` drops it, when it is the one its vault holds, and say so as 'damaged_lease': a newer lease, granted meanwhile, is kept. */
  #dropDamaged(): VaultError {
    if (heldLeaseOf(this.#vault) === this) { void this.#vault.tryLock() }
    return damagedLease()
  }

  /** The ctx a box's ciphered field is bound to: {@link boxCtxOf}'s, for this lease's vault, `visible` and this lease's `vault_tok`. */
  #boxCtxOf(visible: BoxSparse, purpose: 'box_key_wrapped' | 'whisper_ciphered'): Uint8Array {
    return boxCtxOf(this.#vault, { ...visible, vault_tok: this.vault_tok }, purpose)
  }
}

/** A lease as this device's store kept it, fetched but not yet taken up: its record held closed, its stamp showing. What {@link CachedLease.tryGet} hands the bank's birth, the vault's refresh and its pantry consult, so that no code but a Lease, a Proving and the store ever holds a lease record.
 * Its own fields are its {@link LeaseSparse}, which a revocation check compares; the leaseKey and
 * the wrap stay inside, for the Lease that {@link CachedLease.leaseOn} makes once a Vault object takes
 * it up. Frozen, and shown in a spread, JSON or a log line by its sparse fields alone.
 *
 * @example const cached = valOf(await CachedLease.tryGet(deviceDB, scope, { logger, call: 'hello' }))   // null when this device holds none
 * @example const lease = cached.leaseOn(vault)   // Lease.make, of the record kept inside
 */
export class CachedLease implements LeaseSparse {
  /** The stored record, checked, its leaseKey and wrap among it: never shown. */
  readonly #record: LeaseRecord

  /** The lease record's format, `safebyok-lease-v1`. */
  readonly format:            LeaseStamp['format']
  /** The app of the vault it is for. */
  readonly applabel:          string
  /** The user of the vault it is for. */
  readonly user_id:           string
  /** The label of the vault it is for. */
  readonly vaultlabel:        string
  /** The token of the vault it was granted under. */
  readonly vault_tok:         string
  /** The vault record's `gate_epoch` when it was granted. */
  readonly gate_epoch:        number
  /** The instant from which the lease opens nothing. */
  readonly ask_passphrase_at: number

  private constructor(record: LeaseRecord) {
    this.#record = record
    this.format            = record.format
    this.applabel          = record.applabel
    this.user_id           = record.user_id
    this.vaultlabel        = record.vaultlabel
    this.vault_tok         = record.vault_tok
    this.gate_epoch        = record.gate_epoch
    this.ask_passphrase_at = record.ask_passphrase_at
    Object.freeze(this)
  }

  /** This device's lease on `scope`, as `deviceDB` keeps it, held closed; null for none. `DeviceDB.tryGetLease`, its answer checked as a {@link LeaseRecord} of `scope`.
   * What the store hands back that is no lease of this scope reads as none, left where it lies:
   * another vault's, or a host store's mistake, which the next grant writes over. A caller about to
   * take the lease up passes `told`, and its logger is warned once under `told.call`, quoting
   * nothing of the record; the refresh, which asks only whether the lease in hand still stands
   * beside it, passes none and says nothing. The store's own refusal comes through as the
   * outcome.
   *
   * @example const cached = valOf(await CachedLease.tryGet(deviceDB, scope, { logger, call: 'ensureUnlocked' }))
   * @example const beside = valOf(await CachedLease.tryGet(deviceDB, scope))   // the refresh's look, told to no one
   */
  static async tryGet(deviceDB: Pick<DeviceDB, 'tryGetLease'>, scope: VaultScope, told?: { logger: VaultLogger, call: 'hello' | 'ensureUnlocked' }): Promise<Outcome<CachedLease | null>> {
    const cached = await deviceDB.tryGetLease(scope)
    if (! cached.ok) { return cached }
    if (cached.val === null) { return good(null) }
    const checked = DX.leaseRecord.safeParse(cached.val)
    if (! checked.success || ! sameScope(checked.data, scope)) {
      // Neither the record nor what it failed is told: the record may hold key material.
      told?.logger.warn("This device's lease could not be read as a lease of this vault, so it counts as none and was left where it lies: the vault asks for the passphrase, and the next unlock writes over it.", { call: told.call })
      return good(null)
    }
    return good(new CachedLease(checked.data))
  }

  /** The Lease this cached record stands for on `vault`: {@link Lease.make} of the record, which refuses 'corrupt_record' as that does.
   *
   * @example const lease = cached.leaseOn(vault)
   */
  leaseOn(vault: ConsistencyWith<VaultStamp & Pick<Vault, 'tryLock'>>): Lease {
    return Lease.make(vault, this.#record)
  }
}

/** A lease record wrapping `vaultKey` under a new non-extractable leaseKey, granted under `held`, the vault record held.
 * `vaultKey` is the one a proving just unwrapped from `held`'s gate. The wrap binds `held`'s stamp,
 * and the lease is granted under its `gate_epoch`. `vaultKey` must be extractable, to be wrapped:
 * keep it only for this call.
 *
 * It ends `grant.leaseMillis` (the vault's lease length) after `grant.now`, never past
 * {@link FarFuture}, which is how `leaseHours: Infinity` reads. It writes nothing: put the record
 * in the device store, and make the Lease from what was stored. It refuses 'bad_record', as
 * misuse, for a vault record a {@link LeaseRecord} could not hold.
 *
 * @example const record = await sealLeaseRecord(vaultRecord, vaultKey, { leaseMillis, now })   // record.ask_passphrase_at: leaseMillis from now
 */
export const sealLeaseRecord = async (held: VaultStampButFormat & Pick<VaultSparse, 'gate_epoch'>, vaultKey: CryptoKey, grant: { leaseMillis: number, now: number }): Promise<LeaseRecord> => {
  const { applabel, user_id, vaultlabel, vault_tok, gate_epoch } = held
  const granted = DX.leaseGrant.parse({ applabel, user_id, vaultlabel, vault_tok, gate_epoch, ask_passphrase_at: Math.min(grant.now + grant.leaseMillis, FarFuture) })
  const stamp = { format: LeaseFormat, ...granted } as const
  const leaseKey = await makeLeaseKey()
  const wrapped = await wrapKeyUnder(leaseKey, vaultKey, leaseCtxOf(held, stamp))
  return { ...stamp, lease_key: leaseKey, vault_key_lease_wrapped: FX.vault_key_lease_wrapped.parse(wrapped) }
}

/** What an unwrapped boxKey may do: decipher, never be exported. */
const BoxKeyUsage = { extractable: false, usage: ['decrypt'] } as const


/** What a lease ciphers, bytes judged by their tag, so bytes from another realm (a test's jsdom, an iframe) pass; and what {@link Lease.sealProps} seals with, the whisper's bytes and nothing else. Each `parse` refuses 'bad_option'. */
const { serializedBytes, leaseSealProps } = Checkers('bad_option', ({ obj, bytes }) => ({
  serializedBytes: bytes(),
  leaseSealProps:  obj({ whisper: bytes() }).strict(),
}))

/** The 'crypto_failed' refusal for a cipher the browser's WebCrypto failed under keys just made, `thrown` what it threw.
 * Only the error's `name` is kept, ending the message: nothing else of `thrown`, not as a `cause`.
 */
const cryptoFailed = (thrown: unknown): VaultError => {
  const thrownName = thrownNameOf(thrown)
  const named = thrownName === null ? '' : ` WebCrypto threw ${thrownName}.`
  return new VaultError('crypto_failed', `This browser's cryptography failed as the box was sealed, so nothing was stored: a fault of the browser or the device, not of the box or the vault. Try again; if it fails every time, this browser cannot keep secrets for the app just now.${named}`)
}

/** The refusal of a lease whose vaultKey will not unwrap under its leaseKey. */
const damagedLease = () => new VaultError('damaged_lease', "This device's lease would not open: it may have been damaged where it is kept. It was erased, and the vault is locked: unlock it again to carry on. Reading the vault again does not mend it; a new unlock does.")

/** The refusal of a box that will not open under the vaultKey, naming nothing of it. */
const damagedBox = () => new VaultError('damaged_box', "That box would not open under this vault's key, so it is damaged: altered in storage, moved there from somewhere else, or sealed by a vault deleted and made anew on another device since this one read it. It was left as it is. Read the vault again, with hello({ staleMinutes: 0 }), to see what is stored: a vault made anew elsewhere locks this device, to be unlocked afresh. If the box still will not open, remove it, or store its whisper again over it.")
