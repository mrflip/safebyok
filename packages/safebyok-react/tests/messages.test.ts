import { describe, expect, it } from 'vitest'
import { Locale, Messages } from '../src/helpers/messages'

describe("Messages", () => {
  it("wraps each varying part in a whole sentence", () => {
    expect(Messages.locksIn('in 7 days')).to.eq('Locks on this device in 7 days.')
    expect(Messages.locksAgainIn('in 15 minutes')).to.eq('Locks again on this device in 15 minutes.')
  })

  it("has a non-empty string for every message", () => {
    const words = Object.values(Messages).filter((word) => typeof word === 'string')
    expect(words.every((word) => word.trim() !== '')).to.be.true
  })

  it("formats the dialog's relative times in the messages' locale", () => {
    expect(new Intl.RelativeTimeFormat(Locale).format(7, 'day')).to.eq('in 7 days')
  })
})
