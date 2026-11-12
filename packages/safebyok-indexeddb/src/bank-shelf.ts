/** The shelf: the single object store of an IdbBankDB's database. Each row is keyed by an array scopepath. */

import { promisifyRequest, type UseStore } from 'idb-keyval'
import { versionedShelfOf } from 'safebyok/storage'
import type { BankScope, BX, VaultScope } from 'safebyok/storage'

// == [The database]: BankDBVersion, shelfOf, filedIn, Filed

/** The layout version of the bank database: three zero-padded parts, so that a name sorts as its version does. */
export const BankDBVersion = '001-001-001'

// Every database this library writes starts `safebyok-`, so a host can tell them from its own.
/** The shelf of the bank database for the host's `dbName`, named `safebyok-<dbName>:bank-v<version>`. */
export function shelfOf(dbName: string): UseStore {
  return versionedShelfOf({ dbName: `safebyok-${dbName}`, dbstem: 'bank', version: BankDBVersion, storename: 'rows', oldnames: [] })
}

/** A stored row, with its scopepath. */
export type Filed = { scopepath: IDBValidKey, row: unknown }

/** Every row in `range`, in scopepath order. */
export async function filedIn(store: IDBObjectStore, range: IDBKeyRange): Promise<Filed[]> {
  const [scopepaths, rows] = await Promise.all([promisifyRequest(store.getAllKeys(range)), promisifyRequest<unknown[]>(store.getAll(range))])
  return scopepaths.map((scopepath, idx) => ({ scopepath, row: rows[idx] }))
}
// --

// == [Scopepaths]: BankScopepath, GateScopepath, VaultScopepath, BoxScopepath, bankScopepathOf, gateScopepathOf, vaultScopepathOf, boxScopepathOf, vaultlabelOf, boxPlaceOf, vaultsRangeOf, boxesRangeOf, lifeRangeOf, gatesRangeOf

// The scopepaths are a stored contract: existing rows are found by them, so changing one orphans stored rows.
// IndexedDB sorts any array after every string, so `[...prefix, []]` is an upper bound for every scopepath that starts with `prefix`.

/** The shelf key of a bank row. */
export type BankScopepath = [tag: 'bank', user_id: string, banklabel: string]

/** The shelf key of a gate row. */
export type GateScopepath = [tag: 'gate', user_id: string, banklabel: string, gatelabel: string]

/** The shelf key of a vault row. */
export type VaultScopepath = [tag: 'vault', user_id: string, banklabel: string, vaultlabel: string]

// The key holds both toks, so a box row under any other pair of lives is at another key, and a put under one cannot overwrite it.
/** The shelf key of a box row. It includes the `bank_tok` and `vault_tok`, so each life of a vault in each life of its bank has its own boxes. */
export type BoxScopepath = [tag: 'box', user_id: string, banklabel: string, vaultlabel: string, bank_tok: string, vault_tok: string, boxlabel: string]

/** The scopepath of the bank row at `scope`. */
export function bankScopepathOf({ user_id, banklabel }: BankScope): BankScopepath { return ['bank', user_id, banklabel] }

/** The scopepath of the gate row at `scope`. */
export function gateScopepathOf({ user_id, banklabel, gatelabel }: BankScope & { gatelabel: string }): GateScopepath { return ['gate', user_id, banklabel, gatelabel] }

/** The scopepath of the vault row at `scope`. */
export function vaultScopepathOf({ user_id, banklabel, vaultlabel }: VaultScope): VaultScopepath { return ['vault', user_id, banklabel, vaultlabel] }

/** The scopepath of the box row that `asked` names. */
export function boxScopepathOf({ user_id, banklabel, vaultlabel, bank_tok, vault_tok, boxlabel }: BX.BoxQuery): BoxScopepath {
  return ['box', user_id, banklabel, vaultlabel, bank_tok, vault_tok, boxlabel]
}

/** The vaultlabel in a vault row's `scopepath`. */
export function vaultlabelOf(scopepath: IDBValidKey): string { return (scopepath as VaultScopepath)[3] }

/** The vaultlabel, `bank_tok`, `vault_tok` and boxlabel in a box row's `scopepath`. */
export function boxPlaceOf(scopepath: IDBValidKey): { vaultlabel: string, bank_tok: string, vault_tok: string, boxlabel: string } {
  const filed = scopepath as BoxScopepath
  return { vaultlabel: filed[3], bank_tok: filed[4], vault_tok: filed[5], boxlabel: filed[6] }
}

/** The key range of every scopepath beginning with `prefix`. */
function rangeUnder(prefix: string[]): IDBKeyRange { return IDBKeyRange.bound(prefix, [...prefix, []]) }

/** The key range of every gate row of the bank. */
export function gatesRangeOf({ user_id, banklabel }: BankScope): IDBKeyRange { return rangeUnder(['gate', user_id, banklabel]) }

/** The key range of every vault row of the bank. */
export function vaultsRangeOf({ user_id, banklabel }: BankScope): IDBKeyRange { return rangeUnder(['vault', user_id, banklabel]) }

/** The key range of every box row of the bank, across all its vaults and their lives. */
export function boxesRangeOf({ user_id, banklabel }: BankScope): IDBKeyRange { return rangeUnder(['box', user_id, banklabel]) }

/** The key range of every box row under one life of a vault in one life of its bank. */
export function lifeRangeOf({ user_id, banklabel, vaultlabel, bank_tok, vault_tok }: VaultScope & { bank_tok: string, vault_tok: string }): IDBKeyRange {
  return rangeUnder(['box', user_id, banklabel, vaultlabel, bank_tok, vault_tok])
}
// --
