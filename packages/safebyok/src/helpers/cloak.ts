/** The cloak: a form's cleartexts, out of sight of anything that serializes, prints or walks an object, until vacated. */

import { Errors, type GX, Validator } from 'safebyok-big/internals'
import { type CloakCleartexts, CleartextChecks } from '../shapes/shapes-gateish'
import * as Throwers from '../refusals/throwers'

// == [The cloak]: cloak, Cloak, CloakedMarker

/** Adopt a form's cleartexts into a {@link Cloak}, to hand a giver's form mutation in their place.
 * A passkey answer's PRF bytes are copied in, and the answer's own zeroed: the cloak has the only copy.
 * @example unlock.mutate(cloak({ passphraseClear: passphraseField.value }))
 */
export function cloak(cleartexts: CloakCleartexts): Cloak { return new Cloak(cleartexts) }

/** What a cloak shows wherever it is serialized or printed. */
const CloakedMarker = '[cloaked]'

// A form mutation's variables stay in React Query's mutation cache, its devtools and the `useMutation` hook's state; a
// cloak there shows none of its cleartexts, and is vacated once the mutation settles.
/** A form's cleartexts, each read through its getter, until {@link Cloak.vacate} empties the cloak.
 * It has no enumerable field, and JSON, `String()` and Node's inspect show it as `'[cloaked]'`.
 * A passkey answer's getter hands out a fresh copy, so a verb's zeroing of what it is handed leaves the cloak's own for a retry.
 */
export class Cloak {
  #passphraseCleartext:     string | undefined
  #passkeyCleartext:        GX.PasskeyAnswer | null | undefined
  #nextPassphraseCleartext: string | undefined
  #nextPasskeyCleartext:    GX.PasskeyAnswer | undefined

  constructor(cleartexts: CloakCleartexts) {
    const given = checkedCleartexts(cleartexts)
    this.#passphraseCleartext     = given.passphraseClear
    this.#passkeyCleartext        = adoptedAnswerOf(given.passkeyClear)
    this.#nextPassphraseCleartext = given.nextPassphraseClear
    this.#nextPasskeyCleartext    = adoptedAnswerOf(given.nextPasskeyClear)
    Object.freeze(this)
  }

  /** The passphrase, or the proof's. */
  get passphraseClear(): string | undefined { return this.#passphraseCleartext }

  /** A copy of the passkey's answer, or of the proof's. */
  get passkeyClear(): GX.PasskeyAnswer | null | undefined { return copiedAnswerOf(this.#passkeyCleartext) }

  /** The new passphrase. */
  get nextPassphraseClear(): string | undefined { return this.#nextPassphraseCleartext }

  /** A copy of the new passkey's answer. */
  get nextPasskeyClear(): GX.PasskeyAnswer | undefined { return copiedAnswerOf(this.#nextPasskeyCleartext) }

  /** Zero the cloak's passkey answers and drop its passphrases: every getter reads undefined after. */
  vacate(): void {
    zeroAnswer(this.#passkeyCleartext)
    zeroAnswer(this.#nextPasskeyCleartext)
    this.#passphraseCleartext     = undefined
    this.#passkeyCleartext        = undefined
    this.#nextPassphraseCleartext = undefined
    this.#nextPasskeyCleartext    = undefined
  }

  /** `'[cloaked]'`, so `JSON.stringify` writes no cleartext. */
  toJSON(): string { return CloakedMarker }

  /** `'[cloaked]'`. */
  toString(): string { return CloakedMarker }

  // Node's `util.inspect`, and the consoles and test runners built on it, ask for this symbol; keyed with Symbol.for, it
  // needs no import of Node's.
  /** `'[cloaked]'`, for Node's inspect. */
  [Symbol.for('nodejs.util.inspect.custom')](): string { return CloakedMarker }
}
// --

// == [The cloak's helpers]: checkedCleartexts, isAnswerish, copiedAnswerOf, adoptedAnswerOf, zeroAnswer

/** Check `cleartexts` for {@link cloak}: an object of the form verbs' fields, their values unjudged.
 * A throw that is not a VaultError, such as a host's getter throwing, is replaced by one that keeps nothing of it.
 */
function checkedCleartexts(cleartexts: unknown): CloakCleartexts {
  try {
    // Typed as the host declared them: each verb judges the values it takes.
    return CleartextChecks.cloakArgs.parse(cleartexts) as CloakCleartexts
  } catch (err) {
    throw Errors.isVaultError(err) ? err : Throwers.cleartextsThrew()
  }
}

/** True of an object whose PRF bytes are bytes the cloak can copy and zero. */
function isAnswerish(answer: unknown): answer is GX.PasskeyAnswer {
  return (typeof answer === 'object') && (answer !== null) && Validator.isBytes((answer as { prfBytes?: unknown }).prfBytes)
}

/** A copy of `answer` with PRF bytes of its own; anything else as given, for the verb to refuse. */
function copiedAnswerOf<AnswerT extends GX.PasskeyAnswer | null | undefined>(answer: AnswerT): AnswerT {
  if (! isAnswerish(answer)) { return answer }
  return { ...answer, prfBytes: new Uint8Array(answer.prfBytes) }
}

/** A copy of `answer`, its own PRF bytes zeroed (G2), so the copy is the only one; anything else as given. */
function adoptedAnswerOf<AnswerT extends GX.PasskeyAnswer | null | undefined>(answer: AnswerT): AnswerT {
  const adopted = copiedAnswerOf(answer)
  zeroAnswer(answer)
  return adopted
}

/** Zero the PRF bytes of `answer`, if it has any. */
function zeroAnswer(answer: unknown): void {
  if (isAnswerish(answer)) { answer.prfBytes.fill(0) }
}
// --
