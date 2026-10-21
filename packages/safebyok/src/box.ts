import * as Z from 'zod/mini'
import { Ciphered, cipherBytes, cipherCtx, decipherBytes, makeBoxKey, randomId, unwrapKeyUnder, wrapKeyUnder } from './crypto'
import { VaultError } from './errors'
import { optionsCheck } from './options'
import { type Outcome, outcomeOf, unexpectedError, valOf } from './outcome'
import { stableJsonify } from './stable-jsonify'
import { type BoxSummary, type DamagedBox, EpochMillis, Sidecar, VaultProps, Whisper, vaultKeyEpoch } from './types'
import { decorate } from './adorn'
import { NameFloor } from './validators'
import * as Names from './names'

// == [The record]: BoxRecord, BoxFormat, EmptySidecarJson, isStableJsonText

/** True when `text` is a sidecar's JSON exactly as the vault writes it: parsed and serialized again, keys sorted, it comes back the same.
 * Text respaced, reordered, or nested too deep to serialize is not, and its box reads as damaged.
 */
const isStableJsonText = (text: string): boolean => {
  try {
    return stableJsonify(JSON.parse(text)) === text
  } catch {
    // Not JSON, or nested past what the stack can serialize (a RangeError).
    return false
  }
}

/** The box's format, as each record carries it and each of its ctxs begins. */
export const BoxFormat = 'safebyok-box-v6'

/** The JSON of an empty sidecar: what a box given none holds. */
export const EmptySidecarJson = '{}'

/** One box as storage holds it: the whisper ciphered under its own boxKey, that boxKey wrapped under the vaultKey, and the visible fields.
 * Nothing in it opens without the vaultKey. The visible fields, the sidecar among them, are
 * stored in the clear: storage, and a locked vault, can read them. A {@link Box} is made from one,
 * and hands it back as `box.props`.
 *
 * Every field but the two encrypted ones is bound into both encryptions, `revision_tok` among
 * them, minted fresh on every write. So ciphertext moved between revisions, boxes or vaults
 * refuses to open, as does an altered sidecar, time or codec. Its boxlabel is held here to the
 * floor (`NameFloor`); the vault's validators check it only where a host hands it in.
 *
 * @example BoxRecord.safeParse(await myBackend.readRow(id)).success   // false for a row that is no box
 */
export const BoxRecord = Z.object({
  format:                 Z.literal(BoxFormat),
  boxlabel:               NameFloor,
  revision_tok:           Z.string().check(Z.minLength(1)),
  /** Which vaultKey this box's boxKey is wrapped under: the vault props' `vault_key_epoch` when it was written. */
  vault_key_epoch:        vaultKeyEpoch,
  /** This box's boxKey, wrapped under the vaultKey. */
  box_key_wrapped:        Ciphered,
  /** The whisper, ciphered under this box's boxKey. */
  whisper_ciphered:       Ciphered,
  /** How the whisper became the bytes ciphered: `json_v1`, its JSON with every object's keys sorted, as UTF-8. */
  whisper_codec:          Z.literal('json_v1'),
  /** Which generation of the whisper's own shape this box holds: 1, the only one so far. */
  whisper_schema_version: Z.literal(1),
  /** The box's {@link Sidecar} as JSON, keys sorted and unspaced, exactly as `stableJsonify` writes it: `{}` when the host gave none. */
  sidecar_json:           Z.string().check(Z.refine(isStableJsonText, "sidecar_json holds the box's sidecar as the JSON text the vault writes, keys sorted")),
  /** When this boxlabel was first stored, an {@link EpochMillis}: every later store carries it forward. */
  registered_at:          EpochMillis,
  /** When this revision was written, an {@link EpochMillis}: a store of the same whisper moves it too. */
  written_at:             EpochMillis,
})
export type BoxRecord = Z.infer<typeof BoxRecord>
// --

// == [Box]: BoxVaultProps, Box, make, seal, tryOpen, open, toJSON, summary

/** The vault props a box lies under, as far as its encryptions are bound to them: the scope, the vault id, and its vaultKey's epoch.
 * With the box's own visible fields, they are the whole of its ctx. A whole {@link VaultProps} is
 * one. Hand in the vault props the write that puts the box names.
 */
export type BoxVaultProps = Pick<VaultProps, 'applabel' | 'user_id' | 'vaultlabel' | 'vault_id' | 'vault_key_epoch'>

/** What {@link BoxVaultProps} must hold, checked where a caller hands them in. */
const BoxVaultPropsShape = Z.pick(VaultProps, { applabel: true, user_id: true, vaultlabel: true, vault_id: true, vault_key_epoch: true })

