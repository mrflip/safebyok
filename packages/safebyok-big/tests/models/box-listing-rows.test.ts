/** What a BoxListing makes of the rows storage answers, an absent box above all, and the snapshot its boxes show. */

import { describe, expect, it, vi } from 'vitest'
import { Box } from '../../src/models/box'
import * as TH from '../test-helpers'
import { boxDnaOf, boxListingOf, fullBoxRecord, shellBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld } from '../test-helpers/models-world'

const world = useModelsWorld()

function scope() { return world.mw.boxscope('anthropic_api_key') }

const gone    = () => tombstoneBoxRecord({ revision_seq: 2 })

/** The revision a stale_write says storage has stored. */
const stored = { revision_tok: 'rev-s5', revision_seq: 5 }

/** A full box world, and the calls forgotten. */
function listedBox() {
  const listing = boxListingOf(world.mw)
  const box = listing.deliverRecord(fullBoxRecord())
  world.mw.clearCalls()
  return { listing, box }
}

describe("BoxListing: an absent box", () => {
  describe("listing.get(scope) of nothing stored", () => {
    it("refuses 'absent_box' for a box not listed", async () => {
      const listing = boxListingOf(world.mw)
      await TH.expectRefusal(listing.get(scope(), { maxMillisSinceRefresh: 0 }), 'absent_box')
      expect(listing.at(scope())).to.be.null
    })

    it("resolves null under 'nil' for a box not listed", async () => {
      const listing = boxListingOf(world.mw)
      expect(await listing.get(scope(), { maxMillisSinceRefresh: 0, ifAbsent: 'nil' })).to.be.null
      expect(listing.at(scope())).to.be.null
    })

    it("refuses 'absent_box' for a listed tombstone, which stays listed", async () => {
      const listing = boxListingOf(world.mw)
      const box = listing.deliverRecord(gone())
      world.mw.clearCalls()
      await TH.expectRefusal(listing.get(scope(), { maxMillisSinceRefresh: 0 }), 'absent_box')
      expect(listing.at(scope())).to.eq(box)
      expect(box.isPresent).to.be.false
    })

    it("resolves null under 'nil' for a listed tombstone, which stays listed", async () => {
      const listing = boxListingOf(world.mw)
      const box = listing.deliverRecord(gone())
      expect(await listing.get(scope(), { maxMillisSinceRefresh: 0, ifAbsent: 'nil' })).to.be.null
      expect(listing.at(scope())).to.eq(box)
      expect(box.am).to.eq('x')
      expect(box._cheat_central).to.deep.equal(gone())
    })

    it("takes the world of the answer before it refuses", async () => {
      world.mw.willGet(world.mw.answerOf(scope(), null, 'a world'))
      await TH.expectRefusal(boxListingOf(world.mw).get(scope(), { maxMillisSinceRefresh: 0 }), 'absent_box')
      expect(world.mw.callsOf('receiveParent')).to.deep.equal([{ verb: 'receiveParent', parent: 'a world' }])
    })
  })

  describe("listing.get(scope) of a stored tombstone", () => {
    for (const [form, tombstone, am] of [['deleted', gone, 'x']] as const) {
      function seedTombstone() { world.mw.seedPut(tombstone()) }

      it(`refuses 'absent_box' for a ${form} box, and lists its tombstone`, async () => {
        seedTombstone()
        const listing = boxListingOf(world.mw)
        await TH.expectRefusal(listing.get(scope(), { maxMillisSinceRefresh: 0 }), 'absent_box')
        const box = listing.at(scope())
        expect(box).to.be.instanceOf(Box)
        expect(box?.am).to.eq(am)
        expect(box?.isPresent).to.be.false
        expect(listing.snapshot).to.deep.equal([])
      })

      it(`resolves null under 'nil' for a ${form} box, and still lists its tombstone`, async () => {
        seedTombstone()
        const listing = boxListingOf(world.mw)
        expect(await listing.get(scope(), { maxMillisSinceRefresh: 0, ifAbsent: 'nil' })).to.be.null
        expect(listing.at(scope())?.am).to.eq(am)
      })

      it(`takes a ${form} box that was listed alive out of the snapshot, then refuses 'absent_box'`, async () => {
        const listing = boxListingOf(world.mw)
        const box = listing.deliverRecord(fullBoxRecord())
        seedTombstone()
        await TH.expectRefusal(listing.get(scope(), { maxMillisSinceRefresh: 0 }), 'absent_box')
        expect(listing.at(scope())).to.eq(box)
        expect(box.am).to.eq(am)
        expect(listing.snapshot).to.deep.equal([])
      })
    }

    it("resolves the box for a stored box, whichever the ifAbsent", async () => {
      world.mw.seedPut(fullBoxRecord())
      const listing = boxListingOf(world.mw)
      const box = await listing.get(scope(), { maxMillisSinceRefresh: 0 })
      expect(box?.isFull).to.be.true
      expect(await listing.get(scope(), { maxMillisSinceRefresh: 0, ifAbsent: 'nil' })).to.eq(box)
    })

    it("resolves the box for a stored sparse record", async () => {
      world.mw.willGet(world.mw.answerOf(scope(), sparseBoxRecord()))
      const fetched = await boxListingOf(world.mw).get(scope(), { maxMillisSinceRefresh: 0 })
      expect(fetched?.isFull).to.be.false
    })

    it("does not apply ifAbsent to a del, which returns the deleted box", async () => {
      const listing = boxListingOf(world.mw)
      const box = listing.deliverRecord(fullBoxRecord())
      world.mw.seedPut(fullBoxRecord())
      expect(await listing.del(box.sparse)).to.eq(box)
    })
  })

  describe("box.get(opts) and box.hydrate(opts) of an absent box", () => {
    it("refuses 'absent_box' from box.fetch by default, and resolves the box under 'nil'", async () => {
      const box = boxListingOf(world.mw).deliverRecord(gone())
      await TH.expectRefusal(box.get({ maxMillisSinceRefresh: 0 }), 'absent_box')
      expect(await box.get({ maxMillisSinceRefresh: 0, ifAbsent: 'nil' })).to.eq(box)
    })

    it("hydrates an absent box without refusing", async () => {
      const box = boxListingOf(world.mw).deliverRecord(gone())
      world.mw.clearCalls()
      expect(await box.hydrate({ maxMillisSinceRefresh: 0 })).to.eq(box)
      expect(world.mw.callsOf('get')).to.have.lengthOf(1)
      expect(world.mw.badnews).to.deep.equal([])
    })

    it("tryHydrate resolves a good outcome for a box that storage has lost", async () => {
      const listing = boxListingOf(world.mw)
      const box = listing.deliverRecord(fullBoxRecord())
      world.mw.seedPut(gone())
      const outcome = await box.tryHydrate({ maxMillisSinceRefresh: 0 })
      expect(outcome.ok).to.be.true
      expect(box.isPresent).to.be.false
    })

  })

  describe("listing.deliverRecord(tombstone)", () => {
    it("lists a tombstone as not present, with no sidecar, and absent from the snapshot", () => {
      const listing = boxListingOf(world.mw)
      const box = listing.deliverRecord(gone())
      expect(listing.at(scope())).to.eq(box)
      expect(box.isPresent).to.be.false
      expect(box.am).to.eq('x')
      expect(box.sidecar).to.be.null
      expect(listing.snapshot).to.deep.equal([])
    })

  })

  describe("a refused answer carrying what storage has stored", () => {
    it("delivers a full box_stored to the box, then throws 'stale_write'", async () => {
      const { listing, box } = listedBox()
      const record = fullBoxRecord({ ...stored, sidecar: { note: 'theirs' } })
      const stale = world.mw.staleWriteOf(box.scope, record)
      world.mw.willPut(stale)
      await TH.expectRefusal(listing.put(listing.recordOf(box), { expected: box.sparse }), 'stale_write')
      expect(box.revision_seq).to.eq(5)
      expect(box.isFull).to.be.true
      expect(box.sidecar).to.deep.equal({ note: 'theirs' })
    })

    it("delivers a sparse box_stored to the box, leaving it no sidecar, then throws 'stale_write'", async () => {
      const { listing, box } = listedBox()
      const stale = world.mw.staleWriteOf(box.scope, sparseBoxRecord(stored))
      world.mw.willPut(stale)
      await TH.expectRefusal(listing.put(listing.recordOf(box), { expected: box.sparse }), 'stale_write')
      expect(box.revision_seq).to.eq(5)
      expect(box.isFull).to.be.false
      expect(box.sidecar).to.be.null
    })

    it("delivers a box_stored that is a tombstone, then throws 'stale_write' rather than 'absent_box'", async () => {
      const { listing, box } = listedBox()
      const stale = world.mw.staleWriteOf(box.scope, tombstoneBoxRecord(stored))
      world.mw.willPut(stale)
      await TH.expectRefusal(listing.put(listing.recordOf(box), { expected: box.sparse }), 'stale_write')
      expect(box.isPresent).to.be.false
    })

    it("delivers a box_stored the box was deleted under, then throws 'stale_write', for a del too", async () => {
      const { listing, box } = listedBox()
      const stale = world.mw.staleWriteOf(box.scope, fullBoxRecord(stored))
      world.mw.willDel(stale)
      await TH.expectRefusal(listing.del(box.sparse), 'stale_write')
      expect(box.revision_seq).to.eq(5)
    })

    it("throws 'stale_write' with nothing delivered for a refusal without meta", async () => {
      const { listing, box } = listedBox()
      const stale = world.mw.staleWriteOf(box.scope, undefined)
      world.mw.willPut(stale)
      await TH.expectRefusal(listing.put(listing.recordOf(box), { expected: box.sparse }), 'stale_write')
      expect(box._cheat_central.revision_seq).to.eq(1)
    })

    it("throws 'stale_write' with nothing delivered for a box_stored of null", async () => {
      const { listing, box } = listedBox()
      const stale = world.mw.staleWriteOf(box.scope, null)
      world.mw.willPut(stale)
      await TH.expectRefusal(listing.put(listing.recordOf(box), { expected: box.sparse }), 'stale_write')
    })

    it("throws 'stale_write' with nothing delivered for a box_stored that fails its check", async () => {
      const { listing, box } = listedBox()
      const stale = world.mw.staleWriteOf(box.scope, { junk: 1 } as never)
      world.mw.willPut(stale)
      await TH.expectRefusal(listing.put(listing.recordOf(box), { expected: box.sparse }), 'stale_write')
      expect(box._cheat_central.revision_seq).to.eq(1)
    })

    it("builds a box not yet listed from box_stored", async () => {
      const listing = boxListingOf(world.mw)
      const stale = world.mw.staleWriteOf(scope(), fullBoxRecord(stored))
      world.mw.willPut(stale)
      await TH.expectRefusal(listing.put(fullBoxRecord({ revision_seq: 0 }), { expected: shellBoxRecord() }), 'stale_write')
      expect(listing.at(scope())?.revision_seq).to.eq(5)
    })

    it("delivers the record of a fetch's stale_write refusal too", async () => {
      const listing = boxListingOf(world.mw)
      const stale = world.mw.staleWriteOf(scope(), fullBoxRecord(stored))
      world.mw.willGet(stale)
      await TH.expectRefusal(listing.get(scope(), { maxMillisSinceRefresh: 0 }), 'stale_write')
      expect(listing.at(scope())?.revision_seq).to.eq(5)
    })
  })
})

