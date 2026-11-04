import { describe, expect, it } from 'vitest'
import { Box } from '../../src/models/box'
import { type BoxDna, type BoxListingOpts, BoxListing } from '../../src/models/box-listing'
import * as MSX from '../../src/models/models-shapes'
import * as TH from '../test-helpers'
import { FakeBoxKeyWrapped, FakeWhisperCiphered, boxDnaOf, boxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'

const held = useModelsWorld()

const good = (): BoxListingOpts => ({ world: held.mw.world, vaultDB: held.mw.vaultDB, maxMillisSinceRefresh: 1000 })

const dna = (boxlabel = 'anthropic_api_key') => boxDnaOf(held.mw.boxscope(boxlabel))

describe("BoxListing", () => {
  describe("new BoxListing(opts)", () => {
    it("makes a listing of a world, a store and a horizon, calling none of them", () => {
      const listing = new BoxListing(good())
      expect(listing).to.be.instanceOf(BoxListing)
      expect(listing.things).to.deep.equal([])
      expect(listing.snapshot).to.deep.equal([])
      expect(held.mw.calls).to.deep.equal([])
    })

    const bads: readonly (readonly [blurb: string, patch: () => object])[] = [
      ['no world',                    () => ({ world: undefined })],
      ['a world without a clock',     () => ({ world: { ...held.mw.world, clock: undefined } })],
      ['no vaultDB',                  () => ({ vaultDB: undefined })],
      ['a vaultDB without its verbs', () => ({ vaultDB: { watch: () => null } })],
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

  describe("listing.create(dna)", () => {
    it("holds a box of the record it stored, at revision 0, once it lands", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.create(dna())
      expect(box).to.be.instanceOf(Box)
      expect(listing.at(box.scope)).to.eq(box)
      expect(box.revision_seq).to.eq(0)
      expect(box._cheat_central.am).to.eq('a')
      expect(held.mw.stored.get('anthropic_api_key')).to.deep.equal(box._cheat_central)
    })

    it("stamps the record with the clock's reading", async () => {
      held.mw.setNow(T0 + 5000)
      const box = await boxListingOf(held.mw).create(dna())
      expect(box.registered_at).to.eq(T0 + 5000)
      expect(box.written_at).to.eq(T0 + 5000)
    })

    it("makes a box present and puts it in the snapshot", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.create(dna())
      expect(box.isPresent).to.be.true
      expect(box.am).to.eq('a')
      expect(listing.snapshot).to.have.lengthOf(1)
      expect(listing.snapshot[0]).to.include({ boxlabel: 'anthropic_api_key' })
    })

    it("refreshes the world at each guard, puts once, and fetches nothing, then takes the world", async () => {
      await boxListingOf(held.mw).create(dna())
      expect(held.mw.calls.map(({ verb }) => verb)).to.deep.equal(['ensureTimely', 'ensureTimely', 'put', 'takeWorld'])
    })

    it("holds nothing where the put is refused with no record, and leaves the scope free for another create", async () => {
      const listing = boxListingOf(held.mw)
      held.mw.willPut(held.mw.staleWriteOf(scope(), undefined))
      await TH.expectRefusal(listing.create(dna()), 'stale_write')
      expect(listing.at(scope())).to.be.null
      expect(listing.snapshot).to.deep.equal([])
      const again = await listing.create(dna())
      expect(again.revision_seq).to.eq(0)
    })

    it("holds what storage holds where the put meets it, delivered before 'stale_write' is thrown", async () => {
      const listing = boxListingOf(held.mw)
      held.mw.seedStore(fullBoxRecord(stored))
      await TH.expectRefusal(listing.create(dna()), 'stale_write')
      expect(listing.at(scope())?.revision_seq).to.eq(5)
    })

    it("refuses 'bad_option' a dna naming another vault, sealing and storing nothing", async () => {
      const listing = boxListingOf(held.mw)
      await TH.expectRefusal(listing.create({ ...dna(), vaultlabel: 'another_vault' }), 'bad_option')
      expect(listing.things).to.deep.equal([])
      expect(held.mw.calls.map(({ verb }) => verb)).to.deep.equal(['ensureTimely'])
    })

    it("refuses 'bad_option' a scope already held, sealing and storing nothing", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.create(dna())
      held.mw.clearCalls()
      await TH.expectRefusal(listing.create(dna()), 'bad_option')
      expect(held.mw.calls.map(({ verb }) => verb)).to.deep.equal(['ensureTimely'])
      expect(listing.at(box.scope)).to.eq(box)
    })

    it("fills the record's defaults beside the dna's scope: the format, the vault's tok, an empty sidecar, sealed", async () => {
      const box = await boxListingOf(held.mw).create(dna())
      expect(box.fmt).to.eq(fullBoxRecord().fmt)
      expect(box.vault_tok).to.eq(held.mw.world.vault_tok)
      expect(box.isFull).to.be.true
      expect(box.sidecar).to.deep.equal({})
    })

    it("tells the listener of the snapshot once", async () => {
      const listing = boxListingOf(held.mw)
      let told = 0
      listing.subscribe(() => { told += 1 })
      await listing.create(dna())
      expect(told).to.eq(1)
    })

    it("creates two boxes, each held under its own boxlabel", async () => {
      const listing = boxListingOf(held.mw)
      const one = await listing.create(dna('one'))
      const two = await listing.create(dna('two'))
      expect(listing.things).to.deep.equal([one, two])
      expect(listing.snapshot.map(({ boxlabel }) => boxlabel)).to.have.members(['one', 'two'])
    })
  })

  describe("listing.build(record)", () => {
    const records = {
      full:    fullBoxRecord(),
      sparse:  sparseBoxRecord(),
      gone:    tombstoneBoxRecord({ revision_seq: 2 }),
    }

    for (const [form, record] of Object.entries(records)) {
      it(`equals a fetch delivering the same ${form} record`, async () => {
        const scope = held.mw.boxscope(record.boxlabel)
        held.mw.willGet(held.mw.answerOf(scope, record))
        const fetchingListing = boxListingOf(held.mw)
        await fetchingListing.fetch(scope, { ifAbsent: 'nil' })
        const fetched = fetchingListing.at(scope)
        const built   = await boxListingOf(held.mw).build(record)
        expect(fetched).to.not.be.null
        expect(built._cheat_central).to.deep.equal(fetched?._cheat_central)
        expect(built._cheat_central).to.deep.equal(record)
      })
    }

    it("holds the box, in the snapshot", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      expect(listing.at(box.scope)).to.eq(box)
      expect(box.isFull).to.be.true
      expect(listing.snapshot).to.have.lengthOf(1)
    })

    it("refuses 'bad_record' a dna, which is no record, holding and storing nothing", async () => {
      const listing = boxListingOf(held.mw)
      await TH.expectRefusal(listing.build(dna() as never), 'bad_record')
      expect(listing.things).to.deep.equal([])
      expect(held.mw.calls).to.deep.equal([])
    })

    it("hands a record to the box already held, which receives it", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      const again = await listing.build(fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 }))
      expect(again).to.eq(box)
      expect(box.revision_seq).to.eq(2)
    })
  })

  describe("listing.create(dna with a whisper)", () => {
    it("seals the whisper in at birth: the box is full at revision 0, and holds none of the whisper", async () => {
      const box = await boxListingOf(held.mw).create({ ...dna(), whisper: { val: { key: 'sk-ant-secret' } } })
      expect(box.isFull).to.be.true
      expect(box.revision_seq).to.eq(0)
      expect(JSON.stringify(box._cheat_central)).to.not.include('sk-ant-secret')
    })
  })

})

