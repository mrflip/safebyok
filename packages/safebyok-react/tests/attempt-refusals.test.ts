import { describe, expect, it } from 'vitest'
import { correctablekindVals, VaultError, type Refusalkind } from 'safebyok'
import { attemptRefusalFlavor } from '../src/helpers/attempt-refusals'

const FlavorCases: readonly (readonly [Refusalkind, string, string])[] = [
  // shown in place, to ask again:
  ["wrong_passphrase",    "in_place",  'a typo is shown beside the field'],
  ["wrong_passkey",       "in_place",  'a passkey that did not open the vault is shown in place'],
  ["passkey_unavailable", "in_place",  'a browser or authenticator that cannot answer for a passkey is shown in place, the passphrase still open'],
  ["weak_passphrase",     "in_place",  "a weak new passphrase is shown in place, the checker's reason its message"],
  ["same_passphrase",     "in_place",  'a new passphrase that is the current one again is shown in place, to choose another'],
  // closing the dialog:
  ["absent_wayin",        "close",     'a passkey gone closes the dialog'],
  ["vault_locked",        "close",     'a lock that won closes the dialog'],
  ["locked_while_asking", "close",     'a lock that landed while the dialog asked closes it'],
  ["gating_landed",       "close",     'a gating ended meanwhile closes the dialog'],
  ["declined",            "close",     'a gating declined elsewhere closes the dialog'],
  ["storage_unavailable", "close",     'storage out of reach closes the dialog'],
  ["vault_gone",          "close",     'a vault found deleted closes the dialog'],
  // waiting out the attempt under way:
  ["attempt_in_flight",   "in_flight", 'a second attempt while one runs closes nothing: the first answers'],
  // the boundary:
  ["bad_option",          "trouble",   'misuse goes to the boundary, to be reported'],
  ["unexpected_error",    "trouble",   'a bug goes to the boundary, to be reported'],
]

describe("attemptRefusalFlavor", () => {
  for (const [kind, flavor, blurb] of FlavorCases) {
    it(blurb, () => { expect(attemptRefusalFlavor(new VaultError(kind, 'A refusal.'))).to.eq(flavor) })
  }

  it("shows in place exactly the kinds the core leaves a gating open for", () => {
    for (const kind of correctablekindVals) { expect(attemptRefusalFlavor(new VaultError(kind, 'A refusal.'))).to.eq('in_place') }
  })

  it("sends a failure that is no VaultError to the boundary", () => {
    expect(attemptRefusalFlavor(new TypeError('fell over'))).to.eq('trouble')
    expect(attemptRefusalFlavor(null)).to.eq('trouble')
  })
})
