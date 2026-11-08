import { useState } from 'react'
import type { AnyGating } from 'safebyok'
import { attemptRefusalFlavor } from '../helpers/attempt-refusals'
import { Messages } from '../helpers/messages'
import { askPasskey, attemptOnce, passkeysAvailable } from '../helpers/passkey'
import { useRoundFor } from '../hooks/round-for'
import { useWhenShown } from '../hooks/when-shown'
import { Boundary, forBoundary } from '../provider/boundary'
import type { PasskeyUnlockButtonProps } from '../shapes'

/** A button that unlocks with the vault's passkey, shown only where a passkey can be used. */
export const PasskeyUnlockButton = (props: PasskeyUnlockButtonProps) => (
  <Boundary key={useRoundFor(props.gating)} fallback={null} onCaught={() => { props.onGripe(Messages.passkeyTrouble) }}>
    <PasskeyPress {...props} />
  </Boundary>
)

/** True when the passkey button shows for `gating`. */
export const offersPasskey = (gating: AnyGating): boolean => (
  passkeysAvailable() && gating.passkeyHeader?.wayinkind === 'passkey'
)

const PasskeyPress = ({ gating, onDone, onGripe, rpId, takesFocus }: PasskeyUnlockButtonProps) => {
  const [asking, setAsking] = useState(false)
  // The error rides in an object, so a thrown null or undefined still reads as a failure.
  const [failure, setFailure] = useState<{ err: unknown } | null>(null)
  const { whenShown, isShown } = useWhenShown()
  if (failure !== null) { throw forBoundary(failure.err, 'PasskeyUnlockButton') }
  if (! offersPasskey(gating)) { return null }

  const heard = (err: unknown) => {
    const flavor = attemptRefusalFlavor(err)
    if (flavor === 'in_flight') { return }
    if (flavor === 'close') { onDone('declined'); return }
    // Thrown from an event handler it would miss the boundary, so it is rethrown in render.
    if (flavor === 'trouble') { setFailure({ err }); return }
    onGripe((err as Error).message)
  }

  const press = async () => {
    if (asking) { return }
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
    // aria-disabled, not disabled: a disabled button drops the focus, and the dialog's Escape with it,
    // to the page's body, where the browser returns it once its prompt is dismissed.
    // eslint-disable-next-line jsx-a11y/no-autofocus -- only where a dialog makes the passkey its first choice: the WAI-ARIA dialog pattern moves focus to a dialog's first control
    <button type="button" autoFocus={takesFocus} aria-disabled={asking} onClick={() => { void press() }}>
      {Messages.passkeyButton}
    </button>
  )
}
