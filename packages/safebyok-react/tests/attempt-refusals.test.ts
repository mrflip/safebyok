import { describe, expect, it } from 'vitest'
import { correctablekindVals, VaultError, type AnyGating, type Refusalkind } from 'safebyok-big'
import { gripeOfRefusal } from '../src/helpers/attempt-refusals'

const Open = { isOpen: true } as AnyGating
const Concluded = { isOpen: false } as AnyGating
const gripeOf = (gating: AnyGating, err: unknown) => gripeOfRefusal(gating, err, 'PassphraseModal')

describe("gripeOfRefusal", () => {
  it("words each kind the core leaves a gating open for, and names the kind", () => {
    for (const refusalkind of correctablekindVals) {
      expect(gripeOf(Open, new VaultError(refusalkind, 'A refusal.'))).to.deep.equal({ text: 'A refusal.', refusalkind })
    }
  })

  it("says nothing of a second attempt while one runs", () => {
    expect(gripeOf(Open, new VaultError('attempt_in_flight', 'A refusal.'))).to.be.null
  })

  const ConcludedKinds: readonly Refusalkind[] = ['absent_wayin', 'gating_concluded', 'dismissed', 'storage_unavailable', 'vault_gone', 'bad_option']
  for (const refusalkind of ConcludedKinds) {
    it(`says nothing of ${refusalkind} on a concluded gating`, () => {
      expect(gripeOf(Concluded, new VaultError(refusalkind, 'A refusal.'))).to.be.null
    })
  }

  it("throws anything else met while the gating is open, for the boundary", () => {
    expect(() => gripeOf(Open, new VaultError('bad_option', 'A refusal.'))).to.throw('A refusal.')
    expect(() => gripeOf(Open, new TypeError('fell over'))).to.throw(VaultError)
  })
})
