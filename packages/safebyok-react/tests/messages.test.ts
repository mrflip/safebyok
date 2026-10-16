import { describe, expect, it } from 'vitest'
import { Locale, Messages } from '../src/messages'

describe("Messages", () => {
  it("frames each varying sentence whole around its part", () => {
    expect(Messages.locksIn('in 7 days')).to.eq('Locks on this device in 7 days.')
    expect(Messages.locksAgainIn('in 15 minutes')).to.eq('Locks again on this device in 15 minutes.')
  })

  it("has a word for everything, none of it blank", () => {
    const words = Object.values(Messages).filter((word) => typeof word === 'string')
    expect(words.every((word) => word.trim() !== '')).to.be.true
  })

  it("is in the one locale, which formats the dialog's relative times", () => {
    expect(new Intl.RelativeTimeFormat(Locale).format(7, 'day')).to.eq('in 7 days')
  })
})
