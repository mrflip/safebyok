import { describe, expect, it } from 'vitest'
import { stableJsonify } from '../src/stable-jsonify'

describe("stableJsonify", () => {
  it("serializes equal bags identically whatever order their fields were assigned", () => {
    expect(stableJsonify({ two: 2, one: 1 })).to.eq(stableJsonify({ one: 1, two: 2 }))
    expect(stableJsonify({ two: 2, one: 1 })).to.eq('{"one":1,"two":2}')
  })

  it("sorts keys at every depth, inside arrays too", () => {
    expect(stableJsonify([{ bb: { dd: 4, cc: 3 }, aa: 1 }])).to.eq('[{"aa":1,"bb":{"cc":3,"dd":4}}]')
  })

  it("keeps array order: only keys are sorted, never elements", () => {
    expect(stableJsonify([3, 1, 2])).to.eq('[3,1,2]')
  })

  it("handles primitives and null as JSON.stringify does", () => {
    expect(stableJsonify('hi')).to.eq('"hi"')
    expect(stableJsonify(null)).to.eq('null')
    expect(stableJsonify(42)).to.eq('42')
    expect(stableJsonify(undefined)).to.eq(undefined)
  })
})
