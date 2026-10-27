/** Helpers the package's own modules share: how a model attaches its vault and its record where no loop, spread, log line or `JSON.stringify` will find them, and how a call yields to the microtasks queued behind it.
 * Not the `safebyok/utils` entry point (`utils.ts`), which is for the app around a vault.
 */

/** `val`, once attached to `obj` as the non-enumerable property `ckey`, which `Object.keys`, a spread and `JSON.stringify` pass by.
 * It is writable and configurable, so a model that freezes itself afterwards fixes it with the
 * rest. A getter that attaches what it works out under its own name is read once.
 *
 * @example adorn(wayin, 'vault', vault)   // => vault; JSON.stringify(wayin) leaves it out
 * @example get wayinCtx() { return adorn(this, 'wayinCtx', wayinCtxOf(this)) }   // worked out once, on the first read
 */
export const adorn = <VT>(obj: object, ckey: string, val: VT): VT => {
  Object.defineProperty(obj, ckey, { value: val, enumerable: false, writable: true, configurable: true })
  return val
}

/** `obj`, with each of `hidden`'s own entries attached as {@link adorn} attaches one: what a model's constructor calls before it freezes itself.
 *
 * @example decorate(proving, { vault, header })   // proving.vault reads; JSON.stringify(proving) leaves both out
 */
export const decorate = <OT extends object>(obj: OT, hidden: Partial<OT>): OT => {
  for (const [ckey, val] of Object.entries(hidden)) {
    adorn(obj, ckey, val)
  }
  return obj
}

/** Yield execution to the end of the current microtask queue.
 * Batches simultaneous initialization or requests arriving in the same event loop: what was queued
 * before the call runs before it resolves.
 *
 * @example await nextMicrotask()   // every promise settled earlier in this task has run its handlers
 */
export function nextMicrotask(): Promise<void> { return new Promise(queueMicrotask) }
