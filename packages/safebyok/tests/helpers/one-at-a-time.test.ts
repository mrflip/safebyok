import { describe, expect, it } from 'vitest'
import { oneAtATime } from '../../src/helpers/one-at-a-time'
import * as TH from '../test-helpers'

/**
 * A task each of whose runs waits until the test lets it end, failing when the test says: it keeps
 * how many runs began, and how many were under way at once at most.
 */
const pendingTask = () => {
  const releases: ((outcome: 'resolve' | 'reject') => void)[] = []
  const tally = { began: 0, underWay: 0, most: 0 }
  const task = async () => {
    tally.began += 1
    tally.underWay += 1
    tally.most = Math.max(tally.most, tally.underWay)
    try {
      const outcome = await new Promise<'resolve' | 'reject'>((resolve) => { releases.push(resolve) })
      if (outcome === 'reject') { throw new Error(`run ${String(tally.began)} failed`) }
    } finally {
      tally.underWay -= 1
    }
  }
  /** Ends the run under way, as `outcome` says, and lets what waits on it go on. */
  const end = async (outcome: 'resolve' | 'reject' = 'resolve') => {
    releases.shift()?.(outcome)
    await TH.wakeupAtNextTick()
  }
  return { task, tally, end }
}

/** How a {@link watched} promise has settled, so far. */
type Seen = { settled: 'pending' | 'resolved' | 'rejected', err: unknown }

/** Whether `promise` has settled, and how, so far. */
const watched = (promise: Promise<void>): Seen => {
  const seen: Seen = { settled: 'pending', err: undefined }
  void settleInto(seen, promise)
  return seen
}

const settleInto = async (seen: Seen, promise: Promise<void>) => {
  try {
    await promise
    seen.settled = 'resolved' // eslint-disable-line no-param-reassign -- the test's own record of how the promise settled
  } catch (err) {
    seen.settled = 'rejected' // eslint-disable-line no-param-reassign -- the test's own record of how the promise settled
    seen.err = err // eslint-disable-line no-param-reassign -- the test's own record of how the promise settled
  }
}

describe("oneAtATime", () => {
  it("starts the task at once when nothing runs, settling as it does", async () => {
    const pending = pendingTask()
    const run = oneAtATime(pending.task)
    const first = watched(run())
    expect(pending.tally.began).to.eq(1)
    await TH.wakeupAtNextTick()
    expect(first.settled).to.eq('pending')
    await pending.end()
    expect(first.settled).to.eq('resolved')
  })

  it("shares the running task with every call made during it", async () => {
    const pending = pendingTask()
    const run = oneAtATime(pending.task)
    const first = watched(run())
    const later = [run(), run(), run()].map((promise) => watched(promise))
    expect(pending.tally.began).to.eq(1)
    await pending.end()
    expect(first.settled).to.eq('resolved')
    expect(later.map((seen) => seen.settled)).to.deep.equal(['resolved', 'resolved', 'resolved'])
    expect(pending.tally.began).to.eq(1)
    expect(pending.tally.most).to.eq(1)
  })

  // oneAtATime @example
  it("runs the task once for three calls at once", async () => {
    let runs = 0
    const run = oneAtATime(async () => {
      runs += 1
      await TH.wakeupAtNextTick()
    })
    await Promise.all([run(), run(), run()])
    expect(runs).to.eq(1)
  })

  it("starts a fresh run for a call made once the run it would have joined has ended, never beside one", async () => {
    const pending = pendingTask()
    const run = oneAtATime(pending.task)
    const first = watched(run())
    await pending.end()
    const second = watched(run())
    expect(first.settled).to.eq('resolved')
    expect(pending.tally.began).to.eq(2)
    await pending.end()
    expect(second.settled).to.eq('resolved')
    expect(pending.tally.most).to.eq(1)
  })

  it("rejects every call that shared a failed run", async () => {
    const pending = pendingTask()
    const run = oneAtATime(pending.task)
    const shared = [run(), run()].map((promise) => watched(promise))
    await pending.end('reject')
    expect(shared.map((seen) => seen.settled)).to.deep.equal(['rejected', 'rejected'])
    expect(shared.map((seen) => (seen.err as Error).message)).to.deep.equal(['run 1 failed', 'run 1 failed'])
    expect(pending.tally.began).to.eq(1)
  })

  it("starts afresh once every run has ended, and goes on after a failure", async () => {
    const pending = pendingTask()
    const run = oneAtATime(pending.task)
    const first = watched(run())
    await pending.end('reject')
    expect(first.settled).to.eq('rejected')
    const next = watched(run())
    expect(pending.tally.began).to.eq(2)
    await pending.end()
    expect(next.settled).to.eq('resolved')
  })

  it("hands every caller sharing a run the value it resolves, and a later run its own", async () => {
    let runs = 0
    const run = oneAtATime(() => { runs += 1; return Promise.resolve(runs) })
    expect(await Promise.all([run(), run()])).to.deep.equal([1, 1])
    expect(await run()).to.eq(2)
  })

  it("rejects, rather than throwing, when the task throws before its first await", async () => {
    const run = oneAtATime(() => { throw new Error('refused at once') })
    await expect(run()).rejects.toThrow('refused at once')
    await expect(run()).rejects.toThrow('refused at once')
  })
})
