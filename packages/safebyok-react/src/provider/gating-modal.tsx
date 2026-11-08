import { useEffect, useRef, type ComponentType } from 'react'
import type { Gating, Gatingkind } from 'safebyok'
import { AddPasskeyModal } from '../modals/add-passkey-modal'
import { DelVaultModal } from '../modals/del-vault-modal'
import { PassphraseModal } from '../modals/passphrase-modal'
import { ReplacePassphraseModal } from '../modals/replace-passphrase-modal'
import { RevokePasskeyModal } from '../modals/revoke-passkey-modal'
import type { GatingModalProps } from '../shapes'

/** What the dialog for one gatingkind is handed: GatingModal's props, its gating narrowed to that kind. */
type KindModalProps<KindT extends Gatingkind> = Omit<GatingModalProps, 'gating'> & { gating: Gating<KindT> }

/** The dialog for each gatingkind. */
const DialogForGatingkind: { [KindT in Gatingkind]: ComponentType<KindModalProps<KindT>> } = {
  build_vault:        PassphraseModal,
  unlock_vault:       PassphraseModal,
  replace_passphrase: ReplacePassphraseModal,
  add_passkey:        AddPasskeyModal,
  revoke_passkey:     RevokePasskeyModal,
  del_vault:          DelVaultModal,
}

/** What stands in for a gatingkind this package has no dialog for: it answers 'declined' as it mounts. */
const NoDialog = ({ onDone }: Pick<GatingModalProps, 'onDone'>) => {
  // An onDone written inline is new at each render, and so re-runs the effect.
  /** True once `onDone` has been called. */
  const answered = useRef(false)
  useEffect(() => {
    if (answered.current) { return }
    answered.current = true
    onDone('declined')
  }, [onDone])
  return null
}

/** The dialog for any gating, by its `gatingkind`. */
export const GatingModal = ({ gating, ...rest }: GatingModalProps) => {
  // The map pairs each kind with its dialog; the lookup cannot carry that pairing to the call.
  const Dialog = DialogForGatingkind[gating.gatingkind] as ComponentType<GatingModalProps> | undefined
  if (Dialog === undefined) { return <NoDialog onDone={rest.onDone} /> }
  return <Dialog gating={gating} {...rest} />
}
