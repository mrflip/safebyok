/** The box record and the shapes sliced from it, the whisper and sidecar it holds, and what a box is sealed with. Each record's `parse` refuses 'bad_record', quoting none of it. */

import type * as Z from 'zod'
import { record } from 'zod'
import * as Phrases from '../phrases'
import { Validator } from '../checks/validator'
import * as FX from './fields'
import * as VX from './vault'

// == [Whisper and sidecar]: WhisperJson, whisper, isPlainBag, whisperBag, sidecar

/** The JSON a whisper is made of, `null` included inside an array or object: a whole {@link Whisper} cannot be null. */
export type WhisperJson = string | number | boolean | null | WhisperJson[] | { [ckey: string]: WhisperJson }

/** The secret kept in a box: a JSON value, a string, number, boolean, array or plain object.
 * `undefined` anywhere in it is refused, as JSON cannot carry it. A bare `null` is refused too:
 * emptying a box is `delBox`'s job.
 *
 * @example 'sk-ant-api03-...'
 * @example { apiKey: 'sk-ant-...', orgId: null }
 */
export type Whisper = Exclude<WhisperJson, null>

/** True for a plain object, built by a literal or `Object.create(null)`: never a Date or Map, which JSON would flatten. */
export const isPlainBag = (val: unknown): val is Record<string, unknown> => {
  if (typeof val !== 'object' || val === null) { return false }
  const proto: unknown = Object.getPrototypeOf(val)
  return proto === Object.prototype || proto === null
}

/** The check for a {@link Whisper}, exactly what JSON can carry, never what it would mangle, and never a bare null; and `whisperBag`, the plain JSON object a whisper or a {@link Sidecar} may be.
 * Its `parse` refuses 'bad_whisper', quoting none of it, and naming none of an object's keys: an
 * object that is not plain JSON fails whole.
 *
 * @example whisper.parse('sk-ant-...')                  // a string passes through
 * @example whisper.safeParse(new Date()).success        // false: JSON would flatten it to {}
 * @example whisper.safeParse(undefined).success         // false: undefined cannot be stored
 * @example whisper.safeParse(null).success              // false: emptying a box is delBox's job
 * @example whisper.safeParse({ orgId: null }).success   // true: null inside a structure is JSON
 */
export const { whisper, whisperBag } = Validator('bad_whisper', ({ lazy, union, str, num, bool, lit, arr, custom }) => {
  const whisperJson: Z.ZodType<WhisperJson> = lazy(() => union([str, num, bool, lit(null), whisperArr, plainBag]))
  // An object is judged whole, so a refusal's path never holds one of its keys, which are the caller's own.
  const whisperMembers = record(str, whisperJson)
  const plainBag = custom<Record<string, WhisperJson>>((val) => isPlainBag(val) && whisperMembers.safeParse(val).success, Phrases.WhisperBagShape)
  const whisperArr = arr(whisperJson)
  // A judged object is the caller's own, so each check hands back a copy, as a parse of an object does:
  // a box freezes its record through, and must never freeze, or share, the caller's sidecar.
  const whisperBag = plainBag.overwrite((bag) => structuredClone(bag))
  const whisper: Z.ZodType<Whisper> = union([str, num, bool, whisperArr, plainBag], Phrases.WhisperShape).overwrite((whisper) => structuredClone(whisper))
  return { whisper, whisperBag }
})

/** A box's sidecar: your app's own JSON object beside the whisper, `{}` for none, shown while the vault is locked. Never put secret material in it.
 * It is stored in the clear, as the JSON object it is (a `jsonb` column, say, which a server can
 * query), so anyone who can read the database can read it. It is in the box's stamp as its JSON
 * with keys sorted: a sidecar altered in storage makes the box refuse to open, while one whose
 * keys storage reorders still opens. safebyok never looks inside it: check its shape before
 * `putBox()`. Its `parse` refuses 'bad_option', as `putBox()` does.
 *
 * @example sidecar.parse({ note: 'work account', project: 'atlas' })
 * @example sidecar.safeParse({ when: new Date() }).success     // false: JSON would flatten it to {}
 * @example sidecar.safeParse('work account').success           // false: a sidecar is an object -- { note: 'work account' }
 */
