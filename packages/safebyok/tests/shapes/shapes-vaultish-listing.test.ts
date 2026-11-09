import { afterEach, describe, expect, it } from 'vitest'
import { ForeverMillis } from '../../src/helpers/consts'
import * as GX from '../../src/shapes/shapes-gateish'
import * as VX from '../../src/shapes/shapes-vaultish'
import { boxListingOf, makeModelsWorld, sparseBoxRecord, tombstoneBoxRecord } from '../test-helpers/models-world'
import { holdsCases } from '../test-helpers/cases'
import * as TH from '../test-helpers'

const mw = makeModelsWorld({ fakeTimers: false })
afterEach(() => { mw.dispose() })

const sparse = sparseBoxRecord()
const gone   = tombstoneBoxRecord({ revision_seq: 2 })

describe("The checks of options", () => {
  describe("VX.horizonMillis", () => {
    holdsCases(VX.horizonMillis, [
      [0,         true,  'passes zero: nothing is timely'],
      [60_000,    true,  'passes a span of milliseconds'],
      [0.5,       true,  'passes a fraction of a millisecond'],
      [Infinity,  true,  'passes Infinity, for never'],
      [-1,        false, 'refuses a negative span'],
      [-Infinity, false, 'refuses minus Infinity'],
      [NaN,       false, 'refuses NaN'],
      ["60000",   false, 'refuses text'],
      [null,      false, 'refuses null'],
    ])

    it("keeps Infinity as ForeverMillis, so no horizon past the check is infinite", () => {
      expect(VX.horizonMillis.parse(Infinity)).to.eq(ForeverMillis)
      expect(VX.timelyOpts.parse({ maxWorldMillis: Infinity })).to.deep.equal({ maxWorldMillis: ForeverMillis })
    })
  })

  describe("GX.leaseMillis", () => {
    holdsCases(GX.leaseMillis, [
      [60_000,          true,  'passes a whole number of milliseconds'],
      [ForeverMillis,   true,  "passes ForeverMillis, a host's never"],
      [Infinity,        false, "refuses Infinity: the bank keeps a host's as ForeverMillis"],
      [0,               false, 'refuses zero'],
      [0.5,             false, 'refuses a fraction of a millisecond'],
    ])
  })

  describe("VX.timelyOpts and VX.boxPutOpts", () => {
    holdsCases(VX.timelyOpts, [
      [{},                                          true,  'passes no options'],
      [{ maxMillisSinceRefresh: 0, maxWorldMillis: Infinity }, true, 'passes both horizons'],
      [{ maxMillisSinceRefresh: undefined },        true,  'passes a horizon left undefined'],
      [{ maxMillisSinceRefresh: -1 },               false, 'refuses a negative record horizon'],
      [{ maxWorldMillis: '5' },                     false, 'refuses a world horizon that is text'],
      [{ maxWorldMillis: NaN },                     false, 'refuses a world horizon that is NaN'],
    ])
    holdsCases(VX.boxPutOpts, [
      [{ maxWorldMillis: 5 },                       true,  'passes the horizons'],
      [{},                                          true,  'passes no options'],
      [{ maxWorldMillis: -1 },                      false, 'refuses a negative horizon'],
    ])

    it("take their fields from the bag given and strip the rest", () => {
      expect(VX.timelyOpts.parse({ maxWorldMillis: 5, reseal: true })).to.deep.equal({ maxWorldMillis: 5 })
      expect(VX.boxPutOpts.parse({ maxWorldMillis: 5, reseal: true })).to.deep.equal({ maxWorldMillis: 5, ifAbsent: 'add', ifPresent: 'repl' })
    })

    it("name the failing field", () => {
      const err = TH.expectSyncRefusal(() => VX.timelyOpts.parse({ maxMillisSinceRefresh: -1 }))
      expect(err.meta?.fieldnames).to.deep.equal(['maxMillisSinceRefresh'])
    })
  })
})

