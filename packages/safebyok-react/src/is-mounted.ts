import { useCallback, useLayoutEffect, useRef } from 'react'

/**
 * A function that answers true from the component's commit until it unmounts, for an async
 * handler to ask once its await settles: a component gone meanwhile -- its host took it away,
 * another vault remounted it, or the page that showed it closed -- is touched no more, neither its
 * state nor the callbacks its host handed it. Kept by a layout effect, in the commit that mounts
 * or unmounts the component, so that nothing which runs after that commit hears it stale. A
 * function, not the ref itself, so that TypeScript never carries an answer across an await.
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
  useLayoutEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  return useCallback(() => mounted.current, [])
}
