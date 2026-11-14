/** The shapes every other shape is built on: the stored records' fields, the whisper and sidecar, the scopes, and the host's key deriver and logger. Imported as `CX`. */

import type * as Z from 'zod'
import { never, record, uuid } from 'zod'
import { PassphraseSaltSize, PasskeySaltSize, isWhisperedBag } from '../helpers/consts'
import { fromB64OrNull } from '../helpers/crypto'
import type { VaultLogger } from '../helpers/logger'
import * as Phrases from '../helpers/phrases'
import { Checker, Checkers, objCheck } from '../helpers/validator'
import type { KeyDeriver } from '../deriver/basederiver'
import { Patterns } from './primitives'

// Unpadded base64url spends four characters on three bytes, so the salt's length is judged before decoding it.
/** How many characters of base64url text a passphraseSalt is. */
const PassphraseSaltChars = Math.ceil((PassphraseSaltSize * 4) / 3)

/** The sentence a passphrase salt's refusal says. */
const SaltShape = Phrases.passphraseSaltShape(PassphraseSaltSize, PassphraseSaltChars)

// == [Ciphered]: ciphered, Ciphered

/** The check of an encrypted value as stored, a wrapped key or a ciphered whisper. Other fields are refused. */
export const ciphered = objCheck(({ str }) => ({
  cipher_iv_b64:  str.min(1),
  ciphertext_b64: str.min(1),
}))
/** An encrypted value as stored: its IV and its ciphertext (tag on the end), each base64url text. */
export type Ciphered = Z.infer<typeof ciphered>
// --

// == [Record fields]: epochMillis, bank_tok, gate_tok, vault_tok, box_tok, revision_tok, device_tok, key_deriver_label, credential_id, salt_b64, prf_salt_b64, whisper_ciphered, box_key_wrapped, bank_key_wayin_wrapped, bank_key_lease_wrapped, prfSalt, EpochMillis, PassphraseSalt, PrfSalt, WhisperCiphered, BoxKeyWrapped, BankKeyWayinWrapped, BankKeyLeaseWrapped

export { epochMillis, type EpochMillis } from './primitives'

/** The checks of the stored records' tokens, ids, salts and ciphered fields, each named for its field. No refusal quotes the value.
 * A token is any text, not empty, as a host's adapter may write one by hand, and so are a key deriver's
 * label and a credential id. A `device_tok` is a UUID. A passphrase's salt is base64url text of
 * {@link PassphraseSaltSize} bytes. A passkey's salt is text, not empty, whose length {@link prfSalt} judges.
 * A salt or a ciphered field is branded for its role, as nothing but safebyok makes one.
 */
export const { bank_tok, gate_tok, vault_tok, box_tok, revision_tok, device_tok, key_deriver_label, credential_id, salt_b64, prf_salt_b64, whisper_ciphered, box_key_wrapped, bank_key_wayin_wrapped, bank_key_lease_wrapped } = Checkers('bad_record', ({ str }) => ({
  bank_tok:                str.min(1),
  gate_tok:                str.min(1),
  vault_tok:               str.min(1),
  box_tok:                 str.min(1),
  revision_tok:            str.min(1),
  device_tok:              uuid(Phrases.DeviceTokShape),
  key_deriver_label:       str.min(1),
  credential_id:           str.min(1),
  salt_b64:                str.length(PassphraseSaltChars, { error: SaltShape, abort: true }).regex(Patterns.b64url, { error: SaltShape, abort: true }).refine((salt) => fromB64OrNull(salt) !== null, SaltShape).brand<'PassphraseSalt'>(),
  prf_salt_b64:            str.min(1).brand<'PrfSalt'>(),
  whisper_ciphered:        ciphered.brand<'WhisperCiphered'>(),
  box_key_wrapped:         ciphered.brand<'BoxKeyWrapped'>(),
  bank_key_wayin_wrapped: ciphered.brand<'BankKeyWayinWrapped'>(),
  bank_key_lease_wrapped: ciphered.brand<'BankKeyLeaseWrapped'>(),
}))

