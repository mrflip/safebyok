import { Global, asThrown } from './global'

/**
 * The change bell: how a write to a store in this browser tells everyone listening to it, in this
 * tab and in every other. Listeners in this tab hear the bell directly; a BroadcastChannel of the
 * bell's name carries it to the other tabs of this origin (a channel never echoes to its own
 * sender, so nothing hears twice). The bell carries nothing: a listener's only news is that
 * something changed, and it reads again. `idbDeviceDB` rings one, and `safebyok-indexeddb`'s
 * vault store another; a store of your own over IndexedDB rings one of its own name. Import it
 * whole, from `safebyok/idb`: `import { ChangeBell } from 'safebyok/idb'`.
 *
 * The channel lives only while it has work: it is closed when its last listener in this tab leaves,
 * and a ring that finds no listener in this tab opens one to tell the other tabs and closes it
 * again, so a tab that only writes still rings the others. Where a platform's channel holds a Node
 * or Bun process open, it is also unref'd, so a process exits when its own work is done.
 */

const listenersByBell = new Map<string, Set<() => void>>()
const channels = new Map<string, BroadcastChannel>()

// Each listener is called on its own, after the ringing code has run on, and one that leaves before
// its turn comes is not called. One that throws silences no other, fails no write, and never
// escapes as an uncaught error, which would end a Node or Bun process: what it threw goes to the
// global logger, `Global.logger` (the bell has no logger of its own to hand).
const callEach = (listeners: Set<() => void> | undefined) => {
  listeners?.forEach((listener) => {
    queueMicrotask(() => {
      if (! listeners.has(listener)) { return }
      try {
        listener()
      } catch (err) {
        Global.logger.error('A listener of the change bell threw. The bell rang on, and every other listener was called.', { call: 'ChangeBell' }, asThrown(err))
      }
    })
  })
}

/**
 * Rings the bell named `bellname`: every listener to it in this tab, and over the BroadcastChannel
 * of that name, every other tab's. Ring it once a write has committed.
 *
 * @param bellname - The bell, and its channel's name, shared with every other tab: the same in
 *   each version of the package that rings it.
 *
 * @example ChangeBell.ring('safebyok-idb:acme:vault_db')  // after a write to the acme vault shelf has committed
 */
export const ring = (bellname: string): void => {
  callEach(listenersByBell.get(bellname))
  channelOf(bellname)?.postMessage('changed')
  closeIfIdle(bellname)
}

/**
 * Calls `listener` whenever the bell named `bellname` rings, from this tab or another; returns the
 * unsubscribe. Where there is no BroadcastChannel, only this tab's rings are heard.
 *
 * @param bellname - The bell to listen to.
 * @param listener - What to call, with nothing, on each ring.
 * @returns The unsubscribe: once the last listener of this tab leaves, its channel closes.
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
  const kept = channels.get(bellname)
  if (kept !== undefined) { return kept }
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
