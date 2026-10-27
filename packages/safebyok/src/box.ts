import { deepFreeze } from 'es-toolkit'
import type * as Z from 'zod'
import { randomId } from './crypto'
import { VaultError } from './errors'
import { heldLeaseOf } from './held-lease'
import { optionsCheck } from './options'
import { type Outcome, outcomeOf, valOf } from './outcome'
import { stableJsonify } from './stable-jsonify'
import { BoxFormat, BoxRecord, BoxSparse, Sidecar, Whisper } from './shapes/box'
import { revision_tok } from './shapes/fields'
import { type VaultStamp, VaultSparse } from './shapes/vault'
import type { ConsistencyWith } from './types/type-aliases'
import type { Boxscope } from './shapes/scopes'
import { Validator } from './checks/validator'

// == [Box]: SealBoxProps, Box, record, baseRevisionTok, make, seal, extractWhisper

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
export const { sealBoxlabel } = Validator('bad_scope', ({ obj, boxlabel }) => ({ sealBoxlabel: obj({ boxlabel }) }))

/** One revision of one box: a whisper sealed under its own boxKey, with the visible fields a locked vault may show, and what it was made under.
 * A box revision is never rewritten, so every field a Box shows is fixed for its life, its own and
 * frozen: its {@link Boxscope} (the vault's scope and its boxlabel), its {@link BoxSparse} (every
 * field of its record but the two ciphered ones), and the `vault_tok`, `vault_epoch` and
 * `gate_epoch` of the vault as it stood when the box was read, stored or sealed, which
 * `vault.demandConsistentWith` judges. A spread, JSON or a log line shows those fields, and
 * nothing secret: the ciphertext stays in its `record`, which is what crosses to storage, and
 * neither key is in it. The box, its record and its sidecar are frozen through.
 *
 * A Box comes from a read or a write that landed (`vault.getBox`, `vault.putBox`), or from
 * {@link Box.seal}, not yet stored, which carries the revision it was sealed over as
 * `baseRevisionTok`. `box.extractWhisper()` opens it under the lease the vault holds. The box
 * keeps its record and its vault in private fields: no loop, spread, log line or
 * `JSON.stringify` sees them.
 *
 * A missing or malformed vault, record or option throws 'bad_option'. No refusal quotes what the
 * call was handed.
 *
 * @example
 *   const box = await vault.getBox('anthropic_api_key')
 *   box.boxlabel        // 'anthropic_api_key'
 *   box.sidecar         // { note: 'work account' }
 *   box.vault_tok       // the vault it lies in
 *   box.record          // the record, as storage holds it
 *   { ...box }          // its fields: the scope, boxlabel, its sparse fields, and the vault_tok and epochs it was made under
 */
export class Box implements Boxscope, BoxSparse {
  /** The stored record this box was made from, frozen through: the one source of every visible field. */
  readonly #record: BoxRecord
  /** The vault it is of: its demand, and the lease that opens it, which the box reads inside the package. */
  readonly #vault: ConsistencyWith<VaultStamp>
  /** The revision a sealed box is written over, or null for a new box, or a box read or stored. */
  readonly #baseRevisionTok: string | null

  /** The app of the vault it lies in. */
  readonly applabel:               string
  /** The user of the vault it lies in. */
  readonly user_id:                string
  /** The label of the vault it lies in. */
  readonly vaultlabel:             string
  /** The token of the vault it lies in: in both its encryptions' ctx, and named by the write that puts it. */
  readonly vault_tok:              string
  /** The vault's `vault_epoch` when this box was read, stored or sealed. */
  readonly vault_epoch:            number
  /** The vault's `gate_epoch` when this box was read, stored or sealed. */
  readonly gate_epoch:             number
  /** The box record's format, `safebyok-box-v8`. */
  readonly format:                 BoxSparse['format']
  /** The box's own label within the vault. */
  readonly boxlabel:               string
  /** Fresh on every put: what a conditional write over this box names. */
  readonly revision_tok:           string
  /** How the whisper became the bytes ciphered: `json_v1`. */
  readonly whisper_codec:          BoxSparse['whisper_codec']
  /** Which generation of the whisper's own shape this box holds: 1. */
  readonly whisper_schema_version: BoxSparse['whisper_schema_version']
  /** The app's own JSON beside the whisper, `{}` when none: stored in the clear, never encrypted. */
  readonly sidecar:                Sidecar
  /** When this boxlabel was first put, in epoch milliseconds. */
  readonly registered_at:          number
  /** When this revision was put, in epoch milliseconds, whether or not the whisper changed. */
  readonly written_at:             number

