import * as Z from 'zod/mini'
import { Ciphered, cipherBytes, cipherCtx, decipherBytes, makeBoxKey, randomId, unwrapKeyUnder, wrapKeyUnder } from './crypto'
import { VaultError } from './errors'
import { optionsCheck } from './options'
import { type Outcome, outcomeOf, unexpectedError, valOf } from './outcome'
import { stableJsonify } from './stable-jsonify'
import { type BoxSummary, type DamagedBox, EpochMillis, Sidecar, Whisper, vaultKeyEpoch } from './types'
import { decorate } from './utils'
import { NameFloor } from './validators'
import * as Names from './names'
import type { Vault } from './vault'

// == [The record]: BoxRecord, BoxFormat, EmptySidecarJson, isStableJsonText

/**
 * True when `text` is a sidecar's JSON exactly as the vault writes it: parsed and serialized
 * again, keys sorted, it comes back the same. Text respaced, reordered, or nested too deep to
 * serialize is not, and the box holding it reads as damaged, its refusal a calm one.
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

/**
 * One box as the storage layer holds it: the whisper ciphered under its own boxKey, that
 * boxKey wrapped under the vaultKey, and the visible fields -- boxlabel, sidecar, the times
 * it was first stored and last written -- a locked vault may show. Nothing in this record opens
 * without the vaultKey. A {@link Box} is made from one, and hands it back as `box.props`.
 *
 * `revision_tok` is minted fresh on every write and bound into both encryptions, so ciphertext
 * moved between revisions (or boxes, or vaults) refuses to open. So is every other field but the
 * two encrypted ones: an altered sidecar, time or codec refuses to open as well.
 *
 * Stored fields are underbar_case: this record is written to the storage layer as-is, and it is
 * plain JSON -- any backend that can hold text can hold it. Its boxlabel is checked here against
 * the floor every name is held to (`NameFloor`); the vault's validators check it only where a
 * host hands it in.
 *
 * @example BoxRecord.safeParse(await myBackend.readRow(id)).success   // false for a row that is no box
 */
export const BoxRecord = Z.object({
  format:                 Z.literal(BoxFormat),
  boxlabel:               NameFloor,
  revision_tok:           Z.string().check(Z.minLength(1)),
  /**
   * Which vaultKey this box's boxKey is wrapped under: the vault props' `vault_key_epoch` when
   * it was written. Visible, so a locked vault's listing shows which boxes stand under which.
   */
  vault_key_epoch:        vaultKeyEpoch,
  /** This box's boxKey, wrapped under the vaultKey. */
  box_key_wrapped:        Ciphered,
  /** The whisper, ciphered under this box's boxKey. */
  whisper_ciphered:       Ciphered,
  /** How the whisper became the bytes ciphered: `json_v1`, its JSON with every object's keys sorted, as UTF-8. */
  whisper_codec:          Z.literal('json_v1'),
  /** Which generation of the whisper's own shape this box holds: 1, the only one so far. */
  whisper_schema_version: Z.literal(1),
  /**
   * The box's {@link Sidecar}, as JSON with every object's keys sorted and no spacing,
   * exactly as `stableJsonify` writes it: `{}` when the host gave none. Always written, so a box with no sidecar and one with an empty sidecar are one record.
   */
  sidecar_json:           Z.string().check(Z.refine(isStableJsonText, "sidecar_json holds the box's sidecar as the JSON text the vault writes, keys sorted")),
  /** When this boxlabel was first stored, an {@link EpochMillis}: every later store carries it forward. */
  registered_at:          EpochMillis,
  /**
   * When this revision was written, an {@link EpochMillis}: every store stamps it anew. It says
   * nothing of whether the whisper changed -- a store of the same whisper moves it too.
   */
  written_at:             EpochMillis,
})
export type BoxRecord = Z.infer<typeof BoxRecord>
// --

// == [Box]: BoxVault, Box, make, seal, tryOpen, open, toJSON, summary

