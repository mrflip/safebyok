import { useRef } from 'react'
import { Messages } from '../helpers/messages'
import type { DelVaultModalProps } from '../shapes'
import { DialogBoundary, ModalForm, PassphraseField, UsernameField, textOf, useAttemptAction } from './modal-kit'

/** Render the dialog for a `del_vault` gating: the user enters the vault's passphrase to delete the vault. */
export const DelVaultModal = (props: DelVaultModalProps) => (
  <DialogBoundary key={props.gating.gatingTok} gating={props.gating}>
    <DelVaultForm {...props} />
  </DialogBoundary>
)

const DelVaultForm = ({ gating, passphraseUsername }: DelVaultModalProps) => {
  const fieldRef = useRef<HTMLInputElement>(null)
  const { gripe, gripeId, action } = useAttemptAction(
    gating,
    'DelVaultModal',
    (form) => gating.attempt({ passphraseClear: textOf(form, 'current-password') }),
    () => fieldRef,
  )

  return (
    <ModalForm
      gating={gating}
      title={Messages.delVaultTitle}
      blurb={Messages.delVaultBlurb}
      submitWord={Messages.delVaultButton}
      pendingWord={Messages.deletingButton}
      gripeText={gripe?.text ?? null}
      gripeId={gripeId}
      action={action}
    >
      <UsernameField username={passphraseUsername ?? Messages.passphraseUsername(gating.user_id, gating.vaultlabel)} />
      <PassphraseField ref={fieldRef} fieldname="current-password" fieldlabel={Messages.passphraseField} invalidBy={gripe === null ? undefined : gripeId} />
    </ModalForm>
  )
}
