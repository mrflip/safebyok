import { describe, expect, it } from 'vitest'
import { agerankOf, bestCarOf, carOf, dbHasNewer, isThingCar } from '../../src/minding/thing-car'
import type { ThingCar } from '../../src/shapes/shapes-minder'
import type { LiveOf } from '../../src/shapes/shapes-sealers'
import { type BoxRecord, type ThingRecord, Shell } from '../../src/shapes/shapes-thing'
import { Thing } from '../../src/models/thing'
import * as TH from '../test-helpers'

const Box0      = TH.boxThingOf()
const Box1      = TH.nextOf(Box0)
const Box2      = TH.nextOf(Box1)
const BoxGone   = TH.boxTombOf(Box2)
const BoxReborn = TH.boxRebornOf(BoxGone)
const BoxShell  = Shell.of(TH.BoxScope, TH.rootBoxOf())

/** The car `bhnd`, of the sparse `newest` and the older whole `fullest`, as a merge leaves it. */
function bhndOf(newest: ThingRecord, fullest: ThingRecord): ThingCar<ThingRecord> {
  return withAgerank({ liveness: 'bhnd', newest: Thing.sparseOf(newest), fullest })
}

/** `fields`, a car's liveness and records, sound or not, with the agerank they make. */
function withAgerank<FieldsT extends Pick<ThingCar<ThingRecord>, 'liveness' | 'newest' | 'fullest'>>(fields: FieldsT): FieldsT & { agerank: string } {
  return { ...fields, agerank: agerankOf(fields) }
}

/** `car`'s liveness, and the life and revision of each of its records. */
function revisionsOf(car: ThingCar<ThingRecord>) {
  return {
    liveness: car.liveness,
    newest:   [car.newest.lifepath, car.newest.revseq],
    fullest:  car.fullest && [car.fullest.lifepath, car.fullest.revseq],
  }
}

describe("carOf", () => {
  const CarCases = [
    [Box0,               "full", Box0,      'a whole live record is full'],
    [Thing.sparseOf(Box0),     "bare", undefined, 'a sparse live record is bare'],
    [BoxGone,            "gone", null,      'a whole tombstone is gone'],
    [Thing.sparseOf(BoxGone),  "gone", null,      'a sparse tombstone is gone'],
    [BoxShell,           "void", null,      'the void sentinel is void'],
  ] as const
  for (const [record, liveness, fullest, blurb] of CarCases) {
    it(blurb, () => {
      const car = carOf(record)
      expect(car).to.deep.equal(withAgerank({ liveness, newest: record, fullest }))
      expect(car.newest).to.eq(record)
      expect([Object.isFrozen(car), Object.isFrozen(car.newest)]).to.deep.equal([true, true])
    })
  }

  it("has one record in both fields of a full car", () => {
    const car = carOf(Box0)
    expect(car.fullest).to.eq(car.newest)
  })

  it("makes a bhnd car of a sparse record and an older whole record of its life", () => {
    const car = carOf(Thing.sparseOf(Box1), Box0)
    expect(car).to.deep.equal(bhndOf(Box1, Box0))
    expect(car.fullest).to.eq(Box0)
    expect(Object.isFrozen(car)).to.be.true
  })

  it("freezes each record through, so that no one can write into the cache through a car", () => {
    const later = TH.nextOf(Box0, { sidecar: { account: 'home' } }) as LiveOf<BoxRecord>
    const car   = carOf(Thing.sparseOf(TH.nextOf(later)), later)
    expect([Object.isFrozen(car.newest), Object.isFrozen(car.fullest), Object.isFrozen(later.sidecar)]).to.deep.equal([true, true, true])
    expect(() => { (later.sidecar as Record<string, unknown>)['account'] = 'work' }).to.throw(TypeError)
  })

  it("makes a full car of a whole record, whatever fullest is given", () => {
    expect(carOf(Box1, Box0)).to.deep.equal(carOf(Box1))
  })

  const BadFullests = [
    [Thing.sparseOf(Box1),     Thing.sparseOf(Box0), 'a sparse fullest'],
    [Thing.sparseOf(Box0),     Box1,           'a fullest newer than the record'],
    [Thing.sparseOf(Box1),     { ...Box1 },    'a fullest of the same revision'],
    [Thing.sparseOf(BoxReborn), Box0,          'a fullest of an earlier life'],
  ] as const
  for (const [newest, fullest, blurb] of BadFullests) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => carOf(newest, fullest as ThingRecord), 'bad_record')
    })
  }

  const NotRecords = [
    [undefined,                       'nothing at all'],
    [42,                              'a number'],
    [carOf(Box0),                     'a car'],
    [{ ...Box0, labelpath: 'vault' }, 'a record of a kind no minder serves'],
    [{ ...Thing.sparseOf(Box0), am: 'd' },  'a record marked damaged'],
  ] as const
  for (const [val, blurb] of NotRecords) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => carOf(val as unknown as ThingRecord), 'bad_record')
    })
  }
})

