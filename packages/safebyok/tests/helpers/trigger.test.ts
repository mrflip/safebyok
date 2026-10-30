import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Trigger } from '../../src/helpers/trigger'
import { good } from '../../src/outcome'

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
