import { useRef } from 'react'
import { Messages } from '../helpers/messages'
import { useRoundFor } from '../hooks/round-for'
import type { DelVaultModalProps } from '../shapes'
import { AnsweringOnce, ModalForm, PassphraseField, UsernameField, useAttempts } from './modal-kit'

/** The dialog for a `del_vault` gating, which deletes the vault once the user proves its passphrase. */
export const DelVaultModal = (props: DelVaultModalProps) => (
  <AnsweringOnce key={useRoundFor(props.gating)} gating={props.gating} onDone={props.onDone}>
    {(done) => <DelVaultForm {...props} onDone={done} />}
  </AnsweringOnce>
)

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
