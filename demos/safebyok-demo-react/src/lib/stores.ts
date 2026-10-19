import { domStore, memoryStore, type StringStore } from 'safebyok'
import { inspectIdbDeviceDB } from 'safebyok/idb'
import { idbVaultDB, inspectIdbVaultDB } from 'safebyok-indexeddb'
import { OutageVaultDB, makeOutage } from './outage'

/**
 * DEMO JANK: concrete storage wiring. The vault's records live in this browser's IndexedDB,
 * through the real adapters, safebyok-indexeddb's vault store and safebyok/idb's device store:
 *
 *  * the `vault_db` shelf stands in for the remote database a backend would hold -- rows of
 *    ciphertext that never open without your passphrase
 *  * the `device_db` shelf is genuinely device-local, exactly as it would be in production: the
 *    lease, around a key handle that cannot leave this browser. Its store comes with
 *    the browser's defaults, `browserOpts({ dbName: Applabel })`, which App.tsx spreads into the
 *    provider
 *
 * The fake auth keeps its scaffolding rows in localStorage: accounts beside the pretend backend,
 * the session standing in for a cookie. The inspectors at the bottom of the page render every
 * shelf raw, so you can watch what lands where, and the backend's panel has an outage switch to
 * show what the app does when storage cannot be reached. A real app replaces vaultDB with a
 * Convex (or REST) adapter and keeps the browser's defaults exactly as they are.
 */

export const Applabel = 'safebyok_demo'

const storage = typeof localStorage === 'undefined' ? null : localStorage

/** The fake auth's account rows: pretend-backend scaffolding, beside the real vault shelf. */
export const dbStore: StringStore = storage === null ? memoryStore() : domStore(storage, 'safebyok-demo:db:')

/** The fake auth's session: stands in for a cookie; never leaves the browser. */
export const deviceStore: StringStore = storage === null ? memoryStore() : domStore(storage, 'safebyok-demo:device:')

/** The pretend backend's outage switch, flipped from its inspection panel. */
export const outage = makeOutage()

/** The vault's storage: IndexedDB, behind the pretend outage switch. */
export const vaultDB = new OutageVaultDB(idbVaultDB({ dbName: Applabel }), outage)

/** Raw windows onto the two IndexedDB shelves, for the inspection panels. */
export const vaultDbInspector = inspectIdbVaultDB({ dbName: Applabel })
export const deviceDbInspector = inspectIdbDeviceDB({ dbName: Applabel })
