import { useRef } from 'react'
import type { Gating } from 'safebyok'
import { useRoundFor } from './boundary'
import { Messages } from './messages'
import { AnsweringOnce, ModalForm, PassphraseField, UsernameField, useAttempts, type DialogAnswer } from './modal'

/** The dialog for a `revoke_passkey` gating, which removes the vault's passkey once the user proves its passphrase. */
export const RevokePasskeyModal = (props: RevokePasskeyModalProps) => (
  <AnsweringOnce key={useRoundFor(props.gating)} gating={props.gating} onDone={props.onDone}>
    {(done) => <RevokePasskeyForm {...props} onDone={done} />}
  </AnsweringOnce>
)

/** What RevokePasskeyModal is handed. */
export type RevokePasskeyModalProps = {
  /** The gating the dialog answers, as the bank handed it to `requestCleartext`. */
  gating:              Gating<'revoke_passkey'>
  /** Called once, with the dialog's answer: 'unlocked' once the passkey is removed, 'declined' otherwise. */
  onDone:              (answer: DialogAnswer) => void
  /** What a password manager files the passphrase under. */
  passphraseUsername?: string | undefined
}

/** The dialog itself, inside RevokePasskeyModal's boundary. */
const RevokePasskeyForm = ({ gating, onDone: done, passphraseUsername }: RevokePasskeyModalProps) => {
  const { gripe, setGripe, attempt } = useAttempts('RevokePasskeyModal', done)
  const fieldRef = useRef<HTMLInputElement>(null)

  const submit = () => {
    void attempt(() => gating.attempt({ passphraseClear: fieldRef.current?.value ?? '' }), 'unlocked')
  }

  return (
    <ModalForm
      title={Messages.revokePasskeyTitle}
      blurb={Messages.revokePasskeyBlurb}
      submitWord={Messages.revokePasskeyButton}
      gripe={gripe}
      done={done}
      onSubmit={submit}
    >
      <UsernameField username={passphraseUsername ?? Messages.passphraseUsername(gating.user_id, gating.vaultlabel)} />
      <PassphraseField ref={fieldRef} credential="current-password" fieldlabel={Messages.passphraseField} takesFocus onChange={() => { setGripe(null) }} />
    </ModalForm>
  )
}
