import { describe, expect, it } from 'vitest'
import { refusalTextOf } from '../../src/kit'

describe("refusalTextOf", () => {
  // refusalTextOf @example
  it("is reachable from the kit's entry, and answers anything that is no refusal as trouble", () => {
    const nonRefusals = [undefined, null, 'wrong_passphrase', 42, {}, { family: 'condition', refusalkind: 'wrong_passphrase' }, new Error('The key field is missing')]
    expect(nonRefusals.map((val) => refusalTextOf(val))).to.deep.equal(nonRefusals.map(() => 'Something went wrong. Please try again later.'))
  })
})
