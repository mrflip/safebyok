/** What every other shape stands on: the stored records' fields, the whisper and sidecar, the scopes, and the shapes of the code a host hands in. Imported as `CX`. */

import type * as Z from 'zod'
import { never, record, uuid } from 'zod'
import { PassphraseSaltBytes, PasskeySaltBytes, isWhisperedBag } from '../helpers/consts'
import { fromB64OrNull } from '../helpers/crypto'
import type { VaultLogger } from '../helpers/logger'
import * as Phrases from '../helpers/phrases'
import { Checker, Checkers, objCheck } from '../helpers/validator'
import type { KeyDeriver } from '../deriver/basederiver'
import { Patterns } from './primitives'

// Unpadded base64url spends four characters on three bytes, so the salt's length is judged before decoding it.
/** How many characters of base64url text a passphraseSalt is. */
const PassphraseSaltChars = Math.ceil((PassphraseSaltBytes * 4) / 3)

/** The sentence a passphrase salt's refusal says. */
const SaltShape = Phrases.passphraseSaltShape(PassphraseSaltBytes, PassphraseSaltChars)

// == [Ciphered]: ciphered, Ciphered

/** An encrypted value as stored, a wrapped key or a ciphered whisper: its cipherIv and its ciphertext (tag on the end), each base64url text. It is strict. */
export const ciphered = objCheck(({ str }) => ({
  cipher_iv_b64:  str.min(1),
  ciphertext_b64: str.min(1),
}))
export type Ciphered = Z.infer<typeof ciphered>
// --

// == [Record fields]: epochMillis, vault_tok, box_tok, revision_tok, device_id, key_deriver_label, credential_id, salt_b64, prf_salt_b64, whisper_ciphered, box_key_wrapped, vault_key_wayin_wrapped, vault_key_lease_wrapped, prfSalt, EpochMillis, PassphraseSalt, PrfSalt, WhisperCiphered, BoxKeyWrapped, VaultKeyWayinWrapped, VaultKeyLeaseWrapped

export { epochMillis, type EpochMillis } from './primitives'

/** The checks for the tokens, the ids, the salts and the ciphered fields of the stored records, each named for the field it checks. Each `parse` quotes none of it.
 * A token is plain text, as a host's adapter may write one by hand. A device's id is a UUID. A key deriver's label
 * and a passkey's credential id are plain text, not empty. A salt or a ciphered field is
 * branded for its role, since nothing but safebyok makes one. A passphrase's salt is base64url text of
 * {@link PassphraseSaltBytes} bytes, judged by its characters, its length and decoding it; a passkey's is text, not empty, and its length is judged where its
 * wayin is, so a salt of the wrong length is a damaged wayin while the vault's other wayin still opens.
 */
export const { vault_tok, box_tok, revision_tok, device_id, key_deriver_label, credential_id, salt_b64, prf_salt_b64, whisper_ciphered, box_key_wrapped, vault_key_wayin_wrapped, vault_key_lease_wrapped } = Checkers('bad_record', ({ str }) => ({
  vault_tok:               str.min(1),
  box_tok:                 str.min(1),
  revision_tok:            str.min(1),
  device_id:               uuid(Phrases.DeviceIdShape),
  key_deriver_label:       str.min(1),
  credential_id:           str.min(1),
  salt_b64:                str.length(PassphraseSaltChars, { error: SaltShape, abort: true }).regex(Patterns.b64url, { error: SaltShape, abort: true }).refine((salt) => fromB64OrNull(salt) !== null, SaltShape).brand<'PassphraseSalt'>(),
  prf_salt_b64:            str.min(1).brand<'PrfSalt'>(),
  whisper_ciphered:        ciphered.brand<'WhisperCiphered'>(),
  box_key_wrapped:         ciphered.brand<'BoxKeyWrapped'>(),
  vault_key_wayin_wrapped: ciphered.brand<'VaultKeyWayinWrapped'>(),
  vault_key_lease_wrapped: ciphered.brand<'VaultKeyLeaseWrapped'>(),
}))

