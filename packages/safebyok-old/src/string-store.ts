import { Checkers } from './checks/validator'
import { DefaultLogger, asError } from './logger'
import { reportToPlatform } from './report-error'

/** The smallest storage the local adapters need: text by scopepath, with a `subscribe` so the vault and an inspector can watch it.
 * The supplied {@link memoryStore} and {@link domStore} call each listener in turn as a put or a
 * del lands. One that throws stops no other and fails no put: what it threw goes to the default
 * logger, and to the platform's `reportError` where there is one. Their `subscribe` refuses
 * 'bad_option' for a listener that is not a function.
 */
export type StringStore = {
  /** The stored text under `scopepath`, or null for none. */
  get(scopepath: string): string | null
  put(scopepath: string, text: string): void
  del(scopepath: string): void
  /** Every scopepath currently stored, in no particular order. */
  scopepaths(): string[]
  /** Call `listener` after any put or del; returns the unsubscribe. */
  subscribe(listener: () => void): () => void
}

/** What a store's `subscribe` is handed: a function to call after each put or del. Its `parse` refuses 'bad_option'. */
const { listenerShape } = Checkers('bad_option', ({ fn }) => ({ listenerShape: fn<() => void>() }))

/** The listeners of one store, and the `ring` that calls them. */
const makeBell = () => {
  const listeners = new Set<() => void>()
  return {
    ring: () => { listeners.forEach((listener) => { callQuietly(listener) }) },
    subscribe: (listener: () => void) => {
      listenerShape.parse(listener)
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
 *   store.put('greeting', 'hi'); store.get('greeting')  // 'hi'
 */
export const memoryStore = (): StringStore => {
  const bag = new Map<string, string>()
  const bell = makeBell()
  return {
    get:        (scopepath) => bag.get(scopepath) ?? null,
    put:        (scopepath, text) => { bag.set(scopepath, text); bell.ring() },
    del:        (scopepath) => { bag.delete(scopepath); bell.ring() },
    scopepaths: () => [...bag.keys()],
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
 *   dbStore.put('greeting', 'hi')   // lands at 'safebyok-demo:db:greeting'
 */
export const domStore = (webStorage: Storage, prefix: string): StringStore => {
  const bell = makeBell()
  return {
    get:        (scopepath) => webStorage.getItem(prefix + scopepath),
    put:        (scopepath, text) => { webStorage.setItem(prefix + scopepath, text); bell.ring() },
    del:        (scopepath) => { webStorage.removeItem(prefix + scopepath); bell.ring() },
    scopepaths: () => {
      const found: string[] = []
      for (let ii = 0; ii < webStorage.length; ii += 1) {
        const prefixedScopepath = webStorage.key(ii)
        if (prefixedScopepath?.startsWith(prefix)) { found.push(prefixedScopepath.slice(prefix.length)) }
      }
      return found
    },
    subscribe: bell.subscribe,
  }
}
