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

/** What the provider makes each user's bank with, but the user: the browser's batteries and the vaultDB. */
export const bankOpts = { ...browserOpts({ dbName: Applabel }), applabel: Applabel, vaultDB }

/** The fake auth's account rows: pretend-backend scaffolding, beside the vault's rows. */
export const dbStorage: StringStorage = prefixedStorage('safebyok-demo:db:')

/** The fake auth's session: stands in for a cookie; never leaves the browser. */
export const deviceStorage: StringStorage = prefixedStorage('safebyok-demo:device:')