/** The options {@link Box.seal} takes. */
export type SealBoxOpts = {
  /** The box's sidecar. Left out, the box keeps the sidecar of the box it replaces (`over`), or has `{}`. */
  sidecar?: Sidecar | undefined
  /** The box this one replaces: its `registered_at` and sidecar carry forward only when it opens under the vaultKey.
   * Nothing else vouches for its visible fields.
   */
  over?:    Box | null | undefined
}

/** What {@link Box.seal}'s options may hold, and nothing else. */
const checkSealOpts = optionsCheck({ sidecar: Z.optional(Z.unknown()), over: Z.optional(Z.unknown()) }, "Box.seal's options are `sidecar`, the box's own visible data, and `over`, the box it replaces: check their spelling, and leave out any other.")

/** One box: a whisper sealed under its own boxKey, with the visible fields a locked vault may show.
 * Every stored field is a field of the box too, the sidecar as its JSON value. The box, its
 * record, its sidecar and its summary are frozen. Its record, `props`, is what crosses to storage,
 * and holds no secret: neither key is in it.
 *
 * `vaultProps` and `props` are hidden: no loop, spread, log line or `JSON.stringify` sees them. A
 * box logged shows its stored fields, and serializes as `props`. Opening a box is the vault's:
 * `vault.decryptWhisper(box)`, with the vaultKey in hand.
 *
 * Missing or malformed vault props, a time, a vaultKey or an option throws 'bad_option'. No refusal
 * quotes what the call was handed.
 *
 * @example
 *   const box = Box.make(vaultProps, record)
 *   box.boxlabel        // 'anthropic_api_key'
 *   box.sidecar         // { note: 'work account' }
 *   box.props           // the record, as storage holds it
 *   box.summary         // what vault.boxes lists for it
 */
export class Box {
  /** The vault props this box lies under, frozen: the scope, vault id and vaultKey epoch it opens under. */
  declare readonly vaultProps: BoxVaultProps
  /** The stored record this box was made from, frozen: what storage holds. */
  declare readonly props: BoxRecord
  /** What `vault.boxes` lists for this box: every visible field, the sidecar parsed, and `damaged: false`. */
  declare readonly summary: BoxSummary

  /** The record's format, `safebyok-box-v6`. */
  readonly format:                 BoxRecord['format']
  readonly boxlabel:               string
  /** Fresh on every put: what a conditional write over this box names. */
  readonly revision_tok:           string
  /** Which vaultKey this box's boxKey is wrapped under. */
  readonly vault_key_epoch:        BoxRecord['vault_key_epoch']
  /** How the whisper became the bytes ciphered: `json_v1`. */
  readonly whisper_codec:          BoxRecord['whisper_codec']
  /** Which generation of the whisper's shape this box holds: 1. */
  readonly whisper_schema_version: BoxRecord['whisper_schema_version']
  /** The app's own JSON beside the whisper, `{}` when none: stored in the clear, never encrypted. */
  readonly sidecar:                Sidecar
  /** When this boxlabel was first put, in epoch milliseconds. */
  readonly registered_at:          number
  /** When this revision was put, in epoch milliseconds, whether or not the whisper changed. */
  readonly written_at:             number
  /** The boxKey, wrapped under the vaultKey. */
  readonly box_key_wrapped:        Ciphered
  /** The whisper, ciphered under the boxKey. */
  readonly whisper_ciphered:       Ciphered

  private constructor(vaultProps: BoxVaultProps, record: BoxRecord) {
    const props = Object.freeze({
      ...record,
      box_key_wrapped:  Object.freeze({ ...record.box_key_wrapped }),
      whisper_ciphered: Object.freeze({ ...record.whisper_ciphered }),
    })
    const sidecar = frozenJsonOf(props.sidecar_json)
    this.format                 = props.format
    this.boxlabel               = props.boxlabel
    this.revision_tok           = props.revision_tok
    this.vault_key_epoch        = props.vault_key_epoch
    this.whisper_codec          = props.whisper_codec
    this.whisper_schema_version = props.whisper_schema_version
    this.sidecar                = sidecar
    this.registered_at          = props.registered_at
    this.written_at             = props.written_at
    this.box_key_wrapped        = props.box_key_wrapped
    this.whisper_ciphered       = props.whisper_ciphered
    const { boxlabel, revision_tok, vault_key_epoch, registered_at, written_at } = props
    const summary: BoxSummary = Object.freeze({ boxlabel, revision_tok, vault_key_epoch, sidecar, registered_at, written_at, damaged: false })
    const { applabel, user_id, vaultlabel, vault_id } = vaultProps
    decorate<Box>(this, { vaultProps: Object.freeze({ applabel, user_id, vaultlabel, vault_id, vault_key_epoch: vaultProps.vault_key_epoch }), props, summary })
    Object.freeze(this)
  }

