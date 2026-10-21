import { VaultError } from './errors'
import { DefaultLogger, asError } from './logger'
import { reportToPlatform } from './report-error'

/** The smallest storage the local adapters need: text by ckey, with a `subscribe` so the vault and an inspector can watch it. */
export type StringStore = {
  /** The stored text under `ckey`, or null for none. */
  read(ckey: string): string | null
  write(ckey: string, text: string): void
  erase(ckey: string): void
  /** Every ckey currently stored, in no particular order. */
  ckeys(): string[]
  /** Call `listener` after any write or erase; returns the unsubscribe. */
  subscribe(listener: () => void): () => void
}

/** The listeners of one store, each called in turn as a write lands.
 * Its `subscribe` refuses 'bad_option' for a listener that is not a function. A listener that
 * throws stops no other and fails no write. What it threw goes to the default logger, and to the
 * platform's `reportError` where there is one.
 */
const makeBell = () => {
  const listeners = new Set<() => void>()
  return {
    ring: () => { listeners.forEach((listener) => { callQuietly(listener) }) },
    subscribe: (listener: () => void) => {
      if (typeof listener !== 'function') { throw new VaultError('bad_option', 'subscribe needs a listener function to call after each write or erase.') }
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

const callQuietly = (listener: () => void) => {
  try {
    listener()
  } catch (err) {
    DefaultLogger.error("A listener of a string store threw. The write landed, and every other listener was called; the listener is its author's to mend.", { call: 'StringStore' }, asError(err))
    reportToPlatform(err)
  }
}

/** A StringStore over a Map: for tests, and wherever localStorage is missing.
 *
 * @example
 *   const store = memoryStore()
 *   store.write('greeting', 'hi'); store.read('greeting')  // 'hi'
 */
export const memoryStore = (): StringStore => {
  const bag = new Map<string, string>()
  const bell = makeBell()
  return {
    read:  (ckey) => bag.get(ckey) ?? null,
    write: (ckey, text) => { bag.set(ckey, text); bell.ring() },
    erase: (ckey) => { bag.delete(ckey); bell.ring() },
    ckeys: () => [...bag.keys()],
    subscribe: bell.subscribe,
  }
}

/** A StringStore over a DOM Storage object, such as localStorage, that sees only the entries under `prefix`.
 * So one localStorage can hold two stores apart. Its `subscribe` hears only this tab's writes: it
 * does not listen for the `storage` events other tabs fire.
 *
 * @param prefix - Namespace for this store's entries, e.g. 'safebyok-demo:db:'.
 *
 * @example
 *   const dbStore = domStore(localStorage, 'safebyok-demo:db:')
 *   dbStore.write('greeting', 'hi')   // lands at 'safebyok-demo:db:greeting'
 */
export const domStore = (webStorage: Storage, prefix: string): StringStore => {
  const bell = makeBell()
  return {
    read:  (ckey) => webStorage.getItem(prefix + ckey),
    write: (ckey, text) => { webStorage.setItem(prefix + ckey, text); bell.ring() },
    erase: (ckey) => { webStorage.removeItem(prefix + ckey); bell.ring() },
    ckeys: () => {
      const found: string[] = []
      for (let ii = 0; ii < webStorage.length; ii += 1) {
        const fullCkey = webStorage.key(ii)
        if (fullCkey?.startsWith(prefix)) { found.push(fullCkey.slice(prefix.length)) }
      }
      return found
    },
    subscribe: bell.subscribe,
  }
}
