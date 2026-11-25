/** `CreateVaultForm`, the form that births a bank under a new passphrase, with a strength meter and a confirmation field. */

import { useId } from 'react'
import { useGivenBank, useGivenGiver } from '../giver/giver-context'
import type { BankGiver, ReactGiver } from '../giver/react-giver'
import { PassphraseInput } from '../parts/passphrase-input'
import { SubmitButton } from '../parts/submit-button'
import { KitPhrases, refusalTextOf } from './phrases-kit'
import { UsernameField } from './unlock-form'
import { useNewPassphrase } from './use-new-passphrase'

// == [The form]: CreateVaultFormProps, CreateVaultForm

/** The props of a {@link CreateVaultForm}. */
export interface CreateVaultFormProps {
  /** The giver, for its strength checker: the provider's, when left out. */
  giver?:    Pick<ReactGiver, 'useStrengthVerdict'> | undefined
  /** The giver's bank, `SOK.bank(banklabel)`: the provider's, when left out. */
  bank?:     Pick<BankGiver, 'useBirth'> | undefined
  /** The account the passphrase is saved under in a password manager: the user's email, say. */
  username?: string | undefined
}

/** The form that creates the vault, for stage `unborn`: a new passphrase with the strength checker's verdict beside it, and the passphrase again to confirm it.
 * Its submit stays disabled until the passphrase is strong and the two match. The bank is left unlocked.
 * A refused attempt leaves what was typed, for the user to correct; a stored one empties the form.
 * The passphrase never reaches React's state or the mutation's variables.
 * @example
 *   case 'unborn': return <CreateVaultForm username={user.email} />
 */
export function CreateVaultForm({ giver: giverProp, bank: bankProp, username }: Readonly<CreateVaultFormProps>) {
  const bank = useGivenBank(bankProp)
  const giver = useGivenGiver(giverProp)
  const birth = bank.useBirth()
  const newPassphrase = useNewPassphrase(giver)
  const alertId = useId()

  /** Birth the bank under the form's passphrase, handing focus back to its field on a refusal. */
  async function action(form: FormData) {
    await birth.attempt(form)
    if (birth.wasRefused()) { newPassphrase.field.ref.current?.focus() }
  }

  const isRefused = (birth.error !== null)
  return (
    <form className="sok-create-vault-form" action={action} onReset={(event) => { birth.keepTextIfRefused(event, newPassphrase.forget) }}>
      <p>{KitPhrases.createBlurb}</p>
      <UsernameField username={username} />
      <PassphraseInput
        {...newPassphrase.field}
        name="passphrase"
        aria-invalid={isRefused || undefined}
        aria-describedby={isRefused ? `${newPassphrase.verdictId} ${alertId}` : newPassphrase.verdictId}
      />
      <p role="status" id={newPassphrase.verdictId}>{newPassphrase.verdictText}</p>
      <PassphraseInput {...newPassphrase.confirmField} name="confirmation" />
      <p role="status" id={newPassphrase.matchId}>{newPassphrase.matchText}</p>
      <div role="alert" id={alertId}>{isRefused && refusalTextOf(birth.error)}</div>
      <SubmitButton whilePending={KitPhrases.creatingButton} disabled={! newPassphrase.isReady}>{KitPhrases.createButton}</SubmitButton>
    </form>
  )
}
// --
