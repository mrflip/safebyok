import { browserOpts } from 'safebyok/browser'
import { localStore, type StringStore } from './local-store'
import { OutageVaultDB } from './outage-vault-db'

// The demo's storage wiring. The vault's rows live in this browser's IndexedDB, standing in for the
// remote database a backend would hold: ciphertext that never opens without the passphrase. A real
// app hands the provider a vaultDB over its own backend (Convex, REST) instead. The device's leases
// live in IndexedDB too, so an unlocked vault stays unlocked through a reload until its lease ends.

/** The app's name, which namespaces its storage and its vaults. */
export const Applabel = 'safebyok_demo'

/** The vault's storage: this browser's IndexedDB, behind the demo's outage switch. */
export const vaultDB = new OutageVaultDB({ dbName: Applabel })

const DeviceIdCkey = 'safebyok-demo:device_id'

/** This browser's device_id: a UUID made on the first visit and kept in localStorage. */
export const deviceIdOf = (storage: Storage = localStorage): string => {
  const kept = storage.getItem(DeviceIdCkey)
  if (kept !== null) { return kept }
  const made = crypto.randomUUID()
  storage.setItem(DeviceIdCkey, made)
  return made
}

/** What the provider makes each user's bank with, but the user: the browser's batteries, this browser's device_id, and the vaultDB. */
export const bankOpts = { ...browserOpts({ dbName: Applabel }), applabel: Applabel, device_id: deviceIdOf(), vaultDB }

/** The fake auth's account rows: pretend-backend scaffolding, beside the vault's rows. */
export const dbStore: StringStore = localStore('safebyok-demo:db:')

/** The fake auth's session: stands in for a cookie; never leaves the browser. */
export const deviceStore: StringStore = localStore('safebyok-demo:device:')
