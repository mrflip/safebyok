import { describe, expect, it } from 'vitest'
import { Box } from '../../src/models/box'
import { type BoxDna, type BoxListingOpts, BoxListing } from '../../src/models/box-listing'
import * as MSX from '../../src/models/models-shapes'
import { StubBoxKeyWrapped, StubWhisperCiphered } from '../../src/models/stub-seal'
import * as TH from '../test-helpers'
import { boxDnaOf, boxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'

const held = useModelsWorld()

const good = (): BoxListingOpts => ({ world: held.mw.world, store: held.mw.store, cache: held.mw.cache, maxMillisSinceRefresh: 1000 })

const dna = (boxlabel = 'anthropic_api_key') => boxDnaOf(held.mw.boxscope(boxlabel))

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
      expect(box._cheat_central.revision_seq).to.eq(MSX.NeverStoredSeq)
      expect(box._cheat_central.am).to.eq('x')
      expect(box._cheat_staged?.revision_seq).to.eq(0)
      expect(box._cheat_staged?.am).to.eq('a')
    })

    it("stamps the central and the draft with the clock's reading", async () => {
      held.mw.setNow(T0 + 5000)
      const box = await boxListingOf(held.mw).build(dna())
      expect(box.registered_at).to.eq(T0 + 5000)
      expect(box.written_at).to.eq(T0 + 5000)
      expect(box._cheat_central.registered_at).to.eq(T0 + 5000)
      expect(box._cheat_central.written_at).to.eq(T0 + 5000)
    })

    it("sends no prior tok to storage, being never stored", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(dna())
      expect(box.priorTok()).to.be.null
      expect(listing.priorTokOf(box.scope)).to.be.null
    })

    it("makes a box present, not full, with no sidecar to speak of, and puts it in the snapshot", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(dna())
      expect(box.isPresent).to.be.true
      expect(box.am).to.eq('a')
      expect(listing.snapshot).to.have.lengthOf(1)
      expect(listing.snapshot[0]).to.include({ boxlabel: 'anthropic_api_key' })
    })

    it("stores nothing, and calls nothing of the world or the store; it saves the draft to the cache, once", async () => {
      const box = await boxListingOf(held.mw).build(dna())
      expect(held.mw.calls.map(({ verb }) => verb)).to.deep.equal(['save'])
      expect(held.mw.callsOf('save')[0]?.cacheable).to.deep.include({ central: box._cheat_central, staged: box._cheat_staged })
      expect(held.mw.stored.size).to.eq(0)
    })

    it("fills the draft's defaults beside the dna's scope: the format, the vault's tok, an empty sidecar, sealed", async () => {
      const box = await boxListingOf(held.mw).build(dna())
      expect(box.fmt).to.eq(fullBoxRecord().fmt)
      expect(box.vault_tok).to.eq(held.mw.world.vault_tok)
      expect(box.isFull).to.be.true
      expect(box.sidecar).to.deep.equal({})
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
        const scope = held.mw.boxscope(record.boxlabel)
        const fetchingListing = boxListingOf(held.mw)
        await fetchingListing.fetch(scope, { ifAbsent: 'nil' })
        const fetched = fetchingListing.at(scope)
        const built   = await boxListingOf(held.mw).build(record)
        expect(fetched).to.not.be.null
        expect(built._cheat_central).to.deep.equal(fetched?._cheat_central)
        expect(built._cheat_staged).to.deep.equal(fetched?._cheat_staged)
        expect(built._cheat_central).to.deep.equal(record)
        expect(built._cheat_staged).to.be.null
      })
    }

    it("holds the box, in the snapshot, with nothing staged", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      expect(listing.at(box.scope)).to.eq(box)
      expect(box.hasStaged).to.be.false
      expect(box.isFull).to.be.true
      expect(box.priorTok()).to.equal('rev-a1')
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
    it("seals the whisper in at birth: the box is full at revision 0, and holds none of the whisper", async () => {
      const box = await boxListingOf(held.mw).build({ ...dna(), whisper: { key: 'sk-ant-secret' } })
      expect(box.isFull).to.be.true
      expect(box.revision_seq).to.eq(0)
      expect(JSON.stringify({ central: box._cheat_central, staged: box._cheat_staged })).to.not.include('sk-ant-secret')
    })
  })

  describe("listing.fetch(scope) answering a damaged record", () => {
    it("builds and holds a damaged box for a tombstone in the box's sparse form, for a box not yet held", async () => {
      const listing = boxListingOf(held.mw)
      const scope = held.mw.boxscope('anthropic_api_key')
      const damaged = tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }, 'd')
      expect(damaged).to.deep.equal({ ...sparseBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }), am: 'd' })
      held.mw.willGet(held.mw.answerOf(scope, damaged))
      expect(await listing.fetch(scope, { ifAbsent: 'nil' })).to.be.null
      const box = listing.at(scope)
      expect(box).to.be.instanceOf(Box)
      expect(box?.isPresent).to.be.false
      expect(box?.am).to.eq('d')
      expect(box?._cheat_central).to.deep.equal(damaged)
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

