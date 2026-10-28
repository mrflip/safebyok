import { useCallback, useLayoutEffect, useRef } from 'react'

/** A function that calls `goOn` while the component is on the page, for an async handler to go on through after each await of its own.
 * It calls `goOn` at once while the component shows, and hands back a promise of what `goOn`
 * returns. While a Suspense boundary or an `<Activity>` hides the component, it calls `goOn` once
 * the component shows again, so the handler meets then what settled meanwhile. Once the component
 * has unmounted, it never calls `goOn`, and the promise never settles: the handler goes no
 * further, touching neither the component's state nor the callbacks its host handed it.
 * The component shows from the commit that mounts or reveals it, before React runs its passive
 * effects, so a handler the user sets off the moment it shows goes on. It stops showing in the
 * commit that hides or unmounts it.
 *
 * @example
 *   const whenShown = useWhenShown()
 *   const submit = async () => {
 *     await gating.attemptPassphrase(passphrase)
 *     await whenShown(() => { onDone(true) })
 *   }
 */
export const useWhenShown = (): (<ValT>(goOn: () => ValT) => Promise<Awaited<ValT>>) => {
  const shown = useRef(false)
  // Each handler waiting for the component to show again. A component gone keeps them, never
  // called, until it is collected with them.
  const waiting = useRef<(() => void)[]>([])
  // A layout effect, set and cleared in the commit itself: a click can land before React runs
  // passive effects, and an answer can settle between a commit that unmounts the component and
  // its passive cleanup. Activity and Suspense both run it again on showing what they hid.
  useLayoutEffect(() => {
    shown.current = true
    for (const showing of waiting.current.splice(0)) { showing() }
    return () => { shown.current = false }
  }, [])
  // `goOn` is called in the same turn while shown, never after an await: a host awaiting the call
  // the handler awaited would run first, and could raise another gating before hearing an answer.
  return useCallback(async <ValT>(goOn: () => ValT): Promise<Awaited<ValT>> => {
    if (! shown.current) { await new Promise<void>((showing) => { waiting.current.push(showing) }) }
    return await goOn()
  }, [])
}
