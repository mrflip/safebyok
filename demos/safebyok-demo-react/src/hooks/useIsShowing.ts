import { useSyncExternalStore } from 'react'
import type { Box } from 'safebyok'

const unsubscribeFromNothing = () => { /* nothing to unsubscribe from */ }
const subscribeToNothing = () => unsubscribeFromNothing

/** True while `box` is showing its whisper, and false when `box` is null. Re-renders when that changes. */
export const useIsShowing = (box: Box | null): boolean => (
  useSyncExternalStore(box?.subscribe ?? subscribeToNothing, () => box?.isShowing ?? false)
)
