/** Names for the package's most common and most important primitives, and the facets a type gains.
 * A value a host writes by hand (a label, a user_id, a time) has a plain alias, so any string or
 * number passes. One a host never writes (a salt, a ciphered whisper, a wrapped key, a parsed
 * passphrase) is branded by its validator: it exists only once parsed, and two of a kind never
 * trade places.
 */

import { string as zodString } from 'zod'
import type * as Z from 'zod'
import { Ciphered } from '../crypto'
import type { VaultError } from '../errors'
import * as Phrases from '../phrases'
import type { Vault } from '../vault'
import type { label, user_id } from '../checks/primitives'
import { Validator } from '../checks/validator'

export { EpochMillis } from '../checks/primitives'

// == [Names]: Applabel, Vaultlabel, Boxlabel, UserId

/** The app's label, as a host writes it to `Bank.make`: a {@link label}, which every scope opens with. */
export type Applabel = Z.infer<typeof label>

/** The label of one of a user's vaults, as a host writes it to `bank.ensureVault`: a {@link label}, such as `main`. */
export type Vaultlabel = Z.infer<typeof label>

/** A box's label within its vault, as a host writes it to `putBox` and `getBox`: a {@link label}, such as `anthropic`. */
export type Boxlabel = Z.infer<typeof label>

/** The signed-in user's stable, opaque id from the host's own auth, as {@link user_id} checks it: the one name in a scope that is not a label. */
export type UserId = Z.infer<typeof user_id>
// --

// == [Record fields]: vault_tok, revision_tok, salt_b64, prf_salt_b64, whisper_ciphered, box_key_wrapped, vault_key_wayin_wrapped, vault_key_lease_wrapped, VaultTok, RevisionTok, PassphraseSalt, PrfSalt, WhisperCiphered, BoxKeyWrapped, VaultKeyWayinWrapped, VaultKeyLeaseWrapped

/** The checks for the tokens, the salts and the ciphered fields of the stored records, each named for the field it checks. Each `parse` refuses 'bad_record', quoting none of it.
 * A token is plain text, as a host's adapter may write one by hand. A salt or a ciphered field is
 * branded for its role, since nothing but safebyok makes one. A salt's check is its shape, text
 * that is not empty. Its length is judged where its wayin is, so a salt of the wrong length is a
 * damaged wayin while the vault's other wayin still opens.
 *
 * @example obj({ wayinkind: lit('passphrase'), salt_b64, vault_key_wayin_wrapped, ... })   // a record's fields, by the names they check
 * @example box_key_wrapped.parse(await wrapKeyUnder(vaultKey, boxKey, ctx))               // a BoxKeyWrapped, where the box record is made
 */
export const { vault_tok, revision_tok, salt_b64, prf_salt_b64, whisper_ciphered, box_key_wrapped, vault_key_wayin_wrapped, vault_key_lease_wrapped } = Validator('bad_record', ({ str }) => ({
  vault_tok:               str.min(1, Phrases.TokenMissing),
  revision_tok:            str.min(1, Phrases.TokenMissing),
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

// == [Cleartext]: passphraseCleartext, PassphraseCleartext

/** The check for a passphrase's cleartext, the text the user typed: any string, blank included, since what a blank one means is the gating's to say. Its `parse` refuses 'bad_option', quoting none of it.
 *
 * @example passphraseCleartext.parse(typed)   // a PassphraseCleartext, for the key deriver
 * @example passphraseCleartext.parse(42)      // throws 'bad_option', "A passphrase is the text the user typed, as a string"
 */
export const { passphraseCleartext } = Validator('bad_option', () => ({
  passphraseCleartext: zodString({ error: Phrases.PassphraseNotText }).brand<'PassphraseCleartext'>(),
}))

/** A passphrase's cleartext once {@link passphraseCleartext} has parsed it: the only text the key deriver is handed. */
export type PassphraseCleartext = Z.infer<typeof passphraseCleartext>
// --

// == [Facets]: Lifecycled, Refused, ConsistencyWith

/** `OT` at a stage of its life, told by its `lifecycle`: the stages are `LifecycleT`, `'starting' | 'ready'` unless named.
 * A thing whose life can also stop at a refusal is `Lifecycled<OT> | Refused<OT>`, told apart by
 * `lifecycle`.
 *
 * @example type BankStage = Lifecycled<BankScope, 'made' | 'starting' | 'ready'> | Refused<BankScope>
 */
export type Lifecycled<OT, LifecycleT extends string = 'starting' | 'ready'> = OT & { readonly lifecycle: LifecycleT }

/** `OT` whose life stopped at a refusal: its `lifecycle` is `'refused'`, and `err` says why.
 *
 * @example if (stage.lifecycle === 'refused') { showTrouble(stage.err) }
 */
export type Refused<OT> = OT & { readonly lifecycle: 'refused', readonly err: VaultError }

/** `OT`, and the vault's `demandConsistentWith`: what a collaborator of a Vault object takes, to demand at each of its junctions that it is still consistent with the vault record in hand.
 *
 * @example const make = (vault: ConsistencyWith<VaultScope>) => { vault.demandConsistentWith(thing) }
 */
export type ConsistencyWith<OT> = OT & Pick<Vault, 'demandConsistentWith'>
// --