describe("VX.ifAbsent and VX.fetchOpts", () => {
  holdsCases(VX.ifAbsent, [
    ["fail",     true,  'passes fail'],
    ["nil",      true,  'passes nil'],
    ["create",   false, 'refuses create, which fetch does not offer'],
    [undefined,  false, 'refuses undefined: fetchOpts gives the default, not the check'],
  ])

  holdsCases(VX.fetchOpts, [
    [{},                                                true,  'passes no options'],
    [{ ifAbsent: 'nil' },                               true,  'passes ifAbsent nil'],
    [{ ifAbsent: undefined },                           true,  'passes ifAbsent undefined, as a caller spreading options may leave it'],
    [{ ifAbsent: 'fail', maxMillisSinceRefresh: 5 },    true,  'passes ifAbsent beside the timely options'],
    [{ ifAbsent: 'replace' },                           false, 'refuses an ifAbsent that is not one of the two'],
    [{ maxMillisSinceRefresh: -1 },                     false, 'refuses a negative horizon'],
  ])

  it("keeps ifAbsent and the timely options and strips the rest", () => {
    expect(VX.fetchOpts.parse({ ifAbsent: 'nil', maxWorldMillis: 5, reseal: true })).to.deep.equal({ ifAbsent: 'nil', maxWorldMillis: 5 })
  })

  it("fills a fetch's default: ifAbsent 'fail'", () => {
    expect(VX.fetchOpts.parse({})).to.deep.equal({ ifAbsent: 'fail' })
  })
})

describe("VX.boxCreateOpts", () => {
  it("fills what a create means: add where nothing stands, fail over a live record", () => {
    expect(VX.boxCreateOpts.parse({})).to.deep.equal({ ifAbsent: 'add', ifPresent: 'fail' })
  })

  it("takes a caller's ifPresent and the timely options, stripping the rest", () => {
    expect(VX.boxCreateOpts.parse({ ifPresent: 'repl', maxWorldMillis: 5, reseal: true })).to.deep.equal({ ifAbsent: 'add', ifPresent: 'repl', maxWorldMillis: 5 })
  })

  it("holds ifAbsent to 'add': a create that must find a box is not a create", () => {
    TH.expectSyncRefusal(() => VX.boxCreateOpts.parse({ ifAbsent: 'fail' }))
  })
})

describe("VX.ifPresent and VX.boxPutOpts", () => {

  holdsCases(VX.ifPresent, [
    ["repl",     true,  'passes repl'],
    ["fail",     true,  'passes fail'],
    ["get",      true,  'passes get'],
    ["replace",  false, 'refuses replace, which it does not spell'],
    [undefined,  false, 'refuses undefined: boxPutOpts gives the default, not the check'],
  ])

  holdsCases(VX.boxPutOpts, [
    [{ ifPresent: 'repl' },                             true,  'passes ifPresent repl'],
    [{ ifPresent: undefined },                          true,  'passes ifPresent undefined'],
    [{ ifPresent: 'repl', maxWorldMillis: 5 },          true,  'passes ifPresent beside the timely options'],
    [{ ifPresent: 'replace' },                          false, 'refuses an ifPresent it does not offer'],
    [{ maxMillisSinceRefresh: -1, ifPresent: 'repl' },  false, 'refuses a negative horizon'],
  ])

  it("keeps ifPresent, ifAbsent and the timely options and strips the rest", () => {
    expect(VX.boxPutOpts.parse({ ifPresent: 'repl', maxWorldMillis: 5, ifAbsent: 'add', reseal: true })).to.deep.equal({ ifPresent: 'repl', maxWorldMillis: 5, ifAbsent: 'add' })
  })

  it("fills a put's defaults: ifAbsent 'add', ifPresent 'repl'", () => {
    expect(VX.boxPutOpts.parse({})).to.deep.equal({ ifAbsent: 'add', ifPresent: 'repl' })
  })

  it("refuses a fetch's ifAbsent: 'nil' is no answer to a put", () => {
    TH.expectSyncRefusal(() => VX.boxPutOpts.parse({ ifAbsent: 'nil' }))
  })

  it("name the failing field", () => {
    const err = TH.expectSyncRefusal(() => VX.boxPutOpts.parse({ ifPresent: 'fetch' }))
    expect(err.meta?.fieldnames).to.deep.equal(['ifPresent'])
  })
})

