/** Test helpers that build JSX. They are in their own file because a `.ts` file cannot contain JSX.
 * `test-helpers.ts` re-exports them, so import them as `TH` (`import * as TH from './test-helpers'`), never from this file.
 */
import { Activity, useEffect, type ReactNode } from 'react'
import type { Bank, VaultSnapshot } from 'safebyok'
import { useBank, useDeviceSnapshot, useVault, useVaultSnapshot } from '../src/hooks/hooks'

/** Wrap `shown` in an Activity in `mode`, so a test can `rerender` to hide it and show it again.
 *
 * @example
 *   const { rerender } = render(TH.inActivity('visible', dialog))
 *   rerender(TH.inActivity('hidden', dialog))
 */
export const inActivity = (mode: 'visible' | 'hidden', shown: ReactNode) => <Activity mode={mode}>{shown}</Activity>

/** Return `locked` or `unlocked` for a vault's snapshot, or `none` for a null snapshot. */
export const lockWordOf = (snapshot: VaultSnapshot | null): string => {
  if (snapshot === null) { return 'none' }
  return snapshot.isLocked ? 'locked' : 'unlocked'
}

/** Every bank a {@link ShowsVault} has rendered with, in order, each listed once. */
export const seenBanks: Bank[] = []

/** Render what the hooks report about the device and the vault named `vaultlabel`, as text, with the buttons a host's page would have.
 * Open unlocks the bank and builds the vault from a click, and Lock locks it.
 *
 * @example
 *   render(<BankProvider {...props}><TH.ShowsVault /></BankProvider>)
 *   expect(screen.getByTestId('vault').textContent).to.eq('unborn none')
 */
export const ShowsVault = ({ vaultlabel = 'main' }: { vaultlabel?: string }) => {
  const bank = useBank()
  const deviceSnapshot = useDeviceSnapshot()
  const { stage, vault } = useVault(vaultlabel)
  const vaultSnapshot = useVaultSnapshot(vaultlabel)
  useEffect(() => { if (bank !== null && ! seenBanks.includes(bank)) { seenBanks.push(bank) } }, [bank])
  const open = async () => {
    if (bank === null) { return }
    const unlocked = await bank.tryEnsureUnlocked()
    if (unlocked.ok) { await bank.tryEnsureVault({ vaultlabel }) }
  }
  return (
    <div>
      <p data-testid="bank">{deviceSnapshot === null ? 'none' : `${deviceSnapshot.user_id} ${deviceSnapshot.stage}`}</p>
      <p data-testid="vault">{`${stage} ${lockWordOf(vaultSnapshot)}`}</p>
      <button type="button" onClick={() => { void open() }}>Open</button>
      <button type="button" onClick={() => { vault?.lock() }}>Lock</button>
    </div>
  )
}
