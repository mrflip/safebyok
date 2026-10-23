import { describe, it, expect } from 'vitest'
import { heldLeaseOf, registerLeaseReader } from '../src/held-lease'
import { Lease } from '../src/lease'
import { makeVaultKey } from '../src/crypto'
import * as TH from './test-helpers'

describe("heldLeaseOf", () => {
  it("reads the lease a registered vault holds now, afresh at each call, as its example shows", async () => {
    const vault = await TH.leasedSliceOf('u1', await makeVaultKey())
    const held = vault.lease
    expect(heldLeaseOf(vault)).to.eq(held)
    expect(heldLeaseOf(vault)).to.be.instanceOf(Lease)
    vault.lease = null
    expect(heldLeaseOf(vault)).to.be.null
  })

  it("is null for anything no reader was registered for", () => {
    expect(heldLeaseOf({})).to.be.null
  })
})

describe("registerLeaseReader", () => {
  it("registers a vault's reader once, as its example shows: a second registration changes nothing", async () => {
    const vault = await TH.leasedSliceOf('u1', await makeVaultKey())
    const held = vault.lease
    registerLeaseReader(vault, () => null)
    expect(heldLeaseOf(vault)).to.eq(held)
  })
})