describe("BoxListing: create holds a dna to boxDna at its door", () => {
  it("refuses a one-letter boxlabel as 'bad_option', naming boxlabel, holding nothing and calling nothing", async () => {
    const listing = boxListingOf(held.mw)
    const err = await TH.expectRefusal(listing.create({ ...dna(), boxlabel: 'B' }), 'bad_option')
    expect(err.meta?.fieldnames).to.deep.equal(['boxlabel'])
    expect(listing.things).to.deep.equal([])
    expect(held.mw.calls).to.deep.equal([])
  })

  it("refuses a field a dna does not take as 'bad_option'", async () => {
    const listing = boxListingOf(held.mw)
    await TH.expectRefusal(listing.create({ ...dna(), sidcar: {} } as unknown as BoxDna), 'bad_option')
    expect(listing.things).to.deep.equal([])
  })

  it("refuses a bad whisper as 'bad_option' before the box is built", async () => {
    const listing = boxListingOf(held.mw)
    await TH.expectRefusal(listing.create({ ...dna(), whisper: null } as unknown as BoxDna), 'bad_option')
    expect(listing.things).to.deep.equal([])
  })

  it("ignores the props the factory controls: the box is born alive, in the world's vault, at revision 0, under the clock's time", async () => {
    held.mw.setNow(T0 + 5000)
    const box = await boxListingOf(held.mw).create({ ...dna(), am: 'x' as never, vault_tok: 'vault-tok-other', box_tok: 'box-tok-given', revision_tok: 'rev-given', registered_at: T0, written_at: T0 })
    expect(box.am).to.eq('a')
    expect(box.box_tok).to.be.a('string').and.not.eq('box-tok-given')
    expect(box.isPresent).to.be.true
    expect(box.vault_tok).to.eq(held.mw.world.vault_tok)
    expect(box.revision_seq).to.eq(0)
    expect(box.revision_tok).to.not.eq('rev-given')
    expect(box.registered_at).to.eq(T0 + 5000)
  })

  it("refuses a revision_seq in the dna, as the factory has none to give", async () => {
    await TH.expectRefusal(boxListingOf(held.mw).create({ ...dna(), revision_seq: 3 }), 'bad_option')
  })

  it("gives each box born a box_tok of its own, its birthday gift", async () => {
    const listing = boxListingOf(held.mw)
    const one = await listing.create(dna())
    const two = await listing.create({ ...dna(), boxlabel: 'openai_api_key' })
    expect(one._cheat_central).to.have.property('box_tok').that.is.a('string')
    expect(one.box_tok).to.not.eq(two.box_tok)
  })

  it("refuses a factory prop that fails its check, though it would be ignored", async () => {
    await TH.expectRefusal(boxListingOf(held.mw).create({ ...dna(), fmt: 8 } as unknown as BoxDna), 'bad_option')
  })

  it("fills the record's defaults for props given as undefined", async () => {
    const box = await boxListingOf(held.mw).create({ ...dna(), whisper_codec: undefined, whisper_schema_version: undefined })
    expect(box._cheat_central).to.deep.include({ whisper_codec: 'json_v1', whisper_schema_version: 1 })
  })
})

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
      await TH.expectRefusal(listing.put(box, box), 'stale_write')
      expect(box.revision_seq).to.eq(5)
      expect(box.isFull).to.be.true
      expect(box.sidecar).to.deep.equal({ note: 'theirs' })
    })

    it("delivers a sparse box_stored to the box, which holds no sidecar to speak of, then throws 'stale_write'", async () => {
      const { listing, box } = await heldBox()
      const stale = held.mw.staleWriteOf(box.scope, sparseBoxRecord(stored))
      held.mw.willPut(stale)
      await TH.expectRefusal(listing.put(box, box), 'stale_write')
      expect(box.revision_seq).to.eq(5)
      expect(box.isFull).to.be.false
      expect(box.sidecar).to.be.null
    })

    it("delivers a box_stored that is a tombstone, then throws 'stale_write' rather than 'absent_box'", async () => {
      const { listing, box } = await heldBox()
      const stale = held.mw.staleWriteOf(box.scope, tombstoneBoxRecord(stored))
      held.mw.willPut(stale)
      await TH.expectRefusal(listing.put(box, box), 'stale_write')
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
      await TH.expectRefusal(listing.put(box, box), 'stale_write')
      expect(box._cheat_central.revision_seq).to.eq(1)
    })

    it("throws 'stale_write' with nothing delivered for a box_stored of null", async () => {
      const { listing, box } = await heldBox()
      const stale = held.mw.staleWriteOf(box.scope, null)
      held.mw.willPut(stale)
      await TH.expectRefusal(listing.put(box, box), 'stale_write')
    })

    it("throws 'stale_write' with nothing delivered for a box_stored that fails its check", async () => {
      const { listing, box } = await heldBox()
      const stale = held.mw.staleWriteOf(box.scope, { junk: 1 } as never)
      held.mw.willPut(stale)
      await TH.expectRefusal(listing.put(box, box), 'stale_write')
      expect(box._cheat_central.revision_seq).to.eq(1)
    })

    it("delivers box_stored to a box not yet held, building it", async () => {
      const listing = boxListingOf(held.mw)
      const stale = held.mw.staleWriteOf(scope(), fullBoxRecord(stored))
      held.mw.willPut(stale)
      await TH.expectRefusal(listing.put(fullBoxRecord({ revision_seq: 0 }), null), 'stale_write')
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

  it("follows the box through a send: the listing shows the sidecar `box.sidecar` now gives", async () => {
    const listing = boxListingOf(held.mw)
    const record = fullBoxRecord({ sidecar: { uncle: 'Bob' } })
    held.mw.seedStore(record)
    const box = await listing.build(record)
    await box.send({ whisper: { val: 'sk-test-0000' }, sidecar: { uncle: 'Robert' } })
    expect(box.sidecar).to.deep.equal({ uncle: 'Robert' })
    expect(listing.snapshot[0]?.sidecar).to.deep.equal({ uncle: 'Robert' })
  })
})

