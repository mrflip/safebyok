import { useRef } from 'react'
import { PasskeyUnlockButton, offersPasskey } from '../components/passkey-unlock-button'
import { Messages } from '../helpers/messages'
import type { PassphraseModalProps } from '../shapes'
import { AnsweringOnce, ConfirmField, ModalForm, PassphraseField, UsernameField, holdsFocus, unlockedFor, useAdvice, useAttempts, useConfirmation } from './modal-kit'

/** The passphrase dialog for a `build_vault` or an `unlock_vault` gating. */
export const PassphraseModal = (props: PassphraseModalProps) => (
  <AnsweringOnce key={props.gating.gatingTok} gating={props.gating} onDone={props.onDone}>
    {(done) => <PassphraseForm {...props} onDone={done} />}
  </AnsweringOnce>
)

const PassphraseForm = ({ gating, onDone: done, leaseMillis, passphraseUsername, passkeyRpId }: PassphraseModalProps) => {
  const { gripe, setGripe, fail, attempt } = useAttempts('PassphraseModal', done)
  const fieldRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const { ref: confirmRef, gripeId, differs } = useConfirmation(setGripe)
  const creating = gating.gatingkind === 'build_vault'
  const advice = useAdvice(gating, creating, fail)
  const passkeyGating = gating.gatingkind === 'unlock_vault' && offersPasskey(gating) ? gating : null

  const submit = () => {
    const typed = fieldRef.current?.value ?? ''
    if (creating && differs(typed)) { return }
    void attempt(() => gating.attempt({ passphraseClear: typed }), 'unlocked')
  }

  const hearPassphrase = (typed: string) => {
    setGripe((prev) => (prev?.fromPasskey === true ? prev : null))
    if (creating) { void advice.hear(typed) }
  }

  const passkeyGripe = (text: string | null) => {
    setGripe(text === null ? null : { text, fromPasskey: true })
    // A passkey button that took itself away took the focus with it, so the focus goes back to the passphrase field.
    if (text !== null && ! holdsFocus(formRef.current)) { fieldRef.current?.focus() }
  }

  return (
    <ModalForm
      title={creating ? Messages.chooseTitle : Messages.unlockTitle}
      blurb={creating ? Messages.chooseBlurb : Messages.unlockBlurb}
      submitWord={creating ? Messages.createButton : Messages.unlockButton}
      gripe={gripe}
      gripeId={gripeId}
      footnote={leaseMillis === undefined ? undefined : unlockedFor(leaseMillis, creating)}
      formRef={formRef}
      done={done}
      onSubmit={submit}
    >
      {passkeyGating !== null && <PasskeyUnlockButton gating={passkeyGating} rpId={passkeyRpId} takesFocus onDone={done} onGripe={passkeyGripe} />}
      <UsernameField username={passphraseUsername ?? Messages.passphraseUsername(gating.user_id, gating.vaultlabel)} />
      <PassphraseField
        ref={fieldRef}
        credential={creating ? 'new-password' : 'current-password'}
        fieldlabel={Messages.passphraseField}
        takesFocus={passkeyGating === null}
        advice={creating ? advice.said : undefined}
        onChange={hearPassphrase}
      />
      {creating && <ConfirmField ref={confirmRef} gripeId={gripeId} fieldlabel={Messages.confirmField} gripe={gripe} onChange={() => { setGripe(null) }} />}
    </ModalForm>
  )
}
