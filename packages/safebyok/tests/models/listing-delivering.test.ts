/** How a Listing delivers an answer: refused or malformed, past its end, a void row, one instance for each scope, and a record of another vault_tok. */

import { describe, expect, it, vi } from 'vitest'
import * as Phrases from '../../src/helpers/phrases'
import { VaultError } from '../../src/refusals/errors'
import { Box } from '../../src/models/box'
import * as SX from '../../src/shapes/shapes-storage'
import * as TH from '../test-helpers'
import { TestableBox, TestableBoxListing, boxDnaOf, boxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld } from '../test-helpers/models-world'

const world = useModelsWorld()

const sentinel = () => SX.sentinelBoxOf(world.mw.boxscope('anthropic_api_key'), world.mw.world.vault_tok)

// == [Helpers of the pipeline tests]: scopeOf, dnaOf

const scopeOf = (boxlabel = 'anthropic_api_key') => world.mw.boxscope(boxlabel)
const dnaOf = (boxlabel = 'anthropic_api_key') => boxDnaOf(scopeOf(boxlabel))
// --

describe("Listing's pipeline: what every answer goes through", () => {
  describe("an answer refused or malformed", () => {
    it("passes a refusal through unchanged and delivers nothing", async () => {
      const listing = boxListingOf(world.mw)
      const box = await listing.build(fullBoxRecord())
      world.mw.clearCalls()
      const err = new VaultError('storage_unavailable', "Storage is down.")
      world.mw.willGet(world.mw.refusalOf(box.scope, err, 'a world'))
      const outcome = await listing.tryFetch(box.scope)
      expect(outcome.err).to.eq(err)
      expect(world.mw.callsOf('receiveWorld')).to.deep.equal([{ verb: 'receiveWorld', world: 'a world' }])
      expect(box.revision_seq).to.eq(1)
    })

    it("passes a refusal through unchanged when its answer names no scope", async () => {
      const listing = boxListingOf(world.mw)
      const err = new VaultError('unexpected_error', "A bug.")
      world.mw.willGet({ ...world.mw.refusalOf(scopeOf(), err), req_params: {} })
      const outcome = await listing.tryFetch(scopeOf())
      expect(outcome.err).to.eq(err)
    })

    it("takes the world of a good answer", async () => {
      world.mw.seedPut(fullBoxRecord())
      world.mw.willGet(world.mw.answerOf(scopeOf(), fullBoxRecord(), 'the world now'))
      await boxListingOf(world.mw).fetch(scopeOf())
      expect(world.mw.callsOf('receiveWorld')).to.deep.equal([{ verb: 'receiveWorld', world: 'the world now' }])
    })
    it("refuses a fetch of a malformed scope, before the world or storage is called", async () => {
      const listing = boxListingOf(world.mw)
      await TH.expectRefusal(listing.fetch({ ...scopeOf(), boxlabel: 'Not A Label!' }))
      expect(world.mw.calls).to.deep.equal([])
    })

    it("refuses fetch options out of range, before the world or storage is called", async () => {
      const listing = boxListingOf(world.mw)
      await TH.expectRefusal(listing.fetch(scopeOf(), { ifAbsent: 'create' } as never))
      expect(world.mw.calls).to.deep.equal([])
    })

    it("hands the world its maxWorldMillis", async () => {
      world.mw.seedPut(fullBoxRecord())
      await boxListingOf(world.mw).fetch(scopeOf(), { maxWorldMillis: 5, ifAbsent: 'nil' })
      expect(world.mw.callsOf('ensureTimely')[0]?.maxMillis).to.eq(5)
    })
  })

  describe("an answer arriving past the listing's end", () => {
    it("refuses without receiving its world, even when the answer is a refusal", async () => {
      const listing = boxListingOf(world.mw)
      world.mw.willGet(() => {
        listing.vacate()
        return world.mw.refusalOf(scopeOf(), new VaultError('storage_unavailable', "Storage is down."), 'a world')
      })
      await TH.expectRefusal(listing.fetch(scopeOf()))
      expect(world.mw.callsOf('receiveWorld')).to.deep.equal([])
    })
  })

  describe("a refusal met in delivering a record", () => {
    it("is thrown to a fetch, leaving the box unchanged", async () => {
      const listing = boxListingOf(world.mw)
      const box = await listing.build(fullBoxRecord())
      world.mw.seedPut(fullBoxRecord({ revision_tok: 'rev-other' }))
      world.mw.clearCalls()
      await TH.expectRefusal(listing.fetch(scopeOf()))
      expect(listing.at(scopeOf())).to.eq(box)
      expect(box.revision_tok).to.eq('rev-a1')
      expect(world.mw.badnews).to.deep.equal([])
    })

    it("is thrown to a build(record), leaving the listed box unchanged", async () => {
      const listing = boxListingOf(world.mw)
      const box = await listing.build(fullBoxRecord())
      world.mw.clearCalls()
      await TH.expectRefusal(listing.build(fullBoxRecord({ revision_tok: 'rev-other' })))
      expect(listing.at(scopeOf())).to.eq(box)
      expect(box.revision_tok).to.eq('rev-a1')
      expect(world.mw.badnews).to.deep.equal([])
    })

    it("is thrown to a put, leaving the box unchanged", async () => {
      const listing = boxListingOf(world.mw)
      const box = await listing.build(fullBoxRecord())
      world.mw.clearCalls()
      world.mw.willPut(world.mw.answerOf(box.scope, fullBoxRecord({ revision_tok: 'rev-other' })))
      await TH.expectRefusal(listing.put(listing.recordOf(box), { prior: box }))
      expect(box.revision_tok).to.eq('rev-a1')
      expect(world.mw.badnews).to.deep.equal([])
    })

    it("is thrown to a fetch of a scope not yet listed, and nothing is listed or reported", async () => {
      const listing = boxListingOf(world.mw)
      world.mw.seedPut(fullBoxRecord())
      const refused = vi.spyOn(Box.prototype, 'receive').mockImplementationOnce(() => { throw new VaultError('record_conflict', "Refused.") })
      try {
        await TH.expectRefusal(listing.fetch(scopeOf()))
      } finally {
        refused.mockRestore()
      }
      expect(listing.at(scopeOf())).to.be.null
      expect(listing.snapshot).to.deep.equal([])
      expect(world.mw.badnews).to.deep.equal([])
    })

    it("goes to onBadNews when a 'stale_write' carried the record, and the 'stale_write' is still thrown", async () => {
      const listing = boxListingOf(world.mw)
      const box = await listing.build(fullBoxRecord())
      world.mw.willPut(world.mw.staleWriteOf(box.scope, fullBoxRecord({ revision_tok: 'rev-other' })))
      const err = await TH.expectRefusal(listing.put(listing.recordOf(box), { prior: box }), 'stale_write')
      expect(err.meta ?? {}).to.not.have.property('dbhas')
      expect(world.mw.badnews).to.have.length(1)
    })

    it("leaves the answer's own refusals to the caller", async () => {
      const listing = boxListingOf(world.mw)
      world.mw.willGet(world.mw.refusalOf(scopeOf(), new VaultError('storage_unavailable', "Down."), null))
      await TH.expectRefusal(listing.fetch(scopeOf()), 'storage_unavailable')
      await TH.expectRefusal(listing.fetch(scopeOf()), 'absent_box')
      expect(world.mw.badnews).to.deep.equal([])
    })

  })

  describe("a void row, delivered", () => {
    it("builds a listed instance that is not present and not in the snapshot", async () => {
      const listing = boxListingOf(world.mw)
      const box = await listing.build(sentinel())
      expect(listing.things).to.deep.equal([box])
      expect(box.isPresent).to.be.false
      expect(listing.snapshot).to.deep.equal([])
    })

    it("builds the same instance at the void revision however often it arrives", async () => {
      const listing = boxListingOf(world.mw)
      const box = await listing.build(sentinel())
      expect(await listing.build(sentinel())).to.eq(box)
      expect(box.revision_tok).to.eq(SX.VoidRevisionTok)
      expect(box.revision_seq).to.eq(SX.VoidRevisionSeq)
    })
  })

  describe("one instance for each scope", () => {
    it("a create(dna) over a live listed box refuses 'camped' and leaves the box unchanged", async () => {
      const listing = boxListingOf(world.mw)
      const record = fullBoxRecord()
      world.mw.seedPut(record)
      const box = await listing.build(record)
      await TH.expectRefusal(listing.create(dnaOf()), 'camped')
      expect(listing.at(scopeOf())).to.eq(box)
      expect(box.revision_seq).to.eq(record.revision_seq)
    })

    it("a create(dna) over a deleted listed box brings it back on the same instance, at the next seq", async () => {
      const listing = boxListingOf(world.mw)
      const record = tombstoneBoxRecord({ revision_seq: 2 })
      world.mw.seedPut(record)
      const box = await listing.build(record)
      await expect(listing.create(dnaOf())).resolves.to.eq(box)
      expect(listing.at(scopeOf())).to.eq(box)
      expect(box.isPresent).to.be.true
      expect(box.revision_seq).to.eq(3)
    })

    it("makes each scope's instance once, however it arrives: a build, a fetch, a put, a del, a notice", async () => {
      const made = vi.spyOn(TestableBoxListing.prototype as unknown as { makeThing: () => TestableBox }, 'makeThing')
      try {
        const listing = boxListingOf(world.mw)
        await listing.hello()
        const box = await listing.build(fullBoxRecord({ boxlabel: 'built' }))
        await listing.build(fullBoxRecord({ boxlabel: 'built' }))
        world.mw.seedPut(fullBoxRecord({ boxlabel: 'fetched' }))
        await listing.fetch(scopeOf('fetched'))
        await listing.fetch(scopeOf('fetched'))
        world.mw.seedPut(fullBoxRecord({ boxlabel: 'built' }))
        await listing.put(fullBoxRecord({ boxlabel: 'built', revision_tok: 'rev-a2', revision_seq: 2 }), { prior: fullBoxRecord({ boxlabel: 'built' }) })
        await listing.del(box.sparse)
        await world.mw.notify(fullBoxRecord({ boxlabel: 'noticed' }))
        await world.mw.notify(fullBoxRecord({ boxlabel: 'noticed' }))
        await world.mw.notify(fullBoxRecord({ boxlabel: 'fetched', revision_tok: 'rev-a2', revision_seq: 2 }))
        expect(made).to.have.callCount(3)
        expect(listing.things).to.have.lengthOf(3)
      } finally {
        made.mockRestore()
      }
    })
  })
})

