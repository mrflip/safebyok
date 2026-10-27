import { createStore, del, delMany, entries, get, keys, set, clear, update, type UseStore } from 'idb-keyval'
import type { DeviceRecord, LeaseRecord } from './shapes/device'
import * as Scopepath from './scopepath'
import { DeviceDB } from './device-db'
import { parseDbName, type IdbOpts } from './idb-opts'
import * as ChangeBell from './change-bell'
import { Validator } from './checks/validator'

export type { IdbOpts } from './idb-opts'
export * as ChangeBell from './change-bell'

/** `safebyok/idb`: the device store over this browser's IndexedDB, the only browser storage that can keep a non-extractable leaseKey.
 * Importing it is safe anywhere: it touches IndexedDB only when the store is used. It loads
 * `idb-keyval`, about 600 bytes. It also exports {@link ChangeBell}, which its writes ring. The
 * IndexedDB vault store is a package of its own, `safebyok-indexeddb`.
 *
 * Each maker refuses 'bad_option' for a `dbName` that is not non-empty text, or an option it does
 * not take.
 */

// One UseStore per dbName, shared by stores and inspectors alike: idb-keyval opens the
// underlying database lazily, so making these is free until something reads or writes. Each use
// meets the guard first: a context with no IndexedDB at all (storage turned off, or a runtime
// without it) is said as the browser says a storage it does not offer.
const shelfStores = new Map<string, UseStore>()
const shelfStore = (dbName: string): UseStore => {
  if (typeof indexedDB === 'undefined' || (indexedDB as IDBFactory | null) === null) { throw noIndexedDB() }
  const kept = shelfStores.get(dbName)
  if (kept !== undefined) { return kept }
  const fresh = createStore(`${dbName}:device_db`, 'records')
  shelfStores.set(dbName, fresh)
  return fresh
}

/** The error for a context with no IndexedDB: a `NotSupportedError` DOMException, or a plain Error of that name where there is no DOMException. */
const noIndexedDB = (): Error => {
  const message = 'This context offers no IndexedDB, so the device store has nowhere to keep its records.'
  if (typeof DOMException === 'function') { return new DOMException(message, 'NotSupportedError') }
  return new NotSupportedError(message)
}

/** A `NotSupportedError` for a runtime with no DOMException to make one. */
class NotSupportedError extends Error {
  override readonly name = 'NotSupportedError'
}

// The device shelf's change bell: every write rings it, here and in every other tab. Its name is
// shared with every other tab, and with any other version of this package running in one.
const bellnameOf = (dbName: string) => `safebyok-idb:${dbName}:device_db`

/** A {@link DeviceDB} over this browser's IndexedDB, keeping the leaseKey as a handle by structured clone, never as bytes.
 * Each write rings its change bell, in this tab and every other. A row under any scopepath but a
 * lease's or a device record's, an earlier version's among them, is deleted unread at the next
 * read or erase of a lease. A context with no IndexedDB meets 'storage_blocked' at first use.
 *
 * @example
 *   const deviceDB = idbDeviceDB()
 *   await deviceDB.getLease({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })  // { ok: true, val: null }
 * @example
 *   await deviceDB.getDeviceRecord({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })   // { ok: true, val: null }
 */
export const idbDeviceDB = (opts?: IdbOpts): DeviceDB => new IdbDeviceDB(parseDbName(opts, 'idbDeviceDB'))

/** The DeviceDB {@link idbDeviceDB} makes, over the shelf of `dbName`: each `do*` method one IndexedDB transaction, or two side by side. */
class IdbDeviceDB extends DeviceDB {
  /** The database whose shelf holds the rows. */
  readonly #dbName: string

  constructor(dbName: string) {
    super()
    this.#dbName = dbName
  }

