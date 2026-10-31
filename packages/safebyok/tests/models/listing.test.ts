import { describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/errors'
import { Box } from '../../src/models/box'
import { BoxListing } from '../../src/models/box-listing'
import * as TH from '../test-helpers'
import { type BoxAnswer, boxListingOf, keptOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld } from '../test-helpers/models-world'

const held = useModelsWorld()

describe("listing.fetch(scope): nothing stored for a thing held alive", () => {
  it("refuses 'record_conflict' by the same-revision row same | gone | alive, the box as it was and nothing saved to the cache", async () => {
    const listing = boxListingOf(held.mw)
    const box = await listing.build(fullBoxRecord())
    const before = keptOf(held.mw, box)
    held.mw.clearCalls()
    held.mw.willGet(held.mw.answerOf(box.scope, null))
    await TH.expectRefusal(listing.fetch(box.scope), 'record_conflict')
    expect(keptOf(held.mw, box)).to.deep.equal(before)
    expect(listing.at(box.scope)).to.eq(box)
    expect(held.mw.calls.map(({ verb }) => verb)).to.deep.equal(['ensureTimely', 'get', 'takeWorld'])
  })
})

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
        expect(keptOf(held.mw, box), copy.boxlabel).to.deep.equal(copy)
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

    it("tells a refused load to onBadNews as a cache miss, and still starts the watch and hydrates", async () => {
      held.mw.seedStore(fullBoxRecord())
      held.mw.willLoad(() => { throw new VaultError('unexpected_error', "The cache is gone.") })
      const listing = boxListingOf(held.mw)
      await listing.hello()
      expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['unexpected_error'])
      expect(held.mw.watches).to.have.lengthOf(1)
      expect(listing.things).to.deep.equal([])
    })

    it("tells a cached copy it cannot revive to onBadNews, and revives the rest", async () => {
      const copies = await seededCache()
      held.mw.willLoad([{ boxlabel: 'mangled', central: { boxlabel: 'mangled' }, staged: null }, ...copies])
      const listing = boxListingOf(held.mw)
      await listing.hello()
      expect(held.mw.badnews).to.have.lengthOf(1)
      expect(listing.things).to.have.lengthOf(copies.length)
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
      const { staged } = keptOf(held.mw, box)
      held.mw.clearCalls()
      const answered = await listing.put(box)
      const [call] = held.mw.callsOf('put')
      expect(call?.priorTok).to.equal('rev-a1')
      expect(call?.record).to.deep.equal(staged)
      expect(answered).to.eq(box)
      expect(box.hasStaged).to.be.false
      expect(keptOf(held.mw, box).central).to.deep.equal(staged)
      expect(box.sidecar).to.deep.equal({ note: 'edited' })
    })

    it("puts a record by the same path: the box held under its scope expects the revision, and receives the answer", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      held.mw.seedStore(fullBoxRecord())
      const record = fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2, sidecar: { note: 'new' } })
      held.mw.clearCalls()
      expect(await listing.put(record)).to.eq(box)
      expect(held.mw.callsOf('put')[0]?.priorTok).to.equal('rev-a1')
      expect(box.revision_seq).to.eq(2)
      expect(box.sidecar).to.deep.equal({ note: 'new' })
    })

    it("sends no prior tok for a box not held", async () => {
      const listing = boxListingOf(held.mw)
      expect(listing.priorTokOf(scopeOf())).to.be.null
      const box = await listing.put(fullBoxRecord({ revision_seq: 0 }))
      expect(held.mw.callsOf('put')[0]?.priorTok).to.be.null
      expect(listing.at(scopeOf())).to.eq(box)
      expect(box?.isFull).to.be.true
    })

    it("sends no prior tok for a thing never stored, and its answer spends the draft", async () => {
      const listing = boxListingOf(held.mw)
      const draft = await listing.build({ ...scopeOf() })
      expect(listing.priorTokOf(draft.scope)).to.be.null
      held.mw.clearCalls()
      await listing.put(fullBoxRecord({ revision_seq: 0 }))
      expect(held.mw.callsOf('put')[0]?.priorTok).to.be.null
      expect(draft.hasStaged).to.be.false
      expect(draft.isFull).to.be.true
    })

    it("refuses a box not full as 'bad_record' before storage is called", async () => {
      const listing = boxListingOf(held.mw)
      const sparse = await listing.build(sparseBoxRecord())
      held.mw.clearCalls()
      await TH.expectRefusal(listing.put(sparse), 'bad_record')
      expect(held.mw.callsOf('put')).to.deep.equal([])
    })

    it("saves the box to the cache once, with its cacheable", async () => {
      const { listing, box } = await edited()
      held.mw.clearCalls()
      await listing.put(box)
      const saves = held.mw.callsOf('save')
      expect(saves).to.have.lengthOf(1)
      expect(saves[0]?.cacheable).to.deep.equal(keptOf(held.mw, box))
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
      held.mw.seedStore(fullBoxRecord())
      held.mw.clearCalls()
      expect(await listing.del(box)).to.eq(box)
      expect(held.mw.callsOf('del')[0]?.priorTok).to.equal('rev-a1')
      expect(box.isPresent).to.be.false
      expect(box.am).to.eq('x')
      expect(box.revision_seq).to.eq(2)
      expect(listing.at(box.scope)).to.eq(box)
    })

    it("deletes at the revision of a staged tombstone's central, not the staged revision", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      held.mw.seedStore(fullBoxRecord())
      await box.del()
      expect(held.mw.callsOf('del')[0]?.priorTok).to.equal('rev-a1')
      expect(box.hasStaged).to.be.false
      expect(box.isPresent).to.be.false
    })

    it("deletes a sparse record's box the same way", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      held.mw.seedStore(fullBoxRecord())
      await listing.del(sparseBoxRecord())
      expect(held.mw.callsOf('del')[0]?.priorTok).to.equal('rev-a1')
      expect(box.isPresent).to.be.false
    })

    it("sends no prior tok for a box not held", async () => {
      const listing = boxListingOf(held.mw)
      await listing.del(sparseBoxRecord())
      expect(held.mw.callsOf('del')[0]?.priorTok).to.be.null
    })

    it("saves the tombstone to the cache once", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      held.mw.seedStore(fullBoxRecord())
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
      await TH.expectRefusal(boxListingOf(held.mw).put(fullBoxRecord({ revision_seq: 0 })), 'bad_record')
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
      expect(saves[0]?.cacheable).to.deep.equal(keptOf(held.mw, one))
      expect(saves[2]?.cacheable).to.deep.equal(keptOf(held.mw, two))
    })

    it("saves a delivery that changes nothing too: the answer is delivered, so the copy is current", async () => {
      held.mw.seedStore(fullBoxRecord())
      const listing = boxListingOf(held.mw)
      await listing.fetch(scopeOf())
      await listing.fetch(scopeOf())
      expect(held.mw.callsOf('save')).to.have.lengthOf(2)
    })

    it("makes the snapshot of a box held inside receive, before the save; a save refused is told to onBadNews, not thrown", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      let heardAtSave: unknown = null
      held.mw.willSave(() => {
        heardAtSave = listing.snapshot
        throw new VaultError('unexpected_error', "The cache is full.")
      })
      held.mw.seedStore(fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 }))
      expect(await listing.fetch(scopeOf())).to.eq(box)
      expect(heardAtSave).to.deep.equal([box.getSnapshot()])
      expect(listing.snapshot).to.eq(heardAtSave)
      expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['unexpected_error'])
    })

    it("makes the snapshot of a box born of a record after the save, held from the moment it accepts the record: a save refused is told", async () => {
      const listing = boxListingOf(held.mw)
      let heldAtSave: unknown = null
      held.mw.willSave((cacheable) => {
        heldAtSave = listing.at(scopeOf(cacheable.boxlabel))
        throw new VaultError('unexpected_error', "The cache is full.")
      })
      const box = await listing.build(fullBoxRecord())
      expect(heldAtSave).to.eq(box)
      expect(listing.snapshot).to.deep.equal([box.getSnapshot()])
      expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['unexpected_error'])
    })

    const storedA2 = fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 })
    for (const [blurb, stored, act] of [
      ["a fetch",         storedA2,        (listing: ReturnType<typeof boxListingOf>, box: Box) => listing.fetch(box.scope)],
      ["a put",           fullBoxRecord(), (listing: ReturnType<typeof boxListingOf>) => listing.put(fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 }))],
      ["a del",           fullBoxRecord(), (listing: ReturnType<typeof boxListingOf>, box: Box) => listing.del(box)],
      ["a build(record)", storedA2,        (listing: ReturnType<typeof boxListingOf>) => listing.build(fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 }))],
    ] as const) {
      it(`resolves ${blurb} whose save is refused, as a cache miss told once to onBadNews`, async () => {
        const listing = boxListingOf(held.mw)
        const box = await listing.build(fullBoxRecord())
        held.mw.seedStore(stored)
        held.mw.clearCalls()
        held.mw.willSave(() => { throw new VaultError('unexpected_error', "The cache is full.") })
        expect(await act(listing, box)).to.eq(box)
        expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['unexpected_error'])
      })
    }

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
    it("is thrown to a fetch, which cannot have the record it asked for: the box as it was, nothing saved, nothing told", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      held.mw.seedStore(fullBoxRecord({ revision_tok: 'rev-other' }))
      held.mw.clearCalls()
      await TH.expectRefusal(listing.fetch(scopeOf()), 'record_conflict')
      expect(listing.at(scopeOf())).to.eq(box)
      expect(box.revision_tok).to.eq('rev-a1')
      expect(held.mw.callsOf('save')).to.deep.equal([])
      expect(held.mw.badnews).to.deep.equal([])
    })

    it("is thrown to a build(record), the box held kept as it was", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      held.mw.clearCalls()
      await TH.expectRefusal(listing.build(fullBoxRecord({ revision_tok: 'rev-other' })), 'record_conflict')
      expect(listing.at(scopeOf())).to.eq(box)
      expect(box.revision_tok).to.eq('rev-a1')
      expect(held.mw.callsOf('save')).to.deep.equal([])
      expect(held.mw.badnews).to.deep.equal([])
    })

    it("is thrown to a put, the box as it was", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      held.mw.clearCalls()
      held.mw.willPut({ scope: box.scope, ok: true, val: fullBoxRecord({ revision_tok: 'rev-other' }), world: null })
      await TH.expectRefusal(listing.put(box), 'record_conflict')
      expect(box.revision_tok).to.eq('rev-a1')
      expect(held.mw.callsOf('save')).to.deep.equal([])
      expect(held.mw.badnews).to.deep.equal([])
    })

    it("is thrown to a fetch of a scope not held, and nothing is held, saved or told", async () => {
      const listing = boxListingOf(held.mw)
      held.mw.seedStore(fullBoxRecord())
      const refused = vi.spyOn(Box.prototype, 'receive').mockImplementationOnce(() => { throw new VaultError('record_conflict', "Refused.") })
      try {
        await TH.expectRefusal(listing.fetch(scopeOf()), 'record_conflict')
      } finally {
        refused.mockRestore()
      }
      expect(listing.at(scopeOf())).to.be.null
      expect(listing.snapshot).to.deep.equal([])
      expect(held.mw.callsOf('save')).to.deep.equal([])
      expect(held.mw.badnews).to.deep.equal([])
    })

    it("lets a 'stale_write' reach its caller as it came, the carried record's conflict going to onBadNews", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      held.mw.willPut(held.mw.staleWriteOf(box.scope, fullBoxRecord({ revision_tok: 'rev-other' })))
      const err = await TH.expectRefusal(listing.put(box), 'stale_write')
      expect(err.meta).to.have.property('box_stored')
      expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['record_conflict'])
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

    for (const [blurb, record] of [["alive", fullBoxRecord()], ["deleted", tombstoneBoxRecord({ revision_seq: 2 })]] as const) {
      it(`refuses a build(dna) over the scope of a box held ${blurb} as 'bad_option': the box held kept, nothing saved`, async () => {
        const listing = boxListingOf(held.mw)
        const box = await listing.build(record)
        held.mw.clearCalls()
        await TH.expectRefusal(listing.build({ ...scopeOf() }), 'bad_option')
        expect(listing.at(scopeOf())).to.eq(box)
        expect(box.revision_seq).to.eq(record.revision_seq)
        expect(held.mw.calls).to.deep.equal([])
      })
    }

    it("makes each scope's instance once, however it arrives: hello's copy, a build, a fetch, a put, a del, a notice", async () => {
      const copies = await seededCache()
      const made = vi.spyOn(BoxListing.prototype as unknown as { makeThing: () => Box }, 'makeThing')
      try {
        const listing = boxListingOf(held.mw)
        await listing.hello()
        const box = await listing.build(fullBoxRecord({ boxlabel: 'built' }))
        await listing.build(fullBoxRecord({ boxlabel: 'built' }))
        held.mw.seedStore(fullBoxRecord({ boxlabel: 'fetched' }))
        await listing.fetch(scopeOf('fetched'))
        await listing.fetch(scopeOf('fetched'))
        held.mw.seedStore(fullBoxRecord({ boxlabel: 'built' }))
        await listing.put(fullBoxRecord({ boxlabel: 'built', revision_tok: 'rev-a2', revision_seq: 2 }))
        await listing.del(box)
        await held.mw.notify(fullBoxRecord({ boxlabel: 'noticed' }))
        await held.mw.notify(fullBoxRecord({ boxlabel: 'noticed' }))
        await held.mw.notify(fullBoxRecord({ boxlabel: 'fetched', revision_tok: 'rev-a2', revision_seq: 2 }))
        expect(made).to.have.callCount(copies.length + 3)
        expect(listing.things).to.have.lengthOf(copies.length + 3)
      } finally {
        made.mockRestore()
      }
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
      expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['record_conflict'])
    })

    it("tells a refusal met on the way, with no onBadNews given, to nobody and still resolves", async () => {
      const listing = boxListingOf(held.mw, { onBadNews: undefined })
      await listing.hello()
      await listing.build(fullBoxRecord())
      await held.mw.notify(fullBoxRecord({ revision_tok: 'rev-other' }))
      expect(held.mw.badnews).to.deep.equal([])
    })

    it("tells a malformed notice to onBadNews as 'bad_record', rather than throwing it", async () => {
      const listing = boxListingOf(held.mw)
      await listing.hello()
      await held.mw.notifyRaw({ record: { boxlabel: 'no record' }, world: null })
      expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['bad_record'])
      expect(listing.things).to.deep.equal([])
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

// == [Bad news told]: a handler that throws, a refusal told once, a cache loaded malformed

describe("listing: a host's onBadNews that fails", () => {
  it("reports a handler that throws to the platform and goes on: hello resolves, the rest of the news is told", async () => {
    const reported: unknown[] = []
    vi.stubGlobal('reportError', (err: unknown) => { reported.push(err) })
    try {
      const told: string[] = []
      const listing = boxListingOf(held.mw, { onBadNews: (news) => { told.push(news.refusalkind); bust() } })
      held.mw.willLoad(() => { throw new VaultError('unexpected_error', "The cache is gone.") })
      held.mw.willGet(held.mw.refusalOf(held.mw.boxscope('anthropic_api_key'), new VaultError('storage_unavailable', "Down.")))
      held.mw.seedStore(fullBoxRecord())
      await listing.hello()
      expect(told).to.deep.equal(['unexpected_error'])
      expect(reported).to.have.lengthOf(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("reports a handler whose promise rejects to the platform, with no unhandled rejection", async () => {
    const reported: unknown[] = []
    vi.stubGlobal('reportError', (err: unknown) => { reported.push(err) })
    try {
      const listing = boxListingOf(held.mw, { maxMillisSinceRefresh: 1000, onBadNews: rejectingHandler })
      const box = await listing.build(fullBoxRecord())
      held.mw.willGet(held.mw.refusalOf(box.scope, new VaultError('storage_unavailable', "Down.")))
      await held.mw.advance(800)
      expect(reported).to.have.lengthOf(1)
      expect(reported[0]).to.have.property('message', "Rejected.")
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("reports a handler that throws as a timer's launch is refused, nothing unhandled", async () => {
    const reported: unknown[] = []
    vi.stubGlobal('reportError', (err: unknown) => { reported.push(err) })
    try {
      const listing = boxListingOf(held.mw, { maxMillisSinceRefresh: 1000, onBadNews: bust })
      const box = await listing.build(fullBoxRecord())
      held.mw.willGet(held.mw.refusalOf(box.scope, new VaultError('storage_unavailable', "Down.")))
      await held.mw.advance(800)
      expect(held.mw.callsOf('get')).to.have.lengthOf(1)
      expect(reported).to.have.lengthOf(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe("listing: a refusal met by a timer's launch and by a call that joins it", () => {
  it("tells it to onBadNews once when hydrateAll joins the launch", async () => {
    const down = new VaultError('storage_unavailable', "Down.")
    const { listing, open } = await launchingOf(down)
    const hydrating = listing.hydrateAll()
    await vi.advanceTimersByTimeAsync(0)
    open()
    await hydrating
    await vi.advanceTimersByTimeAsync(0)
    expect(held.mw.callsOf('get')).to.have.lengthOf(1)
    expect(held.mw.badnews).to.deep.equal([down])
  })

  it("tells it once, and throws it to the caller, when box.hydrate joins the launch", async () => {
    const down = new VaultError('storage_unavailable', "Down.")
    const { box, open } = await launchingOf(down)
    const hydrating = box.hydrate()
    await vi.advanceTimersByTimeAsync(0)
    open()
    await expect(hydrating).rejects.to.eq(down)
    await vi.advanceTimersByTimeAsync(0)
    expect(held.mw.badnews).to.deep.equal([down])
  })

  it("tells the refusal of each separate launch, though they carry the same message", async () => {
    const { listing, open } = await launchingOf(new VaultError('storage_unavailable', "Down."))
    open()
    await vi.advanceTimersByTimeAsync(0)
    held.mw.willGet(held.mw.refusalOf(listing.things[0]!.scope, new VaultError('storage_unavailable', "Down.")))
    await listing.hydrateAll()
    expect(held.mw.badnews).to.have.lengthOf(2)
  })
})

describe("listing.hello(): the cache loaded malformed", () => {
  it("is a cache miss told to onBadNews when load resolves to something that is not an array: the watch starts and everything hydrates", async () => {
    held.mw.seedStore(fullBoxRecord())
    held.mw.willLoad(() => notAnArray)
    const listing = boxListingOf(held.mw)
    await listing.hello()
    expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['bad_record'])
    expect(held.mw.watches).to.have.lengthOf(1)
    expect(listing.things).to.deep.equal([])
  })

  it("is a cache miss told to onBadNews for a copy with no central, and the other copies are revived", async () => {
    const copies = await seededCache()
    const [copy] = copies
    const { central: _central, ...headless } = copy!
    held.mw.willLoad([headless as never, ...copies.slice(1)])
    const listing = boxListingOf(held.mw)
    await listing.hello()
    expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['bad_record'])
    expect(listing.things).to.have.lengthOf(copies.length - 1)
  })
})

describe("listing: a copy or a record of another vault_tok meets no instance held", () => {
  const OtherVault = 'vault-tok-other'

  it("refuses 'unexpected_error' for a fetch answered with a record of another vault_tok, making and saving nothing", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.willGet(held.mw.answerOf(scopeOf(), fullBoxRecord({ vault_tok: OtherVault })))
    await TH.expectRefusal(listing.fetch(scopeOf()), 'unexpected_error')
    expect(listing.things).to.deep.equal([])
    expect(held.mw.callsOf('save')).to.deep.equal([])
  })

  it("refuses it for a tombstone and a sparse record alike", async () => {
    const listing = boxListingOf(held.mw)
    for (const record of [tombstoneBoxRecord({ vault_tok: OtherVault, revision_seq: 2 }), sparseBoxRecord({ vault_tok: OtherVault })]) {
      held.mw.willGet(held.mw.answerOf(scopeOf(), record))
      await TH.expectRefusal(listing.fetch(scopeOf()), 'unexpected_error')
    }
    expect(listing.things).to.deep.equal([])
  })

  it("refuses it for build(record), and for a notice, which is told to onBadNews", async () => {
    const listing = boxListingOf(held.mw)
    await TH.expectRefusal(listing.build(fullBoxRecord({ vault_tok: OtherVault })), 'unexpected_error')
    held.mw.seedStore(fullBoxRecord())
    await listing.hello()
    held.mw.clearCalls()
    await held.mw.notify(fullBoxRecord({ boxlabel: 'other_box', vault_tok: OtherVault }))
    expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['unexpected_error'])
    expect(listing.at(scopeOf('other_box'))).to.be.null
  })

  it("refuses it for a stale_write refusal's stored record, telling that one to onBadNews and throwing the stale_write", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.willPut(held.mw.staleWriteOf(scopeOf(), fullBoxRecord({ vault_tok: OtherVault, revision_seq: 5 })))
    await TH.expectRefusal(listing.put(fullBoxRecord({ revision_seq: 0 })), 'stale_write')
    expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['unexpected_error'])
    expect(listing.things).to.deep.equal([])
  })

  it("tells a cached copy of another vault_tok to onBadNews as a cache miss, reviving the others", async () => {
    const copies = await seededCache()
    const [first, ...rest] = copies
    held.mw.willLoad([{ ...first!, vault_tok: OtherVault, central: { ...first!.central, vault_tok: OtherVault } }, ...rest])
    const listing = boxListingOf(held.mw)
    await listing.hello()
    expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['unexpected_error'])
    expect(listing.at(scopeOf(first!.boxlabel))).to.be.null
    expect(listing.things).to.have.lengthOf(rest.length)
  })

  it("leaves a record of the vault's own vault_tok, and a dna, as they were", async () => {
    const listing = boxListingOf(held.mw)
    await expect(listing.build(fullBoxRecord())).resolves.to.be.instanceOf(Box)
    await expect(listing.build({ ...scopeOf('draft_box') })).resolves.to.be.instanceOf(Box)
  })

  it("compares a record held under another vault_tok by reconcileCentral, so an instance held keeps refusing as it did", async () => {
    const listing = boxListingOf(held.mw)
    const box = await listing.build(fullBoxRecord())
    held.mw.willGet(held.mw.answerOf(box.scope, fullBoxRecord({ vault_tok: OtherVault, revision_seq: 2, revision_tok: 'rev-a2' })))
    const err = await TH.expectRefusal(listing.fetch(box.scope), 'unexpected_error')
    expect(err.message).to.contain('kept its own copy')
  })
})

describe("listing: an answer names the scope of the record it carries", () => {
  it("refuses 'bad_record' for a fetch answered with a record of another scope, making and saving nothing", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.willGet(held.mw.answerOf(scopeOf('asked_box'), fullBoxRecord({ boxlabel: 'other_box' })))
    await TH.expectRefusal(listing.fetch(scopeOf('asked_box')), 'bad_record')
    expect(listing.things).to.deep.equal([])
    expect(held.mw.callsOf('save')).to.deep.equal([])
  })

  it("leaves the instance held under the scope asked as it was, and the instance of the record's scope too", async () => {
    const listing = boxListingOf(held.mw)
    const asked = await listing.build(fullBoxRecord({ boxlabel: 'asked_box' }))
    const other = await listing.build(fullBoxRecord({ boxlabel: 'other_box' }))
    const [askedBefore, otherBefore] = [keptOf(held.mw, asked), keptOf(held.mw, other)]
    held.mw.willGet(held.mw.answerOf(asked.scope, fullBoxRecord({ boxlabel: 'other_box', revision_seq: 2, revision_tok: 'rev-a2' })))
    await TH.expectRefusal(listing.fetch(asked.scope), 'bad_record')
    expect(keptOf(held.mw, asked)).to.deep.equal(askedBefore)
    expect(keptOf(held.mw, other)).to.deep.equal(otherBefore)
  })

  it("refuses it for a put and a del answered so, and for the record a stale_write carries, told to onBadNews with the stale_write thrown", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.willPut(held.mw.answerOf(scopeOf('asked_box'), fullBoxRecord({ boxlabel: 'other_box' })))
    await TH.expectRefusal(listing.put(fullBoxRecord({ boxlabel: 'asked_box', revision_seq: 0 })), 'bad_record')
    held.mw.willDel(held.mw.answerOf(scopeOf('asked_box'), tombstoneBoxRecord({ boxlabel: 'other_box', revision_seq: 2 })))
    await TH.expectRefusal(listing.del(sparseBoxRecord({ boxlabel: 'asked_box' })), 'bad_record')
    held.mw.willPut(held.mw.staleWriteOf(scopeOf('asked_box'), fullBoxRecord({ boxlabel: 'other_box', revision_seq: 5 })))
    await TH.expectRefusal(listing.put(fullBoxRecord({ boxlabel: 'asked_box', revision_seq: 0 })), 'stale_write')
    expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['bad_record'])
    expect(listing.things).to.deep.equal([])
  })

  it("takes a record of the scope asked, however the answer's scope object was made", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.willGet(held.mw.answerOf({ ...scopeOf('asked_box') }, fullBoxRecord({ boxlabel: 'asked_box' })))
    await expect(listing.fetch(scopeOf('asked_box'))).resolves.to.be.instanceOf(Box)
  })
})

describe("storable: the tell it is handed when made", () => {
  it("tells a refusal of the refresh its timer launches to the tell it was given, not to the listing's onBadNews", async () => {
    const listing = boxListingOf(held.mw, { maxMillisSinceRefresh: 1000 })
    const told: unknown[] = []
    const box = new Box(held.mw.world, listing, fullBoxRecord(), null, { maxMillisSinceRefresh: 1000 }, (news) => { told.push(...news) })
    box.receive(fullBoxRecord())
    const down = new VaultError('storage_unavailable', "Down.")
    held.mw.willGet(held.mw.refusalOf(box.scope, down))
    await held.mw.advance(800)
    expect(told).to.deep.equal([down])
    expect(held.mw.badnews).to.deep.equal([])
  })

  it("is handed by the listing to each instance it makes: a revived copy, a record's, a draft's", async () => {
    const copies = await seededCache()
    const listing = boxListingOf(held.mw, { maxMillisSinceRefresh: 1000 })
    held.mw.willLoad(copies)
    await listing.hello()
    const built = await listing.build({ ...scopeOf('draft_two') })
    for (const box of [listing.at(scopeOf('full_box')), built]) {
      held.mw.willGet(held.mw.refusalOf(box!.scope, new VaultError('storage_unavailable', "Down.")))
    }
    held.mw.clearCalls()
    await held.mw.advance(1000)
    expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.include('storage_unavailable')
  })
})
// --

// == [Helpers of the pipeline tests]: scopeOf, seededCache, bust, rejectingHandler, notAnArray, holdOf, launchingOf, edited

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

/** Handlers that fail: `bust` throws, and `rejectingHandler` answers a promise that rejects. */
const bust = (): never => { throw new Error("The handler is broken.") }
const rejectingHandler = (): Promise<never> => Promise.reject(new Error("Rejected."))
const notAnArray = { not: 'an array' } as never

/** A promise the test resolves when it chooses, to hold a call. */
const holdOf = () => {
  const opener = { open: (): void => undefined }
  const promise = new Promise<void>((resolve) => { opener.open = () => { resolve() } })
  return { promise, open: () => { opener.open() } }
}

/** A listing whose box has its timer's launch under way, held until `open`, which has the store answer `err`. */
const launchingOf = async (err: VaultError) => {
  const listing = boxListingOf(held.mw, { maxMillisSinceRefresh: 1000 })
  const box = await listing.build(fullBoxRecord())
  const gate = holdOf()
  held.mw.willGet(async () => { await gate.promise; return held.mw.refusalOf(box.scope, err) })
  await held.mw.advance(800)
  expect(held.mw.callsOf('get')).to.have.lengthOf(1)
  return { listing, box, open: gate.open }
}

const edited = async () => {
  const listing = boxListingOf(held.mw)
  held.mw.seedStore(fullBoxRecord())
  const box = await listing.build(fullBoxRecord())
  await box.edit({ sidecar: { note: 'edited' } })
  return { listing, box }
}
// --

describe("listing.put: the versioned replace", () => {
  it("makes the fake store refuse 'stale_write' over a box stored when none was expected, delivering the box stored", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.seedStore(fullBoxRecord({ revision_tok: 'rev-stored', revision_seq: 4 }))
    await TH.expectRefusal(listing.put(fullBoxRecord({ revision_seq: 0 })), 'stale_write')
    expect(listing.things.map(({ revision_tok }) => revision_tok)).to.deep.equal(['rev-stored'])
    expect(held.mw.callsOf('put').map(({ priorTok }) => priorTok)).to.deep.equal([null])
    expect(held.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_tok: 'rev-stored', revision_seq: 4 })
  })

  it("makes the fake store refuse 'stale_write' over a tombstone stored when none was expected, delivering the tombstone", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.seedStore(tombstoneBoxRecord({ revision_seq: 4 }))
    await TH.expectRefusal(listing.put(fullBoxRecord({ revision_tok: 'rev-a0', revision_seq: 0 })), 'stale_write')
    expect(held.mw.callsOf('put').map(({ priorTok }) => priorTok)).to.deep.equal([null])
    expect(held.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_seq: 4 })
    expect(listing.things.map(({ isPresent }) => isPresent)).to.deep.equal([false])
  })

  it("makes the fake store keep the record exactly as given over no row", async () => {
    const box = await boxListingOf(held.mw).put(fullBoxRecord({ revision_tok: 'rev-new', revision_seq: 0 }))
    expect(box).to.include({ revision_tok: 'rev-new', revision_seq: 0 })
    expect(held.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_tok: 'rev-new', revision_seq: 0 })
  })
})

