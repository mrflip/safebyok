/** What a BoxListing makes of the rows storage answers, an absent box above all, and the snapshot its boxes show. */

import { describe, expect, it } from 'vitest'
import { Box } from '../../src/models/box'
import * as SX from '../../src/shapes/shapes-storage'
import * as TH from '../test-helpers'
import { boxDnaOf, boxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld } from '../test-helpers/models-world'

const held = useModelsWorld()

const scope   = () => held.mw.boxscope('anthropic_api_key')

const gone    = () => tombstoneBoxRecord({ revision_seq: 2 })

/** The revision a stale_write says storage holds. */
const stored = { revision_tok: 'rev-s5', revision_seq: 5 }

/** A full box held, and the calls forgotten. */
const heldBox = async () => {
  const listing = boxListingOf(held.mw)
  const box = await listing.build(fullBoxRecord())
  held.mw.clearCalls()
  return { listing, box }
}

describe("BoxListing: an absent box", () => {
  describe("listing.fetch(scope) of nothing stored", () => {
    it("refuses 'absent_box' for a box not held, holding none", async () => {
      const listing = boxListingOf(held.mw)
      await TH.expectRefusal(listing.fetch(scope()), 'absent_box')
      expect(listing.at(scope())).to.be.null
    })

    it("resolves null for a box not held under 'nil'", async () => {
      const listing = boxListingOf(held.mw)
      expect(await listing.fetch(scope(), { ifAbsent: 'nil' })).to.be.null
      expect(listing.at(scope())).to.be.null
    })

    it("refuses 'absent_box' for a box held gone, which receives the answer as the same", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(gone())
      held.mw.clearCalls()
      await TH.expectRefusal(listing.fetch(scope()), 'absent_box')
      expect(listing.at(scope())).to.eq(box)
      expect(box.isPresent).to.be.false
    })

    it("resolves null for a box held gone under 'nil', the box still at `at(scope)` as its tombstone", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(gone())
      expect(await listing.fetch(scope(), { ifAbsent: 'nil' })).to.be.null
      expect(listing.at(scope())).to.eq(box)
      expect(box.am).to.eq('x')
      expect(box._cheat_central).to.deep.equal(gone())
    })

    it("takes the world of the answer before it refuses", async () => {
      held.mw.willGet(held.mw.answerOf(scope(), null, 'a world'))
      await TH.expectRefusal(boxListingOf(held.mw).fetch(scope()), 'absent_box')
      expect(held.mw.callsOf('takeWorld')).to.deep.equal([{ verb: 'takeWorld', world: 'a world' }])
    })
  })

  describe("listing.fetch(scope) of a stored tombstone", () => {
    for (const [form, tombstone, am] of [['deleted', gone, 'x']] as const) {
      const storeTombstone = () => { held.mw.seedStore(tombstone()) }

      it(`refuses 'absent_box' for a ${form} box, built and held as its tombstone`, async () => {
        storeTombstone()
        const listing = boxListingOf(held.mw)
        await TH.expectRefusal(listing.fetch(scope()), 'absent_box')
        const box = listing.at(scope())
        expect(box).to.be.instanceOf(Box)
        expect(box?.am).to.eq(am)
        expect(box?.isPresent).to.be.false
        expect(listing.snapshot).to.deep.equal([])
      })

      it(`resolves null for a ${form} box under 'nil', held all the same`, async () => {
        storeTombstone()
        const listing = boxListingOf(held.mw)
        expect(await listing.fetch(scope(), { ifAbsent: 'nil' })).to.be.null
        expect(listing.at(scope())?.am).to.eq(am)
      })

      it(`takes a ${form} box held alive away, then refuses 'absent_box'`, async () => {
        const listing = boxListingOf(held.mw)
        const box = await listing.build(fullBoxRecord())
        storeTombstone()
        await TH.expectRefusal(listing.fetch(scope()), 'absent_box')
        expect(listing.at(scope())).to.eq(box)
        expect(box.am).to.eq(am)
        expect(listing.snapshot).to.deep.equal([])
      })
    }

    it("resolves the box for a stored box, whichever the ifAbsent", async () => {
      held.mw.seedStore(fullBoxRecord())
      const listing = boxListingOf(held.mw)
      const box = await listing.fetch(scope())
      expect(box?.isFull).to.be.true
      expect(await listing.fetch(scope(), { ifAbsent: 'nil' })).to.eq(box)
    })

    it("resolves the box for a stored sparse record", async () => {
      held.mw.willGet(held.mw.answerOf(scope(), sparseBoxRecord()))
      const fetched = await boxListingOf(held.mw).fetch(scope())
      expect(fetched?.isFull).to.be.false
    })

    it("does not judge a put's or a del's answer: a deleted box comes back held", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      held.mw.seedStore(fullBoxRecord())
      expect(await listing.del(box)).to.eq(box)
    })
  })

  describe("box.fetch(opts) and box.hydrate(opts) of an absent box", () => {
    it("refuses 'absent_box' from box.fetch by default, and resolves the box under 'nil'", async () => {
      const box = await boxListingOf(held.mw).build(gone())
      await TH.expectRefusal(box.fetch(), 'absent_box')
      expect(await box.fetch({ ifAbsent: 'nil' })).to.eq(box)
    })

    it("hydrates an absent box without refusing: the refresh passes 'nil'", async () => {
      const box = await boxListingOf(held.mw).build(gone())
      held.mw.clearCalls()
      expect(await box.hydrate({ maxMillisSinceRefresh: 0 })).to.eq(box)
      expect(held.mw.callsOf('get')).to.have.lengthOf(1)
      expect(held.mw.badnews).to.deep.equal([])
    })

    it("tryHydrate resolves a good outcome for a box that storage has lost", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      held.mw.seedStore(gone())
      const outcome = await box.tryHydrate({ maxMillisSinceRefresh: 0 })
      expect(outcome.ok).to.be.true
      expect(box.isPresent).to.be.false
    })

  })

  describe("listing.build(tombstone)", () => {
    it("holds a gone instance: not present, no sidecar, absent from the snapshot", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(gone())
      expect(listing.at(scope())).to.eq(box)
      expect(box.isPresent).to.be.false
      expect(box.am).to.eq('x')
      expect(box.sidecar).to.be.null
      expect(listing.snapshot).to.deep.equal([])
    })

  })

  describe("a refused answer carrying what storage holds", () => {
    it("delivers a full box_stored to the box, then throws 'stale_write'", async () => {
      const { listing, box } = await heldBox()
      const record = fullBoxRecord({ ...stored, sidecar: { note: 'theirs' } })
      const stale = held.mw.staleWriteOf(box.scope, record)
      held.mw.willPut(stale)
      await TH.expectRefusal(listing.put(listing.recordOf(box), { prior: box }), 'stale_write')
      expect(box.revision_seq).to.eq(5)
      expect(box.isFull).to.be.true
      expect(box.sidecar).to.deep.equal({ note: 'theirs' })
    })

    it("delivers a sparse box_stored to the box, which holds no sidecar to speak of, then throws 'stale_write'", async () => {
      const { listing, box } = await heldBox()
      const stale = held.mw.staleWriteOf(box.scope, sparseBoxRecord(stored))
      held.mw.willPut(stale)
      await TH.expectRefusal(listing.put(listing.recordOf(box), { prior: box }), 'stale_write')
      expect(box.revision_seq).to.eq(5)
      expect(box.isFull).to.be.false
      expect(box.sidecar).to.be.null
    })

    it("delivers a box_stored that is a tombstone, then throws 'stale_write' rather than 'absent_box'", async () => {
      const { listing, box } = await heldBox()
      const stale = held.mw.staleWriteOf(box.scope, tombstoneBoxRecord(stored))
      held.mw.willPut(stale)
      await TH.expectRefusal(listing.put(listing.recordOf(box), { prior: box }), 'stale_write')
      expect(box.isPresent).to.be.false
    })

    it("delivers a box_stored the box was deleted under, then throws 'stale_write', for a del too", async () => {
      const { listing, box } = await heldBox()
      const stale = held.mw.staleWriteOf(box.scope, fullBoxRecord(stored))
      held.mw.willDel(stale)
      await TH.expectRefusal(listing.del(box), 'stale_write')
      expect(box.revision_seq).to.eq(5)
    })

    it("throws 'stale_write' with nothing delivered for a refusal without meta", async () => {
      const { listing, box } = await heldBox()
      const stale = held.mw.staleWriteOf(box.scope, undefined)
      held.mw.willPut(stale)
      await TH.expectRefusal(listing.put(listing.recordOf(box), { prior: box }), 'stale_write')
      expect(box._cheat_central.revision_seq).to.eq(1)
    })

    it("throws 'stale_write' with nothing delivered for a box_stored of null", async () => {
      const { listing, box } = await heldBox()
      const stale = held.mw.staleWriteOf(box.scope, null)
      held.mw.willPut(stale)
      await TH.expectRefusal(listing.put(listing.recordOf(box), { prior: box }), 'stale_write')
    })

    it("throws 'stale_write' with nothing delivered for a box_stored that fails its check", async () => {
      const { listing, box } = await heldBox()
      const stale = held.mw.staleWriteOf(box.scope, { junk: 1 } as never)
      held.mw.willPut(stale)
      await TH.expectRefusal(listing.put(listing.recordOf(box), { prior: box }), 'stale_write')
      expect(box._cheat_central.revision_seq).to.eq(1)
    })

    it("delivers box_stored to a box not yet held, building it", async () => {
      const listing = boxListingOf(held.mw)
      const stale = held.mw.staleWriteOf(scope(), fullBoxRecord(stored))
      held.mw.willPut(stale)
      await TH.expectRefusal(listing.put(fullBoxRecord({ revision_seq: 0 }), { prior: SX.VoidRevision }), 'stale_write')
      expect(listing.at(scope())?.revision_seq).to.eq(5)
    })

    it("delivers the record of a stale_write to a fetch's refusal-bearing answer too", async () => {
      const listing = boxListingOf(held.mw)
      const stale = held.mw.staleWriteOf(scope(), fullBoxRecord(stored))
      held.mw.willGet(stale)
      await TH.expectRefusal(listing.fetch(scope()), 'stale_write')
      expect(listing.at(scope())?.revision_seq).to.eq(5)
    })
  })
})

