import { clear, entries } from 'idb-keyval'
import { VaultError } from 'safebyok'
import { ChangeBell } from 'safebyok/idb'
import { bellnameOf, parseDbName, type IdbVaultDBOpts } from './idb-opts'
import { shelfOf } from './shelf'

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
 * @param opts - The database to look at: `dbName`, default 'safebyok'.
 * @returns The inspector. Kind 'bad_option' for a `dbName` that is not non-empty text, and from
 *   its `subscribe`, for a listener that is not a function.
 *
 * @example
 *   const inspector = inspectIdbVaultDB({ dbName: 'acme' })
 *   const rows = await inspector.rows()
 *   const stop = inspector.subscribe(() => { void inspector.rows().then(render) })
 */
export const inspectIdbVaultDB = (opts?: IdbVaultDBOpts): IdbVaultInspector => {
  const dbName = parseDbName(opts, 'inspectIdbVaultDB')
  return {
    rows: async () => {
      const stored = await entries(shelfOf(dbName))
      return stored
        .filter((pair): pair is [string, unknown] => typeof pair[0] === 'string')
        .map(([ckey, row]) => ({ ckey, row }))
        .toSorted((one, two) => one.ckey.localeCompare(two.ckey))
    },
    subscribe: (listener) => {
      if (typeof listener !== 'function') { throw new VaultError('bad_option', 'subscribe needs a listener function to call after each write.') }
      return ChangeBell.listen(bellnameOf(dbName), listener)
    },
    wipe: async () => {
      await clear(shelfOf(dbName))
      ChangeBell.ring(bellnameOf(dbName))
    },
  }
}
