import { describe, expect, it } from 'vitest'
import { DefaultMaskSchedule, maskOf } from '../src/mask'
import * as TH from './test-helpers'

/** A fake API key of `length` characters: a prefix, then a run of digits, then `f00d`. */
function fakeKeyOf(length: number): string {
  return `sk-ant-${'0123456789'.repeat(20)}`.slice(0, length - 4) + 'f00d'
}

const DefaultCases = [
  [fakeKeyOf(108),   "sk-ant-…f00d",   'shows the first seven characters and the last four of a long key'],
  [fakeKeyOf(22),    "sk-ant-…f00d",   'shows them while as many characters stay hidden as show'],
  [fakeKeyOf(21),    "…",              'shows nothing of a text too short to hide as many as it shows'],
  ["",               "…",              'shows nothing of an empty text'],
] as const

describe("maskOf", () => {
  // maskOf @example 1
  for (const [text, expected, blurb] of DefaultCases) {
    it(blurb, () => { expect(maskOf(text)).to.eq(expected) })
  }

  it("uses the default schedule of seven and four", () => {
    expect(DefaultMaskSchedule).to.deep.equal({ head: 7, tail: 4 })
  })

  // maskOf @example 2
  it("shows what a host's own schedule says", () => {
    expect(maskOf(fakeKeyOf(108), { head: 3, tail: 2 })).to.eq('sk-…0d')
    expect(maskOf(fakeKeyOf(108), { head: 0, tail: 0 })).to.eq('…')
    expect(maskOf(fakeKeyOf(10), { head: 3, tail: 2 })).to.eq('sk-…0d')
    expect(maskOf(fakeKeyOf(9), { head: 3, tail: 2 })).to.eq('…')
  })

  it("refuses a text that is no string, or a schedule of no counts", () => {
    TH.expectSyncRefusal(() => maskOf(42 as never), 'bad_record')
    TH.expectSyncRefusal(() => maskOf('sk-ant-0123', { head: -1, tail: 4 }), 'bad_record')
    TH.expectSyncRefusal(() => maskOf('sk-ant-0123', { head: 7 } as never), 'bad_record')
    TH.expectSyncRefusal(() => maskOf('sk-ant-0123', { head: 1.5, tail: 4 }), 'bad_record')
  })
})