describe("BoxListing: its snapshot is what its boxes show", () => {
  it("shows a box's sidecar as `box.sidecar` gives it: Bob's your uncle by any path", async () => {
    const listing = boxListingOf(held.mw)
    const box = await listing.build(fullBoxRecord({ boxlabel: 'robert', sidecar: { uncle: 'Bob' } }))
    const robert = listing.at(held.mw.boxscope('robert'))
    expect(robert?.sidecar).to.deep.equal({ uncle: 'Bob' })
    expect(robert?.snapshot.sidecar).to.deep.equal({ uncle: 'Bob' })
    expect(listing.snapshot[0]?.sidecar).to.deep.equal({ uncle: 'Bob' })
    expect(listing.snapshot[0]).to.eq(box.snapshot)
    expect(listing.getSnapshot()[0]).to.eq(box.getSnapshot())
  })

  it("shows a box created from a dna as the record it stored", async () => {
    const listing = boxListingOf(held.mw)
    const box = await listing.create(boxDnaOf(scope()))
    const [shown] = listing.snapshot
    expect(shown).to.eq(box.snapshot)
    expect(shown).to.include({ boxlabel: 'anthropic_api_key', revision_seq: 0, present: true, full: true })
  })

  it("shows a box sparse as its snapshot does: present, not full, no sidecar", async () => {
    const listing = boxListingOf(held.mw)
    await listing.build(sparseBoxRecord())
    expect(listing.snapshot[0]).to.include({ present: true, full: false, sidecar: null })
  })

  it("follows the box through a put: the listing shows the sidecar `box.sidecar` now gives", async () => {
    const listing = boxListingOf(held.mw)
    const record = fullBoxRecord({ sidecar: { uncle: 'Bob' } })
    held.mw.seedStore(record)
    const box = await listing.build(record)
    await box.put({ whisper: 'sk-test-0000', sidecar: { uncle: 'Robert' } })
    expect(box.sidecar).to.deep.equal({ uncle: 'Robert' })
    expect(listing.snapshot[0]?.sidecar).to.deep.equal({ uncle: 'Robert' })
  })
})
