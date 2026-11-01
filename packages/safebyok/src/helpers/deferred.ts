import { noop } from 'es-toolkit'

/** A promise and the two functions that settle it, as `Promise.withResolvers` hands them (ES2024, past this package's ES2022 target). */
export type Deferred<ValT> = {
  readonly promise: Promise<ValT>
  readonly resolve: (val: ValT) => void
  readonly reject:  (reason: unknown) => void
}

/** A promise to settle from outside it. Settling it a second time does nothing, as with any promise.
 * @example
 *   const settled = deferred<number>()
 *   settled.resolve(7)
 *   await settled.promise // 7
 */
export const deferred = <ValT>(): Deferred<ValT> => {
  let resolve: (val: ValT) => void = noop
  let reject: (reason: unknown) => void = noop
  const promise = new Promise<ValT>((res, rej) => { resolve = res; reject = rej })
  return Object.freeze({ promise, resolve, reject })
}
