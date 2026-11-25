/** A fake Web Locks manager, for a test of a OneWatchVaultDB where Node has none. */

import { noop } from 'es-toolkit'

/** A Web Locks manager for the origin, exclusive and first come first served: `request(lockname, callback)` alone. */
export function fakeLockManager(): Pick<LockManager, 'request'> {
  const tails = new Map<string, Promise<void>>()
  const request = async (lockname: string, callback: () => Promise<void>): Promise<void> => {
    const prior = tails.get(lockname)
    let letGo = noop
    tails.set(lockname, new Promise<void>((resolve) => { letGo = resolve }))
    try {
      await prior
      await callback()
    } finally {
      letGo()
    }
  }
  return { request } as Pick<LockManager, 'request'>
}
