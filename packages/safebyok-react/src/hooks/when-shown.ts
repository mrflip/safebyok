import { useCallback, useLayoutEffect, useRef } from 'react'
import type { WhenShown } from '../shapes'

/** The component's {@link WhenShown}, and `isShown`, whether it shows now.
 *
 * @example
 *   const { whenShown } = useWhenShown()
 *   const submit = async () => {
 *     await gating.attemptPassphrase(passphrase)
 *     await whenShown(() => { onDone(true) })
 *   }
 * @example
 *   const passkey = await askPasskey(gate)
 *   if (! isShown()) { passkey.prfBytes.fill(0); return }   // never kept for the dialog to show again
 */
export const useWhenShown = (): { whenShown: WhenShown, isShown: () => boolean } => {
  const shown = useRef(false)
  // An unmounted component never calls its waiting handlers: they are garbage-collected with it.
  /** Each handler waiting for the component to show again. */
  const waiting = useRef<(() => void)[]>([])
  // A layout effect sets and clears `shown` in the commit itself: a click can land before React runs
  // passive effects, and an answer can settle between a commit that unmounts the component and
  // its passive cleanup. Activity and Suspense both run it again on showing what they hid.
  useLayoutEffect(() => {
    shown.current = true
    for (const showing of waiting.current.splice(0)) { showing() }
    return () => { shown.current = false }
  }, [])
  // `goOn` is called in the same turn while shown, never after an await: a host awaiting the call
  // the handler awaited would run first, and could raise another gating before hearing an answer.
  // The loop asks again once woken: the commit that showed the component can hide or unmount it again,
  // by a layout effect's update, before the woken handler's turn comes.
  const whenShown = useCallback(async <ValT>(goOn: () => ValT): Promise<Awaited<ValT>> => {
    while (! shown.current) { await new Promise<void>((showing) => { waiting.current.push(showing) }) }
    return await goOn()
  }, [])
  const isShown = useCallback(() => shown.current, [])
  return { whenShown, isShown }
}
