/** safebyok-indexeddb: safebyok's storage in this browser's IndexedDB, for an app with no backend.
 * {@link idbVaultDB} makes the VaultDB, and {@link inspectIdbVaultDB} shows the rows it keeps, raw.
 * It is also the template for a key-value backend of your own: the README says what to copy.
 */
export { idbVaultDB } from './idb-vault-db'
export type { IdbVaultDBOpts } from './idb-opts'
export { inspectIdbVaultDB } from './inspect-idb-vault-db'
export type { IdbRow, IdbVaultInspector } from './inspect-idb-vault-db'
