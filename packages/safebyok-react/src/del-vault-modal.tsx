import { useRef } from 'react'
import type { Gating } from 'safebyok'
import { useRoundFor } from './boundary'
import { Messages } from './messages'
import { AnsweringOnce, ModalForm, PassphraseField, UsernameField, useAttempts, type DialogAnswer } from './modal'

/** The dialog for a `del_vault` gating, which deletes the vault once the user proves its passphrase. */
export const DelVaultModal = (props: DelVaultModalProps) => (
  <AnsweringOnce key={useRoundFor(props.gating)} gating={props.gating} onDone={props.onDone}>
    {(done) => <DelVaultForm {...props} onDone={done} />}
  </AnsweringOnce>
)

/** What DelVaultModal is handed. */
export type DelVaultModalProps = {
  /** The gating the dialog answers, as the bank handed it to `requestCleartext`. */
  gating:              Gating<'del_vault'>
  /** Called once, with the dialog's answer: 'deleted' once the vault is deleted, 'declined' otherwise. */
  onDone:              (answer: DialogAnswer) => void
  /** What a password manager files the passphrase under. */
  passphraseUsername?: string | undefined
}

/** The dialog itself, inside DelVaultModal's boundary. */
const DelVaultForm = ({ gating, onDone: done, passphraseUsername }: DelVaultModalProps) => {
  const { gripe, setGripe, attempt } = useAttempts('DelVaultModal', done)
  const fieldRef = useRef<HTMLInputElement>(null)

  const submit = () => {
    void attempt(() => gating.attempt({ passphraseClear: fieldRef.current?.value ?? '' }), 'deleted')
  }

  return (
    <ModalForm
      title={Messages.delVaultTitle}
      blurb={Messages.delVaultBlurb}
      submitWord={Messages.delVaultButton}
      gripe={gripe}
      done={done}
      onSubmit={submit}
    >
      <UsernameField username={passphraseUsername ?? Messages.passphraseUsername(gating.user_id, gating.vaultlabel)} />
      <PassphraseField ref={fieldRef} credential="current-password" fieldlabel={Messages.passphraseField} takesFocus onChange={() => { setGripe(null) }} />
    </ModalForm>
  )
}
