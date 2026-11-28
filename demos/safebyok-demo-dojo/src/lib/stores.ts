/** The dojo's own connections to the stores behind the app, the vault's IndexedDB database and the root shelf's localStorage: read every row, and load the fixture by writing rows directly. */

import { clear, createStore, entries, setMany, type UseStore } from 'idb-keyval'
import { DojoDBName } from './dojo'
import { Fixture, type ShelvedRow, type StoredRow } from './fixture'

// safebyok-indexeddb exports none of these names. Its README gives the vault database's name and its object store,
// `things`; the root shelf's key, `safebyok:roots:<banklabel>:<userid>`, is read from the core's source
// (src/minding/root-shelf.ts).
/** The vault database: what the backend would store. */
const VaultShelf: UseStore = createStore(`safebyok-${DojoDBName}:vault-v002-001-001`, 'things')

/** The start of each key the device keeps a bank's roots under in localStorage. */
const RootShelfCkeyPrefix = 'safebyok:roots:'

/** Every row of the vault database, as stored, in key order. */
export async function vaultRowsNow(): Promise<StoredRow[]> { return await entries(VaultShelf) }

/** Every item of localStorage the device keeps a bank's roots in. */
export function cacheRowsNow(): ShelvedRow[] {
  const ckeys = Array.from({ length: localStorage.length }, (_val, idx) => localStorage.key(idx) ?? '').filter((ckey) => ckey.startsWith(RootShelfCkeyPrefix))
  return ckeys.map((ckey) => [ckey, localStorage.getItem(ckey) ?? ''])
}

/** Empty the vault database and the root shelf, and write the fixture's rows into them. */
export async function loadFixture(): Promise<void> {
  for (const [ckey] of cacheRowsNow()) { localStorage.removeItem(ckey) }
  for (const [ckey, shelved] of Fixture.cache) { localStorage.setItem(ckey, shelved) }
  await clear(VaultShelf)
  await setMany([...Fixture.vault], VaultShelf)
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
