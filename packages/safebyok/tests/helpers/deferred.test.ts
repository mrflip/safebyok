import { describe, expect, it } from 'vitest'
import { deferred } from '../../src/helpers/deferred'

describe("deferred", () => {
  it("resolves its promise from outside, as its example shows", async () => {
    const settled = deferred<number>()
    settled.resolve(7)
    expect(await settled.promise).to.eq(7)
  })

  it("rejects its promise from outside", async () => {
    const settled = deferred<number>()
    settled.reject(new Error('refused'))
    await expect(settled.promise).rejects.toThrow('refused')
  })

  it("keeps the first settlement, ignoring any after it", async () => {
    const settled = deferred<string>()
    settled.resolve('first')
    settled.resolve('second')
    settled.reject(new Error('late'))
    expect(await settled.promise).to.eq('first')
  })

  it("is frozen, so no caller swaps a resolver out", () => {
    expect(Object.isFrozen(deferred())).to.be.true
  })
})