describe("BoxListing: its snapshot is the boxlabels of its present boxes", () => {
  it("lists a box delivered full or sparse, and one created from a dna", async () => {
    const listing = boxListingOf(world.mw)
    listing.deliverRecord(fullBoxRecord({ boxlabel: 'robert', sidecar: { uncle: 'Bob' } }))
    listing.deliverRecord(sparseBoxRecord({ boxlabel: 'roberta' }))
    await listing.create(boxDnaOf(scope()))
    expect(listing.snapshot).to.deep.equal(['robert', 'roberta', 'anthropic_api_key'])
    expect(listing.getSnapshot()).to.eq(listing.snapshot)
    expect(Object.isFrozen(listing.snapshot)).to.be.true
  })

  it("stays the same array, telling no listener, through a box's own put", async () => {
    const listing = boxListingOf(world.mw)
    const record = fullBoxRecord({ sidecar: { uncle: 'Bob' } })
    world.mw.seedPut(record)
    const box = listing.deliverRecord(record)
    const before = listing.snapshot
    const told = vi.fn()
    listing.subscribe(told)
    await box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { uncle: 'Robert' } })
    expect(box.snapshot.sidecar).to.deep.equal({ uncle: 'Robert' })
    expect(listing.snapshot).to.eq(before)
    expect(told).not.toHaveBeenCalled()
  })

  it("stays the same array, telling no listener, through a lock and an unlock", () => {
    const { listing, box } = listedBox()
    const before = listing.snapshot
    const told = vi.fn()
    listing.subscribe(told)
    world.mw.setLocked(true)
    expect(box.snapshot.isLocked).to.be.true
    world.mw.setLocked(false)
    expect(listing.snapshot).to.eq(before)
    expect(told).not.toHaveBeenCalled()
  })
})
