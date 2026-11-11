import { useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import type { AnyGating } from 'safebyok'
import { gripeOfRefusal } from '../helpers/attempt-refusals'
import { Messages } from '../helpers/messages'
import { askPasskey, attemptOnce, passkeysAvailable } from '../helpers/passkey'
import { Boundary } from '../provider/boundary'
import type { PasskeyUnlockButtonProps } from '../shapes'

/**
 * A button that unlocks with the vault's passkey, shown only where a passkey can be used.
 * @example <PasskeyUnlockButton gating={gating} onGripe={setGripe} />
 */
export const PasskeyUnlockButton = (props: PasskeyUnlockButtonProps) => (
  <Boundary key={props.gating.gatingTok} fallback={null} onCaught={() => { props.onGripe(Messages.passkeyTrouble) }}>
    <PasskeyPress {...props} />
  </Boundary>
)

/** True when the passkey button shows for `gating`. */
export const offersPasskey = (gating: AnyGating): boolean => (
  passkeysAvailable() && gating.passkeyHeader?.wayinkind === 'passkey'
)

const PasskeyPress = ({ gating, onGripe, rpId, takesFocus }: PasskeyUnlockButtonProps) => {
  const [isAsking, startAsking] = useTransition()
  // False outside a form, as for a host's own dialog.
  const { pending: isFormPending } = useFormStatus()
  if (! offersPasskey(gating)) { return null }

  const hear = (err: unknown) => {
    const gripe = gripeOfRefusal(gating, err, 'PasskeyUnlockButton')
    if (gripe !== null) { onGripe(gripe.text) }
  }

  const askAndAttempt = async () => {
    ;(globalThis as { __diag?: (what: string) => void }).__diag?.('passkey askAndAttempt starts')
    try {
      const answer = await askPasskey(gating.passkeyHeader, { rpId })
      ;(globalThis as { __diag?: (what: string) => void }).__diag?.(`passkey askPasskey answered ${answer === null ? 'null' : 'an answer'}`)
      if (answer === null) { return }
      const { ok, err } = await attemptOnce(answer, (passkeyClear) => gating.attempt({ passkeyClear }))
      if (! ok) { hear(err) }
    } catch (err) {
      ;(globalThis as { __diag?: (what: string) => void }).__diag?.('passkey askAndAttempt caught')
      hear(err)
    } finally {
      ;(globalThis as { __diag?: (what: string) => void }).__diag?.('passkey askAndAttempt settles')
    }
  }

  // Inside the transition, what hear throws reaches the Boundary above.
  const press = () => {
    if (isAsking || isFormPending) { return }
    onGripe(null)
    startAsking(askAndAttempt)
  }

  return (
    // aria-disabled, not disabled: a disabled button drops the focus, and the user's place in the dialog with it.
    // eslint-disable-next-line jsx-a11y/no-autofocus -- only where a dialog makes the passkey its first choice: the WAI-ARIA dialog pattern moves focus to a dialog's first control
    <button type="button" autoFocus={takesFocus} aria-disabled={isAsking || isFormPending} onClick={press}>
      {Messages.passkeyButton}
    </button>
  )
}
