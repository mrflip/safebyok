/** The persist shelf: the single object store of an IdbPersister's database, a snapshot at each key. */

import type { UseStore } from 'idb-keyval'
import * as DB from 'safebyok/storage'

// Zero-padded, so that a database name sorts as its version does.
/** The layout version of the persist database, in three zero-padded parts. */
export const PersistDBVersion = '001-001-001'

/** The shelf of the persist database `safebyok-<dbName>:persist-v<version>`, or `safebyok:persist-v<version>` with no `dbName`. */
export function persistShelfOf(dbName?: string): UseStore {
  return DB.versionedShelfOf({ dbprefix: DB.dbprefixOf(dbName), dbstem: 'persist', version: PersistDBVersion, storename: 'clients', oldnames: [] })
}
