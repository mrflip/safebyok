/** The persisters a device keeps its caches in between page loads: TanStack Query's own interface, and one in memory. */

import type { PersistedClient, Persister } from '@tanstack/query-persist-client-core'

export type { PersistedClient, Persister } from '@tanstack/query-persist-client-core'

// == [The plug]: DevicePersisters, isPersister

/** Where a device keeps its two caches between page loads, a TanStack Query `Persister` for each: `roots`, every user and bank's bank, main gate and root box, and `boxes`, the boxes and their listings.
 * Each keeps one snapshot of everything in its cache, which the device restores at `hello`. It is handed the whole
 * snapshot at every change to the cache: over slow storage, throttle the writes, as TanStack's stock persisters do.
 */
export type DevicePersisters = Readonly<{ roots: Persister, boxes: Persister }>

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
