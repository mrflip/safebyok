import { useSyncExternalStore } from 'react'
import { type Session, getSession, subscribeSession } from '../lib/session'

/** Who is signed in to the demo, or null. Re-renders when it changes. */
export function useSession(): Session | null {
  return useSyncExternalStore(subscribeSession, getSession, getSession)
}
