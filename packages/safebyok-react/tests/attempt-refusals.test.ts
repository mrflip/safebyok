import { describe, expect, it } from 'vitest'
import { VaultError, type RefusalKind } from 'safebyok'
import { attemptRefusalFlavor } from '../src/attempt-refusals'

const FlavorCases: readonly (readonly [RefusalKind, string, string])[] = [
  // shown in place, to ask again:
  ["wrong_passphrase",    'in_place',          'a typo is shown beside the field'],
  ["wrong_passkey",       'in_place',          'a passkey that did not open the vault is shown in place'],
  ["weak_passphrase",     'in_place',          "a weak new passphrase is shown in place, the checker's reason its message"],
  // another way in:
  ["absent_wayin",        'in_place',          'a passkey gone is shown in place, the passphrase still offered'],
  ["damaged_wayin",       'in_place',          'a passkey stored damaged is shown in place, the passphrase still offered'],
  ["passkey_unavailable", 'in_place',          'a browser that cannot ask a passkey is shown in place, the passphrase still offered'],
  // advice:
  ["gate_made_elsewhere", 'gate_made_elsewhere', "a vault's first passphrase set first on another device is advice"],
  // closing the dialog:
  ["vault_locked",        'close',             'a lock that won closes the dialog'],
  ["storage_unavailable", 'close',             'storage out of reach closes the dialog'],
  ["damaged_vault",       'close',             'bad news the Contract does not name closes the dialog'],
  ["vault_gone",          'close',             'a vault let go, or found deleted, closes the dialog'],
  // the boundary:
  ["bad_option",          'trouble',           'misuse goes to the boundary, to be reported'],
  ["unexpected_error",    'trouble',           'a bug goes to the boundary, to be reported'],
]

describe("attemptRefusalFlavor, as the Contract's Gating groups its attempt's refusals", () => {
  for (const [kind, flavor, blurb] of FlavorCases) {
    it(blurb, () => { expect(attemptRefusalFlavor(new VaultError(kind, 'A refusal.'))).to.eq(flavor) })
  }

  it("sends a failure that is no VaultError to the boundary", () => {
    expect(attemptRefusalFlavor(new TypeError('fell over'))).to.eq('trouble')
    expect(attemptRefusalFlavor(null)).to.eq('trouble')
  })
})
