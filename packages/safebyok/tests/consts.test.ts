import { describe, expect, it } from 'vitest'
import { FarFuture, FarPast, ForeverMillis } from '../src/consts'

describe("FarFuture", () => {
  it("is the microsecond epochalypse: the last millisecond whose epoch microseconds are a safe integer", () => {
    expect(FarFuture).to.eq(Math.floor(Number.MAX_SAFE_INTEGER / 1000))
    expect(Number.isSafeInteger(FarFuture * 1000)).to.be.true
    expect(Number.isSafeInteger((FarFuture + 1) * 1000)).to.be.false
  })

  it("falls in 2255, a valid Date", () => {
    expect(new Date(FarFuture).toISOString()).to.eq('2255-06-05T23:47:34.740Z')
  })

  it("lets a host show 'until locked' for a deadline equal to it, and a date for any other", () => {
    const shown = (ask_passphrase_at: number): string => (ask_passphrase_at === FarFuture ? 'until locked' : new Date(ask_passphrase_at).toISOString())
    expect(shown(FarFuture)).to.eq('until locked')
    expect(shown(Date.UTC(2026, 9, 22))).to.eq('2026-10-22T00:00:00.000Z')
  })
})

describe("ForeverMillis", () => {
  it("runs from FarPast to FarFuture, as its examples show", () => {
    expect(ForeverMillis).to.eq(FarFuture - FarPast)
    expect(FarPast + ForeverMillis).to.eq(FarFuture)
  })
})

describe("FarPast", () => {
  it("is the first instant of 1981", () => {
    expect(FarPast).to.eq(Date.UTC(1981, 0, 1))
    expect(new Date(FarPast).toISOString()).to.eq('1981-01-01T00:00:00.000Z')
  })
})
