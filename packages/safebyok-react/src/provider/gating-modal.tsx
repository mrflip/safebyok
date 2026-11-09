import { useEffect, useRef, type ComponentType } from 'react'
import type { Gating, Gatingkind } from 'safebyok'
import { AddPasskeyModal } from '../modals/add-passkey-modal'
import { DelVaultModal } from '../modals/del-vault-modal'
import { PassphraseModal } from '../modals/passphrase-modal'
import { ReplacePassphraseModal } from '../modals/replace-passphrase-modal'
import { RevokePasskeyModal } from '../modals/revoke-passkey-modal'
import type { GatingModalProps } from '../shapes'

type KindModalProps<KindT extends Gatingkind> = Omit<GatingModalProps, 'gating'> & { gating: Gating<KindT> }

const DialogForGatingkind: { [KindT in Gatingkind]: ComponentType<KindModalProps<KindT>> } = {
  build_vault:        PassphraseModal,
  unlock_vault:       PassphraseModal,
  replace_passphrase: ReplacePassphraseModal,
  add_passkey:        AddPasskeyModal,
  revoke_passkey:     RevokePasskeyModal,
  del_vault:          DelVaultModal,
}

const NoDialog = ({ onDone }: Pick<GatingModalProps, 'onDone'>) => {
  // An onDone written inline is new at each render, and so re-runs the effect.
  const answered = useRef(false)
  useEffect(() => {
    if (answered.current) { return }
    answered.current = true
    onDone('dismissed')
  }, [onDone])
  return null
}

/** The dialog for any gating, by its `gatingkind`. */
export const GatingModal = ({ gating, ...rest }: GatingModalProps) => {
  const Dialog = DialogForGatingkind[gating.gatingkind] as ComponentType<GatingModalProps> | undefined
  if (Dialog === undefined) { return <NoDialog onDone={rest.onDone} /> }
  return <Dialog gating={gating} {...rest} />
}
