import { clear, createStore, del, entries, get, set, update, type UseStore } from 'idb-keyval'
import { parseDbName, type IdbOpts } from '../idb-opts'
import { DeviceDB, type DeviceRow, type FoundRow } from './devicedb'

/** A {@link DeviceDB} over this browser's IndexedDB, the only browser storage that can keep a non-extractable leaseKey: it keeps the leaseKey as a handle by structured clone, never as bytes.
 * Its rows lie in a database of their own, `<dbName>:devicedb`, apart from the one `safebyok/idb`'s
 * device store keeps. Making it touches no IndexedDB; a context with none meets 'storage_blocked' at
 * first use. Refuses 'bad_option' for a `dbName` that is not non-empty text, or an option it does
 * not take.
 *
 * @example
 *   const deviceDB = idbDeviceDB({ dbName: 'acme' })
 *   await deviceDB.getLease({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })  // null
 */
export const idbDeviceDB = (opts?: IdbOpts): DeviceDB => new IdbDeviceDB(parseDbName(opts, 'idbDeviceDB'))

// One UseStore per dbName: idb-keyval opens the database lazily, so making one is free until
// something reads or writes. Each use meets the guard first: a context with no IndexedDB at all is
// said as the browser says a storage it does not offer.
const shelves = new Map<string, UseStore>()
const shelfOf = (dbName: string): UseStore => {
  if (typeof indexedDB === 'undefined' || (indexedDB as IDBFactory | null) === null) { throw noIndexedDB() }
  const cached = shelves.get(dbName)
  if (cached !== undefined) { return cached }
  const fresh = createStore(`${dbName}:devicedb`, 'rows')
  shelves.set(dbName, fresh)
  return fresh
}

/** The error for a context with no IndexedDB: a `NotSupportedError` DOMException, or a plain Error of that name where there is no DOMException. */
const noIndexedDB = (): Error => {
  const message = "This context offers no IndexedDB, so the device store has nowhere to keep its rows."
  if (typeof DOMException === 'function') { return new DOMException(message, 'NotSupportedError') }
  return new NotSupportedError(message)
}

/** A `NotSupportedError` for a runtime with no DOMException to make one. */
class NotSupportedError extends Error {
  override readonly name = 'NotSupportedError'
}

/** The DeviceDB {@link idbDeviceDB} makes, over the shelf of `dbName`: each `do*` method one IndexedDB transaction. */
class IdbDeviceDB extends DeviceDB {
  readonly #dbName: string

  constructor(dbName: string) {
    super()
    this.#dbName = dbName
  }

  protected async doGet(scopepath: string): Promise<unknown> {
    return await get<unknown>(scopepath, this.#shelf())
  }

  protected async doPut(scopepath: string, row: DeviceRow): Promise<void> {
    await set(scopepath, row, this.#shelf())
  }

  protected async doUpdate(scopepath: string, updatedFrom: (stored: unknown) => DeviceRow): Promise<void> {
    await update<unknown>(scopepath, updatedFrom, this.#shelf())
  }

  protected async doDel(scopepath: string): Promise<void> {
    await del(scopepath, this.#shelf())
  }

  // The shelf holds a few rows per vault, so a find reads them all and keeps those under the prefix.
  protected async doFind(prefix: string): Promise<readonly FoundRow[]> {
    const stored = await entries<IDBValidKey, unknown>(this.#shelf())
    return stored
      .filter((pair): pair is [string, unknown] => typeof pair[0] === 'string' && pair[0].startsWith(prefix))
      .map(([scopepath, row]) => ({ scopepath, row }))
  }

  protected async doDelDamaged(scopepath: string, isSound: (row: unknown) => boolean): Promise<void> {
    await this.#shelf()('readwrite', (rows) => (
      new Promise<void>((resolve, reject) => {
        const getting = rows.get(scopepath)
        getting.addEventListener('error', () => { reject(getting.error ?? new Error("IndexedDB could not read a row it found damaged.")) })
        getting.addEventListener('success', () => {
          if (! isSound(getting.result)) { rows.delete(scopepath) }
          resolve()
        })
      })
    ))
  }

  protected async doDelAll(): Promise<void> {
    await clear(this.#shelf())
  }

  #shelf(): UseStore { return shelfOf(this.#dbName) }
}
