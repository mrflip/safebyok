import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { ENCRYPTED, type Bank, type BankSnapshot, type Box, type BoxSnapshot, type VaultSnapshot, type Whisper, type BoxExposure } from 'safebyok'
import { useProvided } from '../provider/bank-provider'
import type { VaultLifecycle } from '../shapes'

// == [Bank hooks]: useBank, useBankSnapshot, subscribeToNothing, getNothing

const unsubscribeFromNothing = () => { /* nothing was heard */ }
const subscribeToNothing = () => unsubscribeFromNothing
const getNothing = () => null

/** The signed-in user's bank the nearest BankProvider has, or null while it has none. */
export const useBank = (): Bank | null => useProvided('useBank').bank

/** The live snapshot of the signed-in user's bank, or null while the provider has no bank. */
export const useBankSnapshot = (): BankSnapshot | null => {
  const { bank } = useProvided('useBankSnapshot')
  return useSyncExternalStore(bank?.subscribe ?? subscribeToNothing, bank?.getSnapshot ?? getNothing, getNothing)
}
// --

// == [Vault hooks]: VaultStage, VaultLifecycle, useVault, useVaultFor, useVaultSnapshot, WaitingLifecycle, UnbornLifecycle

const WaitingLifecycle: VaultLifecycle = Object.freeze({ stage: 'waiting', vault: null })
const UnbornLifecycle: VaultLifecycle = Object.freeze({ stage: 'unborn', vault: null })

/** The signed-in user's vault under `vaultlabel` and where it stands. */
export const useVault = (vaultlabel: string): VaultLifecycle => useVaultFor('useVault', vaultlabel)

/** The signed-in user's vault under `vaultlabel` and where it stands. `hookname` is the hook a missing-provider error names. */
const useVaultFor = (hookname: string, vaultlabel: string): VaultLifecycle => {
  const { bank, helloedVaults } = useProvided(hookname)
  const snapshot = useSyncExternalStore(bank?.subscribe ?? subscribeToNothing, bank?.getSnapshot ?? getNothing, getNothing)
  const lifecycle = useMemo((): VaultLifecycle => {
    if (bank === null || snapshot === null) { return WaitingLifecycle }
    // A sweep or a vacate remakes the snapshot, its err the bank's end cause, so this memo hears the bank end.
    if ((! bank.isEnabled) && (snapshot.err !== null)) { return { stage: 'spent', vault: null, cause: snapshot.err } }
    if (snapshot.stage !== 'ready') { return WaitingLifecycle }
    const vault = bank.vaultAt({ vaultlabel })
    return vault?.isPresent === true ? { stage: 'present' as const, vault } : UnbornLifecycle
  }, [bank, snapshot, vaultlabel])
  const { vault } = lifecycle
  useEffect(() => {
    if (bank === null || vault === null || helloedVaults.has(vault)) { return }
    helloedVaults.add(vault)
    // The bank tells onLifecycle of the hello.
    void vault.tryHello()
  }, [bank, vault, helloedVaults])
  return lifecycle
}

/** The live snapshot of the signed-in user's vault under `vaultlabel`, or null while it is not `present`. */
export const useVaultSnapshot = (vaultlabel: string): VaultSnapshot | null => {
  const { vault } = useVaultFor('useVaultSnapshot', vaultlabel)
  return useSyncExternalStore(vault?.subscribe ?? subscribeToNothing, vault?.getSnapshot ?? getNothing, getNothing)
}
// --

// == [Box hooks]: useBoxes, useBox, useBoxSnapshot, useBoxIsShowing, useBoxExposure, useWhisper

/** The snapshots of the boxes in the signed-in user's vault under `vaultlabel`, or null while it is not `present`. */
export const useBoxes = (vaultlabel: string): readonly BoxSnapshot[] | null => {
  const { vault } = useVaultFor('useBoxes', vaultlabel)
  const boxes = vault?.boxListing ?? null
  return useSyncExternalStore(boxes?.subscribe ?? subscribeToNothing, boxes?.getSnapshot ?? getNothing, getNothing)
}

/** The Box under `boxlabel` in the signed-in user's vault under `vaultlabel`, or null until it is listed present. */
export const useBox = (vaultlabel: string, boxlabel: string): Box | null => {
  const { vault } = useVaultFor('useBox', vaultlabel)
  const boxes = vault?.boxListing ?? null
  const presentBox = useCallback(() => {
    if (vault === null) { return null }
    const box = vault.boxListing.at({ ...vault.scope, boxlabel })
    return box?.isPresent === true ? box : null
  }, [vault, boxlabel])
  return useSyncExternalStore(boxes?.subscribe ?? subscribeToNothing, presentBox, getNothing)
}

/** The live snapshot of `box`, or null for no box. */
export const useBoxSnapshot = (box: Box | null): BoxSnapshot | null => (
  useSyncExternalStore(box?.subscribe ?? subscribeToNothing, box?.getSnapshot ?? getNothing, getNothing)
)

/** True while `box` shows its whisper, and false where there is no box. */
export const useBoxIsShowing = (box: Box | null): boolean => (
  useSyncExternalStore(box?.subscribe ?? subscribeToNothing, () => box?.isShowing ?? false, () => false)
)

const getUnexposed = (): BoxExposure => 'unexposed'

/** Where `box`'s whisper stands, read live: `showing`, or why it hides; `unexposed` for no box. */
export const useBoxExposure = (box: Box | null): BoxExposure => (
  useSyncExternalStore(box?.subscribe ?? subscribeToNothing, () => box?.exposure ?? 'unexposed', getUnexposed)
)

const getEncrypted = (): Whisper => ENCRYPTED

/** The live whisper `box` shows, a bag with no fields while it will not show or there is no box. */
export const useWhisper = (box: Box | null): Whisper => {
  const whisperOf = useCallback(() => box?.whisper ?? ENCRYPTED, [box])
  return useSyncExternalStore(box?.subscribe ?? subscribeToNothing, whisperOf, getEncrypted)
}
// --
