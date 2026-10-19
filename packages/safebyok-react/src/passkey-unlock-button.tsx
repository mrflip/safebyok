import { useState, useSyncExternalStore } from 'react'
import type { Ask, ProofAnswer, VaultSnapshot } from 'safebyok'
import { attemptRefusalFlavor } from './attempt-refusals'
import { Boundary, forBoundary, useRoundFor } from './boundary'
import { Messages } from './messages'
import { useIsMounted } from './is-mounted'
import { askPasskey, passkeysAvailable } from './passkey'

/**
 * A button that answers an {@link Ask} with one of the vault's passkeys: rendered only when the
 * vault has one and the browser offers WebAuthn, so a dialog can place it beside its passphrase
 * field unconditionally. `PassphraseModal` does, first, ahead of the field. A press asks the user
 * to touch a passkey -- the press is the user gesture WebAuthn needs -- then hands its answer to
 * `ask.attempt`. It follows the vault's snapshot as it changes: a passkey added on another device
 * brings the button, one removed takes it away. Handed another ask, it starts afresh. Taken away,
 * it lets go: a press still under way finishes unheard, calling `onDone` and `onGripe` no more.
 *
 * `onDone('unlocked')` once the attempt is ok; `onDone('declined')` for a refusal that closes the
 * dialog -- a lock that won meanwhile, storage out of reach -- as the passphrase dialog does. Each
 * press first tells `onGripe(null)`: whatever the button said before no longer stands. A
 * dismissed prompt then does nothing more; a refusal to show in place (a wrong or removed passkey,
 * an authenticator without PRF) goes to `onGripe` with its calm message, for the dialog to show.
 * Anything else -- misuse, such as an `rpId` that does not fit the page or a closed vault handle,
 * or a failure that is no VaultError -- never reaches the host's page: the button
 * takes itself away, `onGripe` hears "Your passkey can't be used here just now. Unlock with your
 * passphrase instead.", and React reports the error, carrying nothing typed, through the root's `onCaughtError` (the
 * console, by default, with the component stack), where the developer and an error tracker meet
 * it. Focus the button held falls to the page then: a dialog of the host's own moves it to its
 * passphrase field, as `PassphraseModal` does.
 *
 * @example <PasskeyUnlockButton ask={ask} onDone={close} onGripe={setGripe} />
 * @example <PasskeyUnlockButton ask={ask} rpId="acme.example" onDone={close} onGripe={setGripe} />  // passkeys made under that rp.id
 * @example <PasskeyUnlockButton ask={ask} autoFocus onDone={close} onGripe={setGripe} />  // the dialog's first choice
 */
export const PasskeyUnlockButton = (props: PasskeyUnlockButtonProps) => (
  <Boundary key={useRoundFor(props.ask)} fallback={null} onCaught={() => { props.onGripe(Messages.passkeyTrouble) }}>
    <PasskeyPress {...props} />
  </Boundary>
)

/** What PasskeyUnlockButton is handed. */
type PasskeyUnlockButtonProps = {
  /** The ask the passkey answers, as the vault handed it to `getProof`. */
  ask:        Ask
  /** Called once the ask is answered: 'unlocked', or 'declined' for a refusal that closes the dialog. */
  onDone:     (answer: ProofAnswer) => void
  /** What the button has to say: a calm message, or null when what it said last no longer stands. */
  onGripe:    (gripe: string | null) => void
  rpId?:      string | undefined
  /** Whether the button takes the focus when it first shows: true where it is the first choice. */
  autoFocus?: boolean | undefined
}

/** Whether the button shows for a vault in this state: the browser offers WebAuthn, and the vault lists a passkey. */
export const offersPasskey = (snapshot: VaultSnapshot): boolean => (
  passkeysAvailable() && snapshot.wayins.some((wayin) => wayin.wayinkind === 'passkey')
)

/** The button itself, inside PasskeyUnlockButton's boundary. */
const PasskeyPress = ({ ask, onDone, onGripe, rpId, autoFocus }: PasskeyUnlockButtonProps) => {
  const snapshot = useSyncExternalStore(ask.vault.subscribe, ask.vault.getSnapshot)
  const [asking, setAsking] = useState(false)
  // Wrapped, so that a rejection carrying any value at all still reads as "failed".
  const [failure, setFailure] = useState<{ err: unknown } | null>(null)
  // Asked after each await: a button gone meanwhile -- its dialog went, or another vault remounted
  // it -- unlocks nothing, and touches neither its state nor its dialog's callbacks again.
  const isMounted = useIsMounted()
  if (failure !== null) { throw forBoundary(failure.err, 'PasskeyUnlockButton') }
  if (! offersPasskey(snapshot)) { return null }

  const press = async () => {
    setAsking(true)
    onGripe(null)
    try {
      const passkey = await askPasskey(snapshot.wayins, { rpId })
      if (passkey === null || ! isMounted()) { return }
      const { ok, err } = await ask.attempt(passkey)
      if (! isMounted()) { return }
      if (ok) { onDone('unlocked'); return }
      heard(err)
    } catch (err) {
      if (isMounted()) { heard(err) }
    } finally {
      if (isMounted()) { setAsking(false) }
    }
  }

  /** What the attempt, or the authenticator asked before it, refused with. */
  const heard = (err: unknown) => {
    const flavor = attemptRefusalFlavor(err)
    if (flavor === 'close') { onDone('declined'); return }
    // Misuse, or no VaultError at all: rethrown in render, for PasskeyUnlockButton's boundary.
    if (flavor === 'trouble') { setFailure({ err }); return }
    onGripe((err as Error).message)
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-autofocus -- only where a dialog makes the passkey its first choice: the WAI-ARIA dialog pattern moves focus to a dialog's first control
    <button type="button" autoFocus={autoFocus} disabled={asking} onClick={() => { void press() }}>
      {Messages.passkeyButton}
    </button>
  )
}
