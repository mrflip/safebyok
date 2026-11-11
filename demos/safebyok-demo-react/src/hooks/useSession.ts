import { useSyncExternalStore } from 'react'
import type { Auth, Session } from '../lib/auth'

/** The current session from the demo's fake auth, or null while signed out. Re-renders when it changes. */
export const useSession = (auth: Auth): Session | null => (
  useSyncExternalStore(auth.subscribe, auth.getSnapshot)
)
