/** The shelf: the single object store of an IdbVaultDB's database. Each row is keyed by an array scopepath. */

import { promisifyRequest, type UseStore } from 'idb-keyval'
import { VaultsDBVersion, versionedShelfOf } from 'safebyok/storage'
import type { BankScope, BoxQuery, VaultQuery, VaultScope } from 'safebyok/storage'

// == [Scopepaths]: VaultScopepath, BoxScopepath, vaultScopepathOf, boxScopepathOf, vaultlabelOf, boxPlaceOf, vaultsRangeOf, lifeRangeOf, bankBoxesRangeOf

// The scopepaths are a stored contract: existing vaults are found by them, so changing one orphans stored rows.
// IndexedDB sorts any array after every string, so `[...prefix, []]` is an upper bound for every scopepath that starts with `prefix`.

/** The shelf key of a vault row. */
export type VaultScopepath = [tag: 'vault', user_id: string, banklabel: string, vaultlabel: string]

/** The shelf key of a box row. It includes the `vault_tok`, so each life of a vault has its own boxes. */
export type BoxScopepath = [tag: 'box', user_id: string, banklabel: string, vaultlabel: string, vault_tok: string, boxlabel: string]

/** The scopepath of the vault row at `scope`. */
export function vaultScopepathOf({ user_id, banklabel, vaultlabel }: VaultScope): VaultScopepath { return ['vault', user_id, banklabel, vaultlabel] }

/** The scopepath of the box row that `asked` names. */
export function boxScopepathOf({ user_id, banklabel, vaultlabel, vault_tok, boxlabel }: BoxQuery): BoxScopepath {
  return ['box', user_id, banklabel, vaultlabel, vault_tok, boxlabel]
}

/** The vaultlabel in a vault row's `scopepath`. */
export function vaultlabelOf(scopepath: IDBValidKey): string { return (scopepath as VaultScopepath)[3] }

/** The vaultlabel, `vault_tok` and boxlabel in a box row's `scopepath`. */
export function boxPlaceOf(scopepath: IDBValidKey): { vaultlabel: string, vault_tok: string, boxlabel: string } {
  const filed = scopepath as BoxScopepath
  return { vaultlabel: filed[3], vault_tok: filed[4], boxlabel: filed[5] }
}

/** The key range of every scopepath beginning with `prefix`. */
function rangeUnder(prefix: string[]): IDBKeyRange { return IDBKeyRange.bound(prefix, [...prefix, []]) }

/** The key range of every vault row of the bank. */
export function vaultsRangeOf({ user_id, banklabel }: BankScope): IDBKeyRange { return rangeUnder(['vault', user_id, banklabel]) }

/** The key range of every box row under one life of a vault. */
export function lifeRangeOf({ user_id, banklabel, vaultlabel, vault_tok }: VaultQuery): IDBKeyRange { return rangeUnder(['box', user_id, banklabel, vaultlabel, vault_tok]) }

/** The key range of every box row of the bank, across all its vaults and their lives. */
export function bankBoxesRangeOf({ user_id, banklabel }: BankScope): IDBKeyRange { return rangeUnder(['box', user_id, banklabel]) }
// --

// == [The database]: shelfOf, filedIn, Filed

/** The shelf of the vault database named `dbName`. */
export function shelfOf(dbName: string): UseStore {
  return versionedShelfOf({
    dbName, dbstem: 'vaults', version: VaultsDBVersion, storename: 'rows', oldnames: [`${dbName}:vaults`],
  })
}

/** A stored row, with its scopepath. */
export type Filed = { scopepath: IDBValidKey, row: unknown }

/** Every row in `range`, in scopepath order. */
export async function filedIn(store: IDBObjectStore, range: IDBKeyRange): Promise<Filed[]> {
  const [scopepaths, rows] = await Promise.all([promisifyRequest(store.getAllKeys(range)), promisifyRequest<unknown[]>(store.getAll(range))])
  return scopepaths.map((scopepath, idx) => ({ scopepath, row: rows[idx] }))
}
// --
