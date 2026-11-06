/** The shelf: the one object store of an IdbVaultDB's database, where each vault row and box row is filed under an array scopepath. */

import { createStore, promisifyRequest, type UseStore } from 'idb-keyval'
import * as SX from 'safebyok/storage'
import type { BankScope, BoxQuery, VaultError, VaultQuery, VaultScope } from 'safebyok/storage'

// == [Scopepaths]: VaultScopepath, BoxScopepath, vaultScopepathOf, boxScopepathOf, vaultlabelOf, boxPlaceOf, vaultsRangeOf, lifeRangeOf, bankBoxesRangeOf

// The scopepaths are a stored contract: a vault already written is found by them. IndexedDB sorts
// an array above every string, so `[...prefix, []]` closes the range of every scopepath under `prefix`.

/** Where the shelf files a vault row. */
export type VaultScopepath = [tag: 'vault', applabel: string, user_id: string, vaultlabel: string]

/** Where the shelf files a box row, under the life of its vault. */
export type BoxScopepath = [tag: 'box', applabel: string, user_id: string, vaultlabel: string, vault_tok: string, boxlabel: string]

/** The scopepath of the vault row at `scope`. */
export const vaultScopepathOf = ({ applabel, user_id, vaultlabel }: VaultScope): VaultScopepath => ['vault', applabel, user_id, vaultlabel]

/** The scopepath of the box row at `asked`, under its `vault_tok`. */
export const boxScopepathOf = ({ applabel, user_id, vaultlabel, vault_tok, boxlabel }: BoxQuery): BoxScopepath => (
  ['box', applabel, user_id, vaultlabel, vault_tok, boxlabel]
)

/** The vaultlabel a vault row is filed under at `scopepath`. */
export const vaultlabelOf = (scopepath: IDBValidKey): string => (scopepath as VaultScopepath)[3]

/** The vaultlabel, life and boxlabel a box row is filed under at `scopepath`. */
export const boxPlaceOf = (scopepath: IDBValidKey): { vaultlabel: string, vault_tok: string, boxlabel: string } => {
  const filed = scopepath as BoxScopepath
  return { vaultlabel: filed[3], vault_tok: filed[4], boxlabel: filed[5] }
}

/** The key range of every scopepath beginning with `prefix`. */
const rangeUnder = (prefix: string[]): IDBKeyRange => IDBKeyRange.bound(prefix, [...prefix, []])

/** The key range of every vault row of the bank. */
export const vaultsRangeOf = ({ applabel, user_id }: BankScope): IDBKeyRange => rangeUnder(['vault', applabel, user_id])

/** The key range of every box row under one life of a vault. */
export const lifeRangeOf = ({ applabel, user_id, vaultlabel, vault_tok }: VaultQuery): IDBKeyRange => rangeUnder(['box', applabel, user_id, vaultlabel, vault_tok])

/** The key range of every box row of the bank, of every vault and life. */
export const bankBoxesRangeOf = ({ applabel, user_id }: BankScope): IDBKeyRange => rangeUnder(['box', applabel, user_id])
// --

// == [The database]: shelfOf, rowAt, filedIn, Filed, inOneStep, workOrAbandon, abortOf, abandon

/** The shelf of the database `dbName`, opened on its first transaction. */
export const shelfOf = (dbName: string): UseStore => createStore(`${dbName}:vaults`, 'rows')

/** The row filed at `scopepath`, or null for none. */
export const rowAt = async (store: IDBObjectStore, scopepath: IDBValidKey): Promise<unknown> => (
  (await promisifyRequest<unknown>(store.get(scopepath))) ?? null
)

/** A row as the shelf files it: its scopepath, and the row as stored. */
export type Filed = { scopepath: IDBValidKey, row: unknown }

/** Every row filed in `range`, in scopepath order. */
export const filedIn = async (store: IDBObjectStore, range: IDBKeyRange): Promise<Filed[]> => {
  const [scopepaths, rows] = await Promise.all([promisifyRequest(store.getAllKeys(range)), promisifyRequest<unknown[]>(store.getAll(range))])
  return scopepaths.map((scopepath, idx) => ({ scopepath, row: rows[idx] }))
}

/** What `work` returns, in one transaction on `shelf` that has committed, or the refusal saying what IndexedDB did instead. */
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

/** What `work` returns; if it throws instead, the transaction is aborted, so that none of its writes commit. */
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
  transaction.addEventListener('abort', () => { resolve(transaction.error ?? new DOMException(TransactionAborted, 'AbortError')) })
})

/** Aborts `transaction`, so that no request it holds commits; one already finished refuses, and has nothing to undo. */
const abandon = (transaction: IDBTransaction): void => {
  try {
    transaction.abort()
  } catch {
    // already committed or aborted
  }
}
// --

// == [Trouble]: troubleOf, and what each says

const NoIndexedDB = "This context has no IndexedDB, so the vault has nowhere to keep its rows: run it in a browser that offers IndexedDB."
const TransactionAborted = "An IndexedDB transaction was aborted before it committed, and wrote nothing: try again."
const DatabaseClosed = "The vault's IndexedDB database was closed under it, by the browser or another tab upgrading it: reload the page."
const StorageWithheld = "The browser withholds IndexedDB from this page (site data blocked, or a private window that keeps none), so the vault has nowhere to keep its rows."
const IndexedDBFailed = "IndexedDB failed while the vault was reading or writing its rows: try again shortly. IndexedDB's own error is this error's cause."

/** The refusal that says what went wrong in IndexedDB. */
const troubleOf = (err: unknown): VaultError => {
  if (SX.isVaultError(err)) { return err }
  if (typeof indexedDB === 'undefined') { return SX.storageUnavailable(err, NoIndexedDB) }
  const errname = (err instanceof Error) ? err.name : null
  if (errname === 'QuotaExceededError') { return SX.storageFull(err) }
  if (errname === 'AbortError') { return SX.storageUnavailable(err, TransactionAborted) }
  if (errname === 'InvalidStateError') { return SX.storageUnavailable(err, DatabaseClosed) }
  if (errname === 'SecurityError') { return SX.storageUnavailable(err, StorageWithheld) }
  return SX.storageUnavailable(err, IndexedDBFailed)
}
// --
