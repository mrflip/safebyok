import { describe, expect, it } from 'vitest'
import { Errors, Logger } from 'safebyok-big/internals'
import * as Core from '../src/core'
import * as Front from '../src/index'

describe("the front door, safebyok", () => {
  it("exports what a host touches, the same values safebyok/core does", () => {
    expect(Front.Device).to.eq(Core.Device)
    expect(Front.Bank).to.eq(Core.Bank)
    expect(Front.DefaultLeaseMillis).to.eq(Core.DefaultLeaseMillis)
    expect(Front.gatingkindVals).to.eq(Core.gatingkindVals)
  })

  it("re-exports safebyok-big's refusals and logger, the very ones the core throws and logs with", () => {
    expect(Front.VaultError).to.eq(Errors.VaultError)
    expect(Front.isVaultError).to.eq(Errors.isVaultError)
    expect(Front.setDefaultLogger).to.eq(Logger.setDefaultLogger)
  })

  it("keeps the lease, proving and sealer machinery behind safebyok/core", () => {
    for (const internal of ['Lease', 'Gating', 'Gate', 'Wayin', 'sealerkindVals', 'guardRequestCleartext']) { expect(Front).to.not.have.property(internal) }
  })
})