describe("bestCarOf", () => {
  it("returns the car that is delivered over nothing", () => {
    const car = carOf(Box0)
    expect(bestCarOf(undefined, car)).to.eq(car)
  })

  const MergeCases = [
    // the newest revision, and the newest whole record:
    [carOf(Box0),           carOf(Box1),                carOf(Box1),                 'a later whole record makes a full car of it'],
    [carOf(Box0),           carOf(Thing.sparseOf(Box1)),      bhndOf(Box1, Box0),          'a later sparse record leaves the whole one behind it'],
    [carOf(Thing.sparseOf(Box1)), carOf(Box0),                bhndOf(Box1, Box0),          'an older whole record under a newer sparse one stays behind it'],
    [bhndOf(Box2, Box0),    carOf(Box1),                bhndOf(Box2, Box1),          'a newer whole record, still older than the newest, moves up behind it'],
    [bhndOf(Box1, Box0),    carOf(Box1),                carOf(Box1),                 'the whole record of the newest revision makes the car full'],
    [carOf(Thing.sparseOf(Box0)), carOf(Box0),                carOf(Box0),                 'the whole record of a bare revision makes the car full'],
    // tombstones and lives:
    [bhndOf(Box1, Box0),    carOf(BoxGone),             carOf(BoxGone),              'a whole tombstone replaces the older whole record'],
    [bhndOf(Box1, Box0),    carOf(Thing.sparseOf(BoxGone)),   carOf(Thing.sparseOf(BoxGone)),    'a sparse tombstone replaces the older whole record'],
    [carOf(Box2),           carOf(Thing.sparseOf(BoxReborn)), carOf(Thing.sparseOf(BoxReborn)),  'a later life heard sparse has no whole record of the earlier life'],
    [carOf(BoxShell),       carOf(Thing.sparseOf(Box0)),      carOf(Thing.sparseOf(Box0)),       'any record replaces the void sentinel'],
  ] as const
  for (const [prior, delivered, expected, blurb] of MergeCases) {
    it(blurb, () => {
      expect(bestCarOf(prior, delivered)).to.deep.equal(expected)
    })
  }

  const PriorWinsCases = [
    [carOf(Box1),               carOf(Box0),               'an older record arrives under a full car'],
    [carOf(Box1),               carOf({ ...Box1 }),        'an equal revision arrives on a full car'],
    [carOf(Box1),               carOf(Thing.sparseOf(Box1)),     'a sparse equal revision arrives on a full car'],
    [carOf(Thing.sparseOf(Box1)),     carOf(Thing.sparseOf(Box1)),     'a sparse equal revision arrives on a bare car'],
    [bhndOf(Box2, Box1),        carOf(Box0),               'a whole record older than the fullest arrives on a bhnd car'],
    [carOf(BoxGone),            carOf(Box2),               'the whole record before the tombstone arrives on a gone car'],
    [carOf(Thing.sparseOf(BoxGone)),  carOf(BoxGone),            'a whole tombstone arrives on a sparse one'],
  ] as const
  for (const [prior, delivered, blurb] of PriorWinsCases) {
    it(`returns the prior car where ${blurb}`, () => {
      expect(bestCarOf(prior, delivered)).to.eq(prior)
    })
  }

  // Of equal revisions, the merge prefers the first received, so a tombstone received sparse then whole stays sparse: only the revisions are order-free.
  it("makes a car of the same liveness and revisions whichever of two cars arrives first", () => {
    const cars = [...MergeCases, ...PriorWinsCases].flatMap(([prior, delivered]) => [prior, delivered])
    for (const one of cars) {
      for (const other of cars) {
        expect(revisionsOf(bestCarOf(one, other))).to.deep.equal(revisionsOf(bestCarOf(other, one)))
      }
    }
  })

  it("makes a frozen full car of the later record itself, where the prior car has no whole record", () => {
    const later  = structuredClone(Box1)
    const merged = bestCarOf(carOf(Thing.sparseOf(Box1)), carOf(later))
    expect(merged.newest).to.eq(later)
    expect(merged.newest).to.eq(merged.fullest)
    expect(Object.isFrozen(merged)).to.be.true
  })

  it("makes a car no younger than either it merges, by agerank", () => {
    const cars = [...MergeCases, ...PriorWinsCases].flatMap(([prior, delivered]) => [prior, delivered])
    for (const one of cars) {
      for (const other of cars) {
        const merged = bestCarOf(one, other)
        expect((merged.agerank >= one.agerank) && (merged.agerank >= other.agerank), `${one.agerank} with ${other.agerank}`).to.be.true
      }
    }
  })

  // Each delivered record is a clone, so a part is the prior record's own only where the merge shared it.
  describe("shares the prior whole record's unchanged parts with a newer whole record", () => {
    it("in a full car, whose newest is its fullest", () => {
      const merged = bestCarOf(carOf(Box0), carOf(structuredClone(Box1)))
      expect(merged).to.deep.equal(carOf(Box1))
      expect(merged.newest).to.eq(merged.fullest)
      expect((merged.fullest as BoxRecord).whisper_sealed).to.eq(Box0.whisper_sealed)
    })

    it("while the newer record's changed parts stay its own", () => {
      // A live box, which alone has a sidecar.
      const later  = TH.nextOf(Box0, { sidecar: { account: 'home' } })
      const merged = bestCarOf(carOf(Box0), carOf(structuredClone(later)))
      expect(merged.fullest).to.deep.equal(later)
      expect((merged.fullest as BoxRecord).whisper_sealed).to.eq(Box0.whisper_sealed)
      expect((merged.fullest as LiveOf<BoxRecord>).sidecar).to.not.eq((Box0 as LiveOf<BoxRecord>).sidecar)
      expect(Object.isFrozen((merged.fullest as LiveOf<BoxRecord>).sidecar)).to.be.true
    })

    it("in a bhnd car, whose newest stays the prior car's", () => {
      const prior     = bhndOf(Box2, Box0)
      const delivered = carOf(structuredClone(Thing.sparseOf(Box2)), structuredClone(Box1))
      const merged    = bestCarOf(prior, delivered)
      expect(merged).to.deep.equal(bhndOf(Box2, Box1))
      expect(merged.newest).to.eq(prior.newest)
      expect((merged.fullest as BoxRecord).whisper_sealed).to.eq(Box0.whisper_sealed)
    })

    it("in the full car a bhnd car becomes, whose newest is its fullest", () => {
      const merged = bestCarOf(bhndOf(Box1, Box0), carOf(structuredClone(Box1)))
      expect(merged).to.deep.equal(carOf(Box1))
      expect(merged.newest).to.eq(merged.fullest)
      expect((merged.fullest as BoxRecord).whisper_sealed).to.eq(Box0.whisper_sealed)
    })
  })

  const OtherThings = [
    [TH.boxThingOf('anthropic'), 'refuses the car of a Thing at another labelpath'],
    [{ ...Box2, userid: 'u2' },  'refuses the car of a Thing in another bank'],
  ] as const
  for (const [theirs, blurb] of OtherThings) {
    it(blurb, () => {
      TH.expectSyncRefusal(() => bestCarOf(carOf(Box1), carOf(theirs)), 'unexpected_error')
    })
  }

  const BrokenCars = [
    [withAgerank({ liveness: 'full', newest: Box0,                      fullest: { ...Box0 } }),           'a full car of two records'],
    [withAgerank({ liveness: 'full', newest: Thing.sparseOf(Box0),      fullest: Thing.sparseOf(Box0) as ThingRecord }), 'a full car of a sparse record'],
    [withAgerank({ liveness: 'bare', newest: Box0,                      fullest: undefined }),             'a bare car of a whole record'],
    [withAgerank({ liveness: 'bhnd', newest: Thing.sparseOf(Box0),      fullest: Box1 }),                  'a bhnd car whose fullest is newer'],
    [withAgerank({ liveness: 'bhnd', newest: Thing.sparseOf(BoxReborn), fullest: Box0 }),                  'a bhnd car whose fullest is of an earlier life'],
    [withAgerank({ liveness: 'gone', newest: Box0,                      fullest: null }),                  'a gone car of a live record'],
    [withAgerank({ liveness: 'gone', newest: BoxShell,                  fullest: null }),                  'a gone car of the void sentinel'],
    [withAgerank({ liveness: 'void', newest: Thing.sparseOf(BoxGone),   fullest: null }),                  'a void car of a tombstone'],
    [withAgerank({ liveness: 'gone', newest: BoxGone,                   fullest: undefined }),             'a gone car whose fullest is undefined'],
    [{ ...carOf(Box1), agerank: carOf(Box0).agerank },                                                     'a car whose agerank is of other records'],
    [{ liveness: 'full', newest: Box0,                                  fullest: Box0 },                   'a car without its agerank'],
  ] as const
  for (const [car, blurb] of BrokenCars) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => bestCarOf(undefined, car), 'unexpected_error')
    })
  }

  const NotCarPairs = [
    [undefined,   Box0,        'a record delivered'],
    [undefined,   null,        'null delivered'],
    [Box0,        carOf(Box0), 'a record as the prior'],
    [null,        carOf(Box0), 'null as the prior'],
    [carOf(Box0), undefined,   'nothing delivered over a car'],
  ] as const
  for (const [prior, delivered, blurb] of NotCarPairs) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => bestCarOf(prior, delivered), 'unexpected_error')
    })
  }
})

