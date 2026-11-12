import { describe, expect, it } from 'vitest'
import * as EX from '../../src/shapes/shapes-enums'

describe("EX.amVals", () => {
  it("lists alive, damaged and gone", () => {
    expect(EX.amVals).to.deep.equal(['a', 'd', 'x'])
  })
})

describe("EX's delivering tags, EX.recordShapeVals and EX.ageVals", () => {
  it("list the kinds of the table", () => {
    expect(EX.deliveryFieldingVals).to.deep.equal(['as_sent', 'as_got', 'as_db', 'void', 'none'])
    expect(EX.deliveryMakingVals).to.deep.equal(['none', 'listed', 'make', 'remake'])
    expect(EX.deliveryModificationVals).to.deep.equal(['older', 'same', 'adopt'])
    expect(EX.recordShapeVals).to.deep.equal(['sparse', 'full', 'gone'])
    expect(EX.ageVals).to.deep.equal(['older', 'same', 'newer'])
  })
})

describe("EX.ifPresentVals", () => {
  it("name the three policies", () => {
    expect(EX.ifPresentVals).to.deep.equal(['repl', 'fail', 'get'])
  })
})

describe("EX.writeActVals, EX.foundActVals, EX.refusedActVals and EX.boxVaultActVals", () => {
  it("name the four acts that store and the four that answer what is stored", () => {
    expect(EX.writeActVals).to.deep.equal(['born', 'reborn', 'replaced', 'deleted'])
    expect(EX.foundActVals).to.deep.equal(['gotlive', 'gotvoid', 'gotgone', 'passed'])
  })

  it("name a refusal over the row asked for in one bare word, and one for a box's vault after the vault", () => {
    for (const act of EX.refusedActVals) { expect(act).to.match(/^[a-z]+$/) }
    for (const act of EX.boxVaultActVals) { expect(act).to.match(/^vault_[a-z]+$/) }
  })

  it("name no act twice", () => {
    const acts = [...EX.writeActVals, ...EX.foundActVals, ...EX.refusedActVals, ...EX.boxVaultActVals]
    expect(new Set(acts).size).to.eq(acts.length)
  })
})