export const { sidecar } = Validator('bad_option', () => ({ sidecar: whisperBag }))
export type Sidecar = Z.infer<typeof sidecar>
// --

// == [The record]: BoxFormat, boxRecord, boxSparse, DamagedBoxRecord, boxDamageVals, boxDamaged, boxStamp, cipheredShape, BoxCiphered

/** The box's format, as each record carries it and each of its ctxs begins. */
export const BoxFormat = 'safebyok-box-v8'

/** One box as storage holds it: the whisper ciphered under its own boxKey, that boxKey wrapped under the vaultKey, and the visible fields.
 * Nothing in it opens without the vaultKey. The visible fields, the sidecar among them, are
 * stored in the clear: storage, and a locked vault, can read them. A {@link Box} is made from one,
 * and hands it back as `box.record`.
 *
 * Both encryptions bind its {@link BoxStamp}, beside its vault's stamp but for the vault's format.
 * So ciphertext moved between revisions, boxes or vaults refuses to open, as does an altered
 * sidecar or time; a new vault format leaves it open. Its `parse` is strict, and refuses
 * 'bad_record': a field this version does not know is damage.
 *
 * @example boxRecord.safeParse(await myBackend.getRow(id)).success   // false for a row that is no box
 */
export const { boxRecord } = Validator('bad_record', ({ obj, lit, boxlabel, epochMillis, revision_tok, box_key_wrapped, whisper_ciphered }) => ({
  boxRecord: obj({
    format:                 lit(BoxFormat),
    boxlabel,
    revision_tok,
    /** This box's boxKey, wrapped under the vaultKey. */
    box_key_wrapped,
    /** The whisper, ciphered under this box's boxKey. */
    whisper_ciphered,
    /** How the whisper became the bytes ciphered: `json_v1`, its JSON with every object's keys sorted, as UTF-8. */
    whisper_codec:          lit('json_v1'),
    /** Which generation of the whisper's own shape this box holds: 1, the only one so far. */
    whisper_schema_version: lit(1),
    /** The box's {@link Sidecar}, the JSON object the host gave: `{}` when it gave none.
     * Storage keeps it as JSON (a `jsonb` column, say), free to reorder its keys or drop its spacing:
     * each ctx binds its JSON with keys sorted, worked out afresh at each seal and open.
     */
    sidecar:                sidecar,
    /** When this boxlabel was first stored: every later store carries it forward. */
    registered_at:          epochMillis,
    /** When this revision was written: a store of the same whisper moves it too. */
    written_at:             epochMillis,
  }).strict(),
}), [FX])
export type BoxRecord = Z.infer<typeof boxRecord>

/** A box as a vault's listing shows it: every field of its record but the two ciphered ones, the sound boxes of a read. Its `parse` refuses 'bad_record'.
 * It holds nothing secret, and shows while the vault is locked: the sidecar is as storage holds it,
 * and only opening the box proves it unaltered. A record that fails its check never lists as one:
 * it is a {@link BoxDamaged}. Its `parse` takes it from a box or its record, leaving the rest.
 *
 * @example boxSparse.parse(listed)   // { format, boxlabel, revision_tok, whisper_codec, whisper_schema_version, sidecar, registered_at, written_at }
 */
export const { boxSparse } = Validator('bad_record', () => ({
  boxSparse: boxRecord.omit({ box_key_wrapped: true, whisper_ciphered: true }).strip(),
}))
export type BoxSparse = Z.infer<typeof boxSparse>

/** A box record as storage may hold it: typed as a {@link BoxRecord} is written, though it may fail its check and read back damaged. */
export type DamagedBoxRecord = Z.input<typeof boxRecord>

/** The ways a box stored may fail to read back: `damaged`, and `newer_format`, a record in a `format` this version does not know, which a newer safebyok may have written. */
export const boxDamageVals = ['damaged', 'newer_format'] as const

/** A box whose stored record does not read back, as a vault's listing shows it beside its sound boxes: its boxlabel, its revision and its `damage`. Its `parse` refuses 'bad_record'.
 * Nothing else of it is trusted. Its `revision_tok` is the one its record holds, when it holds one
 * as text, and null otherwise: it only names the record a fresh `putBox()` writes over. It holds
 * room in the vault. `delBox()` removes it; `getBox()`, `getWhisper()` and `useWhisper()` refuse it
 * 'damaged_box'. A `damage` of `newer_format` is a box a newer safebyok wrote: offer to update the
 * app, not to delete it.
 *
 * @example
 *   for (const box of snapshot.damagedBoxes) {
 *     if (box.damage === 'newer_format') { offerUpdate() } else { offerRemove(box.boxlabel) }
 *   }
 */
