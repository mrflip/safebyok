/** What a wayin is, the proofs its wayins take, and a new passphrase's strength checker and verdict. Each record's `parse` refuses 'bad_record', quoting none of it. */

import { string as zodString } from 'zod'
import type * as Z from 'zod'
import { Checker, Checkers, objCheck } from '../helpers/validator'
import * as Phrases from '../helpers/phrases'
import { PasskeySaltBytes } from '../helpers/consts'
import { fromB64OrNull } from '../helpers/crypto'
import type { StrengthChecker } from '../helpers/passphrase-strength'
import * as FX from './fields'

// == [Wayin kinds]: wayinKindVals, wayinkind, WayinKind, PasskeySaltBytes, isPrfSalt

/** The kinds of wayin, each with a record shape and a slot of the gate of its own: a `passphrase` the user types, or a `passkey` the user touches. */
export const wayinKindVals = ['passphrase', 'passkey'] as const

/** The check of a wayin's kind, as a caller names the slot of the gate it means: one of {@link wayinKindVals}. Its `parse` refuses 'bad_option'.
 *
 * @example wayinkind.safeParse('passkey').success   // true
 */
export const wayinkind = Checker(({ oneof }) => oneof(wayinKindVals), 'bad_option')
export type WayinKind = typeof wayinKindVals[number]

/** True for a passkey wayin's salt as its kind makes one: base64url text of {@link PasskeySaltBytes} bytes. A stored one that is not marks the wayin damaged; a new passkey's answer over one that is not is refused. */
export const isPrfSalt = (prf_salt_b64: string): boolean => fromB64OrNull(prf_salt_b64)?.length === PasskeySaltBytes
// --

// == [Proofs]: passphraseCleartext, PassphraseCleartext, PrfAnswerBytes, passkeyAnswer, PasskeyAnswer, freshPasskeyAnswer

/** The check for a passphrase's cleartext, the text the user typed: any string, blank included. Its `parse` refuses 'bad_option', quoting none of it.
 * What a blank one means is the gating's to say.
 *
 * @example passphraseCleartext.parse(typed)   // a PassphraseCleartext, for the key deriver
 * @example passphraseCleartext.parse(42)      // throws 'bad_option', "A passphrase is the text the user typed, as a string"
 */
export const passphraseCleartext = Checker(() => zodString({ error: Phrases.PassphraseNotText }).brand<'PassphraseCleartext'>(), 'bad_option')

/** A passphrase's cleartext once {@link passphraseCleartext} has parsed it: the only text the key deriver is handed. */
export type PassphraseCleartext = Z.infer<typeof passphraseCleartext>

/** How many bytes a passkey's PRF answers with: always 32, by the WebAuthn PRF extension. */
export const PrfAnswerBytes = 32

/** What a passkey's answer must carry: its credential's id, the salt it answered for, and its PRF bytes, judged by their tag, so bytes from an iframe pass. Its `parse` refuses 'bad_option', quoting none of it, as its bytes are secret.
 * An answer already used, its bytes zeroed by the proving sealed of it, is refused too: sealed
 * again, it would make a key anyone could rebuild.
 *
 * @example passkeyAnswer.parse(await askPasskey(vault.snapshot.gate))
 * @example passkeyAnswer.parse(usedAnswer)   // throws 'bad_option': its bytes were zeroed at its first use
 */
export const passkeyAnswer = objCheck(({ str, bytes, credential_id }) => ({
  /** Base64url, as `PublicKeyCredential.id` gives it. */
  credential_id,
  prf_salt_b64:  str.min(1),
  /** 32 bytes, as good as the passphrase for this vault: hand them to the gating, then drop them. */
  prfBytes:      bytes(PrfAnswerBytes).refine((prfBytes) => prfBytes.reduce((seen, byte) => seen | byte, 0) !== 0, Phrases.PasskeyAnswerUsed),
}), { refuseAs: 'bad_option', extras: 'strip' }, [FX])

/** A passkey's answer when asked for a vault's PRF: the cleartext a gating takes for a passkey. `safebyok-react`'s `askPasskey` makes one.
 * An `unlock_vault` gating takes it in `attemptPasskey`; `initialize_gate` and `put_passkey` take
 * it in `attempt`, beside the passphrase.
 *
 * @example
 *   const passkey = await askPasskey(vault.getSnapshot().gate)   // null when the user dismissed it
 *   if (passkey !== null) { await gating.attemptPasskey(passkey) }   // an unlock_vault gating's
 */
export type PasskeyAnswer = Z.infer<typeof passkeyAnswer>

/** A new passkey's answer, as `safebyok-react`'s `createPasskey` gives it: a passkey's answer, over a fresh salt of {@link PasskeySaltBytes} bytes as base64url text. Its `parse` refuses 'bad_option', quoting none of it.
 * A passkey wayin sealed over another salt would read as damaged at every later unlock.
 *
 * @example freshPasskeyAnswer.parse(await createPasskey(opts))   // passes
 * @example freshPasskeyAnswer.parse({ ...answer, prf_salt_b64: 'c2hvcnQ' })   // throws 'bad_option'
 */
export const freshPasskeyAnswer = Checker(() => (
  passkeyAnswer.refine(({ prf_salt_b64: prfSalt }) => isPrfSalt(prfSalt), { error: Phrases.prfSaltNotFresh(PasskeySaltBytes), path: ['prf_salt_b64'] })
), 'bad_option')
// --

// == [Strength]: isStrengthChecker, strengthChecker, passphraseVerdict, PassphraseVerdict

/** True for a {@link StrengthChecker}: a function, whose `load`, if it carries one, is a function too. */
const isStrengthChecker = (candidate: unknown): candidate is StrengthChecker => (
  typeof candidate === 'function' && ['undefined', 'function'].includes(typeof (candidate as { load?: unknown }).load)
)

/** The checks of a `strengthChecker` and of the verdict it answers, each refusing 'bad_option'. */
export const { strengthChecker, passphraseVerdict } = Checkers('bad_option', ({ custom, union, obj, lit, str }) => ({
  strengthChecker: custom<StrengthChecker>(isStrengthChecker, Phrases.StrengthCheckerShape),
  passphraseVerdict: union([
    obj({ strong: lit(true) }),
    obj({ strong: lit(false), reason: str.min(1) }),
  ]),
}))

/** What a strength checker finds of one passphrase: strong enough, or weak with a `reason` for the user.
 * The reason is calm, says what to do, and never quotes the passphrase. A field shows it, and the
 * vault's 'weak_passphrase' refusal carries it as its message.
 */
export type PassphraseVerdict = Z.infer<typeof passphraseVerdict>
// --
