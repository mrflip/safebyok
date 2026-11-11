import { useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import type { AnyGating } from 'safebyok'
import { gripeOfRefusal } from '../helpers/attempt-refusals'
import { Messages } from '../helpers/messages'
import { askPasskey, attemptThenZero, passkeysAvailable } from '../helpers/passkey'
import { Boundary } from '../provider/boundary'
import type { PasskeyUnlockButtonProps } from '../shapes'

/** Render a button that unlocks the vault with its passkey. It renders nothing where a passkey cannot be used.
 * @example <PasskeyUnlockButton gating={gating} onGripe={setGripe} />
 */
export const PasskeyUnlockButton = (props: PasskeyUnlockButtonProps) => (
  <Boundary key={props.gating.gatingTok} fallback={null} onCaught={() => { props.onGripe(Messages.passkeyTrouble) }}>
    <PasskeyPress {...props} />
  </Boundary>
)

/** True when this browser supports passkeys and `gating`'s vault has one. */
export const offersPasskey = (gating: AnyGating): boolean => (
  passkeysAvailable() && gating.passkeyHeader?.wayinkind === 'passkey'
)

const PasskeyPress = ({ gating, onGripe, rpId, takesFocus }: PasskeyUnlockButtonProps) => {
  const [isAsking, startAsking] = useTransition()
  // `pending` is false when the button is outside a form, as in a host's own dialog.
  const { pending: isFormPending } = useFormStatus()
  if (! offersPasskey(gating)) { return null }

  const hear = (err: unknown) => {
    const gripe = gripeOfRefusal(gating, err, 'PasskeyUnlockButton')
    if (gripe !== null) { onGripe(gripe.text) }
  }

  const askAndAttempt = async () => {
    try {
      const answer = await askPasskey(gating.passkeyHeader, { rpId })
      if (answer === null) { return }
      const { ok, err } = await attemptThenZero(answer, (passkeyClear) => gating.attempt({ passkeyClear }))
      if (! ok) { hear(err) }
    } catch (err) {
      hear(err)
    }
  }

  // askAndAttempt runs inside the transition, so an error thrown by `hear` reaches the Boundary above.
  const press = () => {
    if (isAsking || isFormPending) { return }
    onGripe(null)
    startAsking(askAndAttempt)
  }

  return (
    // Use aria-disabled, not disabled: a disabled button loses focus, and the user loses their place in the dialog.
    // eslint-disable-next-line jsx-a11y/no-autofocus -- used only where a dialog offers the passkey first: the WAI-ARIA dialog pattern moves focus to a dialog's first control
    <button type="button" autoFocus={takesFocus} aria-disabled={isAsking || isFormPending} onClick={press}>
      {Messages.passkeyButton}
    </button>
  )
}