describe("listing: an answer is for the scope the call asked about", () => {
  it("refuses 'bad_record' a fetch answered for another scope, though the record agrees with the answer, making and saving nothing", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.willGet(held.mw.answerOf(scopeOf('other_box'), fullBoxRecord({ boxlabel: 'other_box' })))
    await TH.expectRefusal(listing.fetch(scopeOf('asked_box')), 'bad_record')
    expect(listing.things).to.deep.equal([])
    expect(held.mw.callsOf('save')).to.deep.equal([])
  })

  it("refuses it for a put and a del answered for another scope, and for a refusal answered so, the refusal not thrown in its place", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.willPut(held.mw.answerOf(scopeOf('other_box'), fullBoxRecord({ boxlabel: 'other_box' })))
    await TH.expectRefusal(listing.put(fullBoxRecord({ boxlabel: 'asked_box', revision_seq: 0 })), 'bad_record')
    held.mw.willDel(held.mw.answerOf(scopeOf('other_box'), tombstoneBoxRecord({ boxlabel: 'other_box', revision_seq: 2 })))
    await TH.expectRefusal(listing.del(sparseBoxRecord({ boxlabel: 'asked_box' })), 'bad_record')
    held.mw.willPut(held.mw.staleWriteOf(scopeOf('other_box'), fullBoxRecord({ boxlabel: 'other_box', revision_seq: 5 })))
    await TH.expectRefusal(listing.put(fullBoxRecord({ boxlabel: 'asked_box', revision_seq: 0 })), 'bad_record')
    expect(listing.things).to.deep.equal([])
    expect(held.mw.badnews).to.deep.equal([])
  })

  it("leaves an instance held under the scope asked as it was", async () => {
    const listing = boxListingOf(held.mw)
    const asked = await listing.build(fullBoxRecord({ boxlabel: 'asked_box' }))
    const before = keptOf(held.mw, asked)
    held.mw.willGet(held.mw.answerOf(scopeOf('other_box'), fullBoxRecord({ boxlabel: 'other_box', revision_seq: 2, revision_tok: 'rev-a2' })))
    await TH.expectRefusal(listing.fetch(asked.scope), 'bad_record')
    expect(keptOf(held.mw, asked)).to.deep.equal(before)
    expect(listing.things).to.deep.equal([asked])
  })
})

