/** Strings by ckey, as the fake auth keeps its rows: a demo's stand-in for a backend table and a cookie. */
export type StringStorage = {
  get(ckey: string): string | null
  put(ckey: string, text: string): void
  del(ckey: string): void
}

/** A StringStorage in `storage` (this browser's localStorage, by default), each ckey under `prefix`. */
export const prefixedStorage = (prefix: string, storage: Storage = localStorage): StringStorage => ({
  get: (ckey) => storage.getItem(prefix + ckey),
  put: (ckey, text) => { storage.setItem(prefix + ckey, text) },
  del: (ckey) => { storage.removeItem(prefix + ckey) },
})
