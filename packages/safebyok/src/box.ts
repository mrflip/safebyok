import { deepFreeze } from 'es-toolkit'
import * as Z from 'zod/mini'
import { Ciphered, cipherBytes, cipherCtx, decipherBytes, makeBoxKey, randomId } from './crypto'
import { VaultError, isVaultError } from './errors'
import { optionsCheck } from './options'
import { type Outcome, outcomeOf, unexpectedError, valOf } from './outcome'
import { stableJsonify } from './stable-jsonify'
import { type BoxSummary, type DamagedBox, EpochMillis, type ListedSummary, Sidecar, Whisper } from './types'
import { Lease } from './lease'
import type { Vault } from './vault'
import { NameFloor } from './validators'
import * as Names from './names'

// == [The record]: BoxRecord, BoxFormat

/** The box's format, as each record carries it and each of its ctxs begins. */
export const BoxFormat = 'safebyok-box-v8'

/** One box as storage holds it: the whisper ciphered under its own boxKey, that boxKey wrapped under the vaultKey, and the visible fields.
 * Nothing in it opens without the vaultKey. The visible fields, the sidecar among them, are
 * stored in the clear: storage, and a locked vault, can read them. A {@link Box} is made from one,
 * and hands it back as `box.record`.
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
  /** This box's boxKey, wrapped under the vaultKey. */
  box_key_wrapped:        Ciphered,
  /** The whisper, ciphered under this box's boxKey. */
  whisper_ciphered:       Ciphered,
  /** How the whisper became the bytes ciphered: `json_v1`, its JSON with every object's keys sorted, as UTF-8. */
  whisper_codec:          Z.literal('json_v1'),
  /** Which generation of the whisper's own shape this box holds: 1, the only one so far. */
  whisper_schema_version: Z.literal(1),
  /** The box's {@link Sidecar}, the JSON object the host gave: `{}` when it gave none.
   * Storage keeps it as JSON (a `jsonb` column, say), free to reorder its keys or drop its spacing:
   * each ctx binds its JSON with keys sorted, worked out afresh at each seal and open.
   */
  sidecar:                Sidecar,
  /** When this boxlabel was first stored, an {@link EpochMillis}: every later store carries it forward. */
  registered_at:          EpochMillis,
  /** When this revision was written, an {@link EpochMillis}: a store of the same whisper moves it too. */
  written_at:             EpochMillis,
})
export type BoxRecord = Z.infer<typeof BoxRecord>
// --

// == [Box]: BoxVault, BoxView, Box, record, make, seal, tryOpen, open, toJSON

/** The slice of a {@link Vault} a box reads: the scope its encryptions are bound to, the id of the vault props it holds, and the time a seal stamps.
 * A box made from a record lies under that id unless told otherwise.
 */
export type BoxVault = Pick<Vault, 'applabel' | 'user_id' | 'vaultlabel' | 'vault_id' | 'now'>

/** A box's visible fields, each once: what `{ ...box }` and `box.toJSON()` hold, and what a {@link BoxSummary} holds but for `damaged`. */
export type BoxView = Omit<BoxSummary, 'damaged'>

/** The options {@link Box.seal} takes. */
export type SealBoxOpts = {
  /** The box's sidecar. Left out, the box keeps the sidecar of the box it replaces (`over`), or has `{}`. */
  sidecar?: Sidecar | undefined
  /** The box this one replaces: its `registered_at` and sidecar carry forward only when it opens under the lease.
   * Nothing else vouches for its visible fields.
   */
  over?:    Box | null | undefined
}

/** What {@link Box.seal}'s options may hold, and nothing else. */
const checkSealOpts = optionsCheck({ sidecar: Z.optional(Z.unknown()), over: Z.optional(Z.unknown()) }, "Box.seal's options are `sidecar`, the box's own visible data, and `over`, the box it replaces: check their spelling, and leave out any other.")

/** One box: a whisper sealed under its own boxKey, with the visible fields a locked vault may show.
 * Its visible fields (boxlabel, revision, its sidecar, and times) are its own,
 * and so is the `vault_id` of the vault props it lies under. The ciphertext and the storage
 * mechanics (format, codec, schema version) stay in its `record`, which is what crosses to storage
 * and holds no secret: neither key is in it. The box, its record and its sidecar are frozen through.
 *
 * The box keeps its record and its vault in private fields: no loop, spread, log line or
 * `JSON.stringify` sees them. A box logged, spread or serialized shows each visible field once:
 * what `vault.boxes` lists for it, but for `damaged`. A box opens under the lease the vault holds
 * while unlocked: `box.open(lease)`, or through the vault, `vault.decryptWhisper(box)`.
 *
 * A missing or malformed vault, lease or option throws 'bad_option'. No refusal quotes what the
 * call was handed.
 *
 * @example
 *   const box = Box.make(vault, record)
 *   box.boxlabel        // 'anthropic_api_key'
 *   box.sidecar         // { note: 'work account' }
 *   box.vault_id        // the vault props it lies under
 *   box.record          // the record, as storage holds it
 *   { ...box }          // its visible fields: what vault.boxes lists for it, but for damaged
 */
