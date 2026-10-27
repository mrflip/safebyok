import { describe, expect, it } from 'vitest'
import { refusalKindVals } from 'safebyok'
import { safebyokErrorKindVals, isSafebyokErrorData } from '../src/refusals'

const ErrorDataCases = [
  // safebyok's own refusals:
  [{ kind: "identity_revoked", message: "Sign in, then try again." }, true,   'an identity_revoked refusal with its message'],
  [{ kind: "not_permitted", message: "Not yours." },                 true,   "a not_permitted refusal, as a host's getUserId throws it"],
  // anything else a ConvexError may carry:
  [{ kind: "stale_write", message: "Read it again." },               false,  'a VaultError kind the functions never throw'],
  [{ kind: "vault_full", message: "Delete a box, then try again." },  false,  'vault_full, which a box write answers rather than throws'],
  [{ kind: "identity_revoked" },                                     false,  'a known kind without a message'],
  [{ kind: "identity_revoked", message: 42 },                        false,  'a message that is not text'],
  [{ message: "Sign in, then try again." },                          false,  'a message without a kind'],
  ["identity_revoked",                                               false,  'a bare string, as a host might throw'],
  [null,                                                             false,  'null'],
  [undefined,                                                        false,  'nothing at all'],
] as const

describe("isSafebyokErrorData", () => {
  for (const [data, expected, blurb] of ErrorDataCases) {
    it(`answers ${String(expected)} for ${blurb}`, () => { expect(isSafebyokErrorData(data)).to.eq(expected) })
  }

  it("knows exactly the kinds the functions and a host's getUserId throw", () => {
    expect(safebyokErrorKindVals).to.deep.equal(['identity_revoked', 'not_permitted'])
  })
})

describe("safebyokErrorKindVals", () => {
  it("names only kinds the core's refusalKindVals lists", () => {
    for (const kind of safebyokErrorKindVals) { expect(refusalKindVals).to.include(kind) }
  })
})
