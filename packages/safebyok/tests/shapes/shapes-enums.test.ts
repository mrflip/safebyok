import { describe, expect, it } from 'vitest'
import * as EX from '../../src/shapes/shapes-enums'

describe("EX.amVals and EX.tombstoneAmVals", () => {
  it("name alive, damaged and gone, a tombstone's am being never alive", () => {
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

describe("EX.writeActVals, EX.foundActVals, EX.boxRefusedActVals and EX.vaultRefusedActVals", () => {
  it("name the four acts that store and the four that answer what is stored", () => {
    expect(EX.writeActVals).to.deep.equal(['born', 'reborn', 'replaced', 'deleted'])
    expect(EX.foundActVals).to.deep.equal(['got', 'void', 'gone', 'passed'])
  })

  it("name each refused act for the row it is about, and none twice", () => {
    for (const act of EX.boxRefusedActVals) { expect(act).to.match(/^(vault|box)_[a-z]+$/) }
    for (const act of EX.vaultRefusedActVals) { expect(act).to.match(/^vault_[a-z]+$/) }
    expect(new Set(EX.boxRefusedActVals).size).to.eq(EX.boxRefusedActVals.length)
    expect(new Set(EX.vaultRefusedActVals).size).to.eq(EX.vaultRefusedActVals.length)
  })

  it("give a vault every refusal a box has of its own row, but the damaged one's name", () => {
    const ofItsRow = EX.boxRefusedActVals.filter((act) => act.startsWith('box_') && (act !== 'box_damaged')).map((act) => act.replace('box_', 'vault_'))
    expect(EX.vaultRefusedActVals).to.include.members(ofItsRow)
  })
})
