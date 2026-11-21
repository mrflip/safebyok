import { mask as coreMask } from 'safebyok'
import { describe, expect, it } from 'vitest'
import { mask } from '../src/index'

// Each key an obvious fake, of a length a real one has.
const RevealCases = [
  ["sk-ant-fake-0123456789abcdef",                                 "sk******************cdef",   'shows the last four characters of a key of 28'],
  ["sk-proj-fake-0123456789abcdef",                                "sk******************cdef",   'shows them of a key of 29'],
  ["sk-ant-api03-fake-0123456789abcdefghijklmnopqrstuvwxyz-0000",  "sk-*****************0000",   'shows them of a long key, cut to 24 characters'],
] as const

describe("mask", () => {
  it("is the core's mask", () => { expect(mask).to.eq(coreMask) })

  for (const [apiKey, expected, blurb] of RevealCases) {
    it(blurb, () => { expect(mask(apiKey, { tail: 4 })).to.eq(expected) })
  }

  it("shows no character of a key's tail at a tail of 0", () => {
    for (const [apiKey] of RevealCases) { expect(mask(apiKey, { tail: 0 })).to.match(/^sk-?\*+$/) }
  })
})
