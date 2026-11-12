/** BoxListing's construction and its verbs build, get and puttable, and the arguments its entries check first. */

import { describe, expect, it } from 'vitest'
import { BoxListing } from '../../src/models/box-listing'
import * as SX from '../../src/shapes/shapes-storage'
import { LOCKED } from '../../src/helpers/consts'
import type { ListingOpts } from '../../src/shapes/shapes-vaultish'
import type { Vault } from '../../src/models/vault'
import * as Phrases from '../../src/helpers/phrases'
import * as TH from '../test-helpers'
import { WorldVault, boxDnaOf, boxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld } from '../test-helpers/models-world'

const world = useModelsWorld()

function good(): ListingOpts { return { bankDB: world.mw.bankDB, maxMillisSinceRefresh: 1000 } }

/** The models world's fake vault, as the listing is handed it. */
function vault(): Vault { return world.mw.world as unknown as Vault }

function dna() { return boxDnaOf(world.mw.boxscope('anthropic_api_key')) }

const Label = 'anthropic_api_key'

/** Every verb a listing calls on its bankDB, with no brand: a duck. */
function bankDBDuck() { return Object.fromEntries(['tryEnsureBank', 'tryGetVault', 'tryPutVault', 'tryDelVault', 'tryListBoxes', 'tryGetBox', 'tryPutBox', 'tryDelBox', 'watch'].map((verb) => [verb, () => null])) }

describe("BoxListing", () => {
  describe("new BoxListing(vault, opts)", () => {
    it("makes a listing from a vault, a bankDB and a horizon without calling them", () => {
      const listing = new BoxListing(vault(), good())
      expect(listing).to.be.instanceOf(BoxListing)
      expect(listing.things).to.deep.equal([])
      expect(listing.snapshot).to.deep.equal([])
      expect(world.mw.calls).to.deep.equal([])
    })

    const bads: readonly (readonly [blurb: string, args: () => readonly [vault: unknown, opts: unknown]])[] = [
      ['no vault',                    () => [undefined, good()]],
      ['a bank in place of its vault', () => [world.mw.world.bank, good()]],
      ['no bankDB',                   () => [vault(), { ...good(), bankDB: undefined }]],
      ['an unbranded look-alike of a bankDB', () => [vault(), { ...good(), bankDB: bankDBDuck() }]],
      ['no horizon',                  () => [vault(), { ...good(), maxMillisSinceRefresh: undefined }]],
      ['a negative horizon',          () => [vault(), { ...good(), maxMillisSinceRefresh: -1 }]],
      ['a vault among its options',   () => [vault(), { ...good(), world: world.mw.world }]],
      ['a scope among its options',   () => [vault(), { ...good(), scope: WorldVault.scope }]],
    ]
    for (const [blurb, args] of bads) {
      it(`refuses ${blurb}`, () => {
        const [under, opts] = args()
        TH.expectSyncRefusal(() => new BoxListing(under as never, opts as never))
      })
    }
  })

  describe("listing.deliverRecord(record)", () => {
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
        await fetchingListing.get(scope, { maxMillisSinceRefresh: 0, ifAbsent: 'nil' })
        const fetched = fetchingListing.at(scope)
        const built   = boxListingOf(world.mw).deliverRecord(record)
        expect(fetched).to.not.be.null
        expect(built._cheat_central).to.deep.equal(fetched?._cheat_central)
        expect(built._cheat_central).to.deep.equal(record)
      })
    }

    it("lists the box, and shows it in the snapshot", () => {
      const listing = boxListingOf(world.mw)
      const box = listing.deliverRecord(fullBoxRecord())
      expect(listing.at(box.scope)).to.eq(box)
      expect(box.isFull).to.be.true
      expect(listing.snapshot).to.have.lengthOf(1)
    })

    it("refuses a dna in place of a record", () => {
      const listing = boxListingOf(world.mw)
      TH.expectSyncRefusal(() => listing.deliverRecord(dna() as never))
      expect(listing.things).to.deep.equal([])
      expect(world.mw.calls).to.deep.equal([])
    })

    it("delivers a newer record to the box already listed", () => {
      const listing = boxListingOf(world.mw)
      const box = listing.deliverRecord(fullBoxRecord())
      const again = listing.deliverRecord(fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 }))
      expect(again).to.eq(box)
      expect(box.revision_seq).to.eq(2)
    })
  })
})

