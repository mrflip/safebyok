import { isVaultError, type Bank, type Outcome } from 'safebyok'
import { useBank, useBankSnapshot, useVault, useVaultSnapshot } from './hooks'
import { Messages } from './messages'

/** The lock state of the signed-in user's vault under `vaultlabel` with a Lock or Unlock button, for an account menu; a Create vault button while it is unborn. */
export const VaultLockControl = ({ vaultlabel }: VaultControlProps) => {
  const bank = useBank()
  const { stage, vault } = useVault(vaultlabel)
  const snapshot = useVaultSnapshot(vaultlabel)
  if (stage === 'unborn') { return <CreateVaultButton vaultlabel={vaultlabel} /> }
  if ((bank === null) || (vault === null) || (snapshot === null)) { return null }
  // The vault in hand, never bank.ensureVault: an Unlock never builds a vault.
  const unlock = async () => { tellUnlessDeclined(bank, await vault.tryEnsureUnlocked()) }
  const isLocked = (snapshot.lockState === 'locked')
  return (
    <span className="vault-lock-control" data-lock-state={snapshot.lockState}>
      <span>{isLocked ? Messages.vaultLocked : Messages.vaultUnlocked}</span>
      {isLocked
        ? <button type="button" onClick={() => { void unlock() }}>{Messages.unlockButton}</button>
        : <button type="button" onClick={() => { vault.lock() }}>{Messages.lockButton}</button>}
    </span>
  )
}

/** A button that builds the signed-in user's vault under `vaultlabel` from the click, asking the user for its new passphrase. */
export const CreateVaultButton = ({ vaultlabel }: VaultControlProps) => {
  const bank = useBank()
  // `bank.ensureVault` refuses until the bank's hello has landed.
  const isReady = (useBankSnapshot()?.stage === 'ready')
  const create = async () => {
    if ((bank === null) || (! isReady)) { return }
    tellUnlessDeclined(bank, await bank.tryEnsureVault({ vaultlabel }))
  }
  return (
    <button type="button" className="create-vault-button" disabled={! isReady} onClick={() => { void create() }}>
      {Messages.createButton}
    </button>
  )
}

/** What a VaultLockControl or a CreateVaultButton is handed: the vaultlabel of the vault it acts on. */
export type VaultControlProps = { vaultlabel: string }

/** Hand a refusal to the bank's bad news, unless the user declined the dialog. */
const tellUnlessDeclined = (bank: Bank, outcome: Outcome<unknown>): void => {
  if (outcome.ok || isVaultError(outcome.err, 'declined')) { return }
  bank.tellBadNews([outcome.err])
}
