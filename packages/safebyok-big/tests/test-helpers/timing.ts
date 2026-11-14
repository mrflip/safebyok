import { vi } from 'vitest'

/** Resolve after the macrotask queue has turned once: every promise already settled has run its
 * continuation, and so has any timer due now. For tests that let background work (a refresh rung
 * by a write) settle before they look.
 *
 * @returns A promise for the next tick.
 */
export function wakeupAtNextTick(): Promise<void> { return new Promise((resolve) => { setTimeout(resolve, 0) }) }

/** A while for something that should not happen to have had its chance: fifty milliseconds.
 *
 * @returns A promise for the end of the while.
 *
 * @example
 *   await TH.aWhile()
 *   expect(heard.count).to.eq(0)   // nothing came, though it had its chance
 */
export function aWhile(): Promise<void> { return new Promise((resolve) => { setTimeout(resolve, 50) }) }

/** Resolves once `check` is true, looking every few milliseconds; rejects after two seconds, so a
 * thing that never comes to pass fails its test rather than hanging it.
 *
 * @param check - Whether the thing has come to pass yet.
 */
export async function eventually(check: () => boolean): Promise<void> {
  for (let ii = 0; ii < 400; ii += 1) {
    if (check()) { return }
    await new Promise((resolve) => { setTimeout(resolve, 5) })
  }
  throw new Error('it never came to pass')
}

/** A listener for a BankDB's `subscribe`, and a count of how often it was called, kept for a test
 * to look at.
 *
 * @returns `onChange`, to subscribe with; `heard`, whose `count` it raises.
 */
export function changeCounter() {
  const heard = { count: 0 }
  return { heard, onChange: () => { heard.count += 1 } }
}

/** A latch that keeps an async seam pending, so a test can make one call in the middle of
 * another: `pass()` waits until `release()` is called, and `reached` resolves once something is
 * waiting at it. Released, it stays open: later passes go straight through.
 *
 * @returns The latch: `pass`, to await inside the seam; `reached`, to await in the test; `release`.
 *
 * @example
 *   const latch = TH.makeLatch()
 *   const slowDeriver = { ...TH.testDeriver, deriveKeyBytes: async (passphrase, saltBytes) => { await latch.pass(); return await TH.testDeriver.deriveKeyBytes(passphrase, saltBytes) } }
 *   // then as pendingNextCall's: await latch.reached, act, latch.release()
 */
export function makeLatch() {
  const opened = deferred()
  const arrived = deferred()
  const pass = async () => {
    arrived.resolve()
    await opened.promise
  }
  return { pass, reached: arrived.promise, release: opened.resolve }
}

/** The names of `Target`'s methods that return a promise. */
export type AsyncVerbOf<Target> = {
  [Verb in keyof Target]-?: Target[Verb] extends (...args: never[]) => Promise<unknown> ? Verb : never
}[keyof Target]

/** Has `meanwhile` run inside the next call to `target[verb]`, before the call itself goes on: for
 * slipping another device's doings, or a pause, between a vault's look at storage and its write.
 * Only the next call is touched; later ones go straight through, unless armed again: each arming
 * is for one call, in the order armed. A method the test already spies on keeps counting its
 * calls, each once.
 *
 * @param target - The object whose method to intercept: an adapter, a deriver.
 * @param verb - The method, one returning a promise.
 * @param meanwhile - What to run first, and wait for.
 *
 * @example
 *   TH.beforeNextCall(bankDB, 'tryPutBox', () => there.putBox('anthropic', 'sk-ant-fake-theirs'))
 */
export function beforeNextCall<Target extends object>(target: Target, verb: AsyncVerbOf<Target> & string, meanwhile: () => Promise<unknown>): void {
  const method = (target as unknown as Record<string, AsyncFn | undefined>)[verb]
  if (method === undefined) { throw new TypeError(`beforeNextCall found no method ${verb} to intercept.`) }
  // Armed already, once per call: this errand waits its turn behind the others.
  const waiting = errandsAt.get(method)
  if (waiting !== undefined) {
    waiting.push(meanwhile)
    return
  }
  const original = originalOf.get(method) ?? method
  if (original === method && vi.isMockFunction(method)) {
    // A mock of the test's own is in place here: stand in front of it for one call, and call it
    // through, so it records that call once. A second spy on top of it would record it twice.
    const errands = [meanwhile]
    // The mock may live on a prototype: then the stand-in is an own property to remove after, not
    // one to write the mock over, which would hide the prototype's from then on.
    const replaced = Object.getOwnPropertyDescriptor(target, verb)
    const standIn = async (...args: unknown[]) => {
      const errand = errands.shift()
      if (errands.length === 0) {
        if (replaced === undefined) { Reflect.deleteProperty(target, verb) } else { Object.defineProperty(target, verb, replaced) }
      }
      await errand?.()
      return await method.apply(target, args)
    }
    errandsAt.set(standIn, errands)
    Reflect.set(target, verb, standIn)
    return
  }
  // Otherwise our own spy, whose once-implementations vitest runs one per call, in order.
  const spy = vi.spyOn(target as unknown as Record<string, AsyncFn>, verb)
  originalOf.set(spy, original)
  spy.mockImplementationOnce(async (...args: unknown[]) => {
    await meanwhile()
    return await original.apply(target, args)
  })
}

