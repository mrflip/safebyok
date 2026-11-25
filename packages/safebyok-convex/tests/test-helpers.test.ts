import { ConvexError } from 'convex/values'
import { describe, expect, it } from 'vitest'
import * as TH from './test-helpers'

describe("convexRefusalOf", () => {
  it("hands back the data of the ConvexError the operation refused with", async () => {
    const crossed = { kind: 'identity_revoked' }
    const refusal = await TH.convexRefusalOf(Promise.reject(new ConvexError(crossed)))
    expect(refusal).to.deep.equal(crossed)
  })

  it("reads a refusal from the host's functions", async () => {
    const { api, createTest } = TH.vaultHostWith(TH.bySubject)
    const refusal = await TH.convexRefusalOf(createTest().query(api.safebyokVault.getWorld, { ask: TH.getWorldAskOf() }))
    expect(refusal.kind).to.eq('identity_revoked')
  })

  it("fails the test when the operation resolves", async () => {
    await expect(TH.convexRefusalOf(Promise.resolve('fine'))).rejects.toThrow('the call was not refused')
  })

  it("throws on any other error, which is not a refusal", async () => {
    const trouble = new Error('plain trouble')
    await expect(TH.convexRefusalOf(Promise.reject(trouble))).rejects.toThrow(trouble)
  })
})
