import { describe, expect, it } from 'vitest'
import { VaultError } from '../../src/errors'
import * as RefusalFuncs from '../../src/helpers/refusal-funcs'
import { modelsRefusalKindVals } from '../../src/models/models-shapes'

describe("RefusalFuncs", () => {
  it("makes, at each factory, a fresh VaultError of a refusalkind the models list", () => {
    const made = Object.entries(RefusalFuncs).map(([factoryname, factory]) => [factoryname, (factory as (arg?: unknown) => unknown)('main')] as const)
    for (const [factoryname, refusal] of made) {
      expect(refusal, factoryname).to.be.instanceOf(VaultError)
      expect(modelsRefusalKindVals, factoryname).to.include((refusal as VaultError).refusalkind)
    }
    expect(RefusalFuncs.vaultLocked()).not.to.equal(RefusalFuncs.vaultLocked())
  })

  it("refuses a first gate lost to another device as 'gate_made_elsewhere', saying to enter the passphrase chosen there", () => {
    const refusal = RefusalFuncs.gateMadeElsewhere()
    expect(refusal.refusalkind).to.eq('gate_made_elsewhere')
    expect(refusal.message).to.match(/set on another device/).and.to.match(/passphrase chosen there/)
  })
})
