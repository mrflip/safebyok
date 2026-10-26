import { deepFreeze } from 'es-toolkit'
import type * as Z from 'zod'
import { decorate } from './adorn'
import { Ciphered, randomId } from './crypto'
import { VaultError } from './errors'
import { heldLeaseOf } from './held-lease'
import { optionsCheck } from './options'
import { type Outcome, outcomeOf, unexpectedError, valOf } from './outcome'
import { stableJsonify } from './stable-jsonify'
import { type BoxSummary, type DamagedBox, EpochMillis, type ListedSummary, Sidecar, type Stamp, Whisper } from './types'
import type { Vault } from './vault'
import { Validator } from './checks/validator'

// == [The record]: BoxRecord, BoxFormat

/** The box's format, as each record carries it and each of its ctxs begins. */
export const BoxFormat = 'safebyok-box-v8'

/** One box as storage holds it: the whisper ciphered under its own boxKey, that boxKey wrapped under the vaultKey, and the visible fields.
 * Nothing in it opens without the vaultKey. The visible fields, the sidecar among them, are
 * stored in the clear: storage, and a locked vault, can read them. A {@link Box} is made from one,
 * and hands it back as `box.record`.
 *
 * We sign all immutable fields: each that never changes once the box is first stored -- the scope
 * and `vault_tok` of its vault, its boxlabel and `registered_at`, and the format, codec and schema
 * version -- is bound into both encryptions, as AES-GCM's additional data. So is every field of
 * this revision but the two encrypted ones: `revision_tok`, minted fresh on every write, the
 * sidecar and `written_at`. So ciphertext moved between revisions, boxes or vaults refuses to
 * open, as does an altered sidecar or time. Its boxlabel is a label, as `label` checks. Its
 * `parse` refuses 'bad_record'. It is strict, as every stored record is: a field this version does
 * not know is damage.
 *
 * @example BoxRecord.safeParse(await myBackend.readRow(id)).success   // false for a row that is no box
 */
export const { BoxRecord } = Validator('bad_record', ({ obj, str, lit, boxlabel }) => ({
  BoxRecord: obj({
    format:                 lit(BoxFormat),
    boxlabel,
    revision_tok:           str.min(1),
    /** This box's boxKey, wrapped under the vaultKey. */
    box_key_wrapped:        Ciphered,
    /** The whisper, ciphered under this box's boxKey. */
    whisper_ciphered:       Ciphered,
    /** How the whisper became the bytes ciphered: `json_v1`, its JSON with every object's keys sorted, as UTF-8. */
    whisper_codec:          lit('json_v1'),
    /** Which generation of the whisper's own shape this box holds: 1, the only one so far. */
    whisper_schema_version: lit(1),
    /** The box's {@link Sidecar}, the JSON object the host gave: `{}` when it gave none.
     * Storage keeps it as JSON (a `jsonb` column, say), free to reorder its keys or drop its spacing:
     * each ctx binds its JSON with keys sorted, worked out afresh at each seal and open.
     */
    sidecar:                Sidecar,
    /** When this boxlabel was first stored, an {@link EpochMillis}: every later store carries it forward. */
    registered_at:          EpochMillis,
    /** When this revision was written, an {@link EpochMillis}: a store of the same whisper moves it too. */
    written_at:             EpochMillis,
  }).strict(),
}))
export type BoxRecord = Z.infer<typeof BoxRecord>
// --

// == [Box]: BoxVault, BoxView, BoxBase, SealBoxProps, Box, record, baseRevisionTok, make, seal, extractWhisper, toJSON

/** The slice of a {@link Vault} a box reads: the stamp it is made under, its demand, and the time a seal stamps. The lease that seals and opens it the box reads inside the package, as no getter shows it. */
export type BoxVault = Pick<Vault, 'stamp' | 'now' | 'demandConsistentWith'>

/** A box's visible fields, each once: what `{ ...box }` and `box.toJSON()` hold, its stamp left out. A {@link BoxSummary} holds them and `vault_tok`. */
export type BoxView = Omit<BoxSummary, 'damaged' | 'vault_tok'>

/** The box a sealed box replaces, as far as a seal reads it: the revision it is written over (null for none), and the `registered_at` it carries forward, where known.
 * A {@link Box} read from storage is one, as is a listing's {@link BoxSummary} or {@link DamagedBox}.
 */