describe("BoxListing: build holds a dna to boxDna at its door", () => {
  it("refuses a one-letter boxlabel as 'bad_option', naming boxlabel, holding nothing and calling nothing", async () => {
    const listing = boxListingOf(held.mw)
    const err = await TH.expectRefusal(listing.build({ ...dna(), boxlabel: 'B' }), 'bad_option')
    expect(err.meta?.fieldnames).to.deep.equal(['boxlabel'])
    expect(listing.things).to.deep.equal([])
    expect(held.mw.calls).to.deep.equal([])
  })

  it("refuses a field a dna does not take as 'bad_option'", async () => {
    const listing = boxListingOf(held.mw)
    await TH.expectRefusal(listing.build({ ...dna(), sidcar: {} } as unknown as BoxDna), 'bad_option')
    expect(listing.things).to.deep.equal([])
  })

  it("refuses a bad whisper as 'bad_option' before the box is built", async () => {
    const listing = boxListingOf(held.mw)
    await TH.expectRefusal(listing.build({ ...dna(), whisper: null } as unknown as BoxDna), 'bad_option')
    expect(listing.things).to.deep.equal([])
  })

  it("ignores the props the factory controls: the box is born alive, in the world's vault, at revision 0, under the clock's time", async () => {
    held.mw.setNow(T0 + 5000)
    const box = await boxListingOf(held.mw).build({ ...dna(), am: 'x', vault_tok: 'vault-tok-other', revision_tok: 'rev-given', registered_at: T0, written_at: T0 })
    expect(box.am).to.eq('a')
    expect(box.isPresent).to.be.true
    expect(box.vault_tok).to.eq(held.mw.world.vault_tok)
    expect(box.revision_seq).to.eq(0)
    expect(box.revision_tok).to.not.eq('rev-given')
    expect(box.registered_at).to.eq(T0 + 5000)
  })

  it("refuses a factory prop that fails its check, though it would be ignored", async () => {
    await TH.expectRefusal(boxListingOf(held.mw).build({ ...dna(), fmt: 8 } as unknown as BoxDna), 'bad_option')
  })

  it("fills the draft's defaults for props given as undefined", async () => {
    const box = await boxListingOf(held.mw).build({ ...dna(), whisper_codec: undefined, whisper_schema_version: undefined })
    expect(box._cheat_staged).to.deep.include({ whisper_codec: 'json_v1', whisper_schema_version: 1 })
  })

  it("tells a record by its revision_seq, and leaves it to its own check: a record with a one-letter boxlabel refuses as the record's check says, not as 'bad_option'", async () => {
    const listing = boxListingOf(held.mw)
    const err = await TH.expectRefusal(listing.build(fullBoxRecord({ boxlabel: 'B' })), 'bad_scope')
    expect(err.meta?.fieldnames).to.deep.equal(['boxlabel'])
  })

  it("takes a dna carrying a revision_seq for a record, held to the record's check", async () => {
    await TH.expectRefusal(boxListingOf(held.mw).build({ ...dna(), revision_seq: 3 }), 'bad_record')
  })
})

