import { useEffect, useRef, type ComponentType } from 'react'
import type { AnyGating, Gating, Gatingkind } from 'safebyok'
import { DelVaultModal } from './del-vault-modal'
import type { DialogAnswer, PassphraseAdvice } from './modal'
import { PassphraseModal } from './passphrase-modal'
import { ReplacePassphraseModal } from './replace-passphrase-modal'

/** What GatingModal is handed: any gating, and the props its dialogs share. */
export type GatingModalProps = {
  /** The gating the dialog answers, as the bank handed it to `requestCleartext`. */
  gating:              AnyGating
  /** Called once, with the dialog's answer: 'unlocked' or 'deleted' once an attempt is ok, 'declined' otherwise. */
  onDone:              (answer: DialogAnswer) => void
  /** The bank's `leaseMillis`, for the line that says how long an unlock lasts; left out, the dialog says nothing of it. */
  leaseMillis?:        number | undefined
  /** What a password manager files the passphrase under. Default: the user and the vault, as 'u1 (main vault)'. */
  passphraseUsername?: string | undefined
  /** What to say beside the field as the user chooses a new passphrase. Default: the bank's strength checker's reason. */
  passphraseAdvice?:   PassphraseAdvice | undefined
}

/** What the dialog for one gatingkind is handed: GatingModal's props, its gating narrowed to that kind. */
type KindModalProps<KindT extends Gatingkind> = Omit<GatingModalProps, 'gating'> & { gating: Gating<KindT> }

/** The dialog for each gatingkind that has one. */
const DialogForGatingkind: { [KindT in Gatingkind]?: ComponentType<KindModalProps<KindT>> } = {
  build_vault:        PassphraseModal,
  unlock_vault:       PassphraseModal,
  replace_passphrase: ReplacePassphraseModal,
  del_vault:          DelVaultModal,
}

/** What stands in for a gatingkind with no dialog yet: it answers 'declined' as it mounts. */
const NoDialog = ({ onDone }: Pick<GatingModalProps, 'onDone'>) => {
  // An onDone written inline is new at each render, and is still told only once.
  const answered = useRef(false)
  useEffect(() => {
    if (answered.current) { return }
    answered.current = true
    onDone('declined')
  }, [onDone])
  return null
}

/** The dialog for any gating, by its `gatingkind`; a host's own `requestCleartext` may render it, resolving once `onDone` is told. */
export const GatingModal = ({ gating, ...rest }: GatingModalProps) => {
  // The map pairs each kind with its dialog; the lookup cannot carry that pairing to the call.
  const Dialog = DialogForGatingkind[gating.gatingkind] as ComponentType<GatingModalProps> | undefined
  if (Dialog === undefined) { return <NoDialog onDone={rest.onDone} /> }
  return <Dialog gating={gating} {...rest} />
}
