/** The passkey's forms: `AddPasskeyForm`, `RevokePasskeyForm`, and `PasskeyUnlockButton`, which unlocks the bank by its passkey. */

import { useId, useRef, useState } from 'react'
import { type PasskeyAnswer, type VaultError, type WayinHeader, isVaultError } from 'safebyok'
import { passkeyHeaderOf } from '../giver/giver-defaults'
import { popField } from '../giver/pop-field'
import { useGivenBank } from '../giver/giver-context'
import type { BankGiver } from '../giver/react-giver'
import { PassphraseInput } from '../parts/passphrase-input'
import { SubmitButton } from '../parts/submit-button'
import { type AskPasskeyOpts, type CreatePasskeyOpts, askPasskey, createPasskey, passkeysAvailable } from './passkey'
import { KitPhrases, refusalTextOf } from './phrases-kit'
import { UsernameField } from './unlock-form'

// == [Adding]: AddPasskeyFormProps, AddPasskeyForm

/** The props of an {@link AddPasskeyForm}. */
export interface AddPasskeyFormProps {
  /** The giver's bank, `SOK.bank(banklabel)`: the provider's, when left out. */
  bank?:       Pick<BankGiver, 'useAddPasskey'> | undefined
  /** How the authenticator labels the new passkey: the relying party, and the account it lists the passkey under. */
  passkeyOpts: CreatePasskeyOpts
  /** The account the passphrase is saved under in a password manager: the user's email, say. */
  username?:   string | undefined
}

/** The form that adds a passkey, proved by the passphrase: the browser offers to make the passkey once the passphrase is submitted.
 * Show it while the bank has no passkey, `Knock.useGate()`'s `wayins.passkey0` null. The bank is left unlocked.
 * A dismissed prompt adds nothing and says nothing; the passphrase field empties as after any submit. A browser or authenticator that cannot make a passkey shows why in the form.
 * @example
 *   <AddPasskeyForm passkeyOpts={{ rp: { name: 'Knock-Knock' }, user: { name: user.email, displayName: user.name } }} />
 */
export function AddPasskeyForm({ bank: bankProp, passkeyOpts, username }: Readonly<AddPasskeyFormProps>) {
  const bank = useGivenBank(bankProp)
  const add = bank.useAddPasskey()
  const [ceremonyErr, setCeremonyErr] = useState<VaultError | null>(null)
  const fieldRef = useRef<HTMLInputElement>(null)
  const alertId = useId()
  // A form cannot carry the passkey's answer, so the passphrase is taken from it before the ceremony is awaited.
  /** Add a passkey under the form's passphrase, handing focus back to its field on a refusal. */
  async function action(form: FormData) {
    setCeremonyErr(null)
    add.reset()
    const passphrase = popField(form, 'passphrase')
    const nextPasskeyAnswer = await heardCeremony(() => createPasskey(passkeyOpts), setCeremonyErr)
    if (nextPasskeyAnswer === null) { return }
    await add.attempt({ passphrase, nextPasskeyAnswer })
    if (add.wasRefused()) { fieldRef.current?.focus() }
  }
  const refusal = ceremonyErr ?? add.error
  return (
    <form className="sok-add-passkey-form" action={action}>
      <p>{KitPhrases.addPasskeyBlurb}</p>
      <UsernameField username={username} />
      <PassphraseInput
        ref={fieldRef}
        name="passphrase"
        aria-label={KitPhrases.passphraseField}
        placeholder={KitPhrases.passphraseField}
        required
        aria-invalid={(add.error !== null) || undefined}
        aria-describedby={(refusal === null) ? undefined : alertId}
      />
      <div role="alert" id={alertId}>{(refusal !== null) && refusalTextOf(refusal)}</div>
      <SubmitButton whilePending={KitPhrases.addingPasskeyButton}>{KitPhrases.addPasskeyButton}</SubmitButton>
    </form>
  )
}
// --

// == [Revoking]: RevokePasskeyFormProps, RevokePasskeyForm

/** The props of a {@link RevokePasskeyForm}. */
export interface RevokePasskeyFormProps {
  /** The giver's bank, `SOK.bank(banklabel)`: the provider's, when left out. */
  bank?:     Pick<BankGiver, 'useRevokePasskey'> | undefined
  /** The account the passphrase is saved under in a password manager: the user's email, say. */
  username?: string | undefined
}

// Proved by the passphrase, never the passkey: a user revoking a passkey may have lost it.
/** The form that removes the bank's passkey, here and on every other device, proved by the passphrase. The bank is left unlocked.
 * Show it while the bank has a passkey, the gate's header that {@link passkeyHeaderOf} finds.
 * @example
 *   const passkeyHeader = Knock.useGate({ select: passkeyHeaderOf }).data
 *   {(passkeyHeader !== null) && (passkeyHeader !== undefined) && <RevokePasskeyForm username={user.email} />}
 */