export class Box {
  /** The stored record this box was made from, frozen through: the one source of every field. */
  readonly #record: BoxRecord
  /** The vault it is of: its scope, which its encryptions are bound to, and its clock. */
  readonly #vault: BoxVault

  readonly boxlabel:      string
  /** Fresh on every put: what a conditional write over this box names. */
  readonly revision_tok:  string
  /** The app's own JSON beside the whisper, `{}` when none: stored in the clear, never encrypted. */
  readonly sidecar:       Sidecar
  /** When this boxlabel was first put, in epoch milliseconds. */
  readonly registered_at: number
  /** When this revision was put, in epoch milliseconds, whether or not the whisper changed. */
  readonly written_at:    number
  /** The id of the vault props this box lies under: bound into both its encryptions, and named by the write that puts it. */
  readonly vault_id:      string

  private constructor(vault: BoxVault, vaultId: string, record: BoxRecord) {
    // The record is the check's own copy, which nothing else holds: frozen where it stands.
    this.#record       = deepFreeze(record)
    this.#vault        = vault
    this.boxlabel      = record.boxlabel
    this.revision_tok  = record.revision_tok
    this.sidecar       = this.#record.sidecar
    this.registered_at = record.registered_at
    this.written_at    = record.written_at
    this.vault_id      = vaultId
    Object.freeze(this)
  }

  /** The stored record this box was made from, frozen through: what storage holds, ciphertext and all. */
  get record(): BoxRecord {
    return this.#record
  }

  /** The box a stored record makes, of `vault`, lying under the vault props whose id is `vaultId`; the record kept, frozen, as `record`.
   * Touches no storage and no key. Throws 'bad_record' for a record this package does not write,
   * and 'absent_vault' when no `vaultId` is given and the vault holds no vault props.
   *
   * @param vaultId - The id of the vault props it lies under, as the vault held them when it read the record. Default: the vault's own now.
   *
   * @example const box = Box.make(vault, valOf(await vaultDB.getBox(scope, 'anthropic_api_key')))
   * @example Box.make(vault, { boxlabel: 'anthropic_api_key' })   // throws 'bad_record': no box record
   */
  static make(vault: BoxVault, record: BoxRecord, vaultId: string | null = vault.vault_id): Box {
    const checked = checkedBoxRecord(record)
    return new this(vault, standingVaultId(vaultId), checked)
  }

  /** A new box of `vault` holding `whisper`, sealed under `lease`. Nothing is written: the vault puts the box.
   * The whisper is ciphered under a boxKey made fresh for this box alone, wrapped under the vaultKey
   * the lease holds. Both are bound to the scope, the lease's `vault_id` and every visible field, so
   * the record moved or altered anywhere will not open. The box lies under the lease's vault props:
   * the vault it names is always the one whose key sealed it. Nothing of the boxKey outlives the call.
   *
   * Its `revision_tok` is fresh, and `written_at` is the vault's time now. `registered_at` and the
   * sidecar carry forward from `opts.over` only when that box opens under the lease; otherwise
   * `registered_at` is now and the sidecar `{}`. A sidecar given wins.
   *
   * Throws 'bad_whisper' for a whisper JSON cannot carry, 'bad_label' for a boxlabel below the
   * floor, and 'bad_option' for a sidecar JSON cannot carry or an `over` under another boxlabel. It
   * refuses 'vault_locked' for a lease not opened or ended, or an `over` that lies in another vault
   * than the lease (a vault deleted and made anew since it was read).
   *
   * @param boxlabel - Already through the vault's own validators: only the floor is checked here.
   *
   * @example const box = await Box.seal(vault, lease, 'anthropic_api_key', 'sk-ant-...', { sidecar: { note: 'work account' } })
   * @example const next = await Box.seal(vault, lease, 'anthropic_api_key', 'sk-ant-...', { over: box })   // keeps box's sidecar and registered_at
   */
  static async seal(vault: BoxVault, lease: Lease, boxlabel: string, whisper: Whisper, opts?: SealBoxOpts): Promise<Box> {
    checkSealOpts(opts)
    const label = Names.checkFloor('boxlabel', boxlabel)
    const whisperBytes = whisperBytesOf(whisper)
    const sidecar = opts?.sidecar === undefined ? undefined : checkedSidecar(opts.sidecar)
    checkLease(lease, 'Box.seal')
    const over = opts?.over ?? null
    if (over !== null && (! (over instanceof this) || over.boxlabel !== label)) {
      throw new VaultError('bad_option', "Box.seal's `over` is the box the new one replaces, under the same boxlabel: a Box, or null for none.")
    }
    const plan = await planSeal(lease, { boxlabel: label, whisperBytes, sidecar, over })
    return await sealPlanned(vault, lease, plan)
  }

