import { MemoryDeviceDB, type StrengthChecker } from 'safebyok'
import { argon2idWebV1Deriver } from 'safebyok/browser'
import { idbVaultDB } from 'safebyok-indexeddb'
import { domStore, memoryStore, type StringStore } from 'safebyok-old'

/** DEMO JANK: concrete storage wiring.
 *
 *  * the vault's rows live in this browser's IndexedDB, through safebyok-indexeddb: they stand
 *    in for the remote database a backend would hold -- ciphertext that never opens without your
 *    passphrase
 *  * the device's leases live in memory, so a reload locks every vault again; a real app keeps
 *    them in a device store that outlives the page
 *  * the device's id is a random UUID kept in localStorage
 *  * the strength checker refuses only a passphrase under 12 characters; a real app judges
 *    strength properly (CUSTOMIZATION.md)
 *
 * The fake auth keeps its scaffolding rows in localStorage: accounts beside the pretend backend,
 * the session standing in for a cookie. A real app replaces vaultDB with a Convex (or REST)
 * adapter.
 */

export const Applabel = 'safebyok_demo'

const storage = typeof localStorage === 'undefined' ? null : localStorage

/** The fake auth's account rows: pretend-backend scaffolding, beside the vault's rows. */
export const dbStore: StringStore = storage === null ? memoryStore() : domStore(storage, 'safebyok-demo:db:')

/** The fake auth's session: stands in for a cookie; never leaves the browser. */
export const deviceStore: StringStore = storage === null ? memoryStore() : domStore(storage, 'safebyok-demo:device:')

/** The vault's storage: this browser's IndexedDB. */
export const vaultDB = idbVaultDB({ dbName: Applabel })

/** The device's leases: in memory, for this page's life. */
export const deviceDB = new MemoryDeviceDB()

/** What makes a key from a passphrase: the browser's Argon2id. */
export const keyDeriver = argon2idWebV1Deriver

const DeviceIdKey = 'safebyok-demo:device_id'

/** This browser's id, made once and kept in localStorage. */
const deviceIdOf = (): string => {
  const kept = storage?.getItem(DeviceIdKey)
  if (kept !== null && kept !== undefined) { return kept }
  const made = crypto.randomUUID()
  storage?.setItem(DeviceIdKey, made)
  return made
}

/** This browser's id, as the bank is told it. */
export const device_id = deviceIdOf()

/** Every passphrase of 12 characters or more is strong enough. */
export const strengthChecker: StrengthChecker = (passphrase) => (
  passphrase.length >= 12 ? { strong: true } : { strong: false, reason: 'Choose a passphrase of at least 12 characters: a few words together make a strong one.' }
)
