import { useActionState, useId } from 'react'
import { Messages } from '../helpers/messages'
import type { DelVaultModalProps } from '../shapes'
import { ModalForm } from './modal-kit'

/** Render the dialog that asks the user to confirm deleting the vault, and deletes it on Delete. */
export const DelVaultModal = ({ vault, onDone }: DelVaultModalProps) => {
  const gripeId = useId()
  const [gripe, action] = useActionState(async (): Promise<string | null> => {
    const deleted = await vault.tryDel(vault)
    if (! deleted.ok) { return deleted.err.message }
    onDone(true)
    return null
  }, null)

  return (
    <ModalForm
      onCancel={() => { onDone(false) }}
      title={Messages.delVaultTitle}
      blurb={Messages.delVaultBlurb}
      submitWord={Messages.delVaultButton}
      pendingWord={Messages.deletingButton}
      gripeText={gripe}
      gripeId={gripeId}
      action={action}
    />
  )
}
