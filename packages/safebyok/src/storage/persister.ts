/** The persisters a device keeps its caches in between page loads: TanStack Query's own interface, and one in memory. */

import type { PersistedClient, Persister } from '@tanstack/query-persist-client-core'
import type { BankScope } from '../shapes/shapes-stamps'

export type { PersistedClient, Persister } from '@tanstack/query-persist-client-core'

// == [The plug]: DevicePersisters, PersisterOfBank, isPersister, PersisterMembernames

/** Where a device keeps its two caches between page loads, through TanStack Query `Persister`s.
 * `roots` keeps every user and bank's bank, main gate and root box, and the device restores it at `hello`. `boxes` gives
 * the persister of one bank's boxes and their listings, and the device restores the signed-in bank's at `signIn`: give
 * each bank a record of its own, say `boxes:<userid>:<banklabel>`. Every bank's record stays stored until the host
 * removes it.
 * A persister is handed its whole snapshot at every change to the cache: over slow storage, throttle the writes, as
 * TanStack's stock persisters do. The device tells its `onBadNews` of a restore that fails, and nothing of a save: have
 * each persister report a failed save where `onBadNews` reports.
 * @example
 * const persisters = {
 *   roots: new IdbPersister({ recordlabel: 'roots', onBadNews: reportRefusal }),
 *   boxes: ({ userid, banklabel }) => new IdbPersister({ recordlabel: `boxes:${userid}:${banklabel}`, onBadNews: reportRefusal }),
 * }
 * const device = Device.make(record, { vaultDB, persisters, onBadNews: ({ news }) => { reportRefusal(news) } })
 */
export type DevicePersisters = Readonly<{ roots: Persister, boxes: PersisterOfBank }>

/** The `Persister` of the boxes of the bank at `scope`, as {@link DevicePersisters} takes it. Called once, at `signIn`. */
export type PersisterOfBank = (scope: BankScope) => Persister

/** True for an object with a function for each of a `Persister`'s three members. */
export function isPersister(val: unknown): val is Persister {
  if (typeof val !== 'object' || val === null) { return false }
  const members: Partial<Record<string, unknown>> = val
  return PersisterMembernames.every((membername) => typeof members[membername] === 'function')
}

/** The members of a `Persister`, each a function. */
const PersisterMembernames = ['persistClient', 'restoreClient', 'removeClient'] as const
// --

// == [In memory]: MemoryPersister

// Stored by structured clone, as IndexedDB stores an object: what it restores is a copy, frozen nowhere.
/** A persister in this tab's memory, gone when the tab closes: hand one to each of a device's {@link DevicePersisters}, then to a second device, to stand in for a page reload. */
export class MemoryPersister implements Persister {
  // == [Props]: #persisted

  /** The snapshot last saved, or undefined for none. */
  #persisted: PersistedClient | undefined = undefined
  // --

  // == [Persisting]: persistClient, restoreClient, removeClient

  /** Keep a copy of `persisted`, in place of any snapshot kept before. */
  persistClient(persisted: PersistedClient): void { this.#persisted = structuredClone(persisted) }

  /** A copy of the snapshot last saved, or undefined for none. */
  restoreClient(): PersistedClient | undefined { return structuredClone(this.#persisted) }

  /** Forget the snapshot kept. */
  removeClient(): void { this.#persisted = undefined }
  // --
}
// --
