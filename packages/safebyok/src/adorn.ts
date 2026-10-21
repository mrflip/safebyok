/**
 * What each model attaches beside its stored record -- the vault it belongs to, the record itself
 * as `props` -- is attached by these two, where no loop, spread, log line or `JSON.stringify` will
 * find it. Internal: no entry point exports them.
 */

/** `val`, once attached to `obj` as the property `ckey`, hidden: non-enumerable, so `Object.keys`, a spread, `JSON.stringify` and a log line pass it by.
 * It is otherwise an ordinary property, writable and configurable: a model that freezes itself
 * afterwards fixes it with the rest. Handing back `val` lets a getter attach what it works out
 * the first time it is read, and every later read find the attached value in place of the getter.
 *
 * @param obj - The object to attach to; changed in place.
 * @param ckey - Name of the property.
 * @param val - What to attach.
 * @returns `val`.
 *
 * @example adorn(wayin, 'vault', vault)   // => vault; JSON.stringify(wayin) leaves it out
 * @example get wayinCtx() { return adorn(this, 'wayinCtx', wayinCtxOf(this)) }   // worked out once, on the first read
 */
export const adorn = <VT>(obj: object, ckey: string, val: VT): VT => {
  Object.defineProperty(obj, ckey, { value: val, enumerable: false, writable: true, configurable: true })
  return val
}

/** `obj`, with each of `props`' own entries attached to it as {@link adorn} attaches one, hidden.
 * What a model's constructor calls to attach its vault and its record, before it freezes itself.
 *
 * @param obj - The object to attach to; changed in place.
 * @param props - The properties to attach, by name.
 * @returns `obj`.
 *
 * @example decorate(box, { vault, props: record })   // box.vault reads; JSON.stringify(box) leaves both out
 */
export const decorate = <OT extends object>(obj: OT, props: Partial<OT>): OT => {
  for (const [ckey, val] of Object.entries(props)) {
    adorn(obj, ckey, val)
  }
  return obj
}
