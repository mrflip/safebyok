import { useState, useSyncExternalStore } from 'react'
import type { UnlockVaultGating, VaultSnapshot } from 'safebyok'
import { attemptRefusalFlavor } from './attempt-refusals'
import { Boundary, forBoundary, useRoundFor } from './boundary'
import { Messages } from './messages'
import { askPasskey, passkeysAvailable } from './passkey'
import { useWhenShown } from './when-shown'

/**
 * A button that answers an `unlock_vault` gating with the vault's passkey: rendered only when the
 * vault has one and the browser offers WebAuthn, so a dialog can place it beside its passphrase
 * field unconditionally. `PassphraseModal` does, first, ahead of the field. A press asks the user
 * to touch the passkey -- the press is the user gesture WebAuthn needs -- then hands its answer to
 * `gating.attemptPasskey`. It follows the vault's snapshot as it changes: a passkey added on
 * another device brings the button, one removed takes it away. Handed another gating, it starts
 * afresh. Taken away, it lets go: a press still under way finishes unheard, calling `onDone` and
 * `onGripe` no more. Hidden by an `<Activity>` or a Suspense boundary, it waits: a press that
 * settles meanwhile is met once it shows again.
 *
 * `onDone('unlocked')` once the attempt is ok; `onDone('declined')` for a refusal that closes the
 * dialog -- a lock that won meanwhile, storage out of reach -- as the passphrase dialog does. Each
 * press first tells `onGripe(null)`: whatever the button said before no longer stands. A
 * dismissed prompt then does nothing more; a refusal to show in place (a wrong or removed passkey,
 * an authenticator without PRF) goes to `onGripe` with its calm message, for the dialog to show.
 * Anything else -- misuse, such as an `rpId` that does not fit the page, or a failure that is no VaultError -- never reaches the host's page: the button
 * takes itself away, `onGripe` hears "Your passkey can't be used here just now. Unlock with your
 * passphrase instead.", and React reports the error, carrying nothing typed, through the root's `onCaughtError` (the
 * console, by default, with the component stack), where the developer and an error tracker meet
 * it. Focus the button held falls to the page then: a dialog of the host's own moves it to its
 * passphrase field, as `PassphraseModal` does.
 *
 * @example <PasskeyUnlockButton gating={gating} onDone={close} onGripe={setGripe} />
 * @example <PasskeyUnlockButton gating={gating} rpId="acme.example" onDone={close} onGripe={setGripe} />  // passkeys made under that rp.id
 * @example <PasskeyUnlockButton gating={gating} autoFocus onDone={close} onGripe={setGripe} />  // the dialog's first choice
 */
export const PasskeyUnlockButton = (props: PasskeyUnlockButtonProps) => (
  <Boundary key={useRoundFor(props.gating)} fallback={null} onCaught={() => { props.onGripe(Messages.passkeyTrouble) }}>
    <PasskeyPress {...props} />
  </Boundary>
)

/** What PasskeyUnlockButton is handed. */
type PasskeyUnlockButtonProps = {
  /** The gating the passkey answers, as the vault handed it to `requestCleartext`. */
  gating:     UnlockVaultGating
  /** Called once the gating is answered: 'unlocked', or 'declined' for a refusal that closes the dialog. */
  onDone:     (answer: 'unlocked' | 'declined') => void
  /** What the button has to say: a calm message, or null when what it said last no longer stands. */
  onGripe:    (gripe: string | null) => void
  rpId?:      string | undefined
  /** Whether the button takes the focus when it first shows: true where it is the first choice. */
  autoFocus?: boolean | undefined
}

/** Whether the button shows for a vault as `snapshot` shows it: the browser offers WebAuthn, and the vault's gate has a passkey. */
export const offersPasskey = (snapshot: VaultSnapshot): boolean => (
  passkeysAvailable() && (snapshot.gate?.passkey ?? null) !== null
)

/** The button itself, inside PasskeyUnlockButton's boundary. */
const PasskeyPress = ({ gating, onDone, onGripe, rpId, autoFocus }: PasskeyUnlockButtonProps) => {
  const snapshot = useSyncExternalStore(gating.vault.subscribe, gating.vault.getSnapshot)
  const [asking, setAsking] = useState(false)
  // Wrapped, so that a rejection carrying any value at all still reads as "failed".
  const [failure, setFailure] = useState<{ err: unknown } | null>(null)
  // Gone on through after each await: a button gone meanwhile -- its dialog went, or another vault
  // remounted it -- unlocks nothing, and touches neither its state nor its dialog's callbacks
  // again. One hidden meanwhile goes on once it shows again.
  const whenShown = useWhenShown()
  if (failure !== null) { throw forBoundary(failure.err, 'PasskeyUnlockButton') }
  if (! offersPasskey(snapshot)) { return null }

  const press = async () => {
    setAsking(true)
    onGripe(null)
    try {
      const passkey = await askPasskey(snapshot.gate, { rpId })
      if (passkey === null) { await whenShown(() => { setAsking(false) }); return }
      const { ok, err } = await whenShown(() => gating.attemptPasskey(passkey))
      await whenShown(() => {
        setAsking(false)
        if (ok) { onDone('unlocked'); return }
        heard(err)
      })
    } catch (err) {
      await whenShown(() => {
        setAsking(false)
        heard(err)
      })
    }
  }

  /** What the attempt, or the authenticator asked before it, refused with. */
  const heard = (err: unknown) => {
    const flavor = attemptRefusalFlavor(err)
    // Pressed while a passphrase attempt runs: that attempt answers for the dialog.
    if (flavor === 'in_flight') { return }
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
