import { deepFreeze } from 'es-toolkit'
import { randomId } from './crypto'
import { VaultError } from './errors'
import { heldLeaseOf } from './held-lease'
import { type Outcome, outcomeOf, refusalOf, valOf } from './outcome'
import { stableJsonify } from './stable-jsonify'
import { BoxFormat, type BoxSparse, type Sidecar, type MadeUnder, type BoxRecord, type SealBoxProps, type Whisper } from './shapes/box'
import * as BX from './shapes/box'
import type { VaultStamp } from './shapes/vault'
import type { ConsistencyWith } from './types/type-aliases'
import type { Boxscope, VaultScope } from './shapes/scopes'

// == [Box]: VaultOfBox, Box, record, baseRevisionTok, make, seal, extractWhisper

/** The vault a box lies in, as far as a box reads it: its scope and `vault_tok`, and its demand. A Vault object is one. */
type VaultOfBox = ConsistencyWith<VaultScope & Pick<VaultStamp, 'vault_tok'>>

/** One revision of one box: a whisper sealed under its own boxKey, with the visible fields a locked vault may show, and what it was made under.
 * A box revision is never rewritten, so every field a Box shows is fixed for its life, and frozen
 * through: its {@link Boxscope}, its {@link BoxSparse}, and the `vault_tok` and epochs of the vault
 * as it was when the box was read, stored or sealed, which `vault.demandConsistentWith` judges. A
 * spread, JSON or a log line shows those fields, and nothing secret. The ciphertext stays in its
 * private `record`, which is what crosses to storage; neither key is in it.
 *
 * A Box comes from a read or a write that landed (`vault.getBox`, `vault.putBox`), or from
 * {@link Box.seal}, not yet stored. `box.extractWhisper()` opens it under the lease the vault holds.
 *
 * Misuse refuses before anything is ciphered: 'bad_whisper' for a whisper JSON cannot carry, and
 * 'bad_option' for props amiss, as `sealBoxProps` checks them (a boxlabel that is not a
 * label, a sidecar JSON cannot carry, a malformed base, or a field but `boxlabel`, `sidecar` and
 * `base`), or a malformed `madeUnder` or `made`. No refusal quotes what the call was handed. A bug
 * met in a seal or an extract past its argument checks (a throw that is no VaultError) arrives as
 * 'unexpected_error', never raw; each `try` form is one {@link outcomeOf} over its throwing form.
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
  readonly #vault: VaultOfBox
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

  private constructor(vault: VaultOfBox, madeUnder: MadeUnder, record: BoxRecord, baseRevisionTok: string | null) {
    // The record is the check's own copy, which nothing else holds: frozen in place.
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

  /** The revision this box was sealed over, which its write expects still stored: the box read or listed before it, or null for a new box. Null for a box read or stored. */
  get baseRevisionTok(): string | null {
    return this.#baseRevisionTok
  }

  /** The box a stored record makes, of `vault`, made under `madeUnder`; the record kept, frozen, as `record`.
   * Touches no storage and no key. Throws 'bad_record' for a record this package does not write.
   *
   * @param madeUnder - What the vault the record was read or written under showed then: its scope,
   *   the `vault_tok` the read or write expected, and both epochs. A {@link VaultSparse} will do,
   *   as only those fields are taken.
   *
   * @example const box = Box.make(vault, record, madeUnder)   // record: what a VaultDB's getBox resolved
   * @example Box.make(vault, { boxlabel: 'anthropic_api_key' }, madeUnder)   // throws 'bad_record': no box record
   */
  static make(vault: VaultOfBox, record: BoxRecord, madeUnder: MadeUnder): Box {
    const checked = BX.boxRecord.parse(record)
    return new this(vault, BX.madeUnder.parse(madeUnder), checked, null)
  }

  /** A new box of `vault` holding `whisper`, sealed under the vault's lease; not yet stored: `vault.putBox` stores one.
   * The whisper is serialized as its JSON with keys sorted, then ciphered through the held lease's
   * `sealProps` under a boxKey made fresh for this box alone. Both encryptions bind the box's
   * stamp, as {@link BoxRecord} says.
   *
   * Its `revision_tok` is fresh, and `written_at` is `made.now`, the vault's time. `registered_at`
   * is the base's when it gives one, else now; the base's revision is the box's `baseRevisionTok`.
   * The sidecar is `{}` when left out: a seal carries nothing from the base but its revision and
   * `registered_at`.
   *
   * It demands `made.madeUnder` consistent with `vault`, lease-bound, before and after its one
   * wait: 'vault_locked' with no lease held, and 'vault_gone', 'vault_remade' or 'gate_moved' for a
   * `madeUnder` the vault has moved on from, so a box sealed in one vault is never made under
   * another. Otherwise it refuses as `lease.cipheredWith` does.
   *
   * @param made.madeUnder - The vault as it is as it seals: its scope, `vault_tok` and both epochs. A {@link VaultSparse} will do, as only those fields are taken.
   * @param made.now - The time by the vault's clock, in epoch milliseconds: the new revision's `written_at`.
   *
   * @example const box = await Box.seal(vault, { boxlabel: 'anthropic_api_key', sidecar: { note: 'work account' } }, 'sk-ant-...', { madeUnder, now })
   * @example const next = await Box.seal(vault, { boxlabel: box.boxlabel, sidecar: box.sidecar, base: box }, 'sk-ant-...', { madeUnder, now })   // next.baseRevisionTok: box.revision_tok
   */
  static async seal(vault: VaultOfBox, props: SealBoxProps, whisper: Whisper, made: { madeUnder: MadeUnder, now: number }): Promise<Box> {
    const { boxlabel, sidecar, base } = BX.sealBoxProps.parse(props)
    const { madeUnder, now } = BX.made.parse(made)
    const whisperBytes = whisperBytesOf(whisper)
    try {
      vault.demandConsistentWith(madeUnder, { leaseBound: true })
      const lease = heldLeaseOf(vault)
      if (lease === null) { throw lockedError() }
      const sealed = await lease.trySealProps({
        format:                 BoxFormat,
        boxlabel,
        revision_tok:           randomId(),
        whisper_codec:          'json_v1',
        whisper_schema_version: 1,
        sidecar,
        registered_at:          base?.registered_at ?? now,
        written_at:             now,
      }, { whisper: whisperBytes })
      // What the seal brought, a refusal included, is used only while the vault is still as the box is made under.
      vault.demandConsistentWith(madeUnder, { leaseBound: sealed.ok })
      return new Box(vault, madeUnder, BX.boxRecord.parse(valOf(sealed)), base?.revision_tok ?? null)
    } catch (err) {
      throw refusalOf(err)
    } finally {
      whisperBytes.fill(0)
    }
  }

  /** A new box of `vault` holding `whisper`, as an {@link Outcome}: the non-throwing form of {@link Box.seal}. */
  static async trySeal(vault: VaultOfBox, props: SealBoxProps, whisper: Whisper, made: { madeUnder: MadeUnder, now: number }): Promise<Outcome<Box>> {
    return await outcomeOf(() => this.seal(vault, props, whisper, made))
  }

  /** The whisper this box holds, deciphered through the held lease's `decipherWith`, then its JSON parsed.
   * A whisper handed back is the one sealed under this boxlabel, in this vault, with this sidecar
   * and these times. Nothing partial is handed back, and the whisper's bytes are zeroed once parsed.
   *
   * It demands, lease-bound, that the box is consistent with its vault, before the decipher and
   * after: 'vault_locked' with no lease held, and 'vault_gone', 'vault_remade' or 'gate_moved' once
   * the vault moved on since the box was made. It refuses as `lease.decipherWith` does: 'damaged_box'
   * for a box that will not open under the vaultKey, 'damaged_lease' for a lease that will not.
   * A box that opens to something that is no whisper is 'damaged_box' too.
   *
   * @example const whisper = await box.extractWhisper()
   */
  async extractWhisper(): Promise<Whisper> {
    try {
      this.#vault.demandConsistentWith(this, { leaseBound: true })
      const lease = heldLeaseOf(this.#vault)
      if (lease === null) { throw lockedError() }
      const { box_key_wrapped: boxKeyWrapped, whisper_ciphered: whisperCiphered, ...visible } = this.#record
      const deciphered = await lease.tryDecipherWith({ box_key_wrapped: boxKeyWrapped, whisper_ciphered: whisperCiphered }, visible)
      // What the decipher brought, a refusal included, is used only while the box is still consistent with the vault in hand, and, for a decipher that came, its lease in force.
      try {
        // A lease that refused its own use (damaged_lease) has dropped itself: only the vault half is asked then.
        this.#vault.demandConsistentWith(this, { leaseBound: deciphered.ok })
      } catch (err) {
        if (deciphered.ok) { deciphered.val.fill(0) }
        throw err
      }
      const whisperBytes = valOf(deciphered)
      try {
        const checked = BX.whisper.safeParse(parseJsonOrNull(new TextDecoder().decode(whisperBytes)))
        if (! checked.success) {
          throw new VaultError('damaged_box', "That box opened, but what was inside is not a whisper this package knows, so it is damaged. It was left as it is; remove it, or store its whisper again over it.")
        }
        return checked.data
      } finally {
        whisperBytes.fill(0)
      }
    } catch (err) {
      throw refusalOf(err)
    }
  }

  /** The whisper this box holds, as an {@link Outcome}: the non-throwing form of {@link Box.extractWhisper}.
   *
   * @example const { ok, val: whisper, err } = await box.tryExtractWhisper()
   */
  async tryExtractWhisper(): Promise<Outcome<Whisper>> {
    return await outcomeOf(() => this.extractWhisper())
  }
}
// --