export type BoxBase = { revision_tok: string | null, registered_at?: number | undefined }

/** What {@link Box.seal} seals a whisper with: the boxlabel, the sidecar (`{}` when left out), and the box it replaces, if any. */
export type SealBoxProps = {
  boxlabel: string
  sidecar?: Sidecar | undefined
  /** The box this one is sealed over: a box read, or the listing's entry for it; null or left out for a new box. */
  base?:    BoxBase | null | undefined
}

/** What {@link Box.seal}'s props may hold, and nothing else. */
const checkSealProps = optionsCheck(({ unk }) => ({ boxlabel: unk, sidecar: unk.optional(), base: unk.optional() }), "Box.seal's props are `boxlabel`, `sidecar`, the box's own visible data, and `base`, the box it replaces.")

/** The boxlabel a seal is handed, checked as a scope's names are: 'bad_scope' for one that is not a label. */
const { sealBoxlabel } = Validator('bad_scope', ({ obj, boxlabel }) => ({ sealBoxlabel: obj({ boxlabel }) }))

/** One box: a whisper sealed under its own boxKey, with the visible fields a locked vault may show, and the stamp of the vault it was made under.
 * Its visible fields (boxlabel, revision, its sidecar, and times) are its own, and it carries its
 * stamp: the scope, `vault_tok`, `vault_epoch` and `gate_epoch` of the vault as it stood when the
 * box was read, stored or sealed, which `vault.demandConsistentWith` judges. The stamp reads as
 * `box.vault_tok` and the like, but it is the vault's, not the box's: no spread, key list or JSON
 * shows it. The ciphertext and the storage
 * mechanics (format, codec, schema version) stay in its `record`, which is what crosses to storage
 * and holds no secret: neither key is in it. The box, its record and its sidecar are frozen through.
 *
 * A Box comes from a read or a write that landed (`vault.getBox`, `vault.putBox`), or from
 * {@link Box.seal}, not yet stored, which carries the revision it was sealed over as
 * `baseRevisionTok`. It is immutable between. `box.extractWhisper()` opens it under the lease the
 * vault holds. The box keeps its record and its vault in private fields: no loop, spread, log line
 * or `JSON.stringify` sees them.
 *
 * A missing or malformed vault, record or option throws 'bad_option'. No refusal quotes what the
 * call was handed.
 *
 * @example
 *   const box = await vault.getBox('anthropic_api_key')
 *   box.boxlabel        // 'anthropic_api_key'
 *   box.sidecar         // { note: 'work account' }
 *   box.vault_tok       // the vault it lies in, of its stamp
 *   box.record          // the record, as storage holds it
 *   { ...box }          // its visible fields alone: boxlabel, revision_tok, sidecar, registered_at, written_at
 */
export class Box {
  /** The stored record this box was made from, frozen through: the one source of every visible field. */
  readonly #record: BoxRecord
  /** The vault it is of: its stamp, its lease and its clock. */
  readonly #vault: BoxVault
  /** The revision a sealed box is written over, or null for a new box, or a box read or stored. */
  readonly #baseRevisionTok: string | null

  readonly boxlabel:      string
  /** Fresh on every put: what a conditional write over this box names. */
  readonly revision_tok:  string
  /** The app's own JSON beside the whisper, `{}` when none: stored in the clear, never encrypted. */
  readonly sidecar:       Sidecar
  /** When this boxlabel was first put, in epoch milliseconds. */
  readonly registered_at: number
  /** When this revision was put, in epoch milliseconds, whether or not the whisper changed. */
  readonly written_at:    number
  /** The app of the vault it lies in: of its stamp, which no spread or JSON shows. */
  declare readonly applabel:    string
  /** The user of the vault it lies in: of its stamp, which no spread or JSON shows. */
  declare readonly user_id:     string
  /** The label of the vault it lies in: of its stamp, which no spread or JSON shows. */
  declare readonly vaultlabel:  string
  /** The token of the vault it lies in: bound into both its encryptions, and named by the write that puts it. Of its stamp, which no spread or JSON shows. */
  declare readonly vault_tok:   string
  /** The vault's `vault_epoch` when this box was made: of its stamp, which no spread or JSON shows. */
  declare readonly vault_epoch: number
  /** The vault's `gate_epoch` when this box was made: of its stamp, which no spread or JSON shows. */
  declare readonly gate_epoch:  number

