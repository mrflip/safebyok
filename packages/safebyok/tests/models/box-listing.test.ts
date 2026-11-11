/** BoxListing's construction and its verbs build, get and puttable, and the arguments its entries check first. */

import { describe, expect, it } from 'vitest'
import { BoxListing } from '../../src/models/box-listing'
import * as SX from '../../src/shapes/shapes-storage'
import { LOCKED } from '../../src/helpers/consts'
import type { BoxListingOpts } from '../../src/shapes/shapes-vaultish'
import * as Phrases from '../../src/helpers/phrases'
import * as TH from '../test-helpers'
import { WorldVault, boxDnaOf, boxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld } from '../test-helpers/models-world'

const world = useModelsWorld()

const good = (): BoxListingOpts => ({ scope: WorldVault.scope, vaultDB: world.mw.vaultDB, maxMillisSinceRefresh: 1000, bankFriend: world.mw.bankFriend })

const dna = () => boxDnaOf(world.mw.boxscope('anthropic_api_key'))

const Label = 'anthropic_api_key'

/** Every verb a listing calls on its vaultDB, with no brand: a duck. */
const vaultDBDuck = () => Object.fromEntries(['tryGetVault', 'tryPutVault', 'tryDelVault', 'tryListBoxes', 'tryGetBox', 'tryPutBox', 'tryDelBox', 'watch'].map((verb) => [verb, () => null]))

describe("BoxListing", () => {
  describe("new BoxListing(world, opts)", () => {
    it("makes a listing from a world, a vaultDB and a horizon without calling them", () => {
      const listing = new BoxListing(world.mw.world, good())
      expect(listing).to.be.instanceOf(BoxListing)
      expect(listing.things).to.deep.equal([])
      expect(listing.snapshot).to.deep.equal([])
      expect(world.mw.calls).to.deep.equal([])
    })

    const bads: readonly (readonly [blurb: string, args: () => readonly [world: unknown, opts: unknown]])[] = [
      ['no world',                    () => [undefined, good()]],
      ['no vaultDB',                  () => [world.mw.world, { ...good(), vaultDB: undefined }]],
      ['an unbranded look-alike of a vaultDB', () => [world.mw.world, { ...good(), vaultDB: vaultDBDuck() }]],
      ['no horizon',                  () => [world.mw.world, { ...good(), maxMillisSinceRefresh: undefined }]],
      ['a negative horizon',          () => [world.mw.world, { ...good(), maxMillisSinceRefresh: -1 }]],
      ['a world among its options',   () => [world.mw.world, { ...good(), world: world.mw.world }]],
      ['no scope',                    () => [world.mw.world, { ...good(), scope: undefined }]],
      ['a bankFriend that cannot tell bad news', () => [world.mw.world, { ...good(), bankFriend: { ...world.mw.bankFriend, tellBadNews: 'tell me' } }]],
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
        const scope = world.mw.boxscope(record.boxlabel)
        world.mw.willGet(world.mw.answerOf(scope, record))
        const fetchingListing = boxListingOf(world.mw)
        await fetchingListing.fetch(scope, { ifAbsent: 'nil' })
        const fetched = fetchingListing.at(scope)
        const built   = await boxListingOf(world.mw).build(record)
        expect(fetched).to.not.be.null
        expect(built._cheat_central).to.deep.equal(fetched?._cheat_central)
        expect(built._cheat_central).to.deep.equal(record)
      })
    }

    it("lists the box, and shows it in the snapshot", async () => {
      const listing = boxListingOf(world.mw)
      const box = await listing.build(fullBoxRecord())
      expect(listing.at(box.scope)).to.eq(box)
      expect(box.isFull).to.be.true
      expect(listing.snapshot).to.have.lengthOf(1)
    })

    it("refuses a dna in place of a record", async () => {
      const listing = boxListingOf(world.mw)
      await TH.expectRefusal(listing.build(dna() as never))
      expect(listing.things).to.deep.equal([])
      expect(world.mw.calls).to.deep.equal([])
    })

    it("delivers a newer record to the box already listed", async () => {
      const listing = boxListingOf(world.mw)
      const box = await listing.build(fullBoxRecord())
      const again = await listing.build(fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 }))
      expect(again).to.eq(box)
      expect(box.revision_seq).to.eq(2)
    })
  })
})

