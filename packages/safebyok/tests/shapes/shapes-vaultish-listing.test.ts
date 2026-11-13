import { afterEach, describe, expect, it } from 'vitest'
import { ForeverMillis } from '../../src/helpers/consts'
import * as GX from '../../src/shapes/shapes-gateish'
import * as VX from '../../src/shapes/shapes-vaultish'
import * as SX from '../../src/shapes/shapes-storage'
import { boxListingOf, makeModelsWorld, sparseBoxRecord, tombstoneBoxRecord } from '../test-helpers/models-world'
import { expectCases } from '../test-helpers/cases'
import * as TH from '../test-helpers'

const mw = makeModelsWorld({ fakeTimers: false })
afterEach(() => { mw.dispose() })

const sparse = sparseBoxRecord()
const gone   = tombstoneBoxRecord({ revision_seq: 2 })

describe("The checks of options", () => {
  describe("VX.horizonMillis", () => {
    expectCases(VX.horizonMillis, [
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

    it("turns Infinity into ForeverMillis", () => {
      expect(VX.horizonMillis.parse(Infinity)).to.eq(ForeverMillis)
      expect(VX.timelyOpts.parse({ maxParentMillis: Infinity })).to.deep.equal({ maxParentMillis: ForeverMillis })
    })
  })

  describe("GX.leaseMillis", () => {
    expectCases(GX.leaseMillis, [
      [60_000,          true,  'passes a whole number of milliseconds'],
      [ForeverMillis,   true,  "passes ForeverMillis, a host's never"],
      [Infinity,        false, "refuses Infinity: the bank keeps a host's as ForeverMillis"],
      [0,               false, 'refuses zero'],
      [0.5,             false, 'refuses a fraction of a millisecond'],
    ])
  })

  describe("VX.timelyOpts and VX.boxPutOpts", () => {
    expectCases(VX.timelyOpts, [
      [{},                                          true,  'passes no options'],
      [{ maxMillisSinceRefresh: 0, maxParentMillis: Infinity }, true, 'passes both horizons'],
      [{ maxMillisSinceRefresh: undefined },        true,  'passes a horizon left undefined'],
      [{ maxMillisSinceRefresh: -1 },               false, 'refuses a negative record horizon'],
      [{ maxParentMillis: '5' },                    false, 'refuses a world horizon that is text'],
      [{ maxParentMillis: NaN },                    false, 'refuses a world horizon that is NaN'],
    ])
    expectCases(VX.boxPutOpts, [
      [{ maxParentMillis: 5 },                      true,  'passes the horizons'],
      [{},                                          true,  'passes no options'],
      [{ maxParentMillis: -1 },                     false, 'refuses a negative horizon'],
    ])

    it("take their fields from the bag given and strip the rest", () => {
      expect(VX.timelyOpts.parse({ maxParentMillis: 5, reseal: true })).to.deep.equal({ maxParentMillis: 5 })
      expect(VX.boxPutOpts.parse({ maxParentMillis: 5, reseal: true })).to.deep.equal({ maxParentMillis: 5, ifAbsent: 'add', ifPresent: 'repl' })
    })

    it("name the failing field", () => {
      const err = TH.expectSyncRefusal(() => VX.timelyOpts.parse({ maxMillisSinceRefresh: -1 }))
      expect(err.meta?.fieldnames).to.deep.equal(['maxMillisSinceRefresh'])
    })
  })
})

describe("SX.ifAbsent and VX.fetchOpts", () => {
  expectCases(SX.ifAbsent, [
    ["fail",     true,  'passes fail'],
    ["nil",      true,  'passes nil'],
    ["create",   false, 'refuses create, which fetch does not offer'],
    [undefined,  false, 'refuses undefined: fetchOpts gives the default, not the check'],
  ])

  expectCases(VX.fetchOpts, [
    [{},                                                true,  'passes no options'],
    [{ ifAbsent: 'nil' },                               true,  'passes ifAbsent nil'],
    [{ ifAbsent: undefined },                           true,  'passes ifAbsent undefined, as a caller spreading options may leave it'],
    [{ ifAbsent: 'fail', maxMillisSinceRefresh: 5 },    true,  'passes ifAbsent beside the timely options'],
    [{ ifAbsent: 'replace' },                           false, 'refuses an ifAbsent that is not one of the two'],
    [{ maxMillisSinceRefresh: -1 },                     false, 'refuses a negative horizon'],
  ])

  it("keeps ifAbsent and the timely options and strips the rest", () => {
    expect(VX.fetchOpts.parse({ ifAbsent: 'nil', maxParentMillis: 5, reseal: true })).to.deep.equal({ ifAbsent: 'nil', maxParentMillis: 5 })
  })

  it("fills a fetch's default: ifAbsent 'fail'", () => {
    expect(VX.fetchOpts.parse({})).to.deep.equal({ ifAbsent: 'fail' })
  })
})

describe("VX.boxCreateOpts", () => {
  it("defaults to ifAbsent 'add' and ifPresent 'fail'", () => {
    expect(VX.boxCreateOpts.parse({})).to.deep.equal({ ifAbsent: 'add', ifPresent: 'fail' })
  })

  it("takes a caller's ifPresent and the timely options, stripping the rest", () => {
    expect(VX.boxCreateOpts.parse({ ifPresent: 'repl', maxParentMillis: 5, reseal: true })).to.deep.equal({ ifAbsent: 'add', ifPresent: 'repl', maxParentMillis: 5 })
  })

  it("refuses an ifAbsent other than 'add'", () => {
    TH.expectSyncRefusal(() => VX.boxCreateOpts.parse({ ifAbsent: 'fail' }))
  })
})

describe("SX.ifPresent and VX.boxPutOpts", () => {

  expectCases(SX.ifPresent, [
    ["repl",     true,  'passes repl'],
    ["fail",     true,  'passes fail'],
    ["get",      true,  'passes get'],
    ["replace",  false, 'refuses replace, which it does not spell'],
    [undefined,  false, 'refuses undefined: boxPutOpts gives the default, not the check'],
  ])

  expectCases(VX.boxPutOpts, [
    [{ ifPresent: 'repl' },                             true,  'passes ifPresent repl'],
    [{ ifPresent: undefined },                          true,  'passes ifPresent undefined'],
    [{ ifPresent: 'repl', maxParentMillis: 5 },         true,  'passes ifPresent beside the timely options'],
    [{ ifPresent: 'replace' },                          false, 'refuses an ifPresent it does not offer'],
    [{ maxMillisSinceRefresh: -1, ifPresent: 'repl' },  false, 'refuses a negative horizon'],
  ])

  it("keeps ifPresent, ifAbsent and the timely options and strips the rest", () => {
    expect(VX.boxPutOpts.parse({ ifPresent: 'repl', maxParentMillis: 5, ifAbsent: 'add', reseal: true })).to.deep.equal({ ifPresent: 'repl', maxParentMillis: 5, ifAbsent: 'add' })
  })

  it("fills a put's defaults: ifAbsent 'add', ifPresent 'repl'", () => {
    expect(VX.boxPutOpts.parse({})).to.deep.equal({ ifAbsent: 'add', ifPresent: 'repl' })
  })

  it("refuses ifAbsent 'nil'", () => {
    TH.expectSyncRefusal(() => VX.boxPutOpts.parse({ ifAbsent: 'nil' }))
  })

  it("name the failing field", () => {
    const err = TH.expectSyncRefusal(() => VX.boxPutOpts.parse({ ifPresent: 'fetch' }))
    expect(err.meta?.fieldnames).to.deep.equal(['ifPresent'])
  })
})

describe("The checks of the listing's making", () => {
  describe("VX.listingOpts", () => {
    const opts = { bankDB: mw.bankDB, maxMillisSinceRefresh: 1000 }
    expectCases(VX.listingOpts, [
      [opts,                                           true,  'passes the test bankDB and a horizon'],
      [{ ...opts, maxMillisSinceRefresh: Infinity },   true,  'passes a horizon of Infinity'],
      [{ ...opts, bankDB: { tryPutBox: () => null } }, false, 'refuses a bankDB with no tryGetBox'],
      [{ ...opts, maxMillisSinceRefresh: -1 },         false, 'refuses a negative horizon'],
      [{ ...opts, maxMillisSinceRefresh: undefined },  false, 'refuses a missing horizon'],
      [{ ...opts, askUser: null },                     false, 'refuses an askUser, which only a bank listing takes'],
      [{ ...opts, world: mw.world },                   false, 'refuses a world, which the listing takes beside its options'],
      [{ ...opts, extra: 1 },                          false, 'refuses an option it does not accept, being strict'],
    ])

    it("names the failing field", () => {
      const err = TH.expectSyncRefusal(() => VX.listingOpts.parse({ ...opts, maxMillisSinceRefresh: -1 }))
      expect(err.meta?.fieldnames).to.deep.equal(['maxMillisSinceRefresh'])
    })
  })

  describe("VX.bankListingOpts", () => {
    const opts = { bankDB: mw.bankDB, maxMillisSinceRefresh: 1000, askUser: null }
    expectCases(VX.bankListingOpts, [
      [opts,                                                   true,  'passes a listing\'s options with no host dialog'],
      [{ ...opts, askUser: () => Promise.resolve(true) },      false, 'refuses an askUser that guardRequestCleartext did not wrap'],
      [{ ...opts, askUser: undefined },                        false, 'refuses a missing askUser'],
      [{ ...opts, maxMillisSinceRefresh: -1 },                 false, 'refuses a negative horizon'],
      [{ ...opts, extra: 1 },                                  false, 'refuses an option it does not accept, being strict'],
    ])
  })

  describe("VX.listedUnder", () => {
    expectCases(VX.listedUnder.vault, [
      [mw.world,               true,  'passes the test vault'],
      [mw.world.bank,          false, 'refuses a bank'],
      [{},                     false, 'refuses an object with no modelkind'],
      [null,                   false, 'refuses null'],
    ])
    expectCases(VX.listedUnder.bank, [
      [mw.world.bank,          true,  'passes the test bank'],
      [mw.world,               false, 'refuses a vault'],
    ])
    expectCases(VX.listedUnder.device, [
      [mw.world.bank.device,   true,  'passes the test device'],
      [mw.world.bank,          false, 'refuses a bank'],
    ])
  })

  describe("VX.storableArgs", () => {
    const listing = boxListingOf(mw)
    const args = { listing, central: sparse }
    expectCases(VX.storableArgs, [
      [args,                                           true,  'passes a listing and a central'],
      [{ ...args, central: gone },                     true,  'passes a tombstone'],
      [{ ...args, central: null },                     false, 'refuses a null central'],
      [{ ...args, central: { am: 'a' } },              false, 'refuses a central that fails sparseBase'],
      [{ ...args, listing: {} },                       false, 'refuses a listing with no listing modelkind'],
      [{ ...args, listing: undefined },                false, 'refuses a missing listing'],
      [{ ...args, world: mw.world },                   false, 'refuses a world, the listing being the thing above it'],
      [{ ...args, opts: { maxMillisSinceRefresh: 1000 } }, false, "refuses options, the horizon being the listing's"],
      [{ ...args, extra: 1 },                          false, 'refuses an argument it does not accept, being strict'],
    ])

    it("names the failing field", () => {
      const err = TH.expectSyncRefusal(() => VX.storableArgs.parse({ ...args, listing: {} }))
      expect(err.meta?.fieldnames).to.deep.equal(['listing'])
    })
  })
})
