/** A Listing's lifecycle and what it shows: its world, hello and goodbye, the watch, the snapshot, and bad news told. */

import { describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import * as TH from '../test-helpers'
import { boxDnaOf, boxListingOf, fullBoxRecord, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'

const world = useModelsWorld()

// == [Helpers of the pipeline tests]: scopeOf, dnaOf, seededListing

function scopeOf(boxlabel = 'anthropic_api_key') { return world.mw.boxscope(boxlabel) }
function dnaOf(boxlabel = 'anthropic_api_key') { return boxDnaOf(scopeOf(boxlabel)) }

/** A listing with a full box and a deleted one, each of a record storage has stored too, with no call made yet. */
function seededListing() {
  const listing = boxListingOf(world.mw)
  const full = fullBoxRecord({ boxlabel: 'full_box' })
  const gone = tombstoneBoxRecord({ boxlabel: 'gone_box', revision_seq: 2 })
  world.mw.seedPut(full)
  world.mw.seedPut(gone)
  listing.deliverRecord(full)
  listing.deliverRecord(gone)
  world.mw.setNow(T0 + 660_000)
  world.mw.clearCalls()
  return listing
}
// --

describe("listing.ensureTimelyWorld(maxMillis)", () => {
  it("refuses a span out of range, asking the world nothing", async () => {
    const listing = boxListingOf(world.mw)
    await TH.expectRefusal(listing.ensureTimelyWorld(-1))
    expect(world.mw.callsOf('ensureTimely')).to.deep.equal([])
  })
})

describe("Listing's pipeline: what every answer goes through", () => {
  describe("listing.hello()", () => {
    it("starts the watch even for an empty listing", async () => {
      const listing = boxListingOf(world.mw)
      await listing.hello()
      expect(listing.things).to.deep.equal([])
      expect(world.mw.callsOf('watch')).to.have.lengthOf(1)
    })

    it("fetches nothing for instances already listed", async () => {
      const listing = seededListing()
      world.mw.clearCalls()
      await listing.hello()
      expect(world.mw.callsOf('get')).to.deep.equal([])
    })

    it("rejects, rather than throws, when the BankDB's watch throws", async () => {
      const listing = boxListingOf(world.mw)
      vi.spyOn(world.mw.bankDB, 'watch').mockImplementation(() => { throw new VaultError('storage_unavailable', "The storage could not be reached.") })
      await expect(listing.hello()).rejects.toThrow(/could not be reached/)
    })

    it("reports the end of the BankDB's watch as bad news", async () => {
      const listing = boxListingOf(world.mw)
      const ended = new VaultError('storage_unavailable', "The stream ended.")
      await listing.hello()
      world.mw.watches[0]?.onBadNews?.(ended)
      expect(world.mw.badnews).to.deep.equal([ended])
    })

    it("panics on a bankDB's 'identity_revoked', reporting no bad news", async () => {
      const listing = boxListingOf(world.mw)
      const revoked = new VaultError('identity_revoked', "Signed out.")
      vi.spyOn(world.mw.bankDB, 'tryListBoxes').mockResolvedValueOnce({ ok: false, err: revoked, parent: null } as never)
      await expect(listing.list()).rejects.toBe(revoked)
      expect(world.mw.panics).to.deep.equal([revoked])
      expect(world.mw.badnews).to.deep.equal([])
    })

    it("starts one watch however often it is called", async () => {
      const listing = boxListingOf(world.mw)
      await listing.hello()
      await listing.hello()
      expect(world.mw.callsOf('watch')).to.have.lengthOf(1)
    })
  })

  describe("listing.goodbye()", () => {
    it("ends the watch once, and leaves the instances as they are", async () => {
      const listing = boxListingOf(world.mw)
      await listing.hello()
      const box = listing.deliverRecord(fullBoxRecord())
      listing.goodbye()
      listing.goodbye()
      expect(world.mw.callsOf('unwatch')).to.have.lengthOf(1)
      expect(world.mw.watches[0]?.active).to.be.false
      expect(listing.at(box.scope)).to.eq(box)
    })

    it("does nothing before hello", () => {
      boxListingOf(world.mw).goodbye()
      expect(world.mw.calls).to.deep.equal([])
    })
  })

  describe("the watch's notices", () => {
    it("builds and lists a box from a notice of one not yet listed", async () => {
      const listing = boxListingOf(world.mw)
      await listing.hello()
      world.mw.clearCalls()
      await world.mw.notify(fullBoxRecord(), 'a world')
      const box = listing.at(scopeOf())
      expect(box?.isFull).to.be.true
      expect(listing.snapshot).to.have.lengthOf(1)
      expect(world.mw.callsOf('receiveParent')).to.deep.equal([{ verb: 'receiveParent', parent: 'a world' }])
      expect(world.mw.callsOf('get')).to.deep.equal([])
    })

    it("hands a notice to the listed box", async () => {
      const listing = boxListingOf(world.mw)
      await listing.hello()
      const box = listing.deliverRecord(fullBoxRecord())
      await world.mw.notify(fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2, sidecar: { note: 'pushed' } }))
      expect(listing.at(scopeOf())).to.eq(box)
      expect(box.revision_seq).to.eq(2)
      expect(box.sidecar).to.deep.equal({ note: 'pushed' })
    })

    it("delivers a notice of a deletion, and the listed box is no longer present", async () => {
      const listing = boxListingOf(world.mw)
      await listing.hello()
      const box = listing.deliverRecord(fullBoxRecord())
      await world.mw.notify(tombstoneBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 }))
      expect(box.isPresent).to.be.false
      expect(listing.snapshot).to.deep.equal([])
      expect(world.mw.badnews).to.deep.equal([])
    })

    it("reports a refusal from a notice as bad news instead of throwing it", async () => {
      const listing = boxListingOf(world.mw)
      await listing.hello()
      listing.deliverRecord(fullBoxRecord())
      await world.mw.notify(fullBoxRecord({ revision_tok: 'rev-other' }))
      expect(world.mw.badnews).to.have.length(1)
    })
  })

  describe("listing.snapshot, getSnapshot and subscribe", () => {
    it("is the same empty frozen array before anything is listed", () => {
      const listing = boxListingOf(world.mw)
      expect(listing.snapshot).to.deep.equal([])
      expect(Object.isFrozen(listing.snapshot)).to.be.true
      expect(listing.getSnapshot()).to.eq(listing.snapshot)
    })

    it("has the boxlabel of each present thing only", async () => {
      const listing = boxListingOf(world.mw)
      listing.deliverRecord(fullBoxRecord({ boxlabel: 'full_box' }))
      await listing.create(dnaOf('draft_box'))
      listing.deliverRecord(tombstoneBoxRecord({ boxlabel: 'gone_box', revision_seq: 2 }))
      expect(listing.things).to.have.lengthOf(3)
      expect(listing.snapshot).to.deep.equal(['full_box', 'draft_box'])
      expect(Object.isFrozen(listing.snapshot)).to.be.true
    })

    it("is the same array through a thing's own change, telling no listener", async () => {
      const listing = boxListingOf(world.mw)
      let told = 0
      listing.subscribe(() => { told += 1 })
      listing.deliverRecord(fullBoxRecord())
      expect(told).to.eq(1)
      const before = listing.snapshot

      world.mw.seedPut(fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 }))
      const box = await listing.get(scopeOf(), { maxMillisSinceRefresh: 0 })
      expect(box?.getSnapshot()).to.include({ revision_seq: 2 })
      expect(listing.snapshot).to.eq(before)
      expect(told).to.eq(1)
    })

    it("includes a box once it is reborn, and drops it once it is deleted", async () => {
      const listing = boxListingOf(world.mw)
      const box = listing.deliverRecord(tombstoneBoxRecord({ revision_seq: 2 }))
      expect(listing.snapshot).to.deep.equal([])
      world.mw.seedPut(fullBoxRecord({ revision_tok: 'rev-a3', revision_seq: 3 }))
      await listing.get(scopeOf(), { maxMillisSinceRefresh: 0 })
      expect(listing.snapshot).to.deep.equal([box.scope.boxlabel])
      await listing.del(box.sparse)
      expect(listing.snapshot).to.deep.equal([])
    })

    it("stops telling a listener once it unsubscribes", async () => {
      const listing = boxListingOf(world.mw)
      let told = 0
      const unsubscribe = listing.subscribe(() => { told += 1 })
      await listing.create(dnaOf('one'))
      unsubscribe()
      await listing.create(dnaOf('two'))
      expect(told).to.eq(1)
    })
  })
})