  /** The whisper this box holds, as an {@link Outcome}: the non-throwing form of {@link Box.open}.
   *
   * @example const { ok, val: whisper, err } = await box.tryOpen(lease)
   */
  async tryOpen(lease: Lease): Promise<Outcome<Whisper>> {
    return await outcomeOf(() => this.#open(lease), unexpectedError)
  }

  /** The whisper this box holds, opened under `lease`. Through the vault, call `vault.decryptWhisper(box)`, which holds the lease.
   * A whisper handed back is the one sealed under this boxlabel, in this vault, with this sidecar
   * and these times. Nothing partial is handed back, and the bare boxKey is dropped on return.
   *
   * Throws 'damaged_box' for a record that will not open: altered in storage, moved from another
   * boxlabel or vault, sealed under a vaultKey this vault does not hold, or opened to something that
   * is no whisper. Throws 'vault_locked' for a lease not opened or ended, or one of another vault
   * than the box lies in (a vault deleted and made anew since the box was read).
   *
   * @example const whisper = await box.open(lease)
   */
  async open(lease: Lease): Promise<Whisper> {
    return valOf(await this.tryOpen(lease))
  }

  /** The box's visible fields, each once, as a plain object: what `JSON.stringify(box)` writes and a log line shows. Storage takes `record`, not this.
   *
   * @example JSON.parse(JSON.stringify(box))   // { boxlabel, revision_tok, sidecar, registered_at, written_at, vault_id }
   */
  toJSON(): BoxView {
    const { ...visible } = this
    return visible
  }

  async #open(lease: Lease): Promise<Whisper> {
    checkLease(lease, 'Opening a box')
    return await openRecord(this.#vault, this.vault_id, this.#record, lease)
  }
}
// --

// == [Sealing and opening]: SealPlan, whisperBytesOf, planSeal, sealPlanned, openRecord

/** What a seal settles before any key is made: the boxlabel, the whisper's bytes, the sidecar, and the `registered_at` carried forward (null for a new box).
 * It holds the whisper's bytes: never log, store or hand it out.
 */
export type SealPlan = Readonly<{ boxlabel: string, whisperBytes: Uint8Array, sidecar: Sidecar, registeredAt: number | null }>

/** `whisper`'s bytes as a box ciphers them, its JSON with keys sorted: kind 'bad_whisper' for one JSON cannot carry, quoting none of it. */
export const whisperBytesOf = (whisper: unknown): Uint8Array => new TextEncoder().encode(stableJsonify(checkedWhisper(whisper)))

/** The plan for sealing `given`, each input already checked, carrying `over`'s sidecar and `registered_at` as {@link Box.seal} says.
 * Makes no key and ciphers nothing, so its caller can weigh the box before anything is sealed.
 * Refuses 'vault_locked' for an `over` that lies in another vault than the lease, or a lease not
 * opened or ended.
 */
export const planSeal = async (
  lease: Lease,
  given: { boxlabel: string, whisperBytes: Uint8Array, sidecar: Sidecar | undefined, over: Box | null },
): Promise<SealPlan> => {
  const { over } = given
  const opened = over === null ? null : await over.tryOpen(lease)
  if (opened?.ok === false && isVaultError(opened.err, 'vault_locked')) { throw opened.err }
  const vouched = opened?.ok === true ? over : null
  return Object.freeze({
    boxlabel:     given.boxlabel,
    whisperBytes: given.whisperBytes,
    sidecar:      given.sidecar ?? vouched?.sidecar ?? {},
    registeredAt: vouched?.registered_at ?? null,
  })
}

/** The box `plan` makes, of `vault`, sealed under `lease` as {@link Box.seal} seals one, lying under the lease's `vault_id`. */
export const sealPlanned = async (vault: BoxVault, lease: Lease, plan: SealPlan): Promise<Box> => {
  const now = vault.now()
  const header: BoxHeader = {
    boxlabel:               plan.boxlabel,
    revision_tok:           randomId(),
    whisper_codec:          'json_v1',
    whisper_schema_version: 1,
    sidecar:                plan.sidecar,
    registered_at:          plan.registeredAt ?? now,
    written_at:             now,
  }
  const { vault_id: vaultId } = lease
  const boxKey = await makeBoxKey()
  return Box.make(vault, {
    format:           BoxFormat,
    ...header,
    box_key_wrapped:  await lease.wrapBoxKey(boxKey, boxCtx(vault, vaultId, header, 'box_key_wrapped')),
    whisper_ciphered: await cipherBytes(boxKey, plan.whisperBytes, boxCtx(vault, vaultId, header, 'whisper_ciphered')),
  }, vaultId)
}

/** The whisper `record` holds, a box of `vault` lying under `vaultId`, opened under `lease`: 'damaged_box', naming nothing of the box, when it will not open.
 * It will not when it fails to unwrap or decipher under its ctx, or when it opens to no whisper. It
 * refuses 'vault_locked' when the lease is of another vault than `vaultId`, or is not opened or has
 * ended.
 */
const openRecord = async (vault: BoxVault, vaultId: string, record: BoxRecord, lease: Lease): Promise<Whisper> => {
  if (lease.vault_id !== vaultId) {
    throw new VaultError('vault_locked', "That box lies in another vault than the one this lease opens: the vault was deleted and made anew since the box was read, and its key is not in hand. Read the box again.")
  }
  const { format: _format, box_key_wrapped: boxKeyWrapped, whisper_ciphered: whisperCiphered, ...header } = record
  let whisperBytes: Uint8Array
  try {
    const boxKey = await lease.unwrapBoxKey(boxKeyWrapped, boxCtx(vault, vaultId, header, 'box_key_wrapped'))
    whisperBytes = await decipherBytes(boxKey, whisperCiphered, boxCtx(vault, vaultId, header, 'whisper_ciphered'))
  } catch (err) {
    // A lease that holds no key is said as such; WebCrypto's own refusal is dropped: it says nothing a caller can act on.
    if (isVaultError(err)) { throw err }
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

/** A listed box as a vault holds it and hands it out, lying under `vaultId`, the vault props the listing was read beside.
 * A sound one is a box's visible fields, as `{ ...box }` holds them, and `damaged: false`, frozen
 * through. Its sidecar is the one the listing's check made, frozen where it stands, never parsed
 * again. A damaged one keeps its boxlabel and revision alone.
 *
 * @example vault.boxes[0].sidecar.note = 'changed'   // throws in strict code; the vault's own copy is untouched either way
 */
export const heldListing = (listed: ListedSummary | DamagedBox, vaultId: string): BoxSummary | DamagedBox => {
  if (listed.damaged) { return Object.freeze({ boxlabel: listed.boxlabel, damaged: true, revision_tok: listed.revision_tok }) }
  const { boxlabel, revision_tok, registered_at, written_at } = listed
  return Object.freeze({ boxlabel, revision_tok, sidecar: deepFreeze(listed.sidecar), registered_at, written_at, vault_id: vaultId, damaged: false })
}
// --

// == [Helpers]: BoxHeader, boxCtx, parseJsonOrNull, checkedBoxRecord, checkedWhisper, checkedSidecar, standingVaultId, checkLease

/** A box's visible header: every field of its record but its format, which leads each ctx, and the two encrypted ones. */
type BoxHeader = Omit<BoxRecord, 'format' | 'box_key_wrapped' | 'whisper_ciphered'>

// A box's ctx binds its format, the vault it lies in (its vault's scope, and the id of the vault
// props it lies under), and its record's whole visible header: every field but the format, which
// leads, and the two encrypted ones, so a sidecar, a time or its codec altered in storage refuses
// to open. The sidecar is bound as its JSON with keys sorted, worked out here, so storage that
// reorders its keys or drops its spacing changes nothing. See VOCABULARY.md on ctx.
const boxCtx = (vault: BoxVault, vaultId: string, header: BoxHeader, purpose: 'box_key_wrapped' | 'whisper_ciphered') => (
  cipherCtx(BoxFormat, vault.applabel, vault.user_id, vault.vaultlabel, vaultId, purpose, { ...header, sidecar: stableJsonify(header.sidecar)! })
)

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

/** `vaultId`, the id of the vault props a box lies under: kind 'absent_vault' for none, a vault not made yet. */
const standingVaultId = (vaultId: string | null): string => {
  if (vaultId === null) {
    throw new VaultError('absent_vault', 'This vault has not been created yet, so no box lies in it: the first unlock() creates it.')
  }
  return vaultId
}

/** `lease`, once it is a Lease: kind 'bad_option' otherwise. */
const checkLease = (lease: unknown, said: string) => {
  if (! (lease instanceof Lease)) { throw new VaultError('bad_option', `${said} needs the vault's lease, as a Lease: through the vault, vault.decryptWhisper(box) and vault.putBox() hand it in.`) }
}
// --
