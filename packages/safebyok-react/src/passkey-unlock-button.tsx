import { useState, useSyncExternalStore } from 'react'
import { isVaultCondition, isVaultError, type Vault, type VaultSnapshot } from 'safebyok'
import { Boundary, useRoundFor } from './boundary'
import { Messages } from './messages'
import { useIsMounted } from './is-mounted'
import { askPasskey, passkeysAvailable } from './passkey'

/**
 * A button that unlocks the vault with one of its passkeys: rendered only when the vault has one
 * and the browser offers WebAuthn, so a dialog can place it beside its passphrase field
 * unconditionally. `PassphraseModal` does, first, ahead of the field. A press asks the user to
 * touch a passkey, then unlocks with its answer. It follows the vault's snapshot as it changes:
 * a passkey added on another device brings the button, one removed takes it away. Handed another
 * vault, it starts afresh. Taken away, it lets go: a press still under way finishes unheard,
 * unlocking with no passkey touched after, and calling `onDone` and `onGripe` no more.
 *
 * `onDone(true)` once unlocked; `onDone(false)` when a `lock()` called meanwhile wins, as the
 * passphrase dialog does. Each press first tells `onGripe(null)`: whatever the button said before
 * no longer stands. A dismissed prompt then does nothing more; a condition (a wrong or removed
 * passkey, an authenticator without PRF) goes to `onGripe` with its calm message, for the dialog
 * to show. Anything else -- misuse, such as an `rpId` that does not fit the page or a closed
 * vault handle, or a failure that is no VaultError -- never reaches the host's page: the button
 * takes itself away, `onGripe` hears "Your passkey can't be used here just now. Unlock with your
 * passphrase instead.", and React reports the error through the root's `onCaughtError` (the
 * console, by default, with the component stack), where the developer and an error tracker meet
 * it. Focus the button held falls to the page then: a dialog of the host's own moves it to its
 * passphrase field, as `PassphraseModal` does.
 *
 * @example <PasskeyUnlockButton vault={vault} onDone={close} onGripe={setGripe} />
 * @example <PasskeyUnlockButton vault={vault} rpId="acme.example" onDone={close} onGripe={setGripe} />  // passkeys made under that rp.id
 * @example <PasskeyUnlockButton vault={vault} autoFocus onDone={close} onGripe={setGripe} />  // the dialog's first choice
 */
export const PasskeyUnlockButton = (props: PasskeyUnlockButtonProps) => (
  <Boundary key={useRoundFor(props.vault)} fallback={null} onCaught={() => { props.onGripe(Messages.passkeyTrouble) }}>
    <PasskeyPress {...props} />
  </Boundary>
)

/** What PasskeyUnlockButton is handed. */
type PasskeyUnlockButtonProps = {
  vault:      Vault
  onDone:     (unlocked: boolean) => void
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
const PasskeyPress = ({ vault, onDone, onGripe, rpId, autoFocus }: PasskeyUnlockButtonProps) => {
  const snapshot = useSyncExternalStore(vault.subscribe, vault.getSnapshot)
  const [asking, setAsking] = useState(false)
  // Wrapped, so that a rejection carrying any value at all still reads as "failed".
  const [failure, setFailure] = useState<{ err: unknown } | null>(null)
  // Asked after each await: a button gone meanwhile -- its dialog went, or another vault remounted
  // it -- unlocks nothing, and touches neither its state nor its dialog's callbacks again.
  const isMounted = useIsMounted()
  if (failure !== null) { throw failure.err }
  if (! offersPasskey(snapshot)) { return null }

  const press = async () => {
    setAsking(true)
    onGripe(null)
    try {
      const passkey = await askPasskey(snapshot.wayins, { rpId })
      if (passkey === null || ! isMounted()) { return }
      const { ok, err } = await vault.tryUnlock(passkey)
      if (! isMounted()) { return }
      if (ok) { onDone(true); return }
      heard(err)
    } catch (err) {
      if (isMounted()) { heard(err) }
    } finally {
      if (isMounted()) { setAsking(false) }
    }
  }

  /** What the unlock, or the authenticator asked before it, refused with. */
  const heard = (err: unknown) => {
    // The vault was locked while this unlock was under way, and the lock wins: as if dismissed.
    if (isVaultError(err, 'vault_locked')) { onDone(false); return }
    if (isVaultCondition(err)) { onGripe(err.message); return }
    // Misuse, or no VaultError at all: rethrown in render, for PasskeyUnlockButton's boundary.
    setFailure({ err })
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-autofocus -- only where a dialog makes the passkey its first choice: the WAI-ARIA dialog pattern moves focus to a dialog's first control
    <button type="button" autoFocus={autoFocus} disabled={asking} onClick={() => { void press() }}>
      {Messages.passkeyButton}
    </button>
  )
}