/** The cached copy of a box with an edit staged, its staged record then given `vault_tok`. */
const copyStagedUnder = async (vault_tok: string) => {
  const maker = boxListingOf(held.mw)
  const box = await maker.build(fullBoxRecord({ boxlabel: 'staged_box' }))
  await box.edit({ sidecar: { note: 'edited' } })
  const copy = keptOf(held.mw, box)
  held.mw.clearCalls()
  return { ...copy, staged: { ...copy.staged!, vault_tok } }
}

describe("listing.hello(): a cached copy's staged record is of the vault's own vault_tok", () => {
  it("tells a copy whose central is the vault's own but whose staged is of another vault_tok to onBadNews as a cache miss, making no instance of it", async () => {
    held.mw.willLoad([await copyStagedUnder('vault-tok-other')])
    const listing = boxListingOf(held.mw)
    await listing.hello()
    expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['unexpected_error'])
    expect(listing.things).to.deep.equal([])
  })

  it("revives a copy whose staged record is of the vault's own vault_tok", async () => {
    held.mw.willLoad([await copyStagedUnder(held.mw.world.vault_tok)])
    held.mw.seedStore(fullBoxRecord({ boxlabel: 'staged_box' }))
    const listing = boxListingOf(held.mw)
    await listing.hello()
    expect(held.mw.badnews).to.deep.equal([])
    expect(listing.at(scopeOf('staged_box'))?.hasStaged).to.be.true
  })
})

