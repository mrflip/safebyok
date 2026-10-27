import type * as Z from 'zod'
import { BoxRecord, BoxSparse, BoxStamp } from './box'
import { cipherBytes, cipherCtx, decipherBytes, makeBoxKey, makeLeaseKey, unwrapKeyUnder, wrapKeyUnder } from './crypto'
import { VaultError } from './errors'
import { heldLeaseOf } from './held-lease'
import { sameScope } from './names'
import { type Outcome, outcomeOf, valOf } from './outcome'
import { Validator } from './checks/validator'
import { stableJsonify } from './stable-jsonify'
import { LeaseRecord } from './types/types'
import { type VaultSparse, type VaultStamp, VaultStampButFormat } from './vault-record'
import { type ConsistencyWith, box_key_wrapped, vault_key_lease_wrapped, whisper_ciphered } from './types/type-aliases'
import { FarFuture } from './consts'
import type { Vault } from './vault'

/** Leases: what lets a vault open on this device without a proof, across page loads, until its `ask_passphrase_at`.
 * A lease's wrap and each box's two ciphered fields are bound to two stamps: the vault's, but for
 * its format, and their own. A lease's own is its format, scope, the vault record's `vault_tok` and
 * `gate_epoch` at the grant, and the deadline. A lease holds the vaultKey only wrapped: each cipher
 * and decipher unwraps it for that call alone and keeps nothing. When to grant, when to ask, and
 * the write to the device store are the vault's.
 */

/** A lease's stamp: its record but for its key material, every field fixed for its life, as a lease is made once and never changed. Its `parse` refuses 'bad_record'.
 * A lease is granted under one `gate_epoch`, so its stamp holds that epoch, as a reference to the
 * gate it was granted under. Its wrap's ctx holds the whole of it, beside its vault's stamp.
 *
 * @example { format: 'safebyok-lease-v1', ...scope, vault_tok: 'Qm9vdA', gate_epoch: 2, ask_passphrase_at: 1_900_000_000_000 }
 */
export const { LeaseStamp } = Validator('bad_record', () => ({ LeaseStamp: LeaseRecord.omit({ lease_key: true, vault_key_lease_wrapped: true }) }))
export type LeaseStamp = Z.infer<typeof LeaseStamp>

/** A lease's sparse shape: the same fields as its {@link LeaseStamp}, as a lease is made once and never changed, named for what a log line or a listing shows. A Lease's own fields are these. */
export type LeaseSparse = LeaseStamp

/** A box's two ciphered fields: its boxKey wrapped under the vaultKey, and the whisper ciphered under that boxKey. */
export type BoxCiphered = Pick<BoxRecord, 'box_key_wrapped' | 'whisper_ciphered'>

/** The `format` a lease record carries, in its stamp. */
const LeaseFormat = 'safebyok-lease-v1'

/** What {@link sealLeaseRecord} grants, the scope, the vault record it was proven against, and the deadline, held to what its record will hold; a box record's sparse fields, as {@link BoxSparse} has them; a box's two ciphered fields, as {@link BoxCiphered} has them; and a lease's own stamp, picked from whatever carries it, as its ctx takes it beside its vault's ({@link VaultStampButFormat}). Each refuses 'bad_record'. */
export const { LeaseGrant, VisibleShape, CipheredShape, LeaseStampPicked } = Validator('bad_record', ({ obj }) => ({
  LeaseGrant:          LeaseRecord.pick({ applabel: true, user_id: true, vaultlabel: true, vault_tok: true, gate_epoch: true, ask_passphrase_at: true }),
  VisibleShape:        BoxSparse.strip(),
  CipheredShape:       obj({ box_key_wrapped, whisper_ciphered }),
  LeaseStampPicked:    LeaseStamp.strip(),
}))

/** The ctx a lease's wrap is bound to: its vault's stamp but for the format, the lease's own {@link LeaseStamp}, and the purpose.
 * Each stamp may come whole, a Vault object or a lease record: only its stamp fields are taken.
 * It refuses 'bad_record' for one missing any of them.
 *
 * @example await wrapKeyUnder(leaseKey, vaultKey, leaseCtxOf(vaultRecord, leaseRecord))
 */
export const leaseCtxOf = (vaultStamp: VaultStampButFormat, leaseStamp: LeaseStamp): Uint8Array => (
  cipherCtx([VaultStampButFormat.parse(vaultStamp), LeaseStampPicked.parse(leaseStamp)], 'vault_key_lease_wrapped')
)

/** The ctx one of a box's two ciphered fields is bound to: its vault's stamp but for the format, the box's own {@link BoxStamp}, and the purpose, which names the field.
 * The box's sidecar is bound as its JSON with keys sorted. The vault's stamp may come whole, a
 * Vault object or a vault record: only its stamp fields are taken. It refuses 'bad_record' for a
 * stamp missing any field, or a box stamp holding any other.
 *
 * @example await cipherBytes(boxKey, whisperBytes, boxCtxOf(vault, { ...visible, vault_tok: vault.vault_tok }, 'whisper_ciphered'))
 */