/**
 * What a box reads off the vault it belongs to: the scope and the vault's id, which every
 * encryption of the box is bound to, the vaultKey epoch it stands under, and the vault's clock,
 * which stamps a sealing. A real {@link Vault} is one; a test may hand in a stand-in.
 */
export type BoxVault = Pick<Vault, 'applabel' | 'user_id' | 'vaultlabel' | 'vault_id' | 'vault_key_epoch' | 'clock'>

/** The options {@link Box.seal} takes. */
export type SealBoxOpts = {
  /** The box's sidecar. Left out, the box keeps the sidecar of the box it replaces (`over`), or has `{}`. */
  sidecar?: Sidecar | undefined
  /**
   * The box this one replaces, if any: its `registered_at` and its sidecar carry forward, but
   * only when it opens under the vaultKey, since nothing else vouches for its visible fields.
   */
  over?:    Box | null | undefined
}

/** What {@link Box.seal}'s options may hold, and nothing else. */
const checkSealOpts = optionsCheck({ sidecar: Z.optional(Z.unknown()), over: Z.optional(Z.unknown()) }, "Box.seal's options are `sidecar`, the box's own visible data, and `over`, the box it replaces: check their spelling, and leave out any other.")

/**
 * One box: a whisper sealed under its own boxKey, with the visible fields a locked vault may
 * show. A box is what a vault holds and hands out; its stored record, `props`, is what crosses
 * to storage. Every stored field is a field of the box as well, the sidecar as its JSON value
 * (`props.sidecar_json` holds the text), and nothing on it can be changed: the box, its record,
 * its sidecar and its summary are frozen.
 *
 * The box keeps a reference to the vault it belongs to, `vault`, which neither a loop, a spread,
 * a log line nor `JSON.stringify` sees: a box logged shows its stored fields, and serialized is
 * its record (`toJSON()` is `props`). The record holds no secret: the whisper is ciphered under
 * a boxKey, wrapped under the vaultKey, and neither key is in it. It is what storage holds.
 *
 * Opening a box is the vault's: `vault.openBox(box)`, with the vaultKey in hand.
 *
 * @example
 *   const box = Box.make(vault, record)
 *   box.boxlabel        // 'anthropic_api_key'
 *   box.sidecar         // { note: 'work account' }
 *   box.props           // the record, as storage holds it
 *   box.summary         // what vault.boxes lists for it
 */
export class Box {
  /** The vault this box belongs to, hidden: it never serializes, and no log line shows it. */
  declare readonly vault: BoxVault
  /** The stored record this box was made from, frozen: what storage holds. Hidden, as `vault` is: a log line shows the fields once. */
  declare readonly props: BoxRecord
  /** Every visible field, the sidecar parsed, and `damaged: false`: what `vault.boxes` lists for this box. Frozen. */
  declare readonly summary: BoxSummary

  /** The record's format, `safebyok-box-v6`. */
  readonly format:                 BoxRecord['format']
  /** The box's label within its vault. */
  readonly boxlabel:               string
  /** Fresh on every put: what a conditional write over this box names. */
  readonly revision_tok:           string
  /** Which vaultKey this box's boxKey is wrapped under. */
  readonly vault_key_epoch:        BoxRecord['vault_key_epoch']
  /** How the whisper became the bytes ciphered: `json_v1`. */
  readonly whisper_codec:          BoxRecord['whisper_codec']
  /** Which generation of the whisper's shape this box holds: 1. */
  readonly whisper_schema_version: BoxRecord['whisper_schema_version']
  /** The app's own JSON beside the whisper, `{}` when none, frozen through: visible in storage, never encrypted. */
  readonly sidecar:                Sidecar
  /** When this boxlabel was first put, in epoch milliseconds. */
  readonly registered_at:          number
  /** When this revision was put, in epoch milliseconds, whether or not the whisper changed. */
  readonly written_at:             number
  /** The boxKey, wrapped under the vaultKey. */
  readonly box_key_wrapped:        Ciphered
  /** The whisper, ciphered under the boxKey. */
  readonly whisper_ciphered:       Ciphered

