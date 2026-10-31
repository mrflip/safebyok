import { describe, expect, it } from 'vitest'
import * as TH from '../test-helpers'
import { boxListingOf, fullBoxRecord, useModelsWorld } from '../test-helpers/models-world'

const held = useModelsWorld()

describe("listing.fetch(scope): nothing stored for a thing held alive", () => {
  it("refuses 'record_conflict' by the same-revision row same | gone | alive, the box as it was and nothing saved to the cache", async () => {
    const listing = boxListingOf(held.mw)
    const box = await listing.build(fullBoxRecord())
    const before = box.cacheable
    held.mw.clearCalls()
    held.mw.willGet(held.mw.answerOf(box.scope, null))
    await TH.expectRefusal(listing.fetch(box.scope), 'record_conflict')
    expect(box.cacheable).to.deep.equal(before)
    expect(listing.at(box.scope)).to.eq(box)
    expect(held.mw.calls.map(({ verb }) => verb)).to.deep.equal(['ensureTimely', 'get', 'takeWorld'])
  })
})
