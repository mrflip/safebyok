import { describe, expect, it } from 'vitest'
import * as Core from '../src/core'
import * as Front from '../src/index'

describe("the front door, safebyok", () => {
  it("exports what a host touches, the same values safebyok/core does", () => {
    expect(Front.Device).to.eq(Core.Device)
    expect(Front.Bank).to.eq(Core.Bank)
    expect(Front.DefaultLeaseMillis).to.eq(Core.DefaultLeaseMillis)
    expect(Front.gatingkindVals).to.eq(Core.gatingkindVals)
  })

  it("keeps the lease, proving and sealer machinery behind safebyok/core", () => {
    expect(Object.keys(Front).toSorted((aa, bb) => aa.localeCompare(bb))).to.deep.equal(['Bank', 'DefaultLeaseMillis', 'Device', 'gatingkindVals'])
  })
})
