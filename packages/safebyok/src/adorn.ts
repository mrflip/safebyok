/** How a model attaches its vault and its record as `props`, where no loop, spread, log line or `JSON.stringify` will find them. */

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

/** `obj`, with each of `props`' own entries attached as {@link adorn} attaches one: what a model's constructor calls before it freezes itself.
 *
 * @example decorate(box, { vault, props: record })   // box.vault reads; JSON.stringify(box) leaves both out
 */
export const decorate = <OT extends object>(obj: OT, props: Partial<OT>): OT => {
  for (const [ckey, val] of Object.entries(props)) {
    adorn(obj, ckey, val)
  }
  return obj
}
