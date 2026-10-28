import { describe, expect, it } from 'vitest'
import * as Phrases from '../src/phrases'
import { ScopepathDelimiter } from '../src/consts'

describe("Phrases", () => {
  it("counts one unknown field in the singular, several in the plural, naming none, and lists the fields taken", () => {
    expect(Phrases.unknownFields(1, ['sidecar'])).to.eq("There is a field it does not take (its name is not repeated): it takes only sidecar. Check the spelling, or leave it out")
    expect(Phrases.unknownFields(2, ['boxlabel', 'sidecar'])).to.eq("There are 2 fields it does not take (their names are not repeated): it takes only boxlabel, sidecar. Check the spelling, or leave them out")
    expect(Phrases.unknownFields(1, [])).to.include("it takes no fields")
  })

  it("counts one more failure in the singular, several in the plural", () => {
    expect(Phrases.moreFailures(1)).to.eq("and 1 more failure")
    expect(Phrases.moreFailures(3)).to.eq("and 3 more failures")
  })

  it("names each limit it is given", () => {
    expect(Phrases.labelTooLong(40)).to.include('40')
    expect(Phrases.userIdTooLong(100)).to.include('100')
  })

  it("names the scopepath delimiter where a scopepath's shape is said", () => {
    for (const said of [Phrases.BankScopepathShape, Phrases.VaultScopepathShape, Phrases.LeaseScopepathShape, Phrases.DeviceScopepathShape, Phrases.BoxScopepathShape]) {
      expect(said).to.include(ScopepathDelimiter)
    }
  })
})
