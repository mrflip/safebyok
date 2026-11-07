import { useRef } from 'react'
import type { Gating } from 'safebyok'
import { useRoundFor } from './boundary'
import { Messages } from './messages'
import { AnsweringOnce, ConfirmField, ModalForm, PassphraseField, UsernameField, unlockedFor, useAdvice, useAttempts, useConfirmation, type DialogAnswer, type PassphraseAdvice } from './modal'

/** The passphrase dialog for a `build_vault` gating, which chooses the vault's first passphrase, or an `unlock_vault` one. */
export const PassphraseModal = (props: PassphraseModalProps) => (
  <AnsweringOnce key={useRoundFor(props.gating)} gating={props.gating} onDone={props.onDone}>
    {(done) => <PassphraseForm {...props} onDone={done} />}
  </AnsweringOnce>
)

/** The gatings the passphrase dialog answers: a vault's build, and an unlock. */
export type PassphraseGating = Gating<'build_vault'> | Gating<'unlock_vault'>

/** What PassphraseModal is handed. */
export type PassphraseModalProps = {
  /** The gating the dialog answers, as the bank handed it to `requestCleartext`. */
  gating:              PassphraseGating
  /** Called once, with the dialog's answer: 'unlocked' once an attempt is ok, 'declined' otherwise. */
  onDone:              (answer: DialogAnswer) => void
  /** The bank's `leaseMillis`, for the line that says how long an unlock lasts; left out, the dialog says nothing of it. */
  leaseMillis?:        number | undefined
  /** What a password manager files the passphrase under. Default: the user and the vault, as 'u1 (main vault)'. */
  passphraseUsername?: string | undefined
  /** What to say beside the field as the user chooses a passphrase. Default: the bank's strength checker's reason. */
  passphraseAdvice?:   PassphraseAdvice | undefined
}

/** The dialog itself, inside PassphraseModal's boundary: its `onDone` is the one answer, `AnsweringOnce`'s. */
const PassphraseForm = ({ gating, onDone: done, leaseMillis, passphraseUsername, passphraseAdvice }: PassphraseModalProps) => {
  const { gripe, setGripe, fail, attempt } = useAttempts('PassphraseModal', done)
  const fieldRef = useRef<HTMLInputElement>(null)
  const { ref: confirmRef, gripeId, differs } = useConfirmation(setGripe)
  const creating = gating.gatingkind === 'build_vault'
  // The host's advice heard the passphrase: what it threw may quote it, so none of it goes on but safebyok's own refusal.
  const advice = useAdvice(passphraseAdvice, gating, creating, fail)

  const submit = () => {
    const typed = fieldRef.current?.value ?? ''
    // A first passphrase mistyped would be the vault's: refused here, before any key is derived.
    if (creating && differs(typed)) { return }
    void attempt(() => gating.attempt({ passphraseClear: typed }), 'unlocked')
  }

  /** Each change to the field: a gripe about what was typed before goes, and, while choosing, the advice is asked anew. */
  const hearPassphrase = (typed: string) => {
    setGripe((prev) => (prev?.fromPasskey === true ? prev : null))
    if (creating) { void advice.hear(typed) }
  }

  return (
    <ModalForm
      title={creating ? Messages.chooseTitle : Messages.unlockTitle}
      blurb={creating ? Messages.chooseBlurb : Messages.unlockBlurb}
      submitWord={creating ? Messages.createButton : Messages.unlockButton}
      gripe={gripe}
      gripeId={gripeId}
      footnote={leaseMillis === undefined ? undefined : unlockedFor(leaseMillis, creating)}
      done={done}
      onSubmit={submit}
    >
      <UsernameField username={passphraseUsername ?? Messages.passphraseUsername(gating.user_id, gating.vaultlabel)} />
      <PassphraseField
        ref={fieldRef}
        credential={creating ? 'new-password' : 'current-password'}
        fieldlabel={Messages.passphraseField}
        takesFocus
        advice={creating ? advice.said : undefined}
        onChange={hearPassphrase}
      />
      {creating && <ConfirmField ref={confirmRef} gripeId={gripeId} fieldlabel={Messages.confirmField} gripe={gripe} onChange={() => { setGripe(null) }} />}
    </ModalForm>
  )
}