describe("listing: a notice without its vault row", () => {
  it("delivers the box, the world's vault row kept as it was", async () => {
    const listing = boxListingOf(world.mw)
    await listing.hello()
    world.mw.clearCalls()
    await world.mw.notify(fullBoxRecord({ boxlabel: 'noticed' }), null)
    expect(world.mw.callsOf('receiveWorld')).to.deep.equal([])
    expect(world.mw.badnews).to.deep.equal([])
    expect(listing.at(scopeOf('noticed'))?.isPresent).to.be.true
  })
})

describe("listing: a record of another vault_tok reaches no listed instance", () => {
  const OtherVault = 'vault-tok-other'

  it("refuses for a fetch answered with a record of another vault_tok, making nothing", async () => {
    const listing = boxListingOf(world.mw)
    world.mw.willGet(world.mw.answerOf(scopeOf(), fullBoxRecord({ vault_tok: OtherVault })))
    await TH.expectRefusal(listing.fetch(scopeOf()))
    expect(listing.things).to.deep.equal([])
  })

  it("refuses a tombstone and a sparse record of another vault_tok alike", async () => {
    const listing = boxListingOf(world.mw)
    for (const record of [tombstoneBoxRecord({ vault_tok: OtherVault, revision_seq: 2 }), sparseBoxRecord({ vault_tok: OtherVault })]) {
      world.mw.willGet(world.mw.answerOf(scopeOf(), record))
      await TH.expectRefusal(listing.fetch(scopeOf()))
    }
    expect(listing.things).to.deep.equal([])
  })

  it("refuses build(record) of a record of another vault_tok, and passes over a notice of one", async () => {
    const listing = boxListingOf(world.mw)
    await TH.expectRefusal(listing.build(fullBoxRecord({ vault_tok: OtherVault })))
    world.mw.seedPut(fullBoxRecord())
    await listing.hello()
    world.mw.clearCalls()
    await world.mw.notify(fullBoxRecord({ boxlabel: 'other_box', vault_tok: OtherVault }))
    expect(world.mw.badnews).to.deep.equal([])
    expect(listing.at(scopeOf('other_box'))).to.be.null
  })

  it("throws a 'stale_write' whose record has another vault_tok without delivering that record", async () => {
    const listing = boxListingOf(world.mw)
    world.mw.willPut(world.mw.staleWriteOf(scopeOf(), fullBoxRecord({ vault_tok: OtherVault, revision_seq: 5 })))
    await TH.expectRefusal(listing.put(fullBoxRecord({ revision_seq: 0 }), { prior: SX.VoidRevision }), 'stale_write')
    expect(world.mw.badnews).to.deep.equal([])
    expect(listing.things).to.deep.equal([])
  })

  it("accepts a record of the vault's own vault_tok, and a dna", async () => {
    const listing = boxListingOf(world.mw)
    await expect(listing.build(fullBoxRecord())).resolves.to.be.instanceOf(Box)
    await expect(listing.create(dnaOf('draft_box'))).resolves.to.be.instanceOf(Box)
  })

  it("refuses a record of another vault_tok fetched for a listed instance, saying it is another vault's", async () => {
    const listing = boxListingOf(world.mw)
    const box = await listing.build(fullBoxRecord())
    world.mw.willGet(world.mw.answerOf(box.scope, fullBoxRecord({ vault_tok: OtherVault, revision_seq: 2, revision_tok: 'rev-a2' })))
    const err = await TH.expectRefusal(listing.fetch(box.scope))
    expect(err.message).to.eq(Phrases.OtherVaultTok)
  })
})

