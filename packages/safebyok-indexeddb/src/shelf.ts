import { createStore, promisifyRequest, type UseStore } from 'idb-keyval'

/**
 * The shelf: the one IndexedDB object store this package keeps its rows in, `records` in the
 * database `<dbName>:vault_db`, opened through `idb-keyval` -- which opens it lazily, on the
 * first read or write, and makes it on first use. The name is a stored contract, like the
 * ckeys: it is where a vault already written is found.
 */

// One UseStore per dbName, shared by every adapter and inspector over it: making one is free
// until something reads or writes.
const shelves = new Map<string, UseStore>()

/**
 * The shelf of the database `dbName`, as `idb-keyval` hands one to its own calls.
 *
 * @example await get(bundleCkey(scope), shelfOf('acme'))
 */
export const shelfOf = (dbName: string): UseStore => {
  const kept = shelves.get(dbName)
  if (kept !== undefined) { return kept }
  const fresh = createStore(`${dbName}:vault_db`, 'records')
  shelves.set(dbName, fresh)
  return fresh
}

/**
 * The result of an IndexedDB request, or the outcome of a transaction, as a promise: `idb-keyval`'s
 * `promisifyRequest`, except that a transaction one of whose requests failed rejects with that
 * request's error, where the transaction's own is still null when the failure reaches it. A
 * failure the browser gives no error for at all (a transaction aborted from outside) rejects with
 * that null, which the VaultDB base class says as `storage_unavailable` with an Error for a cause.
 *
 * @example const standing = await settle<unknown>(store.get(ckey))
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

/**
 * `work`, run in one readwrite IndexedDB transaction over the shelf: what it reads and what it
 * writes go together, and no other tab's write lands in between, since IndexedDB runs readwrite
 * transactions over one store one after another. Resolves with what `work` resolves with, once
 * the transaction has committed; rejects, writing nothing, when `work` or any request in it
 * fails.
 *
 * `work` must wait only on the store's own requests (through {@link settle}): IndexedDB
 * commits a transaction as soon as it has no request pending, so awaiting anything else -- a
 * timer, a fetch, WebCrypto -- would end it midway, and its next request would throw.
 *
 * @param shelf - The shelf, from {@link shelfOf}.
 * @param work - The reads, the decision and the writes, against the transaction's store.
 *
 * @example
 *   const landed = await inOneTransaction(shelfOf('acme'), async (store) => {
 *     const standing = await settle(store.get(ckey))
 *     if (! meetsExpectation(standing)) { return false }
 *     store.put(record, ckey)
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
