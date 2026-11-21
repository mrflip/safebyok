/** `CreateVaultForm`, the form that births a bank under a new passphrase, with a strength meter and a confirmation field. */

import { useId, useRef, useState } from 'react'
import { useGivenBank, useGivenGiver } from '../giver/giver-context'
import type { BankGiver, ReactGiver } from '../giver/react-giver'
import { PassphraseInput } from '../parts/passphrase-input'
import { SubmitButton } from '../parts/submit-button'
import { formActionOf } from './form-action'
import { KitPhrases, refusalTextOf } from './phrases-kit'
import { UsernameField } from './unlock-form'

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
 * The passphrase never reaches React's state or the mutation's variables.
 * @example
 *   case 'unborn': return <CreateVaultForm username={user.email} />
 */
export function CreateVaultForm({ giver: giverProp, bank: bankProp, username }: Readonly<CreateVaultFormProps>) {
  const bank = useGivenBank(bankProp)
  const giver = useGivenGiver(giverProp)
  const birth = bank.useBirth()
  const strength = giver.useStrengthVerdict()
  const chosenRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)
  // Whether the two fields agree, compared in the page: React keeps the verdict, never the text.
  const [confirmation, setConfirmation] = useState<'untyped' | 'differs' | 'matches'>('untyped')
  const [isChosenTyped, setIsChosenTyped] = useState(false)
  const verdictId = useId()
  const matchId = useId()
  const alertId = useId()
  const birthAction = formActionOf(birth, ['passphrase', 'confirmation'], ({ passphrase }) => ({ passphraseCleartext: passphrase }))

  /** Birth the bank under the form's passphrase, handing focus back to its field on a refusal. */
  async function action(form: FormData) {
    if (! await birthAction(form)) { chosenRef.current?.focus() }
  }

  /** Compare the two fields as they now stand. */
  function compare() {
    const confirming = confirmRef.current?.value ?? ''
    if (confirming === '') { setConfirmation('untyped') } else { setConfirmation((confirming === chosenRef.current?.value) ? 'matches' : 'differs') }
  }
  /** Judge the passphrase as typed, and compare it with its confirmation. */
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
  const isRefused = (birth.error !== null)
  return (
    <form className="sok-create-vault-form" action={action} onReset={forget}>
      <p>{KitPhrases.createBlurb}</p>
      {(username !== undefined) && <UsernameField username={username} />}
      <PassphraseInput
        ref={chosenRef}
        name="passphrase"
        autoComplete="new-password"
        aria-label={KitPhrases.newPassphraseField}
        placeholder={KitPhrases.newPassphraseField}
        required
        aria-invalid={isRefused || undefined}
        aria-describedby={isRefused ? `${verdictId} ${alertId}` : verdictId}
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
      <div role="alert" id={alertId}>{isRefused && refusalTextOf(birth.error)}</div>
      <SubmitButton whilePending={KitPhrases.creatingButton} disabled={! isStrong || (confirmation !== 'matches')}>{KitPhrases.createButton}</SubmitButton>
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
