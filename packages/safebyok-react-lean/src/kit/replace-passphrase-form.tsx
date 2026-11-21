/** `ReplacePassphraseForm`, the form that replaces the bank's passphrase, proved by the current one, with a strength meter and a confirmation field. */

import { useId, useRef, useState } from 'react'
import type { BankGiver, ReactGiver } from '../giver/react-giver'
import { PassphraseInput } from '../parts/passphrase-input'
import { SubmitButton } from '../parts/submit-button'
import { formActionOf } from './form-action'
import { KitPhrases, refusalTextOf } from './phrases-kit'
import { UsernameField } from './unlock-form'

// == [The form]: ReplacePassphraseFormProps, ReplacePassphraseForm

/** The props of a {@link ReplacePassphraseForm}. */
export interface ReplacePassphraseFormProps {
  /** The giver, for its strength checker. */
  giver:     Pick<ReactGiver, 'useStrengthVerdict'>
  /** The giver's bank, `SOK.bank(banklabel)`. */
  bank:      Pick<BankGiver, 'useReplacePassphrase'>
  /** The account the passphrase is saved under in a password manager: the user's email, say. */
  username?: string | undefined
}

/** The form that replaces the passphrase: the current one, then a new one with the strength checker's verdict beside it, and the new one again to confirm it.
 * Its submit stays disabled until the new passphrase is strong and the two match. The passkey stays, and the bank is left unlocked.
 * No passphrase reaches React's state or the mutation's variables.
 * @example
 *   case 'unlocked': return <ReplacePassphraseForm giver={SOK} bank={Knock} username={user.email} />
 */
export function ReplacePassphraseForm({ giver, bank, username }: Readonly<ReplacePassphraseFormProps>) {
  const replace = bank.useReplacePassphrase()
  const strength = giver.useStrengthVerdict()
  const currentRef = useRef<HTMLInputElement>(null)
  const chosenRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)
  // Whether the two new fields agree, compared in the page: React keeps the verdict, never the text.
  const [confirmation, setConfirmation] = useState<'untyped' | 'differs' | 'matches'>('untyped')
  const [isChosenTyped, setIsChosenTyped] = useState(false)
  const verdictId = useId()
  const matchId = useId()
  const alertId = useId()
  const replaceAction = formActionOf(replace, ['passphrase', 'nextPassphrase', 'confirmation'], ({ passphrase, nextPassphrase }) => (
    { passphraseCleartext: passphrase, nextPassphraseCleartext: nextPassphrase }
  ))

  // The refusal is most often the current passphrase, so focus goes back to its field.
  /** Replace the passphrase with the form's, handing focus back to the current passphrase's field on a refusal. */
  async function action(form: FormData) {
    if (! await replaceAction(form)) { currentRef.current?.focus() }
  }

  /** Compare the two new fields as they now stand. */
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
  /** Forget the verdicts on what the fields held. */
  function forget() {
    setIsChosenTyped(false)
    setConfirmation('untyped')
  }

  const isStrong = isChosenTyped && (! strength.isJudging) && (strength.verdict?.strong === true)
  const isRefused = (replace.error !== null)
  return (
    <form className="sok-replace-passphrase-form" action={action} onReset={forget}>
      <p>{KitPhrases.replaceBlurb}</p>
      {(username !== undefined) && <UsernameField username={username} />}
      <PassphraseInput
        ref={currentRef}
        name="passphrase"
        autoComplete="current-password"
        aria-label={KitPhrases.currentField}
        placeholder={KitPhrases.currentField}
        required
        aria-invalid={isRefused || undefined}
        aria-describedby={isRefused ? alertId : undefined}
      />
      <PassphraseInput
        ref={chosenRef}
        name="nextPassphrase"
        autoComplete="new-password"
        aria-label={KitPhrases.newPassphraseField}
        placeholder={KitPhrases.newPassphraseField}
        required
        aria-describedby={verdictId}
        onChange={(event) => { hearChosen(event.target.value) }}
      />
      <p role="status" id={verdictId}>{isChosenTyped && strengthTextOf(strength)}</p>
      <PassphraseInput
        ref={confirmRef}
        name="confirmation"
        autoComplete="new-password"
        aria-label={KitPhrases.confirmField}
        placeholder={KitPhrases.confirmField}
        required
        aria-invalid={(confirmation === 'differs') || undefined}
        aria-describedby={matchId}
        onChange={compare}
      />
      <p role="status" id={matchId}>{matchTextOf(confirmation)}</p>
      <div role="alert" id={alertId}>{isRefused && refusalTextOf(replace.error)}</div>
      <SubmitButton whilePending={KitPhrases.replacingButton} disabled={! isStrong || (confirmation !== 'matches')}>{KitPhrases.replaceButton}</SubmitButton>
    </form>
  )
}

/** The meter's line for `strength`: the verdict's reason while weak, or that it is strong enough. */
function strengthTextOf({ verdict }: ReturnType<ReactGiver['useStrengthVerdict']>): string {
  if (verdict === null) { return '' }
  return verdict.strong ? KitPhrases.strongEnough : verdict.reason
}

/** The line under the confirmation field for `confirmation`. */
function matchTextOf(confirmation: 'untyped' | 'differs' | 'matches'): string {
  if (confirmation === 'untyped') { return '' }
  return (confirmation === 'matches') ? KitPhrases.passphrasesMatch : KitPhrases.passphrasesDiffer
}
// --