// == [Sealed at birth]: create, boxDna, the vault's lease

describe("boxListing.create(dna): the box is sealed at birth", () => {
  it("stores a full record at revision 0 over no record, its sealed parts the fake lease's", async () => {
    const box = await boxListingOf(held.mw).create(dna())
    expect(box.isFull).to.be.true
    expect(box.revision_seq).to.eq(0)
    expect(box.box_key_wrapped).to.deep.equal(FakeBoxKeyWrapped)
    expect(box.whisper_ciphered).to.deep.equal(FakeWhisperCiphered)
    const [put] = held.mw.callsOf('put')
    expect(put?.priorRevisionTok).to.be.null
    expect(put?.record).to.include({ revision_seq: 0, am: 'a' })
    expect(MSX.boxRecord.parse(put?.record)).to.deep.equal(put?.record)
  })

  it("seals the dna's sidecar in beside the whisper", async () => {
    const box = await boxListingOf(held.mw).create({ ...dna(), sidecar: { account: 'work' }, whisper: { val: 'sk-test-0000' } })
    expect(box.sidecar).to.deep.equal({ account: 'work' })
    expect(box.isFull).to.be.true
  })

  it("refuses 'vault_locked' while the vault is locked, holding and sealing nothing", async () => {
    held.mw.setLockState('locked')
    const listing = boxListingOf(held.mw)
    await TH.expectRefusal(listing.create({ ...dna(), whisper: { val: 'sk-test-0000' } }), 'vault_locked')
    expect(listing.things).to.deep.equal([])
    expect(held.mw.calls.map(({ verb }) => verb)).to.deep.equal(['ensureTimely'])
  })

  it("builds of a record while the vault is locked, as a record needs no seal", async () => {
    held.mw.setLockState('locked')
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    expect(box.revision_seq).to.eq(1)
  })

  it("refuses 'bad_option' a dna carrying sealed parts, holding nothing", async () => {
    const listing = boxListingOf(held.mw)
    const { box_key_wrapped, whisper_ciphered } = fullBoxRecord()
    await TH.expectRefusal(listing.create({ ...dna(), box_key_wrapped, whisper_ciphered } as never), 'bad_option')
    expect(listing.things).to.deep.equal([])
  })
})