  private constructor(vault: BoxVault, record: BoxRecord) {
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
    decorate<Box>(this, { vault, props, summary })
    Object.freeze(this)
  }

  /**
   * The box a stored record makes, belonging to `vault`: the record checked against
   * {@link BoxRecord} and kept, frozen, as `props`. Touches nothing: no storage, no key.
   * Throws kind 'bad_record' for a record this package does not write, quoting none of it.
   *
   * @param vault - The vault the box belongs to, whose scope and id its encryptions are bound to.
   * @param record - The box as storage holds it.
   * @returns The box.
   *
   * @example const box = Box.make(vault, valOf(await vaultDB.getBox(scope, 'anthropic_api_key')))
   * @example Box.make(vault, { boxlabel: 'anthropic_api_key' })   // throws 'bad_record': no box record
   */
  static make(vault: BoxVault, record: BoxRecord): Box {
    const given: unknown = vault
    if (typeof given !== 'object' || given === null) {
      throw new VaultError('bad_option', "Box.make needs the vault the box belongs to, as its first argument.")
    }
    const checked = BoxRecord.safeParse(record)
    // The refusal says nothing of the record: its fields could be anything a caller had in hand.
    if (! checked.success) {
      throw new VaultError('bad_record', "That is not a box record this package writes: a box is made from the record storage holds, as a VaultDB's getBox hands it back, or from a box's own props.")
    }
    return new this(vault, checked.data)
  }

  /**
   * A new box holding `whisper`, sealed for `vault` under `vaultKey`: the whisper's JSON, keys
   * sorted, ciphered under a boxKey made fresh for this box alone, that boxKey wrapped under
   * `vaultKey`, and both bound to a ctx rebuilt from the scope, the vault's id and every visible
   * field, so the record moved or altered anywhere will not open. Its `revision_tok` is fresh,
   * and `written_at` is now by the vault's clock; `registered_at` and the sidecar carry forward
   * from `opts.over`, the box it replaces, only when that box opens under `vaultKey` -- one that
   * will not was altered in storage, and nothing vouches for its fields -- and otherwise
   * `registered_at` is now and the sidecar `{}`. A sidecar given wins. Nothing is written: the
   * vault puts the box. Nothing of the boxKey outlives the call.
   *
   * Throws kind 'bad_whisper' for a whisper JSON cannot carry, 'bad_option' for a sidecar JSON
   * cannot carry, a `vaultKey` that is no CryptoKey, an `over` that is no box under this
   * boxlabel, or any other option, and 'bad_label' for a boxlabel below the floor every name is
   * held to; 'absent_vault' while the vault has no id. Each quotes none of what it was handed.
   *
   * @param vault - The vault the box belongs to: its scope, id and clock.
   * @param boxlabel - The box's label, already through the vault's own checks.
   * @param whisper - What the box holds.
   * @param vaultKey - The vaultKey in hand, which wraps the fresh boxKey.
   * @param opts - The sidecar, and the box this one replaces.
   * @returns The sealed box.
   *
   * @example const box = await Box.seal(vault, 'anthropic_api_key', 'sk-ant-...', vaultKey, { sidecar: { note: 'work account' } })
   * @example const next = await Box.seal(vault, 'anthropic_api_key', 'sk-ant-...', vaultKey, { over: box })   // keeps box's sidecar and registered_at
   */
  static async seal(vault: BoxVault, boxlabel: string, whisper: Whisper, vaultKey: CryptoKey, opts?: SealBoxOpts): Promise<Box> {
    checkSealOpts(opts)
    const label = Names.checkFloor('boxlabel', boxlabel)
    const whisperBytes = new TextEncoder().encode(stableJsonify(checkedWhisper(whisper)))
    const givenSidecarJson = opts?.sidecar === undefined ? undefined : stableJsonify(checkedSidecar(opts.sidecar))
    checkVaultKey(vaultKey, 'Box.seal')
    const over = opts?.over ?? null
    if (over !== null && (! (over instanceof this) || over.boxlabel !== label)) {
      throw new VaultError('bad_option', "Box.seal's `over` is the box the new one replaces, under the same boxlabel: a Box, or null for none.")
    }
    const { vaultId, vaultKeyEpoch } = standingOf(vault)
    const opened = over === null ? null : await over.tryOpen(vaultKey)
    const vouched = opened?.ok === true ? over : null
    const now = vault.clock.now()
    const header: BoxHeader = {
      boxlabel:               label,
      revision_tok:           randomId(),
      vault_key_epoch:        vaultKeyEpoch,
      whisper_codec:          'json_v1',
      whisper_schema_version: 1,
      sidecar_json:           givenSidecarJson ?? vouched?.props.sidecar_json ?? EmptySidecarJson,
      registered_at:          vouched?.registered_at ?? now,
      written_at:             now,
    }
    const boxKey = await makeBoxKey()
    return this.make(vault, {
      format:           BoxFormat,
      ...header,
      box_key_wrapped:  await wrapKeyUnder(vaultKey, boxKey, boxCtx(vault, vaultId, header, 'box_key_wrapped')),
      whisper_ciphered: await cipherBytes(boxKey, whisperBytes, boxCtx(vault, vaultId, header, 'whisper_ciphered')),
    })
  }

