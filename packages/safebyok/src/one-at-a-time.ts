/** `task`, made to run one at a time, joined: a call made while a run is under way shares that run, and starts none of its own.
 * Every caller sharing a run settles as it settles, its failure included. A call made once it has
 * ended starts a fresh run. So a run that began before a caller asked can serve it: a caller that
 * needs a run begun after some event of its own awaits that run, then asks again.
 *
 * @returns A function asking for a run of `task`, settling as the run it joins settles.
 *
 * @example
 *   const refresh = oneAtATime(readStorage)
 *   await Promise.all([refresh(), refresh(), refresh()])  // readStorage ran once, and all three shared it
 */
export const oneAtATime = (task: () => Promise<void>): (() => Promise<void>) => {
  // The run under way, which every call made meanwhile shares.
  let running: Promise<void> | null = null

  // `task` begun inside a promise of its own, so a task that throws before its first await
  // rejects like any other failure: `running` is then cleared only after it was set.
  const begin = async () => { await task() }

  const runAlone = async () => {
    try {
      await begin()
    } finally {
      running = null
    }
  }

  return () => {
    running ??= runAlone()
    return running
  }
}