// == [The versioned replace]: the store's put and del over a prior tok, cell by cell, and the prior tok the listing sends

const aliveRow   = fullBoxRecord()
const goneRow    = tombstoneBoxRecord({ revision_tok: 'rev-x2', revision_seq: 2 })
const damagedRow = tombstoneBoxRecord({ revision_tok: 'rev-d2', revision_seq: 2 }, 'd')

/** The store's answer to a put or a del, told as a case names it: the `revision_seq` it landed at, or its refusalkind and the record it carries, `undefined` for none. */
const verdictOf = (answer: BoxAnswer) => (answer.ok ? { landed: answer.val?.revision_seq } : { refused: answer.err.refusalkind, carrying: answer.err.meta?.box_stored })

const PutCells = [
  // lands:
  [null,       null,        0, { landed: 0 },                                    'lands over no row, with no prior tok, at revision 0'],
  [goneRow,    'rev-x2',    3, { landed: 3 },                                    "lands over a tombstone under the prior tok, at its seq + 1"],
  [aliveRow,   'rev-a1',    2, { landed: 2 },                                    "lands over a live row under the prior tok, at its seq + 1"],
  [damagedRow, 'rev-d2',    3, { landed: 3 },                                    "lands over a damaged row under the prior tok, at its seq + 1"],
  // stale:
  [aliveRow,   'rev-other', 2, { refused: 'stale_write', carrying: aliveRow },   "refuses 'stale_write' over a row under another tok, carrying it"],
  [goneRow,    null,        0, { refused: 'stale_write', carrying: goneRow },    "refuses 'stale_write' with no prior tok over a tombstone, which is a row, carrying it"],
  [null,       'rev-a1',    2, { refused: 'stale_write', carrying: undefined },  "refuses 'stale_write' over no row where a prior tok is given, carrying nothing"],
  // inconsistent, a revision unfit for the prior tok or the row under it:
  [null,       null,        1, { refused: 'bad_record', carrying: undefined },   "refuses 'bad_record' no prior tok with a revision other than 0"],
  [aliveRow,   null,        2, { refused: 'bad_record', carrying: undefined },   "refuses 'bad_record' no prior tok with a revision other than 0 over a row, ahead of the stale_write"],
  [aliveRow,   'rev-a1',    0, { refused: 'bad_record', carrying: undefined },   "refuses 'bad_record' a prior tok with revision 0"],
  [null,       'rev-a1',    0, { refused: 'bad_record', carrying: undefined },   "refuses 'bad_record' a prior tok with revision 0 over no row, ahead of the stale_write"],
  [aliveRow,   'rev-a1',    3, { refused: 'bad_record', carrying: undefined },   "refuses 'bad_record' a revision past the row's seq + 1, under the prior tok"],
  [aliveRow,   'rev-a1',    1, { refused: 'bad_record', carrying: undefined },   "refuses 'bad_record' the row's own revision again, under the prior tok"],
] as const

