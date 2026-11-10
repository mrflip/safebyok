/** What a BoxListing makes of the rows storage answers, an absent box above all, and the snapshot its boxes show. */

import { describe, expect, it } from 'vitest'
import { Box } from '../../src/models/box'
import * as SX from '../../src/shapes/shapes-storage'
import * as TH from '../test-helpers'
import { boxDnaOf, boxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld } from '../test-helpers/models-world'

const world = useModelsWorld()

const scope   = () => world.mw.boxscope('anthropic_api_key')

const gone    = () => tombstoneBoxRecord({ revision_seq: 2 })

/** The revision a stale_write says storage has stored. */
const stored = { revision_tok: 'rev-s5', revision_seq: 5 }

/** A full box world, and the calls forgotten. */
const listedBox = async () => {
  const listing = boxListingOf(world.mw)
  const box = await listing.build(fullBoxRecord())
  world.mw.clearCalls()
  return { listing, box }
}

describe("BoxListing: an absent box", () => {
  describe("listing.fetch(scope) of nothing stored", () => {
    it("refuses 'absent_box' for a box not world, having none", async () => {
      const listing = boxListingOf(world.mw)
      await TH.expectRefusal(listing.fetch(scope()), 'absent_box')
      expect(listing.at(scope())).to.be.null
    })

    it("resolves null for a box not world under 'nil'", async () => {
      const listing = boxListingOf(world.mw)
      expect(await listing.fetch(scope(), { ifAbsent: 'nil' })).to.be.null
      expect(listing.at(scope())).to.be.null
    })

    it("refuses 'absent_box' for a box world gone, which stays world", async () => {
      const listing = boxListingOf(world.mw)
      const box = await listing.build(gone())
      world.mw.clearCalls()
      await TH.expectRefusal(listing.fetch(scope()), 'absent_box')
      expect(listing.at(scope())).to.eq(box)
      expect(box.isPresent).to.be.false
    })

    it("resolves null for a box world gone under 'nil', the box still at `at(scope)` as its tombstone", async () => {
      const listing = boxListingOf(world.mw)
      const box = await listing.build(gone())
      expect(await listing.fetch(scope(), { ifAbsent: 'nil' })).to.be.null
      expect(listing.at(scope())).to.eq(box)
      expect(box.am).to.eq('x')
      expect(box._cheat_central).to.deep.equal(gone())
    })

    it("takes the world of the answer before it refuses", async () => {
      world.mw.willGet(world.mw.answerOf(scope(), null, 'a world'))
      await TH.expectRefusal(boxListingOf(world.mw).fetch(scope()), 'absent_box')
      expect(world.mw.callsOf('receiveWorld')).to.deep.equal([{ verb: 'receiveWorld', world: 'a world' }])
    })
  })

  describe("listing.fetch(scope) of a stored tombstone", () => {
    for (const [form, tombstone, am] of [['deleted', gone, 'x']] as const) {
      const seedTombstone = () => { world.mw.seedPut(tombstone()) }

      it(`refuses 'absent_box' for a ${form} box, built and world as its tombstone`, async () => {
        seedTombstone()
        const listing = boxListingOf(world.mw)
        await TH.expectRefusal(listing.fetch(scope()), 'absent_box')
        const box = listing.at(scope())
        expect(box).to.be.instanceOf(Box)
        expect(box?.am).to.eq(am)
        expect(box?.isPresent).to.be.false
        expect(listing.snapshot).to.deep.equal([])
      })

      it(`resolves null for a ${form} box under 'nil', world all the same`, async () => {
        seedTombstone()
        const listing = boxListingOf(world.mw)
        expect(await listing.fetch(scope(), { ifAbsent: 'nil' })).to.be.null
        expect(listing.at(scope())?.am).to.eq(am)
      })

      it(`takes a ${form} box world alive away, then refuses 'absent_box'`, async () => {
        const listing = boxListingOf(world.mw)
        const box = await listing.build(fullBoxRecord())
        seedTombstone()
        await TH.expectRefusal(listing.fetch(scope()), 'absent_box')
        expect(listing.at(scope())).to.eq(box)
        expect(box.am).to.eq(am)
        expect(listing.snapshot).to.deep.equal([])
      })
    }

    it("resolves the box for a stored box, whichever the ifAbsent", async () => {
      world.mw.seedPut(fullBoxRecord())
      const listing = boxListingOf(world.mw)
      const box = await listing.fetch(scope())
      expect(box?.isFull).to.be.true
      expect(await listing.fetch(scope(), { ifAbsent: 'nil' })).to.eq(box)
    })

    it("resolves the box for a stored sparse record", async () => {
      world.mw.willGet(world.mw.answerOf(scope(), sparseBoxRecord()))
      const fetched = await boxListingOf(world.mw).fetch(scope())
      expect(fetched?.isFull).to.be.false
    })

    it("does not judge a put's or a del's answer: a deleted box comes back world", async () => {
      const listing = boxListingOf(world.mw)
      const box = await listing.build(fullBoxRecord())
      world.mw.seedPut(fullBoxRecord())
      expect(await listing.del(box.sparse)).to.eq(box)
    })
  })

  describe("box.fetch(opts) and box.hydrate(opts) of an absent box", () => {
    it("refuses 'absent_box' from box.fetch by default, and resolves the box under 'nil'", async () => {
      const box = await boxListingOf(world.mw).build(gone())
      await TH.expectRefusal(box.fetch(), 'absent_box')
      expect(await box.fetch({ ifAbsent: 'nil' })).to.eq(box)
    })

    it("hydrates an absent box without refusing: the refresh passes 'nil'", async () => {
      const box = await boxListingOf(world.mw).build(gone())
      world.mw.clearCalls()
      expect(await box.hydrate({ maxMillisSinceRefresh: 0 })).to.eq(box)
      expect(world.mw.callsOf('get')).to.have.lengthOf(1)
      expect(world.mw.badnews).to.deep.equal([])
    })

    it("tryHydrate resolves a good outcome for a box that storage has lost", async () => {
      const listing = boxListingOf(world.mw)
      const box = await listing.build(fullBoxRecord())
      world.mw.seedPut(gone())
      const outcome = await box.tryHydrate({ maxMillisSinceRefresh: 0 })
      expect(outcome.ok).to.be.true
      expect(box.isPresent).to.be.false
    })

  })

  describe("listing.build(tombstone)", () => {
    it("has a gone instance: not present, no sidecar, absent from the snapshot", async () => {
      const listing = boxListingOf(world.mw)
      const box = await listing.build(gone())
      expect(listing.at(scope())).to.eq(box)
      expect(box.isPresent).to.be.false
      expect(box.am).to.eq('x')
      expect(box.sidecar).to.be.null
      expect(listing.snapshot).to.deep.equal([])
    })

  })

  describe("a refused answer carrying what storage has stored", () => {
    it("delivers a full box_stored to the box, then throws 'stale_write'", async () => {
      const { listing, box } = await listedBox()
      const record = fullBoxRecord({ ...stored, sidecar: { note: 'theirs' } })
      const stale = world.mw.staleWriteOf(box.scope, record)
      world.mw.willPut(stale)
      await TH.expectRefusal(listing.put(listing.recordOf(box), { prior: box }), 'stale_write')
      expect(box.revision_seq).to.eq(5)
      expect(box.isFull).to.be.true
      expect(box.sidecar).to.deep.equal({ note: 'theirs' })
    })

    it("delivers a sparse box_stored to the box, which has no sidecar to speak of, then throws 'stale_write'", async () => {
      const { listing, box } = await listedBox()
      const stale = world.mw.staleWriteOf(box.scope, sparseBoxRecord(stored))
      world.mw.willPut(stale)
      await TH.expectRefusal(listing.put(listing.recordOf(box), { prior: box }), 'stale_write')
      expect(box.revision_seq).to.eq(5)
      expect(box.isFull).to.be.false
      expect(box.sidecar).to.be.null
    })

    it("delivers a box_stored that is a tombstone, then throws 'stale_write' rather than 'absent_box'", async () => {
      const { listing, box } = await listedBox()
      const stale = world.mw.staleWriteOf(box.scope, tombstoneBoxRecord(stored))
      world.mw.willPut(stale)
      await TH.expectRefusal(listing.put(listing.recordOf(box), { prior: box }), 'stale_write')
      expect(box.isPresent).to.be.false
    })

    it("delivers a box_stored the box was deleted under, then throws 'stale_write', for a del too", async () => {
      const { listing, box } = await listedBox()
      const stale = world.mw.staleWriteOf(box.scope, fullBoxRecord(stored))
      world.mw.willDel(stale)
      await TH.expectRefusal(listing.del(box.sparse), 'stale_write')
      expect(box.revision_seq).to.eq(5)
    })

    it("throws 'stale_write' with nothing delivered for a refusal without meta", async () => {
      const { listing, box } = await listedBox()
      const stale = world.mw.staleWriteOf(box.scope, undefined)
      world.mw.willPut(stale)
      await TH.expectRefusal(listing.put(listing.recordOf(box), { prior: box }), 'stale_write')
      expect(box._cheat_central.revision_seq).to.eq(1)
    })

    it("throws 'stale_write' with nothing delivered for a box_stored of null", async () => {
      const { listing, box } = await listedBox()
      const stale = world.mw.staleWriteOf(box.scope, null)
      world.mw.willPut(stale)
      await TH.expectRefusal(listing.put(listing.recordOf(box), { prior: box }), 'stale_write')
    })

    it("throws 'stale_write' with nothing delivered for a box_stored that fails its check", async () => {
      const { listing, box } = await listedBox()
      const stale = world.mw.staleWriteOf(box.scope, { junk: 1 } as never)
      world.mw.willPut(stale)
      await TH.expectRefusal(listing.put(listing.recordOf(box), { prior: box }), 'stale_write')
      expect(box._cheat_central.revision_seq).to.eq(1)
    })

    it("delivers box_stored to a box not yet world, building it", async () => {
      const listing = boxListingOf(world.mw)
      const stale = world.mw.staleWriteOf(scope(), fullBoxRecord(stored))
      world.mw.willPut(stale)
      await TH.expectRefusal(listing.put(fullBoxRecord({ revision_seq: 0 }), { prior: SX.VoidRevision }), 'stale_write')
      expect(listing.at(scope())?.revision_seq).to.eq(5)
    })

    it("delivers the record of a stale_write to a fetch's refusal-bearing answer too", async () => {
      const listing = boxListingOf(world.mw)
      const stale = world.mw.staleWriteOf(scope(), fullBoxRecord(stored))
      world.mw.willGet(stale)
      await TH.expectRefusal(listing.fetch(scope()), 'stale_write')
      expect(listing.at(scope())?.revision_seq).to.eq(5)
    })
  })
})

