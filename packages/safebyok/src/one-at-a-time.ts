/** `task`, made to run one at a time, through two doors: `join` shares the run under way, and `runAfresh` waits it out and shares the one run after it.
 * A call to either while nothing runs starts a run at once. The run a `join` shares may have
 * begun before the call; the run serving a `runAfresh` began after it. Every `runAfresh` made
 * during a run shares the one follow-up, so a burst costs one run more at most. Every caller
 * settles as the run serving it settles, its failure included. A failed run still starts the
 * follow-up asked of it.
 *
 * @returns The two doors, each settling as the run that serves the call settles.
 *
 * @example
 *   const refreshes = oneAtATime(refreshOnce)
 *   await Promise.all([refreshes.join(), refreshes.join(), refreshes.join()])  // refreshOnce ran once, and all three shared it
 * @example
 *   await Promise.all([refreshes.join(), refreshes.runAfresh(), refreshes.runAfresh()])  // refreshOnce ran twice: the two runAfresh shared the second
 */
export const oneAtATime = (task: () => Promise<void>): { join: () => Promise<void>, runAfresh: () => Promise<void> } => {
  // The run under way, which every `join` made meanwhile shares, and the one asked to follow it,
  // which every `runAfresh` made meanwhile shares.
  let running: Promise<void> | null = null
  let following: { run: Promise<void>, begin: (run: Promise<void>) => void } | null = null

  // `task` begun inside a promise of its own, so a task that throws before its first await
  // rejects like any other failure: `running` is then cleared only after it was set.
  const begin = async () => { await task() }

  // The follow-up begins as the run before it ends, in one step, so no call slips in between to
  // start a run beside it.
  const runAlone = async () => {
    try {
      await begin()
    } finally {
      running = null
      const next = following
      following = null
      if (next !== null) { next.begin(start()) }
    }
  }

  const start = () => {
    running = runAlone()
    return running
  }

  return {
    join: () => running ?? start(),
    runAfresh: () => {
      if (running === null) { return start() }
      following ??= followingRun()
      return following.run
    },
  }
}

/** A run not yet begun, settling as the run handed to its `begin` settles. */
const followingRun = () => {
  // Replaced at once: a promise's executor runs before its constructor returns.
  let begin: (run: Promise<void>) => void = unbegun
  const run = new Promise<void>((resolve) => { begin = resolve })
  return { run, begin }
}

const unbegun = (): void => undefined