export const boxCtxOf = (vaultStamp: VaultStampButFormat, boxStamp: BoxStamp, purpose: 'box_key_wrapped' | 'whisper_ciphered'): Uint8Array => {
  const { sidecar, ...stamp } = BoxStamp.parse(boxStamp)
  return cipherCtx([VaultStampButFormat.parse(vaultStamp), { ...stamp, sidecar: stableJsonify(sidecar)! }], purpose)
}

/** Reads a lease's record from inside this module, for {@link leaseRecordOf}: set once, by the class's static block. */
let recordOf: (lease: Lease) => LeaseRecord

/** This device's lease on one vault: the vaultKey wrapped under a leaseKey that never leaves this browser profile, and the instant it ends.
 * A lease is made once and never changed. Its own fields are its {@link LeaseSparse}, which is its
 * stamp: its format, the scope, `vault_tok`, `gate_epoch` and `ask_passphrase_at`, frozen, and
 * what `{ ...lease }`, JSON and a log line show. `vault.demandConsistentWith` judges the scope,
 * `vault_tok` and `gate_epoch` among them. The leaseKey and the wrap stay in its record, private,
 * which no getter, spread or JSON yields: the device store keeps it by structured clone. Nothing
 * of a lease reaches the backend.
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
 * @example JSON.stringify(lease)   // its format, scope, vault_tok, gate_epoch and ask_passphrase_at: no key material
 */
export class Lease implements LeaseSparse {
  /** The stored record, frozen, its wrap with it: the one source of every field. */
  readonly #record: LeaseRecord
  /** The vault it is a lease on: its stamp, which each ctx here binds, its demand and its lock. Whether this is the lease the vault holds, it asks inside the package, as no getter shows that one. */
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
  /** The instant from which the lease opens nothing, and the vault asks for a proof. */
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
  static make(vault: ConsistencyWith<VaultStamp & Pick<Vault, 'tryLock'>>, record: unknown): Lease {
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
   * @example lease.endsBy(Date.now())                       // true once it has ended
   * @example lease.endsBy(Date.now() + 60 * MinuteMillis)   // true when it ends within the hour
   */
  endsBy(instant: number): boolean {
    return this.ask_passphrase_at <= instant
  }

  /** `serialized` ciphered under a fresh boxKey, that boxKey wrapped under the vaultKey, both bound to `visible`: a box's two ciphered fields.
   * It demands, lease-bound, that this lease is consistent with its vault before and after its
   * wait: a lock, a change of the ways in, or the vault deleted or made anew meanwhile refuses as
   * `vault.demandConsistentWith` says. Each ctx is rebuilt from its vault's stamp (the scope,
   * `vault_tok` and `registered_at`), every field of `visible` and this lease's `vault_tok`. Nothing of either key outlives the call, and `serialized` is
   * zeroed, ciphered or not. Refuses 'damaged_lease' when the vaultKey will not unwrap, dropping
   * the lease as `lock()` does. `Box.seal` is the call.
   *
   * @example const { box_key_wrapped, whisper_ciphered } = await lease.cipheredWith(whisperBytes, visible)
   */
  async cipheredWith(serialized: Uint8Array, visible: BoxSparse): Promise<BoxCiphered> { return valOf(await this.tryCipheredWith(serialized, visible)) }

  /** `serialized` ciphered and its boxKey wrapped, as an {@link Outcome}: the non-throwing form of {@link Lease.cipheredWith}. */
  async tryCipheredWith(serialized: Uint8Array, visible: BoxSparse): Promise<Outcome<BoxCiphered>> {
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
            box_key_wrapped:  box_key_wrapped.parse(await wrapKeyUnder(vaultKey, boxKey, this.#boxCtxOf(header, 'box_key_wrapped'))),
            whisper_ciphered: whisper_ciphered.parse(await cipherBytes(boxKey, bytes, this.#boxCtxOf(header, 'whisper_ciphered'))),
          }
        })
        this.#demand()
        return valOf(sealing)
      } finally {
        bytes.fill(0)
      }
    })
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
  async decipherWith(ciphered: BoxCiphered, visible: BoxSparse): Promise<Uint8Array> { return valOf(await this.tryDecipherWith(ciphered, visible)) }

