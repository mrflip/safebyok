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
async function seededListing() {
  const listing = boxListingOf(world.mw)
  const full = fullBoxRecord({ boxlabel: 'full_box' })
  const gone = tombstoneBoxRecord({ boxlabel: 'gone_box', revision_seq: 2 })
  world.mw.seedPut(full)
  world.mw.seedPut(gone)
  await listing.build(full)
  await listing.build(gone)
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
      const listing = await seededListing()
      world.mw.clearCalls()
      await listing.hello()
      expect(world.mw.callsOf('get')).to.deep.equal([])
    })

    it("rejects, rather than throws, when the VaultDB's watch throws", async () => {
      const listing = boxListingOf(world.mw)
      vi.spyOn(world.mw.vaultDB, 'watch').mockImplementation(() => { throw new VaultError('storage_unavailable', "The storage could not be reached.") })
      await expect(listing.hello()).rejects.toThrow(/could not be reached/)
    })

    it("reports the end of the VaultDB's watch as bad news", async () => {
      const listing = boxListingOf(world.mw)
      const ended = new VaultError('storage_unavailable', "The stream ended.")
      await listing.hello()
      world.mw.watches[0]?.onBadNews?.(ended)
      expect(world.mw.badnews).to.deep.equal([ended])
    })

    it("panics on a vaultDB's 'identity_revoked', reporting no bad news", async () => {
      const listing = boxListingOf(world.mw)
      const revoked = new VaultError('identity_revoked', "Signed out.")
      vi.spyOn(world.mw.vaultDB, 'tryListBoxes').mockResolvedValueOnce({ ok: false, err: revoked, world: null } as never)
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
      const box = await listing.build(fullBoxRecord())
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
      expect(world.mw.callsOf('receiveWorld')).to.deep.equal([{ verb: 'receiveWorld', world: 'a world' }])
      expect(world.mw.callsOf('get')).to.deep.equal([])
    })

    it("hands a notice to the listed box", async () => {
      const listing = boxListingOf(world.mw)
      await listing.hello()
      const box = await listing.build(fullBoxRecord())
      await world.mw.notify(fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2, sidecar: { note: 'pushed' } }))
      expect(listing.at(scopeOf())).to.eq(box)
      expect(box.revision_seq).to.eq(2)
      expect(box.sidecar).to.deep.equal({ note: 'pushed' })
    })

    it("delivers a notice of a deletion, and the listed box is no longer present", async () => {
      const listing = boxListingOf(world.mw)
      await listing.hello()
      const box = await listing.build(fullBoxRecord())
      await world.mw.notify(tombstoneBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 }))
      expect(box.isPresent).to.be.false
      expect(listing.snapshot).to.deep.equal([])
      expect(world.mw.badnews).to.deep.equal([])
    })

    it("reports a refusal from a notice as bad news instead of throwing it", async () => {
      const listing = boxListingOf(world.mw)
      await listing.hello()
      await listing.build(fullBoxRecord())
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

    it("has present things only, each as the thing's own snapshot", async () => {
      const listing = boxListingOf(world.mw)
      const full  = await listing.build(fullBoxRecord({ boxlabel: 'full_box' }))
      const draft = await listing.create(dnaOf('draft_box'))
      await listing.build(tombstoneBoxRecord({ boxlabel: 'gone_box', revision_seq: 2 }))
      expect(listing.things).to.have.lengthOf(3)
      expect(listing.snapshot).to.have.lengthOf(2)
      expect(listing.snapshot[0]).to.eq(full.getSnapshot())
      expect(listing.snapshot[1]).to.eq(draft.getSnapshot())
      expect(Object.isFrozen(listing.snapshot)).to.be.true
    })

    it("is the same array until one thing's snapshot changes, and notifies its listeners once per change", async () => {
      const listing = boxListingOf(world.mw)
      let told = 0
      listing.subscribe(() => { told += 1 })
      await listing.build(fullBoxRecord())
      expect(told).to.eq(1)
      const before = listing.snapshot

      world.mw.seedPut(fullBoxRecord())
      await listing.fetch(scopeOf())
      expect(listing.snapshot).to.eq(before)
      expect(told).to.eq(1)

      world.mw.seedPut(fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 }))
      await listing.fetch(scopeOf())
      expect(listing.snapshot).to.not.eq(before)
      expect(listing.snapshot[0]).to.include({ revision_seq: 2 })
      expect(told).to.eq(2)
    })

    it("follows a change made by a box's own put, notifying once", async () => {
      const listing = boxListingOf(world.mw)
      world.mw.seedPut(fullBoxRecord())
      const box = await listing.build(fullBoxRecord())
      let told = 0
      listing.subscribe(() => { told += 1 })
      await box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'edited' } })
      expect(told).to.eq(1)
      expect(listing.snapshot[0]).to.eq(box.getSnapshot())
      expect(listing.snapshot[0]?.sidecar).to.deep.equal({ note: 'edited' })
    })

    it("includes a box once it is reborn, and drops it once it is deleted", async () => {
      const listing = boxListingOf(world.mw)
      const box = await listing.build(tombstoneBoxRecord({ revision_seq: 2 }))
      expect(listing.snapshot).to.deep.equal([])
      world.mw.seedPut(fullBoxRecord({ revision_tok: 'rev-a3', revision_seq: 3 }))
      await listing.fetch(scopeOf())
      expect(listing.snapshot).to.deep.equal([box.getSnapshot()])
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