describe("listing: an answer names the scope of the record it carries", () => {
  it("refuses a fetch answered with a record of another scope, making nothing", async () => {
    const listing = boxListingOf(world.mw)
    world.mw.willGet(world.mw.answerOf(scopeOf('asked_box'), fullBoxRecord({ boxlabel: 'other_box' })))
    await TH.expectRefusal(listing.fetch(scopeOf('asked_box')))
    expect(listing.things).to.deep.equal([])
  })

  it("leaves the listed instances of both scopes unchanged", async () => {
    const listing = boxListingOf(world.mw)
    const asked = await listing.build(fullBoxRecord({ boxlabel: 'asked_box' }))
    const other = await listing.build(fullBoxRecord({ boxlabel: 'other_box' }))
    const [askedBefore, otherBefore] = [asked._cheat_central, other._cheat_central]
    world.mw.willGet(world.mw.answerOf(asked.scope, fullBoxRecord({ boxlabel: 'other_box', revision_seq: 2, revision_tok: 'rev-a2' })))
    await TH.expectRefusal(listing.fetch(asked.scope))
    expect(asked._cheat_central).to.deep.equal(askedBefore)
    expect(other._cheat_central).to.deep.equal(otherBefore)
  })

  it("refuses a put or a del answered with a record of another scope", async () => {
    const listing = boxListingOf(world.mw)
    world.mw.willPut(world.mw.answerOf(scopeOf('asked_box'), fullBoxRecord({ boxlabel: 'other_box' })))
    await TH.expectRefusal(listing.put(fullBoxRecord({ boxlabel: 'asked_box', revision_seq: 0 }), { prior: SX.VoidRevision }))
    world.mw.willDel(world.mw.answerOf(scopeOf('asked_box'), tombstoneBoxRecord({ boxlabel: 'other_box', revision_seq: 2 })))
    await TH.expectRefusal(listing.del(sparseBoxRecord({ boxlabel: 'asked_box' })))
    world.mw.willPut(world.mw.staleWriteOf(scopeOf('asked_box'), fullBoxRecord({ boxlabel: 'other_box', revision_seq: 5 })))
    await TH.expectRefusal(listing.put(fullBoxRecord({ boxlabel: 'asked_box', revision_seq: 0 }), { prior: SX.VoidRevision }), 'stale_write')
    expect(world.mw.badnews).to.have.length(1)
    expect(listing.things).to.deep.equal([])
  })

  it("takes a record of the scope asked, however the answer's scope object was made", async () => {
    const listing = boxListingOf(world.mw)
    world.mw.willGet(world.mw.answerOf({ ...scopeOf('asked_box') }, fullBoxRecord({ boxlabel: 'asked_box' })))
    await expect(listing.fetch(scopeOf('asked_box'))).resolves.to.be.instanceOf(Box)
  })
})