  /** The bytes `ciphered` holds, as an {@link Outcome}: the non-throwing form of {@link Lease.decipherWith}. */
  async tryDecipherWith(ciphered: BoxCiphered, visible: BoxSparse): Promise<Outcome<Uint8Array>> {
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
    })
  }

  /** The record `visible` makes with its whisper sealed: `visible`, beside the two ciphered fields {@link Lease.cipheredWith} makes of `props.whisper`, its one wait.
   * It refuses as `cipheredWith` does. `Box.seal` is the call.
   *
   * @example const record = await lease.sealProps(visible, { whisper: whisperBytes })
   */
  async sealProps(visible: BoxSparse, props: { whisper: Uint8Array }): Promise<BoxRecord> { return valOf(await this.trySealProps(visible, props)) }

  /** The record `visible` makes with its whisper sealed, as an {@link Outcome}: the non-throwing form of {@link Lease.sealProps}. */
  async trySealProps(visible: BoxSparse, props: { whisper: Uint8Array }): Promise<Outcome<BoxRecord>> {
    return await outcomeOf(async () => {
      const sealing = checkSealProps(props)
      const header = checkedVisible(visible)
      const ciphered = valOf(await this.tryCipheredWith(sealing.whisper, header))
      return { ...header, ...ciphered }
    })
  }

  /** Demand, lease-bound, that this lease is consistent with its vault: what each cipher and decipher asks before and after its wait. */
  #demand() {
    this.#vault.demandConsistentWith(this, { leaseBound: true })
  }

  /** The vaultKey, unwrapped under the leaseKey as a non-extractable handle that may only `usage`; null when it will not unwrap. */
  async #vaultKeyOrNull(usage: 'wrapKey' | 'unwrapKey'): Promise<CryptoKey | null> {
    try {
      return await unwrapKeyUnder(this.#record.lease_key, this.#record.vault_key_lease_wrapped, leaseCtxOf(this.#vault, this.#record), { extractable: false, usage: [usage] })
    } catch {
      return null
    }
  }

  /** Drop this lease, damaged, as `lock()` drops it, when it is the one its vault holds, and say so as 'damaged_lease': a newer lease, granted meanwhile, stands. */
  #dropDamaged(): VaultError {
    if (heldLeaseOf(this.#vault) === this) { void this.#vault.tryLock() }
    return damagedLease()
  }

  /** The ctx a box's ciphered field is bound to, {@link boxCtxOf}'s: its vault's stamp, and the box's, `visible` and this lease's `vault_tok`. See VOCABULARY.md on ctx. */
  #boxCtxOf(visible: BoxSparse, purpose: 'box_key_wrapped' | 'whisper_ciphered'): Uint8Array {
    return boxCtxOf(this.#vault, { ...visible, vault_tok: this.vault_tok }, purpose)
  }
}

/** The record `lease` stands for, frozen, its leaseKey and wrapped vaultKey among it: for tests alone, which have no other way to it.
 * Nothing in `src/` calls it, and nothing should: a Lease shows no getter, field or JSON of its
 * record, so whatever holds one cannot unwrap the vaultKey extractable, and the package's entry
 * points export none of this.
 */
export const leaseRecordOf = (lease: Lease): LeaseRecord => recordOf(lease)

/** A lease record for the vault `standing` is, under a new non-extractable leaseKey, around `vaultKey`, which a proof just opened against `standing`, the vault record whose stamp its wrap binds and whose `gate_epoch` it is granted under.
 * It ends `grant.leaseMillis` (the vault's lease length) after `grant.now`, never past
 * {@link FarFuture}, which is how `leaseHours: Infinity` reads. It writes nothing: the vault puts
 * the record in the device store, and makes its Lease from what was stored. `vaultKey` must be
 * extractable, to be wrapped: keep it only for this call. It refuses 'bad_record', as misuse, for a
 * vault record a {@link LeaseRecord} could not hold.
 *
 * @example const record = await sealLeaseRecord(vaultRecord, vaultKey, { leaseMillis, now })   // record.ask_passphrase_at: leaseMillis from now
 */
export const sealLeaseRecord = async (standing: VaultStampButFormat & Pick<VaultSparse, 'gate_epoch'>, vaultKey: CryptoKey, grant: { leaseMillis: number, now: number }): Promise<LeaseRecord> => {
  const granted = LeaseGrant.parse({
    applabel:          standing.applabel,
    user_id:           standing.user_id,
    vaultlabel:        standing.vaultlabel,
    vault_tok:         standing.vault_tok,
    gate_epoch:        standing.gate_epoch,
    ask_passphrase_at: Math.min(grant.now + grant.leaseMillis, FarFuture),
  })
  const stamp = { format: LeaseFormat, ...granted } as const
  const leaseKey = await makeLeaseKey()
  const wrapped = await wrapKeyUnder(leaseKey, vaultKey, leaseCtxOf(standing, stamp))
  return { ...stamp, lease_key: leaseKey, vault_key_lease_wrapped: vault_key_lease_wrapped.parse(wrapped) }
}

/** What an unwrapped boxKey may do: decipher, never be exported. */
const BoxKeyUsage = { extractable: false, usage: ['decrypt'] } as const

/** `visible`, once it is a box record's visible fields: 'bad_record' otherwise, quoting none of it. */
const checkedVisible = (visible: unknown): BoxSparse => {
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
