import { useRef } from 'react'
import { Messages } from '../helpers/messages'
import type { DelBankModalProps } from '../shapes'
import { DialogBoundary, ModalForm, PassphraseField, UsernameField, textOf, useAttemptAction } from './modal-kit'

/** Render the dialog for a `del_bank` gating: the user enters the passphrase to delete the bank, every vault in it and their boxes. */
export function DelBankModal(props: Readonly<DelBankModalProps>) {
  return (
    <DialogBoundary key={props.gating.gatingTok} gating={props.gating}>
      <DelBankForm {...props} />
    </DialogBoundary>
  )
}

function DelBankForm({ gating, passphraseUsername }: Readonly<DelBankModalProps>) {
  const fieldRef = useRef<HTMLInputElement>(null)
  const { gripe, gripeId, action } = useAttemptAction(
    gating,
    'DelBankModal',
    (form) => gating.attempt({ passphraseClear: textOf(form, 'current-password') }),
    () => fieldRef,
  )

  return (
    <ModalForm
      onCancel={() => { gating.dismiss() }}
      title={Messages.delBankTitle}
      blurb={Messages.delBankBlurb}
      submitWord={Messages.delBankButton}
      pendingWord={Messages.deletingButton}
      gripeText={gripe?.text ?? null}
      gripeId={gripeId}
      action={action}
    >
      <UsernameField username={passphraseUsername ?? Messages.passphraseUsername(gating.user_id, gating.banklabel)} />
      <PassphraseField ref={fieldRef} fieldname="current-password" fieldlabel={Messages.passphraseField} invalidBy={gripe === null ? undefined : gripeId} />
    </ModalForm>
  )
}