/** A passkey's salt as its kind makes one: a {@link prf_salt_b64} of exactly {@link PasskeySaltBytes} bytes, as the models' wayin record has it and a fresh passkey answer carries it. The stored field of the old vault record keeps the shape-only check, as its length was judged at use, not at read. */
export const prfSalt = Checker(() => prf_salt_b64.refine((salt) => fromB64OrNull(salt)?.length === PasskeySaltBytes, Phrases.prfSaltShape(PasskeySaltBytes)), 'bad_record')

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

// == [Whisper and sidecar]: WhisperJson, Whisper, isPlainBag, whisper, whisperBag, sidecar, Sidecar

/** The JSON a whisper is made of, inside its object, `null` included. */
export type WhisperJson = string | number | boolean | null | WhisperJson[] | { [ckey: string]: WhisperJson }

/** The secret kept in a box: always a plain JSON object, typed loosely so that `box.whisper.org` and `box.put({ whisper: box.whisper })` compile.
 *
 * @example { apiKey: 'sk-ant-api03-...' }
 * @example { apiKey: 'sk-ant-...', orgId: null }
 */
export type Whisper = Record<string, any>

/** True for a plain object, built by a literal or `Object.create(null)`: never a Date or Map, which JSON would flatten, nor one with a symbol key, such as a bag marked `Whispered`, which it would drop. */
export const isPlainBag = (val: unknown): val is Record<string, unknown> => {
  if (typeof val !== 'object' || val === null) { return false }
  if (Object.getOwnPropertySymbols(val).length > 0) { return false }
  const proto: unknown = Object.getPrototypeOf(val)
  return proto === Object.prototype || proto === null
}

/** The check for a {@link Whisper}, a plain JSON object with no symbol key at any depth; and `whisperBag`, the same with no word on a bag marked `Whispered`, for a {@link Sidecar}.
 * Its `parse` quotes none of it, and names none of an object's keys: an
 * object that is not plain JSON fails whole.
 *
 * @example whisper.parse({ apiKey: 'sk-ant-...' })      // an object passes through, copied
 * @example whisper.safeParse('sk-ant-...').success      // false: a whisper is an object -- { apiKey: 'sk-ant-...' }
 * @example whisper.safeParse(new Date()).success        // false: JSON would flatten it to {}
 * @example whisper.safeParse(null).success              // false: emptying a box is delBox's job
 * @example whisper.safeParse({ orgId: null }).success   // true: null inside a structure is JSON
 */
export const { whisper, whisperBag } = Checkers('bad_option', ({ lazy, union, str, num, bool, lit, arr, custom }) => {
  const whisperJson: Z.ZodType<WhisperJson> = lazy(() => union([str, num, bool, lit(null), whisperArr, plainBag]))
  // An object is judged whole, so a refusal's path never holds one of its keys, which are the caller's own.
  const whisperMembers = record(str, whisperJson)
  const plainBag = custom<Record<string, WhisperJson>>((val) => isPlainBag(val) && whisperMembers.safeParse(val).success, Phrases.WhisperBagShape)
  const whisperArr = arr(whisperJson)
  // A judged object is the caller's own, so each check hands back a copy, as a parse of an object does:
  // a box freezes its record through, and must never freeze, or share, the caller's sidecar.
  const whisperBag = plainBag.overwrite((bag) => structuredClone(bag))
  const whisper: Z.ZodType<Whisper> = custom((val) => ! isWhisperedBag(val), Phrases.WhisperedIsNoWhisper)
    .pipe(custom((val) => (typeof val === 'object') && (val !== null) && (! Array.isArray(val)), Phrases.WhisperShape))
    .pipe(whisperBag)
  return { whisper, whisperBag }
})

/** A box's sidecar: your app's own JSON object beside the whisper, `{}` for none, shown while the vault is locked. Never put secret material in it.
 * It is stored in the clear, as the JSON object it is (a `jsonb` column, say, which a server can
 * query), so anyone who can read the database can read it. It is in the box's stamp as its JSON
 * with keys sorted: a sidecar altered in storage makes the box refuse to open, while one whose
 * keys storage reorders still opens. safebyok never looks inside it: check its shape before
 * `putBox()`, which refuses one that fails it.
 *
 * @example sidecar.safeParse('work account').success  // false: a sidecar is an object -- { note: 'work account' }
 */
