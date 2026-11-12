import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { ENCRYPTED, type Bank, type BankSnapshot, type Box, type Device, type DeviceSnapshot, type BoxSnapshot, type Vault, type VaultSnapshot, type Whisper, type BoxExposure } from 'safebyok'
import { useProvided } from '../provider/bank-provider'
import type { VaultLifecycle } from '../shapes'

// == [Bank hooks]: useDevice, useBank, useBankSnapshot, useDeviceSnapshot, subscribeToNothing, getNothing

const unsubscribeFromNothing = () => { /* nothing to unsubscribe from */ }
const subscribeToNothing = () => unsubscribeFromNothing
const getNothing = () => null

/** Return the signed-in user's device from the nearest BankProvider, or null while there is none, as when nobody is signed in.
 * Call its `vacate()` at sign-out, whether or not its bank is up.
 */
export function useDevice(): Device | null { return useProvided('useDevice') }

/** Return the signed-in user's bank from the nearest BankProvider, or null.
 * It is null until the bank is up, and null again once the bank is deleted or built anew elsewhere, or the device ends.
 */
export function useBank(): Bank | null {
  const device = useProvided('useBank')
  return useSyncExternalStore(device?.subscribe ?? subscribeToNothing, () => device?.bank ?? null, getNothing)
}

/** Return the live snapshot of the signed-in user's bank, or null while {@link useBank} returns null.
 * Its `isLocked` covers every vault and box in the bank: they share one lock.
 */
export function useBankSnapshot(): BankSnapshot | null { return useDeviceSnapshotFor('useBankSnapshot')?.bank ?? null }

/** Return the live snapshot of the signed-in user's device, with its stage, open gating and bank, or null while there is no device. */
export function useDeviceSnapshot(): DeviceSnapshot | null { return useDeviceSnapshotFor('useDeviceSnapshot') }

/** {@link useDeviceSnapshot}, naming `hookname` in the error when there is no provider. */
function useDeviceSnapshotFor(hookname: string): DeviceSnapshot | null {
  const device = useProvided(hookname)
  return useSyncExternalStore(device?.subscribe ?? subscribeToNothing, device?.getSnapshot ?? getNothing, getNothing)
}
// --

// == [Vault hooks]: VaultStage, VaultLifecycle, useVault, useVaultFor, useVaultSnapshot, BanklessLifecycle, AbsentLifecycle, watchedLives

const BanklessLifecycle: VaultLifecycle = Object.freeze({ stage: 'bankless', vault: null })
const AbsentLifecycle: VaultLifecycle = Object.freeze({ stage: 'absent', vault: null })

// A Vault stands for its scope through its lives, and the watch on its boxes is of one life: a vault deleted and put
// again, here or elsewhere, needs its watch begun again.
/** For each Vault, the `vault_tok` of the life whose boxes a hook has begun watching. */
const watchedLives = new WeakMap<Vault, string>()

/** Return the signed-in user's vault named `vaultlabel`, with its lifecycle stage.
 * While the vault is present, the hook begins watching its boxes, so you need not call `vault.beginWatch()`.
 */
export const useVault = (vaultlabel: string): VaultLifecycle => useVaultFor('useVault', vaultlabel)

/** {@link useVault}, naming `hookname` in the error when there is no provider. */
const useVaultFor = (hookname: string, vaultlabel: string): VaultLifecycle => {
  const device = useProvided(hookname)
  const snapshot = useSyncExternalStore(device?.subscribe ?? subscribeToNothing, device?.getSnapshot ?? getNothing, getNothing)
  // The device's snapshot changes with its bank's, and so with each vault's life, lock and presence.
  const lifecycle = useMemo((): VaultLifecycle => {
    if (snapshot === null) { return BanklessLifecycle }
    if (snapshot.err !== null) { return { stage: 'spent', vault: null, cause: snapshot.err } }
    const bank = device?.bank ?? null
    if (bank === null) { return BanklessLifecycle }
    const vault = bank.vaultAt({ vaultlabel })
    return vault?.isPresent === true ? { stage: 'present', vault } : AbsentLifecycle
  }, [device, snapshot, vaultlabel])
  const { vault } = lifecycle
  const vaultTok = vault?.vault_tok ?? null
  useEffect(() => {
    if ((vault === null) || (vaultTok === null) || (watchedLives.get(vault) === vaultTok)) { return }
    watchedLives.set(vault, vaultTok)
    // Not awaited: the device reports the watch begun, or refused, to onLifecycle.
    void vault.tryBeginWatch()
  }, [vault, vaultTok])
  return lifecycle
}

/** Return the live snapshot of the signed-in user's vault named `vaultlabel`, or null while the vault is not `present`. */
export const useVaultSnapshot = (vaultlabel: string): VaultSnapshot | null => {
  const { vault } = useVaultFor('useVaultSnapshot', vaultlabel)
  return useSyncExternalStore(vault?.subscribe ?? subscribeToNothing, vault?.getSnapshot ?? getNothing, getNothing)
}
// --

// == [Box hooks]: useBoxes, useBox, useBoxSnapshot, useBoxIsShowing, useBoxExposure, useWhisper

/** Return the snapshots of the present boxes in the signed-in user's vault named `vaultlabel`, or null while the vault is not `present`. */
export const useBoxes = (vaultlabel: string): readonly BoxSnapshot[] | null => {
  const { vault } = useVaultFor('useBoxes', vaultlabel)
  const boxes = vault?.boxListing ?? null
  return useSyncExternalStore(boxes?.subscribe ?? subscribeToNothing, boxes?.getSnapshot ?? getNothing, getNothing)
}

/** Return the Box named `boxlabel` in the signed-in user's vault named `vaultlabel`, or null while the vault does not list it as present. */
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

/** Return the live snapshot of `box`, or null when `box` is null. */
export const useBoxSnapshot = (box: Box | null): BoxSnapshot | null => (
  useSyncExternalStore(box?.subscribe ?? subscribeToNothing, box?.getSnapshot ?? getNothing, getNothing)
)

/** True while `box` is showing its whisper, and false when `box` is null. */
export const useBoxIsShowing = (box: Box | null): boolean => (
  useSyncExternalStore(box?.subscribe ?? subscribeToNothing, () => box?.isShowing ?? false, () => false)
)

const getUnexposed = (): BoxExposure => 'unexposed'

/** Return `box`'s live exposure: `showing`, or why its whisper is hidden. It is `unexposed` when `box` is null. */
export const useBoxExposure = (box: Box | null): BoxExposure => (
  useSyncExternalStore(box?.subscribe ?? subscribeToNothing, () => box?.exposure ?? 'unexposed', getUnexposed)
)

const getEncrypted = (): Whisper => ENCRYPTED

/** Return the whisper `box` is showing, live, or a placeholder with no fields while the whisper is hidden or `box` is null.
 * To tell which you have, ask {@link useBoxExposure}, never the placeholder's identity.
 */
export const useWhisper = (box: Box | null): Whisper => {
  const whisperOf = useCallback(() => box?.whisper ?? ENCRYPTED, [box])
  return useSyncExternalStore(box?.subscribe ?? subscribeToNothing, whisperOf, getEncrypted)
}
// --
