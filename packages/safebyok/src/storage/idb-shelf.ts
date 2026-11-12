/** The versioned shelf: an IndexedDB datastore's single object store, in a database named for its layout version. */

import { createStore, type UseStore } from 'idb-keyval'
import type * as Z from 'zod'
import { Checker, objCheck } from '../helpers/validator'

// == [The versioned shelf]: dbprefixOf, VersionedShelfSpec, VersionPattern, versionedShelfSpec, shelves, versionedShelfOf, isOlderDBName, wipeOlderDBs

const dbprefixOfArgs = Checker(({ str }) => str.min(1).optional(), 'bad_option')

// Every database this library writes starts `safebyok`, so a host can tell them from its own. Nothing else scopes a name: every row's key begins `user_id`, `banklabel`.
/** The start of every IndexedDB database name for the host's `dbName`: `safebyok`, or `safebyok-<dbName>` when there is one. */
export function dbprefixOf(dbName?: string): string {
  const checked = dbprefixOfArgs.parse(dbName, { where: 'dbprefixOf' })
  return (checked === undefined) ? 'safebyok' : `safebyok-${checked}`
}

/** The parts of a versioned shelf's name: its {@link dbprefixOf}, the kind of database, and the layout version. */
export interface VersionedShelfSpec {
  /** The start of the name, up to its colon. */
  dbprefix:  string
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
  dbprefix:  str.min(1),
  dbstem:    str.min(1),
  version:   str.regex(VersionPattern),
  storename: str.min(1),
  oldnames:  arr(str.min(1)),
}), 'bad_option')

// One shelf per database per page: a shelf's connection stays open for the page's life, and its wipe runs once.
/** The shelf of each database this page has made one for, by the database's name. */
const shelves = new Map<string, UseStore>()

/** The page's shelf for the database `dbprefix:dbstem-v<version>`, made on the first call. */
export function versionedShelfOf(spec: VersionedShelfSpec): UseStore {
  const checked = versionedShelfSpec.parse(spec, { where: 'versionedShelfOf' })
  const dbname = `${checked.dbprefix}:${checked.dbstem}-v${checked.version}`
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
  const stemmed = `${spec.dbprefix}:${spec.dbstem}-v`
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