export const { boxDamaged } = Validator('bad_record', ({ obj, oneof, boxlabel, revision_tok }) => ({
  boxDamaged: obj({ boxlabel, revision_tok: revision_tok.nullable(), damage: oneof(boxDamageVals) }).strict(),
}), [FX])
export type BoxDamaged = Z.infer<typeof boxDamaged>

/** A box's stamp: its {@link BoxSparse}, and the `vault_tok` of the vault it lies in. Its `parse` refuses 'bad_record'.
 * A box revision is never rewritten, so every field it shows is fixed for its life. Both its
 * encryptions bind its stamp, beside its vault's.
 *
 * @example boxStamp.parse({ ...sparse, vault_tok: box.vault_tok })   // sparse: box.record but its two ciphered fields
 */
export const { boxStamp } = Validator('bad_record', ({ vault_tok }) => ({
  // Strict: every field a box shows is bound, and one beside them would be shown but not bound.
  boxStamp: boxSparse.extend({ vault_tok }).strict(),
}), [FX])
export type BoxStamp = Z.infer<typeof boxStamp>

/** The check of a box's two ciphered fields, as {@link BoxCiphered} has them, every other field a box record holds dropped unread. Its `parse` refuses 'bad_record'. */
export const { cipheredShape } = Validator('bad_record', ({ obj, box_key_wrapped, whisper_ciphered }) => ({
  cipheredShape: obj({ box_key_wrapped, whisper_ciphered }),
}), [FX])

/** A box's two ciphered fields: its boxKey wrapped under the vaultKey, and the whisper ciphered under that boxKey. */
export type BoxCiphered = Z.infer<typeof cipheredShape>
// --

// == [Seal]: boxBase, sealBoxProps, madeUnderShape, madeShape, MadeUnder

/** What {@link Box.seal} seals a whisper with, and what a box is made under: each `parse` refuses 'bad_option', naming the field, quoting none of it.
 * `sealBoxProps` holds the boxlabel, the sidecar (`{}` when left out), and the box it replaces, if
 * any, and nothing else: a boxlabel that is not a label refuses as the rest do. `boxBase` takes
 * the revision and `registered_at` of whatever carries them, a Box or a listing's entry. What a box
 * is made under, and what a seal is made with, are taken from a {@link VaultSparse}, frozen.
 */
export const { boxBase, sealBoxProps, madeUnderShape, madeShape } = Validator('bad_option', ({ obj, boxlabel, epochMillis, revision_tok }) => {
  const boxBase = obj({ revision_tok: revision_tok.nullable(), registered_at: epochMillis.optional() })
  const madeUnderShape = VX.vaultSparse.pick({ applabel: true, user_id: true, vaultlabel: true, vault_tok: true, vault_epoch: true, gate_epoch: true }).readonly()
  return {
    boxBase,
    sealBoxProps: obj({ boxlabel, sidecar: sidecar.default(() => ({})), base: boxBase.nullish() }).strict(),
    madeUnderShape,
    madeShape:    obj({ madeUnder: madeUnderShape, now: epochMillis }),
  }
}, [FX])

/** The box a sealed box replaces, as far as a seal reads it: the revision it is written over (null for none), and the `registered_at` it carries forward, where known.
 * A {@link Box} read from storage is one, as is a listing's {@link BoxSparse} or {@link BoxDamaged}.
 */
export type BoxBase = Z.infer<typeof boxBase>

/** What {@link Box.seal} seals a whisper with: the boxlabel, the sidecar (`{}` when left out), and the box it replaces, if any. */
export type SealBoxProps = Z.input<typeof sealBoxProps>

/** What a box holds of the vault it was made under: the vault's scope, the `vault_tok` the read, write or seal expected, and both epochs, as the vault showed them then. A {@link VaultSparse} carries them. */
export type MadeUnder = Z.infer<typeof madeUnderShape>
// --