describe("boxListing.get(scoped, opts)", () => {
  it("hydrates a listed box and returns it", async () => {
    const listing = boxListingOf(world.mw)
    const box = await listing.build(sparseBoxRecord())
    world.mw.seedPut(fullBoxRecord())
    world.mw.clearCalls()
    await expect(listing.get(box.scope)).resolves.to.eq(box)
    expect(box.isFull).to.be.true
    expect(world.mw.callsOf('get')).to.have.length(1)
  })

  it("asks storage nothing for a full listed box within its horizon, and fetches under a horizon of 0", async () => {
    const listing = boxListingOf(world.mw)
    const box = await listing.build(fullBoxRecord())
    world.mw.seedPut(fullBoxRecord())
    world.mw.clearCalls()
    await listing.get(box.scope)
    expect(world.mw.callsOf('get')).to.deep.equal([])
    await listing.get(box.scope, { maxMillisSinceRefresh: 0 })
    expect(world.mw.callsOf('get')).to.have.length(1)
  })

  it("fetches and lists a box not yet listed", async () => {
    const listing = boxListingOf(world.mw)
    world.mw.seedPut(fullBoxRecord())
    const box = await listing.get(world.mw.boxscope(Label))
    expect(box?.isFull).to.be.true
    expect(listing.at(world.mw.boxscope(Label))).to.eq(box)
  })

  it("refuses an absent box with 'absent_box', or returns null under 'nil'", async () => {
    const listing = boxListingOf(world.mw)
    await TH.expectRefusal(listing.get(world.mw.boxscope(Label)), 'absent_box')
    expect(await listing.get(world.mw.boxscope(Label), { ifAbsent: 'nil' })).to.be.null
  })

  it("refuses a box whose stored row is a tombstone as absent, or returns null under 'nil'", async () => {
    const listing = boxListingOf(world.mw)
    const box = await listing.build(tombstoneBoxRecord())
    world.mw.seedPut(tombstoneBoxRecord())
    await TH.expectRefusal(listing.get(box.scope), 'absent_box')
    expect(await listing.get(box.scope, { ifAbsent: 'nil' })).to.be.null
  })

  it("returns the stored box while the vault is locked", async () => {
    const listing = boxListingOf(world.mw)
    world.mw.seedPut(fullBoxRecord())
    world.mw.setLocked(true)
    const box = await listing.get(world.mw.boxscope(Label))
    expect(box?.boxlabel).to.eq(Label)
    expect(box?.isPresent).to.be.true
  })

  it("refuses a put's ifAbsent, and refuses once vacated", async () => {
    const listing = boxListingOf(world.mw)
    await TH.expectRefusal(listing.get(world.mw.boxscope(Label), { ifAbsent: 'add' } as never))
    listing.vacate()
    await TH.expectRefusal(listing.get(world.mw.boxscope(Label)))
  })

  it("tryGet returns a refusal as an Outcome", async () => {
    const outcome = await boxListingOf(world.mw).tryGet(world.mw.boxscope(Label))
    expect(outcome.ok).to.be.false
  })
})

