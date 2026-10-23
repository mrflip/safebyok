import * as Z from 'zod/mini'
import { BoxRecord } from './box'
import { Ciphered, cipherBytes, cipherCtx, decipherBytes, makeBoxKey, makeLeaseKey, unwrapKeyUnder, wrapKeyUnder } from './crypto'
import { VaultError } from './errors'
import { heldLeaseOf } from './held-lease'
import { sameScope } from './names'
import { type Outcome, outcomeOf, unexpectedError, valOf } from './outcome'
import { stableJsonify } from './stable-jsonify'
import { FarFuture, LeaseRecord, type VaultProps } from './types'
import type { Vault } from './vault'

/** Leases: what lets a vault open on this device without a proof, across page loads, until its `ask_passphrase_at`.
 * A lease's wrap is bound to the scope, the props' `vault_tok` and `gate_epoch` at the grant, and
 * the deadline. A lease holds the vaultKey only wrapped: each cipher and decipher unwraps it for
 * that call alone and keeps nothing. When to grant, when to ask, and the write to the device store
 * are the vault's.
 */

/** The slice of a {@link Vault} a lease reads: the scope every lease of it names, how long a grant lasts, its clock, its demand, and its lock. Whether it is the lease the vault holds, it asks inside the package, as no getter shows that one. */
export type LeaseVault = Pick<Vault, 'applabel' | 'user_id' | 'vaultlabel' | 'leaseMillis' | 'now' | 'demandConsistentWith' | 'tryLock'>

/** The vault props a lease is granted under: their `vault_tok` and `gate_epoch`, which its wrap is bound to. A whole {@link VaultProps} is one. */
export type LeaseStanding = Pick<VaultProps, 'vault_tok' | 'gate_epoch'>

/** A lease's visible fields, each once: which vault it opens and until when, as `{ ...lease }` and `lease.toJSON()` hold them. */
export type LeaseView = Pick<LeaseRecord, 'applabel' | 'user_id' | 'vaultlabel' | 'vault_tok' | 'gate_epoch' | 'ask_passphrase_at'>

/** A box record's visible fields: every field but its two ciphered ones. What {@link Lease.cipheredWith} binds a whisper to, and its ctx is rebuilt from. */
export type BoxVisible = Omit<BoxRecord, 'box_key_wrapped' | 'whisper_ciphered'>

/** A box's two ciphered fields: its boxKey wrapped under the vaultKey, and the whisper ciphered under that boxKey. */
export type BoxCiphered = Pick<BoxRecord, 'box_key_wrapped' | 'whisper_ciphered'>

/** The ctx's first part: the lease record's format. */
const LeaseFormat = 'safebyok-lease-v1'

/** What {@link sealLeaseRecord} binds: the scope, the vault props it was proven against, and the deadline, held to what its record will hold. */
const LeaseGrant = Z.pick(LeaseRecord, { applabel: true, user_id: true, vaultlabel: true, vault_tok: true, gate_epoch: true, ask_passphrase_at: true })

/** The fields of a lease its wrap is bound to: every field of its record but its format, the leaseKey and the wrap. */
type LeaseBinding = Z.infer<typeof LeaseGrant>

/** The ctx a lease's wrap is bound to: every field of its record but the leaseKey and the wrap, and the purpose.
 * A lease is one; so is what {@link sealLeaseRecord} is about to make one of.
 */
const leaseCtxOf = (lease: LeaseBinding): Uint8Array => (
  cipherCtx(LeaseFormat, lease.applabel, lease.user_id, lease.vaultlabel, lease.vault_tok, lease.gate_epoch, lease.ask_passphrase_at, 'vault_key_lease_wrapped')
)

/** Reads a lease's record from inside this module: set once, by the class's static block. */
let recordOf: (lease: Lease) => LeaseRecord

/** This device's lease on one vault: the vaultKey wrapped under a leaseKey that never leaves this browser profile, and the instant it ends.
 * Its visible fields (the scope, `vault_tok`, `gate_epoch` and `ask_passphrase_at`) are its own,
 * read-only: `{ ...lease }`, `toJSON()` and a log line show each once. They are its stamp, which
 * `vault.demandConsistentWith` judges. The leaseKey, the wrap and the format stay in its record,
 * private, which no getter, spread or JSON yields: the device store keeps it by structured clone.
 * Nothing of a lease reaches the backend.
 *
 * A lease is usable as read: nothing is unwrapped when it is made. Each {@link Lease.cipheredWith}
 * and {@link Lease.decipherWith} unwraps the vaultKey for that call alone, as a non-extractable
 * handle, and keeps nothing. A lease whose vaultKey will not unwrap is damaged, `damaged_lease`,
 * and the vault drops it as `lock()` does, erasing it from the device store: a hello does not
 * mend it, and a new unlock does.
 *
 * Anyone who can use this browser profile while a lease stands can open the vault: `leaseHours`
 * is that tradeoff, and `lock()` erases the lease at once.
 *
 * @example
 *   const record = valOf(await deviceDB.getLease(scope))   // null when this device holds none
 *   const lease = Lease.make(vault, record)                 // once it is not null
 *   lease.ask_passphrase_at               // when the vault asks again
 */
