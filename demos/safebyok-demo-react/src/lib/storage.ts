import { browserOpts } from 'safebyok/browser'
import { prefixedStorage, type StringStorage } from './string-storage'
import { OutageVaultDB } from './outage-vault-db'

// The demo's storage wiring. The vault's rows live in this browser's IndexedDB, standing in for the
// remote database a backend would have: ciphertext that never opens without the passphrase. A real
// app hands the provider a vaultDB over its own backend (Convex, REST) instead. The device's leases
// live in IndexedDB too, so an unlocked vault stays unlocked through a reload until its lease ends.

/** The app's name, which namespaces its storage and its vaults. */
export const Applabel = 'safebyok_demo'

/** The vault's storage: this browser's IndexedDB, behind the demo's outage switch. */
export const vaultDB = new OutageVaultDB({ dbName: Applabel })

/** The BankProvider's options for every user, apart from `user_id`: the browser defaults and the vaultDB. */
export const bankOpts = { ...browserOpts({ dbName: Applabel }), applabel: Applabel, vaultDB }

/** Storage for the fake auth's account rows: scaffolding that stands in for a backend. */
export const dbStorage: StringStorage = prefixedStorage('safebyok-demo:db:')

/** Storage for the fake auth's session. It stands in for a cookie and never leaves the browser. */
export const deviceStorage: StringStorage = prefixedStorage('safebyok-demo:device:')
