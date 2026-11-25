/** The shelf: the single object store of an IdbVaultDB's database, a Thing at each key. */

import { promisifyRequest, type UseStore } from 'idb-keyval'
import * as DB from 'safebyok/storage'
import type { Banklabel, FiledRaw, Labelpath, ThingScope, ThingWatchScope, Userid } from 'safebyok/storage'

// == [The database]: VaultDBVersion, shelfOf, bellnameOf, databasenameOf

// Zero-padded, so that a database name sorts as its version does.
/** The layout version of the vault database, in three zero-padded parts. */
export const VaultDBVersion = '001-001-001'

/** The shelf of the vault database `safebyok-<dbName>:vault-v<version>`, or `safebyok:vault-v<version>` with no `dbName`. */
export function shelfOf(dbName?: string): UseStore {
  return DB.versionedShelfOf({ dbprefix: DB.dbprefixOf(dbName), dbstem: 'vault', version: VaultDBVersion, storename: 'things', oldnames: [] })
}

/** The name of the BroadcastChannel that tells every tab of a vault database's writes. */
export function bellnameOf(dbName?: string): string { return `${DB.dbprefixOf(dbName)}:vault` }

/** The name of the IndexedDB database {@link shelfOf} opens for `dbName`. */
export function databasenameOf(dbName?: string): string { return `${DB.dbprefixOf(dbName)}:vault-v${VaultDBVersion}` }
// --

// == [Scopepaths]: ThingScopepath, thingScopepathOf, descendantsRangeOf, bankRangeOf, Filed, childrenIn, bankThingsIn

// The scopepath is a stored contract: a Thing is found by it, so changing it orphans what is stored.

/** The scopepath of a Thing: its bank, then its labelpath, whose first segment is its modelkind. */
export type ThingScopepath = [userid: Userid, banklabel: Banklabel, labelpath: Labelpath]

/** The scopepath of the Thing at `scope`. */
export function thingScopepathOf({ userid, banklabel, labelpath }: ThingScope): ThingScopepath { return [userid, banklabel, labelpath] }

// '0' is the code unit after '/', so the range holds every labelpath that begins `<labelpath>/`, at any depth.
/** The key range of every Thing below the Thing at `scope`, at any depth. */
function descendantsRangeOf({ userid, banklabel, labelpath }: ThingScope): IDBKeyRange {
  return IDBKeyRange.bound([userid, banklabel, `${labelpath}/`], [userid, banklabel, `${labelpath}0`], false, true)
}

// A scopepath sorts after every array it begins with, and before any longer one with an array where its labelpath is.
/** The key range of every Thing of the bank at `scope`. */
function bankRangeOf({ userid, banklabel }: ThingWatchScope): IDBKeyRange {
  return IDBKeyRange.bound([userid, banklabel], [userid, banklabel, []])
}

/** A raw Thing stored one label under a parent, at its labelpath. */
export type Filed = { labelpath: Labelpath, raw: unknown }

/** The raw children of the Thing at `scope`, in labelpath order. */
export async function childrenIn(store: IDBObjectStore, scope: ThingScope): Promise<Filed[]> {
  const range = descendantsRangeOf(scope)
  const [scopepaths, raws] = await Promise.all([promisifyRequest(store.getAllKeys(range)), promisifyRequest<unknown[]>(store.getAll(range))])
  const under = `${scope.labelpath}/`
  return scopepaths
    .map((scopepath, idx) => ({ labelpath: (scopepath as ThingScopepath)[2], raw: raws[idx] }))
    .filter(({ labelpath }) => (! labelpath.includes('/', under.length)))
}

/** Every raw Thing of the bank at `scope`, the bank's own included, in labelpath order. */
export async function bankThingsIn(store: IDBObjectStore, scope: ThingWatchScope): Promise<FiledRaw[]> {
  const range = bankRangeOf(scope)
  const [scopepaths, raws] = await Promise.all([promisifyRequest(store.getAllKeys(range)), promisifyRequest<unknown[]>(store.getAll(range))])
  return scopepaths.map((scopepath, idx) => ({ labelpath: (scopepath as ThingScopepath)[2], raw: raws[idx] }))
}
// --
