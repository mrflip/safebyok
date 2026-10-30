import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/errors'
import { Trigger } from '../../src/helpers/trigger'
import { bad, good, type Outcome } from '../../src/outcome'

const T0 = 1_700_000_000_000

/** A trigger on the faked clock, horizon one second, whose launch succeeds and counts itself in `launched`. */
const triggerOf = () => {
  const launched = { count: 0 }
  const trigger = new Trigger({
    clock:       { now: () => Date.now() },
    maxMillis:   1000,
    doSnapshot:  () => launched.count,
    doTryLaunch: () => { launched.count += 1; return Promise.resolve(good(launched.count)) },
  })
  return { trigger, launched }
}

/** A trigger on the faked clock, horizon one second, whose launches answer `outcomes` in turn. */
const scriptedOf = (opts: { notesOwnSuccess?: boolean, outcomes: Outcome<number>[] }) => {
  const told: VaultError[] = []
  const trigger = new Trigger({
    clock:           { now: () => Date.now() },
    maxMillis:       1000,
    doSnapshot:      () => 0,
    doTryLaunch:     () => Promise.resolve(opts.outcomes.shift() ?? good(0)),
    notesOwnSuccess: opts.notesOwnSuccess,
    onTimerRefusal:  (err) => { told.push(err) },
  })
  return { trigger, told }
}

beforeEach(() => { vi.useFakeTimers({ now: T0 }) })
afterEach(() => { vi.useRealTimers() })

describe("trigger.isTimelyWithin(maxMillis): Infinity means go ahead", () => {
  it("answers true for Infinity on a trigger that has never succeeded, and false for any finite horizon", () => {
    const { trigger } = triggerOf()
    expect(trigger.timing.lastSucceededAt).to.be.null
    expect(trigger.isTimelyWithin(Infinity)).to.be.true
    expect(trigger.isTimelyWithin(Number.MAX_SAFE_INTEGER)).to.be.false
    expect(trigger.isTimelyWithin(0)).to.be.false
  })

  it("answers true for Infinity long after its last success, as for a horizon not yet passed", async () => {
    const { trigger } = triggerOf()
    await trigger.launch()
    expect(trigger.isTimelyWithin(1000)).to.be.true
    vi.setSystemTime(T0 + 1000)
    expect(trigger.isTimelyWithin(1000)).to.be.false
    vi.setSystemTime(T0 + 1e12)
    expect(trigger.isTimelyWithin(Infinity)).to.be.true
  })

  it("leaves ensureTimelyWithin(Infinity) launching nothing on a trigger never launched", async () => {
    const { trigger, launched } = triggerOf()
    await trigger.ensureTimelyWithin(Infinity)
    expect(launched.count).to.eq(0)
    await trigger.ensureTimelyWithin(1000)
    expect(launched.count).to.eq(1)
  })
})

describe("trigger opts notesOwnSuccess and onTimerRefusal", () => {
  it("notes no success for an ok outcome when the launch notes its own, yet schedules the next launch", async () => {
    const { trigger } = scriptedOf({ notesOwnSuccess: true, outcomes: [good(1)] })
    await trigger.launch()
    expect(trigger.timing.lastCompletedAt).to.eq(T0)
    expect(trigger.timing.lastSucceededAt).to.be.null
    expect(trigger.timing.launchAt).to.eq(T0 + 800)
    expect(trigger.isTimely).to.be.false
  })

  it("reads timely again once a success is noted after an ok outcome that noted none", async () => {
    const { trigger } = scriptedOf({ notesOwnSuccess: true, outcomes: [good(1)] })
    await trigger.launch()
    trigger.noteSuccessNow()
    expect(trigger.isTimely).to.be.true
  })

  it("launches again at the horizon after an ok outcome that noted no success, and again after that", async () => {
    const { trigger } = scriptedOf({ notesOwnSuccess: true, outcomes: [good(1), good(2), good(3)] })
    await trigger.launch()
    await vi.advanceTimersByTimeAsync(800)
    expect(trigger.timing.lastLaunchedAt).to.eq(T0 + 800)
    await vi.advanceTimersByTimeAsync(800)
    expect(trigger.timing.lastLaunchedAt).to.eq(T0 + 1600)
    expect(trigger.timing.lastSucceededAt).to.be.null
  })

  it("schedules no launch after a refusal, when the launch notes its own success", async () => {
    const down = new VaultError('storage_unavailable', "Down.")
    const { trigger } = scriptedOf({ notesOwnSuccess: true, outcomes: [bad(down)] })
    await trigger.tryLaunch()
    expect(vi.getTimerCount()).to.eq(0)
  })

  it("notes success for an ok outcome by default", async () => {
    const { trigger } = scriptedOf({ outcomes: [good(1)] })
    await trigger.launch()
    expect(trigger.timing.lastSucceededAt).to.eq(T0)
  })

  it("tells onTimerRefusal the refusal of a launch the timer made", async () => {
    const down = new VaultError('storage_unavailable', "Down.")
    const { trigger, told } = scriptedOf({ outcomes: [good(1), bad(down)] })
    await trigger.launch()
    await vi.advanceTimersByTimeAsync(800)
    expect(told).to.deep.equal([down])
  })

  it("tells onTimerRefusal nothing of a refusal a caller awaits", async () => {
    const down = new VaultError('storage_unavailable', "Down.")
    const { trigger, told } = scriptedOf({ outcomes: [bad(down)] })
    const { err } = await trigger.tryLaunch()
    expect(err).to.eq(down)
    expect(told).to.deep.equal([])
  })
})
