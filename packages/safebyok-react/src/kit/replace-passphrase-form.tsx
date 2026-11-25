/** `ReplacePassphraseForm`, the form that replaces the bank's passphrase, proved by the current one, with a strength meter and a confirmation field. */

import { useId, useRef } from 'react'
import { useGivenBank, useGivenGiver } from '../giver/giver-context'
import type { BankGiver, ReactGiver } from '../giver/react-giver'
import { PassphraseInput } from '../parts/passphrase-input'
import { SubmitButton } from '../parts/submit-button'
import { KitPhrases, refusalTextOf } from './phrases-kit'
import { UsernameField } from './unlock-form'
import { useNewPassphrase } from './use-new-passphrase'

// == [The form]: ReplacePassphraseFormProps, ReplacePassphraseForm

/** The props of a {@link ReplacePassphraseForm}. */
export interface ReplacePassphraseFormProps {
  /** The giver, for its strength checker: the provider's, when left out. */
  giver?:    Pick<ReactGiver, 'useStrengthVerdict'> | undefined
  /** The giver's bank, `SOK.bank(banklabel)`: the provider's, when left out. */
  bank?:     Pick<BankGiver, 'useReplacePassphrase'> | undefined
  /** The account the passphrase is saved under in a password manager: the user's email, say. */
  username?: string | undefined
}

/** The form that replaces the passphrase: the current one, then a new one with the strength checker's verdict beside it, and the new one again to confirm it.
 * Its submit stays disabled until the new passphrase is strong and the two match. The passkey stays, and the bank is left unlocked.
 * A refused attempt leaves what was typed, for the user to correct; a stored one empties the form.
 * No passphrase reaches React's state or the mutation's variables.
 * @example
 *   case 'unlocked': return <ReplacePassphraseForm username={user.email} />
 */
export function ReplacePassphraseForm({ giver: giverProp, bank: bankProp, username }: Readonly<ReplacePassphraseFormProps>) {
  const bank = useGivenBank(bankProp)
  const giver = useGivenGiver(giverProp)
  const replace = bank.useReplacePassphrase()
  const newPassphrase = useNewPassphrase(giver)
  const currentRef = useRef<HTMLInputElement>(null)
  const alertId = useId()

  // The refusal is most often the current passphrase, so focus goes back to its field.
  /** Replace the passphrase with the form's, handing focus back to the current passphrase's field on a refusal. */
  async function action(form: FormData) {
    await replace.attempt(form)
    if (replace.wasRefused()) { currentRef.current?.focus() }
  }

  const isRefused = (replace.error !== null)
  return (
    <form className="sok-replace-passphrase-form" action={action} onReset={(event) => { replace.keepTextIfRefused(event, newPassphrase.forget) }}>
      <p>{KitPhrases.replaceBlurb}</p>
      <UsernameField username={username} />
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
      <PassphraseInput {...newPassphrase.field} name="nextPassphrase" />
      <p role="status" id={newPassphrase.verdictId}>{newPassphrase.verdictText}</p>
      <PassphraseInput {...newPassphrase.confirmField} name="confirmation" />
      <p role="status" id={newPassphrase.matchId}>{newPassphrase.matchText}</p>
      <div role="alert" id={alertId}>{isRefused && refusalTextOf(replace.error)}</div>
      <SubmitButton whilePending={KitPhrases.replacingButton} disabled={! newPassphrase.isReady}>{KitPhrases.replaceButton}</SubmitButton>
    </form>
  )
}
// --
