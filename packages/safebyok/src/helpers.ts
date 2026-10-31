/** Helpers the package's own modules share: attaching what no loop, spread, log line or `JSON.stringify` finds, or what each of them finds, yielding to queued microtasks, and reading a stored row's field before the row is checked.
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

/** `obj`, with each of `hidden`'s own entries attached as {@link adorn} attaches one. Call it in a model's constructor, before it freezes itself.
 *
 * @example decorate(proving, { vault, header })   // proving.vault reads; JSON.stringify(proving) leaves both out
 */
export const decorate = <OT extends object>(obj: OT, hidden: Partial<OT>): OT => {
  for (const [ckey, val] of Object.entries(hidden)) {
    adorn(obj, ckey, val)
  }
  return obj
}

/** The options of {@link tattoo} and {@link tattooProp}: whether what they attach may be assigned anew (`writable`) or removed and redefined (`configurable`); each true unless given false. */
export type TattooOpts = { writable?: boolean, configurable?: boolean }

/** `shown`, once each of its own entries is attached to `obj` as an enumerable own property, which `Object.keys`, a spread and `JSON.stringify` find, as {@link adorn} attaches a hidden one.
 * Pass `{ writable: false, configurable: false }` for a prop that never changes. A property
 * not configurable is still writable unless `writable` is false too: its value may change, it
 * may not be removed or redefined. Call it in a model's constructor, before it seals itself.
 *
 * @example tattoo(this, { ...this.scope, vault_tok }, { writable: false, configurable: false })   // the scope and vault_tok, fixed for good
 */
export function tattoo<BT extends object>(obj: object, shown: BT, opts: TattooOpts = {}): BT {
  for (const [ckey, val] of Object.entries(shown)) {
    tattooProp(obj, ckey, val, opts)
  }
  return shown
}

/** `val`, once attached to `obj` as the enumerable own property `propname`: {@link tattoo} for one prop.
 *
 * @example tattooProp(this, 'vault_tok', vault_tok, { writable: false })   // => vault_tok; Object.keys(this) includes it
 */
export function tattooProp<VT>(obj: object, propname: string, val: VT, opts: TattooOpts = {}): VT {
  Object.defineProperty(obj, propname, { value: val, enumerable: true, writable: opts.writable ?? true, configurable: opts.configurable ?? true })
  return val
}

/** Yield to the end of the current microtask queue: what was queued before the call runs before it resolves.
 * Await it to batch requests made in the same task.
 *
 * @example await nextMicrotask()   // every promise settled earlier in this task has run its handlers
 */
export function nextMicrotask(): Promise<void> { return new Promise(queueMicrotask) }

/** The field `fieldname` of `row`, a stored row as it stands, unchecked: undefined when the row is no object or has none.
 * For the few reads made before, or instead of, a row's check: its `format`, or the tokens a
 * key-value adapter compares inside its one atomic step.
 *
 * @example fieldOf(raw, 'format')   // 'safebyok-vault-v6', or whatever a damaged row holds there
 */
export const fieldOf = (row: unknown, fieldname: string): unknown => (
  typeof row === 'object' && row !== null ? (row as Record<string, unknown>)[fieldname] : undefined
)