describe("isThingCar", () => {
  it("is true of each car a merge may return", () => {
    for (const car of [carOf(Box0), bhndOf(Box1, Box0), carOf(Thing.sparseOf(Box0)), carOf(BoxGone), carOf(BoxShell)]) { expect(isThingCar(car)).to.be.true }
  })

  const NotCars = [
    [Box0,                                                  'a record'],
    [null,                                                  'null'],
    ["full",                                                'a liveness alone'],
    [{ liveness: 'alive' },                                 'an object of another liveness'],
    [{ liveness: 'full', label: 'openai' },                 'a selected value that carries a liveness'],
    [{ liveness: 'bhnd' },                                  'a liveness with no records'],
    [withAgerank({ liveness: 'full', newest: Box0, fullest: { ...Box0 } }), 'a car that breaks its rules'],
  ] as const
  for (const [val, blurb] of NotCars) {
    it(`is false of ${blurb}`, () => { expect(isThingCar(val)).to.be.false })
  }
})

describe("dbHasNewer", () => {
  it("is true of a bhnd or bare car, and false of the rest", () => {
    const cars = [carOf(Box0), bhndOf(Box1, Box0), carOf(Thing.sparseOf(Box0)), carOf(BoxGone), carOf(BoxShell)]
    expect(cars.map((car) => [car.liveness, dbHasNewer(car)])).to.deep.equal([['full', false], ['bhnd', true], ['bare', true], ['gone', false], ['void', false]])
  })

  it("reads the liveness alone", () => {
    expect([dbHasNewer({ liveness: 'bare' }), dbHasNewer({ liveness: 'full' })]).to.deep.equal([true, false])
  })
})