export function RevokePasskeyForm({ bank: bankProp, username }: Readonly<RevokePasskeyFormProps>) {
  const bank = useGivenBank(bankProp)
  const revoke = bank.useRevokePasskey()
  const fieldRef = useRef<HTMLInputElement>(null)
  const alertId = useId()
  /** Revoke the passkey, proved by the form's passphrase, handing focus back to its field on a refusal. */
  async function action(form: FormData) {
    await revoke.attempt(form)
    if (revoke.wasRefused()) { fieldRef.current?.focus() }
  }
  const isRefused = (revoke.error !== null)
  return (
    <form className="sok-revoke-passkey-form" action={action}>
      <p>{KitPhrases.revokePasskeyBlurb}</p>
      <UsernameField username={username} />
      <PassphraseInput
        ref={fieldRef}
        name="passphrase"
        aria-label={KitPhrases.passphraseField}
        placeholder={KitPhrases.passphraseField}
        required
        aria-invalid={isRefused || undefined}
        aria-describedby={isRefused ? alertId : undefined}
      />
      <div role="alert" id={alertId}>{isRefused && refusalTextOf(revoke.error)}</div>
      <SubmitButton whilePending={KitPhrases.revokingPasskeyButton}>{KitPhrases.revokePasskeyButton}</SubmitButton>
    </form>
  )
}
// --

// == [Unlocking]: PasskeyUnlockButtonProps, PasskeyUnlockButton

/** The props of a {@link PasskeyUnlockButton}. */
export interface PasskeyUnlockButtonProps {
  /** The giver's bank, `SOK.bank(banklabel)`: the provider's, when left out. */
  bank?:          Pick<BankGiver, 'useUnlock' | 'useGate'> | undefined
  /** The header of the bank's passkey, or null while it has none: read from the bank's `useGate()`, when left out. */
  passkeyHeader?: WayinHeader | null | undefined
  /** The relying-party id the passkey was made under, and how long the browser waits. */
  askOpts?:       AskPasskeyOpts | undefined
}

/** A button that unlocks the bank by its passkey, for stage `locked`. It renders nothing while the bank has no passkey, or the browser cannot use one.
 * A dismissed prompt changes nothing; a wrong passkey, or a browser that cannot ask, shows why beside the button.
 * @example
 *   case 'locked': return <><UnlockForm /><PasskeyUnlockButton /></>
 */
export function PasskeyUnlockButton({ bank: bankProp, passkeyHeader: passkeyHeaderProp, askOpts }: Readonly<PasskeyUnlockButtonProps>) {
  const bank = useGivenBank(bankProp)
  const bankPasskeyHeader = bank.useGate({ select: passkeyHeaderOf }).data ?? null
  const passkeyHeader = (passkeyHeaderProp === undefined) ? bankPasskeyHeader : passkeyHeaderProp
  const unlock = bank.useUnlock()
  const [isUnlocking, setIsUnlocking] = useState(false)
  const [ceremonyErr, setCeremonyErr] = useState<VaultError | null>(null)
  const alertId = useId()
  // Submitted from a handler, never a form action, as the unlock form is: what waits on the unlock may be a host's pending Action.
  /** Ask the passkey, and unlock the bank with its answer. */
  async function submit() {
    setCeremonyErr(null)
    unlock.reset()
    setIsUnlocking(true)
    try {
      const passkeyAnswer = await heardCeremony(() => askPasskey(passkeyHeader, askOpts), setCeremonyErr)
      if (passkeyAnswer !== null) { await unlock.attempt({ passkeyAnswer }) }
    } finally {
      setIsUnlocking(false)
    }
  }
  if (! passkeysAvailable() || (passkeyHeader?.wayinkind !== 'passkey')) { return null }
  const refusal = ceremonyErr ?? unlock.error
  return (
    <form className="sok-passkey-unlock" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <SubmitButton isPending={isUnlocking} whilePending={KitPhrases.askingPasskeyButton} aria-describedby={(refusal === null) ? undefined : alertId}>
        {KitPhrases.passkeyUnlockButton}
      </SubmitButton>
      <div role="alert" id={alertId}>{(refusal !== null) && refusalTextOf(refusal)}</div>
    </form>
  )
}
// --

// == [Helpers]: heardCeremony

/** The answer `ceremony` resolves, or null where the user dismissed it or it refused a condition, handed to `hear`.
 * Any other refusal, such as options the host got wrong, is rethrown.
 */
async function heardCeremony(ceremony: () => Promise<PasskeyAnswer | null>, hear: (refusal: VaultError) => void): Promise<PasskeyAnswer | null> {
  try {
    return await ceremony()
  } catch (err) {
    if (! isVaultError(err) || (err.family !== 'condition')) { throw err }
    hear(err)
    return null
  }
}
// --
