/** The shelf: the one object store of an IdbVaultDB's database, where each vault row and box row is filed under an array scopepath. */

import { createStore, promisifyRequest, type UseStore } from 'idb-keyval'
import type { BankScope, BoxQuery, VaultQuery, VaultScope } from 'safebyok/storage'

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

// == [The database]: shelfOf, filedIn, Filed

/** The shelf of the database `dbName`, opened on its first transaction. */
export const shelfOf = (dbName: string): UseStore => createStore(`${dbName}:vaults`, 'rows')

/** A row as the shelf files it: its scopepath, and the row as stored. */
export type Filed = { scopepath: IDBValidKey, row: unknown }

/** Every row filed in `range`, in scopepath order. */
export const filedIn = async (store: IDBObjectStore, range: IDBKeyRange): Promise<Filed[]> => {
  const [scopepaths, rows] = await Promise.all([promisifyRequest(store.getAllKeys(range)), promisifyRequest<unknown[]>(store.getAll(range))])
  return scopepaths.map((scopepath, idx) => ({ scopepath, row: rows[idx] }))
}
// --
