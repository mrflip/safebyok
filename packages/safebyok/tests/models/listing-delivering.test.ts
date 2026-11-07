/** How a Listing delivers an answer: refused or malformed, past its end, a void row, one instance for each scope, and a record of another vault_tok. */

import { describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import { Box } from '../../src/models/box'
import * as SX from '../../src/shapes/shapes-storage'
import * as TH from '../test-helpers'
import { TestableBox, TestableBoxListing, boxDnaOf, boxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld } from '../test-helpers/models-world'

const held = useModelsWorld()

const sentinel = () => SX.sentinelBoxOf(held.mw.boxscope('anthropic_api_key'), held.mw.world.vault_tok)

// == [Helpers of the pipeline tests]: scopeOf, dnaOf

const scopeOf = (boxlabel = 'anthropic_api_key') => held.mw.boxscope(boxlabel)
const dnaOf = (boxlabel = 'anthropic_api_key') => boxDnaOf(scopeOf(boxlabel))
// --

describe("Listing's pipeline: what every answer takes", () => {
  describe("an answer refused or malformed", () => {
    it("throws a refusal as it came, delivering nothing", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      held.mw.clearCalls()
      const err = new VaultError('storage_unavailable', "Storage is down.")
      held.mw.willGet(held.mw.refusalOf(box.scope, err, 'a world'))
      const outcome = await listing.tryFetch(box.scope)
      expect(outcome.err).to.eq(err)
      expect(held.mw.callsOf('takeWorld')).to.deep.equal([{ verb: 'takeWorld', world: 'a world' }])
      expect(box.revision_seq).to.eq(1)
    })

    it("throws a refusal as it came, where its answer names no scope", async () => {
      const listing = boxListingOf(held.mw)
      const err = new VaultError('unexpected_error', "A bug.")
      held.mw.willGet({ ...held.mw.refusalOf(scopeOf(), err), req_params: {} })
      const outcome = await listing.tryFetch(scopeOf())
      expect(outcome.err).to.eq(err)
    })

    it("takes the world of a good answer", async () => {
      held.mw.seedStore(fullBoxRecord())
      held.mw.willGet(held.mw.answerOf(scopeOf(), fullBoxRecord(), 'the world now'))
      await boxListingOf(held.mw).fetch(scopeOf())
      expect(held.mw.callsOf('takeWorld')).to.deep.equal([{ verb: 'takeWorld', world: 'the world now' }])
    })
    it("refuses a fetch of a scope that is no scope, before the world or storage is called", async () => {
      const listing = boxListingOf(held.mw)
      await TH.expectRefusal(listing.fetch({ ...scopeOf(), boxlabel: 'Not A Label!' }))
      expect(held.mw.calls).to.deep.equal([])
    })

    it("refuses fetch options out of range, before the world or storage is called", async () => {
      const listing = boxListingOf(held.mw)
      await TH.expectRefusal(listing.fetch(scopeOf(), { ifAbsent: 'create' } as never))
      expect(held.mw.calls).to.deep.equal([])
    })

    it("hands the world its maxWorldMillis", async () => {
      held.mw.seedStore(fullBoxRecord())
      await boxListingOf(held.mw).fetch(scopeOf(), { maxWorldMillis: 5, ifAbsent: 'nil' })
      expect(held.mw.callsOf('ensureTimely')[0]?.maxMillis).to.eq(5)
    })
  })

  describe("an answer arriving past the listing's end", () => {
    it("refuses, a refusal among them, its world not taken", async () => {
      const listing = boxListingOf(held.mw)
      held.mw.willGet(() => {
        listing.vacate()
        return held.mw.refusalOf(scopeOf(), new VaultError('storage_unavailable', "Storage is down."), 'a world')
      })
      await TH.expectRefusal(listing.fetch(scopeOf()))
      expect(held.mw.callsOf('takeWorld')).to.deep.equal([])
    })
  })

  describe("a refusal met in delivering a record", () => {
    it("is thrown to a fetch, which cannot have the record it asked for: the box as it was, nothing told", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      held.mw.seedStore(fullBoxRecord({ revision_tok: 'rev-other' }))
      held.mw.clearCalls()
      await TH.expectRefusal(listing.fetch(scopeOf()))
      expect(listing.at(scopeOf())).to.eq(box)
      expect(box.revision_tok).to.eq('rev-a1')
      expect(held.mw.badnews).to.deep.equal([])
    })

    it("is thrown to a build(record), the box held kept as it was", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      held.mw.clearCalls()
      await TH.expectRefusal(listing.build(fullBoxRecord({ revision_tok: 'rev-other' })))
      expect(listing.at(scopeOf())).to.eq(box)
      expect(box.revision_tok).to.eq('rev-a1')
      expect(held.mw.badnews).to.deep.equal([])
    })

    it("is thrown to a put, the box as it was", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      held.mw.clearCalls()
      held.mw.willPut(held.mw.answerOf(box.scope, fullBoxRecord({ revision_tok: 'rev-other' })))
      await TH.expectRefusal(listing.put(listing.recordOf(box), { prior: box }))
      expect(box.revision_tok).to.eq('rev-a1')
      expect(held.mw.badnews).to.deep.equal([])
    })

    it("is thrown to a fetch of a scope not held, and nothing is held, saved or told", async () => {
      const listing = boxListingOf(held.mw)
      held.mw.seedStore(fullBoxRecord())
      const refused = vi.spyOn(Box.prototype, 'receive').mockImplementationOnce(() => { throw new VaultError('record_conflict', "Refused.") })
      try {
        await TH.expectRefusal(listing.fetch(scopeOf()))
      } finally {
        refused.mockRestore()
      }
      expect(listing.at(scopeOf())).to.be.null
      expect(listing.snapshot).to.deep.equal([])
      expect(held.mw.badnews).to.deep.equal([])
    })

    it("lets a 'stale_write' reach its caller as it came, the carried record's conflict going to onBadNews", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      held.mw.willPut(held.mw.staleWriteOf(box.scope, fullBoxRecord({ revision_tok: 'rev-other' })))
      const err = await TH.expectRefusal(listing.put(listing.recordOf(box), { prior: box }), 'stale_write')
      expect(err.meta).to.have.property('dbhas')
      expect(held.mw.badnews).to.have.length(1)
    })

    it("leaves the answer's own refusals to the caller: a world's, a refusal answer, the absent refusal", async () => {
      const listing = boxListingOf(held.mw)
      held.mw.willGet(held.mw.refusalOf(scopeOf(), new VaultError('storage_unavailable', "Down."), null))
      await TH.expectRefusal(listing.fetch(scopeOf()), 'storage_unavailable')
      await TH.expectRefusal(listing.fetch(scopeOf()), 'absent_box')
      expect(held.mw.badnews).to.deep.equal([])
    })

  })

  describe("a void row, delivered", () => {
    it("builds an instance that is held, gone, and not in the snapshot", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(sentinel())
      expect(listing.things).to.deep.equal([box])
      expect(box.isPresent).to.be.false
      expect(listing.snapshot).to.deep.equal([])
    })

    it("is the same revision however often it comes, not one revision under two toks", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(sentinel())
      expect(await listing.build(sentinel())).to.eq(box)
      expect(box.revision_tok).to.eq(SX.VoidRevisionTok)
      expect(box.revision_seq).to.eq(SX.VoidRevisionSeq)
    })
  })

  describe("one instance for each scope", () => {
    it("a create(dna) over the scope of a box stored and held alive hears the vaultDB's 'camped': the box held kept", async () => {
      const listing = boxListingOf(held.mw)
      const record = fullBoxRecord()
      held.mw.seedStore(record)
      const box = await listing.build(record)
      await TH.expectRefusal(listing.create(dnaOf()), 'camped')
      expect(listing.at(scopeOf())).to.eq(box)
      expect(box.revision_seq).to.eq(record.revision_seq)
    })

    it("a create(dna) over the scope of a box stored and held deleted brings it back on the instance held, at the next seq", async () => {
      const listing = boxListingOf(held.mw)
      const record = tombstoneBoxRecord({ revision_seq: 2 })
      held.mw.seedStore(record)
      const box = await listing.build(record)
      await expect(listing.create(dnaOf())).resolves.to.eq(box)
      expect(listing.at(scopeOf())).to.eq(box)
      expect(box.isPresent).to.be.true
      expect(box.revision_seq).to.eq(3)
    })

    it("makes each scope's instance once, however it arrives: a build, a fetch, a put, a del, a notice", async () => {
      const made = vi.spyOn(TestableBoxListing.prototype as unknown as { makeThing: () => TestableBox }, 'makeThing')
      try {
        const listing = boxListingOf(held.mw)
        await listing.hello()
        const box = await listing.build(fullBoxRecord({ boxlabel: 'built' }))
        await listing.build(fullBoxRecord({ boxlabel: 'built' }))
        held.mw.seedStore(fullBoxRecord({ boxlabel: 'fetched' }))
        await listing.fetch(scopeOf('fetched'))
        await listing.fetch(scopeOf('fetched'))
        held.mw.seedStore(fullBoxRecord({ boxlabel: 'built' }))
        await listing.put(fullBoxRecord({ boxlabel: 'built', revision_tok: 'rev-a2', revision_seq: 2 }), { prior: fullBoxRecord({ boxlabel: 'built' }) })
        await listing.del(box)
        await held.mw.notify(fullBoxRecord({ boxlabel: 'noticed' }))
        await held.mw.notify(fullBoxRecord({ boxlabel: 'noticed' }))
        await held.mw.notify(fullBoxRecord({ boxlabel: 'fetched', revision_tok: 'rev-a2', revision_seq: 2 }))
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
    const listing = boxListingOf(held.mw)
    await listing.hello()
    held.mw.clearCalls()
    await held.mw.notify(fullBoxRecord({ boxlabel: 'noticed' }), null)
    expect(held.mw.callsOf('takeWorld')).to.deep.equal([])
    expect(held.mw.badnews).to.deep.equal([])
    expect(listing.at(scopeOf('noticed'))?.isPresent).to.be.true
  })
})

describe("listing: a record of another vault_tok meets no instance held", () => {
  const OtherVault = 'vault-tok-other'

  it("refuses for a fetch answered with a record of another vault_tok, making nothing", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.willGet(held.mw.answerOf(scopeOf(), fullBoxRecord({ vault_tok: OtherVault })))
    await TH.expectRefusal(listing.fetch(scopeOf()))
    expect(listing.things).to.deep.equal([])
  })

  it("refuses a tombstone and a sparse record of another vault_tok alike", async () => {
    const listing = boxListingOf(held.mw)
    for (const record of [tombstoneBoxRecord({ vault_tok: OtherVault, revision_seq: 2 }), sparseBoxRecord({ vault_tok: OtherVault })]) {
      held.mw.willGet(held.mw.answerOf(scopeOf(), record))
      await TH.expectRefusal(listing.fetch(scopeOf()))
    }
    expect(listing.things).to.deep.equal([])
  })

  it("refuses build(record) of a record of another vault_tok, and passes over a notice of one", async () => {
    const listing = boxListingOf(held.mw)
    await TH.expectRefusal(listing.build(fullBoxRecord({ vault_tok: OtherVault })))
    held.mw.seedStore(fullBoxRecord())
    await listing.hello()
    held.mw.clearCalls()
    await held.mw.notify(fullBoxRecord({ boxlabel: 'other_box', vault_tok: OtherVault }))
    expect(held.mw.badnews).to.deep.equal([])
    expect(listing.at(scopeOf('other_box'))).to.be.null
  })

  it("leaves undelivered a stale_write refusal's stored record of another vault_tok, throwing the stale_write", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.willPut(held.mw.staleWriteOf(scopeOf(), fullBoxRecord({ vault_tok: OtherVault, revision_seq: 5 })))
    await TH.expectRefusal(listing.put(fullBoxRecord({ revision_seq: 0 }), { prior: SX.VoidRevision }), 'stale_write')
    expect(held.mw.badnews).to.deep.equal([])
    expect(listing.things).to.deep.equal([])
  })

  it("leaves a record of the vault's own vault_tok, and a dna, as they were", async () => {
    const listing = boxListingOf(held.mw)
    await expect(listing.build(fullBoxRecord())).resolves.to.be.instanceOf(Box)
    await expect(listing.create(dnaOf('draft_box'))).resolves.to.be.instanceOf(Box)
  })

  it("compares a record held under another vault_tok by reconcileCentral, so an instance held keeps refusing as it did", async () => {
    const listing = boxListingOf(held.mw)
    const box = await listing.build(fullBoxRecord())
    held.mw.willGet(held.mw.answerOf(box.scope, fullBoxRecord({ vault_tok: OtherVault, revision_seq: 2, revision_tok: 'rev-a2' })))
    const err = await TH.expectRefusal(listing.fetch(box.scope))
    expect(err.message).to.contain('kept its own copy')
  })
})