  private constructor(vault: BoxVault, stamp: Stamp, record: BoxRecord, baseRevisionTok: string | null) {
    // The record is the check's own copy, which nothing else holds: frozen where it stands.
    this.#record          = deepFreeze(record)
    this.#vault           = vault
    this.#baseRevisionTok = baseRevisionTok
    this.boxlabel      = record.boxlabel
    this.revision_tok  = record.revision_tok
    this.sidecar       = this.#record.sidecar
    this.registered_at = record.registered_at
    this.written_at    = record.written_at
    // The stamp is the vault's, for its demand to judge: readable, but no field a spread or JSON shows.
    const { applabel, user_id, vaultlabel, vault_tok, vault_epoch, gate_epoch } = stamp
    decorate<Box>(this, { applabel, user_id, vaultlabel, vault_tok, vault_epoch, gate_epoch })
    Object.freeze(this)
  }

  /** The stored record this box was made from, frozen through: what storage holds, ciphertext and all. */
  get record(): BoxRecord {
    return this.#record
  }

  /** The revision this box was sealed over, which its write expects to stand: the box read or listed before it, or null for a new box. Null for a box read or stored. */
  get baseRevisionTok(): string | null {
    return this.#baseRevisionTok
  }

  /** The box a stored record makes, of `vault`, made under `stamp`; the record kept, frozen, as `record`.
   * Touches no storage and no key. Throws 'bad_record' for a record this package does not write,
   * and 'bad_option' for a `stamp` that is none.
   *
   * @param stamp - The stamp of the vault the record was read or written under. Default: the vault's own now.
   *
   * @example const box = Box.make(vault, record)   // record: what a VaultDB's getBox resolved
   * @example Box.make(vault, { boxlabel: 'anthropic_api_key' })   // throws 'bad_record': no box record
   */
  static make(vault: BoxVault, record: BoxRecord, stamp: Stamp = vault.stamp): Box {
    const checked = checkedBoxRecord(record)
    return new this(vault, checkedStamp(stamp), checked, null)
  }

  /** A new box of `vault` holding `whisper`, sealed under the vault's lease; not yet stored: `vault.putBox` stores one.
   * The whisper is serialized as its JSON with keys sorted, then ciphered by the vault's lease (`sealProps`)
   * under a boxKey made fresh for this box alone, wrapped under the vaultKey. We sign all immutable
   * fields: both are bound to the scope, the lease's `vault_tok`, the boxlabel and `registered_at`,
   * and to every other visible field, the sidecar among them, so the record moved or altered
   * anywhere will not open. Its `revision_tok` is fresh, and `written_at` is the
   * vault's time now. `registered_at` is the base's when it gives one, else now; the base's revision
   * is the box's `baseRevisionTok`. The sidecar is `{}` when left out: a seal carries nothing from
   * the base but its revision and `registered_at`.
   *
   * Throws 'bad_whisper' for a whisper JSON cannot carry, 'bad_scope' for a boxlabel that is not
   * a label, and 'bad_option' for a sidecar JSON cannot carry or a malformed base. Refuses
   * 'vault_locked' when the vault holds no lease, and
   * otherwise as `lease.cipheredWith` does.
   *
   * @example const box = await Box.seal(vault, { boxlabel: 'anthropic_api_key', sidecar: { note: 'work account' } }, 'sk-ant-...')
   * @example const next = await Box.seal(vault, { boxlabel: box.boxlabel, sidecar: box.sidecar, base: box }, 'sk-ant-...')   // next.baseRevisionTok: box.revision_tok
   */
  static async seal(vault: BoxVault, props: SealBoxProps, whisper: Whisper): Promise<Box> { return valOf(await this.trySeal(vault, props, whisper)) }