describe("the fake store's put: the versioned replace, cell by cell", () => {
  for (const [stored, priorTok, revision_seq, verdict, blurb] of PutCells) {
    it(blurb, async () => {
      if (stored !== null) { held.mw.seedStore(stored) }
      const record = fullBoxRecord({ revision_tok: 'rev-put', revision_seq })
      expect(verdictOf(await held.mw.store.put(record, priorTok))).to.deep.equal(verdict)
      expect(held.mw.stored.get('anthropic_api_key')).to.deep.equal('landed' in verdict ? record : (stored ?? undefined))
    })
  }
})

const DelLandsCells = [
  [null,       null,        0, 'lands a tombstone at revision 0 over no row, with no prior tok, as it always has'],
  [aliveRow,   'rev-a1',    2, "lands a tombstone over a live row under the prior tok, at its seq + 1"],
  [goneRow,    'rev-x2',    3, "lands a tombstone over a tombstone under the prior tok, at its seq + 1"],
  [damagedRow, 'rev-d2',    3, "lands a tombstone over a damaged row under the prior tok, at its seq + 1"],
] as const

const DelRefusedCells = [
  [aliveRow,   'rev-other', aliveRow,  "refuses 'stale_write' over a row under another tok, carrying it"],
  [aliveRow,   null,        aliveRow,  "refuses 'stale_write' with no prior tok over a row, carrying it"],
  [null,       'rev-a1',    undefined, "refuses 'stale_write' over no row where a prior tok is given, carrying nothing"],
] as const

