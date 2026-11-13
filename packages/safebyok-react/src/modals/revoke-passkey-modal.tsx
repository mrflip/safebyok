import { useRef } from 'react'
import { Messages } from '../helpers/messages'
import type { RevokePasskeyModalProps } from '../shapes'
import { DialogBoundary, ModalForm, PassphraseField, UsernameField, textOf, useAttemptAction } from './modal-kit'

/** Render the dialog for a `revoke_passkey` gating: the user enters the bank's passphrase to remove its passkey. */
export const RevokePasskeyModal = (props: RevokePasskeyModalProps) => (
  <DialogBoundary key={props.gating.gatingTok} gating={props.gating}>
    <RevokePasskeyForm {...props} />
  </DialogBoundary>
)

const RevokePasskeyForm = ({ gating, passphraseUsername }: RevokePasskeyModalProps) => {
  const fieldRef = useRef<HTMLInputElement>(null)
  const { gripe, gripeId, action } = useAttemptAction(
    gating,
    'RevokePasskeyModal',
    (form) => gating.attempt({ passphraseClear: textOf(form, 'current-password') }),
    () => fieldRef,
  )

  return (
    <ModalForm
      onCancel={() => { gating.dismiss() }}
      title={Messages.revokePasskeyTitle}
      blurb={Messages.revokePasskeyBlurb}
      submitWord={Messages.revokePasskeyButton}
      pendingWord={Messages.removingButton}
      gripeText={gripe?.text ?? null}
      gripeId={gripeId}
      action={action}
    >
      <UsernameField username={passphraseUsername ?? Messages.passphraseUsername(gating.user_id, gating.banklabel)} />
      <PassphraseField ref={fieldRef} fieldname="current-password" fieldlabel={Messages.passphraseField} invalidBy={gripe === null ? undefined : gripeId} />
    </ModalForm>
  )
}
