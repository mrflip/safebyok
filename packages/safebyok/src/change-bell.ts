/** The change bell: how a write to a store in this browser tells every listener, in this tab and every other tab of the origin.
 * Import it whole: `import { ChangeBell } from 'safebyok/idb'`. A bell carries nothing, so a
 * listener reads again. Each listener hears a ring once. A store of your own over IndexedDB rings
 * a bell of its own name. A bell never holds a Node or Bun process open.
 */

import { DefaultLogger, asError } from './logger'
import { reportToPlatform } from './report-error'

const listenersByBell = new Map<string, Set<() => void>>()
const channels = new Map<string, BroadcastChannel>()

// Each listener is called on its own, after the ringing code has run on, and one that leaves before
// its turn comes is not called. One that throws silences no other, fails no write, and never
// escapes as an uncaught error, which would end a Node or Bun process: what it threw goes to the
// default logger, and to the platform's `reportError` where there is one.
const callEach = (listeners: Set<() => void> | undefined) => {
  listeners?.forEach((listener) => {
    queueMicrotask(() => {
      if (! listeners.has(listener)) { return }
      try {
        listener()
      } catch (err) {
        DefaultLogger.error("A listener of the change bell threw. The bell rang on, and every other listener was called; the listener is its author's to mend.", { call: 'ChangeBell' }, asError(err))
        reportToPlatform(err)
      }
    })
  })
}

/** Ring the bell named `bellname`, for its listeners in this tab and every other: ring it once a write has committed.
 * A tab with no listener of its own still rings the others.
 *
 * @param bellname - The bell's name, shared with every other tab and every version of the package
 *   that rings it.
 *
 * @example ChangeBell.ring('safebyok-idb:acme:vault_db')  // after a write to the acme vault shelf has committed
 */
export const ring = (bellname: string): void => {
  callEach(listenersByBell.get(bellname))
  channelOf(bellname)?.postMessage('changed')
  closeIfIdle(bellname)
}

/** Call `listener`, in a microtask of its own, whenever the bell named `bellname` rings in this tab or another; returns the unsubscribe.
 * Where there is no BroadcastChannel, only this tab's rings are heard. A listener that throws
 * silences no other: what it threw goes to the default logger, and to the platform's
 * `reportError` where there is one.
 *
 * @example
 *   const stop = ChangeBell.listen('safebyok-idb:acme:vault_db', () => { void refresh() })
 *   stop()
 */
export const listen = (bellname: string, listener: () => void): (() => void) => {
  channelOf(bellname)
  const listeners = listenersByBell.get(bellname) ?? new Set()
  listenersByBell.set(bellname, listeners)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    closeIfIdle(bellname)
  }
}

// The channel of `bellname`, opened on first use by a ring or a listener alike. None where the
// platform has no BroadcastChannel.
const channelOf = (bellname: string): BroadcastChannel | undefined => {
  if (typeof BroadcastChannel === 'undefined') { return undefined }
  const cached = channels.get(bellname)
  if (cached !== undefined) { return cached }
  const channel = new BroadcastChannel(bellname)
  channel.addEventListener('message', () => { callEach(listenersByBell.get(bellname)) })
  letProcessExit(channel)
  channels.set(bellname, channel)
  return channel
}

// Closes the channel of `bellname` once nothing in this tab listens to it. A message already posted
// is on its way to the other tabs: closing ends this tab's end only.
const closeIfIdle = (bellname: string) => {
  if ((listenersByBell.get(bellname)?.size ?? 0) > 0) { return }
  listenersByBell.delete(bellname)
  channels.get(bellname)?.close()
  channels.delete(bellname)
}

// Node's and Bun's BroadcastChannel holds its process open until it is closed, and a listener may
// keep one open for the life of the page; unref() lets the process exit regardless. A browser's
// has no unref, and needs none.
const letProcessExit = (channel: BroadcastChannel & { unref?: () => unknown }) => {
  if (typeof channel.unref === 'function') { channel.unref() }
}
