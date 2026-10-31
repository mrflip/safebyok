import { describe, expect, it } from 'vitest'
import { Box } from '../../src/models/box'
import { type BoxListingOpts, BoxListing } from '../../src/models/box-listing'
import * as MSX from '../../src/models/models-shapes'
import * as TH from '../test-helpers'
import { boxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'

const held = useModelsWorld()

const good = (): BoxListingOpts => ({ world: held.mw.world, store: held.mw.store, cache: held.mw.cache, maxMillisSinceRefresh: 1000 })

const dna = (boxlabel = 'anthropic_api_key') => ({ ...held.mw.boxscope(boxlabel) })

describe("BoxListing", () => {
  describe("new BoxListing(opts)", () => {
    it("makes a listing of a world, a store, a cache and a horizon, calling none of them", () => {
      const listing = new BoxListing(good())
      expect(listing).to.be.instanceOf(BoxListing)
      expect(listing.things).to.deep.equal([])
      expect(listing.snapshot).to.deep.equal([])
      expect(held.mw.calls).to.deep.equal([])
    })

    const bads: readonly (readonly [blurb: string, patch: () => object])[] = [
      ['no world',                    () => ({ world: undefined })],
      ['a world without a clock',     () => ({ world: { ...held.mw.world, clock: undefined } })],
      ['no store',                    () => ({ store: undefined })],
      ['a store without a watch',     () => ({ store: { ...held.mw.store, watch: undefined } })],
      ['no cache',                    () => ({ cache: undefined })],
      ['no horizon',                  () => ({ maxMillisSinceRefresh: undefined })],
      ['a negative horizon',          () => ({ maxMillisSinceRefresh: -1 })],
      ['an onBadNews not a function', () => ({ onBadNews: 'tell me' })],
    ]
    for (const [blurb, patch] of bads) {
      it(`refuses ${blurb} as 'bad_option'`, () => {
        TH.expectSyncRefusal(() => new BoxListing({ ...good(), ...patch() }), 'bad_option')
      })
    }
  })

  describe("listing.build(dna)", () => {
    it("holds a box born never stored: the central at NeverStoredSeq, the draft staged at revision 0", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(dna())
      expect(box).to.be.instanceOf(Box)
      expect(listing.at(box.scope)).to.eq(box)
      expect(box.hasStaged).to.be.true
      expect(box.revision_seq).to.eq(0)
      expect(box.cacheable.central.revision_seq).to.eq(MSX.NeverStoredSeq)
      expect(box.cacheable.central.am).to.eq('x')
      expect(box.cacheable.staged?.revision_seq).to.eq(0)
      expect(box.cacheable.staged?.am).to.eq('a')
    })

    it("stamps the central and the draft with the clock's reading", async () => {
      held.mw.setNow(T0 + 5000)
      const box = await boxListingOf(held.mw).build(dna())
      expect(box.registered_at).to.eq(T0 + 5000)
      expect(box.written_at).to.eq(T0 + 5000)
      expect(box.cacheable.central.registered_at).to.eq(T0 + 5000)
      expect(box.cacheable.central.written_at).to.eq(T0 + 5000)
    })

    it("expects no revision of storage, being never stored", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(dna())
      expect(box.expectedRevision()).to.be.null
      expect(listing.expectedRevisionOf(box.scope)).to.be.null
    })

    it("makes a box present, not full, with no sidecar to speak of, and puts it in the snapshot", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(dna())
      expect(box.isPresent).to.be.true
      expect(box.am).to.eq('a')
      expect(listing.snapshot).to.have.lengthOf(1)
      expect(listing.snapshot[0]).to.include({ boxlabel: 'anthropic_api_key' })
    })

    it("stores nothing, and calls nothing of the world, the store or the cache", async () => {
      await boxListingOf(held.mw).build(dna())
      expect(held.mw.calls).to.deep.equal([])
      expect(held.mw.stored.size).to.eq(0)
    })

    it("fills the draft's defaults beside the dna's scope: the format, the vault's tok, no sidecar before a seal", async () => {
      const box = await boxListingOf(held.mw).build(dna())
      expect(box.fmt).to.eq(fullBoxRecord().fmt)
      expect(box.vault_tok).to.eq(held.mw.world.vault_tok)
      expect(box.isFull).to.be.false
      expect(box.sidecar).to.be.null
    })

    it("tells the listener of the snapshot once", async () => {
      const listing = boxListingOf(held.mw)
      let told = 0
      listing.subscribe(() => { told += 1 })
      await listing.build(dna())
      expect(told).to.eq(1)
    })

    it("builds two boxes, each held under its own boxlabel", async () => {
      const listing = boxListingOf(held.mw)
      const one = await listing.build(dna('one'))
      const two = await listing.build(dna('two'))
      expect(listing.things).to.deep.equal([one, two])
      expect(listing.snapshot.map(({ boxlabel }) => boxlabel)).to.have.members(['one', 'two'])
    })
  })

  describe("listing.build(record)", () => {
    const records = {
      full:    fullBoxRecord(),
      sparse:  sparseBoxRecord(),
      gone:    tombstoneBoxRecord({ revision_seq: 2 }),
      damaged: tombstoneBoxRecord({ revision_seq: 2 }, 'd'),
    }

    for (const [form, record] of Object.entries(records)) {
      it(`equals a fetch delivering the same ${form} record, by cacheable`, async () => {
        held.mw.seedStore(record)
        const fetched = await boxListingOf(held.mw).fetch(held.mw.boxscope(record.boxlabel))
        const built   = await boxListingOf(held.mw).build(record)
        expect(fetched).to.not.be.null
        expect(built.cacheable).to.deep.equal(fetched?.cacheable)
        expect(built.cacheable.central).to.deep.equal(record)
        expect(built.cacheable.staged).to.be.null
      })
    }

    it("holds the box, in the snapshot, with nothing staged", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      expect(listing.at(box.scope)).to.eq(box)
      expect(box.hasStaged).to.be.false
      expect(box.isFull).to.be.true
      expect(box.expectedRevision()).to.deep.equal({ revision_tok: 'rev-a1', revision_seq: 1 })
      expect(listing.snapshot).to.have.lengthOf(1)
    })

    it("saves the box to the cache, as a fetch's answer does", async () => {
      await boxListingOf(held.mw).build(fullBoxRecord())
      expect(held.mw.callsOf('save')).to.have.lengthOf(1)
      expect(held.mw.cached.get('anthropic_api_key')?.central).to.deep.equal(fullBoxRecord())
    })

    it("hands a record to the box already held, which receives it", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      const again = await listing.build(fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 }))
      expect(again).to.eq(box)
      expect(box.revision_seq).to.eq(2)
    })
  })

  describe("listing.build(dna with a whisper)", () => {
    it("seals the whisper in once the box is built, and so reaches the seal, which is not yet written", async () => {
      const listing = boxListingOf(held.mw)
      const err = await TH.expectRefusal(listing.build({ ...dna(), whisper: { key: 'sk-ant-secret' } }), 'unexpected_error')
      expect(err.message).to.not.include('sk-ant-secret')
    })

    it("builds a dna whose whisper is undefined as it would one with none", async () => {
      const box = await boxListingOf(held.mw).build({ ...dna(), whisper: undefined })
      expect(box.hasStaged).to.be.true
      expect(box.revision_seq).to.eq(0)
    })
  })

  describe("listing.fetch(scope) answering a damaged record", () => {
    it("builds and holds a damaged box for a tombstone in the box's sparse form, for a box not yet held", async () => {
      const listing = boxListingOf(held.mw)
      const scope = held.mw.boxscope('anthropic_api_key')
      const damaged = tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }, 'd')
      expect(damaged).to.deep.equal({ ...sparseBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }), am: 'd' })
      held.mw.willGet(held.mw.answerOf(scope, damaged))
      const box = await listing.fetch(scope)
      expect(box).to.be.instanceOf(Box)
      expect(listing.at(scope)).to.eq(box)
      expect(box?.isPresent).to.be.false
      expect(box?.am).to.eq('d')
      expect(box?.cacheable.central).to.deep.equal(damaged)
    })

    it("refuses a tombstone of only the scope, vault_tok, revision and times as 'bad_record' at the box's sparse form, though the base's answer check passes it", async () => {
      const listing = boxListingOf(held.mw)
      const scope = held.mw.boxscope('anthropic_api_key')
      const { vault_tok, revision_tok, registered_at, written_at } = fullBoxRecord()
      const bare = { ...scope, vault_tok, am: 'd', revision_tok, revision_seq: 2, registered_at, written_at }
      const answer = { scope, ok: true, val: bare, world: null }
      expect(() => MSX.answer.parse(answer)).to.not.throw()
      held.mw.willGet(answer)
      await TH.expectRefusal(listing.fetch(scope), 'bad_record')
      expect(listing.at(scope)).to.be.null
    })
  })
})