describe("listing: an answer names the scope of the record it carries", () => {
  it("refuses a fetch answered with a record of another scope, making nothing", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.willGet(held.mw.answerOf(scopeOf('asked_box'), fullBoxRecord({ boxlabel: 'other_box' })))
    await TH.expectRefusal(listing.fetch(scopeOf('asked_box')))
    expect(listing.things).to.deep.equal([])
  })

  it("leaves the instance held under the scope asked as it was, and the instance of the record's scope too", async () => {
    const listing = boxListingOf(held.mw)
    const asked = await listing.build(fullBoxRecord({ boxlabel: 'asked_box' }))
    const other = await listing.build(fullBoxRecord({ boxlabel: 'other_box' }))
    const [askedBefore, otherBefore] = [asked._cheat_central, other._cheat_central]
    held.mw.willGet(held.mw.answerOf(asked.scope, fullBoxRecord({ boxlabel: 'other_box', revision_seq: 2, revision_tok: 'rev-a2' })))
    await TH.expectRefusal(listing.fetch(asked.scope))
    expect(asked._cheat_central).to.deep.equal(askedBefore)
    expect(other._cheat_central).to.deep.equal(otherBefore)
  })

  it("refuses a put and a del answered with a record of another scope, and the record a stale_write carries, told to onBadNews with the stale_write thrown", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.willPut(held.mw.answerOf(scopeOf('asked_box'), fullBoxRecord({ boxlabel: 'other_box' })))
    await TH.expectRefusal(listing.put(fullBoxRecord({ boxlabel: 'asked_box', revision_seq: 0 }), { prior: SX.VoidRevision }))
    held.mw.willDel(held.mw.answerOf(scopeOf('asked_box'), tombstoneBoxRecord({ boxlabel: 'other_box', revision_seq: 2 })))
    await TH.expectRefusal(listing.del(sparseBoxRecord({ boxlabel: 'asked_box' })))
    held.mw.willPut(held.mw.staleWriteOf(scopeOf('asked_box'), fullBoxRecord({ boxlabel: 'other_box', revision_seq: 5 })))
    await TH.expectRefusal(listing.put(fullBoxRecord({ boxlabel: 'asked_box', revision_seq: 0 }), { prior: SX.VoidRevision }), 'stale_write')
    expect(held.mw.badnews).to.have.length(1)
    expect(listing.things).to.deep.equal([])
  })

  it("takes a record of the scope asked, however the answer's scope object was made", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.willGet(held.mw.answerOf({ ...scopeOf('asked_box') }, fullBoxRecord({ boxlabel: 'asked_box' })))
    await expect(listing.fetch(scopeOf('asked_box'))).resolves.to.be.instanceOf(Box)
  })
})