  /** A new box of `vault` holding `whisper`, as an {@link Outcome}: the non-throwing form of {@link Box.seal}. */
  static async trySeal(vault: BoxVault, props: SealBoxProps, whisper: Whisper): Promise<Outcome<Box>> {
    return await outcomeOf(async () => {
      checkSealProps(props)
      const { boxlabel } = sealBoxlabel.parse({ boxlabel: props.boxlabel })
      const sidecar = props.sidecar === undefined ? {} : checkedSidecar(props.sidecar)
      const base = checkedBase(props.base)
      const whisperBytes = whisperBytesOf(whisper)
      try {
        const lease = heldLeaseOf(vault)
        if (lease === null) { throw lockedError() }
        const { stamp } = vault
        const now = vault.now()
        const record = await lease.sealProps({
          format:                 BoxFormat,
          boxlabel,
          revision_tok:           randomId(),
          whisper_codec:          'json_v1',
          whisper_schema_version: 1,
          sidecar,
          registered_at:          base?.registered_at ?? now,
          written_at:             now,
        }, { whisper: whisperBytes })
        return new Box(vault, stamp, checkedBoxRecord(record), base?.revision_tok ?? null)
      } finally {
        whisperBytes.fill(0)
      }
    }, unexpectedError)
  }

  /** The whisper this box holds, opened under the vault's lease: its `decipherWith` of the ciphered fields, bound to its visible ones, then its JSON parsed.
   * A whisper handed back is the one sealed under this boxlabel, in this vault, with this sidecar
   * and these times. Nothing partial is handed back, and the whisper's bytes are zeroed once parsed.
   * It demands first that the box is consistent with its vault, lease-bound: 'vault_locked' with no
   * lease in hand, and 'vault_gone', 'vault_remade' or 'gate_moved' once the vault moved on since the
   * box was made. Then it refuses as `lease.decipherWith` does: 'damaged_box' for a box that will
   * not open under the vault's key, 'damaged_lease' for a lease that will not open. A box that opens
   * to something that is no whisper is 'damaged_box' too.
   *
   * @example const whisper = await box.extractWhisper()
   */
  async extractWhisper(): Promise<Whisper> { return valOf(await this.tryExtractWhisper()) }

