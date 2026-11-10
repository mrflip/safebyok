/** One IndexedDB transaction: committed, or the refusal saying why not. */

import { promisifyRequest, type UseStore } from 'idb-keyval'
import * as Phrases from '../helpers/phrases'
import type { VaultError } from '../refusals/errors'
import { isVaultError } from '../refusals/errors'
import { storageBlocked, storageFull, storageUnavailable } from '../refusals/throwers'

// == [The transaction]: inOneStep, workOrAbandon, abortOf, abandon, rowAt

/** What `work` returns, once its transaction on `shelf` has committed. */
export const inOneStep = async <ValT>(shelf: UseStore, txMode: IDBTransactionMode, work: (store: IDBObjectStore) => ValT | Promise<ValT>): Promise<ValT> => {
  try {
    return await shelf(txMode, async (store) => {
      const ended = abortOf(store.transaction)
      const val = await workOrAbandon(store, work)
      const aborted = await ended
      if (aborted !== null) { throw aborted }
      return val
    })
  } catch (err) {
    throw troubleOf(err)
  }
}

// Every request `work` makes is awaited on the transaction's own requests alone: awaiting anything
// else (a timer, a fetch, WebCrypto) lets IndexedDB commit the transaction midway.

/** What `work` returns on `store`; if it throws, the transaction aborts. */
const workOrAbandon = async <ValT>(store: IDBObjectStore, work: (store: IDBObjectStore) => ValT | Promise<ValT>): Promise<ValT> => {
  try {
    return await work(store)
  } catch (err) {
    abandon(store.transaction)
    throw err
  }
}

/** Null once `transaction` commits, or the error it aborted with. */
const abortOf = (transaction: IDBTransaction): Promise<Error | null> => new Promise((resolve) => {
  transaction.addEventListener('complete', () => { resolve(null) })
  transaction.addEventListener('abort', () => { resolve(transaction.error ?? new DOMException(Phrases.TransactionAborted, 'AbortError')) })
})

/** Abort `transaction`, where it has not already committed. */
const abandon = (transaction: IDBTransaction): void => {
  try {
    transaction.abort()
  } catch {
    // already committed or aborted
  }
}

/** The row filed at `scopepath`, or null for none. */
export const rowAt = async (store: IDBObjectStore, scopepath: IDBValidKey): Promise<unknown> => (
  (await promisifyRequest<unknown>(store.get(scopepath))) ?? null
)
// --

// == [Trouble]: troubleOf

/** The refusal that says what went wrong in IndexedDB. */
const troubleOf = (err: unknown): VaultError => {
  if (isVaultError(err)) { return err }
  // A browser with IndexedDB switched off may have the global as null rather than leave it out.
  if ((typeof indexedDB === 'undefined') || ((indexedDB as IDBFactory | null) === null)) { return storageBlocked(err, Phrases.NoBrowserDatastore) }
  const errname = (err instanceof Error) ? err.name : null
  if (errname === 'QuotaExceededError') { return storageFull(err) }
  if (errname === 'AbortError') { return storageUnavailable(err, Phrases.TransactionAborted) }
  if (errname === 'InvalidStateError') { return storageUnavailable(err, Phrases.DatabaseClosed) }
  if (errname === 'SecurityError') { return storageBlocked(err) }
  return storageUnavailable(err, Phrases.BrowserDatastoreFailed)
}
// --
