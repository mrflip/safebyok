import { VaultError, parseLogger } from 'safebyok'
import { ChangeBell } from 'safebyok/idb'
import { bellnameOf, parseDbName, type IdbVaultDBOpts } from './idb-opts'
import { inOneTransaction, settle, shelfOf } from './shelf'

/** One stored row, as {@link inspectIdbVaultDB} reports it: its ckey and the raw stored record. */
export type IdbRow = { ckey: string, row: unknown }

/** A window onto the vault shelf, as {@link inspectIdbVaultDB} hands one out. */
export type IdbVaultInspector = {
  /** Every stored row on the shelf, sorted by ckey. */
  rows(): Promise<IdbRow[]>
  /** Calls `listener` after any write to the shelf, this tab or another; returns the unsubscribe. */
  subscribe(listener: () => void): () => void
  /** Removes every row on the shelf: every vault kept in this database, of every user. */
  wipe(): Promise<void>
}

/**
 * A window onto the rows `idbVaultDB` keeps, for inspectors and debug panels: the raw
 * records, a change bell, and a wipe. What it reports is what is actually stored, without asking
 * any vault's opinion -- which is how a demo shows "what the backend sees".
 *
 * @param opts - The database to look at: `dbName`, default 'safebyok'; and optionally the
 *   `logger` that hears of a `subscribe` listener that throws, the console without one.
 * @returns The inspector. Kind 'bad_option' for a `dbName` that is not non-empty text, or a
 *   `logger` that is not a VaultLogger, and from its `subscribe`, for a listener that is not a
 *   function.
 *
 * @example
 *   const inspector = inspectIdbVaultDB({ dbName: 'acme' })
 *   const rows = await inspector.rows()
 *   const stop = inspector.subscribe(() => { void inspector.rows().then(render) })
 */
export const inspectIdbVaultDB = (opts?: IdbVaultDBOpts): IdbVaultInspector => {
  const dbName = parseDbName(opts, 'inspectIdbVaultDB')
  const logger = parseLogger(opts?.logger)
  return {
    rows: async () => {
      // Both reads in one transaction, so a ckey and its row are the same moment's.
      const [ckeys, stored] = await shelfOf(dbName)('readonly', (store) => Promise.all([settle<IDBValidKey[]>(store.getAllKeys()), settle<unknown[]>(store.getAll())]))
      return ckeys
        .map((ckey, idx): IdbRow => ({ ckey: ckey as string, row: stored[idx] }))
        .filter((row) => typeof row.ckey === 'string')
        .toSorted((one, two) => one.ckey.localeCompare(two.ckey))
    },
    subscribe: (listener) => {
      if (typeof listener !== 'function') { throw new VaultError('bad_option', 'subscribe needs a listener function to call after each write.') }
      return ChangeBell.listen(bellnameOf(dbName), listener, logger)
    },
    wipe: async () => {
      await inOneTransaction(shelfOf(dbName), async (store) => { await settle(store.clear()) })
      ChangeBell.ring(bellnameOf(dbName))
    },
  }
}
