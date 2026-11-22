/** `useNewPassphrase`, the state of a new passphrase and its confirmation, for a kit form or a host's own: the strength meter and whether the two fields match. */

import { type ChangeEvent, type RefObject, useId, useRef, useState } from 'react'
import type { PassphraseVerdict } from 'safebyok'
import type { ReactGiver } from '../giver/react-giver'
import { type KitPhrases, useKitPhrases } from './phrases-kit'

// == [Types]: NewPassphrase, NewPassphraseFieldProps, PassphraseMatch

/** What {@link useNewPassphrase} answers: the props of the two fields, the verdicts on them as data and as the lines shown under them, and whether the form may submit. */
export type NewPassphrase = Readonly<{
  /** The props of the new passphrase's field, to spread onto a `PassphraseInput` beside its `name`. Its `id` is for the `<label>` that names it. */
  field:        NewPassphraseFieldProps
  /** The props of the confirmation's field, to spread onto a `PassphraseInput` beside its `name`. Its `id` is for the `<label>` that names it. */
  confirmField: NewPassphraseFieldProps & Readonly<{ "aria-invalid": true | undefined }>
  /** The checker's verdict on the new passphrase as typed, for words or a meter of your own: null while the field is empty, and before the first verdict lands. */
  verdict:      PassphraseVerdict | null
  /** Whether the confirmation matches the new passphrase, for words of your own: `untyped` while its field is empty. */
  match:        PassphraseMatch
  /** The id of the meter's line, which the new passphrase's field is described by. */
  verdictId:    string
  /** The meter's line: the checker's reason while the passphrase is weak, that it is strong enough, or nothing while the field is empty. */
  verdictText:  string
  /** The id of the line under the confirmation, which its field is described by. */
  matchId:      string
  /** The line under the confirmation: whether it matches, or nothing while the field is empty. */
  matchText:    string
  /** True once the new passphrase is judged strong and the confirmation matches it: the form's submit is enabled only then. */
  isReady:      boolean
  /** Forget the verdicts on what the fields held, for the form's `onReset`. */
  forget:       () => void
}>

/** The props {@link useNewPassphrase} gives one of its fields. */
export type NewPassphraseFieldProps = Readonly<{
  "id":               string
  "ref":              RefObject<HTMLInputElement | null>
  "autoComplete":     'new-password'
  "required":         true
  "aria-describedby": string
  "onChange":         (event: ChangeEvent<HTMLInputElement>) => void
}>

/** Whether a confirmation agrees with the new passphrase: `untyped` while it is empty, then `differs` or `matches`. */
export type PassphraseMatch = 'untyped' | 'differs' | 'matches'
// --

// == [The hook]: useNewPassphrase

/** The verdicts on a new passphrase and its confirmation as the user types them, for a form of your own: how strong it is, and whether the two match.
 * Spread `field` and `confirmField` onto two `PassphraseInput`s, show `verdictText` and `matchText` under them, or words of your own for `verdict` and `match`, enable the submit on `isReady`, and call `forget` from the form's `onReset`.
 * `giver`'s strength checker judges the passphrase. React keeps the verdicts, never the text. The words are the nearest `KitPhrasesProvider`'s.
 */
export function useNewPassphrase(giver: Pick<ReactGiver, 'useStrengthVerdict'>): NewPassphrase {
  const strength = giver.useStrengthVerdict()
  const chosenRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)
  const [match, setMatch] = useState<PassphraseMatch>('untyped')
  const [isChosenTyped, setIsChosenTyped] = useState(false)
  const phrases = useKitPhrases()
  const chosenId = useId()
  const confirmId = useId()
  const verdictId = useId()
  const matchId = useId()

  /** Compare the two fields as they now stand. */
  function compare() {
    const confirming = confirmRef.current?.value ?? ''
    if (confirming === '') { setMatch('untyped') } else { setMatch((confirming === chosenRef.current?.value) ? 'matches' : 'differs') }
  }
  /** Judge the new passphrase as typed, and compare it with its confirmation. */
  function hearChosen(typed: string) {
    setIsChosenTyped(typed !== '')
    compare()
    void strength.judge(typed)
  }
  // React empties the fields after each submit without an onChange, so the verdicts are reset by hand.
  /** Forget the verdicts on what the fields held. */
  function forget() {
    setIsChosenTyped(false)
    setMatch('untyped')
  }

  const isStrong = isChosenTyped && (! strength.isJudging) && (strength.verdict?.strong === true)
  return {
    field: {
      ...SharedFieldProps,
      "id":               chosenId,
      "ref":              chosenRef,
      "aria-describedby": verdictId,
      "onChange":         (event) => { hearChosen(event.target.value) },
    },
    confirmField: {
      ...SharedFieldProps,
      "id":               confirmId,
      "ref":              confirmRef,
      "aria-invalid":     (match === 'differs') || undefined,
      "aria-describedby": matchId,
      "onChange":         compare,
    },
    verdict:     isChosenTyped ? strength.verdict : null,
    match,
    verdictId,
    verdictText: isChosenTyped ? strengthTextOf(strength, phrases) : '',
    matchId,
    matchText:   matchTextOf(match, phrases),
    isReady:     isStrong && (match === 'matches'),
    forget,
  }
}
// --

// == [Helpers]: SharedFieldProps, strengthTextOf, matchTextOf

/** The props every field of a new passphrase shares. */
const SharedFieldProps = { autoComplete: 'new-password', required: true } as const

/** The meter's line for `strength`: the verdict's reason while weak, or that it is strong enough. */
function strengthTextOf({ verdict }: ReturnType<ReactGiver['useStrengthVerdict']>, phrases: KitPhrases): string {
  if (verdict === null) { return '' }
  return verdict.strong ? phrases.strongEnough : verdict.reason
}

/** The line under the confirmation field for `match`. */
function matchTextOf(match: PassphraseMatch, phrases: KitPhrases): string {
  if (match === 'untyped') { return '' }
  return (match === 'matches') ? phrases.passphrasesMatch : phrases.passphrasesDiffer
}
// --