  private constructor(vault: ConsistencyWith<VaultStamp>, madeUnder: MadeUnder, record: BoxRecord, baseRevisionTok: string | null) {
    // The record is the check's own copy, which nothing else holds: frozen where it stands.
    this.#record          = deepFreeze(record)
    this.#vault           = vault
    this.#baseRevisionTok = baseRevisionTok
    this.applabel               = madeUnder.applabel
    this.user_id                = madeUnder.user_id
    this.vaultlabel             = madeUnder.vaultlabel
    this.vault_tok              = madeUnder.vault_tok
    this.vault_epoch            = madeUnder.vault_epoch
    this.gate_epoch             = madeUnder.gate_epoch
    this.format                 = record.format
    this.boxlabel               = record.boxlabel
    this.revision_tok           = record.revision_tok
    this.whisper_codec          = record.whisper_codec
    this.whisper_schema_version = record.whisper_schema_version
    this.sidecar                = this.#record.sidecar
    this.registered_at          = record.registered_at
    this.written_at             = record.written_at
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

  /** The box a stored record makes, of `vault`, made under `madeUnder`; the record kept, frozen, as `record`.
   * Touches no storage and no key. Throws 'bad_record' for a record this package does not write,
   * and 'bad_option' for a `madeUnder` that is none.
   *
   * @param madeUnder - What the vault the record was read or written under showed then: its scope,
   *   the `vault_tok` the read or write expected, and both epochs. A {@link VaultSparse} will do,
   *   as only those fields are taken.
   *
   * @example const box = Box.make(vault, record, madeUnder)   // record: what a VaultDB's getBox resolved
   * @example Box.make(vault, { boxlabel: 'anthropic_api_key' }, madeUnder)   // throws 'bad_record': no box record
   */
  static make(vault: ConsistencyWith<VaultStamp>, record: BoxRecord, madeUnder: MadeUnder): Box {
    const checked = checkedBoxRecord(record)
    return new this(vault, checkedMadeUnder(madeUnder), checked, null)
  }

  /** A new box of `vault` holding `whisper`, sealed under the vault's lease; not yet stored: `vault.putBox` stores one.
   * The whisper is serialized as its JSON with keys sorted, then ciphered by the vault's lease (`sealProps`)
   * under a boxKey made fresh for this box alone, wrapped under the vaultKey. Both bind the vault's
   * stamp and the box's own: every visible field, the sidecar among them, and the lease's
   * `vault_tok`, so the record moved or altered anywhere will not open. Its `revision_tok` is
   * fresh, and `written_at` is `made.now`, the vault's time. `registered_at` is the base's when it
   * gives one, else now; the base's revision is the box's `baseRevisionTok`. The sidecar is `{}`
   * when left out: a seal carries nothing from the base but its revision and `registered_at`.
   *
   * Throws 'bad_whisper' for a whisper JSON cannot carry, 'bad_scope' for a boxlabel that is not
   * a label, and 'bad_option' for a sidecar JSON cannot carry, a malformed base, or a `made` that
   * is none. Refuses 'vault_locked' when the vault holds no lease, and otherwise as
   * `lease.cipheredWith` does.
   *
   * The box's scope and `vault_tok` are `vault`'s own, so a box sealed in one vault is never made
   * under another.
   *
   * @param made.madeUnder - The vault's epochs as it seals, `vault_epoch` and `gate_epoch`: a {@link VaultSparse} will do, as only those fields are taken.
   * @param made.now - The time by the vault's clock, in epoch milliseconds: the new revision's `written_at`.
   *
   * @example const box = await Box.seal(vault, { boxlabel: 'anthropic_api_key', sidecar: { note: 'work account' } }, 'sk-ant-...', { madeUnder, now })
   * @example const next = await Box.seal(vault, { boxlabel: box.boxlabel, sidecar: box.sidecar, base: box }, 'sk-ant-...', { madeUnder, now })   // next.baseRevisionTok: box.revision_tok
   */
  static async seal(vault: ConsistencyWith<VaultStamp>, props: SealBoxProps, whisper: Whisper, made: { madeUnder: SealedUnder, now: number }): Promise<Box> { return valOf(await this.trySeal(vault, props, whisper, made)) }

  /** A new box of `vault` holding `whisper`, as an {@link Outcome}: the non-throwing form of {@link Box.seal}. */
  static async trySeal(vault: ConsistencyWith<VaultStamp>, props: SealBoxProps, whisper: Whisper, made: { madeUnder: SealedUnder, now: number }): Promise<Outcome<Box>> {
    return await outcomeOf(async () => {
      checkSealProps(props)
      const { boxlabel } = sealBoxlabel.parse({ boxlabel: props.boxlabel })
      const sidecar = props.sidecar === undefined ? {} : checkedSidecar(props.sidecar)
      const base = checkedBase(props.base)
      const { madeUnder, now } = checkedMade(made)
      const whisperBytes = whisperBytesOf(whisper)
      try {
        const lease = heldLeaseOf(vault)
        if (lease === null) { throw lockedError() }
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
        const { applabel, user_id, vaultlabel, vault_tok } = vault
        return new Box(vault, { applabel, user_id, vaultlabel, vault_tok, ...madeUnder }, checkedBoxRecord(record), base?.revision_tok ?? null)
      } finally {
        whisperBytes.fill(0)
      }
    })
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
    })
  }
}
// --