describe("boxListing.create(dna): no secret material", () => {
  it("leaves none of the whisper in the record in hand, the snapshots or the listing", async () => {
    const listing = boxListingOf(held.mw)
    const box = await listing.create({ ...dna(), whisper: { val: { key: 'sk-test-SECRET' } } })
    for (const form of [box.toJSON(), box._cheat_central, box.snapshot, listing.snapshot, held.mw.calls]) {
      expect(JSON.stringify(form)).to.not.include('SECRET')
    }
    expect(box.whisper).to.be.null
  })

  it("seals the same placeholders whatever the whisper", async () => {
    const listing = boxListingOf(held.mw)
    const one = await listing.create({ ...dna('one_box'), whisper: { val: 'sk-test-one' } })
    const other = await listing.create({ ...dna('other_box'), whisper: { val: 'sk-test-other' } })
    expect(one.whisper_ciphered).to.deep.equal(other.whisper_ciphered)
    expect(one.box_key_wrapped).to.deep.equal(other.box_key_wrapped)
  })
})
// --

// == [A whisper and a sidecar at birth]: create, boxDna

describe("boxListing.create(dna): a whisper and a sidecar, both required", () => {
  const DnaCases = [
    [{ whisper: undefined },                     ["whisper"],            'a whisper given as undefined'],
    [{ sidecar: undefined },                     ["sidecar"],            'a sidecar given as undefined'],
    [{ whisper: undefined, sidecar: undefined }, ["sidecar", "whisper"], 'neither'],
  ] as const

  for (const [lacks, fieldnames, blurb] of DnaCases) {
    it(`refuses a dna with ${blurb} as 'bad_option', naming the field, holding, saving and sealing nothing`, async () => {
      const listing = boxListingOf(held.mw)
      const err = await TH.expectRefusal(listing.create({ ...dna(), ...lacks } as unknown as BoxDna), 'bad_option')
      expect(err.meta?.fieldnames).to.have.members([...fieldnames])
      expect(listing.things).to.deep.equal([])
      expect(held.mw.calls).to.deep.equal([])
    })
  }

  it("refuses a dna of the scope alone as 'bad_option'", async () => {
    const listing = boxListingOf(held.mw)
    await TH.expectRefusal(listing.create(held.mw.boxscope('anthropic_api_key') as unknown as BoxDna), 'bad_option')
    expect(listing.things).to.deep.equal([])
  })
})
// --

