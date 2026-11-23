/** Whether React's own bookkeeping for part of the page holds a text: a hook's state, a component's props, a form's status. */

/** How deep into a value {@link valHolds} looks: deep enough for a hook's state, a result it keeps, and that result's fields. */
const MaxDepth = 8

/** The bits of a React fiber this helper reads. */
type Fiber = Readonly<{
  memoizedState:  unknown
  memoizedProps:  unknown
  updateQueue:    unknown
  child:          Fiber | null
  sibling:        Fiber | null
  return:         Fiber | null
  alternate:      Fiber | null
}>

/** Whether React's fibers for the whole tree `element` was rendered in hold `text`, in the current fiber or the one before it.
 * It reads plain data only: what a closure captures, a `Map` or `Set` holds, or a class keeps in a `#private` field is out of its reach, and so are TanStack Query's caches.
 */
export function fiberHolds(element: Element, text: string): boolean {
  const fiberCkey = Object.keys(element).find((ckey) => ckey.startsWith('__reactFiber$'))
  if (fiberCkey === undefined) { throw new Error('The element was not rendered by React.') }
  let root = (element as unknown as Record<string, Fiber>)[fiberCkey] ?? null
  while (root?.return) { root = root.return }
  if (root === null) { throw new Error('The element has no fiber.') }
  return subtreeHolds(root, text, new Map())
}

/** Whether `fiber`, its alternate, or any fiber under it holds `text`. */
function subtreeHolds(fiber: Fiber, text: string, seen: Map<unknown, number>): boolean {
  for (const each of [fiber, fiber.alternate]) {
    if ((each !== null) && (! seen.has(each)) && fiberOwnHolds(each, text, seen)) { return true }
  }
  for (let { child } = fiber; child !== null; child = child.sibling) {
    if (subtreeHolds(child, text, seen)) { return true }
  }
  return false
}

/** Whether `fiber` itself holds `text`: in its hooks, its props or its update queue. */
function fiberOwnHolds(fiber: Fiber, text: string, seen: Map<unknown, number>): boolean {
  seen.set(fiber, 0)
  for (let hook = fiber.memoizedState as Record<string, unknown> | null; isHook(hook); hook = hook['next'] as Record<string, unknown> | null) {
    const queue = hook['queue'] as Record<string, unknown> | null
    // `baseQueue` keeps the updates a render skipped, such as a transition's while an urgent update renders first.
    if ([hook['memoizedState'], hook['baseState'], hook['baseQueue'], queue?.['lastRenderedState'], queue?.['pending']].some((val) => valHolds(val, text, seen, 0))) { return true }
  }
  if (! isHook(fiber.memoizedState) && valHolds(fiber.memoizedState, text, seen, 0)) { return true }
  return valHolds(fiber.memoizedProps, text, seen, 0) || valHolds(fiber.updateQueue, text, seen, 0)
}

/** Whether `val` is a hook in a fiber's list of them. */
function isHook(val: unknown): val is Record<string, unknown> {
  return (typeof val === 'object') && (val !== null) && ('next' in val) && ('memoizedState' in val)
}

/** Whether `val`, or anything within it, is a string containing `text`. DOM nodes and fibers are left out: the mirror reads the DOM, and fibers are walked by tree. */
function valHolds(val: unknown, text: string, seen: Map<unknown, number>, depth: number): boolean {
  if (typeof val === 'string') { return val.includes(text) }
  // A value met before is looked into again only from nearer the top, where more of what lies under it is within reach.
  if ((typeof val !== 'object') || (val === null) || (depth > MaxDepth) || (val instanceof Node) || isFiber(val) || ((seen.get(val) ?? Infinity) <= depth)) { return false }
  seen.set(val, depth)
  const inner = (val instanceof FormData) ? [...val.values()] : Object.values(val)
  return inner.some((each) => valHolds(each, text, seen, depth + 1))
}

/** Whether `val` is a React fiber. */
function isFiber(val: object): boolean { return ('stateNode' in val) && ('return' in val) && ('tag' in val) }
