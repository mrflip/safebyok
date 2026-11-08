import { useEffect, useRef, type ComponentType } from 'react'
import type { AnyGating, Gating, Gatingkind } from 'safebyok'
import { AddPasskeyModal } from './add-passkey-modal'
import { DelVaultModal } from './del-vault-modal'
import type { DialogAnswer, PassphraseAdvice } from './modal'
import { PassphraseModal } from './passphrase-modal'
import { ReplacePassphraseModal } from './replace-passphrase-modal'
import { RevokePasskeyModal } from './revoke-passkey-modal'

/** What GatingModal is handed: any gating, and the props its dialogs share. */
export type GatingModalProps = {
  /** The gating the dialog answers, as the bank handed it to `requestCleartext`. */
  gating:              AnyGating
  /** Called once with 'unlocked' or 'deleted' when an attempt succeeds, and with 'declined' otherwise. */
  onDone:              (answer: DialogAnswer) => void
  /** The bank's `leaseMillis`, for the line saying how long an unlock lasts. */
  leaseMillis?:        number | undefined
  /** What a password manager files the passphrase under. */
  passphraseUsername?: string | undefined
  /** What to say beside the field as the user chooses a new passphrase. */
  passphraseAdvice?:   PassphraseAdvice | undefined
  /** The relying party the vault's passkey is made and asked under, if not the page's own domain. */
  passkeyRpId?:        string | undefined
}

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