describe("the fake store's del: the versioned replace, cell by cell", () => {
  for (const [stored, priorTok, revision_seq, blurb] of DelLandsCells) {
    it(blurb, async () => {
      if (stored !== null) { held.mw.seedStore(stored) }
      const answer = await held.mw.store.del(scopeOf(), priorTok)
      expect(verdictOf(answer)).to.deep.equal({ landed: revision_seq })
      const kept = held.mw.stored.get('anthropic_api_key')
      expect(kept).to.deep.equal(answer.ok ? answer.val : null)
      expect(kept).to.include({ am: 'x' })
      expect(kept?.revision_tok).to.not.be.oneOf([priorTok, stored?.revision_tok])
    })
  }

  for (const [stored, priorTok, carrying, blurb] of DelRefusedCells) {
    it(blurb, async () => {
      if (stored !== null) { held.mw.seedStore(stored) }
      const answer = await held.mw.store.del(scopeOf(), priorTok)
      expect(verdictOf(answer)).to.deep.equal({ refused: 'stale_write', carrying })
      expect(held.mw.stored.get('anthropic_api_key')).to.deep.equal(stored ?? undefined)
    })
  }
})

describe("listing.put and listing.del: the prior tok they send", () => {
  it("refuses 'bad_record' a record at a revision other than 0 for a box not held, before storage is called", async () => {
    const listing = boxListingOf(held.mw)
    await TH.expectRefusal(listing.put(fullBoxRecord({ revision_seq: 1 })), 'bad_record')
    expect(held.mw.callsOf('put')).to.deep.equal([])
    expect(listing.things).to.deep.equal([])
  })

  it("refuses 'bad_record' a record at revision 0 over a box held, before storage is called", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.seedStore(aliveRow)
    const box = await listing.build(aliveRow)
    await TH.expectRefusal(listing.put(fullBoxRecord({ revision_tok: 'rev-a0', revision_seq: 0 })), 'bad_record')
    expect(held.mw.callsOf('put')).to.deep.equal([])
    expect(box.revision_tok).to.eq('rev-a1')
  })

  it("sends a record past central's seq + 1, which the store refuses 'bad_record', changing nothing", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.seedStore(aliveRow)
    const box = await listing.build(aliveRow)
    await TH.expectRefusal(listing.put(fullBoxRecord({ revision_tok: 'rev-a3', revision_seq: 3 })), 'bad_record')
    expect(held.mw.callsOf('put').map(({ priorTok }) => priorTok)).to.deep.equal(['rev-a1'])
    expect(held.mw.stored.get('anthropic_api_key')).to.deep.equal(aliveRow)
    expect(box.revision_seq).to.eq(1)
  })

  it("sends central's tok with the staged record, which lands at central's seq + 1", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.seedStore(aliveRow)
    const box = await listing.build(aliveRow)
    await box.send({ sidecar: { note: 'sent' } })
    expect(held.mw.callsOf('put').map(({ priorTok }) => priorTok)).to.deep.equal(['rev-a1'])
    expect(held.mw.stored.get('anthropic_api_key')).to.include({ revision_seq: 2, revision_tok: box.revision_tok })
  })

  it("meets 'stale_write' carrying nothing from a put and a del where the box held is stored no more, delivering nothing", async () => {
    const listing = boxListingOf(held.mw)
    const box = await listing.build(aliveRow)
    const putErr = await TH.expectRefusal(box.send({ sidecar: { note: 'sent' } }), 'stale_write')
    expect(putErr.meta).to.be.undefined
    const delErr = await TH.expectRefusal(box.del(), 'stale_write')
    expect(delErr.meta).to.be.undefined
    expect(keptOf(held.mw, box).central.revision_tok).to.eq('rev-a1')
    expect(held.mw.stored.size).to.eq(0)
  })

  it("meets a stored revision lower than the one held with 'stale_write' carrying it; the box judges it older and keeps its own, stuck there", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.seedStore(fullBoxRecord({ revision_tok: 'rev-a3', revision_seq: 3 }))
    const box = await listing.build(fullBoxRecord({ revision_tok: 'rev-a5', revision_seq: 5 }))
    await TH.expectRefusal(box.send({ sidecar: { note: 'once' } }), 'stale_write')
    await TH.expectRefusal(box.send({ sidecar: { note: 'twice' } }), 'stale_write')
    expect(keptOf(held.mw, box).central.revision_seq).to.eq(5)
    expect(held.mw.callsOf('put').map(({ priorTok }) => priorTok)).to.deep.equal(['rev-a5', 'rev-a5'])
    expect(held.mw.stored.get('anthropic_api_key')).to.include({ revision_tok: 'rev-a3' })
  })
})
// --