  /** The box a stored record makes, lying under `vaultProps`, the record kept, frozen, as `props`.
   * Touches no storage and no key. Throws 'bad_record' for a record this package does not write.
   *
   * @example const box = Box.make(vaultProps, valOf(await vaultDB.getBox(scope, 'anthropic_api_key')))
   * @example Box.make(vaultProps, { boxlabel: 'anthropic_api_key' })   // throws 'bad_record': no box record
   */
  static make(vaultProps: BoxVaultProps, record: BoxRecord): Box {
    checkVaultProps(vaultProps, 'Box.make')
    return new this(vaultProps, checkedBoxRecord(record))
  }

  /** A new box holding `whisper`, sealed for `vaultProps` under `vaultKey`. Nothing is written: the vault puts the box.
   * The whisper is ciphered under a boxKey made fresh for this box alone, wrapped under `vaultKey`.
   * Both are bound to the scope, the vault's id and every visible field, so the record moved or
   * altered anywhere will not open. Nothing of the boxKey outlives the call.
   *
   * Its `revision_tok` is fresh, and `written_at` is `now`. `registered_at` and the sidecar carry
   * forward from `opts.over` only when that box opens under `vaultKey`; otherwise `registered_at`
   * is `now` and the sidecar `{}`. A sidecar given wins.
   *
   * Throws 'bad_whisper' for a whisper JSON cannot carry, 'bad_label' for a boxlabel below the
   * floor, and 'bad_option' for a sidecar JSON cannot carry or an `over` under another boxlabel.
   *
   * @param boxlabel - Already through the vault's own validators: only the floor is checked here.
   *
   * @example const box = await Box.seal(vaultProps, Date.now(), 'anthropic_api_key', 'sk-ant-...', vaultKey, { sidecar: { note: 'work account' } })
   * @example const next = await Box.seal(vaultProps, Date.now(), 'anthropic_api_key', 'sk-ant-...', vaultKey, { over: box })   // keeps box's sidecar and registered_at
   */
  static async seal(vaultProps: BoxVaultProps, now: number, boxlabel: string, whisper: Whisper, vaultKey: CryptoKey, opts?: SealBoxOpts): Promise<Box> {
    checkSealOpts(opts)
    const label = Names.checkFloor('boxlabel', boxlabel)
    const whisperBytes = whisperBytesOf(whisper)
    const sidecarJson = opts?.sidecar === undefined ? undefined : stableJsonify(checkedSidecar(opts.sidecar))
    checkVaultProps(vaultProps, 'Box.seal')
    if (! EpochMillis.safeParse(now).success) {
      throw new VaultError('bad_option', "Box.seal needs `now`, the time of the sealing, as whole epoch milliseconds from 1981 to 2255, as Date.now() gives it.")
    }
    checkVaultKey(vaultKey, 'Box.seal')
    const over = opts?.over ?? null
    if (over !== null && (! (over instanceof this) || over.boxlabel !== label)) {
      throw new VaultError('bad_option', "Box.seal's `over` is the box the new one replaces, under the same boxlabel: a Box, or null for none.")
    }
    const plan = await planSeal(vaultProps, vaultKey, { boxlabel: label, whisperBytes, sidecarJson, over })
    return await sealPlanned(vaultProps, now, vaultKey, plan)
  }

  /** The whisper this box holds, as an {@link Outcome}: the non-throwing form of {@link Box.open}.
   *
   * @example const { ok, val: whisper, err } = await box.tryOpen(vaultKey)
   */
  async tryOpen(vaultKey: CryptoKey): Promise<Outcome<Whisper>> {
    return await outcomeOf(() => this.#open(vaultKey), unexpectedError)
  }

  /** The whisper this box holds, opened under `vaultKey`. Through the vault, call `vault.decryptWhisper(box)`, which holds the key.
   * A whisper handed back is the one sealed under this boxlabel, in this vault, with this sidecar
   * and these times. Nothing partial is handed back, and the bare boxKey is dropped on return.
   *
   * Throws 'damaged_box' for a record that will not open: altered in storage, moved from another
   * boxlabel or vault, sealed under a vaultKey this vault does not hold, or opened to something that
   * is no whisper.
   *
   * @example const whisper = await box.open(vaultKey)
   */
  async open(vaultKey: CryptoKey): Promise<Whisper> {
    return valOf(await this.tryOpen(vaultKey))
  }

  /** The box's stored record, `props`: so a box serializes as the record storage holds, never with its vault props.
   *
   * @example JSON.parse(JSON.stringify(box))   // deep-equals box.props
   */
  toJSON(): BoxRecord {
    return this.props
  }

  async #open(vaultKey: CryptoKey): Promise<Whisper> {
    checkVaultKey(vaultKey, 'Opening a box')
    return await openRecord(this.vaultProps, this.props, vaultKey)
  }
}
// --