// == [The whisper as { val } at birth]: build, boxDna

describe("boxListing.create(dna): the whisper given as { val }", () => {
  const BadWhisperCases = [
    ['sk-test-SECRET',                            ['whisper'],     'a bare whisper'],
    [{ val: null },                               ['whisper.val'], 'a val that is null'],
    [{ val: ['sk-test-SECRET', undefined] },      ['whisper.val'], 'a val holding undefined'],
    [{ val: 'sk-test-SECRET', SECRET_NOTE: 'x' }, ['whisper'],     'a field beside the val'],
  ] as const

  for (const [whisper, fieldnames, blurb] of BadWhisperCases) {
    it(`refuses a dna whose whisper is ${blurb} as 'bad_option', naming the field, quoting nothing, holding and saving nothing`, async () => {
      const listing = boxListingOf(held.mw)
      const err = await TH.expectRefusal(listing.create({ ...dna(), whisper: whisper as never }), 'bad_option')
      expect(err.meta?.fieldnames).to.deep.equal([...fieldnames])
      expect(TH.thrownText(err)).to.not.include('SECRET')
      expect(listing.things).to.deep.equal([])
      expect(held.mw.calls).to.deep.equal([])
    })
  }

  it("freezes the copy it checks, never the host's own whisper object", async () => {
    const whisper = { val: { apiKey: 'sk-test-0000' } }
    const box = await boxListingOf(held.mw).create({ ...dna(), whisper })
    expect(box.isFull).to.be.true
    expect(Object.isFrozen(whisper)).to.be.false
  })
})
// --

// == [Arguments first]: every entry of BoxListing and Listing checks its arguments before any guard

describe("BoxListing and Listing entries: arguments checked first of all, before any guard (the Coach, 2026-10-31)", () => {
  const BadDnaCases = [
    [() => undefined,                           'undefined'],
    [() => null,                                'null'],
    [() => 'anthropic_api_key',                 'a bare boxlabel'],
    [() => ({ ...dna(), sidecar: undefined }),  'a dna with no sidecar'],
    [() => ({ ...dna(), whisper: MSX.LOCKED }), 'a dna whose whisper is LOCKED'],
  ] as const

  for (const [inputOf, blurb] of BadDnaCases) {
    it(`refuses creating ${blurb} as 'bad_option' while the vault is locked, holding nothing and calling nothing`, async () => {
      const listing = boxListingOf(held.mw)
      held.mw.setLockState('locked')
      await TH.expectRefusal(listing.create(inputOf() as never), 'bad_option')
      expect(listing.things).to.deep.equal([])
      expect(held.mw.calls).to.deep.equal([])
    })
  }

  it("refuses a sound dna created while the vault is locked as 'vault_locked', the dna checked first", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.setLockState('locked')
    await TH.expectRefusal(listing.create(dna()), 'vault_locked')
    expect(listing.things).to.deep.equal([])
  })

  it("says LOCKED is no whisper, naming whisper, for a dna that hands it as the whisper", async () => {
    const err = await TH.expectRefusal(boxListingOf(held.mw).create({ ...dna(), whisper: MSX.LOCKED } as never), 'bad_option')
    expect(err.message).to.include('LOCKED is not a whisper')
    expect(err.meta?.fieldnames).to.deep.equal(['whisper'])
  })

  const BadWorldCases = [
    [() => ({ ...held.mw.world, vault_tok: undefined }),       'no vault_tok',                            'world.vault_tok'],
    [() => ({ ...held.mw.world, scope: { vaultlabel: 'v' } }), 'a scope missing its applabel and user_id', 'world.scope.applabel'],
  ] as const

  for (const [worldOf, blurb, fieldname] of BadWorldCases) {
    it(`refuses a world with ${blurb} as 'bad_option', naming ${fieldname}`, () => {
      const err = TH.expectSyncRefusal(() => new BoxListing({ ...good(), world: worldOf() as never }), 'bad_option')
      expect(err.meta?.fieldnames).to.include(fieldname)
    })
  }

  it("refuses at() a scope that fails its check as 'bad_scope'", () => {
    const listing = boxListingOf(held.mw)
    TH.expectSyncRefusal(() => listing.at(undefined as never), 'bad_scope')
    TH.expectSyncRefusal(() => listing.at({ ...held.mw.boxscope('anthropic_api_key'), boxlabel: 'B' }), 'bad_scope')
  })

  it("refuses subscribing anything but a function as 'bad_option'", () => {
    TH.expectSyncRefusal(() => boxListingOf(held.mw).subscribe(null as never), 'bad_option')
  })

})
// --
