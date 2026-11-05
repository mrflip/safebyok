/** A Listing's lifecycle and what it shows: its world, hello and goodbye, the watch, the snapshot, and bad news told. */

import { describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import * as TH from '../test-helpers'
import { boxDnaOf, boxListingOf, fullBoxRecord, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'

const held = useModelsWorld()

// == [Helpers of the pipeline tests]: scopeOf, dnaOf, seededListing

const scopeOf = (boxlabel = 'anthropic_api_key') => held.mw.boxscope(boxlabel)
const dnaOf = (boxlabel = 'anthropic_api_key') => boxDnaOf(scopeOf(boxlabel))

/** A listing holding a full box and a deleted one, each of a record storage holds too, with no call made yet. */
const seededListing = async () => {
  const listing = boxListingOf(held.mw)
  const full = fullBoxRecord({ boxlabel: 'full_box' })
  const gone = tombstoneBoxRecord({ boxlabel: 'gone_box', revision_seq: 2 })
  held.mw.seedStore(full)
  held.mw.seedStore(gone)
  await listing.build(full)
  await listing.build(gone)
  held.mw.setNow(T0 + 660_000)
  held.mw.clearCalls()
  return listing
}
// --

describe("listing.ensureTimelyWorld(maxMillis)", () => {
  it("refuses 'bad_option' a span out of range, asking the world nothing", async () => {
    const listing = boxListingOf(held.mw)
    await TH.expectRefusal(listing.ensureTimelyWorld(-1), 'bad_option')
    expect(held.mw.callsOf('ensureTimely')).to.deep.equal([])
  })
})

describe("Listing's pipeline: what every answer takes", () => {
  describe("listing.hello()", () => {
    it("holds nothing of an empty listing, and still starts the watch", async () => {
      const listing = boxListingOf(held.mw)
      await listing.hello()
      expect(listing.things).to.deep.equal([])
      expect(held.mw.callsOf('watch')).to.have.lengthOf(1)
    })

    it("fetches nothing: the instances held stay as they are", async () => {
      const listing = await seededListing()
      held.mw.clearCalls()
      await listing.hello()
      expect(held.mw.callsOf('get')).to.deep.equal([])
    })

    it("rejects, throwing nothing at its caller, where the store's watch refuses", async () => {
      const listing = boxListingOf(held.mw)
      vi.spyOn(held.mw.vaultDB, 'watch').mockImplementation(() => { throw new VaultError('storage_unavailable', "The store could not be reached.") })
      await expect(listing.hello()).rejects.toThrow(/could not be reached/)
    })

    it("starts one watch however often it is called", async () => {
      const listing = boxListingOf(held.mw)
      await listing.hello()
      await listing.hello()
      expect(held.mw.callsOf('watch')).to.have.lengthOf(1)
    })
  })

  describe("listing.goodbye()", () => {
    it("ends the watch once, and leaves the instances as they are", async () => {
      const listing = boxListingOf(held.mw)
      await listing.hello()
      const box = await listing.build(fullBoxRecord())
      listing.goodbye()
      listing.goodbye()
      expect(held.mw.callsOf('unwatch')).to.have.lengthOf(1)
      expect(held.mw.watches[0]?.active).to.be.false
      expect(listing.at(box.scope)).to.eq(box)
    })

    it("does nothing before hello", () => {
      boxListingOf(held.mw).goodbye()
      expect(held.mw.calls).to.deep.equal([])
    })
  })

  describe("the watch's notices", () => {
    it("delivers a notice as a good answer: a box not held is built and held", async () => {
      const listing = boxListingOf(held.mw)
      await listing.hello()
      held.mw.clearCalls()
      await held.mw.notify(fullBoxRecord(), 'a world')
      const box = listing.at(scopeOf())
      expect(box?.isFull).to.be.true
      expect(listing.snapshot).to.have.lengthOf(1)
      expect(held.mw.callsOf('takeWorld')).to.deep.equal([{ verb: 'takeWorld', world: 'a world' }])
      expect(held.mw.callsOf('get')).to.deep.equal([])
    })

    it("hands a notice to the box held, which receives it", async () => {
      const listing = boxListingOf(held.mw)
      await listing.hello()
      const box = await listing.build(fullBoxRecord())
      await held.mw.notify(fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2, sidecar: { note: 'pushed' } }))
      expect(listing.at(scopeOf())).to.eq(box)
      expect(box.revision_seq).to.eq(2)
      expect(box.sidecar).to.deep.equal({ note: 'pushed' })
    })

    it("delivers a notice of a deletion, which no fetch's ifAbsent judges: the box is held gone", async () => {
      const listing = boxListingOf(held.mw)
      await listing.hello()
      const box = await listing.build(fullBoxRecord())
      await held.mw.notify(tombstoneBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 }))
      expect(box.isPresent).to.be.false
      expect(listing.snapshot).to.deep.equal([])
      expect(held.mw.badnews).to.deep.equal([])
    })

    it("tells a refusal met on the way to its world, rather than throwing it", async () => {
      const listing = boxListingOf(held.mw)
      await listing.hello()
      await listing.build(fullBoxRecord())
      await held.mw.notify(fullBoxRecord({ revision_tok: 'rev-other' }))
      expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['record_conflict'])
    })
  })

  describe("listing.snapshot, getSnapshot and subscribe", () => {
    it("is empty, frozen and the same array before anything is held", () => {
      const listing = boxListingOf(held.mw)
      expect(listing.snapshot).to.deep.equal([])
      expect(Object.isFrozen(listing.snapshot)).to.be.true
      expect(listing.getSnapshot()).to.eq(listing.snapshot)
    })

    it("holds present things only, each as the thing's own snapshot", async () => {
      const listing = boxListingOf(held.mw)
      const full  = await listing.build(fullBoxRecord({ boxlabel: 'full_box' }))
      const draft = await listing.create(dnaOf('draft_box'))
      await listing.build(tombstoneBoxRecord({ boxlabel: 'gone_box', revision_seq: 2 }))
      expect(listing.things).to.have.lengthOf(3)
      expect(listing.snapshot).to.have.lengthOf(2)
      expect(listing.snapshot[0]).to.eq(full.getSnapshot())
      expect(listing.snapshot[1]).to.eq(draft.getSnapshot())
      expect(Object.isFrozen(listing.snapshot)).to.be.true
    })

    it("is the same array until one thing's snapshot changes, and tells its listeners once per change", async () => {
      const listing = boxListingOf(held.mw)
      let told = 0
      listing.subscribe(() => { told += 1 })
      await listing.build(fullBoxRecord())
      expect(told).to.eq(1)
      const before = listing.snapshot

      held.mw.seedStore(fullBoxRecord())
      await listing.fetch(scopeOf())
      expect(listing.snapshot).to.eq(before)
      expect(told).to.eq(1)

      held.mw.seedStore(fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 }))
      await listing.fetch(scopeOf())
      expect(listing.snapshot).to.not.eq(before)
      expect(listing.snapshot[0]).to.include({ revision_seq: 2 })
      expect(told).to.eq(2)
    })

    it("follows a thing's change that no delivery brought: a put, once", async () => {
      const listing = boxListingOf(held.mw)
      held.mw.seedStore(fullBoxRecord())
      const box = await listing.build(fullBoxRecord())
      let told = 0
      listing.subscribe(() => { told += 1 })
      await box.put({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'edited' } })
      expect(told).to.eq(1)
      expect(listing.snapshot[0]).to.eq(box.getSnapshot())
      expect(listing.snapshot[0]?.sidecar).to.deep.equal({ note: 'edited' })
    })

    it("takes a box in when it comes back to life, and lets it go when it is deleted", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(tombstoneBoxRecord({ revision_seq: 2 }))
      expect(listing.snapshot).to.deep.equal([])
      held.mw.seedStore(fullBoxRecord({ revision_tok: 'rev-a3', revision_seq: 3 }))
      await listing.fetch(scopeOf())
      expect(listing.snapshot).to.deep.equal([box.getSnapshot()])
      await listing.del(box)
      expect(listing.snapshot).to.deep.equal([])
    })

    it("lets a listener go, and tells none after", async () => {
      const listing = boxListingOf(held.mw)
      let told = 0
      const unsubscribe = listing.subscribe(() => { told += 1 })
      await listing.create(dnaOf('one'))
      unsubscribe()
      await listing.create(dnaOf('two'))
      expect(told).to.eq(1)
    })
  })
})