describe("BoxListing: its snapshot is what its boxes show", () => {
  it("shows a box's sidecar as `box.sidecar` gives it: Bob's your uncle by any path", async () => {
    const listing = boxListingOf(world.mw)
    const box = await listing.build(fullBoxRecord({ boxlabel: 'robert', sidecar: { uncle: 'Bob' } }))
    const robert = listing.at(world.mw.boxscope('robert'))
    expect(robert?.sidecar).to.deep.equal({ uncle: 'Bob' })
    expect(robert?.snapshot.sidecar).to.deep.equal({ uncle: 'Bob' })
    expect(listing.snapshot[0]?.sidecar).to.deep.equal({ uncle: 'Bob' })
    expect(listing.snapshot[0]).to.eq(box.snapshot)
    expect(listing.getSnapshot()[0]).to.eq(box.getSnapshot())
  })

  it("shows a box created from a dna as the record it put", async () => {
    const listing = boxListingOf(world.mw)
    const box = await listing.create(boxDnaOf(scope()))
    const [shown] = listing.snapshot
    expect(shown).to.eq(box.snapshot)
    expect(shown).to.include({ boxlabel: 'anthropic_api_key', revision_seq: 0, isPresent: true, isFull: true })
  })

  it("shows a box sparse as its snapshot does: present, not full, no sidecar", async () => {
    const listing = boxListingOf(world.mw)
    await listing.build(sparseBoxRecord())
    expect(listing.snapshot[0]).to.include({ isPresent: true, isFull: false, sidecar: null })
  })

  it("follows the box through a put: the listing shows the sidecar `box.sidecar` now gives", async () => {
    const listing = boxListingOf(world.mw)
    const record = fullBoxRecord({ sidecar: { uncle: 'Bob' } })
    world.mw.seedPut(record)
    const box = await listing.build(record)
    await box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { uncle: 'Robert' } })
    expect(box.sidecar).to.deep.equal({ uncle: 'Robert' })
    expect(listing.snapshot[0]?.sidecar).to.deep.equal({ uncle: 'Robert' })
  })

  it("remakes its rows at a lock and an unlock, each the box's own new snapshot", async () => {
    const { listing, box } = await listedBox()
    const before = listing.getSnapshot()
    expect(before[0]?.isLocked).to.be.false
    world.mw.setLocked(true)
    const locked = listing.getSnapshot()
    expect(locked).to.not.eq(before)
    expect(locked[0]).to.eq(box.getSnapshot())
    expect(locked[0]?.isLocked).to.be.true
    world.mw.setLocked(false)
    expect(listing.getSnapshot()).to.not.eq(locked)
    expect(listing.getSnapshot()[0]).to.eq(box.getSnapshot())
    expect(listing.getSnapshot()[0]?.isLocked).to.be.false
  })
})
