import { useSyncExternalStore } from 'react'
import type { Box } from 'safebyok'

const unsubscribeFromNothing = () => { /* nothing was heard */ }
const subscribeToNothing = () => unsubscribeFromNothing

/** Whether `box` shows its whisper, read live; false for no box. */
export const useIsShowing = (box: Box | null): boolean => (
  useSyncExternalStore(box?.subscribe ?? subscribeToNothing, () => box?.isShowing ?? false)
)
