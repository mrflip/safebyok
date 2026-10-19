import { describe, expect, it } from 'vitest'
import { VaultErrorKindVals } from 'safebyok'
import { SafebyokErrorKindVals, isSafebyokErrorData } from '../src/refusals'

const ErrorDataCases = [
  // safebyok's own refusals:
  [{ kind: "identity_revoked", message: "Sign in, then try again." }, true,   'an identity_revoked refusal with its message'],
  [{ kind: "vault_full", message: "Retire a box, then try again." },  true,   'a vault_full refusal with its message'],
  // anything else a ConvexError may carry:
  [{ kind: "stale_write", message: "Read it again." },               false,  'a VaultError kind the functions never throw'],
  [{ kind: "not_permitted", message: "Not yours." },                 false,  'not_permitted, which the functions no longer throw'],
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

  it("knows exactly the kinds the functions throw", () => {
    expect(SafebyokErrorKindVals).to.deep.equal(['identity_revoked', 'vault_full'])
  })
})

describe("SafebyokErrorKindVals", () => {
  it("names only kinds the core's VaultErrorKindVals lists", () => {
    for (const kind of SafebyokErrorKindVals) { expect(VaultErrorKindVals).to.include(kind) }
  })
})
