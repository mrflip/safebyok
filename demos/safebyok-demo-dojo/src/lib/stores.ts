/** The dojo's own connections to the two IndexedDB databases behind the app: read every row, and load the fixture by writing rows directly. */

import { clear, createStore, entries, setMany, type UseStore } from 'idb-keyval'
import { DojoDBName } from './dojo'
import { Fixture, type StoredRow } from './fixture'

// safebyok-idb-lean exports none of these names. Its README gives the vault database's name and its object store,
// `things`; the persist database's store, `clients`, is read from its source (src/persist-shelf.ts).
/** The vault database: what the backend would store. */
const VaultShelf: UseStore = createStore(`safebyok-${DojoDBName}:vault-v001-001-001`, 'things')

/** The persist database: the device's caches, kept between page loads. */
const PersistShelf: UseStore = createStore(`safebyok-${DojoDBName}:persist-v001-001-001`, 'clients')

/** Every row of the vault database, as stored, in key order. */
export async function vaultRowsNow(): Promise<StoredRow[]> { return await entries(VaultShelf) }

/** Every row of the persist database, as stored, in key order: one snapshot per recordlabel. */
export async function cacheRowsNow(): Promise<StoredRow[]> { return await entries(PersistShelf) }

/** Empty both databases, and write the fixture's rows into them. */
export async function loadFixture(): Promise<void> {
  await Promise.all([clear(VaultShelf), clear(PersistShelf)])
  await Promise.all([setMany([...Fixture.vault], VaultShelf), setMany([...Fixture.cache], PersistShelf)])
}

/** True while the vault database has no row at all, as on the dojo's first visit to this browser. */
export async function isVaultEmpty(): Promise<boolean> {
  const rows = await vaultRowsNow()
  return rows.length === 0
}

/** Write the fixture's planted rows for `userid` into the vault database, as another device might have: none for a user with none. */
export async function plantRows(userid: string): Promise<void> {
  await setMany([...(Fixture.planted[userid] ?? [])], VaultShelf)
}
