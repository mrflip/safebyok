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
  const unlock = async () => { tellUnlessDismissed(tellBadNews, await vault.tryEnsureUnlocked()) }
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
  const isReady = (useBankSnapshot()?.stage === 'ready')
  const create = async () => {
    if ((bank === null) || (! isReady)) { return }
    tellUnlessDismissed(tellBadNews, await bank.tryEnsureVault({ vaultlabel }))
  }
  return (
    <button type="button" className="create-vault-button" disabled={! isReady} onClick={() => { void create() }}>
      {Messages.createButton}
    </button>
  )
}

const tellUnlessDismissed = (tellBadNews: TellBadNews, outcome: Outcome<unknown>): void => {
  if (outcome.ok || isVaultError(outcome.err, 'dismissed')) { return }
  tellBadNews([outcome.err])
}
