import { isVaultError, type Outcome } from 'safebyok'
import { Messages } from '../helpers/messages'
import { useBank, useVault, useVaultSnapshot } from '../hooks/hooks'
import { useProvided } from '../provider/bank-provider'
import type { TellBadNews, VaultControlProps } from '../shapes'

/** Render whether the signed-in user's vault named `vaultlabel` is locked, with a Lock or Unlock button.
 * While the vault is unborn, it renders a Create vault button instead.
 */
export const VaultLockControl = ({ vaultlabel }: VaultControlProps) => {
  const bank = useBank()
  const { tellBadNews } = useProvided('VaultLockControl')
  const { stage, vault } = useVault(vaultlabel)
  const snapshot = useVaultSnapshot(vaultlabel)
  if (stage === 'unborn') { return <CreateVaultButton vaultlabel={vaultlabel} /> }
  if ((bank === null) || (vault === null) || (snapshot === null)) { return null }
  // Call `vault.tryEnsureUnlocked()` on this vault, never `bank.ensureVault`: pressing Unlock must never create a vault.
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

/** Render a button that creates the signed-in user's vault named `vaultlabel`. */
export const CreateVaultButton = ({ vaultlabel }: VaultControlProps) => {
  const bank = useBank()
  const { tellBadNews } = useProvided('CreateVaultButton')
  const create = async () => {
    if (bank === null) { return }
    tellUnlessDismissed(tellBadNews, await bank.tryEnsureVault({ vaultlabel }))
  }
  return (
    <button type="button" className="create-vault-button" disabled={bank === null} onClick={() => { void create() }}>
      {Messages.createButton}
    </button>
  )
}

const tellUnlessDismissed = (tellBadNews: TellBadNews, outcome: Outcome<unknown>): void => {
  if (outcome.ok || isVaultError(outcome.err, 'dismissed')) { return }
  tellBadNews([outcome.err])
}