export const sidecar = Checker(() => whisperBag, 'bad_option')
export type Sidecar = Z.infer<typeof sidecar>
// --

// == [Scopes]: bankScope, vaultScope, boxscope, BankScope, VaultScope, Boxscope, bankedVaultScope, BankedVaultScope

/** A scope as a frozen copy.
 * A scope carrying more fields passes, the rest left out: a vault's record, or a Vault object,
 * passes as its scope. Being a copy, no one it is handed to can change it for everyone else.
 *
 * @example CX.vaultScope.parse(vault)  // { applabel, user_id, vaultlabel }, frozen
 */
export const { bankScope, vaultScope, boxscope } = Checkers('bad_scope', ({ obj, applabel, user_id, vaultlabel, boxlabel }) => {
  const bankScope  = obj({ applabel, user_id })
  const vaultScope = bankScope.extend({ vaultlabel })
  const boxscope   = vaultScope.extend({ boxlabel })

  return { bankScope: bankScope.readonly(), vaultScope: vaultScope.readonly(), boxscope: boxscope.readonly() }
})

/** What names a bank: the app's label and the signed-in user's id. */
export type BankScope = Z.infer<typeof bankScope>
/** What names one vault: its bank's scope and the vault's own label. */
export type VaultScope = Z.infer<typeof vaultScope>
/** What names one box: its vault's scope and its boxlabel. */
export type Boxscope = Z.infer<typeof boxscope>

/** The scope naming one of a bank's vaults, as its calls are handed it: the `vaultlabel` required, the `applabel` and `user_id` invited, each name checked.
 * It accepts whatever carries the names, a plain bag, a Vault object, its snapshot or a
 * BankVault, and leaves the rest. A vaultDB or deviceDB in the scope refuses: each goes to `Bank.make`.
 *
 * @example bankedVaultScope.parse({ vaultlabel: 'main', vaultDB })  // throws: a vaultDB goes to Bank.make
 */
export const bankedVaultScope = Checker(({ obj, applabel, user_id, vaultlabel }) => {
  const database = never(Phrases.DatabaseInVaultScope).optional()
  return obj({ applabel: applabel.optional(), user_id: user_id.optional(), vaultlabel, vaultDB: database, deviceDB: database })
}, 'bad_scope')

/** The scope naming one of a bank's vaults, as {@link bankedVaultScope} checks it: its `vaultlabel`, and the bank's own `applabel` and `user_id` if you like.
 *
 * @example bank.ensureVault({ vaultlabel: 'main' })
 */
export type BankedVaultScope = Z.input<typeof bankedVaultScope>
// --

// == [Key deriver and logger]: keyDeriverShape, loggerShape

/** The check of a key deriver, by the verbs the vault calls on it and the fields it reads. */
export const keyDeriverShape = Checker(({ obj, fn, str, lit }) => obj({
  algorithm:         str.optional(),
  key_deriver_label,
  salt_bytes:        lit(PassphraseSaltBytes),
  deriveKeyBytes:    fn<KeyDeriver['deriveKeyBytes']>(),
  load:              fn<NonNullable<KeyDeriver['load']>>().optional(),
}, Phrases.KeyDeriverShape), 'bad_option')

true satisfies Z.core.util.AssertEqual<KeyDeriver, Readonly<Z.input<typeof keyDeriverShape>>>

/** The shape a VaultLogger must have. It only checks: `parseLogger` guards the host's own logger, and calls it `this` and all. */
export const loggerShape = Checker(({ obj, fn }) => {
  const loggerCall = fn<VaultLogger['log']>()
  return obj({ log: loggerCall, warn: loggerCall, error: loggerCall }, Phrases.LoggerShape)
}, 'bad_option')

true satisfies Z.core.util.AssertEqual<VaultLogger, Z.input<typeof loggerShape>>
// --
