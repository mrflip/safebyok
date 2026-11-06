import { afterEach, describe, expect, it } from 'vitest'
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
    holdsCases(VX.horizonMillis, 'bad_option', [
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
  })

  describe("VX.timelyOpts and VX.boxPutOpts", () => {
    holdsCases(VX.timelyOpts, 'bad_option', [
      [{},                                          true,  'passes no options'],
      [{ maxMillisSinceRefresh: 0, maxWorldMillis: Infinity }, true, 'passes both horizons'],
      [{ maxMillisSinceRefresh: undefined },        true,  'passes a horizon left undefined'],
      [{ maxMillisSinceRefresh: -1 },               false, 'refuses a negative record horizon'],
      [{ maxWorldMillis: '5' },                     false, 'refuses a world horizon that is text'],
      [{ maxWorldMillis: NaN },                     false, 'refuses a world horizon that is NaN'],
    ])
    holdsCases(VX.boxPutOpts, 'bad_option', [
      [{ maxWorldMillis: 5 },                       true,  'passes the horizons'],
      [{},                                          true,  'passes no options'],
      [{ maxWorldMillis: -1 },                      false, 'refuses a negative horizon'],
    ])

    it("take their fields from the bag given and strip the rest", () => {
      expect(VX.timelyOpts.parse({ maxWorldMillis: 5, reseal: true })).to.deep.equal({ maxWorldMillis: 5 })
      expect(VX.boxPutOpts.parse({ maxWorldMillis: 5, reseal: true })).to.deep.equal({ maxWorldMillis: 5 })
    })

    it("name the failing field", () => {
      const err = TH.expectSyncRefusal(() => VX.timelyOpts.parse({ maxMillisSinceRefresh: -1 }), 'bad_option')
      expect(err.meta?.fieldnames).to.deep.equal(['maxMillisSinceRefresh'])
    })
  })

  describe("VX.storableOpts", () => {
    holdsCases(VX.storableOpts, 'bad_option', [
      [{ maxMillisSinceRefresh: 60_000 },                    true,  'passes the horizon alone'],
      [{},                                                   false, 'refuses a missing horizon'],
      [{ maxMillisSinceRefresh: -5 },                        false, 'refuses a negative horizon'],
    ])

    it("strips a field it does not take", () => {
      expect(VX.storableOpts.parse({ maxMillisSinceRefresh: 5, extra: 1 })).to.deep.equal({ maxMillisSinceRefresh: 5 })
    })
  })
})