/** The check of a passkey wayin's salt: a {@link prf_salt_b64} of exactly {@link PasskeySaltSize} bytes.
 * A stored row with a salt of any other length is damaged.
 */
export const prfSalt = Checker(() => prf_salt_b64.refine((salt) => fromB64OrNull(salt)?.length === PasskeySaltSize, Phrases.prfSaltShape(PasskeySaltSize)), 'bad_record')

/** A passphrase wayin's passphraseSalt, its `salt_b64`: base64url text of the random bytes the key deriver takes beside the passphrase. */
export type PassphraseSalt = Z.infer<typeof salt_b64>

/** A passkey wayin's prfSalt, its `prf_salt_b64`: base64url text of the {@link PasskeySaltSize} random bytes the authenticator's PRF is asked over. */
export type PrfSalt = Z.infer<typeof prf_salt_b64>

/** A box's whisperCiphered: the whisper, ciphered under the box's boxKey. */
export type WhisperCiphered = Z.infer<typeof whisper_ciphered>

/** A box's boxKeyWrapped: its boxKey, wrapped under the bankKey. */
export type BoxKeyWrapped = Z.infer<typeof box_key_wrapped>

/** A wayin's bankKeyWayinWrapped: the bankKey, wrapped under that wayin's wayinKey. */
export type BankKeyWayinWrapped = Z.infer<typeof bank_key_wayin_wrapped>

/** A lease's bankKeyLeaseWrapped: the bankKey, wrapped under this device's leaseKey. */
export type BankKeyLeaseWrapped = Z.infer<typeof bank_key_lease_wrapped>
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

/** True for a plain object with no symbol key, made by a literal or `Object.create(null)`.
 * A Date or a Map is not one, as JSON would flatten it, and neither is a bag marked `Whispered`.
 */
export function isPlainBag(val: unknown): val is Record<string, unknown> {
  if (typeof val !== 'object' || val === null) { return false }
  if (Object.getOwnPropertySymbols(val).length > 0) { return false }
  const proto: unknown = Object.getPrototypeOf(val)
  return proto === Object.prototype || proto === null
}

/** The check of a {@link Whisper}: a plain JSON object with no symbol key at any depth, returned as a copy.
 * `whisperBag` is the same, for a {@link Sidecar}, but with no message of its own for a bag marked `Whispered`.
 * A refusal quotes none of the value and names none of its keys: an object that is not plain JSON fails whole.
 *
 * @example whisper.parse({ apiKey: 'sk-ant-...' })      // an object passes through, copied
 * @example whisper.safeParse('sk-ant-...').success      // false: a whisper is an object -- { apiKey: 'sk-ant-...' }
 * @example whisper.safeParse(new Date()).success        // false: JSON would flatten it to {}
 * @example whisper.safeParse(null).success              // false: emptying a box is delBox's job
 * @example whisper.safeParse({ orgId: null }).success   // true: null inside a structure is JSON
 */
