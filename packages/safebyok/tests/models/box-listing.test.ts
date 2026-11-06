/** BoxListing's construction and its verbs build, get and puttable, and the arguments its entries check first. */

import { describe, expect, it } from 'vitest'
import { BoxListing } from '../../src/models/box-listing'
import * as SX from '../../src/shapes/shapes-storage'
import { LOCKED } from '../../src/helpers/consts'
import type { ListingOpts } from '../../src/shapes/shapes-vaultish'
import * as Phrases from '../../src/helpers/phrases'
import * as TH from '../test-helpers'
import { boxDnaOf, boxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld } from '../test-helpers/models-world'

const held = useModelsWorld()

const good = (): ListingOpts => ({ vaultDB: held.mw.vaultDB, maxMillisSinceRefresh: 1000 })

const dna = () => boxDnaOf(held.mw.boxscope('anthropic_api_key'))

const Label = 'anthropic_api_key'

describe("BoxListing", () => {
  describe("new BoxListing(world, opts)", () => {
    it("makes a listing of a world, a store and a horizon, calling none of them", () => {
      const listing = new BoxListing(held.mw.world, good())
      expect(listing).to.be.instanceOf(BoxListing)
      expect(listing.things).to.deep.equal([])
      expect(listing.snapshot).to.deep.equal([])
      expect(held.mw.calls).to.deep.equal([])
    })

    const bads: readonly (readonly [blurb: string, args: () => readonly [world: unknown, opts: unknown]])[] = [
      ['no world',                    () => [undefined, good()]],
      ['no vaultDB',                  () => [held.mw.world, { ...good(), vaultDB: undefined }]],
      ['a vaultDB without its verbs', () => [held.mw.world, { ...good(), vaultDB: { watch: () => null } }]],
      ['no horizon',                  () => [held.mw.world, { ...good(), maxMillisSinceRefresh: undefined }]],
      ['a negative horizon',          () => [held.mw.world, { ...good(), maxMillisSinceRefresh: -1 }]],
      ['a world among its options',   () => [held.mw.world, { ...good(), world: held.mw.world }]],
      ['a world that cannot tell bad news', () => [{ ...held.mw.world, tellBadNews: 'tell me' }, good()]],
    ]
    for (const [blurb, args] of bads) {
      it(`refuses ${blurb}`, () => {
        const [world, opts] = args()
        TH.expectSyncRefusal(() => new BoxListing(world as never, opts as never))
      })
    }
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

    it("refuses a dna, which is no record, holding and storing nothing", async () => {
      const listing = boxListingOf(held.mw)
      await TH.expectRefusal(listing.build(dna() as never))
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
})

describe("boxListing.get(scoped, opts)", () => {
  it("hydrates a box held, answering that instance", async () => {
    const listing = boxListingOf(held.mw)
    const box = await listing.build(sparseBoxRecord())
    held.mw.seedStore(fullBoxRecord())
    held.mw.clearCalls()
    await expect(listing.get(box.scope)).resolves.to.eq(box)
    expect(box.isFull).to.be.true
    expect(held.mw.callsOf('get')).to.have.length(1)
  })

  it("asks nothing of a full box held within its horizon, and asks again given a horizon of 0", async () => {
    const listing = boxListingOf(held.mw)
    const box = await listing.build(fullBoxRecord())
    held.mw.seedStore(fullBoxRecord())
    held.mw.clearCalls()
    await listing.get(box.scope)
    expect(held.mw.callsOf('get')).to.deep.equal([])
    await listing.get(box.scope, { maxMillisSinceRefresh: 0 })
    expect(held.mw.callsOf('get')).to.have.length(1)
  })

  it("fetches a box not held, and holds what it finds", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.seedStore(fullBoxRecord())
    const box = await listing.get(held.mw.boxscope(Label))
    expect(box?.isFull).to.be.true
    expect(listing.at(held.mw.boxscope(Label))).to.eq(box)
  })

  it("refuses a box absent as 'absent_box', or answers null where asked for nil", async () => {
    const listing = boxListingOf(held.mw)
    await TH.expectRefusal(listing.get(held.mw.boxscope(Label)), 'absent_box')
    expect(await listing.get(held.mw.boxscope(Label), { ifAbsent: 'nil' })).to.be.null
  })

  it("refuses a box whose tombstone it finds as absent, or answers null where asked for nil", async () => {
    const listing = boxListingOf(held.mw)
    const box = await listing.build(tombstoneBoxRecord())
    held.mw.seedStore(tombstoneBoxRecord())
    await TH.expectRefusal(listing.get(box.scope), 'absent_box')
    expect(await listing.get(box.scope, { ifAbsent: 'nil' })).to.be.null
  })

  it("answers the box stored while the vault is locked", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.seedStore(fullBoxRecord())
    held.mw.setLockState('locked')
    const box = await listing.get(held.mw.boxscope(Label))
    expect(box?.boxlabel).to.eq(Label)
    expect(box?.isPresent).to.be.true
  })

  it("refuses fed a put's ifAbsent, and once vacated", async () => {
    const listing = boxListingOf(held.mw)
    await TH.expectRefusal(listing.get(held.mw.boxscope(Label), { ifAbsent: 'add' } as never))
    listing.vacate()
    await TH.expectRefusal(listing.get(held.mw.boxscope(Label)))
  })

  it("tryGet answers the outcome", async () => {
    const outcome = await boxListingOf(held.mw).tryGet(held.mw.boxscope(Label))
    expect(outcome.ok).to.be.false
  })
})

describe("boxListing.puttable(scoped, opts)", () => {
  it("hands a void shell for an empty slot, asking storage nothing", () => {
    const listing = boxListingOf(held.mw)
    const shell = listing.puttable(held.mw.boxscope(Label))
    expect(shell.isPresent).to.be.false
    expect(shell.revision_seq).to.eq(SX.VoidRevisionSeq)
    expect(shell.revision_tok).to.eq(SX.VoidRevisionTok)
    expect(listing.things).to.deep.equal([shell])
    expect(listing.snapshot).to.deep.equal([])
    expect(listing.puttable(held.mw.boxscope(Label))).to.eq(shell)
    expect(held.mw.calls).to.deep.equal([])
  })

  it("answers the box held, alive or deleted, as it stands", async () => {
    const listing = boxListingOf(held.mw)
    const alive = await listing.build(fullBoxRecord({ boxlabel: 'alive_one' }))
    const gone  = await listing.build(tombstoneBoxRecord({ boxlabel: 'gone_one' }))
    expect(listing.puttable(alive.scope)).to.eq(alive)
    expect(listing.puttable(gone.scope)).to.eq(gone)
  })

  it("under ifAbsent 'fail', answers the box held, alive or deleted, and refuses an empty slot as 'absent_box', naming vault.hello", async () => {
    const listing = boxListingOf(held.mw)
    const alive = await listing.build(fullBoxRecord({ boxlabel: 'alive_one' }))
    const gone  = await listing.build(tombstoneBoxRecord({ boxlabel: 'gone_one' }))
    expect(listing.puttable(alive.scope, { ifAbsent: 'fail' })).to.eq(alive)
    expect(listing.puttable(gone.scope, { ifAbsent: 'fail' })).to.eq(gone)
    const scope = held.mw.boxscope('void_one')
    const err = TH.expectSyncRefusal(() => listing.puttable(scope, { ifAbsent: 'fail' }), 'absent_box')
    expect(err.message).to.eq(Phrases.boxNotListed(scope.boxlabel))
    expect(err.message).to.contain('vault.hello')
    expect(listing.at(scope)).to.be.null
  })

  it("refuses a bad scope and a bad option, making no void box", () => {
    const listing = boxListingOf(held.mw)
    TH.expectSyncRefusal(() => listing.puttable({ ...held.mw.boxscope(Label), vaultlabel: 'mary' }))
    TH.expectSyncRefusal(() => listing.puttable(held.mw.boxscope(Label), { ifAbsent: 'nil' } as never))
    expect(listing.things).to.deep.equal([])
  })

  it("demands nothing of the vault, as only the put it prepares has side effects: that put refuses 'vault_locked'", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.setLockState('locked')
    const shell = listing.puttable(held.mw.boxscope(Label))
    await TH.expectRefusal(shell.put({ whisper: { apiKey: 'sk-test-0000' } }), 'vault_locked')
    expect(held.mw.calls.map(({ verb }) => verb)).to.deep.equal(['ensureTimely'])
  })

  it("refuses once vacated", () => {
    const listing = boxListingOf(held.mw)
    listing.vacate()
    TH.expectSyncRefusal(() => listing.puttable(held.mw.boxscope(Label)))
  })
})

// == [Arguments first]: every entry of BoxListing and Listing checks its arguments before any guard

describe("BoxListing and Listing entries: arguments checked before any demand", () => {
  const BadDnaCases = [
    [() => undefined,                           'undefined'],
    [() => null,                                'null'],
    [() => 'anthropic_api_key',                 'a bare boxlabel'],
    [() => ({ ...dna(), sidecar: 'note' }),     'a dna whose sidecar fails its check'],
    [() => ({ ...dna(), whisper: LOCKED }), 'a dna whose whisper is LOCKED'],
  ] as const

  for (const [inputOf, blurb] of BadDnaCases) {
    it(`refuses creating ${blurb} while the vault is locked, holding nothing and calling nothing`, async () => {
      const listing = boxListingOf(held.mw)
      held.mw.setLockState('locked')
      await TH.expectRefusal(listing.create(inputOf() as never))
      expect(listing.things).to.deep.equal([])
      expect(held.mw.calls).to.deep.equal([])
    })
  }

  it("refuses a sound dna created while the vault is locked as 'vault_locked', the dna checked first", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.setLockState('locked')
    await TH.expectRefusal(listing.create(dna()), 'vault_locked')
    expect(listing.snapshot).to.deep.equal([])
  })

  it("says a bag is no whisper, naming whisper, for a dna that hands it as the whisper", async () => {
    const err = await TH.expectRefusal(boxListingOf(held.mw).create({ ...dna(), whisper: LOCKED }))
    expect(err.message).to.include(Phrases.WhisperedIsNoWhisper)
    expect(err.meta?.fieldnames).to.deep.equal(['whisper'])
  })

  const BadWorldCases = [
    [() => ({ ...held.mw.world, vault_tok: undefined }),       'no vault_tok',                            'vault_tok'],
    [() => ({ ...held.mw.world, scope: { vaultlabel: 'v' } }), 'a scope missing its applabel and user_id', 'scope.applabel'],
  ] as const

  for (const [worldOf, blurb, fieldname] of BadWorldCases) {
    it(`refuses a world with ${blurb}, naming ${fieldname}`, () => {
      const err = TH.expectSyncRefusal(() => new BoxListing(worldOf() as never, good()))
      expect(err.meta?.fieldnames).to.include(fieldname)
    })
  }

  it("refuses at() a scope that fails its check", () => {
    const listing = boxListingOf(held.mw)
    TH.expectSyncRefusal(() => listing.at(undefined))
    TH.expectSyncRefusal(() => listing.at({ ...held.mw.boxscope('anthropic_api_key'), boxlabel: 'B' }))
  })

  it("refuses subscribing anything but a function", () => {
    TH.expectSyncRefusal(() => boxListingOf(held.mw).subscribe(null as never))
  })

})
// --
