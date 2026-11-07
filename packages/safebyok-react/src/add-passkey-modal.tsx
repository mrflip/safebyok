import { useRef } from 'react'
import type { Gating, PasskeyAnswer } from 'safebyok'
import { useRoundFor } from './boundary'
import { Messages } from './messages'
import { AnsweringOnce, ModalForm, PassphraseField, UsernameField, useAttempts, type DialogAnswer } from './modal'
import { attemptOnce, createPasskey } from './passkey'

/** The dialog for an `add_passkey` gating, which makes a passkey and adds it to the vault once the user proves its passphrase. */
export const AddPasskeyModal = (props: AddPasskeyModalProps) => (
  <AnsweringOnce key={useRoundFor(props.gating)} gating={props.gating} onDone={props.onDone}>
    {(done) => <AddPasskeyForm {...props} onDone={done} />}
  </AnsweringOnce>
)

/** What AddPasskeyModal is handed. */
export type AddPasskeyModalProps = {
  /** The gating the dialog answers, as the bank handed it to `requestCleartext`. */
  gating:              Gating<'add_passkey'>
  /** Called once, with the dialog's answer: 'unlocked' once the passkey is added, 'declined' otherwise. */
  onDone:              (answer: DialogAnswer) => void
  /** What a password manager files the passphrase under, and the authenticator the passkey. Default: the user and the vault, as 'u1 (main vault)'. */
  passphraseUsername?: string | undefined
  /** The relying party the passkey is made under, if not the page's own domain. */
  passkeyRpId?:        string | undefined
}

/** The dialog itself, inside AddPasskeyModal's boundary: its `onDone` is the one answer, `AnsweringOnce`'s. */
const AddPasskeyForm = ({ gating, onDone: done, passphraseUsername, passkeyRpId }: AddPasskeyModalProps) => {
  const { gripe, setGripe, meet, attempt, whenShown, isShown } = useAttempts('AddPasskeyModal', done)
  const fieldRef = useRef<HTMLInputElement>(null)
  // The browser asks for one passkey at a time: a second submit while it asks changes nothing.
  const asking = useRef(false)
  const username = passphraseUsername ?? Messages.passphraseUsername(gating.user_id, gating.vaultlabel)

  const addPasskey = async () => {
    const passphraseClear = fieldRef.current?.value ?? ''
    setGripe(null)
    let made: PasskeyAnswer | null
    try {
      made = await createPasskey({ rp: { name: gating.applabel, id: passkeyRpId }, user: { name: username, displayName: username } })
    } catch (err) {
      await whenShown(() => { meet(err) })
      return
    }
    if (made === null) { return }
    // An answer is as good as the passphrase, so it is tried now or never: one that comes back
    // while the dialog is hidden is zeroed untried, never kept for it to show again.
    if (! isShown()) { made.prfBytes.fill(0); return }
    await attempt(() => attemptOnce(made, (passkeyClear) => gating.attempt({ passphraseClear, passkeyClear })), 'unlocked')
  }

  const submit = () => {
    if (asking.current) { return }
    asking.current = true
    void addPasskey().finally(() => { asking.current = false })
  }

  return (
    <ModalForm
      title={Messages.addPasskeyTitle}
      blurb={Messages.addPasskeyBlurb}
      submitWord={Messages.addPasskeyButton}
      gripe={gripe}
      done={done}
      onSubmit={submit}
    >
      <UsernameField username={username} />
      <PassphraseField ref={fieldRef} credential="current-password" fieldlabel={Messages.passphraseField} takesFocus onChange={() => { setGripe(null) }} />
    </ModalForm>
  )
}
