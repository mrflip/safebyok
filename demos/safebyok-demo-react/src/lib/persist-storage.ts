/** Ask the browser not to evict this origin's storage under pressure. A host that keeps its vaults in IndexedDB should do the same.
 * Resolves true when storage is (or already was) persistent, and false when the browser declines or has no such API.
 * The vault works either way, so false is not an error.
 *
 * @example
 *   await keepStorage()  // true in a browser that grants it
 *   await keepStorage(null)  // false: no StorageManager to ask
 */
export const keepStorage = async (
  storageManager: Pick<StorageManager, 'persist'> | null = typeof navigator === 'undefined' ? null : navigator.storage,
): Promise<boolean> => {
  if (typeof storageManager?.persist !== 'function') { return false }
  try {
    return await storageManager.persist()
  } catch {
    return false
  }
}
