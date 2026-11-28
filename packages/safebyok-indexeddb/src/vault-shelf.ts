/** The shelf: the single object store of an IdbVaultDB's database, a Thing at each key, a key range per kind of Thing. */

import { promisifyRequest, type UseStore } from 'idb-keyval'
import * as DB from 'safebyok/storage'
import type { Banklabel, FiledRaw, Labelpath, TableScope, ThingScope, Thingkind, Userid } from 'safebyok/storage'

// == [The database]: VaultDBVersion, shelfOf, bellnameOf, databasenameOf

// Zero-padded, so that a database name sorts as its version does.
/** The layout version of the vault database, in three zero-padded parts. */
export const VaultDBVersion = '002-001-001'

/** The shelf of the vault database `safebyok-<dbName>:vault-v<version>`, or `safebyok:vault-v<version>` with no `dbName`. */
export function shelfOf(dbName?: string): UseStore {
  return DB.versionedShelfOf({ dbprefix: DB.dbprefixOf(dbName), dbstem: 'vault', version: VaultDBVersion, storename: 'things', oldnames: [] })
}

/** The name of the BroadcastChannel that tells every tab of a vault database's writes. */
export function bellnameOf(dbName?: string): string { return `${DB.dbprefixOf(dbName)}:vault` }

/** The name of the IndexedDB database {@link shelfOf} opens for `dbName`. */
export function databasenameOf(dbName?: string): string { return `${DB.dbprefixOf(dbName)}:vault-v${VaultDBVersion}` }
// --

// == [Scopepaths]: ThingScopepath, thingScopepathOf, descendantsRangeOf, tableRangeOf, Filed, childrenIn, bankThingsIn

// The scopepath is a stored contract: a Thing is found by it, so changing it orphans what is stored.

// The kind leads the key as a table's name would: the key range of a kind is this store's table of that kind, as Postgres's
// `safebyok_gate_things` and `safebyok_box_things` are. Each verb picks it by the kind its ask carries, never by reading the labelpath.
/** The scopepath of a Thing: its scope, kind first, then its bank and its labelpath: the banklabel for its gate, `box` or `box/<label>` for a box. */
export type ThingScopepath = [modelkind: Thingkind, userid: Userid, banklabel: Banklabel, labelpath: Labelpath]

/** The scopepath of the Thing at `scope`. */
export function thingScopepathOf({ modelkind, userid, banklabel, labelpath }: ThingScope): ThingScopepath {
  return [modelkind, userid, banklabel, labelpath]
}

// '0' is the code unit after '/', so the range holds every labelpath that begins `<labelpath>/`, at any depth.
/** The key range of every Thing of `scope`'s kind below the Thing at `scope`, at any depth. */
function descendantsRangeOf({ modelkind, userid, banklabel, labelpath }: ThingScope): IDBKeyRange {
  return IDBKeyRange.bound([modelkind, userid, banklabel, `${labelpath}/`], [modelkind, userid, banklabel, `${labelpath}0`], false, true)
}

// A scopepath sorts after every array it begins with, and before any longer one with an array where its labelpath is.
/** The key range of every Thing in `table`: those of its kind in its bank. */
function tableRangeOf({ modelkind, userid, banklabel }: TableScope): IDBKeyRange {
  return IDBKeyRange.bound([modelkind, userid, banklabel], [modelkind, userid, banklabel, []])
}

/** A raw Thing stored one label under a parent, at its labelpath. */
export type Filed = { labelpath: Labelpath, raw: unknown }

// A Thing's children are of its own kind, so they are in its key range.
/** The raw children of the Thing at `scope`, in labelpath order. */
export async function childrenIn(store: IDBObjectStore, scope: ThingScope): Promise<Filed[]> {
  const range = descendantsRangeOf(scope)
  const [scopepaths, raws] = await Promise.all([promisifyRequest(store.getAllKeys(range)), promisifyRequest<unknown[]>(store.getAll(range))])
  const under = `${scope.labelpath}/`
  return scopepaths
    .map((scopepath, idx) => ({ labelpath: (scopepath as ThingScopepath)[3], raw: raws[idx] }))
    .filter(({ labelpath }) => (! labelpath.includes('/', under.length)))
}

/** Every raw Thing in `table`, those of its kind in its bank, in labelpath order. */
export async function bankThingsIn(store: IDBObjectStore, table: TableScope): Promise<FiledRaw[]> {
  const range = tableRangeOf(table)
  const [scopepaths, raws] = await Promise.all([promisifyRequest(store.getAllKeys(range)), promisifyRequest<unknown[]>(store.getAll(range))])
  return scopepaths.map((scopepath, idx) => ({ labelpath: (scopepath as ThingScopepath)[3], raw: raws[idx] }))
}
// --