/** Typed loosely: the caller's types were checked at the signature. */
type AsyncFn = (...args: unknown[]) => Promise<unknown>

/** The errands still waiting to run, by the stand-in {@link beforeNextCall} put in front of a test's own mock. */
const errandsAt = new WeakMap<object, (() => Promise<unknown>)[]>()

/** The method a spy of {@link beforeNextCall}'s own stands in front of. */
const originalOf = new WeakMap<object, AsyncFn>()

/** Keeps the next call to `target[verb]` at a latch (see {@link makeLatch}) until the test releases
 * it, so the test can make another call while that one is in flight. Later calls go straight
 * through.
 *
 * @param target - The object whose method to keep pending: an adapter, a deriver.
 * @param verb - The method, one returning a promise.
 * @returns The latch: await `reached`, then `release()`.
 *
 * @example
 *   const latch = TH.pendingNextCall(deviceDB, 'peek')
 *   const unlocking = bank.tryEnsureUnlocked()   // now waiting at the latch
 *   await latch.reached
 *   bank.lock()                                  // called while the cached lease is looked up
 *   latch.release()
 */
export function pendingNextCall<Target extends object>(target: Target, verb: AsyncVerbOf<Target> & string) {
  const latch = makeLatch()
  beforeNextCall(target, verb, latch.pass)
  return latch
}

/** Keeps the answer of the next call to `target[verb]` at a latch (see {@link makeLatch}) once the call itself has run, until the test releases it.
 * The target has done the work, and the caller has not yet heard. Later calls go straight through.
 *
 * Use it, not {@link pendingNextCall}, to make a call while a write is in flight to a DeviceDB, which
 * applies calls in the order made: a latch at the door would let a later call
 * reach it first, which a DeviceDB never does. Arm it before any spy of the test's own on the same
 * method, which then counts each call once.
 *
 * @param target - The object whose method's answer to keep pending: an adapter.
 * @param verb - The method, one returning a promise.
 * @returns The latch: await `reached`, then `release()`.
 *
 * @example
 *   const written = TH.pendingNextAnswer(deviceDB, 'tryStow')
 *   const unlocking = bank.tryUnlock()     // the lease is in the deviceDB; the unlock has not heard
 *   await written.reached
 *   bank.lock()                            // its forget is called after the write
 *   written.release()
 */
export function pendingNextAnswer<Target extends object>(target: Target, verb: AsyncVerbOf<Target> & string) {
  const latch = makeLatch()
  const original = (target as unknown as Record<string, AsyncFn | undefined>)[verb]
  if (original === undefined) { throw new TypeError(`pendingNextAnswer found no method ${verb} to keep pending.`) }
  vi.spyOn(target as unknown as Record<string, AsyncFn>, verb).mockImplementationOnce(async (...args: unknown[]) => {
    const answer = await original.apply(target, args)
    await latch.pass()
    return answer
  })
  return latch
}

/** Has `vault` read storage afresh, as storage has it once this is called.
 * A read already under way may have begun before the test's last write, and a refresh asked for
 * meanwhile shares it, so this awaits that one, then asks for another.
 *
 * @param vault - The Vault object to read into: anything with a `refresh()`.
 *
 * @example
 *   world.putBehindOurBack(spoiled)   // a change elsewhere, its ring perhaps answered by a read begun before it
 *   await TH.readAfresh(vault)              // the snapshot shows it
 */
export async function readAfresh(vault: { refresh: () => Promise<unknown> }): Promise<void> {
  await vault.refresh()
  await vault.refresh()
}

/** Resolves after `count` turns of the microtask queue. */
export async function microtasks(count: number) {
  for (let ii = 0; ii < count; ii += 1) { await Promise.resolve() }
}

/** Resolves after `count` turns of the macrotask queue. */
export async function ticks(count: number) {
  for (let ii = 0; ii < count; ii += 1) { await wakeupAtNextTick() }
}

/** Stands in for a resolver until the promise hands over its own. */
const unresolved = () => { /* replaced before use */ }

/** A promise, and apart from it the function that resolves it. */
function deferred() {
  let resolve: () => void = unresolved
  const promise = new Promise<void>((resolver) => { resolve = resolver })
  return { promise, resolve }
}

/** A listener that does nothing, for a test with nothing to hear. */
export const unheard = (): void => undefined
