import { ConvexError } from 'convex/values'
import { describe, expect, it } from 'vitest'
import * as TH from './test-helpers'

describe("convexRefusalOf", () => {
  it("hands back the data of the ConvexError the operation refused with", async () => {
    const data = { kind: 'not_permitted', message: 'Guests may not keep a vault.' }
    const refusal = await TH.convexRefusalOf(Promise.reject(new ConvexError(data)))
    expect(refusal).to.deep.equal(data)
  })

  it("reads a refusal from the host's functions, as its @example has it", async () => {
    const { api, createTest } = TH.hostWith(TH.bySubject)
    const refusal = await TH.convexRefusalOf(createTest().query(api.safebyok.getVault, { ...TH.scopeOf('u1') }))
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
