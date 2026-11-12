import { useRef } from 'react'
import type { PasskeyAnswer } from 'safebyok'
import { Messages } from '../helpers/messages'
import { attemptThenZero, createPasskey } from '../helpers/passkey'
import type { AddPasskeyModalProps } from '../shapes'
import { DialogBoundary, ModalForm, PassphraseField, UsernameField, textOf, useAttemptAction } from './modal-kit'

/** Render the dialog for an `add_passkey` gating: the user enters the vault's passphrase, then creates a passkey that is added to the vault. */
export const AddPasskeyModal = (props: AddPasskeyModalProps) => (
  <DialogBoundary key={props.gating.gatingTok} gating={props.gating}>
    <AddPasskeyForm {...props} />
  </DialogBoundary>
)

const AddPasskeyForm = ({ gating, passphraseUsername, passkeyRpId }: AddPasskeyModalProps) => {
  const fieldRef = useRef<HTMLInputElement>(null)
  const username = passphraseUsername ?? Messages.passphraseUsername(gating.user_id, gating.banklabel)

  const addPasskey = async (form: FormData) => {
    const passphraseClear = textOf(form, 'current-password')
    let made: PasskeyAnswer | null
    try {
      made = await createPasskey({ rp: { name: gating.banklabel, id: passkeyRpId }, user: { name: username, displayName: username } })
    } catch (err) {
      return { ok: false, err }
    }
    if (made === null) { return null }
    return attemptThenZero(made, (passkeyClear) => gating.attempt({ passphraseClear, passkeyClear }))
  }

  const { gripe, gripeId, action } = useAttemptAction(gating, 'AddPasskeyModal', addPasskey, () => fieldRef)

  return (
    <ModalForm
      onCancel={() => { gating.dismiss() }}
      title={Messages.addPasskeyTitle}
      blurb={Messages.addPasskeyBlurb}
      submitWord={Messages.addPasskeyButton}
      pendingWord={Messages.addingPasskeyButton}
      gripeText={gripe?.text ?? null}
      gripeId={gripeId}
      action={action}
    >
      <UsernameField username={username} />
      <PassphraseField ref={fieldRef} fieldname="current-password" fieldlabel={Messages.passphraseField} invalidBy={gripe === null ? undefined : gripeId} />
    </ModalForm>
  )
}
