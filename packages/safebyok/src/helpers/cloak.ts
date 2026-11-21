/** The cloak: a form's cleartexts, hidden from anything that serializes, prints or spreads an object, until vacated. */

import { Errors, type GX, Validator } from 'safebyok-big/internals'
import { type CloakCleartexts, CleartextChecks } from '../shapes/shapes-gateish'
import * as Throwers from '../refusals/throwers'

// == [The cloak]: cloak, Cloak, CloakedMarker

/** Wrap a form's cleartexts in a {@link Cloak}, to hand a giver's form mutation in their place.
 * The cloak has the only copy of a passkey answer's PRF bytes: those in the answer you pass are zeroed.
 * @example unlock.mutate(cloak({ passphraseCleartext: passphraseField.value }))
 */
export function cloak(cleartexts: CloakCleartexts): Cloak { return new Cloak(cleartexts) }

/** The text a cloak shows wherever it is serialized or printed. */
const CloakedMarker = '[cloaked]'

// A form mutation's variables stay in React Query's mutation cache, its devtools and the `useMutation` hook's state; a
// cloak there shows none of its cleartexts, and is vacated once the mutation settles. A passkey answer's getter hands out
// a fresh copy, so a verb's zeroing of what it is handed leaves the cloak's own bytes until it is vacated.
/** A form's cleartexts, each read through its getter, until {@link Cloak.vacate} empties the cloak.
 * A spread copies none of them, and JSON, `String()` and Node's inspect show only `'[cloaked]'`.
 */
export class Cloak {
  #passphraseCleartext:     string | undefined
  #passkeyCleartext:        GX.PasskeyAnswer | null | undefined
  #nextPassphraseCleartext: string | undefined
  #nextPasskeyCleartext:    GX.PasskeyAnswer | undefined

  constructor(cleartexts: CloakCleartexts) {
    const given = checkedCleartexts(cleartexts)
    this.#passphraseCleartext     = given.passphraseCleartext
    this.#passkeyCleartext        = adoptedAnswerOf(given.passkeyCleartext)
    this.#nextPassphraseCleartext = given.nextPassphraseCleartext
    this.#nextPasskeyCleartext    = adoptedAnswerOf(given.nextPasskeyCleartext)
    Object.freeze(this)
  }

  /** The passphrase: a new bank's, or the proof of an `unlock` gating or a gate change. */
  get passphraseCleartext(): string | undefined { return this.#passphraseCleartext }

  /** A fresh copy of the passkey answer: a new bank's, or the proof of an `unlock` gating or a gate change. */
  get passkeyCleartext(): GX.PasskeyAnswer | null | undefined { return copiedAnswerOf(this.#passkeyCleartext) }

  /** The new passphrase. */
  get nextPassphraseCleartext(): string | undefined { return this.#nextPassphraseCleartext }

  /** A fresh copy of the new passkey's answer. */
  get nextPasskeyCleartext(): GX.PasskeyAnswer | undefined { return copiedAnswerOf(this.#nextPasskeyCleartext) }

  /** Zero the cloak's passkey answers and drop its passphrases: every getter returns undefined after. */
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
 * A throw that is not a VaultError, such as a host's getter throwing, is replaced by one that carries nothing of it.
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

/** A copy of `answer` with PRF bytes of its own, or anything else as given, for the verb to refuse. */
function copiedAnswerOf<AnswerT extends GX.PasskeyAnswer | null | undefined>(answer: AnswerT): AnswerT {
  if (! isAnswerish(answer)) { return answer }
  return { ...answer, prfBytes: new Uint8Array(answer.prfBytes) }
}

/** A copy of `answer`, with the PRF bytes of `answer` itself zeroed (G2), or anything else as given. */
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
