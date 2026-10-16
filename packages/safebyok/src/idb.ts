import { createStore, del, delMany, entries, get, keys, promisifyRequest, clear, update, type UseStore } from 'idb-keyval'
import { DeviceMark, DeviceUnlock } from './types'
import * as Ckeys from './ckeys'
import { keepingLocks, lockGenerationOf, lockedMeanwhile, type DeviceDB } from './device-db'
import { parseDbName, type IdbOpts } from './idb-opts'
import { VaultError } from './errors'
import * as ChangeBell from './change-bell'

export type { IdbOpts } from './idb-opts'
export * as ChangeBell from './change-bell'

/**
 * The device store over this browser's IndexedDB (through `idb-keyval`), as an entry point of its
 * own, `safebyok/idb`: device storage is exactly what IndexedDB is, and the only browser storage
 * that can hold a non-extractable localUnlockKey. Where a vault itself lives is a backend choice,
 * not a fact about the device, so the IndexedDB vault store is a package of its own,
 * `safebyok-indexeddb`.
 *
 * This entry point touches IndexedDB only when the store is used, so importing it is safe
 * anywhere; the store itself needs a browser (or anything else with `indexedDB`). It reaches
 * IndexedDB through `idb-keyval`, a regular dependency of about 600 bytes that only this entry
 * point loads. Beside the device store, it exports the change bell its writes ring,
 * {@link ChangeBell}, which `safebyok-indexeddb` rings too.
 */

// One UseStore per dbName, shared by stores and inspectors alike: idb-keyval opens the
// underlying database lazily, so making these is free until something reads or writes.
const shelfStores = new Map<string, UseStore>()
const shelfStore = (dbName: string): UseStore => {
  const kept = shelfStores.get(dbName)
  if (kept !== undefined) { return kept }
  const fresh = createStore(`${dbName}:device_db`, 'records')
  shelfStores.set(dbName, fresh)
  return fresh
}

// The device shelf's change bell: every write rings it, here and in every other tab. Its name is
// shared with every other tab, and with any other version of this package running in one.
const bellnameOf = (dbName: string) => `safebyok-idb:${dbName}:device_db`

/**
 * DeviceDB over this browser's IndexedDB: the real device storage. IndexedDB keeps the
 * DeviceUnlock record by structured clone, which is the only way a browser persists the
 * non-extractable localUnlockKey -- as a handle, never as bytes. Device marks share its shelf.
 *
 * A record that will not read back (damaged, or written by another version) reads as "no
 * remembered unlock", or no device mark, and is dropped: losing the convenience is the safe
 * failure. A row filed under an earlier version's ckey is deleted unread at the next read or
 * erase of a remembered unlock. Its rows are filed under `Ckeys`, names joined on `^`, and a
 * scope with a name holding one is refused with kind 'bad_label'. Kind 'bad_option' for a
 * `dbName` that is not non-empty text.
 *
 * @example
 *   const deviceDB = idbDeviceDB()
 *   await deviceDB.readUnlock({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })  // null
 * @example
 *   await deviceDB.readMark({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })    // null
 */
