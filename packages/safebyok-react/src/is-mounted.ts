import { useCallback, useEffect, useRef } from 'react'

/**
 * A function that answers true from the component's mount until it unmounts, for an async
 * handler to ask once its await settles: a component gone meanwhile -- its host took it away,
 * another vault remounted it, or the page that showed it closed -- is touched no more, neither its
 * state nor the callbacks its host handed it. Kept by a passive effect, as the library hooks of
 * the name are: a component a Suspense boundary hides for a moment still stands, and meets what
 * its handlers settle while hidden. One an `<Activity>` hides reads as gone until it shows again.
 * A function, not the ref itself, so that TypeScript never carries an answer across an await.
 *
 * @example
 *   const isMounted = useIsMounted()
 *   const submit = async () => {
 *     await vault.unlock(passphrase)
 *     if (! isMounted()) { return }
 *     onDone(true)
 *   }
 */
export const useIsMounted = (): (() => boolean) => {
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  return useCallback(() => mounted.current, [])
}