  protected async doGetLease(leaseScopepath: Scopepath.LeaseScopepath): Promise<unknown> {
    // The read is asked for first, so it lands where this call was made among the scope's other
    // calls; the sweep of stray rows goes beside it, after.
    const [raw] = await Promise.all([get<unknown>(leaseScopepath, this.#shelf()), this.#sweepStrays()])
    return raw
  }

  protected async doPutLease(leaseScopepath: Scopepath.LeaseScopepath, record: LeaseRecord): Promise<void> {
    await set(leaseScopepath, record, this.#shelf())
    this.#ring()
  }

  // The scope's own lease goes first, so a sweep that fails never keeps a lock from revoking it.
  protected async doDelLease(leaseScopepath: Scopepath.LeaseScopepath): Promise<void> {
    await del(leaseScopepath, this.#shelf())
    this.#ring()
    await this.#sweepStrays()
  }

  protected async doGetDeviceRecord(deviceScopepath: Scopepath.DeviceScopepath): Promise<unknown> {
    return await get<unknown>(deviceScopepath, this.#shelf())
  }

  // Read and written in one transaction, so two tabs raising at once never lower each other's.
  protected async doRaiseDeviceRecord(deviceScopepath: Scopepath.DeviceScopepath, raisedFrom: (stored: unknown) => DeviceRecord): Promise<void> {
    await update<unknown>(deviceScopepath, raisedFrom, this.#shelf())
    this.#ring()
  }

  protected async doDelDeviceRecord(deviceScopepath: Scopepath.DeviceScopepath): Promise<void> {
    await del(deviceScopepath, this.#shelf())
    this.#ring()
  }

  // The shelf holds leases and device records and nothing else, so erasing them all
  // is clearing it: any row an earlier version filed under another ckey goes too.
  protected async doDelAll(): Promise<void> {
    await clear(this.#shelf())
    this.#ring()
  }

  protected async doDelUnreadable(scopepath: string, isReadable: (row: unknown) => boolean): Promise<void> {
    await this.#shelf()('readwrite', (objects) => (
      new Promise<void>((resolve, reject) => {
        const reading = objects.get(scopepath)
        reading.addEventListener('error', () => { reject(reading.error ?? new Error('IndexedDB could not read a row it found unreadable.')) })
        reading.addEventListener('success', () => {
          if (! isReadable(reading.result)) { objects.delete(scopepath) }
          resolve()
        })
      })
    ))
    this.#ring()
  }

  #shelf(): UseStore { return shelfStore(this.#dbName) }

  #ring() { ChangeBell.ring(bellnameOf(this.#dbName)) }

  // A row under any scopepath but a lease's or a device record's is one this version did not file:
  // an earlier version's (`unlock^…` before the lease, `mark^…` before the device record,
  // `["unlock","acme","u1","main"]` before the joined scopepaths), or one under a name no scope
  // check passes. Nothing else would ever reach, expire or erase it. It is deleted unread, so an
  // old record never outlives the lock that should revoke it.
  async #sweepStrays() {
    const ckeys = await keys(this.#shelf())
    const strays = ckeys.filter((ckey) => ! Scopepath.isLease(ckey) && ! Scopepath.isDevice(ckey))
    if (strays.length === 0) { return }
    await delMany(strays, this.#shelf())
    this.#ring()
  }
}

/** One stored row, as {@link inspectIdbDeviceDB} reports it: its scopepath and the raw stored value. */
export type IdbRow = { scopepath: string, row: unknown }

/** What an inspector's `subscribe` is handed: a function to call after each write. Its `parse` refuses 'bad_option'. */
const { ListenerShape } = Validator('bad_option', ({ fn }) => ({ ListenerShape: fn<() => void>() }))

/** A window onto the rows {@link idbDeviceDB} keeps, as stored, for inspectors and debug panels: the raw rows, a change bell and a wipe.
 * `safebyok-indexeddb`'s `inspectIdbVaultDB` is the vault store's. Unlike the store, its `rows()`
 * and `wipe()` reject, with a `NotSupportedError` where there is no IndexedDB.
 *
 * @example
 *   const inspector = inspectIdbDeviceDB({ dbName: 'acme' })
 *   const rows = await inspector.rows()
 *   const stop = inspector.subscribe(() => { void inspector.rows().then(render) })
 */
export const inspectIdbDeviceDB = (opts?: IdbOpts) => {
  const dbName = parseDbName(opts, 'inspectIdbDeviceDB')
  return {
    /** Every stored row on the shelf, sorted by scopepath. */
    rows: async (): Promise<IdbRow[]> => {
      const stored = await entries(shelfStore(dbName))
      return stored
        .filter((pair): pair is [string, unknown] => typeof pair[0] === 'string')
        .map(([scopepath, row]) => ({ scopepath, row }))
        .toSorted((one, two) => one.scopepath.localeCompare(two.scopepath))
    },
    /** Call `listener` after any write to the shelf, in this tab or another, returning the unsubscribe. Throws 'bad_option' for a `listener` that is no function. */
    subscribe: (listener: () => void): (() => void) => {
      ListenerShape.parse(listener)
      return ChangeBell.listen(bellnameOf(dbName), listener)
    },
    /** Erase every row on the shelf: every lease and device record in this database. */
    wipe: async (): Promise<void> => {
      await clear(shelfStore(dbName))
      ChangeBell.ring(bellnameOf(dbName))
    },
  }
}
