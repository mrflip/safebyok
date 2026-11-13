import { isVaultError, type Device } from 'safebyok'
import { Messages } from '../helpers/messages'
import { useBank, useBankSnapshot, useDevice } from '../hooks/hooks'
import type { CreateVaultButtonProps } from '../shapes'

/** Render whether the signed-in user's bank is locked, with a Lock or Unlock button; nothing while there is no bank. */
export function BankLockControl() {
  const bank = useBank()
  const snapshot = useBankSnapshot()
  if ((bank === null) || (snapshot === null)) { return null }
  const unlock = async () => {
    const unlocked = await bank.tryEnsureUnlocked()
    if (! unlocked.ok) { tellUnlessDismissed(bank.device, unlocked.err) }
  }
  const { isLocked } = snapshot
  return (
    <span className="bank-lock-control" data-locked={isLocked}>
      <span>{isLocked ? Messages.vaultLocked : Messages.vaultUnlocked}</span>
      {isLocked
        ? <button type="button" onClick={() => { void unlock() }}>{Messages.unlockButton}</button>
        : <button type="button" onClick={() => { bank.lock() }}>{Messages.lockButton}</button>}
    </span>
  )
}

// A returning user on a new device has a bank and no vault, and a user who cancelled the bank's build at sign-in has
// neither: the one click ensures each step, asking the user only where a step needs it.
/** Render a button that creates the signed-in user's vault named `vaultlabel`: the bank first, built or unlocked where it needs to be. */
export function CreateVaultButton({ vaultlabel }: Readonly<CreateVaultButtonProps>) {
  const device = useDevice()
  const create = async () => {
    if (device === null) { return }
    try {
      const bank = await device.ensureBank()
      await bank.ensureUnlocked()
      await bank.ensureVault({ vaultlabel })
    } catch (err) {
      tellUnlessDismissed(device, err)
    }
  }
  return (
    <button type="button" className="create-vault-button" disabled={device === null} onClick={() => { void create() }}>
      {Messages.createButton}
    </button>
  )
}

/** Tell `device`'s host of `err`, unless the user dismissed a dialog. */
function tellUnlessDismissed(device: Device, err: unknown): void {
  if (! isVaultError(err, 'dismissed')) { device.tellBadNews([err]) }
}