const scope   = () => held.mw.boxscope('anthropic_api_key')
const gone    = () => tombstoneBoxRecord({ revision_seq: 2 })
const damaged = () => tombstoneBoxRecord({ revision_seq: 2 }, 'd')
/** The revision a stale_write says storage holds. */
const stored = { revision_tok: 'rev-s5', revision_seq: 5 }
/** A full box held, with an edit of its sidecar staged and the calls forgotten. */
const heldBox = async () => {
  const listing = boxListingOf(held.mw)
  const box = await listing.build(fullBoxRecord())
  await box.edit({ whisper: 'sk-test-0000', sidecar: { note: 'mine' } })
  held.mw.clearCalls()
  return { listing, box }
}


describe("BoxListing: an absent box", () => {
  describe("listing.fetch(scope) of nothing stored", () => {
    it("refuses 'absent_box' for a box not held, holding none", async () => {
      const listing = boxListingOf(held.mw)
      await TH.expectRefusal(listing.fetch(scope()), 'absent_box')
      expect(listing.at(scope())).to.be.null
      expect(held.mw.callsOf('save')).to.deep.equal([])
    })

    it("resolves null for a box not held under 'nil'", async () => {
      const listing = boxListingOf(held.mw)
      expect(await listing.fetch(scope(), { ifAbsent: 'nil' })).to.be.null
      expect(listing.at(scope())).to.be.null
    })

    it("refuses 'absent_box' for a box held gone, which has received the answer and settled", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(gone())
      held.mw.clearCalls()
      await TH.expectRefusal(listing.fetch(scope()), 'absent_box')
      expect(listing.at(scope())).to.eq(box)
      expect(box.isPresent).to.be.false
      expect(held.mw.callsOf('save')).to.have.lengthOf(1)
    })

    it("resolves null for a box held gone under 'nil', the box still at `at(scope)` as its tombstone", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(gone())
      expect(await listing.fetch(scope(), { ifAbsent: 'nil' })).to.be.null
      expect(listing.at(scope())).to.eq(box)
      expect(box.am).to.eq('x')
      expect(box._cheat_central).to.deep.equal(gone())
    })

    it("refuses 'absent_box' for a draft, which stays held and present with its draft staged", async () => {
      const listing = boxListingOf(held.mw)
      const draft = await listing.build(boxDnaOf(scope()))
      await TH.expectRefusal(listing.fetch(scope()), 'absent_box')
      expect(listing.at(scope())).to.eq(draft)
      expect(draft.isPresent).to.be.true
      expect(draft.hasStaged).to.be.true
      expect(await listing.fetch(scope(), { ifAbsent: 'nil' })).to.be.null
    })

    it("takes the world of the answer before it refuses", async () => {
      held.mw.willGet(held.mw.answerOf(scope(), null, 'a world'))
      await TH.expectRefusal(boxListingOf(held.mw).fetch(scope()), 'absent_box')
      expect(held.mw.callsOf('takeWorld')).to.deep.equal([{ verb: 'takeWorld', world: 'a world' }])
    })
  })

  describe("listing.fetch(scope) of a stored tombstone", () => {
    for (const [form, tombstone, am] of [['deleted', gone, 'x'], ['damaged', damaged, 'd']] as const) {
      it(`refuses 'absent_box' for a ${form} box, built and held as its tombstone, saved to the cache`, async () => {
        held.mw.seedStore(tombstone())
        const listing = boxListingOf(held.mw)
        await TH.expectRefusal(listing.fetch(scope()), 'absent_box')
        const box = listing.at(scope())
        expect(box).to.be.instanceOf(Box)
        expect(box?.am).to.eq(am)
        expect(box?.isPresent).to.be.false
        expect(held.mw.callsOf('save')).to.have.lengthOf(1)
        expect(held.mw.cached.get('anthropic_api_key')?.central).to.deep.equal(tombstone())
        expect(listing.snapshot).to.deep.equal([])
      })

      it(`resolves null for a ${form} box under 'nil', held all the same`, async () => {
        held.mw.seedStore(tombstone())
        const listing = boxListingOf(held.mw)
        expect(await listing.fetch(scope(), { ifAbsent: 'nil' })).to.be.null
        expect(listing.at(scope())?.am).to.eq(am)
      })

      it(`takes a ${form} box held alive away, then refuses 'absent_box'`, async () => {
        const listing = boxListingOf(held.mw)
        const box = await listing.build(fullBoxRecord())
        held.mw.seedStore(tombstone())
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
      held.mw.seedStore(sparseBoxRecord())
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

    it("has the trigger's scheduled refresh pass 'nil' too: no refusal escapes when a box is lost in storage", async () => {
      const listing = boxListingOf(held.mw, { maxMillisSinceRefresh: 1000 })
      const box = await listing.build(fullBoxRecord())
      held.mw.seedStore(gone())
      await held.mw.advance(5000)
      expect(box.isPresent).to.be.false
      expect(held.mw.callsOf('get').length).to.be.greaterThan(0)
    })
  })

  describe("listing.build(tombstone)", () => {
    it("holds a gone instance: not present, no sidecar, absent from the snapshot, saved to the cache as its tombstone", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(gone())
      expect(listing.at(scope())).to.eq(box)
      expect(box.isPresent).to.be.false
      expect(box.am).to.eq('x')
      expect(box.sidecar).to.be.null
      expect(listing.snapshot).to.deep.equal([])
      expect(held.mw.callsOf('save')).to.have.lengthOf(1)
      expect(held.mw.cached.get('anthropic_api_key')?.central).to.deep.equal(gone())
    })

    it("holds a damaged instance the same way", async () => {
      const box = await boxListingOf(held.mw).build(damaged())
      expect(box.am).to.eq('d')
      expect(box.isPresent).to.be.false
    })
  })

  describe("a refused answer carrying what storage holds", () => {
    it("delivers a full box_stored to the box, then throws 'stale_write'", async () => {
      const { listing, box } = await heldBox()
      const record = fullBoxRecord({ ...stored, sidecar: { note: 'theirs' } })
      const stale = held.mw.staleWriteOf(box.scope, record)
      held.mw.willPut(stale)
      await TH.expectRefusal(listing.put(box), 'stale_write')
      expect(box.revision_seq).to.eq(5)
      expect(box.isFull).to.be.true
      expect(box.sidecar).to.deep.equal({ note: 'theirs' })
      expect(box.hasStaged).to.be.false
      expect(held.mw.callsOf('save')).to.have.lengthOf(1)
      expect(held.mw.callsOf('save')[0]?.cacheable).to.deep.include({ central: box._cheat_central, staged: box._cheat_staged })
    })

    it("delivers a sparse box_stored to the box, which holds no sidecar to speak of, then throws 'stale_write'", async () => {
      const { listing, box } = await heldBox()
      const stale = held.mw.staleWriteOf(box.scope, sparseBoxRecord(stored))
      held.mw.willPut(stale)
      await TH.expectRefusal(listing.put(box), 'stale_write')
      expect(box.revision_seq).to.eq(5)
      expect(box.isFull).to.be.false
      expect(box.sidecar).to.be.null
      expect(held.mw.callsOf('save')).to.have.lengthOf(1)
    })

    it("delivers a box_stored that is a tombstone, then throws 'stale_write' rather than 'absent_box'", async () => {
      const { listing, box } = await heldBox()
      const stale = held.mw.staleWriteOf(box.scope, tombstoneBoxRecord(stored))
      held.mw.willPut(stale)
      await TH.expectRefusal(listing.put(box), 'stale_write')
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
      await TH.expectRefusal(listing.put(box), 'stale_write')
      expect(box._cheat_central.revision_seq).to.eq(1)
      expect(box.hasStaged).to.be.true
      expect(held.mw.callsOf('save')).to.deep.equal([])
    })

    it("throws 'stale_write' with nothing delivered for a box_stored of null", async () => {
      const { listing, box } = await heldBox()
      const stale = held.mw.staleWriteOf(box.scope, null)
      held.mw.willPut(stale)
      await TH.expectRefusal(listing.put(box), 'stale_write')
      expect(held.mw.callsOf('save')).to.deep.equal([])
    })

    it("throws 'stale_write' with nothing delivered for a box_stored that fails its check", async () => {
      const { listing, box } = await heldBox()
      const stale = held.mw.staleWriteOf(box.scope, { junk: 1 } as never)
      held.mw.willPut(stale)
      await TH.expectRefusal(listing.put(box), 'stale_write')
      expect(box._cheat_central.revision_seq).to.eq(1)
      expect(held.mw.callsOf('save')).to.deep.equal([])
    })

    it("delivers box_stored to a box not yet held, building it", async () => {
      const listing = boxListingOf(held.mw)
      const stale = held.mw.staleWriteOf(scope(), fullBoxRecord(stored))
      held.mw.willPut(stale)
      await TH.expectRefusal(listing.put(fullBoxRecord({ revision_seq: 0 })), 'stale_write')
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

  it("shows a box built from a dna as its draft, not as the central never stored", async () => {
    const listing = boxListingOf(held.mw)
    const draft = await listing.build(boxDnaOf(scope()))
    const [shown] = listing.snapshot
    expect(shown).to.eq(draft.snapshot)
    expect(shown).to.include({ boxlabel: 'anthropic_api_key', revision_seq: 0, present: true, full: true })
    expect(shown?.revision_seq).to.not.eq(MSX.NeverStoredSeq)
  })

  it("shows a box sparse as its snapshot does: present, not full, no sidecar", async () => {
    const listing = boxListingOf(held.mw)
    await listing.build(sparseBoxRecord())
    expect(listing.snapshot[0]).to.include({ present: true, full: false, sidecar: null })
  })

  it("follows the box through an edit: the listing shows the sidecar `box.sidecar` now gives", async () => {
    const listing = boxListingOf(held.mw)
    const box = await listing.build(fullBoxRecord({ sidecar: { uncle: 'Bob' } }))
    await box.edit({ whisper: 'sk-test-0000', sidecar: { uncle: 'Robert' } })
    expect(box.sidecar).to.deep.equal({ uncle: 'Robert' })
    expect(listing.snapshot[0]?.sidecar).to.deep.equal({ uncle: 'Robert' })
  })
})

// == [A dna carrying revision_seq]: build

describe("boxListing.build(dna): a revision_seq makes it a record", () => {
  it("refuses 'bad_record' for a dna with a whisper and a revision_seq, holding and sealing nothing", async () => {
    const listing = boxListingOf(held.mw)
    const dna = { ...held.mw.boxscope('anthropic_api_key'), whisper: 'sk-test-0000', sidecar: {}, revision_seq: 3 }
    await TH.expectRefusal(listing.build(dna), 'bad_record')
    expect(listing.things).to.deep.equal([])
    expect(held.mw.callsOf('save')).to.deep.equal([])
  })
})
// --

// == [Sealed at birth]: build, boxDna, the stub seal

describe("boxListing.build(dna): the box is sealed at birth", () => {
  it("stages a full record at revision 0 over the central never stored, its sealed parts the stub's", async () => {
    const box = await boxListingOf(held.mw).build(dna())
    expect(box.isFull).to.be.true
    expect(box.hasStaged).to.be.true
    expect(box.revision_seq).to.eq(0)
    expect(box.priorTok()).to.be.null
    expect(box.box_key_wrapped).to.deep.equal(StubBoxKeyWrapped)
    expect(box.whisper_ciphered).to.deep.equal(StubWhisperCiphered)
    expect(box._cheat_central).to.include({ revision_seq: MSX.NeverStoredSeq, am: 'x' })
  })

  it("keeps the central never stored sparse: the sealed parts and the sidecar ride only on the staged", async () => {
    const box = await boxListingOf(held.mw).build({ ...dna(), sidecar: { account: 'work' } })
    expect(box._cheat_central).to.not.have.any.keys('sidecar', 'box_key_wrapped', 'whisper_ciphered')
  })

  it("seals the dna's sidecar in beside the whisper", async () => {
    const box = await boxListingOf(held.mw).build({ ...dna(), sidecar: { account: 'work' }, whisper: 'sk-test-0000' })
    expect(box.sidecar).to.deep.equal({ account: 'work' })
    expect(box.isFull).to.be.true
  })

  it("calls nothing of the store: it saves the sealed box to the cache, once", async () => {
    const box = await boxListingOf(held.mw).build({ ...dna(), whisper: 'sk-test-0000' })
    expect(held.mw.calls.map(({ verb }) => verb)).to.deep.equal(['save'])
    expect(held.mw.callsOf('save')[0]?.cacheable.staged).to.deep.equal(box._cheat_staged)
  })

  it("sends as it is built: the record put is full, at revision 0, expecting nothing stored", async () => {
    const box = await boxListingOf(held.mw, { maxMillisSinceRefresh: Infinity }).build(dna())
    await box.send({ whisper: 'sk-test-0000', sidecar: {} })
    const [put] = held.mw.callsOf('put')
    expect(put?.priorTok).to.be.null
    expect(put?.record).to.include({ revision_seq: 0, am: 'a' })
    expect(MSX.boxRecord.parse(put?.record)).to.deep.equal(put?.record)
  })

  it("refuses 'vault_locked' while the vault is locked, holding, saving and sealing nothing", async () => {
    held.mw.setLockState('locked')
    const listing = boxListingOf(held.mw)
    await TH.expectRefusal(listing.build({ ...dna(), whisper: 'sk-test-0000' }), 'vault_locked')
    expect(listing.things).to.deep.equal([])
    expect(held.mw.calls).to.deep.equal([])
  })

  it("builds a record while the vault is locked, as a record needs no seal", async () => {
    held.mw.setLockState('locked')
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    expect(box.revision_seq).to.eq(1)
  })

  it("refuses 'bad_option' a dna carrying sealed parts, holding nothing", async () => {
    const listing = boxListingOf(held.mw)
    const { box_key_wrapped, whisper_ciphered } = fullBoxRecord()
    await TH.expectRefusal(listing.build({ ...dna(), box_key_wrapped, whisper_ciphered }), 'bad_option')
    expect(listing.things).to.deep.equal([])
  })
})

describe("boxListing.build(dna): no secret material", () => {
  it("leaves none of the whisper in the record in hand, the cache's copy, the snapshots or the listing", async () => {
    const listing = boxListingOf(held.mw)
    const box = await listing.build({ ...dna(), whisper: { key: 'sk-test-SECRET' } })
    for (const form of [box.toJSON(), { central: box._cheat_central, staged: box._cheat_staged }, box.snapshot, listing.snapshot, held.mw.callsOf('save')]) {
      expect(JSON.stringify(form)).to.not.include('SECRET')
    }
    expect(box.whisper).to.be.null
  })

  it("seals the same placeholders whatever the whisper", async () => {
    const listing = boxListingOf(held.mw)
    const one = await listing.build({ ...dna('one_box'), whisper: 'sk-test-one' })
    const other = await listing.build({ ...dna('other_box'), whisper: 'sk-test-other' })
    expect(one.whisper_ciphered).to.deep.equal(other.whisper_ciphered)
    expect(one.box_key_wrapped).to.deep.equal(other.box_key_wrapped)
  })
})
// --

// == [A whisper and a sidecar at birth]: build, boxDna

describe("boxListing.build(dna): a whisper and a sidecar, both required", () => {
  const DnaCases = [
    [{ whisper: undefined },                     ["whisper"],            'a whisper given as undefined'],
    [{ sidecar: undefined },                     ["sidecar"],            'a sidecar given as undefined'],
    [{ whisper: undefined, sidecar: undefined }, ["sidecar", "whisper"], 'neither'],
  ] as const

  for (const [lacks, fieldnames, blurb] of DnaCases) {
    it(`refuses a dna with ${blurb} as 'bad_option', naming the field, holding, saving and sealing nothing`, async () => {
      const listing = boxListingOf(held.mw)
      const err = await TH.expectRefusal(listing.build({ ...dna(), ...lacks } as unknown as BoxDna), 'bad_option')
      expect(err.meta?.fieldnames).to.have.members([...fieldnames])
      expect(listing.things).to.deep.equal([])
      expect(held.mw.calls).to.deep.equal([])
    })
  }

  it("refuses a dna of the scope alone as 'bad_option'", async () => {
    const listing = boxListingOf(held.mw)
    await TH.expectRefusal(listing.build(held.mw.boxscope('anthropic_api_key') as unknown as BoxDna), 'bad_option')
    expect(listing.things).to.deep.equal([])
  })
})
// --
