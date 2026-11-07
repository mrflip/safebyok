/** The versioned shelf: an IndexedDB store's one object store, in a database named for its layout version. */

import { createStore, type UseStore } from 'idb-keyval'
import type * as Z from 'zod'
import { objCheck } from '../helpers/validator'

// == [The versioned shelf]: VersionedShelfSpec, VersionPattern, versionedShelfSpec, shelves, versionedShelfOf, isOlderDBName, wipeOlderDBs

/** What names a versioned shelf: its host's `dbName`, which kind of database it is, and the layout version. */
export interface VersionedShelfSpec {
  /** The host's `dbName`, which every database of the bank begins with. */
  dbName:    string
  /** The kind of database, `device`, `bank` or `vaults`: the part of the name before `-v` and the version. */
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

const versionedShelfSpec = objCheck(({ str, arr }) => ({
  dbName:    str.min(1),
  dbstem:    str.min(1),
  version:   str.regex(VersionPattern),
  storename: str.min(1),
  oldnames:  arr(str.min(1)),
}), 'bad_option')

// A page's one shelf for each database: each connection a shelf holds open is never closed, and its wipe is run once.
/** The shelf of each database this page has made one for, by the database's name. */
const shelves = new Map<string, UseStore>()

/** The page's one shelf of the database `dbName:dbstem-v<version>`. */
export const versionedShelfOf = (spec: VersionedShelfSpec): UseStore => {
  const checked = versionedShelfSpec.parse(spec, { where: 'versionedShelfOf' })
  const dbname = `${checked.dbName}:${checked.dbstem}-v${checked.version}`
  const kept = shelves.get(dbname)
  if (kept !== undefined) { return kept }
  const shelf = createStore(dbname, checked.storename)
  let isWiped = false
  const made: UseStore = async (txMode, callback) => {
    if (! isWiped) {
      isWiped = true
      // The old databases are deleted unread and never awaited: a tab still holding one open holds its delete back (notes/wontfix.md).
      void wipeOlderDBs(checked)
    }
    return await shelf(txMode, callback)
  }
  shelves.set(dbname, made)
  return made
}

/** Forgets the page's shelf of the database `dbname`, so the next `versionedShelfOf` of it opens a connection of its own. */
export const _cheat_forgetShelf = (dbname: string): void => { shelves.delete(dbname) }

/** True for the name of a database of `spec`'s stem at an older version. */
const isOlderDBName = (spec: VersionedShelfSpec, dbname: string): boolean => {
  const stemmed = `${spec.dbName}:${spec.dbstem}-v`
  if (! dbname.startsWith(stemmed)) { return false }
  const version = dbname.slice(stemmed.length)
  // A name whose version this code cannot read is deleted, as is an older one: a later change of the version format takes a new stem.
  return (! VersionPattern.test(version)) || (version < spec.version)
}

// The old names are deleted by name, as not every browser lists its databases. The wipe is hygiene, so a browser that cannot list
// them keeps its older versioned ones rather than failing the vault.
/** Start the deletion of each of `spec`'s old databases. */
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

true satisfies Z.core.util.AssertEqual<VersionedShelfSpec, Z.input<typeof versionedShelfSpec>>