export const { whisper, whisperBag } = Checkers('bad_option', ({ lazy, union, str, num, bool, lit, arr, custom }) => {
  const whisperJson: Z.ZodType<WhisperJson> = lazy(() => union([str, num, bool, lit(null), whisperArr, plainBag]))
  // An object is judged whole, so a refusal's path never contains one of its keys, which are the caller's own.
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

/** A box's sidecar: your app's own JSON object beside the whisper, `{}` for none, readable while the bank is locked. Never put secret material in it.
 * It is stored in the clear, as the JSON object it is (a `jsonb` column, say, which a server can
 * query), so anyone who can read the database can read it. It is not authenticated: anyone who can
 * write the database can change it, and the whisper still opens. A field the server should read but
 * must not change unnoticed goes in the whisper too, so that you can compare the two once the box is
 * unsealed. safebyok never looks inside it: check its shape yourself before `putBox()`, which refuses
 * only one that is not a plain JSON object.
 *
 * @example sidecar.safeParse('work account').success  // false: a sidecar is an object -- { note: 'work account' }
 */
export const sidecar = Checker(() => whisperBag, 'bad_option')
/** A box's sidecar, as {@link sidecar} checks it. */
export type Sidecar = Z.infer<typeof sidecar>
// --

// == [Scopes]: bankScope, gateScope, vaultScope, boxscope, BankScope, GateScope, VaultScope, Boxscope, bankedVaultScope, BankedVaultScope

/** The checks of a bank's, a gate's, a vault's and a box's scope, each returning a frozen copy.
 * Other fields are dropped, so a record or a model passes as its scope.
 *
 * @example CX.vaultScope.parse(vault)  // { user_id, banklabel, vaultlabel }, frozen
 */
export const { bankScope, gateScope, vaultScope, boxscope } = Checkers('bad_scope', ({ obj, lit, user_id, banklabel, vaultlabel, boxlabel }) => {
  const bankScope  = obj({ user_id, banklabel })
  // A bank's only gate is `main`.
  const gateScope  = bankScope.extend({ gatelabel: lit('main') })
  const vaultScope = bankScope.extend({ vaultlabel })
  const boxscope   = vaultScope.extend({ boxlabel })

  return { bankScope: bankScope.readonly(), gateScope: gateScope.readonly(), vaultScope: vaultScope.readonly(), boxscope: boxscope.readonly() }
})

/** What names a bank: the app's label and the signed-in user's id. */
export type BankScope = Z.infer<typeof bankScope>
/** What names one of a bank's gates: its bank's scope and the gate's own label, `main`. */
export type GateScope = Z.infer<typeof gateScope>
/** What names one vault: its bank's scope and the vault's own label. */
export type VaultScope = Z.infer<typeof vaultScope>
/** What names one box: its vault's scope and its boxlabel. */
export type Boxscope = Z.infer<typeof boxscope>

/** The check of the scope a bank's calls take to name a vault: its `vaultlabel`, and optionally the bank's `user_id` and `banklabel`.
 * Anything carrying those names passes, such as a Vault or its snapshot, and the rest is dropped. A
 * bankDB or deviceDB in it refuses, as each goes to `Device.make`.
 *
 * @example bankedVaultScope.parse({ vaultlabel: 'main', bankDB })  // throws: a bankDB goes to Device.make
 */
export const bankedVaultScope = Checker(({ obj, user_id, banklabel, vaultlabel }) => {
  const database = never(Phrases.DatabaseInVaultScope).optional()
  return obj({ user_id: user_id.optional(), banklabel: banklabel.optional(), vaultlabel, bankDB: database, deviceDB: database })
}, 'bad_scope')

/** The scope naming one of a bank's vaults: its `vaultlabel`, and optionally the bank's own `user_id` and `banklabel`.
 *
 * @example bank.ensureVault({ vaultlabel: 'main' })
 */
export type BankedVaultScope = Z.input<typeof bankedVaultScope>
// --

// == [Key deriver and logger]: keyDeriverShape, loggerShape

/** The check of a host's key deriver by its interface: the functions the core calls and the fields it reads.
 * Its `salt_size` must be {@link PassphraseSaltSize}. Its other parameters are the host's to choose.
 */
export const keyDeriverShape = Checker(({ obj, fn, str, lit }) => obj({
  algorithm:         str.optional(),
  key_deriver_label,
  salt_size:        lit(PassphraseSaltSize),
  deriveKeyBytes:    fn<KeyDeriver['deriveKeyBytes']>(),
  load:              fn<NonNullable<KeyDeriver['load']>>().optional(),
}, Phrases.KeyDeriverShape), 'bad_option')

true satisfies Z.core.util.AssertEqual<KeyDeriver, Readonly<Z.input<typeof keyDeriverShape>>>

/** The check of a host's logger by its interface. It only checks: `parseLogger` wraps the logger, and calls it with its own `this`. */
export const loggerShape = Checker(({ obj, fn }) => {
  const loggerCall = fn<VaultLogger['log']>()
  return obj({ log: loggerCall, warn: loggerCall, error: loggerCall }, Phrases.LoggerShape)
}, 'bad_option')

true satisfies Z.core.util.AssertEqual<VaultLogger, Z.input<typeof loggerShape>>
// --
