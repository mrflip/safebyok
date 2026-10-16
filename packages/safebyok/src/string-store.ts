import { VaultError } from './errors'
import { reportToPlatform } from './report-error'

/**
 * The smallest storage the local adapters need: strings by string ckey, with change notification
 * so the vault and an inspector can watch it. A host backs one with localStorage; the tests
 * back one with a Map.
 */
export type StringStore = {
  /** The stored text under `ckey`, or null when there is none. */
  read(ckey: string): string | null
  write(ckey: string, text: string): void
  erase(ckey: string): void
  /** Every ckey currently stored, in no particular order. */
  ckeys(): string[]
  /** Calls `listener` after any write or erase; returns the unsubscribe. */
  subscribe(listener: () => void): () => void
}

/**
 * Listener bookkeeping shared by both stores. A listener that is not a function is refused as it
 * subscribes, with kind 'bad_option', rather than breaking some later write that rings it. Each
 * listener is called in turn, as the write lands; one that throws stops no other and fails no
 * write, and what it threw goes to the platform's `reportError` where there is one.
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
    reportToPlatform(err)
  }
}

/**
 * In-memory StringStore over a Map: what the tests use, and a fallback anywhere localStorage
 * is missing.
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

/**
 * StringStore over a DOM Storage object (localStorage), confined to one prefix: each store sees
 * only its own entries, so one localStorage can hold two distinct places -- say a vault database
 * and a device cache -- without either seeing the other.
 *
 * Change notification covers this tab's own writes (DOM `storage` events only fire in *other*
 * tabs, and this store does not listen for them).
 *
 * @param webStorage - The Storage to write through, usually `window.localStorage`.
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
