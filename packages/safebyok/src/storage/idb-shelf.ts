/** The versioned shelf: an IndexedDB datastore's single object store, in a database named for its layout version. */

import { createStore, type UseStore } from 'idb-keyval'
import type * as Z from 'zod'
import { objCheck } from '../helpers/validator'

// == [The versioned shelf]: VersionedShelfSpec, VersionPattern, versionedShelfSpec, shelves, versionedShelfOf, isOlderDBName, wipeOlderDBs

/** The parts of a versioned shelf's name: its host's `dbName`, the kind of database, and the layout version. */
export interface VersionedShelfSpec {
  /** The host's `dbName`, which every database of the bank begins with. */
  dbName:    string
  /** The kind of database, `device`, `devicerow` or `vaults`: the part of the name before `-v` and the version. */
  dbstem:    string
  /** The layout version, three zero-padded parts (`001-001-001`), so that a name sorts as its version does. */
  version:   string
  /** The database's only object store. */
  storename: string
  /** The full names of this kind's databases from before the three-part version. */
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

// One shelf per database per page: a shelf's connection stays open for the page's life, and its wipe runs once.
/** The shelf of each database this page has made one for, by the database's name. */
const shelves = new Map<string, UseStore>()

/** The page's shelf for the database `dbName:dbstem-v<version>`, made on the first call. */
export function versionedShelfOf(spec: VersionedShelfSpec): UseStore {
  const checked = versionedShelfSpec.parse(spec, { where: 'versionedShelfOf' })
  const dbname = `${checked.dbName}:${checked.dbstem}-v${checked.version}`
  const kept = shelves.get(dbname)
  if (kept !== undefined) { return kept }
  const shelf = createStore(dbname, checked.storename)
  let isWiped = false
  const made: UseStore = async (txMode, callback) => {
    if (! isWiped) {
      isWiped = true
      // The old databases are deleted unread and never awaited: a tab that still has one open blocks its delete (notes/wontfix.md).
      void wipeOlderDBs(checked)
    }
    return await shelf(txMode, callback)
  }
  shelves.set(dbname, made)
  return made
}

// A test's backdoor, reached from `safebyok/testing` and never from `safebyok/storage`.
/** For tests only: the next {@link versionedShelfOf} of the database `dbname` opens a connection of its own. */
export function _cheat_forgetShelf(dbname: string): void { shelves.delete(dbname) }

/** True for the name of a database of `spec`'s stem at an older version. */
function isOlderDBName(spec: VersionedShelfSpec, dbname: string): boolean {
  const stemmed = `${spec.dbName}:${spec.dbstem}-v`
  if (! dbname.startsWith(stemmed)) { return false }
  const version = dbname.slice(stemmed.length)
  // A name whose version this code cannot parse is deleted, like an older one. A future change to the version format must use a new stem.
  return (! VersionPattern.test(version)) || (version < spec.version)
}

// Old databases are deleted by name, because not every browser lists its databases. The wipe is housekeeping: a browser that
// cannot list them keeps its older versioned ones rather than failing the vault.
/** Start the deletion of each of `spec`'s old databases. */
async function wipeOlderDBs(spec: VersionedShelfSpec): Promise<void> {
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