// == [Sealing and opening]: SealPlan, whisperBytesOf, planSeal, sealPlanned, openRecord

/** What a seal settles before any key is made: the boxlabel, the whisper's bytes, the sidecar, and the `registered_at` carried forward (null for a new box).
 * It holds the whisper's bytes: never log, store or hand it out.
 */
export type SealPlan = Readonly<{ boxlabel: string, whisperBytes: Uint8Array, sidecarJson: string, registeredAt: number | null }>

/** `whisper`'s bytes as a box ciphers them, its JSON with keys sorted: kind 'bad_whisper' for one JSON cannot carry, quoting none of it. */
export const whisperBytesOf = (whisper: unknown): Uint8Array => new TextEncoder().encode(stableJsonify(checkedWhisper(whisper)))

/** The plan for sealing `given`, each input already checked, carrying `over`'s sidecar and `registered_at` as {@link Box.seal} says.
 * Makes no key and ciphers nothing, so its caller can weigh the box before anything is sealed.
 */
export const planSeal = async (
  vaultProps: BoxVaultProps, vaultKey: CryptoKey,
  given: { boxlabel: string, whisperBytes: Uint8Array, sidecarJson: string | undefined, over: Box | null },
): Promise<SealPlan> => {
  const { over } = given
  const opened = over === null ? null : await outcomeOf(() => openRecord(vaultProps, over.props, vaultKey))
  const vouched = opened?.ok === true ? over : null
  return Object.freeze({
    boxlabel:     given.boxlabel,
    whisperBytes: given.whisperBytes,
    sidecarJson:  given.sidecarJson ?? vouched?.props.sidecar_json ?? EmptySidecarJson,
    registeredAt: vouched?.registered_at ?? null,
  })
}

/** The box `plan` makes, sealed for `vaultProps` under `vaultKey` at `now`, as {@link Box.seal} seals one. */
export const sealPlanned = async (vaultProps: BoxVaultProps, now: number, vaultKey: CryptoKey, plan: SealPlan): Promise<Box> => {
  const header: BoxHeader = {
    boxlabel:               plan.boxlabel,
    revision_tok:           randomId(),
    vault_key_epoch:        vaultProps.vault_key_epoch,
    whisper_codec:          'json_v1',
    whisper_schema_version: 1,
    sidecar_json:           plan.sidecarJson,
    registered_at:          plan.registeredAt ?? now,
    written_at:             now,
  }
  const boxKey = await makeBoxKey()
  return Box.make(vaultProps, {
    format:           BoxFormat,
    ...header,
    box_key_wrapped:  await wrapKeyUnder(vaultKey, boxKey, boxCtx(vaultProps, header, 'box_key_wrapped')),
    whisper_ciphered: await cipherBytes(boxKey, plan.whisperBytes, boxCtx(vaultProps, header, 'whisper_ciphered')),
  })
}

/** The whisper `props` holds, opened under `vaultKey` for `vaultProps`: 'damaged_box', naming nothing of the box, when it will not open.
 * It will not when its vaultKey epoch is not the vault props', when it fails to unwrap or decipher
 * under its ctx, or when it opens to no whisper.
 */
const openRecord = async (vaultProps: BoxVaultProps, props: BoxRecord, vaultKey: CryptoKey): Promise<Whisper> => {
  if (props.vault_key_epoch !== vaultProps.vault_key_epoch) {
    // Quotes no boxlabel, as no refusal here does: a host's boxlabel check may admit any text.
    throw new VaultError('damaged_box', "That box is damaged: it says it was sealed under a vaultKey this vault does not hold, so it can't be opened. It was left as it is; remove it, or store its whisper again over it.")
  }
  const { format: _format, box_key_wrapped: boxKeyWrapped, whisper_ciphered: whisperCiphered, ...header } = props
  let whisperBytes: Uint8Array
  try {
    const boxKey = await unwrapKeyUnder(vaultKey, boxKeyWrapped, boxCtx(vaultProps, header, 'box_key_wrapped'), { extractable: false, usage: ['decrypt'] })
    whisperBytes = await decipherBytes(boxKey, whisperCiphered, boxCtx(vaultProps, header, 'whisper_ciphered'))
  } catch {
    // WebCrypto's own refusal is dropped: it says nothing a caller can act on.
    throw new VaultError('damaged_box', "That box is damaged: it would not open under this vault's key, as if altered in storage or moved there from somewhere else. It was left as it is; remove it, or store its whisper again over it.")
  }
  const checked = Whisper.safeParse(parseJsonOrNull(new TextDecoder().decode(whisperBytes)))
  if (! checked.success) {
    throw new VaultError('damaged_box', "That box opened, but what was inside is not a whisper this package knows, so it is damaged. It was left as it is; remove it, or store its whisper again over it.")
  }
  return checked.data
}
// --

