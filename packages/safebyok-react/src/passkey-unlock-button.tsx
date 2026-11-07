import { useState } from 'react'
import type { AnyGating, Gating } from 'safebyok'
import { attemptRefusalFlavor } from './attempt-refusals'
import { Boundary, forBoundary, useRoundFor } from './boundary'
import { Messages } from './messages'
import { askPasskey, attemptOnce, passkeysAvailable } from './passkey'
import { useWhenShown } from './when-shown'

/** A button that unlocks with the vault's passkey, rendered only when the gate holds one and the browser offers WebAuthn, so a dialog may place it unconditionally.
 *
 * @example <PasskeyUnlockButton gating={gating} onDone={close} onGripe={setGripe} />
 */
export const PasskeyUnlockButton = (props: PasskeyUnlockButtonProps) => (
  <Boundary key={useRoundFor(props.gating)} fallback={null} onCaught={() => { props.onGripe(Messages.passkeyTrouble) }}>
    <PasskeyPress {...props} />
  </Boundary>
)

/** What PasskeyUnlockButton is handed. */
export type PasskeyUnlockButtonProps = {
  /** The gating the passkey answers, as the bank handed it to `requestCleartext`. */
  gating:      Gating<'unlock_vault'>
  /** Called once the gating is answered: 'unlocked', or 'declined' for a refusal that closes the dialog. */
  onDone:      (answer: 'unlocked' | 'declined') => void
  /** What the button has to say: a calm message, or null when what it said last no longer stands. */
  onGripe:     (gripe: string | null) => void
  /** The relying party the passkey was made under, if not the page's own domain. */
  rpId?:       string | undefined
  /** Whether the button takes the focus when it first shows: true where it is the dialog's first choice. */
  takesFocus?: boolean | undefined
}

/** True when the button shows for `gating`: the browser offers WebAuthn, and the gate held a passkey as the gating was raised. */
export const offersPasskey = (gating: AnyGating): boolean => (
  passkeysAvailable() && gating.passkeyHeader?.wayinkind === 'passkey'
)

/** The button itself, inside PasskeyUnlockButton's boundary. */
const PasskeyPress = ({ gating, onDone, onGripe, rpId, takesFocus }: PasskeyUnlockButtonProps) => {
  const [asking, setAsking] = useState(false)
  // Wrapped, so that a rejection carrying any value at all still reads as "failed".
  const [failure, setFailure] = useState<{ err: unknown } | null>(null)
  // A button gone meanwhile unlocks nothing, and touches neither its state nor its dialog's
  // callbacks again. One hidden meanwhile goes on once it shows again.
  const { whenShown, isShown } = useWhenShown()
  if (failure !== null) { throw forBoundary(failure.err, 'PasskeyUnlockButton') }
  if (! offersPasskey(gating)) { return null }

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

  const press = async () => {
    setAsking(true)
    onGripe(null)
    try {
      const passkeyClear = await askPasskey(gating.passkeyHeader, { rpId })
      // An answer is as good as the passphrase, so it is tried now or never: one that comes back
      // while the button is hidden is zeroed untried, never kept for it to show again.
      if (passkeyClear !== null && ! isShown()) { passkeyClear.prfBytes.fill(0) }
      if (passkeyClear === null || ! isShown()) { await whenShown(() => { setAsking(false) }); return }
      const { ok, err } = await attemptOnce(passkeyClear, (passkey) => gating.attempt({ passkeyClear: passkey }))
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

  return (
    // eslint-disable-next-line jsx-a11y/no-autofocus -- only where a dialog makes the passkey its first choice: the WAI-ARIA dialog pattern moves focus to a dialog's first control
    <button type="button" autoFocus={takesFocus} disabled={asking} onClick={() => { void press() }}>
      {Messages.passkeyButton}
    </button>
  )
}