describe("agerankOf", () => {
  it("joins the newest's lifepath and revseq, the liveness, and the fullest's revseq, each of fixed width", () => {
    const { lifepath } = Box0
    const ageranks = [carOf(Box0), carOf(Thing.sparseOf(Box1)), bhndOf(Box2, Box1), carOf(BoxShell)].map((car) => car.agerank)
    expect(ageranks).to.deep.equal([
      `${lifepath}~0000000000~full~0000000000`,
      `${lifepath}~0000000001~bare~----------`,
      `${lifepath}~0000000002~bhnd~0000000001`,
      `${BoxShell.lifepath}~-000000001~void~-000000001`,
    ])
  })

  it("spells each revseq in padded base-32 digits", () => {
    const later = { ...Box0, revseq: 1234 }
    expect(carOf(later).agerank).to.equal(`${Box0.lifepath}~000000016i~full~000000016i`)
  })

  it("ranks each car of a Thing above every older car of it", () => {
    const BoxBorn2 = TH.nextOf(BoxReborn)
    const oldestFirst = [
      carOf(BoxShell),
      carOf(Thing.sparseOf(Box0)),      carOf(Box0),
      carOf(Thing.sparseOf(Box1)),      bhndOf(Box1, Box0),  carOf(Box1),
      carOf(Thing.sparseOf(Box2)),      bhndOf(Box2, Box0),  bhndOf(Box2, Box1), carOf(Box2),
      carOf(Thing.sparseOf(BoxGone)),
      carOf(Thing.sparseOf(BoxReborn)), carOf(BoxReborn),
      carOf(Thing.sparseOf(BoxBorn2)),  bhndOf(BoxBorn2, BoxReborn),
    ].map((car) => car.agerank)
    expect(oldestFirst.toSorted((one, other) => ((one < other) ? -1 : 1))).to.deep.equal(oldestFirst) // eslint-disable-line unicorn/prefer-simple-sort-comparator
    expect(new Set(oldestFirst).size).to.equal(oldestFirst.length)
  })

  it("ranks a gone car heard sparse and heard whole alike", () => {
    expect(carOf(Thing.sparseOf(BoxGone)).agerank).to.equal(carOf(BoxGone).agerank)
  })
})
