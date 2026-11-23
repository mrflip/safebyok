/** `useIsHydrated`, for a kit form that must not be submitted before React has attached its handlers. */

import { useSyncExternalStore } from 'react'

// == [The hook]: useIsHydrated

/** False in a server render and while React hydrates it, true from then on, and true from the first render where nothing is hydrated. */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(subscribeToNothing, isHydratedInBrowser, isHydratedOnServer)
}
// --

// == [Helpers]: subscribeToNothing, isHydratedInBrowser, isHydratedOnServer

/** Subscribe to a store that never changes. */
function subscribeToNothing(): () => void { return unsubscribeFromNothing }

/** Undo {@link subscribeToNothing}. */
function unsubscribeFromNothing(): void { /* Nothing was subscribed. */ }

/** The snapshot in the browser. */
function isHydratedInBrowser(): boolean { return true }

/** The snapshot in a server render, which React also uses while it hydrates one. */
function isHydratedOnServer(): boolean { return false }
// --
