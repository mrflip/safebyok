/** Test helpers that build JSX. They are in their own file because a `.ts` file cannot contain JSX.
 * `test-helpers.ts` re-exports them, so import them as `TH` (`import * as TH from './test-helpers'`), never from this file.
 */
import { Activity, useEffect, type ReactNode } from 'react'
import type { Bank, VaultSnapshot } from 'safebyok'
import { useBank, useBankSnapshot, useVault, useVaultSnapshot } from '../src/hooks/hooks'

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

/** Render what the hooks report about the bank and the vault named `vaultlabel`, as text, with the buttons a host's page would have.
 * Open builds or unlocks the vault from a click, and Lock locks it.
 *
 * @example
 *   render(<BankProvider {...props}><TH.ShowsVault /></BankProvider>)
 *   expect(screen.getByTestId('vault').textContent).to.eq('unborn none')
 */
export const ShowsVault = ({ vaultlabel = 'main' }: { vaultlabel?: string }) => {
  const bank = useBank()
  const bankSnapshot = useBankSnapshot()
  const { stage, vault } = useVault(vaultlabel)
  const vaultSnapshot = useVaultSnapshot(vaultlabel)
  useEffect(() => { if (bank !== null && ! seenBanks.includes(bank)) { seenBanks.push(bank) } }, [bank])
  const open = async () => {
    if (bank === null) { return }
    const ensured = await bank.tryEnsureVault({ vaultlabel })
    if (ensured.ok) { await ensured.val.tryEnsureUnlocked() }
  }
  return (
    <div>
      <p data-testid="bank">{bankSnapshot === null ? 'none' : `${bankSnapshot.user_id} ${bankSnapshot.stage}`}</p>
      <p data-testid="vault">{`${stage} ${lockWordOf(vaultSnapshot)}`}</p>
      <button type="button" onClick={() => { void open() }}>Open</button>
      <button type="button" onClick={() => { vault?.lock() }}>Lock</button>
    </div>
  )
}
