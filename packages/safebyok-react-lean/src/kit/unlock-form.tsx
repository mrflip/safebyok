/** `UnlockForm`, the passphrase form that unlocks a bank, and `UnlockDialog`, the same form as the dialog shown while a call waits on it. */

import { useId, useRef, useState } from 'react'
import { useGivenBank } from '../giver/giver-context'
import type { BankGiver } from '../giver/react-giver'
import { PassphraseInput } from '../parts/passphrase-input'
import { formActionOf } from './form-action'
import { ModalDialog } from './modal-dialog'
import { KitPhrases, refusalTextOf } from './phrases-kit'

// == [The form]: UnlockFormProps, UnlockForm, UsernameField

/** The props of an {@link UnlockForm}. */
export interface UnlockFormProps {
  /** The giver's bank, `SOK.bank(banklabel)`: the provider's, when left out. */
  bank?:     Pick<BankGiver, 'useUnlock'> | undefined
  /** The account the passphrase is saved under in a password manager: the user's email, say. */
  username?: string | undefined
  /** Shows a Cancel button that calls it. */
  onCancel?: (() => void) | undefined
}

/** The form that unlocks the bank by its passphrase, for stage `locked`. A wrong passphrase shows an alert and leaves the form open for another try.
 * The passphrase never reaches React's state or the mutation's variables. Every `withWhisper` waiting on the unlock resumes.
 * @example
 *   case 'locked': return <UnlockForm username={user.email} />
 */
export function UnlockForm({ bank: bankProp, username, onCancel }: Readonly<UnlockFormProps>) {
  const bank = useGivenBank(bankProp)
  const unlock = bank.useUnlock()
  const [isUnlocking, setIsUnlocking] = useState(false)
  const fieldRef = useRef<HTMLInputElement>(null)
  const alertId = useId()
  const unlockAction = formActionOf(unlock, ['passphrase'], ({ passphrase }) => ({ passphraseCleartext: passphrase }))
  // What waits on the unlock may be a host's pending Action, and React commits no transition's update until every
  // transition running ends. So the form submits from a handler, never a form action, and shows its pending in plain state.
  // The submit button is disabled while the unlock runs and loses focus, so a refusal hands it back to the field.
  /** Unlock with the passphrase in `formEl`, then empty the form, as a form action would. */
  async function submit(formEl: HTMLFormElement) {
    setIsUnlocking(true)
    try {
      if (! await unlockAction(new FormData(formEl))) { fieldRef.current?.focus() }
    } finally {
      formEl.reset()
      setIsUnlocking(false)
    }
  }
  const isRefused = (unlock.error !== null)
  return (
    <form className="sok-unlock-form" onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget) }}>
      {(username !== undefined) && <UsernameField username={username} />}
      <PassphraseInput
        ref={fieldRef}
        name="passphrase"
        autoComplete="current-password"
        aria-label={KitPhrases.passphraseField}
        placeholder={KitPhrases.passphraseField}
        required
        aria-invalid={isRefused || undefined}
        aria-describedby={isRefused ? alertId : undefined}
        isPending={isUnlocking}
      />
      <div role="alert" id={alertId}>{isRefused && refusalTextOf(unlock.error)}</div>
      <button type="submit" disabled={isUnlocking}>{isUnlocking ? KitPhrases.unlockingButton : KitPhrases.unlockButton}</button>
      {(onCancel !== undefined) && <button type="button" onClick={onCancel}>{KitPhrases.cancelButton}</button>}
    </form>
  )
}

/** A hidden username field, so a password manager files the passphrase under the account. */
export function UsernameField({ username }: Readonly<{ username: string }>) {
  // The inline style, as a host's stylesheet may override the hidden attribute.
  return <input type="text" name="username" autoComplete="username" value={username} readOnly hidden style={{ display: 'none' }} />
}
// --

// == [The dialog]: UnlockDialogProps, UnlockDialog

/** The props of an {@link UnlockDialog}. */
export interface UnlockDialogProps {
  /** The giver's bank, `SOK.bank(banklabel)`: the provider's, when left out. */
  bank?:     Pick<BankGiver, 'useBank' | 'useUnlock' | 'dismissUnlock'> | undefined
  /** The account the passphrase is saved under in a password manager: the user's email, say. */
  username?: string | undefined
}

/** The unlock form as a modal dialog, open while a call such as `withWhisper` waits for the bank to be unlocked. Mount it once, anywhere under the provider.
 * Cancel or Escape dismisses the wait: each waiting call rejects `dismissed`, and the bank stays locked.
 * The waiting call may run inside a transition or a form Action: the dialog still takes another try after a wrong passphrase.
 * @example
 *   <main><KeyEditor /><UnlockDialog /></main>
 */
export function UnlockDialog({ bank: bankProp, username }: Readonly<UnlockDialogProps>) {
  const bank = useGivenBank(bankProp)
  const isUnlockWanted = bank.useBank((snap) => snap.isUnlockWanted)
  const titleId = useId()
  if (! isUnlockWanted) { return null }
  return (
    <ModalDialog labelledBy={titleId} onCancel={bank.dismissUnlock}>
      <h2 id={titleId}>{KitPhrases.unlockTitle}</h2>
      <p>{KitPhrases.unlockBlurb}</p>
      <UnlockForm bank={bank} username={username} onCancel={bank.dismissUnlock} />
    </ModalDialog>
  )
}
// --
