/**
 * The helpers of safebyok-react's tests that build JSX, kept apart from `test-helpers.ts` because
 * a `.ts` file cannot hold JSX. `test-helpers.ts` re-exports them: reach them as `TH`
 * (`import * as TH from './test-helpers'`), never by this file's name.
 */
import { Activity, useEffect, type ReactNode } from 'react'
import type { Bank, VaultSnapshot } from 'safebyok'
import { useBank, useBankSnapshot, useVault, useVaultSnapshot } from '../src/hooks'

/**
 * `shown` inside an Activity in `mode`, for `rerender` to hide and show again.
 *
 * @example
 *   const { rerender } = render(TH.inActivity('visible', dialog))
 *   rerender(TH.inActivity('hidden', dialog))
 */
export const inActivity = (mode: 'visible' | 'hidden', shown: ReactNode) => <Activity mode={mode}>{shown}</Activity>

/** `locked` or `unlocked` for a vault's snapshot, `none` for none. */
export const lockWordOf = (snapshot: VaultSnapshot | null): string => {
  if (snapshot === null) { return 'none' }
  return snapshot.isLocked ? 'locked' : 'unlocked'
}

/** The banks a {@link ShowsVault} has seen, in the order it saw them, each once. */
export const seenBanks: Bank[] = []

/** What the hooks say of the bank and of the vault under `vaultlabel`, as text, with the buttons a host's page would have: Open builds or unlocks the vault from a click, Lock locks it.
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