// == [Listing]: boxSparseOf

/** `record` as a listing shows a sound box, frozen through: every field but its two ciphered ones, which it may hold or not.
 * Its sidecar is the record's own, frozen in place, never parsed again.
 *
 * @example vault.getSnapshot().boxes[0].sidecar.note = 'changed'   // throws in strict code; the vault's own copy is untouched either way
 */
export const boxSparseOf = (record: BoxSparse & { box_key_wrapped?: unknown, whisper_ciphered?: unknown }): BoxSparse => {
  const { box_key_wrapped: _boxKeyWrapped, whisper_ciphered: _whisperCiphered, ...sparse } = record
  return deepFreeze(sparse)
}
// --

// == [Helpers]: whisperBytesOf, parseJsonOrNull, lockedError

/** `whisper`'s bytes as a box ciphers them, its JSON with keys sorted: kind 'bad_whisper' for one JSON cannot carry, quoting none of it. Zero them once used. */
export const whisperBytesOf = (whisper: unknown): Uint8Array => new TextEncoder().encode(stableJsonify(BX.whisper.parse(whisper)))

/** `text` parsed as JSON, or null when it is none. */
const parseJsonOrNull = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** The refusal of a seal or an extract with no lease in hand. */
const lockedError = () => new VaultError('vault_locked', 'The vault is locked, so the box was neither sealed nor opened: unlock it first, or go through the vault (getWhisper, putBox), which asks for a proof.')
// --