export class Lease {
  /** The stored record, frozen, its wrap with it: the one source of every field. */
  readonly #record: LeaseRecord
  /** The vault it is a lease on: its scope, its clock, its demand and its lock. */
  readonly #vault: LeaseVault

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

  private constructor(vault: LeaseVault, record: LeaseRecord) {
    this.#record = Object.freeze({ ...record, vault_key_lease_wrapped: Object.freeze({ ...record.vault_key_lease_wrapped }) })
    this.#vault = vault
    this.applabel          = record.applabel
    this.user_id           = record.user_id
    this.vaultlabel        = record.vaultlabel
    this.vault_tok         = record.vault_tok
    this.gate_epoch        = record.gate_epoch
    this.ask_passphrase_at = record.ask_passphrase_at
    Object.freeze(this)
  }

  static {
    recordOf = (lease) => lease.#record
  }

  /** The lease a stored record stands for on `vault`; refuses 'corrupt_record' for one this package does not write, or another vault's.
   * The refusal quotes nothing of it, as a lease holds key material. It touches no storage and no
   * key: a wrap that will not open shows at the first cipher or decipher, as 'damaged_lease'.
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

  /** True when this lease has ended by `instant`: its `ask_passphrase_at` is at or before it.
   * `endsBy(now + renewMillis)` is how `ensureUnlocked({ renewMinutes })` asks ahead of the end.
   *
   * @example lease.endsBy(vault.now())                       // true once it has ended
   * @example lease.endsBy(vault.now() + 60 * MinuteMillis)   // true when it ends within the hour
   */
  endsBy(instant: number): boolean {
    return this.ask_passphrase_at <= instant
  }

  /** `serialized` ciphered under a fresh boxKey, that boxKey wrapped under the vaultKey, both bound to `visible`: a box's two ciphered fields.
   * It demands, lease-bound, that this lease is consistent with its vault before and after its
   * wait: a lock, a change of the ways in, or the vault deleted or made anew meanwhile refuses as
   * `vault.demandConsistentWith` says. Each ctx is rebuilt from this lease's scope and `vault_tok`
   * and every field of `visible`. Nothing of either key outlives the call, and `serialized` is
   * zeroed, ciphered or not. Refuses 'damaged_lease' when the vaultKey will not unwrap, dropping
   * the lease as `lock()` does. `Box.seal` is the call.
   *
   * @example const { box_key_wrapped, whisper_ciphered } = await lease.cipheredWith(whisperBytes, visible)
   */
  async cipheredWith(serialized: Uint8Array, visible: BoxVisible): Promise<BoxCiphered> { return valOf(await this.tryCipheredWith(serialized, visible)) }

