import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/errors'
import { Trigger } from '../../src/helpers/trigger'
import { bad, good, type Outcome } from '../../src/outcome'

const T0 = 1_700_000_000_000

/** A trigger on the faked clock, horizon one second, whose launch reports its success and counts itself in `launched`. */
const triggerOf = () => {
  const launched = { count: 0 }
  const trigger = new Trigger<number, number>({
    clock:       { now: () => Date.now() },
    intervalMillis: 1000,
    doSnapshot:  () => launched.count,
    doTryLaunch: () => { launched.count += 1; trigger.taskCompleted(); return Promise.resolve(good(launched.count)) },
  })
  return { trigger, launched }
}

/** A trigger on the faked clock, horizon one second, whose launches answer `outcomes` in turn and report no success. */
const scriptedOf = (opts: { outcomes: Outcome<number>[] }) => {
  const told: VaultError[] = []
  const trigger = new Trigger({
    clock:           { now: () => Date.now() },
    intervalMillis:  1000,
    doSnapshot:      () => 0,
    doTryLaunch:     () => Promise.resolve(opts.outcomes.shift() ?? good(0)),
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

describe("trigger.isTimely and ensureTimelyWithin(): the interval, not the timer", () => {
  it("fires its timer at eagerFrac of the interval, yet reads timely for the whole interval", async () => {
    const { trigger } = triggerOf()
    await trigger.launch()
    expect(trigger.timing.dueAt).to.eq(T0 + 800)
    vi.setSystemTime(T0 + 999)
    expect(trigger.isTimely).to.be.true
    vi.setSystemTime(T0 + 1000)
    expect(trigger.isTimely).to.be.false
  })

  it("reads untimely before the first success, for an interval of Infinity too", () => {
    const trigger = new Trigger({ clock: { now: () => Date.now() }, intervalMillis: Infinity, doSnapshot: () => 0, doTryLaunch: () => Promise.resolve(good(0)) })
    expect(trigger.isTimely).to.be.false
  })

  it("launches from ensureTimelyWithin() given no horizon once the interval since the last success has passed, and not before", async () => {
    const { trigger, launched } = triggerOf()
    await trigger.launch()
    vi.setSystemTime(T0 + 999)
    await trigger.ensureTimelyWithin()
    expect(launched.count).to.eq(1)
    vi.setSystemTime(T0 + 1000)
    await trigger.ensureTimelyWithin()
    expect(launched.count).to.eq(2)
  })
})

describe("trigger.disarm()", () => {
  it("clears the timer the last success armed", async () => {
    const { trigger } = triggerOf()
    await trigger.launch()
    expect(vi.getTimerCount()).to.eq(1)
    trigger.disarm()
    expect(vi.getTimerCount()).to.eq(0)
  })
})

describe("trigger.taskCompleted(outcome), and a launch that completes", () => {
  it("notes no success for an ok launch that reported none, yet schedules the next launch", async () => {
    const { trigger } = scriptedOf({ outcomes: [good(1)] })
    await trigger.launch()
    expect(trigger.timing.lastCompletedAt).to.eq(T0)
    expect(trigger.timing.lastSucceededAt).to.be.null
    expect(trigger.timing.dueAt).to.eq(T0 + 800)
    expect(trigger.isTimely).to.be.false
  })

  it("reads timely once a success is noted after an ok launch that noted none", async () => {
    const { trigger } = scriptedOf({ outcomes: [good(1)] })
    await trigger.launch()
    trigger.taskCompleted()
    expect(trigger.isTimely).to.be.true
    expect(trigger.timing.lastSucceededAt).to.eq(T0)
  })

  it("launches again at the horizon after an ok launch that noted no success, and again after that", async () => {
    const { trigger } = scriptedOf({ outcomes: [good(1), good(2), good(3)] })
    await trigger.launch()
    await vi.advanceTimersByTimeAsync(800)
    expect(trigger.timing.lastLaunchedAt).to.eq(T0 + 800)
    await vi.advanceTimersByTimeAsync(800)
    expect(trigger.timing.lastLaunchedAt).to.eq(T0 + 1600)
    expect(trigger.timing.lastSucceededAt).to.be.null
  })

  it("schedules no launch after a refusal, and keeps its error as lastErr", async () => {
    const down = new VaultError('storage_unavailable', "Down.")
    const { trigger } = scriptedOf({ outcomes: [bad(down)] })
    await trigger.tryLaunch()
    expect(vi.getTimerCount()).to.eq(0)
    expect(trigger.lastErr).to.eq(down)
    expect(trigger.timing.lastSucceededAt).to.be.null
  })

  it("keeps the error of a failure noted, changes no success, and clears the error at the next success", () => {
    const { trigger } = scriptedOf({ outcomes: [] })
    const down = new Error('Down.')
    trigger.taskCompleted()
    trigger.taskCompleted({ ok: false, err: down })
    expect(trigger.lastErr).to.eq(down)
    expect(trigger.timing.lastSucceededAt).to.eq(T0)
    trigger.taskCompleted({ ok: false })
    expect(trigger.lastErr).to.eq(down)
    trigger.taskCompleted({ ok: true })
    expect(trigger.lastErr).to.be.null
  })

  it("refuses 'bad_option' an ok that is no boolean and an err that is no Error, and takes an Outcome whole", () => {
    const { trigger } = scriptedOf({ outcomes: [] })
    expect(() => { trigger.taskCompleted({ ok: 'yes' as never }) }).to.throw(VaultError).with.property('refusalkind', 'bad_option')
    expect(() => { trigger.taskCompleted({ ok: false, err: 'Down.' as never }) }).to.throw(VaultError).with.property('refusalkind', 'bad_option')
    trigger.taskCompleted(good(7))
    expect(trigger.timing.lastSucceededAt).to.eq(T0)
  })

  it("arms no timer after disarm(), whatever completes", async () => {
    const { trigger } = scriptedOf({ outcomes: [good(1)] })
    const launching = trigger.launch()
    trigger.disarm()
    await launching
    trigger.taskCompleted()
    expect(vi.getTimerCount()).to.eq(0)
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