describe("VX.ifAbsent and VX.fetchOpts", () => {
  holdsCases(VX.ifAbsent, 'bad_option', [
    ["fail",     true,  'passes fail'],
    ["nil",      true,  'passes nil'],
    ["create",   false, 'refuses create, which fetch does not offer'],
    [undefined,  false, 'refuses undefined: the default is applied by the caller, not the check'],
  ])

  holdsCases(VX.fetchOpts, 'bad_option', [
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
})

describe("VX.boxCreateOpts", () => {
  it("fills what a create means: add where nothing stands, fail over a live record", () => {
    expect(VX.boxCreateOpts.parse({})).to.deep.equal({ ifAbsent: 'add', ifPresent: 'fail' })
  })

  it("takes a caller's ifPresent and the timely options, stripping the rest", () => {
    expect(VX.boxCreateOpts.parse({ ifPresent: 'repl', maxWorldMillis: 5, reseal: true })).to.deep.equal({ ifAbsent: 'add', ifPresent: 'repl', maxWorldMillis: 5 })
  })

  it("holds ifAbsent to 'add': a create that must find a box is not a create", () => {
    TH.expectSyncRefusal(() => VX.boxCreateOpts.parse({ ifAbsent: 'fail' }), 'bad_option')
  })
})

describe("VX.ifPresent and VX.boxPutOpts", () => {

  holdsCases(VX.ifPresent, 'bad_option', [
    ["repl",     true,  'passes repl'],
    ["fail",     true,  'passes fail'],
    ["get",      true,  'passes get'],
    ["replace",  false, 'refuses replace, which it does not spell'],
    [undefined,  false, 'refuses undefined: boxPutOpts makes it optional, not the check'],
  ])

  holdsCases(VX.boxPutOpts, 'bad_option', [
    [{ ifPresent: 'repl' },                             true,  'passes ifPresent repl'],
    [{ ifPresent: undefined },                          true,  'passes ifPresent undefined'],
    [{ ifPresent: 'repl', maxWorldMillis: 5 },          true,  'passes ifPresent beside the timely options'],
    [{ ifPresent: 'replace' },                          false, 'refuses an ifPresent it does not offer'],
    [{ maxMillisSinceRefresh: -1, ifPresent: 'repl' },  false, 'refuses a negative horizon'],
  ])

  it("keeps ifPresent, ifAbsent and the timely options and strips the rest", () => {
    expect(VX.boxPutOpts.parse({ ifPresent: 'repl', maxWorldMillis: 5, ifAbsent: 'add', reseal: true })).to.deep.equal({ ifPresent: 'repl', maxWorldMillis: 5, ifAbsent: 'add' })
  })

  it("leaves the defaults to box.put: nothing given, nothing filled", () => {
    expect(VX.boxPutOpts.parse({})).to.deep.equal({})
  })

  it("refuses a fetch's ifAbsent: 'nil' is no answer to a put", () => {
    TH.expectSyncRefusal(() => VX.boxPutOpts.parse({ ifAbsent: 'nil' }), 'bad_option')
  })

  it("name the failing field", () => {
    const err = TH.expectSyncRefusal(() => VX.boxPutOpts.parse({ ifPresent: 'fetch' }), 'bad_option')
    expect(err.meta?.fieldnames).to.deep.equal(['ifPresent'])
  })
})

describe("The checks of the world and the listing", () => {
  describe("VX.world", () => {
    holdsCases(VX.world, 'bad_option', [
      [mw.world, true,  'passes the test world'],
      [{},       true,  'passes an empty object'],
      [null,     false, 'refuses null'],
      [5,        false, 'refuses a number'],
    ])
  })

  describe("VX.listingOpts", () => {
    const opts = { world: mw.world, vaultDB: mw.vaultDB, maxMillisSinceRefresh: 1000 }
    holdsCases(VX.listingOpts, 'bad_option', [
      [opts,                                                     true,  'passes the test world and vaultDB'],
      [{ ...opts, maxMillisSinceRefresh: Infinity },             true,  'passes a horizon of Infinity'],
      [{ ...opts, world: undefined },                            false, 'refuses a missing world'],
      [{ ...opts, world: { ...mw.world, takeWorld: undefined } }, false, 'refuses a world that cannot takeWorld'],
      [{ ...opts, world: { ...mw.world, ensureTimely: 5 } },     false, 'refuses a world whose ensureTimely is no function'],
      [{ ...opts, world: { ...mw.world, lockState: undefined } }, false, 'refuses a world with no lockState'],
      [{ ...opts, vaultDB: { tryPutBox: () => null } },          false, 'refuses a vaultDB with no tryGetBox'],
      [{ ...opts, maxMillisSinceRefresh: -1 },                   false, 'refuses a negative horizon'],
      [{ ...opts, maxMillisSinceRefresh: undefined },            false, 'refuses a missing horizon'],
      [{ ...opts, world: { ...mw.world, tellBadNews: undefined } }, false, 'refuses a world that cannot tellBadNews'],
      [{ ...opts, onBadNews: () => null },                       false, 'refuses an onBadNews, which only a bank takes'],
      [{ ...opts, extra: 1 },                                    false, 'refuses an option it does not take, being strict'],
    ])

    it("names the failing field", () => {
      const err = TH.expectSyncRefusal(() => VX.listingOpts.parse({ ...opts, maxMillisSinceRefresh: -1 }), 'bad_option')
      expect(err.meta?.fieldnames).to.deep.equal(['maxMillisSinceRefresh'])
    })
  })

  describe("VX.storableArgs", () => {
    const listing = boxListingOf(mw)
    const args = { world: mw.world, listing, central: sparse, opts: { maxMillisSinceRefresh: 1000 } }
    holdsCases(VX.storableArgs, 'bad_option', [
      [args,                                           true,  'passes a world, a listing, a central and the options'],
      [{ ...args, central: gone },                     true,  'passes a tombstone'],
      [{ ...args, central: null },                     false, 'refuses a null central'],
      [{ ...args, central: { am: 'a' } },              false, 'refuses a central that fails sparseBase'],
      [{ ...args, listing: {} },                       false, 'refuses a listing that answers to no IsListing'],
      [{ ...args, listing: undefined },                false, 'refuses a missing listing'],
      [{ ...args, world: null },                       false, 'refuses a null world'],
      [{ ...args, opts: {} },                          false, 'refuses options with no horizon'],
      [{ ...args, opts: { maxMillisSinceRefresh: -1 } }, false, 'refuses a negative horizon'],
      [{ ...args, extra: 1 },                          false, 'refuses an argument it does not take, being strict'],
    ])

    it("names the failing field", () => {
      const err = TH.expectSyncRefusal(() => VX.storableArgs.parse({ ...args, listing: {} }), 'bad_option')
      expect(err.meta?.fieldnames).to.deep.equal(['listing'])
    })
  })
})
