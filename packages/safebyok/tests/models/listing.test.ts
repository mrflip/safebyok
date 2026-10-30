import { describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/errors'
import { Box } from '../../src/models/box'
import { Listing } from '../../src/models/listing'
import * as TH from '../test-helpers'
import { boxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld } from '../test-helpers/models-world'

const held = useModelsWorld()

describe("Listing's pipeline: what every answer takes", () => {
  describe("listing.hello()", () => {
    it("revives an instance from each cached copy, its cacheable round-tripping equal", async () => {
      const copies = await seededCache()
      const listing = boxListingOf(held.mw)
      await listing.hello()
      expect(listing.things).to.have.lengthOf(3)
      for (const copy of copies) {
        const box = listing.at(scopeOf(copy.boxlabel))
        expect(box).to.be.instanceOf(Box)
        expect(box?.cacheable, copy.boxlabel).to.deep.equal(copy)
      }
    })

    it("saves nothing back for a copy revived: every save after is a delivery of hydrate's fetches", async () => {
      await seededCache()
      const listing = boxListingOf(held.mw)
      await listing.hello()
      const verbs = held.mw.calls.map(({ verb }) => verb)
      expect(verbs.slice(0, 2)).to.deep.equal(['load', 'watch'])
      expect(verbs.indexOf('save')).to.be.greaterThan(verbs.indexOf('get'))
      expect(held.mw.callsOf('save')).to.have.lengthOf(held.mw.callsOf('get').length)
    })

    it("starts the watch before it hydrates, with fullFor naming every box, until one is set otherwise", async () => {
      await seededCache()
      const listing = boxListingOf(held.mw)
      await listing.hello()
      const verbs = held.mw.calls.map(({ verb }) => verb)
      expect(verbs.indexOf('watch')).to.be.lessThan(verbs.indexOf('get'))
      expect(held.mw.watchedScopes()).to.have.deep.members(['full_box', 'gone_box', 'draft_box'].map((boxlabel) => scopeOf(boxlabel)))
      const box = listing.at(scopeOf('gone_box'))
      expect(box?.isWatchable).to.be.true
      if (box !== null) { box.isWatchable = false }
      expect(held.mw.watchedScopes()).to.have.deep.members(['full_box', 'draft_box'].map((boxlabel) => scopeOf(boxlabel)))
    })

    it("hydrates all: a fetch for each box, the draft and the gone box too, with no refusal told or thrown", async () => {
      await seededCache()
      const listing = boxListingOf(held.mw)
      await listing.hello()
      expect(held.mw.callsOf('get').map(({ scope }) => scope.boxlabel)).to.have.members(['full_box', 'gone_box', 'draft_box'])
      expect(held.mw.badnews).to.deep.equal([])
      expect(listing.at(scopeOf('draft_box'))?.isPresent).to.be.true
      expect(listing.at(scopeOf('gone_box'))?.isPresent).to.be.false
    })

    it("revives nothing from an empty cache, and still starts the watch", async () => {
      const listing = boxListingOf(held.mw)
      await listing.hello()
      expect(listing.things).to.deep.equal([])
      expect(held.mw.callsOf('watch')).to.have.lengthOf(1)
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

  describe("listing.put(duck)", () => {
    it("puts a box over the revision its instance expects, and its answer spends the staged", async () => {
      const { listing, box } = await edited()
      expect(box.hasStaged).to.be.true
      const { staged } = box.cacheable
      held.mw.clearCalls()
      const answered = await listing.put(box)
      const [call] = held.mw.callsOf('put')
      expect(call?.expected).to.deep.equal({ revision_tok: 'rev-a1', revision_seq: 1 })
      expect(call?.record).to.deep.equal(staged)
      expect(answered).to.eq(box)
      expect(box.hasStaged).to.be.false
      expect(box.cacheable.central).to.deep.equal(staged)
      expect(box.sidecar).to.deep.equal({ note: 'edited' })
    })

    it("puts a record by the same path: the box held under its scope expects the revision, and receives the answer", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      const record = fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2, sidecar: { note: 'new' } })
      held.mw.clearCalls()
      expect(await listing.put(record)).to.eq(box)
      expect(held.mw.callsOf('put')[0]?.expected).to.deep.equal({ revision_tok: 'rev-a1', revision_seq: 1 })
      expect(box.revision_seq).to.eq(2)
      expect(box.sidecar).to.deep.equal({ note: 'new' })
    })

    it("expects no revision of a box not held", async () => {
      const listing = boxListingOf(held.mw)
      expect(listing.expectedRevisionOf(scopeOf())).to.be.null
      const box = await listing.put(fullBoxRecord())
      expect(held.mw.callsOf('put')[0]?.expected).to.be.null
      expect(listing.at(scopeOf())).to.eq(box)
      expect(box?.isFull).to.be.true
    })

    it("expects no revision of a thing never stored, and its answer spends the draft", async () => {
      const listing = boxListingOf(held.mw)
      const draft = await listing.build({ ...scopeOf() })
      expect(listing.expectedRevisionOf(draft.scope)).to.be.null
      held.mw.clearCalls()
      await listing.put(fullBoxRecord({ revision_seq: 0 }))
      expect(held.mw.callsOf('put')[0]?.expected).to.be.null
      expect(draft.hasStaged).to.be.false
      expect(draft.isFull).to.be.true
    })

    it("refuses a box not full as 'bad_record' before storage is called", async () => {
      const listing = boxListingOf(held.mw)
      const draft = await listing.build({ ...scopeOf() })
      held.mw.clearCalls()
      await TH.expectRefusal(listing.put(draft), 'bad_record')
      expect(held.mw.callsOf('put')).to.deep.equal([])
    })

    it("saves the box to the cache once, with its cacheable", async () => {
      const { listing, box } = await edited()
      held.mw.clearCalls()
      await listing.put(box)
      const saves = held.mw.callsOf('save')
      expect(saves).to.have.lengthOf(1)
      expect(saves[0]?.cacheable).to.deep.equal(box.cacheable)
    })

    it("has tryPut resolve the outcome of a refusal, rejecting never", async () => {
      const { listing, box } = await edited()
      held.mw.willPut(held.mw.refusalOf(box.scope, new VaultError('not_permitted', "No.")))
      const outcome = await listing.tryPut(box)
      expect(outcome.ok).to.be.false
      expect(outcome.err?.refusalkind).to.eq('not_permitted')
    })
  })

  describe("listing.del(duck)", () => {
    it("deletes a box at central's revision, and delivers the tombstone to it", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      held.mw.clearCalls()
      expect(await listing.del(box)).to.eq(box)
      expect(held.mw.callsOf('del')[0]?.expected).to.deep.equal({ revision_tok: 'rev-a1', revision_seq: 1 })
      expect(box.isPresent).to.be.false
      expect(box.am).to.eq('x')
      expect(box.revision_seq).to.eq(2)
      expect(listing.at(box.scope)).to.eq(box)
    })

    it("deletes at the revision of a staged tombstone's central, not the staged revision", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      await box.del()
      expect(held.mw.callsOf('del')[0]?.expected).to.deep.equal({ revision_tok: 'rev-a1', revision_seq: 1 })
      expect(box.hasStaged).to.be.false
      expect(box.isPresent).to.be.false
    })

    it("deletes a sparse record's box the same way", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      await listing.del(sparseBoxRecord())
      expect(held.mw.callsOf('del')[0]?.expected).to.deep.equal({ revision_tok: 'rev-a1', revision_seq: 1 })
      expect(box.isPresent).to.be.false
    })

    it("expects no revision for a box not held", async () => {
      const listing = boxListingOf(held.mw)
      await listing.del(sparseBoxRecord())
      expect(held.mw.callsOf('del')[0]?.expected).to.be.null
    })

    it("saves the tombstone to the cache once", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      held.mw.clearCalls()
      await listing.del(box)
      const saves = held.mw.callsOf('save')
      expect(saves).to.have.lengthOf(1)
      expect(saves[0]?.cacheable.central.am).to.eq('x')
    })
  })

  describe("an answer refused or malformed", () => {
    it("throws a refusal as it came, delivering nothing and saving nothing", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      held.mw.clearCalls()
      const err = new VaultError('not_permitted', "Not yours.")
      held.mw.willGet(held.mw.refusalOf(box.scope, err, 'a world'))
      const outcome = await listing.tryFetch(box.scope)
      expect(outcome.err).to.eq(err)
      expect(held.mw.callsOf('takeWorld')).to.deep.equal([{ verb: 'takeWorld', world: 'a world' }])
      expect(held.mw.callsOf('save')).to.deep.equal([])
      expect(box.revision_seq).to.eq(1)
    })

    it("takes the world of a good answer", async () => {
      held.mw.seedStore(fullBoxRecord())
      held.mw.willGet(held.mw.answerOf(scopeOf(), fullBoxRecord(), 'the world now'))
      await boxListingOf(held.mw).fetch(scopeOf())
      expect(held.mw.callsOf('takeWorld')).to.deep.equal([{ verb: 'takeWorld', world: 'the world now' }])
    })

    const malformed: readonly (readonly [blurb: string, answer: () => object])[] = [
      ['an answer that is not an outcome',        () => ({ scope: scopeOf(), world: null })],
      ['a record that is no record',              () => ({ scope: scopeOf(), ok: true, val: { junk: 1 }, world: null })],
      ['an answer missing its scope',             () => ({ ok: true, val: fullBoxRecord(), world: null })],
      ['a refusal that is no VaultError',         () => ({ scope: scopeOf(), ok: false, err: new Error('plain'), world: null })],
      ['an answer carrying both val and err',     () => ({ scope: scopeOf(), ok: true, val: fullBoxRecord(), err: new VaultError('not_permitted', "No."), world: null })],
    ]
    for (const [blurb, answer] of malformed) {
      it(`refuses ${blurb} as 'bad_record' before anything is delivered`, async () => {
        const listing = boxListingOf(held.mw)
        held.mw.willGet(answer())
        await TH.expectRefusal(listing.fetch(scopeOf()), 'bad_record')
        expect(held.mw.callsOf('takeWorld')).to.deep.equal([])
        expect(held.mw.callsOf('save')).to.deep.equal([])
        expect(listing.things).to.deep.equal([])
        expect(listing.snapshot).to.deep.equal([])
      })
    }

    it("refuses a malformed answer to a put as it does to a fetch", async () => {
      held.mw.willPut({ ok: true, val: fullBoxRecord(), world: null })
      await TH.expectRefusal(boxListingOf(held.mw).put(fullBoxRecord()), 'bad_record')
      expect(held.mw.callsOf('takeWorld')).to.deep.equal([])
    })

    it("refuses a malformed answer to a del as it does to a fetch", async () => {
      held.mw.willDel({ ok: true, val: { junk: 1 }, scope: scopeOf(), world: null })
      await TH.expectRefusal(boxListingOf(held.mw).del(sparseBoxRecord()), 'bad_record')
      expect(held.mw.callsOf('takeWorld')).to.deep.equal([])
    })

    it("refuses a fetch of a scope that is no scope as 'bad_scope', before the world or storage is called", async () => {
      const listing = boxListingOf(held.mw)
      await TH.expectRefusal(listing.fetch({ ...scopeOf(), boxlabel: 'Not A Label!' }), 'bad_scope')
      expect(held.mw.calls).to.deep.equal([])
    })

    it("refuses fetch options out of range as 'bad_option', before the world or storage is called", async () => {
      const listing = boxListingOf(held.mw)
      await TH.expectRefusal(listing.fetch(scopeOf(), { ifAbsent: 'create' } as never), 'bad_option')
      expect(held.mw.calls).to.deep.equal([])
    })

    it("hands the world the timely options of a fetch and not its ifAbsent", async () => {
      held.mw.seedStore(fullBoxRecord())
      await boxListingOf(held.mw).fetch(scopeOf(), { maxWorldMillis: 5, ifAbsent: 'nil' })
      expect(held.mw.callsOf('ensureTimely')[0]?.opts).to.deep.equal({ maxWorldMillis: 5 })
    })
  })

  describe("a settle that saves to the cache", () => {
    it("is made once per delivery, and once per build, with the cacheable of the instance", async () => {
      const listing = boxListingOf(held.mw)
      const one = await listing.build({ ...scopeOf('one') })
      const two = await listing.build(fullBoxRecord({ boxlabel: 'two' }))
      held.mw.seedStore(fullBoxRecord({ boxlabel: 'two', revision_tok: 'rev-a2', revision_seq: 2 }))
      await listing.fetch(scopeOf('two'))
      const saves = held.mw.callsOf('save')
      expect(saves.map(({ cacheable }) => [cacheable.boxlabel, cacheable.central.revision_seq])).to.deep.equal([['one', -1], ['two', 1], ['two', 2]])
      expect(saves[0]?.cacheable).to.deep.equal(one.cacheable)
      expect(saves[2]?.cacheable).to.deep.equal(two.cacheable)
    })

    it("saves a delivery that changes nothing too: the answer is delivered, so the copy is current", async () => {
      held.mw.seedStore(fullBoxRecord())
      const listing = boxListingOf(held.mw)
      await listing.fetch(scopeOf())
      await listing.fetch(scopeOf())
      expect(held.mw.callsOf('save')).to.have.lengthOf(2)
    })

    it("makes the snapshot inside receive, before the save; a save refused is told to onBadNews, not thrown", async () => {
      const listing = boxListingOf(held.mw)
      let heardAtSave = -1
      held.mw.willSave(() => {
        heardAtSave = listing.snapshot.length
        throw new VaultError('unexpected_error', "The cache is full.")
      })
      const box = await listing.build(fullBoxRecord())
      expect(heardAtSave).to.eq(1)
      expect(listing.at(box.scope)).to.eq(box)
      expect(listing.snapshot).to.have.lengthOf(1)
      expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['unexpected_error'])
    })

    it("makes the snapshot of a build(dna) after the save, which holds nothing back: a save refused is told", async () => {
      const listing = boxListingOf(held.mw)
      let heardAtSave = -1
      held.mw.willSave(() => {
        heardAtSave = listing.snapshot.length
        throw new VaultError('unexpected_error', "The cache is full.")
      })
      const box = await listing.build({ ...scopeOf() })
      expect(heardAtSave).to.eq(0)
      expect(listing.snapshot).to.deep.equal([box.getSnapshot()])
      expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['unexpected_error'])
    })
  })

  describe("a refusal met in delivering a record", () => {
    it("is told to onBadNews and not thrown to a fetch, which has the instance back as it stands", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      held.mw.seedStore(fullBoxRecord({ revision_tok: 'rev-other' }))
      held.mw.clearCalls()
      const got = await listing.fetch(scopeOf())
      expect(got).to.eq(box)
      expect(box.revision_tok).to.eq('rev-a1')
      expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['corrupt_record'])
      expect(held.mw.callsOf('save')).to.have.lengthOf(1)
    })

    it("is told to onBadNews and not thrown to a build(record), which has the instance back", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      const again = await listing.build(fullBoxRecord({ revision_tok: 'rev-other' }))
      expect(again).to.eq(box)
      expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['corrupt_record'])
    })

    it("is told to onBadNews and not thrown to a put", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      held.mw.willPut({ scope: box.scope, ok: true, val: fullBoxRecord({ revision_tok: 'rev-other' }), world: null })
      expect(await listing.put(box)).to.eq(box)
      expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['corrupt_record'])
    })

    it("lets a 'stale_write' reach its caller as it came, the carried record's conflict going to onBadNews", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      held.mw.willPut(held.mw.staleWriteOf(box.scope, fullBoxRecord({ revision_tok: 'rev-other' })))
      const err = await TH.expectRefusal(listing.put(box), 'stale_write')
      expect(err.meta).to.have.property('box_stored')
      expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['corrupt_record'])
    })

    it("leaves the answer's own refusals to the caller: a world's, a refusal answer, the absent refusal", async () => {
      const listing = boxListingOf(held.mw)
      held.mw.willGet(held.mw.refusalOf(scopeOf(), new VaultError('storage_unavailable', "Down."), null))
      await TH.expectRefusal(listing.fetch(scopeOf()), 'storage_unavailable')
      await TH.expectRefusal(listing.fetch(scopeOf()), 'absent_box')
      expect(held.mw.badnews).to.deep.equal([])
    })

    it("is told, from a hydrate that is refused, by hydrateAll, which resolves", async () => {
      await seededCache()
      const listing = boxListingOf(held.mw)
      await listing.hello()
      held.mw.clearCalls()
      held.mw.willGet(held.mw.refusalOf(scopeOf('full_box'), new VaultError('storage_unavailable', "Down."), null))
      await listing.hydrateAll({ maxMillisSinceRefresh: 0 })
      expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['storage_unavailable'])
    })
  })

  describe("one instance for each scope", () => {
    it("keeps an instance held through hello: its cached copy is not revived over it", async () => {
      await seededCache()
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord({ boxlabel: 'full_box', revision_tok: 'rev-a2', revision_seq: 2 }))
      await listing.hello()
      expect(listing.at(scopeOf('full_box'))).to.eq(box)
      expect(box.revision_seq).to.eq(2)
      expect(listing.things).to.have.lengthOf(3)
    })

    it("lets go the instance a build(dna) over its scope replaces: a change of it no longer makes the listing's snapshot again", async () => {
      const listing = boxListingOf(held.mw)
      const old = await listing.build(fullBoxRecord())
      const replacement = await listing.build({ ...scopeOf() })
      expect(listing.at(scopeOf())).to.eq(replacement)
      const remade = vi.spyOn(Listing.prototype, 'things', 'get')   // the snapshot is made from `things`
      try {
        await old.edit({ sidecar: { note: 'orphan' } })
        expect(remade).to.not.have.been.called
      } finally {
        remade.mockRestore()
      }
      expect(listing.snapshot).to.deep.equal([replacement.getSnapshot()])
    })
  })

  describe("the watch's notices", () => {
    it("delivers a notice as a good answer: a box not held is built, held and saved", async () => {
      const listing = boxListingOf(held.mw)
      await listing.hello()
      held.mw.clearCalls()
      await held.mw.notify(fullBoxRecord(), 'a world')
      const box = listing.at(scopeOf())
      expect(box?.isFull).to.be.true
      expect(listing.snapshot).to.have.lengthOf(1)
      expect(held.mw.callsOf('takeWorld')).to.deep.equal([{ verb: 'takeWorld', world: 'a world' }])
      expect(held.mw.callsOf('save')).to.have.lengthOf(1)
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

    it("tells a refusal met on the way to onBadNews, rather than throwing it", async () => {
      const listing = boxListingOf(held.mw)
      await listing.hello()
      await listing.build(fullBoxRecord())
      await held.mw.notify(fullBoxRecord({ revision_tok: 'rev-other' }))
      expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['corrupt_record'])
    })

    it("tells a refusal met on the way, with no onBadNews given, to nobody and still resolves", async () => {
      const listing = boxListingOf(held.mw, { onBadNews: undefined })
      await listing.hello()
      await listing.build(fullBoxRecord())
      await held.mw.notify(fullBoxRecord({ revision_tok: 'rev-other' }))
      expect(held.mw.badnews).to.deep.equal([])
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
      const draft = await listing.build({ ...scopeOf('draft_box') })
      await listing.build(tombstoneBoxRecord({ boxlabel: 'gone_box', revision_seq: 2 }))
      await listing.build(tombstoneBoxRecord({ boxlabel: 'damaged_box', revision_seq: 2 }, 'd'))
      expect(listing.things).to.have.lengthOf(4)
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

    it("follows a thing's change that no delivery brought: an edit, once", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      let told = 0
      listing.subscribe(() => { told += 1 })
      await box.edit({ sidecar: { note: 'edited' } })
      expect(told).to.eq(1)
      expect(listing.snapshot[0]).to.eq(box.getSnapshot())
      expect(listing.snapshot[0]?.sidecar).to.deep.equal({ note: 'edited' })
    })

    it("takes a box in when it comes back to life, and lets it go when it is deleted", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(tombstoneBoxRecord({ revision_seq: 2 }))
      expect(listing.snapshot).to.deep.equal([])
      held.mw.willGet(held.mw.answerOf(scopeOf(), fullBoxRecord({ revision_tok: 'rev-a3', revision_seq: 3 })))
      await listing.fetch(scopeOf())
      expect(listing.snapshot).to.deep.equal([box.getSnapshot()])
      await listing.del(box)
      expect(listing.snapshot).to.deep.equal([])
    })

    it("lets a listener go, and tells none after", async () => {
      const listing = boxListingOf(held.mw)
      let told = 0
      const unsubscribe = listing.subscribe(() => { told += 1 })
      await listing.build({ ...scopeOf('one') })
      unsubscribe()
      await listing.build({ ...scopeOf('two') })
      expect(told).to.eq(1)
    })
  })

  describe("box.isWatchable", () => {
    it("is true until set, and a plain get and set", async () => {
      const box = await boxListingOf(held.mw).build({ ...scopeOf() })
      expect(box.isWatchable).to.be.true
      box.isWatchable = false
      expect(box.isWatchable).to.be.false
      box.isWatchable = true
      expect(box.isWatchable).to.be.true
    })

    it("names a box to the watch's fullFor only while it is", async () => {
      const listing = boxListingOf(held.mw)
      await listing.hello()
      const box = await listing.build({ ...scopeOf() })
      expect(held.mw.watchedScopes()).to.deep.equal([box.scope])
      box.isWatchable = false
      expect(held.mw.watchedScopes()).to.deep.equal([])
      expect(listing.watchableThings).to.deep.equal([])
    })
  })
})

// == [Helpers of the pipeline tests]: scopeOf, seededCache, edited

const scopeOf = (boxlabel = 'anthropic_api_key') => held.mw.boxscope(boxlabel)

/** A cache holding a full box, a deleted one and a draft, each as a listing saved it. */
const seededCache = async () => {
  const maker = boxListingOf(held.mw)
  await maker.build(fullBoxRecord({ boxlabel: 'full_box' }))
  await maker.build(tombstoneBoxRecord({ boxlabel: 'gone_box', revision_seq: 2 }))
  await maker.build({ ...scopeOf('draft_box') })
  const copies = [...held.mw.cached.values()]
  held.mw.clearCalls()
  held.mw.seedStore(fullBoxRecord({ boxlabel: 'full_box' }))
  held.mw.seedStore(tombstoneBoxRecord({ boxlabel: 'gone_box', revision_seq: 2 }))
  return copies
}

const edited = async () => {
  const listing = boxListingOf(held.mw)
  const box = await listing.build(fullBoxRecord())
  await box.edit({ sidecar: { note: 'edited' } })
  return { listing, box }
}
// --
