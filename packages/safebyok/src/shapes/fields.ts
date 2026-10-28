/** The checks for the fields of the stored records, each named for the field it checks: an encrypted value's halves, the tokens, the ids, the salts and the ciphered fields. */

import type * as Z from 'zod'
import * as Phrases from '../phrases'
import { Validator } from '../checks/validator'

export { EpochMillis } from './primitives'

// == [Ciphered]: Ciphered

/** An encrypted value as stored, a wrapped key or a ciphered whisper: its cipherIv and its ciphertext (tag on the end), each base64url text. Its `parse` refuses 'bad_record', and it is strict. */
export const { Ciphered } = Validator('bad_record', ({ obj, str }) => ({
  Ciphered: obj({
    cipher_iv_b64:  str.min(1),
    ciphertext_b64: str.min(1),
  }).strict(),
}))
export type Ciphered = Z.infer<typeof Ciphered>
// --

// == [Record fields]: vault_tok, revision_tok, device_id, key_deriver_label, credential_id, salt_b64, prf_salt_b64, whisper_ciphered, box_key_wrapped, vault_key_wayin_wrapped, vault_key_lease_wrapped, VaultTok, RevisionTok, PassphraseSalt, PrfSalt, WhisperCiphered, BoxKeyWrapped, VaultKeyWayinWrapped, VaultKeyLeaseWrapped

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
export const { vault_tok, revision_tok, device_id, key_deriver_label, credential_id, salt_b64, prf_salt_b64, whisper_ciphered, box_key_wrapped, vault_key_wayin_wrapped, vault_key_lease_wrapped } = Validator('bad_record', ({ str }) => ({
  vault_tok:               str.min(1, Phrases.TokenMissing),
  revision_tok:            str.min(1, Phrases.TokenMissing),
  device_id:               str.min(1),
  key_deriver_label:       str.min(1),
  credential_id:           str.min(1),
  salt_b64:                str.min(1).brand<'PassphraseSalt'>(),
  prf_salt_b64:            str.min(1).brand<'PrfSalt'>(),
  whisper_ciphered:        Ciphered.brand<'WhisperCiphered'>(),
  box_key_wrapped:         Ciphered.brand<'BoxKeyWrapped'>(),
  vault_key_wayin_wrapped: Ciphered.brand<'VaultKeyWayinWrapped'>(),
  vault_key_lease_wrapped: Ciphered.brand<'VaultKeyLeaseWrapped'>(),
}))

/** The random token minted for one life of a vault, its `vault_tok`: compared, never parsed further. A thing made under one life carries it, so `demandConsistentWith` tells a thing of another life. */
export type VaultTok = Z.infer<typeof vault_tok>

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