// == [Listing]: boxSparseOf

/** `record` as a listing shows a sound box, frozen through: every field but its two ciphered ones, which it may hold or not.
 * Its sidecar is the record's own, frozen where it stands, never parsed again.
 *
 * @example vault.getSnapshot().boxes[0].sidecar.note = 'changed'   // throws in strict code; the vault's own copy is untouched either way
 */
export const boxSparseOf = (record: BoxSparse & { box_key_wrapped?: unknown, whisper_ciphered?: unknown }): BoxSparse => {
  const { box_key_wrapped: _boxKeyWrapped, whisper_ciphered: _whisperCiphered, ...sparse } = record
  return deepFreeze(sparse)
}
// --

// == [Helpers]: whisperBytesOf, parseJsonOrNull, checkedBoxRecord, checkedWhisper, checkedSidecar, BaseShape, BoxBase, MadeUnder, SealedUnder, checkedBase, checkedMadeUnder, checkedMade, lockedError

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

/** What a {@link BoxBase} must show, a revision, or null for none, and a `registered_at` where it gives one; what a box is made under must show, the vault's scope, the `vault_tok` and both epochs, every other field dropped unread; and what a seal is made with, the vault's epochs and the time. */
export const { BaseShape, MadeUnderShape, SealedUnderShape, MadeShape } = Validator('bad_option', ({ obj, epochMillis }) => {
  const MadeUnderShape = VaultSparse.pick({ applabel: true, user_id: true, vaultlabel: true, vault_tok: true, vault_epoch: true, gate_epoch: true }).strip()
  const SealedUnderShape = VaultSparse.pick({ vault_epoch: true, gate_epoch: true }).strip()
  return {
    BaseShape: obj({ revision_tok: revision_tok.nullable(), registered_at: epochMillis.optional() }).loose().nullable(),
    MadeUnderShape,
    SealedUnderShape,
    MadeShape: obj({ madeUnder: SealedUnderShape, now: epochMillis }),
  }
})

/** The box a sealed box replaces, as far as a seal reads it: the revision it is written over (null for none), and the `registered_at` it carries forward, where known.
 * A {@link Box} read from storage is one, as is a listing's {@link BoxSparse} or {@link BoxDamaged}.
 */
export type BoxBase = Pick<NonNullable<Z.infer<typeof BaseShape>>, 'revision_tok' | 'registered_at'>

/** What a box holds of the vault it was made under: the vault's scope, the `vault_tok` the read, write or seal expected, and both epochs, as the vault showed them then. A {@link VaultSparse} carries them. */
type MadeUnder = Z.infer<typeof MadeUnderShape>

/** What a seal is handed of the vault it seals in, beside the vault itself: its two epochs as it seals. A {@link VaultSparse} carries them. */
type SealedUnder = Z.infer<typeof SealedUnderShape>

/** `base`, once it is a {@link BoxBase} or none: 'bad_option' otherwise, quoting none of it. */
const checkedBase = (base: unknown): BoxBase | null => {
  const checked = BaseShape.safeParse(base ?? null)
  if (! checked.success) {
    throw new VaultError('bad_option', "Box.seal's `base` is the box the new one replaces -- a box read, or the listing's entry for it -- showing its revision_tok, and its registered_at where known; null or left out for a new box.")
  }
  return checked.data
}

/** The fields a box keeps of `madeUnder`, frozen, once it shows them: 'bad_option' for anything else. */
const checkedMadeUnder = (madeUnder: unknown): MadeUnder => {
  const checked = MadeUnderShape.safeParse(madeUnder)
  if (! checked.success) { throw badMadeUnder() }
  return Object.freeze(checked.data)
}

/** `made`, once it shows the vault's epochs as it seals and the time: 'bad_option' for anything else. */
const checkedMade = (made: unknown): { madeUnder: SealedUnder, now: number } => {
  const checked = MadeShape.safeParse(made)
  if (! checked.success) { throw badMadeUnder() }
  return { madeUnder: Object.freeze(checked.data.madeUnder), now: checked.data.now }
}

/** The refusal of a box made under something that shows no vault as it stood. */
const badMadeUnder = () => new VaultError('bad_option', "A box is made under the vault as it stood when the box was read, written or sealed. Box.make takes its scope, the vault_tok, vault_epoch and gate_epoch, as a VaultSparse holds them; Box.seal takes vault_epoch and gate_epoch, and the time it is made at. The vault hands these in itself.")

/** The refusal of a seal or an extract with no lease in hand. */
const lockedError = () => new VaultError('vault_locked', 'The vault is locked, so the box was neither sealed nor opened: unlock it first, or go through the vault (getWhisper, putBox), which asks for a proof.')
// --