describe("boxListing.get(scoped, opts)", () => {
  it("hydrates a listed box and returns it", async () => {
    const listing = boxListingOf(world.mw)
    const box = listing.deliverRecord(sparseBoxRecord())
    world.mw.seedPut(fullBoxRecord())
    world.mw.clearCalls()
    await expect(listing.get(box.scope)).resolves.to.eq(box)
    expect(box.isFull).to.be.true
    expect(world.mw.callsOf('get')).to.have.length(1)
  })

  it("asks storage nothing for a full listed box within its horizon, and fetches under a horizon of 0", async () => {
    const listing = boxListingOf(world.mw)
    const box = listing.deliverRecord(fullBoxRecord())
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
    const box = listing.deliverRecord(tombstoneBoxRecord())
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

  it("refuses a put's ifAbsent, and refuses once its device ends", async () => {
    const listing = boxListingOf(world.mw)
    await TH.expectRefusal(listing.get(world.mw.boxscope(Label), { ifAbsent: 'add' } as never))
    world.mw.disable()
    await TH.expectRefusal(listing.get(world.mw.boxscope(Label)), 'disabled')
  })

  it("tryGet returns a refusal as an Outcome", async () => {
    const outcome = await boxListingOf(world.mw).tryGet(world.mw.boxscope(Label))
    expect(outcome.ok).to.be.false
  })
})

describe("boxListing.puttable(scoped, opts)", () => {
  it("hands a void shell where none is listed, asking storage nothing", () => {
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

  it("returns the listed box, alive or deleted", () => {
    const listing = boxListingOf(world.mw)
    const alive = listing.deliverRecord(fullBoxRecord({ boxlabel: 'alive_one' }))
    const gone  = listing.deliverRecord(tombstoneBoxRecord({ boxlabel: 'gone_one' }))
    expect(listing.puttable(alive.scope)).to.eq(alive)
    expect(listing.puttable(gone.scope)).to.eq(gone)
  })

  it("under ifAbsent 'fail', refuses where none is listed with 'absent_box'", () => {
    const listing = boxListingOf(world.mw)
    const alive = listing.deliverRecord(fullBoxRecord({ boxlabel: 'alive_one' }))
    const gone  = listing.deliverRecord(tombstoneBoxRecord({ boxlabel: 'gone_one' }))
    expect(listing.puttable(alive.scope, { ifAbsent: 'fail' })).to.eq(alive)
    expect(listing.puttable(gone.scope, { ifAbsent: 'fail' })).to.eq(gone)
    const scope = world.mw.boxscope('void_one')
    const err = TH.expectSyncRefusal(() => listing.puttable(scope, { ifAbsent: 'fail' }), 'absent_box')
    expect(err.message).to.eq(Phrases.boxNotListed(scope.boxlabel))
    expect(err.message).to.contain('vault.beginWatch')
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
    await TH.expectRefusal(shell.put({ whisper: { apiKey: 'sk-test-0000' } }), 'bank_locked')
    expect(world.mw.calls.map(({ verb }) => verb)).to.deep.equal(['ensureTimely'])
  })

  it("refuses once its device ends", () => {
    const listing = boxListingOf(world.mw)
    world.mw.disable()
    TH.expectSyncRefusal(() => listing.puttable(world.mw.boxscope(Label)), 'disabled')
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

  it("refuses 'bank_locked' for a sound dna created while the vault is locked", async () => {
    const listing = boxListingOf(world.mw)
    world.mw.setLocked(true)
    await TH.expectRefusal(listing.create(dna()), 'bank_locked')
    expect(listing.snapshot).to.deep.equal([])
  })

  it("refuses LOCKED as a dna's whisper, naming whisper", async () => {
    const err = await TH.expectRefusal(boxListingOf(world.mw).create({ ...dna(), whisper: LOCKED }))
    expect(err.message).to.include(Phrases.WhisperedIsNoWhisper)
    expect(err.meta?.fieldnames).to.deep.equal(['whisper'])
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