  /** The whisper this box holds, as an {@link Outcome}: the non-throwing form of {@link Box.extractWhisper}.
   *
   * @example const { ok, val: whisper, err } = await box.tryExtractWhisper()
   */
  async tryExtractWhisper(): Promise<Outcome<Whisper>> {
    return await outcomeOf(async () => {
      this.#vault.demandConsistentWith(this, { leaseBound: true })
      const lease = heldLeaseOf(this.#vault)
      if (lease === null) { throw lockedError() }
      const { box_key_wrapped: boxKeyWrapped, whisper_ciphered: whisperCiphered, ...visible } = this.#record
      const deciphered = await lease.tryDecipherWith({ box_key_wrapped: boxKeyWrapped, whisper_ciphered: whisperCiphered }, visible)
      // What the decipher brought, a refusal included, is used only while the box still stands as it was made.
      try {
        // A lease that refused its own use (damaged_lease) has dropped itself: only the vault half is asked then.
        this.#vault.demandConsistentWith(this, { leaseBound: deciphered.ok })
      } catch (err) {
        if (deciphered.ok) { deciphered.val.fill(0) }
        throw err
      }
      const whisperBytes = valOf(deciphered)
      try {
        const checked = Whisper.safeParse(parseJsonOrNull(new TextDecoder().decode(whisperBytes)))
        if (! checked.success) {
          throw new VaultError('damaged_box', "That box opened, but what was inside is not a whisper this package knows, so it is damaged. It was left as it is; remove it, or store its whisper again over it.")
        }
        return checked.data
      } finally {
        whisperBytes.fill(0)
      }
    }, unexpectedError)
  }

  /** The box's visible fields, each once, as a plain object: what `JSON.stringify(box)` writes and a log line shows, its stamp left out. Storage takes `record`, not this.
   *
   * @example JSON.parse(JSON.stringify(box))   // { boxlabel, revision_tok, sidecar, registered_at, written_at }
   */
  toJSON(): BoxView {
    const { ...visible } = this
    return visible
  }
}
// --

// == [Listing]: heldListing

/** A listed box as a vault holds it and hands it out, lying under `vaultTok`, the vault props the listing was read beside.
 * A sound one is a box's visible fields and `vault_tok`, and `damaged: false`, frozen through. Its
 * sidecar is the one the listing's check made, frozen where it stands, never parsed again. A
 * damaged one keeps its boxlabel and revision alone.
 *
 * @example vault.boxes[0].sidecar.note = 'changed'   // throws in strict code; the vault's own copy is untouched either way
 */
export const heldListing = (listed: ListedSummary | DamagedBox, vaultTok: string): BoxSummary | DamagedBox => {
  if (listed.damaged) { return Object.freeze({ boxlabel: listed.boxlabel, damaged: true, revision_tok: listed.revision_tok }) }
  const { boxlabel, revision_tok, registered_at, written_at } = listed
  return Object.freeze({ boxlabel, revision_tok, sidecar: deepFreeze(listed.sidecar), registered_at, written_at, vault_tok: vaultTok, damaged: false })
}
// --

// == [Helpers]: whisperBytesOf, parseJsonOrNull, checkedBoxRecord, checkedWhisper, checkedSidecar, checkedBase, checkedStamp, lockedError

/** `whisper`'s bytes as a box ciphers them, its JSON with keys sorted: kind 'bad_whisper' for one JSON cannot carry, quoting none of it. Zero them once used. */
export const whisperBytesOf = (whisper: unknown): Uint8Array => new TextEncoder().encode(stableJsonify(checkedWhisper(whisper)))

/** `text` parsed as JSON, or null when it is none: what a decipher hands the whisper check. */
const parseJsonOrNull = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** `record`, once it is a box record: 'bad_record' otherwise, quoting none of it. */
const checkedBoxRecord = (record: unknown): BoxRecord => {
  const checked = BoxRecord.safeParse(record)
  if (! checked.success) {
    throw new VaultError('bad_record', "That is not a box record this package writes: a box is made from the record storage holds, as a VaultDB's getBox hands it back, or from a box's own record.")
  }
  return checked.data
}

/** `whisper`, once it is one: 'bad_whisper' otherwise, quoting none of it. */
export const checkedWhisper = (whisper: unknown): Whisper => {
  const checked = Whisper.safeParse(whisper)
  if (! checked.success) {
    throw new VaultError('bad_whisper', "A whisper must be a JSON value: a string, number, boolean, array, or plain object. A bare null or undefined cannot be stored -- to empty a box, delete it. (null inside an array or object is fine.)")
  }
  return checked.data
}

/** `sidecar`, once it is one: 'bad_option' otherwise, quoting none of it. */
export const checkedSidecar = (sidecar: unknown): Sidecar => {
  const checked = Sidecar.safeParse(sidecar)
  if (! checked.success) {
    throw new VaultError('bad_option', "A box's sidecar must be a plain JSON object -- { note: 'work account' }, or {} for none -- never a bare string, number, array or null, with nothing JSON cannot carry (undefined, a function, a Date) inside it.")
  }
  return checked.data
}

/** What a {@link BoxBase} must show, a revision, or null for none, and a `registered_at` where it gives one; and what a {@link Stamp} must show, the scope, the `vault_tok`, and both epochs. */
const { BaseShape, StampShape } = Validator('bad_option', ({ obj, str, uint }) => ({
  BaseShape:  obj({ revision_tok: BoxRecord.shape.revision_tok.nullable(), registered_at: EpochMillis.optional() }).loose().nullable(),
  StampShape: obj({ applabel: str, user_id: str, vaultlabel: str, vault_tok: str.min(1), vault_epoch: uint, gate_epoch: uint }),
}))

/** `base`, once it is a {@link BoxBase} or none: 'bad_option' otherwise, quoting none of it. */
const checkedBase = (base: unknown): BoxBase | null => {
  const checked = BaseShape.safeParse(base ?? null)
  if (! checked.success) {
    throw new VaultError('bad_option', "Box.seal's `base` is the box the new one replaces -- a box read, or the listing's entry for it -- showing its revision_tok, and its registered_at where known; null or left out for a new box.")
  }
  return checked.data
}

/** `stamp`, once it is a {@link Stamp}: 'bad_option' for anything else. */
const checkedStamp = (stamp: unknown): Stamp => {
  const checked = StampShape.safeParse(stamp)
  if (! checked.success) {
    throw new VaultError('bad_option', "Box.make's stamp is the stamp of the vault the record was read or written under, as vault.stamp holds it: its scope, vault_tok, vault_epoch and gate_epoch.")
  }
  return Object.freeze(checked.data)
}

/** The refusal of a seal or an extract with no lease in hand. */
const lockedError = () => new VaultError('vault_locked', 'The vault is locked, so the box was neither sealed nor opened: unlock it first, or go through the vault (getWhisper, putBox), which asks for a proof.')
// --