// == [The copy an instance hands in]: keepCopy at each settle, the cache saved at a delivery or a build

describe("listing.keepCopy: the copy each instance's settle hands in, saved to the cache by a delivery or a build only", () => {
  it("is handed a copy at an edit, which saves nothing to the cache: the box is not reached for it", async () => {
    const listing = boxListingOf(held.mw)
    const box = await listing.build(fullBoxRecord())
    held.mw.clearCalls()
    await box.edit({ sidecar: { note: 'staged' } })
    expect(keptOf(held.mw, box).staged).to.deep.include({ sidecar: { note: 'staged' } })
    expect(held.mw.callsOf('save')).to.deep.equal([])
  })

  it("saves the copy handed in at the delivery, which a later edit then leaves behind in the cache", async () => {
    const listing = boxListingOf(held.mw)
    const box = await listing.build(fullBoxRecord())
    await box.edit({ sidecar: { note: 'staged' } })
    const [saved] = held.mw.callsOf('save')
    expect(saved?.cacheable.staged).to.be.null
    expect(keptOf(held.mw, box).staged).to.not.be.null
  })

  it("is handed the copy of a revived instance too, and saves it nowhere: hello's revive saves nothing", async () => {
    const copy = { ...sparseBoxRecord(), central: fullBoxRecord(), staged: null }
    held.mw.seedCache(copy)
    const listing = boxListingOf(held.mw)
    await listing.hello()
    const box = listing.at(scopeOf(copy.boxlabel))
    expect(keptOf(held.mw, box)).to.deep.equal(copy)
    expect(held.mw.callsOf('save')).to.deep.equal([])
  })

  it("holds no way to the copy on an instance a host holds: no `cacheable` and no symbol-keyed method", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    expect(box).to.not.have.property('cacheable')
    expect(Object.getOwnPropertySymbols(box)).to.deep.equal([])
    expect(Object.getOwnPropertySymbols(Object.getPrototypeOf(box))).to.deep.equal([])
  })
})
// --
