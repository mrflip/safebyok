import { useRef } from 'react'
import { Messages } from '../helpers/messages'
import type { ReplacePassphraseModalProps } from '../shapes'
import { AnsweringOnce, ConfirmField, ModalForm, PassphraseField, UsernameField, useAdvice, useAttempts, useConfirmation } from './modal-kit'

/** The dialog for a `replace_passphrase` gating, which proves the passphrase in use and chooses the next. */
export const ReplacePassphraseModal = (props: ReplacePassphraseModalProps) => (
  <AnsweringOnce key={props.gating.gatingTok} gating={props.gating} onDone={props.onDone}>
    {(done) => <ReplacePassphraseForm {...props} onDone={done} />}
  </AnsweringOnce>
)

const ReplacePassphraseForm = ({ gating, onDone: done, passphraseUsername, passphraseAdvice }: ReplacePassphraseModalProps) => {
  const { gripe, setGripe, fail, attempt } = useAttempts('ReplacePassphraseModal', done)
  const anteRef = useRef<HTMLInputElement>(null)
  const nextRef = useRef<HTMLInputElement>(null)
  const { ref: confirmRef, gripeId, differs } = useConfirmation(setGripe)
  const advice = useAdvice(passphraseAdvice, gating, true, fail)

  const submit = () => {
    const nextPassphraseClear = nextRef.current?.value ?? ''
    if (differs(nextPassphraseClear)) { return }
    void attempt(() => gating.attempt({ antePassphraseClear: anteRef.current?.value ?? '', nextPassphraseClear }), 'unlocked')
  }

  const forgetGripe = () => { setGripe(null) }

  return (
    <ModalForm
      title={Messages.changeTitle}
      blurb={Messages.changeBlurb}
      submitWord={Messages.changeButton}
      gripe={gripe}
      gripeId={gripeId}
      done={done}
      onSubmit={submit}
    >
      <UsernameField username={passphraseUsername ?? Messages.passphraseUsername(gating.user_id, gating.vaultlabel)} />
      <PassphraseField ref={anteRef} credential="current-password" fieldlabel={Messages.currentField} takesFocus onChange={forgetGripe} />
      <PassphraseField
        ref={nextRef}
        credential="new-password"
        fieldlabel={Messages.newField}
        takesFocus={false}
        advice={advice.said}
        onChange={(typed) => { forgetGripe(); void advice.hear(typed) }}
      />
      <ConfirmField ref={confirmRef} gripeId={gripeId} fieldlabel={Messages.confirmNewField} gripe={gripe} onChange={forgetGripe} />
    </ModalForm>
  )
}
