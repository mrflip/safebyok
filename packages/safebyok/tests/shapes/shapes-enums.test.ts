import { describe, expect, it } from 'vitest'
import * as EX from '../../src/shapes/shapes-enums'

describe("EX.amVals and EX.tombstoneAmVals", () => {
  it("list alive, damaged and gone, and for a tombstone only damaged and gone", () => {
    expect(EX.amVals).to.deep.equal(['a', 'd', 'x'])
    expect(EX.tombstoneAmVals).to.deep.equal(['d', 'x'])
  })
})

describe("EX.centralPolicyVals, EX.recordShapeVals and EX.ageVals", () => {
  it("list the kinds of the table", () => {
    expect(EX.centralPolicyVals).to.deep.equal(['older', 'same', 'fill', 'adopt', 'gone'])
    expect(EX.recordShapeVals).to.deep.equal(['sparse', 'full', 'gone'])
    expect(EX.ageVals).to.deep.equal(['older', 'same', 'newer'])
  })
})

describe("EX.ifPresentVals", () => {
  it("name the three policies", () => {
    expect(EX.ifPresentVals).to.deep.equal(['repl', 'fail', 'get'])
  })
})
