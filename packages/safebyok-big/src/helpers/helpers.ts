/** Helpers the package's own modules share: attaching what no loop, spread, log line or `JSON.stringify` finds, or what each of them finds, yielding to queued microtasks, and what the databases share. */

// == [Hidden]: adorn, decorate

/** Set `obj[ckey]` to `val`, hidden, and return `val`.
 * - Hidden properties are not enumerable, so `Object.keys`, a `...` spread, console.log, and `JSON.stringify` pass by them.
 *
 * @example get wayinCtx() { return adorn(this, 'wayinCtx', wayinCtxOf(this)) }   // "memoized": worked out once, every following read returns the same value
 */
export function adorn<VT>(obj: object, ckey: string, val: VT): VT {
  Object.defineProperty(obj, ckey, { value: val, enumerable: false, writable: true, configurable: true })
  return val
}

/** Add properties of `hidden` to `obj` as a hidden property; return `obj`. */
export function decorate<OT extends object>(obj: OT, hidden: Partial<OT>): OT {
  for (const [ckey, val] of Object.entries(hidden)) {
    adorn(obj, ckey, val)
  }
  return obj
}
// --

// == [Shown]: TattooOpts, tattoo, tattooProp

/** The options of {@link tattoo} and {@link tattooProp}: whether what they attach may be assigned anew (`writable`, false unless given true) or removed and redefined (`configurable`, true unless given false). */
export type TattooOpts = { writable?: boolean, configurable?: boolean }

/** Add properties of `shown` to `obj`, enumerable+readonly, and return shown. Use `{configurable: false}` to make each property truly immutable.
 * - Enumerable properties show up in `Object.keys`, a `...` spread, console.log, and `JSON.stringify`.
 * - A configurable property can still be modified using adorn, decorate, tattoo or in any way by Object.defineProperty et.al.
 * - A readonly property cannot be assigned to: `obj.prop = val` throws an error.
 *
 * @example tattoo(this, { ...this.scope, vault_tok }, { configurable: false }) // each scope property and vault_tok, fixed for good
 */
export function tattoo<BT extends object>(obj: object, shown: BT, opts: TattooOpts = {}): BT {
  for (const [ckey, val] of Object.entries(shown)) {
    tattooProp(obj, ckey, val, opts)
  }
  return shown
}

/** Set `obj[propname]` to `val`, enumerable+readonly, and return `val`. Use `{configurable: false}` to make it truly immutable.
 * {@link tattoo} defines those terms.
 */
export function tattooProp<VT>(obj: object, propname: string, val: VT, opts: TattooOpts = {}): VT {
  Object.defineProperty(obj, propname, { value: val, enumerable: true, writable: opts.writable ?? false, configurable: opts.configurable ?? true })
  return val
}
// --

// == [Microtasks]: nextMicrotask

/** Yield to the end of the current microtask queue: what was queued before the call runs before it resolves.
 * Await it to batch requests made in the same task.
 */
export function nextMicrotask(): Promise<void> { return new Promise(queueMicrotask) }
// --

// == [Databases]: Awaitable, ckeyOf

/** What an adapter's generic call answers: an adapter over synchronous storage need not make a promise. */
export type Awaitable<ValT> = ValT | Promise<ValT>

/** The ckey of `parts`, whichever characters they contain: JSON, so no two lists of parts meet. */
export function ckeyOf(...parts: string[]): string { return JSON.stringify(parts) }
// --
