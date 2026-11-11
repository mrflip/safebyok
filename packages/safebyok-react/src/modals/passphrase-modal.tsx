import { useRef, useState } from 'react'
import type { Gating } from 'safebyok'
import { PasskeyUnlockButton, offersPasskey } from '../components/passkey-unlock-button'
import { Messages } from '../helpers/messages'
import type { PassphraseModalProps } from '../shapes'
import { ChosenPassphraseFields, DialogBoundary, ModalForm, PassphraseField, UsernameField, holdsFocus, textOf, unlockedFor, useAttemptAction, useChosenPassphrase } from './modal-kit'

/** The passphrase dialog for a `build_vault` or an `unlock_vault` gating. */
export const PassphraseModal = (props: PassphraseModalProps) => (
  <DialogBoundary key={props.gating.gatingTok} gating={props.gating}>
    {props.gating.gatingkind === 'build_vault' ? <BuildForm {...props} gating={props.gating} /> : <UnlockForm {...props} gating={props.gating} />}
  </DialogBoundary>
)

const BuildForm = ({ gating, leaseMillis, passphraseUsername }: PassphraseModalProps & { gating: Gating<'build_vault'> }) => {
  const { chosenRef, confirmRef, ...chosen } = useChosenPassphrase(gating, 'PassphraseModal')
  const { gripe, gripeId, action } = useAttemptAction(
    gating,
    'PassphraseModal',
    (form) => gating.attempt({ passphraseClear: textOf(form, 'new-password') }),
    () => chosenRef,
  )
  return (
    <ModalForm
      gating={gating}
      title={Messages.chooseTitle}
      blurb={Messages.chooseBlurb}
      submitWord={Messages.createButton}
      pendingWord={Messages.creatingButton}
      isSubmittable={chosen.isSubmittable}
      gripeText={gripe?.text ?? null}
      gripeId={gripeId}
      footnote={leaseMillis === undefined ? undefined : unlockedFor(leaseMillis, true)}
      action={action}
      onReset={chosen.forget}
    >
      <UsernameField username={passphraseUsername ?? Messages.passphraseUsername(gating.user_id, gating.vaultlabel)} />
      <ChosenPassphraseFields chosen={chosen} chosenRef={chosenRef} confirmRef={confirmRef} chosenLabel={Messages.passphraseField} confirmLabel={Messages.confirmField} chosenInvalidBy={gripe === null ? undefined : gripeId} />
    </ModalForm>
  )
}

const UnlockForm = ({ gating, leaseMillis, passphraseUsername, passkeyRpId }: PassphraseModalProps & { gating: Gating<'unlock_vault'> }) => {
  const fieldRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [passkeyGripe, setPasskeyGripe] = useState<string | null>(null)
  const { gripe, gripeId, action, isPending } = useAttemptAction(
    gating,
    'PassphraseModal',
    (form) => {
      setPasskeyGripe(null)
      return gating.attempt({ passphraseClear: textOf(form, 'current-password') })
    },
    () => fieldRef,
  )
  const offering = offersPasskey(gating)
  ;(globalThis as { __diag?: (what: string) => void }).__diag?.(`UnlockForm renders isPending=${String(isPending)} passkeyGripe=${passkeyGripe === null ? 'null' : 'set'}`)

  const hearPasskey = (text: string | null) => {
    setPasskeyGripe(text)
    // A passkey button that took itself away took the focus with it, so the focus goes back to the passphrase field.
    if (text !== null && ! holdsFocus(formRef.current)) { fieldRef.current?.focus() }
  }

  return (
    <ModalForm
      gating={gating}
      title={Messages.unlockTitle}
      blurb={Messages.unlockBlurb}
      submitWord={Messages.unlockButton}
      pendingWord={Messages.unlockingButton}
      // React commits the action's setPasskeyGripe(null) only once the attempt answers: the submit
      // takes the passkey's word away at once.
      gripeText={(isPending ? null : passkeyGripe) ?? gripe?.text ?? null}
      gripeId={gripeId}
      footnote={leaseMillis === undefined ? undefined : unlockedFor(leaseMillis, false)}
      formRef={formRef}
      action={action}
    >
      {offering && <PasskeyUnlockButton gating={gating} rpId={passkeyRpId} onGripe={hearPasskey} />}
      <UsernameField username={passphraseUsername ?? Messages.passphraseUsername(gating.user_id, gating.vaultlabel)} />
      <PassphraseField ref={fieldRef} fieldname="current-password" fieldlabel={Messages.passphraseField} invalidBy={gripe === null ? undefined : gripeId} />
    </ModalForm>
  )
}