  /** `serialized` ciphered and its boxKey wrapped, as an {@link Outcome}: the non-throwing form of {@link Lease.cipheredWith}. */
  async tryCipheredWith(serialized: Uint8Array, visible: BoxVisible): Promise<Outcome<BoxCiphered>> {
    return await outcomeOf(async () => {
      const bytes = checkedBytes(serialized)
      try {
        const header = checkedVisible(visible)
        this.#demand()
        const vaultKey = await this.#vaultKeyOrNull('wrapKey')
        this.#demand()
        if (vaultKey === null) { throw this.#dropDamaged() }
        const sealing = await outcomeOf(async () => {
          const boxKey = await makeBoxKey()
          return {
            box_key_wrapped:  await wrapKeyUnder(vaultKey, boxKey, this.#boxCtxOf(header, 'box_key_wrapped')),
            whisper_ciphered: await cipherBytes(boxKey, bytes, this.#boxCtxOf(header, 'whisper_ciphered')),
          }
        }, unexpectedError)
        this.#demand()
        return valOf(sealing)
      } finally {
        bytes.fill(0)
      }
    }, unexpectedError)
  }

  /** The bytes `ciphered` holds, its boxKey unwrapped under the vaultKey, both bound to `visible`: the inverse of {@link Lease.cipheredWith}.
   * It demands as `cipheredWith` does, before and after. Refuses 'damaged_lease' when the vaultKey
   * will not unwrap, dropping the lease as `lock()` does, and 'damaged_box' when the boxKey will not
   * unwrap or the bytes will not decipher under the ctx: altered in storage, moved from another
   * boxlabel or vault, or sealed under another vaultKey. The bytes are the caller's to zero.
   * `box.extractWhisper` is the call.
   *
   * @example const whisperBytes = await lease.decipherWith(ciphered, visible)
   */
  async decipherWith(ciphered: BoxCiphered, visible: BoxVisible): Promise<Uint8Array> { return valOf(await this.tryDecipherWith(ciphered, visible)) }

  /** The bytes `ciphered` holds, as an {@link Outcome}: the non-throwing form of {@link Lease.decipherWith}. */
  async tryDecipherWith(ciphered: BoxCiphered, visible: BoxVisible): Promise<Outcome<Uint8Array>> {
    return await outcomeOf(async () => {
      const sealed = checkedCiphered(ciphered)
      const header = checkedVisible(visible)
      this.#demand()
      const vaultKey = await this.#vaultKeyOrNull('unwrapKey')
      this.#demand()
      if (vaultKey === null) { throw this.#dropDamaged() }
      // WebCrypto's own refusal says nothing a caller can act on: a box that will not open is damaged.
      const opened = await outcomeOf(async () => {
        const boxKey = await unwrapKeyUnder(vaultKey, sealed.box_key_wrapped, this.#boxCtxOf(header, 'box_key_wrapped'), BoxKeyUsage)
        return await decipherBytes(boxKey, sealed.whisper_ciphered, this.#boxCtxOf(header, 'whisper_ciphered'))
      }, damagedBox)
      try {
        this.#demand()
      } catch (err) {
        if (opened.ok) { opened.val.fill(0) }
        throw err
      }
      return valOf(opened)
    }, unexpectedError)
  }

  /** The record `visible` makes with its whisper sealed: `visible`, beside the two ciphered fields {@link Lease.cipheredWith} makes of `props.whisper`, its one wait.
   * It refuses as `cipheredWith` does. `Box.seal` is the call.
   *
   * @example const record = await lease.sealProps(visible, { whisper: whisperBytes })
   */
  async sealProps(visible: BoxVisible, props: { whisper: Uint8Array }): Promise<BoxRecord> { return valOf(await this.trySealProps(visible, props)) }

  /** The record `visible` makes with its whisper sealed, as an {@link Outcome}: the non-throwing form of {@link Lease.sealProps}. */
  async trySealProps(visible: BoxVisible, props: { whisper: Uint8Array }): Promise<Outcome<BoxRecord>> {
    return await outcomeOf(async () => {
      const sealing = checkSealProps(props)
      const header = checkedVisible(visible)
      const ciphered = valOf(await this.tryCipheredWith(sealing.whisper, header))
      return { ...header, ...ciphered }
    }, unexpectedError)
  }

  /** Which vault it opens and until when, each once: all JSON and a log line show of it. */
  toJSON(): LeaseView {
    const { ...visible } = this
    return visible
  }

  /** Demand, lease-bound, that this lease is consistent with its vault: what each cipher and decipher asks before and after its wait. */
  #demand() {
    this.#vault.demandConsistentWith(this, { leaseBound: true })
  }

  /** The vaultKey, unwrapped under the leaseKey as a non-extractable handle that may only `usage`; null when it will not unwrap. */
  async #vaultKeyOrNull(usage: 'wrapKey' | 'unwrapKey'): Promise<CryptoKey | null> {
    try {
      return await unwrapKeyUnder(this.#record.lease_key, this.#record.vault_key_lease_wrapped, leaseCtxOf(this), { extractable: false, usage: [usage] })
    } catch {
      return null
    }
  }

  /** Drop this lease, damaged, as `lock()` drops it, when it is the one its vault holds, and say so as 'damaged_lease': a newer lease, granted meanwhile, stands. */
  #dropDamaged(): VaultError {
    if (heldLeaseOf(this.#vault) === this) { void this.#vault.tryLock() }
    return damagedLease()
  }

  /** The ctx a box's ciphered field is bound to: the box format, this lease's scope and `vault_tok`, the purpose, and every other visible field, the sidecar as its JSON with keys sorted. See VOCABULARY.md on ctx. */
  #boxCtxOf(visible: BoxVisible, purpose: 'box_key_wrapped' | 'whisper_ciphered'): Uint8Array {
    const { format, ...header } = visible
    return cipherCtx(format, this.applabel, this.user_id, this.vaultlabel, this.vault_tok, purpose, { ...header, sidecar: stableJsonify(header.sidecar)! })
  }
}

/** The record `lease` stands for, frozen, its leaseKey and wrapped vaultKey among it: for this package's own code and tests alone.
 * A Lease shows no getter, field or JSON of it, so whatever holds one cannot unwrap the vaultKey
 * extractable. The package's entry points export none of this.
 */
export const leaseRecordOf = (lease: Lease): LeaseRecord => recordOf(lease)

/** A lease record for `vault`, under a new non-extractable leaseKey, around `vaultKey`, which a proof just opened against `standing`.
 * It ends the vault's `leaseMillis` from now, never past {@link FarFuture}, which is how
 * `leaseHours: Infinity` reads. It writes nothing: the vault puts the record in the device store,
 * and makes its Lease from what was stored. `vaultKey` must be extractable, to be wrapped: keep it
 * only for this call. It throws a Zod error, as misuse, for vault props a {@link LeaseRecord} could
 * not hold.
 *
 * @example const record = await sealLeaseRecord(vault, vaultProps, vaultKey)   // record.ask_passphrase_at: leaseHours from now
 */
export const sealLeaseRecord = async (vault: Pick<LeaseVault, 'applabel' | 'user_id' | 'vaultlabel' | 'leaseMillis' | 'now'>, standing: LeaseStanding, vaultKey: CryptoKey): Promise<LeaseRecord> => {
  const granted = LeaseGrant.parse({
    applabel:          vault.applabel,
    user_id:           vault.user_id,
    vaultlabel:        vault.vaultlabel,
    vault_tok:         standing.vault_tok,
    gate_epoch:        standing.gate_epoch,
    ask_passphrase_at: Math.min(vault.now() + vault.leaseMillis, FarFuture),
  })
  const leaseKey = await makeLeaseKey()
  const wrapped = await wrapKeyUnder(leaseKey, vaultKey, leaseCtxOf(granted))
  return { format: LeaseFormat, ...granted, lease_key: leaseKey, vault_key_lease_wrapped: wrapped }
}

/** What an unwrapped boxKey may do: decipher, never be exported. */
const BoxKeyUsage = { extractable: false, usage: ['decrypt'] } as const

/** A box record's visible fields, as {@link BoxVisible} has them. */
const VisibleShape = Z.omit(BoxRecord, { box_key_wrapped: true, whisper_ciphered: true })

/** A box's two ciphered fields, as {@link BoxCiphered} has them. */
const CipheredShape = Z.object({ box_key_wrapped: Ciphered, whisper_ciphered: Ciphered })

/** `visible`, once it is a box record's visible fields: 'bad_record' otherwise, quoting none of it. */
const checkedVisible = (visible: unknown): BoxVisible => {
  const checked = VisibleShape.safeParse(visible)
  if (! checked.success) {
    throw new VaultError('bad_record', "A lease ciphers and deciphers a box bound to that box's visible fields: every field of a box record but box_key_wrapped and whisper_ciphered, as Box.seal and box.extractWhisper hand them in.")
  }
  return checked.data
}

/** `ciphered`, once it is a box's two ciphered fields: 'bad_record' otherwise, quoting none of it. */
const checkedCiphered = (ciphered: unknown): BoxCiphered => {
  const checked = CipheredShape.safeParse(ciphered)
  if (! checked.success) {
    throw new VaultError('bad_record', "A lease deciphers a box's two ciphered fields, box_key_wrapped and whisper_ciphered, as a box record holds them.")
  }
  return checked.data
}

/** `serialized`, once it is bytes: 'bad_option' otherwise. Judged by its tag, not `instanceof`, so bytes from another realm (a test's jsdom, an iframe) pass. */
const checkedBytes = (serialized: unknown): Uint8Array => {
  if (! ArrayBuffer.isView(serialized) || Object.prototype.toString.call(serialized) !== '[object Uint8Array]') {
    throw new VaultError('bad_option', 'A lease ciphers bytes, a Uint8Array: the whisper serialized, as Box.seal hands it in.')
  }
  return serialized as Uint8Array
}

/** `props`, once it names the whisper's bytes and nothing else: 'bad_option' otherwise. */
const checkSealProps = (props: unknown): { whisper: Uint8Array } => {
  if (typeof props !== 'object' || props === null || Object.keys(props).some((field) => field !== 'whisper')) {
    throw new VaultError('bad_option', "lease.sealProps seals one prop, `whisper`, the whisper's bytes: check its spelling, and leave out any other.")
  }
  return { whisper: checkedBytes((props as { whisper?: unknown }).whisper) }
}

/** The refusal of a lease whose vaultKey will not unwrap under its leaseKey. */
const damagedLease = () => new VaultError('damaged_lease', "This device's lease would not open: it may have been damaged where it is kept. It was erased, and the vault is locked: unlock it again to carry on. Reading the vault again does not mend it; a new unlock does.")

/** The refusal of a box that will not open under the vaultKey, naming nothing of it. */
const damagedBox = () => new VaultError('damaged_box', "That box would not open under this vault's key, so it is damaged: altered in storage, moved there from somewhere else, or sealed by a vault deleted and made anew on another device since this one read it. It was left as it is. Read the vault again, with hello({ staleMinutes: 0 }), to see what stands: a vault made anew elsewhere locks this device, to be unlocked afresh. If the box still will not open, remove it, or store its whisper again over it.")
