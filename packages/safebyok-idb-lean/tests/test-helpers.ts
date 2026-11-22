/** This package's test helpers, behind one door: star-import it as `TH`. Everything `safebyok/testing` publishes comes
 * through it, and beside it the world of an IdbVaultDB: a vaultDB on a fresh database, a twin of it as another tab would
 * have, and the cheat into what its IndexedDB stores.
 */
export * from 'safebyok/testing'
export * from './test-helpers/idb-world'
