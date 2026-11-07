import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { Bank, BankSnapshot, Vault, VaultSnapshot } from 'safebyok'
import { useProvided } from './bank-provider'

// == [Bank hooks]: useBank, useBankSnapshot, subscribeToNothing, getNothing

const unsubscribeFromNothing = () => { /* nothing was heard */ }
const subscribeToNothing = () => unsubscribeFromNothing
const getNothing = () => null

/** The signed-in user's bank the nearest BankProvider holds, or null while it holds none; call its verbs from an event handler. */
export const useBank = (): Bank | null => useProvided('useBank').bank

/** The live snapshot of the signed-in user's bank, its `stage` and the vaults it lists, or null while the provider holds no bank. */
export const useBankSnapshot = (): BankSnapshot | null => {
  const { bank } = useProvided('useBankSnapshot')
  return useSyncExternalStore(bank?.subscribe ?? subscribeToNothing, bank?.getSnapshot ?? getNothing, getNothing)
}
// --

// == [Vault hooks]: VaultStage, VaultHeld, useVault, useVaultFor, useVaultSnapshot, WaitingHeld, UnbornHeld

/** Where the vault a hook names stands: `waiting` until the bank is ready, `unborn` while it holds no live vault, else `present`. */
export type VaultStage = 'waiting' | 'unborn' | 'present'

/** What {@link useVault} answers: the vault's stage, and its Vault object while it is `present`. */
export type VaultHeld = { stage: 'waiting' | 'unborn', vault: null } | { stage: 'present', vault: Vault }

const WaitingHeld: VaultHeld = Object.freeze({ stage: 'waiting', vault: null })
const UnbornHeld: VaultHeld = Object.freeze({ stage: 'unborn', vault: null })

/** The signed-in user's vault under `vaultlabel` and where it stands, never asking the user; an `unborn` vault is built by `bank.ensureVault` from a click. */
export const useVault = (vaultlabel: string): VaultHeld => useVaultFor('useVault', vaultlabel)

/** {@link useVault}'s work, for `hookname`: the vault the bank lists once ready, said hello to once. */
const useVaultFor = (hookname: string, vaultlabel: string): VaultHeld => {
  const { bank, helloedVaults } = useProvided(hookname)
  const snapshot = useSyncExternalStore(bank?.subscribe ?? subscribeToNothing, bank?.getSnapshot ?? getNothing, getNothing)
  const held = useMemo(() => {
    if (bank === null || snapshot?.stage !== 'ready') { return WaitingHeld }
    const vault = bank.vaultAt({ vaultlabel })
    return vault?.isPresent === true ? { stage: 'present' as const, vault } : UnbornHeld
  }, [bank, snapshot, vaultlabel])
  const { vault } = held
  useEffect(() => {
    if (bank === null || vault === null || helloedVaults.has(vault)) { return }
    helloedVaults.add(vault)
    void vault.tryHello().then((said) => { if (! said.ok) { bank.tellBadNews([said.err]) } })
  }, [bank, vault, helloedVaults])
  return held
}

/** The live snapshot of the signed-in user's vault under `vaultlabel`, or null while it is not `present`. */
export const useVaultSnapshot = (vaultlabel: string): VaultSnapshot | null => {
  const { vault } = useVaultFor('useVaultSnapshot', vaultlabel)
  return useSyncExternalStore(vault?.subscribe ?? subscribeToNothing, vault?.getSnapshot ?? getNothing, getNothing)
}
// --
