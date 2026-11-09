import { useRef } from 'react'
import { Messages } from '../helpers/messages'
import type { ReplacePassphraseModalProps } from '../shapes'
import { ChosenPassphraseFields, DialogBoundary, ModalForm, PassphraseField, UsernameField, textOf, useAttemptAction, useChosenPassphrase } from './modal-kit'

/** The dialog for a `replace_passphrase` gating, which proves the passphrase in use and chooses the next. */
export const ReplacePassphraseModal = (props: ReplacePassphraseModalProps) => (
  <DialogBoundary key={props.gating.gatingTok} gating={props.gating}>
    <ReplacePassphraseForm {...props} />
  </DialogBoundary>
)

const ReplacePassphraseForm = ({ gating, passphraseUsername }: ReplacePassphraseModalProps) => {
  const anteRef = useRef<HTMLInputElement>(null)
  const { chosenRef, confirmRef, ...chosen } = useChosenPassphrase(gating, 'ReplacePassphraseModal')
  const { gripe, gripeId, action } = useAttemptAction(
    gating,
    'ReplacePassphraseModal',
    (form) => gating.attempt({ antePassphraseClear: textOf(form, 'current-password'), nextPassphraseClear: textOf(form, 'new-password') }),
    (refusalkind) => (refusalkind === 'wrong_passphrase' ? anteRef : chosenRef),
  )
  const isAnteWrong = gripe?.refusalkind === 'wrong_passphrase'

  return (
    <ModalForm
      gating={gating}
      title={Messages.changeTitle}
      blurb={Messages.changeBlurb}
      submitWord={Messages.changeButton}
      pendingWord={Messages.changingButton}
      isSubmittable={chosen.isSubmittable}
      gripeText={gripe?.text ?? null}
      gripeId={gripeId}
      action={action}
      onReset={chosen.forget}
    >
      <UsernameField username={passphraseUsername ?? Messages.passphraseUsername(gating.user_id, gating.vaultlabel)} />
      <PassphraseField ref={anteRef} fieldname="current-password" fieldlabel={Messages.currentField} invalidBy={isAnteWrong ? gripeId : undefined} />
      <ChosenPassphraseFields
        chosen={chosen}
        chosenRef={chosenRef}
        confirmRef={confirmRef}
        chosenLabel={Messages.newField}
        confirmLabel={Messages.confirmNewField}
        chosenInvalidBy={(gripe === null) || isAnteWrong ? undefined : gripeId}
      />
    </ModalForm>
  )
}
