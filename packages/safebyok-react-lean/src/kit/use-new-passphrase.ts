/** `useNewPassphrase`, the state of a new passphrase and its confirmation, for a kit form or a host's own: the strength meter and whether the two fields match. */

import { type ChangeEvent, type RefObject, type SyntheticEvent, useId, useRef, useState } from 'react'
import type { ReactGiver } from '../giver/react-giver'
import { KitPhrases } from './phrases-kit'

// == [Types]: NewPassphrase, NewPassphraseFieldProps

/** What {@link useNewPassphrase} answers: the props of the two fields, the lines shown under them, and whether the form may submit. */
export type NewPassphrase = Readonly<{
  /** The props of the new passphrase's field, to spread onto a `PassphraseInput` beside its `name`. */
  field:        NewPassphraseFieldProps
  /** The props of the confirmation's field, to spread onto a `PassphraseInput` beside its `name`. */
  confirmField: NewPassphraseFieldProps & Readonly<{ "aria-invalid": true | undefined }>
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
  /** Forget the verdicts on what the fields held, for the form's `onReset`: a reset whose `event` was cancelled, which keeps the text, keeps them too. */
  forget:       (event?: SyntheticEvent) => void
}>

/** The props {@link useNewPassphrase} gives one of its fields. */
export type NewPassphraseFieldProps = Readonly<{
  "ref":              RefObject<HTMLInputElement | null>
  "autoComplete":     'new-password'
  "aria-label":       string
  "placeholder":      string
  "required":         true
  "aria-describedby": string
  "onChange":         (event: ChangeEvent<HTMLInputElement>) => void
}>
// --

// == [The hook]: useNewPassphrase

/** The verdicts on a new passphrase and its confirmation as the user types them, for a form of your own: how strong it is, and whether the two match.
 * Spread `field` and `confirmField` onto two `PassphraseInput`s, show `verdictText` and `matchText` under them, enable the submit on `isReady`, and call `forget` from the form's `onReset`, or hand it to a hook's `keepTextIfRefused` as its `onEmptied` where the form has one.
 * `giver`'s strength checker judges the passphrase. React keeps the verdicts, never the text.
 */
export function useNewPassphrase(giver: Pick<ReactGiver, 'useStrengthVerdict'>): NewPassphrase {
  const strength = giver.useStrengthVerdict()
  const chosenRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)
  const [confirmation, setConfirmation] = useState<Confirmation>('untyped')
  const [isChosenTyped, setIsChosenTyped] = useState(false)
  const verdictId = useId()
  const matchId = useId()

  /** Compare the two fields as they now stand. */
  function compare() {
    const confirming = confirmRef.current?.value ?? ''
    if (confirming === '') { setConfirmation('untyped') } else { setConfirmation((confirming === chosenRef.current?.value) ? 'matches' : 'differs') }
  }
  /** Judge the new passphrase as typed, and compare it with its confirmation. */
  function hearChosen(typed: string) {
    setIsChosenTyped(typed !== '')
    compare()
    void strength.judge(typed)
  }
  // React empties the fields after each submit without an onChange, so the verdicts are reset by hand.
  /** Forget the verdicts on what the fields held, unless `event` was cancelled. */
  function forget(event?: SyntheticEvent) {
    if (event?.defaultPrevented === true) { return }
    setIsChosenTyped(false)
    setConfirmation('untyped')
  }

  const isStrong = isChosenTyped && (! strength.isJudging) && (strength.verdict?.strong === true)
  return {
    field: {
      ...fieldPropsOf(KitPhrases.newPassphraseField),
      "ref":              chosenRef,
      "aria-describedby": verdictId,
      "onChange":         (event) => { hearChosen(event.target.value) },
    },
    confirmField: {
      ...fieldPropsOf(KitPhrases.confirmField),
      "ref":              confirmRef,
      "aria-invalid":     (confirmation === 'differs') || undefined,
      "aria-describedby": matchId,
      "onChange":         compare,
    },
    verdictId,
    verdictText: isChosenTyped ? strengthTextOf(strength) : '',
    matchId,
    matchText:   matchTextOf(confirmation),
    isReady:     isStrong && (confirmation === 'matches'),
    forget,
  }
}
// --

// == [Helpers]: Confirmation, fieldPropsOf, strengthTextOf, matchTextOf

/** Whether the confirmation agrees with the new passphrase. */
type Confirmation = 'untyped' | 'differs' | 'matches'

/** The props every field of a new passphrase shares, labelled `label`. */
function fieldPropsOf(label: string) {
  return { "autoComplete": 'new-password', "aria-label": label, "placeholder": label, "required": true } as const
}

/** The meter's line for `strength`: the verdict's reason while weak, or that it is strong enough. */
function strengthTextOf({ verdict }: ReturnType<ReactGiver['useStrengthVerdict']>): string {
  if (verdict === null) { return '' }
  return verdict.strong ? KitPhrases.strongEnough : verdict.reason
}

/** The line under the confirmation field for `confirmation`. */
function matchTextOf(confirmation: Confirmation): string {
  if (confirmation === 'untyped') { return '' }
  return (confirmation === 'matches') ? KitPhrases.passphrasesMatch : KitPhrases.passphrasesDiffer
}
// --
