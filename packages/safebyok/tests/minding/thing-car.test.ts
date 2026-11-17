import { describe, expect, it } from 'vitest'
import { type ThingCar, carOf, isThingCar, isVaultDBNewer, mergedCarOf } from '../../src/minding/thing-car'
import { type Thing, shellOf, sparseOf } from '../../src/storage/shapes-thing'
import * as TH from '../test-helpers'

const Box0      = TH.boxThingOf()
const Box1      = TH.nextOf(Box0)
const Box2      = TH.nextOf(Box1)
const BoxGone   = TH.boxTombOf(Box2)
const BoxReborn = TH.boxRebornOf(BoxGone)
const BoxShell  = shellOf(TH.BoxScope, TH.rootBoxOf())

/** The car `behind`, of the sparse `newest` and the older whole `fullest`, as a merge leaves it. */
function behindOf(newest: Thing, fullest: Thing): ThingCar<Thing> {
  return { liveness: 'behind', newest: sparseOf(newest), fullest }
}

describe("carOf", () => {
  const CarCases = [
    [Box0,                      'full', Box0,      'a whole live record is full'],
    [sparseOf(Box0),            'bare', undefined, 'a sparse live record is bare'],
    [BoxGone,                   'gone', null,      'a whole tombstone is gone'],
    [sparseOf(BoxGone),         'gone', null,      'a sparse tombstone is gone'],
    [BoxShell,                  'void', null,      'the void sentinel is void'],
  ] as const
  for (const [record, liveness, fullest, blurb] of CarCases) {
    it(blurb, () => {
      const car = carOf(record)
      expect(car).to.deep.equal({ liveness, newest: record, fullest })
      expect(car.newest).to.eq(record)
      expect(Object.isFrozen(car)).to.be.true
    })
  }

  it("holds one record in both fields of a full car", () => {
    const car = carOf(Box0)
    expect(car.fullest).to.eq(car.newest)
  })
})

describe("mergedCarOf", () => {
  it("keeps the car that lands over nothing", () => {
    const car = carOf(Box0)
    expect(mergedCarOf(undefined, car)).to.eq(car)
  })

  const MergeCases = [
    // the newest revision, and the newest whole record:
    [carOf(Box0),               carOf(Box1),               carOf(Box1),                'a later whole record makes a full car of it'],
    [carOf(Box0),               carOf(sparseOf(Box1)),     behindOf(Box1, Box0),       'a later sparse record leaves the whole one behind it'],
    [carOf(sparseOf(Box1)),     carOf(Box0),               behindOf(Box1, Box0),       'an older whole record under a newer sparse one is kept behind it'],
    [behindOf(Box2, Box0),      carOf(Box1),               behindOf(Box2, Box1),       'a newer whole record, still older than the newest, moves up behind it'],
    [behindOf(Box1, Box0),      carOf(Box1),               carOf(Box1),                'the whole record of the newest revision makes the car full'],
    [carOf(sparseOf(Box0)),     carOf(Box0),               carOf(Box0),                'the whole record of a bare revision makes the car full'],
    // tombstones and lives:
    [behindOf(Box1, Box0),      carOf(BoxGone),            carOf(BoxGone),             'a whole tombstone replaces the older whole record'],
    [behindOf(Box1, Box0),      carOf(sparseOf(BoxGone)),  carOf(sparseOf(BoxGone)),   'a sparse tombstone replaces the older whole record'],
    [carOf(Box2),               carOf(sparseOf(BoxReborn)), carOf(sparseOf(BoxReborn)), 'a later life heard sparse keeps no whole record of the earlier life'],
    [carOf(BoxShell),           carOf(sparseOf(Box0)),     carOf(sparseOf(Box0)),      'any record replaces the void sentinel'],
  ] as const
  for (const [prior, landed, expected, blurb] of MergeCases) {
    it(blurb, () => {
      expect(mergedCarOf(prior, landed)).to.deep.equal(expected)
    })
  }

  const KeptCases = [
    [carOf(Box1),               carOf(Box0),               'an older record lands under a full car'],
    [carOf(Box1),               carOf({ ...Box1 }),        'an equal revision lands on a full car'],
    [carOf(Box1),               carOf(sparseOf(Box1)),     'a sparse equal revision lands on a full car'],
    [carOf(sparseOf(Box1)),     carOf(sparseOf(Box1)),     'a sparse equal revision lands on a bare car'],
    [behindOf(Box2, Box1),      carOf(Box0),               'a whole record older than the fullest lands on a behind car'],
    [carOf(BoxGone),            carOf(Box2),               'the whole record before the tombstone lands on a gone car'],
    [carOf(sparseOf(BoxGone)),  carOf(BoxGone),            'a whole tombstone lands on a sparse one'],
  ] as const
  for (const [prior, landed, blurb] of KeptCases) {
    it(`keeps the prior car where ${blurb}`, () => {
      expect(mergedCarOf(prior, landed)).to.eq(prior)
    })
  }

  it("keeps the unchanged parts of a later record as they were, and freezes the car", () => {
    const prior  = carOf(Box0)
    const merged = mergedCarOf(prior, carOf(structuredClone(Box1)))
    expect(merged).to.have.nested.property('newest.whisper_sealed').that.eq(Box0.whisper_sealed)
    expect(merged.newest).to.eq(merged.fullest)
    expect(Object.isFrozen(merged)).to.be.true
  })

  it("takes the car of a Thing at another scope, whatever its revision", () => {
    const theirs = carOf(TH.boxThingOf('anthropic'))
    expect(mergedCarOf(carOf(Box1), theirs)).to.eq(theirs)
  })

  const BrokenCars = [
    [{ liveness: 'full',   newest: Box0,           fullest: { ...Box0 } },  'a full car of two records'],
    [{ liveness: 'full',   newest: sparseOf(Box0), fullest: sparseOf(Box0) }, 'a full car of a sparse record'],
    [{ liveness: 'bare',   newest: Box0,           fullest: undefined },    'a bare car of a whole record'],
    [{ liveness: 'behind', newest: sparseOf(Box0), fullest: Box1 },         'a behind car whose fullest is newer'],
    [{ liveness: 'behind', newest: sparseOf(BoxReborn), fullest: Box0 },    'a behind car whose fullest is of an earlier life'],
    [{ liveness: 'gone',   newest: Box0,           fullest: null },         'a gone car of a live record'],
    [{ liveness: 'void',   newest: sparseOf(BoxGone), fullest: null },      'a void car of a tombstone'],
    [{ liveness: 'gone',   newest: BoxGone,        fullest: undefined },    'a gone car whose fullest is undefined'],
  ] as const
  for (const [car, blurb] of BrokenCars) {
    it(`refuses ${blurb} on the way out`, () => {
      TH.expectSyncRefusal(() => mergedCarOf(undefined, car as ThingCar<Thing>), 'unexpected_error')
    })
  }
})

describe("isThingCar", () => {
  it("is true of a car, and false of a record and of other values", () => {
    expect(isThingCar(carOf(Box0))).to.be.true
    for (const val of [Box0, null, undefined, 'full', { liveness: 'alive' }]) { expect(isThingCar(val)).to.be.false }
  })
})

describe("isVaultDBNewer", () => {
  it("is true of a behind or bare car, and false of the rest", () => {
    const cars = [carOf(Box0), behindOf(Box1, Box0), carOf(sparseOf(Box0)), carOf(BoxGone), carOf(BoxShell)]
    expect(cars.map((car) => [car.liveness, isVaultDBNewer(car)])).to.deep.equal([['full', false], ['behind', true], ['bare', true], ['gone', false], ['void', false]])
  })
})
