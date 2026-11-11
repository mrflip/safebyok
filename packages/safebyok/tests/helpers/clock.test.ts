import { afterEach, describe, expect, it, vi } from 'vitest'
import { _cheat_clock, _cheat_clockReset, nowMillis } from '../../src/helpers/clock'
import * as TH from '../test-helpers'

const T0 = Date.UTC(2026, 10, 6)

describe("nowMillis()", () => {
  afterEach(() => { vi.useRealTimers() })

  it("reads the device's clock on each call", () => {
    vi.useFakeTimers({ now: T0 })
    expect(nowMillis()).to.eq(T0)
    vi.advanceTimersByTime(25)
    expect(nowMillis()).to.eq(T0 + 25)
  })
})

describe("_cheat_clock(fn) and _cheat_clockReset()", () => {
  it("make nowMillis return what fn returns, until the reset", () => {
    let now = T0
    _cheat_clock(() => now)
    expect(nowMillis()).to.eq(T0)
    now += 7
    expect(nowMillis()).to.eq(T0 + 7)
    _cheat_clockReset()
    expect(nowMillis()).to.be.closeTo(Date.now(), 1000)
  })

  it("are the backdoor safebyok/testing publishes", () => {
    expect(TH._cheat_clock).to.eq(_cheat_clock)
    expect(TH._cheat_clockReset).to.eq(_cheat_clockReset)
  })
})
