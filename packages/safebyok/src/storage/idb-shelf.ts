/** The versioned shelf: an IndexedDB store's one object store, in a database whose name carries a layout version, with every older database of its kind deleted. */

import { createStore, type UseStore } from 'idb-keyval'

// == [The versioned shelf]: VersionedShelfSpec, versionedShelfOf, isOlderDBName, wipeOlderDBs

/** What names a versioned shelf: its host's `dbName`, which kind of database it is, and the layout version. */
export interface VersionedShelfSpec {
  /** The host's `dbName`, which every database of the bank begins with. */
  dbName:    string
  /** The kind of database, `device` or `vaults`: the part of the name before `-v` and the version. */
  dbstem:    string
  /** The layout version, three zero-padded parts (`001-001-001`), so that a name sorts as its version does. */
  version:   string
  /** The one object store of the database. */
  storename: string
  /** The names, whole, of the databases of this kind from before its three-part version. */
  oldnames:  string[]
}

/** A layout version: three zero-padded parts. */
const VersionPattern = /^\d{3}-\d{3}-\d{3}$/

/** The shelf of the database `dbName:dbstem-v<version>`, whose first transaction deletes every older database of its kind. */
export const versionedShelfOf = (spec: VersionedShelfSpec): UseStore => {
  const shelf = createStore(`${spec.dbName}:${spec.dbstem}-v${spec.version}`, spec.storename)
  let isWiped = false
  return async (txMode, callback) => {
    if (! isWiped) {
      isWiped = true
      // The old databases are deleted unread and never awaited: a tab still holding one open holds its delete back (notes/wontfix.md).
      void wipeOlderDBs(spec)
    }
    return await shelf(txMode, callback)
  }
}

/** True for the name of a database of `spec`'s stem whose version is older than its own: in an earlier pattern, or lower. */
const isOlderDBName = (spec: VersionedShelfSpec, dbname: string): boolean => {
  const stemmed = `${spec.dbName}:${spec.dbstem}-v`
  if (! dbname.startsWith(stemmed)) { return false }
  const version = dbname.slice(stemmed.length)
  return (! VersionPattern.test(version)) || (version < spec.version)
}

// The old names are deleted by name, as not every browser lists its databases. The wipe is hygiene, so a browser that cannot list
// them keeps its older versioned ones rather than failing the vault.
/** Starts the deletion of each of `spec`'s old names, and of every database now in the browser that {@link isOlderDBName} names. */
const wipeOlderDBs = async (spec: VersionedShelfSpec): Promise<void> => {
  try {
    for (const oldname of spec.oldnames) { indexedDB.deleteDatabase(oldname) }
    const listed = await indexedDB.databases()
    for (const { name: dbname } of listed) {
      if ((dbname !== undefined) && (! spec.oldnames.includes(dbname)) && isOlderDBName(spec, dbname)) { indexedDB.deleteDatabase(dbname) }
    }
  } catch {
    // no IndexedDB, or none that lists its databases
  }
}
// --
