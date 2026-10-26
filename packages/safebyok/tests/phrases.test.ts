import { describe, expect, it } from 'vitest'
import * as Phrases from '../src/phrases'
import { ScopepathDelimiter } from '../src/consts'

describe("Phrases", () => {
  it("says one unknown field in the singular, several in the plural", () => {
    expect(Phrases.unknownFields(['note'])).to.eq("There is no field note: check its spelling, or leave it out")
    expect(Phrases.unknownFields(['note', 'tag'])).to.eq("There are no fields note, tag: check their spelling, or leave them out")
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
    for (const said of [Phrases.BankScopepathShape, Phrases.VaultScopepathShape, Phrases.BoxScopepathShape]) {
      expect(said).to.include(ScopepathDelimiter)
    }
  })
})