// == [Listing]: heldListing

/** A listed box as a vault holds it and hands it out: a fresh copy, frozen through, so nothing a host is handed reaches what the vault keeps.
 * A damaged one keeps its boxlabel and revision alone.
 *
 * @example vault.boxes[0].sidecar.note = 'changed'   // throws in strict code; the vault's own copy is untouched either way
 */
export const heldListing = (listed: BoxSummary | DamagedBox): BoxSummary | DamagedBox => {
  if (listed.damaged) { return Object.freeze({ boxlabel: listed.boxlabel, damaged: true, revision_tok: listed.revision_tok }) }
  const { boxlabel, revision_tok, vault_key_epoch, registered_at, written_at } = listed
  return Object.freeze({ boxlabel, revision_tok, vault_key_epoch, sidecar: frozenJsonOf(stableJsonify(listed.sidecar) ?? EmptySidecarJson), registered_at, written_at, damaged: false })
}
// --

// == [Helpers]: BoxHeader, boxCtx, frozenJsonOf, parseJsonOrNull, checkedBoxRecord, checkVaultProps, checkedWhisper, checkedSidecar, checkVaultKey

/** A box's visible header: every field of its record but its format, which leads each ctx, and the two encrypted ones. */
type BoxHeader = Omit<BoxRecord, 'format' | 'box_key_wrapped' | 'whisper_ciphered'>

// A box's ctx binds its format, the vault it lies in (its scope and id), and its record's whole
// visible header: every field but the format, which leads, and the two encrypted ones, so a
// sidecar, a time, its codec or its vaultKey's epoch altered in storage refuses to open. See
// VOCABULARY.md on ctx.
const boxCtx = (vaultProps: BoxVaultProps, header: BoxHeader, purpose: 'box_key_wrapped' | 'whisper_ciphered') => (
  cipherCtx(BoxFormat, vaultProps.applabel, vaultProps.user_id, vaultProps.vaultlabel, vaultProps.vault_id, purpose, header)
)

/** `json`, parsed, with every object and array in it frozen as the parse builds it. */
const frozenJsonOf = (json: string): Sidecar => JSON.parse(json, (_ckey, val: unknown) => Object.freeze(val)) as Sidecar

/** `text` parsed as JSON, or null when it is none: what a decipher hands the whisper check. */
const parseJsonOrNull = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** `record`, once it is a box record: 'bad_record' otherwise, quoting none of it. */
export const checkedBoxRecord = (record: unknown): BoxRecord => {
  const checked = BoxRecord.safeParse(record)
  if (! checked.success) {
    throw new VaultError('bad_record', "That is not a box record this package writes: a box is made from the record storage holds, as a VaultDB's getBox hands it back, or from a box's own props.")
  }
  return checked.data
}

/** `vaultProps`, once they are vault props a box can lie under: 'bad_option' otherwise. */
const checkVaultProps = (vaultProps: unknown, said: string) => {
  if (! BoxVaultPropsShape.safeParse(vaultProps).success) {
    throw new VaultError('bad_option', `${said} needs the vault props the box lies under -- their applabel, user_id, vaultlabel, vault_id and vault_key_epoch -- as its first argument: a vault builds them from its scope and the props it holds.`)
  }
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
    throw new VaultError('bad_option', "A box's sidecar must be a JSON value: a string, number, boolean, null, array, or plain object, with nothing JSON cannot carry (undefined, a function, a Date) inside it.")
  }
  return checked.data
}

const checkVaultKey = (vaultKey: unknown, said: string) => {
  if (! (vaultKey instanceof CryptoKey)) { throw new VaultError('bad_option', `${said} needs the vaultKey, as a CryptoKey: through the vault, vault.decryptWhisper(box) and vault.putBox() hand it in.`) }
}
// --