describe("The checks of the world and the listing", () => {
  describe("VX.listingWorld", () => {
    holdsCases(VX.listingWorld, [
      [mw.world,                                 true,  'passes the test world'],
      [{ ...mw.world, extra: 1 },                true,  'passes a world with more than the base reaches into'],
      [null,                                     false, 'refuses null'],
      [{},                                       false, 'refuses an empty object'],
      [{ ...mw.world, receiveWorld: undefined },    false, 'refuses a world that cannot receiveWorld'],
      [{ ...mw.world, ensureTimely: 5 },         false, 'refuses a world whose ensureTimely is no function'],
      [{ ...mw.world, isLocked: undefined },     false, 'refuses a world with no isLocked'],
      [{ ...mw.world, isLocked: 'locked' },      false, 'refuses a world whose isLocked is no boolean'],
    ])
  })

  describe("VX.listingOpts", () => {
    const opts = { vaultDB: mw.vaultDB, maxMillisSinceRefresh: 1000, bankFriend: mw.bankFriend }
    holdsCases(VX.listingOpts, [
      [opts,                                                     true,  'passes the test vaultDB, a horizon and the calls the bank branded'],
      [{ ...opts, maxMillisSinceRefresh: Infinity },             true,  'passes a horizon of Infinity'],
      [{ ...opts, vaultDB: { tryPutBox: () => null } },          false, 'refuses a vaultDB with no tryGetBox'],
      [{ ...opts, maxMillisSinceRefresh: -1 },                   false, 'refuses a negative horizon'],
      [{ ...opts, maxMillisSinceRefresh: undefined },            false, 'refuses a missing horizon'],
      [{ ...opts, bankFriend: { ...mw.bankFriend, panic: () => undefined } },               false, 'refuses a panic the bank did not brand'],
      [{ ...opts, bankFriend: { ...mw.bankFriend, announce: () => undefined } },            false, 'refuses an announce the bank did not brand'],
      [{ ...opts, bankFriend: { ...mw.bankFriend, tellBadNews: () => undefined } },         false, 'refuses a tellBadNews the bank did not brand'],
      [{ ...opts, bankFriend: { ...mw.bankFriend, askUser: () => Promise.resolve(true) } }, false, 'refuses an askUser the bank did not brand'],
      [{ ...opts, bankFriend: { ...mw.bankFriend, askUser: null } },                        true,  'passes a bank with no host dialog'],
      [{ ...opts, bankFriend: undefined },                       false, 'refuses a missing bankFriend'],
      [{ ...opts, world: mw.world },                             false, 'refuses a world, which the listing takes beside its options'],
      [{ ...opts, onBadNews: () => null },                       false, 'refuses an onBadNews, which only a bank takes'],
      [{ ...opts, extra: 1 },                                    false, 'refuses an option it does not accept, being strict'],
    ])

    it("names the failing field", () => {
      const err = TH.expectSyncRefusal(() => VX.listingOpts.parse({ ...opts, maxMillisSinceRefresh: -1 }))
      expect(err.meta?.fieldnames).to.deep.equal(['maxMillisSinceRefresh'])
    })
  })

  describe("VX.storableArgs", () => {
    const listing = boxListingOf(mw)
    const args = { world: mw.world, listing, central: sparse }
    holdsCases(VX.storableArgs, [
      [args,                                           true,  'passes a world, a listing and a central'],
      [{ ...args, central: gone },                     true,  'passes a tombstone'],
      [{ ...args, central: null },                     false, 'refuses a null central'],
      [{ ...args, central: { am: 'a' } },              false, 'refuses a central that fails sparseBase'],
      [{ ...args, listing: {} },                       false, 'refuses a listing with no listing modelkind'],
      [{ ...args, listing: undefined },                false, 'refuses a missing listing'],
      [{ ...args, world: null },                       false, 'refuses a null world'],
      [{ ...args, world: { ...mw.world, receiveWorld: undefined } }, false, 'refuses a world that cannot receiveWorld'],
      [{ ...args, opts: { maxMillisSinceRefresh: 1000 } }, false, "refuses options, the horizon being the listing's"],
      [{ ...args, extra: 1 },                          false, 'refuses an argument it does not accept, being strict'],
    ])

    it("names the failing field", () => {
      const err = TH.expectSyncRefusal(() => VX.storableArgs.parse({ ...args, listing: {} }))
      expect(err.meta?.fieldnames).to.deep.equal(['listing'])
    })
  })
})