describe("boxListing.puttable(scoped, opts)", () => {
  it("hands a void shell for an empty slot, asking storage nothing", () => {
    const listing = boxListingOf(world.mw)
    const shell = listing.puttable(world.mw.boxscope(Label))
    expect(shell.isPresent).to.be.false
    expect(shell.revision_seq).to.eq(SX.VoidRevisionSeq)
    expect(shell.revision_tok).to.eq(SX.VoidRevisionTok)
    expect(listing.things).to.deep.equal([shell])
    expect(listing.snapshot).to.deep.equal([])
    expect(listing.puttable(world.mw.boxscope(Label))).to.eq(shell)
    expect(world.mw.calls).to.deep.equal([])
  })

  it("returns the listed box, alive or deleted", async () => {
    const listing = boxListingOf(world.mw)
    const alive = await listing.build(fullBoxRecord({ boxlabel: 'alive_one' }))
    const gone  = await listing.build(tombstoneBoxRecord({ boxlabel: 'gone_one' }))
    expect(listing.puttable(alive.scope)).to.eq(alive)
    expect(listing.puttable(gone.scope)).to.eq(gone)
  })

  it("under ifAbsent 'fail', refuses an empty slot with 'absent_box'", async () => {
    const listing = boxListingOf(world.mw)
    const alive = await listing.build(fullBoxRecord({ boxlabel: 'alive_one' }))
    const gone  = await listing.build(tombstoneBoxRecord({ boxlabel: 'gone_one' }))
    expect(listing.puttable(alive.scope, { ifAbsent: 'fail' })).to.eq(alive)
    expect(listing.puttable(gone.scope, { ifAbsent: 'fail' })).to.eq(gone)
    const scope = world.mw.boxscope('void_one')
    const err = TH.expectSyncRefusal(() => listing.puttable(scope, { ifAbsent: 'fail' }), 'absent_box')
    expect(err.message).to.eq(Phrases.boxNotListed(scope.boxlabel))
    expect(err.message).to.contain('vault.hello')
    expect(listing.at(scope)).to.be.null
  })

  it("refuses a bad scope and a bad option, making no void box", () => {
    const listing = boxListingOf(world.mw)
    TH.expectSyncRefusal(() => listing.puttable({ ...world.mw.boxscope(Label), vaultlabel: 'mary' }))
    TH.expectSyncRefusal(() => listing.puttable(world.mw.boxscope(Label), { ifAbsent: 'nil' } as never))
    expect(listing.things).to.deep.equal([])
  })

  it("works while the vault is locked", async () => {
    const listing = boxListingOf(world.mw)
    world.mw.setLocked(true)
    const shell = listing.puttable(world.mw.boxscope(Label))
    await TH.expectRefusal(shell.put({ whisper: { apiKey: 'sk-test-0000' } }), 'vault_locked')
    expect(world.mw.calls.map(({ verb }) => verb)).to.deep.equal(['ensureTimely'])
  })

  it("refuses once vacated", () => {
    const listing = boxListingOf(world.mw)
    listing.vacate()
    TH.expectSyncRefusal(() => listing.puttable(world.mw.boxscope(Label)))
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
    it(`refuses creating ${blurb} while the vault is locked, calling nothing`, async () => {
      const listing = boxListingOf(world.mw)
      world.mw.setLocked(true)
      await TH.expectRefusal(listing.create(inputOf() as never))
      expect(listing.things).to.deep.equal([])
      expect(world.mw.calls).to.deep.equal([])
    })
  }

  it("refuses 'vault_locked' for a sound dna created while the vault is locked", async () => {
    const listing = boxListingOf(world.mw)
    world.mw.setLocked(true)
    await TH.expectRefusal(listing.create(dna()), 'vault_locked')
    expect(listing.snapshot).to.deep.equal([])
  })

  it("refuses LOCKED as a dna's whisper, naming whisper", async () => {
    const err = await TH.expectRefusal(boxListingOf(world.mw).create({ ...dna(), whisper: LOCKED }))
    expect(err.message).to.include(Phrases.WhisperedIsNoWhisper)
    expect(err.meta?.fieldnames).to.deep.equal(['whisper'])
  })

  it("refuses a world with no vault_tok, naming vault_tok", () => {
    const err = TH.expectSyncRefusal(() => new BoxListing({ ...world.mw.world, vault_tok: undefined } as never, good()))
    expect(err.meta?.fieldnames).to.include('vault_tok')
  })

  it("refuses a scope missing its applabel and user_id, naming scope.applabel", () => {
    const err = TH.expectSyncRefusal(() => new BoxListing(world.mw.world, { ...good(), scope: { vaultlabel: 'v' } } as never))
    expect(err.meta?.fieldnames).to.include('scope.applabel')
  })

  it("shows the scope of the vault it lists", () => {
    const listing = boxListingOf(world.mw)
    expect(listing.scope).to.deep.equal(WorldVault.scope)
    expect(listing).to.include(WorldVault.scope)
  })

  it("refuses at() a scope that fails its check", () => {
    const listing = boxListingOf(world.mw)
    TH.expectSyncRefusal(() => listing.at(undefined))
    TH.expectSyncRefusal(() => listing.at({ ...world.mw.boxscope('anthropic_api_key'), boxlabel: 'B' }))
  })

  it("refuses subscribing anything but a function", () => {
    TH.expectSyncRefusal(() => boxListingOf(world.mw).subscribe(null as never))
  })

})
// --
