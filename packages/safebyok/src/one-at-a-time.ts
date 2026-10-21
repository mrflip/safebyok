/** `task`, made to run one at a time: no two runs overlap, and each caller's run begins after it called.
 * Called while a run is under way, it hands back one more run, started once that one ends and
 * shared by every call made meanwhile. A run's failure is heard only by the callers that share it.
 *
 * @returns A function asking for a run of `task`, settling as the run it is given settles.
 *
 * @example
 *   const refresh = oneAtATime(readStorage)
 *   await Promise.all([refresh(), refresh(), refresh()])  // readStorage ran twice: once at the first call, once for the other two
 */
export const oneAtATime = (task: () => Promise<void>): (() => Promise<void>) => {
  // The run under way, and the one queued to run after it, which every call made meanwhile shares.
  let running: Promise<void> | null = null
  let queued: Promise<void> | null = null

  const run = (): Promise<void> => {
    if (running === null) {
      running = runAlone()
      return running
    }
    queued ??= runAfter(running)
    return queued
  }

  const runAlone = async () => {
    try {
      await begin()
    } finally {
      running = null
    }
  }

  // `task` begun inside a promise of its own, so a task that throws before its first await
  // rejects like any other failure: `running` is then cleared only after it was set.
  const begin = async () => { await task() }

  /** A run once `ahead` has ended, however it ended: its failure is its own callers' to hear. */
  const runAfter = async (ahead: Promise<void>) => {
    try {
      await ahead
    } catch {
      // see above
    }
    queued = null
    await run()
  }

  return run
}