export const idbDeviceDB = (opts?: IdbOpts): DeviceDB => {
  const dbName = parseDbName(opts, 'idbDeviceDB')
  const shelf = () => shelfStore(dbName)
  const ring = () => { ChangeBell.ring(bellnameOf(dbName)) }

  // A row under any ckey but an unlock's or a mark's is one an earlier version filed
  // (`["unlock","acme","u1","main"]` before the joined ckeys), which nothing else would ever
  // reach, expire or erase. It is deleted unread, so an old remembered unlock never outlives the
  // lock that should forget it.
  const sweepStrays = async () => {
    const ckeys = await keys(shelf())
    const strays = ckeys.filter((ckey) => ! Ckeys.isUnlock(ckey) && ! Ckeys.isMark(ckey))
    if (strays.length === 0) { return }
    await delMany(strays, shelf())
    ring()
  }

  return {
    readUnlock: async (scope) => {
      await sweepStrays()
      const raw: unknown = await get(Ckeys.unlock(scope), shelf())
      if (raw === undefined || raw === null) { return null }
      const checked = DeviceUnlock.safeParse(raw)
      if (! checked.success) {
        await del(Ckeys.unlock(scope), shelf())
        ring()
        return null
      }
      return checked.data
    },

    // The mark is read and the unlock written in one transaction: a lock's raise of the mark lands
    // wholly before it or wholly after.
    writeUnlock: async (unlock, expected) => {
      const written = await shelf()('readwrite', async (records) => {
        const kept: unknown = await promisifyRequest(records.get(Ckeys.mark(unlock)))
        if (lockGenerationOf(kept) !== expected.lock_generation) { return false }
        records.put(unlock, Ckeys.unlock(unlock))
        await promisifyRequest(records.transaction)
        return true
      })
      if (! written) { throw lockedMeanwhile() }
      ring()
    },

    // The scope's own unlock goes first, so a sweep that fails never keeps a lock from forgetting it.
    eraseUnlock: async (scope) => {
      await del(Ckeys.unlock(scope), shelf())
      ring()
      await sweepStrays()
    },

    readMark: async (scope) => {
      const raw: unknown = await get(Ckeys.mark(scope), shelf())
      if (raw === undefined || raw === null) { return null }
      const checked = DeviceMark.safeParse(raw)
      if (! checked.success) {
        await del(Ckeys.mark(scope), shelf())
        ring()
        return null
      }
      return checked.data
    },

    writeMark: async (mark) => {
      await update(Ckeys.mark(mark), (kept: unknown) => keepingLocks(mark, kept), shelf())
      ring()
    },

    eraseMark: async (scope) => {
      await del(Ckeys.mark(scope), shelf())
      ring()
    },

    // The shelf holds remembered unlocks and device marks and nothing else, so forgetting them all
    // is clearing it: any row an earlier version filed under another ckey goes too.
    eraseAll: async () => {
      await clear(shelf())
      ring()
    },
  }
}

/** One stored row, as {@link inspectIdbDeviceDB} reports it: its ckey and the raw stored value. */
export type IdbRow = { ckey: string, row: unknown }

/**
 * A window onto the rows {@link idbDeviceDB} keeps, for inspectors and debug panels: the raw
 * rows, a change bell, and a wipe. This is how the demo shows what this device remembers without
 * asking the vault's opinion -- what it reports is what is actually stored. The vault store's
 * own rows have their window beside it, `inspectIdbVaultDB` from `safebyok-indexeddb`.
 *
 * @param opts - The database to look at: `dbName`, default 'safebyok'.
 * @returns The inspector. Kind 'bad_option' for a `dbName` that is not non-empty text, and from
 *   its `subscribe`, for a listener that is not a function.
 *
 * @example
 *   const inspector = inspectIdbDeviceDB({ dbName: 'acme' })
 *   const rows = await inspector.rows()
 *   const stop = inspector.subscribe(() => { void inspector.rows().then(render) })
 */
export const inspectIdbDeviceDB = (opts?: IdbOpts) => {
  const dbName = parseDbName(opts, 'inspectIdbDeviceDB')
  return {
    /** Every stored row on the shelf, sorted by ckey. */
    rows: async (): Promise<IdbRow[]> => {
      const stored = await entries(shelfStore(dbName))
      return stored
        .filter((pair): pair is [string, unknown] => typeof pair[0] === 'string')
        .map(([ckey, row]) => ({ ckey, row }))
        .toSorted((one, two) => one.ckey.localeCompare(two.ckey))
    },
    /** Calls `listener` after any write to the shelf, this tab or another; returns the unsubscribe. */
    subscribe: (listener: () => void): (() => void) => {
      if (typeof listener !== 'function') { throw new VaultError('bad_option', 'subscribe needs a listener function to call after each write.') }
      return ChangeBell.listen(bellnameOf(dbName), listener)
    },
    /** Remove every row on the shelf: every remembered unlock and device mark in this database. */
    wipe: async (): Promise<void> => {
      await clear(shelfStore(dbName))
      ChangeBell.ring(bellnameOf(dbName))
    },
  }
}
