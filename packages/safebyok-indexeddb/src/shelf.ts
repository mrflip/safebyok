import { createStore, promisifyRequest, type UseStore } from 'idb-keyval'
import { Refusals } from 'safebyok'

/** The shelf is the one object store, `records` in the database `<dbName>:vault_db`, holding every row.
 * Its name is a stored contract, like the scopepaths: a vault already written is found there.
 */

// One UseStore per dbName, shared by every adapter and inspector over it: making one is free
// until something reads or writes.
const shelves = new Map<string, UseStore>()

/** The shelf of the database `dbName`, as `idb-keyval`'s own calls take one.
 *
 * @example await get(Scopepath.vault(scope), shelfOf('acme'))
 */
export const shelfOf = (dbName: string): UseStore => {
  const kept = shelves.get(dbName)
  if (kept !== undefined) { return kept }
  const fresh = createStore(`${dbName}:vault_db`, 'records')
  shelves.set(dbName, fresh)
  return fresh
}

/** The shelf of the database `dbName` as a VaultDB reaches it, refusing `storage_blocked` where the browser withholds storage.
 * That is a failure `Refusals.isStorageBlocked` recognizes (site data blocked, no room left), the
 * browser's error its cause, or a context with no IndexedDB at all. Any other failure comes as it
 * came, for the VaultDB base class to say as `storage_unavailable`.
 *
 * @example await withheldShelfOf('acme')('readonly', (store) => settle(store.get(scopepath)))
 */
export const withheldShelfOf = (dbName: string): UseStore => async <ValT>(txMode: IDBTransactionMode, callback: (store: IDBObjectStore) => ValT | PromiseLike<ValT>): Promise<ValT> => {
  if (typeof indexedDB === 'undefined' || (indexedDB as IDBFactory | null) === null) {
    throw Refusals.storageBlocked('This context offers no IndexedDB, so the vault has nowhere to keep its records. Trying again will not help until that changes.')
  }
  try {
    return await shelfOf(dbName)(txMode, callback)
  } catch (err) {
    throw Refusals.isStorageBlocked(err) ? Refusals.storageBlocked(undefined, { cause: err }) : err
  }
}

/** The result of an IndexedDB request, or a transaction's completion, as a promise.
 * It is `idb-keyval`'s `promisifyRequest`, but a failed transaction rejects with the error of the
 * request that failed it, where the transaction's own error is still null. A failure the browser
 * gives no error for (a transaction aborted from outside) rejects with null, which the VaultDB
 * base class says as `storage_unavailable`.
 *
 * @example const stored = await settle<unknown>(store.get(scopepath))
 */
export const settle = async <ValT = undefined>(request: IDBRequest<ValT> | IDBTransaction): Promise<ValT> => {
  const target: EventTarget = request
  let failedRequestError: unknown = null
  target.addEventListener('error', (event) => {
    if (failedRequestError === null && event.target instanceof IDBRequest) { failedRequestError = event.target.error }
  })
  try {
    return await promisifyRequest<ValT>(request)
  } catch (err) {
    throw err ?? failedRequestError
  }
}

/** What `work` resolves, run in one readwrite transaction over `shelf`, once that has committed.
 * No other tab's write lands between its reads and its writes. It rejects, writing nothing, when
 * `work` or any request in it fails.
 *
 * `work` must await only the store's own requests, through {@link settle}. IndexedDB commits a
 * transaction once no request is pending, so awaiting a timer, a fetch or WebCrypto ends it
 * midway, and the next request throws.
 *
 * @example
 *   const landed = await inOneTransaction(shelfOf('acme'), async (store) => {
 *     const stored = await settle(store.get(scopepath))
 *     if (! meetsExpectation(stored)) { return false }
 *     store.put(record, scopepath)
 *     return true
 *   })
 */
export const inOneTransaction = <ValT>(shelf: UseStore, work: (store: IDBObjectStore) => Promise<ValT>): Promise<ValT> => (
  shelf('readwrite', async (store) => {
    let outcome: ValT
    try {
      outcome = await work(store)
    } catch (err) {
      abandon(store.transaction)
      throw err
    }
    await settle(store.transaction)
    return outcome
  })
)

// Undo every write `work` asked for before it failed: a request it placed would otherwise still
// commit. A transaction that a failed request has already aborted refuses a second abort, and
// has kept nothing either way.
const abandon = (transaction: IDBTransaction) => {
  try {
    transaction.abort()
  } catch {
    // already aborted
  }
}
