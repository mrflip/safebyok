import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

/** A function that answers true from the commit that mounts the component until it unmounts, for
 * an async handler to ask once its await settles: a component gone meanwhile -- its host took it
 * away, another vault remounted it, or the page that showed it closed -- is touched no more,
 * neither its state nor the callbacks its host handed it. True from the commit itself, so that a
 * handler the user sets off the moment the component shows -- before React has run its passive
 * effects, as on a busy page it may not have -- hears its answer. A component a Suspense boundary
 * hides for a moment is still mounted, and meets what its handlers settle while hidden. One an
 * `<Activity>` hides reads as gone until it shows again.
 * A function, not the ref itself, so that TypeScript never carries an answer across an await.
 *
 * @example
 *   const isMounted = useIsMounted()
 *   const submit = async () => {
 *     await gating.attemptPassphrase(passphrase)
 *     if (! isMounted()) { return }
 *     onDone(true)
 *   }
 */
export const useIsMounted = (): (() => boolean) => {
  const mounted = useRef(false)
  // Set in the commit that shows the component: React runs passive effects after it, in a task of
  // their own once it has yielded, and a click can land between the two.
  useLayoutEffect(() => { mounted.current = true }, [])
  // Cleared by a passive effect, as the library hooks of the name are: a Suspense boundary that
  // hides the component runs its layout cleanups, never its passive ones.
  useEffect(() => () => { mounted.current = false }, [])
  return useCallback(() => mounted.current, [])
}
