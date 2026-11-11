/** A string store keyed by ckey. The fake auth keeps its rows in one, as the demo's stand-in for a backend table and a cookie. */
export type StringStorage = {
  get(ckey: string): string | null
  put(ckey: string, text: string): void
  del(ckey: string): void
}

/** Make a StringStorage over `storage` (default: this browser's localStorage) that prefixes every ckey with `prefix`. */
export const prefixedStorage = (prefix: string, storage: Storage = localStorage): StringStorage => ({
  get: (ckey) => storage.getItem(prefix + ckey),
  put: (ckey, text) => { storage.setItem(prefix + ckey, text) },
  del: (ckey) => { storage.removeItem(prefix + ckey) },
})
