/** The world of an IdbVaultDB under test: each on a fresh database, its twin, and the cheat into its stored Things. */
import { createStore } from 'idb-keyval'
import * as DB from 'safebyok/storage'
import type { ThingScope } from 'safebyok/storage'
import { _cheat_forgetShelf } from 'safebyok/testing'
import { IdbVaultDB } from '../../src/idb-vault-db'
import { databasenameOf, thingScopepathOf } from '../../src/vault-shelf'

/** The `dbName` each IdbVaultDB under test was made with. */
const dbNameOf = new WeakMap<IdbVaultDB, string>()

/** The `dbName` `idbVaultDB` was made with, by {@link makeIdbVaultDB}. */
export function dbNameIn(idbVaultDB: IdbVaultDB): string { return dbNameOf.get(idbVaultDB)! }

/** An IdbVaultDB on a fresh database that no other test has touched. */
export function makeIdbVaultDB(): IdbVaultDB {
  const dbName = `test-${crypto.randomUUID()}`
  const idbVaultDB = new IdbVaultDB({ dbName })
  dbNameOf.set(idbVaultDB, dbName)
  return idbVaultDB
}

/** A second IdbVaultDB on `idbVaultDB`'s database, on a connection of its own, as another tab would have. */
export function makeTwin(idbVaultDB: IdbVaultDB): IdbVaultDB {
  const dbName = dbNameIn(idbVaultDB)
  _cheat_forgetShelf(databasenameOf(dbName))
  const twin = new IdbVaultDB({ dbName })
  dbNameOf.set(twin, dbName)
  return twin
}

/** Unchecked access to the Things `idbVaultDB` stores, on a connection of its own: plant, remove or read one raw. */
export function _cheat_idbThingsOf(idbVaultDB: IdbVaultDB) {
  const shelf = createStore(databasenameOf(dbNameIn(idbVaultDB)), 'things')
  return {
    plant:  async (scope: ThingScope, raw: unknown): Promise<void> => { await DB.inOneStep(shelf, 'readwrite', (store) => { store.put(raw, thingScopepathOf(scope)) }) },
    remove: async (scope: ThingScope): Promise<void> => { await DB.inOneStep(shelf, 'readwrite', (store) => { store.delete(thingScopepathOf(scope)) }) },
    rawAt:  async (scope: ThingScope): Promise<unknown> => await DB.inOneStep(shelf, 'readonly', (store) => DB.rowAt(store, thingScopepathOf(scope))),
  }
}
