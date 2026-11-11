import { useEffect, type ComponentType } from 'react'
import type { AnyGating, Gating, Gatingkind } from 'safebyok'
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

const NoDialog = ({ gating }: { gating: AnyGating }) => {
  useEffect(() => { gating.dismiss() }, [gating])
  return null
}

/** Render the dialog that matches the gating's `gatingkind`. A gating of a kind with no dialog is dismissed. */
export const GatingModal = ({ gating, ...rest }: GatingModalProps) => {
  const Dialog = DialogForGatingkind[gating.gatingkind] as ComponentType<GatingModalProps> | undefined
  if (Dialog === undefined) { return <NoDialog gating={gating} /> }
  return <Dialog gating={gating} {...rest} />
}