  /**
   * The whisper this box holds, opened under `vaultKey`, resolving to an {@link Outcome}: the
   * boxKey unwrapped and the whisper deciphered, each under the ctx rebuilt from the box's own
   * visible fields, its vault's scope and id, then parsed and checked as a whisper. So a whisper
   * handed back is the one sealed under this label, in this vault, with this sidecar and these
   * times; nothing partial is handed back, and the bare boxKey is dropped on return.
   *
   * Refuses kind 'damaged_box' for a record that will not open -- altered in storage, moved from
   * another label or vault, sealed under a vaultKey this vault does not hold, or opened to
   * something that is no whisper -- naming nothing of it; 'absent_vault' while the vault has no
   * id, and 'bad_option' for a `vaultKey` that is no CryptoKey. Through the vault,
   * `vault.openBox(box)` is the call: the vault holds the key.
   *
   * @param vaultKey - The vaultKey this box's boxKey is wrapped under.
   * @returns The whisper, or the refusal.
   *
   * @example const { ok, val: whisper, err } = await box.tryOpen(vaultKey)
   */
  async tryOpen(vaultKey: CryptoKey): Promise<Outcome<Whisper>> {
    return await outcomeOf(() => this.#open(vaultKey), unexpectedError)
  }

  /**
   * The whisper this box holds, as {@link Box.tryOpen} opens it, or its refusal thrown.
   *
   * @param vaultKey - The vaultKey this box's boxKey is wrapped under.
   * @returns The whisper.
   *
   * @example const whisper = await box.open(vaultKey)
   */
  async open(vaultKey: CryptoKey): Promise<Whisper> {
    return valOf(await this.tryOpen(vaultKey))
  }

  /**
   * The box's stored record, `props`: what `JSON.stringify(box)` writes, so a box serializes as
   * the record storage holds, and never with its vault.
   *
   * @example JSON.parse(JSON.stringify(box))   // deep-equals box.props
   */
  toJSON(): BoxRecord {
    return this.props
  }

  async #open(vaultKey: CryptoKey): Promise<Whisper> {
    checkVaultKey(vaultKey, 'Opening a box')
    const { vaultId, vaultKeyEpoch } = standingOf(this.vault)
    if (this.vault_key_epoch !== vaultKeyEpoch) {
      // Quotes no boxlabel, as no refusal here does: a host's boxlabel check may admit any text.
      throw new VaultError('damaged_box', "That box is damaged: it says it was sealed under a vaultKey this vault does not hold, so it can't be opened. It was left as it is; remove it, or store its whisper again over it.")
    }
    const { format: _format, box_key_wrapped: boxKeyWrapped, whisper_ciphered: whisperCiphered, ...header } = this.props
    let whisperBytes: Uint8Array
    try {
      const boxKey = await unwrapKeyUnder(vaultKey, boxKeyWrapped, boxCtx(this.vault, vaultId, header, 'box_key_wrapped'), { extractable: false, usage: ['decrypt'] })
      whisperBytes = await decipherBytes(boxKey, whisperCiphered, boxCtx(this.vault, vaultId, header, 'whisper_ciphered'))
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
}
// --

// == [Listing]: heldListing

/**
 * A listed box as a vault holds it and hands it out: a fresh copy, frozen through, its sidecar
 * included, so nothing a host is handed reaches what the vault keeps. A damaged one keeps its
 * boxlabel and revision alone.
 *
 * @example vault.boxes[0].sidecar.note = 'changed'   // throws in strict code; the vault's own copy is untouched either way
 */
export const heldListing = (listed: BoxSummary | DamagedBox): BoxSummary | DamagedBox => {
  if (listed.damaged) { return Object.freeze({ boxlabel: listed.boxlabel, damaged: true, revision_tok: listed.revision_tok }) }
  const { boxlabel, revision_tok, vault_key_epoch, registered_at, written_at } = listed
  return Object.freeze({ boxlabel, revision_tok, vault_key_epoch, sidecar: frozenJsonOf(stableJsonify(listed.sidecar) ?? EmptySidecarJson), registered_at, written_at, damaged: false })
}
// --

// == [Helpers]: BoxHeader, boxCtx, frozenJsonOf, parseJsonOrNull, standingOf, checkedWhisper, checkedSidecar, checkVaultKey

/**
 * A box's visible header: every field of its record but its format, which leads each ctx,
 * and the two encrypted ones. All of it is bound into both.
 */
type BoxHeader = Omit<BoxRecord, 'format' | 'box_key_wrapped' | 'whisper_ciphered'>

// A box's ctx binds its format, the vault it lies in, and its record's whole visible header:
// every field but the format, which leads, and the two encrypted ones, so a sidecar, a time, its
// codec or its vaultKey's epoch altered in storage refuses to open. See VOCABULARY.md on ctx.
const boxCtx = (vault: BoxVault, vaultId: string, header: BoxHeader, purpose: 'box_key_wrapped' | 'whisper_ciphered') => (
  cipherCtx(BoxFormat, vault.applabel, vault.user_id, vault.vaultlabel, vaultId, purpose, header)
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

/**
 * The vault's id, which every encryption of a box is bound to, and the vaultKey epoch its boxes
 * are sealed under: kind 'absent_vault' while it has neither.
 */
const standingOf = (vault: BoxVault) => {
  const { vault_id: vaultId, vault_key_epoch: vaultKeyEpoch } = vault
  if (vaultId === null || vaultKeyEpoch === null) {
    throw new VaultError('absent_vault', "This vault has not been created yet, so no box can be sealed in it or opened from it: the first unlock() creates it.")
  }
  return { vaultId, vaultKeyEpoch }
}

/** `whisper`, once it is one: kind 'bad_whisper' otherwise, quoting none of it. */
export const checkedWhisper = (whisper: unknown): Whisper => {
  const checked = Whisper.safeParse(whisper)
  if (! checked.success) {
    throw new VaultError('bad_whisper', "A whisper must be a JSON value: a string, number, boolean, array, or plain object. A bare null or undefined cannot be stored -- to empty a box, delete it. (null inside an array or object is fine.)")
  }
  return checked.data
}

/** `sidecar`, once it is one: kind 'bad_option' otherwise, quoting none of it. */
export const checkedSidecar = (sidecar: unknown): Sidecar => {
  const checked = Sidecar.safeParse(sidecar)
  if (! checked.success) {
    throw new VaultError('bad_option', "A box's sidecar must be a JSON value: a string, number, boolean, null, array, or plain object, with nothing JSON cannot carry (undefined, a function, a Date) inside it.")
  }
  return checked.data
}

const checkVaultKey = (vaultKey: unknown, said: string) => {
  if (! (vaultKey instanceof CryptoKey)) { throw new VaultError('bad_option', `${said} needs the vaultKey, as a CryptoKey: through the vault, vault.openBox(box) and vault.putBox() hand it in.`) }
}
// --
