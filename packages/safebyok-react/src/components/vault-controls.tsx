import { isVaultError, type Outcome } from 'safebyok'
import { Messages } from '../helpers/messages'
import { useBank, useBankSnapshot, useVault, useVaultSnapshot } from '../hooks/hooks'
import { useProvided } from '../provider/bank-provider'
import type { TellBadNews, VaultControlProps } from '../shapes'

/** Whether the signed-in user's vault under `vaultlabel` is locked, with a Lock or Unlock button, or a Create vault button while it is unborn. */
export const VaultLockControl = ({ vaultlabel }: VaultControlProps) => {
  const bank = useBank()
  const { tellBadNews } = useProvided('VaultLockControl')
  const { stage, vault } = useVault(vaultlabel)
  const snapshot = useVaultSnapshot(vaultlabel)
  if (stage === 'unborn') { return <CreateVaultButton vaultlabel={vaultlabel} /> }
  if ((bank === null) || (vault === null) || (snapshot === null)) { return null }
  // `vault.tryEnsureUnlocked()` on the vault in hand, never `bank.ensureVault`: an Unlock never builds a vault.
  const unlock = async () => { tellUnlessDeclined(tellBadNews, await vault.tryEnsureUnlocked()) }
  const { isLocked } = snapshot
  return (
    <span className="vault-lock-control" data-locked={isLocked}>
      <span>{isLocked ? Messages.vaultLocked : Messages.vaultUnlocked}</span>
      {isLocked
        ? <button type="button" onClick={() => { void unlock() }}>{Messages.unlockButton}</button>
        : <button type="button" onClick={() => { vault.lock() }}>{Messages.lockButton}</button>}
    </span>
  )
}

/** A button that builds the signed-in user's vault under `vaultlabel`. */
export const CreateVaultButton = ({ vaultlabel }: VaultControlProps) => {
  const bank = useBank()
  const { tellBadNews } = useProvided('CreateVaultButton')
  // `bank.ensureVault` refuses until `bank.hello()` has landed.
  const isReady = (useBankSnapshot()?.stage === 'ready')
  const create = async () => {
    if ((bank === null) || (! isReady)) { return }
    tellUnlessDeclined(tellBadNews, await bank.tryEnsureVault({ vaultlabel }))
  }
  return (
    <button type="button" className="create-vault-button" disabled={! isReady} onClick={() => { void create() }}>
      {Messages.createButton}
    </button>
  )
}

/** Hand a refusal to the host's `onBadNews`, unless the user declined the dialog. */
const tellUnlessDeclined = (tellBadNews: TellBadNews, outcome: Outcome<unknown>): void => {
  if (outcome.ok || isVaultError(outcome.err, 'declined')) { return }
  tellBadNews([outcome.err])
}
