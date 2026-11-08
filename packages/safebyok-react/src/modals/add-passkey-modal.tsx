import { useRef } from 'react'
import type { PasskeyAnswer } from 'safebyok'
import { Messages } from '../helpers/messages'
import { attemptOnce, createPasskey } from '../helpers/passkey'
import { useRoundFor } from '../hooks/round-for'
import type { AddPasskeyModalProps } from '../shapes'
import { AnsweringOnce, ModalForm, PassphraseField, UsernameField, useAttempts } from './modal-kit'

/** The dialog for an `add_passkey` gating, which makes a passkey and adds it to the vault once the user proves its passphrase. */
export const AddPasskeyModal = (props: AddPasskeyModalProps) => (
  <AnsweringOnce key={useRoundFor(props.gating)} gating={props.gating} onDone={props.onDone}>
    {(done) => <AddPasskeyForm {...props} onDone={done} />}
  </AnsweringOnce>
)

/** The dialog itself, inside AddPasskeyModal's boundary. */
const AddPasskeyForm = ({ gating, onDone: done, passphraseUsername, passkeyRpId }: AddPasskeyModalProps) => {
  const { gripe, setGripe, meet, attempt, whenShown, isShown } = useAttempts('AddPasskeyModal', done)
  const fieldRef = useRef<HTMLInputElement>(null)
  // The browser asks for one passkey at a time: a second submit while it asks changes nothing.
  const asking = useRef(false)
  const username = passphraseUsername ?? Messages.passphraseUsername(gating.user_id, gating.vaultlabel)

  const addPasskey = async () => {
    const passphraseClear = fieldRef.current?.value ?? ''
    // The passkey is made before the passphrase is proven: with none typed, it would be left unused.
    if (passphraseClear === '') { setGripe({ text: Messages.passphraseFirst, fromPasskey: false }); fieldRef.current?.focus(); return }
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
