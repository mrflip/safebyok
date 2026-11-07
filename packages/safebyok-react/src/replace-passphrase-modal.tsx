import { useRef } from 'react'
import type { Gating } from 'safebyok'
import { useRoundFor } from './boundary'
import { Messages } from './messages'
import { AnsweringOnce, ConfirmField, ModalForm, PassphraseField, UsernameField, useAdvice, useAttempts, useConfirmation, type DialogAnswer, type PassphraseAdvice } from './modal'

/** The dialog for a `replace_passphrase` gating, which proves the passphrase in use and chooses the next. */
export const ReplacePassphraseModal = (props: ReplacePassphraseModalProps) => (
  <AnsweringOnce key={useRoundFor(props.gating)} gating={props.gating} onDone={props.onDone}>
    {(done) => <ReplacePassphraseForm {...props} onDone={done} />}
  </AnsweringOnce>
)

/** What ReplacePassphraseModal is handed. */
export type ReplacePassphraseModalProps = {
  /** The gating the dialog answers, as the bank handed it to `requestCleartext`. */
  gating:              Gating<'replace_passphrase'>
  /** Called once, with the dialog's answer: 'unlocked' once the passphrase is replaced, 'declined' otherwise. */
  onDone:              (answer: DialogAnswer) => void
  /** What a password manager files the passphrase under. Default: the user and the vault, as 'u1 (main vault)'. */
  passphraseUsername?: string | undefined
  /** What to say beside the new passphrase's field as the user chooses it. Default: the bank's strength checker's reason. */
  passphraseAdvice?:   PassphraseAdvice | undefined
}

/** The dialog itself, inside ReplacePassphraseModal's boundary: its `onDone` is the one answer, `AnsweringOnce`'s. */
const ReplacePassphraseForm = ({ gating, onDone: done, passphraseUsername, passphraseAdvice }: ReplacePassphraseModalProps) => {
  const { gripe, setGripe, fail, attempt } = useAttempts('ReplacePassphraseModal', done)
  const anteRef = useRef<HTMLInputElement>(null)
  const nextRef = useRef<HTMLInputElement>(null)
  const { ref: confirmRef, gripeId, differs } = useConfirmation(setGripe)
  // The host's advice heard the passphrase: what it threw may quote it, so none of it goes on but safebyok's own refusal.
  const advice = useAdvice(passphraseAdvice, gating, true, fail)

  const submit = () => {
    const nextPassphraseClear = nextRef.current?.value ?? ''
    // A new passphrase mistyped would be the vault's: refused here, before any key is derived.
    if (differs(nextPassphraseClear)) { return }
    void attempt(() => gating.attempt({ antePassphraseClear: anteRef.current?.value ?? '', nextPassphraseClear }), 'unlocked')
  }

  /** Each change to a field: a gripe about what was typed before goes. */
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
