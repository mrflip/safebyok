import { describe, expect, it } from 'vitest'
import * as Phrases from '../../src/helpers/phrases'

describe("Phrases", () => {
  it("counts one unknown field in the singular, several in the plural, naming none, and lists the fields taken", () => {
    expect(Phrases.unknownFields(1, ['sidecar'])).to.eq("There is a field it does not accept (its name is not repeated): it accepts only sidecar. Check the spelling, or leave it out")
    expect(Phrases.unknownFields(2, ['boxlabel', 'sidecar'])).to.eq("There are 2 fields it does not accept (their names are not repeated): it accepts only boxlabel, sidecar. Check the spelling, or leave them out")
    expect(Phrases.unknownFields(1, [])).to.include("it accepts no fields")
  })

  it("counts one more failure in the singular, several in the plural", () => {
    expect(Phrases.moreFailures(1)).to.eq("and 1 more failure")
    expect(Phrases.moreFailures(3)).to.eq("and 3 more failures")
  })
})
