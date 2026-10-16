import { describe, expect, it } from 'vitest'
import { FarFuture } from 'safebyok'
import { asksAgain } from '../../src/lib/asks-again'

describe("asksAgain", () => {
  it("says never for a deadline at the far future, as its example does", () => {
    expect(asksAgain(FarFuture)).to.eq(', never asks again')
  })

  it("says never within a minute of the far future, never comparing for equality", () => {
    expect(asksAgain(FarFuture - 59_999)).to.eq(', never asks again')
  })

  it("gives the date of any nearer deadline, as its example does", () => {
    const deadline = Date.UTC(2026, 9, 23)
    expect(asksAgain(deadline)).to.eq(` until ${new Date(deadline).toLocaleString()}`)
    expect(asksAgain(FarFuture - 60_001)).to.match(/^ until /)
  })

  it("says nothing while there is no deadline", () => {
    expect(asksAgain(null)).to.eq('')
  })
})
