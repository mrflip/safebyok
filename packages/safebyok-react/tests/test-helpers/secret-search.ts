/** Searches for a secret in what a test can reach: a value's own data, and everything React holds of a rendered tree. */

// == [Searching]: holdsText, childrenOf, reactTreeOf

/** True when `text` appears in a string reachable from `root` through own data properties, Map and Set entries, FormData entries, or an Error's message and cause.
 * It never calls a getter or a function, so what a closure or a private field keeps is out of its reach. A DOM node is skipped: its value is the page's, not state.
 */
export function holdsText(root: unknown, text: string): boolean {
  const seen = new Set<object>()
  const pending: unknown[] = [root]
  while (pending.length > 0) {
    const val = pending.pop()
    if (typeof val === 'string') {
      if (val.includes(text)) { return true }
      continue
    }
    if ((typeof val !== 'object') || (val === null) || seen.has(val) || (val instanceof Node)) { continue }
    seen.add(val)
    pending.push(...childrenOf(val))
  }
  return false
}

/** The values `val` holds directly */
function childrenOf(val: object): unknown[] {
  if (val instanceof FormData) { return [...val.values()] }
  if (val instanceof Map)      { return [...val.keys(), ...val.values()] }
  if (val instanceof Set)      { return [...val] }
  const own = Object.values(Object.getOwnPropertyDescriptors(val)).map((desc): unknown => desc.value)
  return (val instanceof Error) ? [val.message, val.cause, ...own] : own
}

// React keeps a container's tree under a key it names `__reactContainer$` and a random suffix: no public API reaches it.
/** The root of the tree React rendered into `container`: every component's props, hook state and pending updates, and the host forms' status, are reachable from it. */
export function reactTreeOf(container: Element): unknown {
  const ckey = Object.keys(container).find((each) => each.startsWith('__reactContainer$'))
  if (ckey === undefined) { throw new Error('Nothing is rendered into this container') }
  return (container as unknown as Record<string, unknown>)[ckey]
}
// --
