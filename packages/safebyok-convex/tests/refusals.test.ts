import { describe, expect, it } from 'vitest'
import { refusalkindVals } from 'safebyok/storage'
import { safebyokErrorKindVals, isSafebyokErrorData } from '../src/refusals'

const ErrorDataCases = [
  [{ kind: "identity_revoked" },                     true,   'an identity_revoked refusal'],
  [{ kind: "identity_revoked", message: "Sign in" }, true,   'an identity_revoked refusal carrying more than its kind'],
  [{ kind: "bad_record", message: "Not next." },     true,   "a refusal of the core's checks, with its sentence"],
  [{ kind: "damaged_row" },                          false,  "a refusal of the core's checks without its sentence"],
  [{ kind: "stale_write" },                          false,  'a VaultError kind the wrapper never throws'],
  [{ kind: "not_permitted" },                        false,  "a kind of the host's own"],
  [{ message: "Sign in, then try again." },          false,  'a message without a kind'],
  ["identity_revoked",                               false,  'a bare string, as a host might throw'],
  [null,                                             false,  'null'],
  [undefined,                                        false,  'nothing at all'],
] as const

describe("isSafebyokErrorData", () => {
  for (const [data, expected, blurb] of ErrorDataCases) {
    it(`answers ${String(expected)} for ${blurb}`, () => { expect(isSafebyokErrorData(data)).to.eq(expected) })
  }
})

describe("safebyokErrorKindVals", () => {
  it("names only kinds the core's refusalkindVals lists", () => {
    for (const kind of safebyokErrorKindVals) { expect(refusalkindVals).to.include(kind) }
  })
})
