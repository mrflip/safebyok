/** The checks for the fields of the stored records, each named for the field it checks: an encrypted value's halves, the tokens, the ids, the salts and the ciphered fields. */

import type * as Z from 'zod'
import { record } from 'zod'
import * as Phrases from '../helpers/phrases'
import { Checker, Checkers, objCheck } from '../helpers/validator'
import { PasskeySaltBytes } from '../helpers/consts'
import { fromB64OrNull } from '../helpers/crypto'

export { epochMillis, type EpochMillis } from './primitives'

// == [Ciphered]: ciphered

/** An encrypted value as stored, a wrapped key or a ciphered whisper: its cipherIv and its ciphertext (tag on the end), each base64url text. Its `parse` refuses 'bad_record', and it is strict. */
export const ciphered = objCheck(({ str }) => ({
  cipher_iv_b64:  str.min(1),
  ciphertext_b64: str.min(1),
}))
export type Ciphered = Z.infer<typeof ciphered>
// --

// == [Record fields]: vault_tok, box_tok, revision_tok, device_id, key_deriver_label, credential_id, salt_b64, prf_salt_b64, whisper_ciphered, box_key_wrapped, vault_key_wayin_wrapped, vault_key_lease_wrapped, VaultTok, BoxTok, RevisionTok, PassphraseSalt, PrfSalt, WhisperCiphered, BoxKeyWrapped, VaultKeyWayinWrapped, VaultKeyLeaseWrapped

/** The checks for the tokens, the ids, the salts and the ciphered fields of the stored records, each named for the field it checks. Each `parse` refuses 'bad_record', quoting none of it.
 * A token is plain text, as a host's adapter may write one by hand. An id or a label is plain
 * text too, not empty: a device's id, a key deriver's label, a passkey's credential id. A salt or a ciphered field is
 * branded for its role, since nothing but safebyok makes one. A salt's check is its shape, text
 * that is not empty. Its length is judged where its wayin is, so a salt of the wrong length is a
 * damaged wayin while the vault's other wayin still opens.
 *
 * @example obj({ wayinkind: lit('passphrase'), salt_b64, vault_key_wayin_wrapped, ... })   // a record's fields, by the names they check
 * @example box_key_wrapped.parse(await wrapKeyUnder(vaultKey, boxKey, ctx))               // a BoxKeyWrapped, where the box record is made
 */
export const { vault_tok, box_tok, revision_tok, device_id, key_deriver_label, credential_id, salt_b64, prf_salt_b64, whisper_ciphered, box_key_wrapped, vault_key_wayin_wrapped, vault_key_lease_wrapped } = Checkers('bad_record', ({ str }) => ({
  vault_tok:               str.min(1, Phrases.TokenMissing),
  box_tok:                 str.min(1, Phrases.TokenMissing),
  revision_tok:            str.min(1, Phrases.TokenMissing),
  device_id:               str.min(1),
  key_deriver_label:       str.min(1),
  credential_id:           str.min(1),
  salt_b64:                str.min(1).brand<'PassphraseSalt'>(),
  prf_salt_b64:            str.min(1).brand<'PrfSalt'>(),
  whisper_ciphered:        ciphered.brand<'WhisperCiphered'>(),
  box_key_wrapped:         ciphered.brand<'BoxKeyWrapped'>(),
  vault_key_wayin_wrapped: ciphered.brand<'VaultKeyWayinWrapped'>(),
  vault_key_lease_wrapped: ciphered.brand<'VaultKeyLeaseWrapped'>(),
}))

/** A passkey's salt as its kind makes one: a {@link prf_salt_b64} of exactly {@link PasskeySaltBytes} bytes, as the models' wayin record stores it and a fresh passkey answer carries it. The stored field of the old vault record keeps the shape-only check, as its length was judged at use (`damaged_wayin`), not at read. Its `parse` refuses 'bad_record'. */
export const prfSalt = Checker(() => prf_salt_b64.refine((salt) => fromB64OrNull(salt)?.length === PasskeySaltBytes, Phrases.prfSaltNotFresh(PasskeySaltBytes)), 'bad_record')

/** The random token minted for one life of a vault, its `vault_tok`: compared, never parsed further. A thing made under one life carries it, so `demandConsistentWith` tells a thing of another life. */
export type VaultTok = Z.infer<typeof vault_tok>

/** The random token minted for one life of a box, its `box_tok`: compared, never parsed further. A box deleted and made anew under its boxlabel gets a new one. */
export type BoxTok = Z.infer<typeof box_tok>

/** The random token minted for each write of a box, its `revision_tok`: a write naming a stale one refuses 'stale_write'. */
export type RevisionTok = Z.infer<typeof revision_tok>

/** A passphrase wayin's passphraseSalt, its `salt_b64`: base64url text of the random bytes the key deriver takes beside the passphrase. */
export type PassphraseSalt = Z.infer<typeof salt_b64>

/** A passkey wayin's prfSalt, its `prf_salt_b64`: base64url text of the 32 random bytes the authenticator's PRF is asked over. */
export type PrfSalt = Z.infer<typeof prf_salt_b64>

/** A box's whisperCiphered: the whisper, ciphered under the box's boxKey. */
export type WhisperCiphered = Z.infer<typeof whisper_ciphered>

/** A box's boxKeyWrapped: its boxKey, wrapped under the vaultKey. */
export type BoxKeyWrapped = Z.infer<typeof box_key_wrapped>

/** A wayin's vaultKeyWayinWrapped: the vaultKey, wrapped under that wayin's wayinKey. */
export type VaultKeyWayinWrapped = Z.infer<typeof vault_key_wayin_wrapped>

/** A lease's vaultKeyLeaseWrapped: the vaultKey, wrapped under this device's leaseKey. */
export type VaultKeyLeaseWrapped = Z.infer<typeof vault_key_lease_wrapped>
// --

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
export const { whisper, whisperBag } = Checkers('bad_whisper', ({ lazy, union, str, num, bool, lit, arr, custom }) => {
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
export const sidecar = Checker(() => whisperBag, 'bad_option')
export type Sidecar = Z.infer<typeof sidecar>
// --
