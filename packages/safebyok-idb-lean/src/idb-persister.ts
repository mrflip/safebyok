/** IdbPersister: a TanStack Query `Persister` that keeps a snapshot in this browser's IndexedDB. */

import { noop, throttle, type ThrottledFunction } from 'es-toolkit'
import { del, get, set, type UseStore } from 'idb-keyval'
import type { VaultError } from 'safebyok'
import * as DB from 'safebyok/storage'
import type { PersistedClient, Persister } from 'safebyok/storage'
import { persistShelfOf } from './persist-shelf'

// == [Options]: IdbPersisterOpts, idbPersisterOpts

/** Options for {@link IdbPersister}:
 * - `recordlabel` -- names the record the snapshot is kept in; give each of a device's persisters its own, say `roots:<userid>:<banklabel>` and `boxes:<userid>:<banklabel>` for each bank's two
 * - `dbName`     -- scopes the database name: `safebyok-<dbName>:…`, or `safebyok:…` if left out
 * - `throttleMs` -- the least time between two writes to IndexedDB (default: 1000)
 * - `onBadNews`  -- called with the refusal of each write that fails (default: a no-op)
 */
export type IdbPersisterOpts = {
  recordlabel: string
  dbName?:     string | undefined
  throttleMs?: number | undefined
  onBadNews?:  ((news: VaultError) => void) | undefined
}

/** The check of {@link IdbPersisterOpts}. */
const idbPersisterOpts = DB.objCheck(({ str, num, custom }) => ({
  recordlabel: str.min(1),
  dbName:     str.min(1).optional(),
  throttleMs: num.int().min(0).optional(),
  onBadNews:  custom<(news: VaultError) => void>((val) => typeof val === 'function', 'An IdbPersister takes a function for its onBadNews.').optional(),
}), 'bad_record')
// --

/** A `Persister` that stores its snapshot in IndexedDB, as an object, at the record `recordlabel`.
 * It is handed the whole snapshot at every change to a cache, so it writes the latest at most once per `throttleMs`: the first at once, then the newest after each wait.
 */
export class IdbPersister implements Persister {
  // == [Props]: #shelf, #recordlabel, #persistThrottled

  readonly #shelf: UseStore
  readonly #recordlabel: string
  readonly #persistThrottled: ThrottledFunction<(persisted: PersistedClient) => void>
  // --

  // == [Construction]: constructor

  constructor(opts: IdbPersisterOpts) {
    const { recordlabel, dbName, throttleMs = 1000, onBadNews = noop } = idbPersisterOpts.parse(opts, { where: "In IdbPersister's options" })
    this.#shelf            = persistShelfOf(dbName)
    this.#recordlabel      = recordlabel
    this.#persistThrottled = throttle((persisted: PersistedClient) => {
      void this.#save(persisted, onBadNews)
    }, throttleMs)
  }
  // --

  // == [Writing]: #save

  /** Store `persisted`, telling `onBadNews` if IndexedDB refuses. */
  async #save(persisted: PersistedClient, onBadNews: (news: VaultError) => void): Promise<void> {
    try { await set(this.#recordlabel, persisted, this.#shelf) } catch (err) { onBadNews(DB.storageRefusalOf(err)) }
  }
  // --

  // == [Persisting]: persistClient, restoreClient, removeClient

  /** Store `persisted` in place of the snapshot stored, once the throttle allows. */
  persistClient(persisted: PersistedClient): void { this.#persistThrottled(persisted) }

  /** The snapshot stored, or undefined for none. */
  async restoreClient(): Promise<PersistedClient | undefined> { return await get<PersistedClient>(this.#recordlabel, this.#shelf) }

  /** Delete the snapshot stored, and any write the throttle still holds. */
  async removeClient(): Promise<void> {
    this.#persistThrottled.cancel()
    await del(this.#recordlabel, this.#shelf)
  }
  // --
}
