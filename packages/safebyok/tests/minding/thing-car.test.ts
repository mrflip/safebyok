/** A ThingCar: what `ThingCar.make` takes and makes, and how `receive` keeps its refusal and read_tc. */

import { describe, expect, it, vi } from 'vitest'
import { Box } from '../../src/models/box'
import { Thing } from '../../src/models/thing'
import { ThingCar } from '../../src/minding/thing-car'
import type { CarWorld } from '../../src/shapes/shapes-vault-minder'
import type { ReadTc, SeenThing } from '../../src/shapes/shapes-vault-event'
import { VacantReadTc, readAtOf, readTcNow } from '../../src/storage/agerank'
import * as TH from '../test-helpers'

/** A box's revisions: `two`, which a {@link TH.RefusingThing} takes, and `three` after it, which it refuses. */
const Revs = (() => {
  const two = TH.nextOf(TH.nextOf(TH.boxThingOf()))
  return { two, three: TH.nextOf(two) }
})()

/** A world that makes a {@link TH.RefusingThing} at each labelpath. */
const RefusingWorld: CarWorld<TH.RefusingThing> = Object.freeze({ makeThing: (shell) => TH.RefusingThing.make(shell) })

/** A read_tc read at `millis` past the epoch. */
function readTcAt(millis: number): ReadTc {
  const hex = millis.toString(16).padStart(12, '0')
  return `${hex.slice(0, 8)}-${hex.slice(8)}-7000-8000-000000000000`
}

/** Have `car` receive the item event of `record` read at `read_tc`, a car of a plain Thing made at `record`'s shell where there is none yet, and return the car. */
function carReceived(car: ThingCar | undefined, record: SeenThing, read_tc: ReadTc = readTcNow()): ThingCar {
  const receiver = car ?? ThingCar.make(Thing.shellOf(record), { world: TH.PlainWorld })
  receiver.receive({ ...TH.thingEventOf(record), read_tc })
  return receiver
}

/** What `car` holds, as a plain object. */
function carFieldsOf(car: ThingCar): Pick<ThingCar, 'thing' | 'lastErr' | 'erred_at' | 'read_tc'> {
  return { thing: car.thing, lastErr: car.lastErr, erred_at: car.erred_at, read_tc: car.read_tc }
}

describe("ThingCar.make(begun, { world })", () => {
  it("made from a Thing, carries that Thing, and has taken nothing", () => {
    const thing = TH.PlainThing.make(Thing.shellOf(TH.boxThingOf()))
    const car   = ThingCar.make(thing, { world: TH.PlainWorld })
    expect(carFieldsOf(car)).to.deep.equal({ thing, lastErr: null, erred_at: null, read_tc: VacantReadTc })
  })

  it("made from the shell, carries the Thing its world makes there, which has received nothing", () => {
    const makeThing = vi.fn(TH.makePlainThing)
    const shell     = Thing.shellOf(TH.boxThingOf())
    const car       = ThingCar.make(shell, { world: { makeThing } })
    expect(makeThing.mock.calls).to.deep.equal([[shell]])
    expect(car.thing).to.equal(makeThing.mock.results[0]!.value)
    expect([car.thing.agekind, car.read_tc]).to.deep.equal(['vacant', VacantReadTc])
  })

  it("made from an item event, has the Thing its world makes at the record's shell receive it, and keeps when it was read", () => {
    const makeThing = vi.fn(TH.makePlainThing)
    const event     = TH.thingEventOf(TH.boxThingOf())
    const car       = ThingCar.make(event, { world: { makeThing } })
    expect(makeThing.mock.calls).to.deep.equal([[Thing.shellOf(event.val)]])
    expect(carFieldsOf(car)).to.deep.equal({ thing: car.thing, lastErr: null, erred_at: null, read_tc: event.read_tc })
    expect(car.thing.pickle()).to.equal(event.val)
  })

  it("made from an item event its Thing refuses, still answers the car, its Thing at the shell, keeping the refusal", () => {
    const car = ThingCar.make(TH.thingEventOf(Revs.three), { world: RefusingWorld })
    expect(car.thing.pickle()).to.deep.equal(Thing.shellOf(Revs.three))
    expect(car.lastErr?.refusalkind).to.eq('unexpected_error')
    expect(car.erred_at).to.be.a('number')
    expect(car.read_tc).to.eq(VacantReadTc)
  })

  it("carries the Thing of its kind that a device's world makes", () => {
    const car = ThingCar.make(Thing.shellOf(TH.boxThingOf()), { world: TH.makeDevice().world })
    expect(car.thing).to.be.instanceOf(Box)
  })

  it("throws where its world refuses to make the Thing, as a device's does a record of another bank", () => {
    TH.expectSyncRefusal(() => ThingCar.make(TH.thingEventOf({ ...TH.boxThingOf(), userid: 'u2' }), { world: TH.makeDevice().world }), 'record_conflict')
  })

  const RefusedBegun = [
    [null,                                                      'nothing at all'],
    [42,                                                        'a number'],
    [TH.boxThingOf(),                                           'a whole record with no item event'],
    [{ ...TH.thingEventOf(TH.boxThingOf()), read_tc: undefined }, 'an item event read at no time'],
    [{ ...TH.thingEventOf(TH.boxThingOf()), banktok: 'none' },    'an item event whose banktok is no lifetok'],
  ] as const

  for (const [begun, blurb] of RefusedBegun) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => ThingCar.make(begun as never, { world: TH.PlainWorld }), 'bad_record')
    })
  }

  const RefusedOpts = [
    [undefined,                       'no options'],
    [{},                              'no world'],
    [{ world: { makeThing: 'plain' } }, 'a world whose makeThing is no function'],
  ] as const

  for (const [opts, blurb] of RefusedOpts) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => ThingCar.make(Thing.shellOf(TH.boxThingOf()), opts as never), 'bad_record')
    })
  }

  it("is frozen, its Thing its one own field", () => {
    const car = ThingCar.make(Thing.shellOf(TH.boxThingOf()), { world: TH.PlainWorld })
    expect(Object.isFrozen(car)).to.eq(true)
    expect(Object.keys(car)).to.deep.equal(['thing'])
  })
})

describe("car.receive(event)", () => {
  it("returns the events its Thing returns, and moves read_tc only for a record that is news", () => {
    const car     = ThingCar.make(Thing.shellOf(Revs.two), { world: TH.PlainWorld })
    const event   = TH.thingEventOf(Revs.two)
    const events  = car.receive(event)
    expect(events.map(({ eventkind }) => eventkind)).to.deep.equal(['item', 'life'])
    expect(car.read_tc).to.eq(event.read_tc)
    expect(car.receive({ ...event, read_tc: readTcNow() })).to.deep.equal([])
    expect(car.read_tc).to.eq(event.read_tc)
  })

  it("keeps and throws its Thing's refusal and when, then clears it at a record taken, keeping when", () => {
    const car = ThingCar.make(TH.thingEventOf(Revs.two), { world: RefusingWorld })
    TH.expectSyncRefusal(() => car.receive(TH.thingEventOf(Revs.three)), 'unexpected_error')
    const { lastErr, erred_at } = car
    expect(lastErr?.refusalkind).to.eq('unexpected_error')
    expect(erred_at).to.be.a('number')
    car.receive(TH.thingEventOf(Revs.two))
    expect([car.lastErr, car.erred_at]).to.deep.equal([null, erred_at])
  })

  it("throws the refusal its Thing raised, as a refusal", () => {
    const car = ThingCar.make(Thing.shellOf(Revs.two), { world: TH.PlainWorld })
    const err = TH.expectSyncRefusal(() => car.receive({ ...TH.thingEventOf(Revs.two), labelpath: 'box/other' }), 'bad_record')
    expect(car.lastErr).to.equal(err)
  })
})

describe("car.read_tc", () => {
  it("is the read_tc of the record that was news, its first 48 bits the time it was read", () => {
    const car = carReceived(undefined, TH.boxThingOf(), '0190a1b2-c3d4-7000-8000-000000000000')
    expect(car.read_tc).to.eq('0190a1b2-c3d4-7000-8000-000000000000')
    expect(readAtOf(car.read_tc)).to.eq(0x01_90_A1_B2_C3_D4)
  })

  it("is when a read_tc minted now was read", () => {
    const before  = Date.now()
    const read_tc = readTcNow()
    const car     = carReceived(undefined, TH.boxThingOf(), read_tc)
    expect(readAtOf(car.read_tc)).to.be.within(before, Date.now())
  })

  it("follows the newest revision: a newer one brings its own time, the same one the later, an older one none", () => {
    const car = carReceived(undefined, TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 4 })), readTcAt(500_000))
    carReceived(car, TH.boxThingOf('openai', { revseq: 2 }), readTcAt(900_000))
    expect(readAtOf(car.read_tc), 'an older whole record').to.eq(500_000)
    carReceived(car, TH.boxThingOf('openai', { revseq: 4 }), readTcAt(400_000))
    expect(readAtOf(car.read_tc), 'the newest revision whole, read earlier').to.eq(500_000)
    carReceived(car, TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 5 })), readTcAt(300_000))
    expect(readAtOf(car.read_tc), 'a newer revision').to.eq(300_000)
  })

  it("moves for the newest revision seen again a chunk later, its Thing holding the record it held", () => {
    const record = TH.boxThingOf('openai', { sidecar: { account: 'work' } })
    const car    = carReceived(undefined, record, readTcAt(0))
    carReceived(car, structuredClone(record), readTcAt(70_000))
    expect(readAtOf(car.read_tc)).to.eq(70_000)
    expect(car.thing.pickle()).to.equal(record)
  })

  it("moves for a newer soon over a soon, its Thing at the shell", () => {
    const car = carReceived(undefined, TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 4 })), readTcAt(0))
    expect(car.read_tc).to.eq(readTcAt(0))
    carReceived(car, TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 5 })), readTcAt(200_000))
    expect(readAtOf(car.read_tc)).to.eq(200_000)
    expect(TH.PlainThing.isVoidSentinel(car.thing.pickle())).to.eq(true)
  })

  it("is left as it was by a record its Thing refuses", () => {
    const car     = ThingCar.make({ ...TH.thingEventOf(Revs.two), read_tc: readTcAt(1000) }, { world: RefusingWorld })
    TH.expectSyncRefusal(() => car.receive({ ...TH.thingEventOf(Revs.three), read_tc: readTcAt(2000) }), 'unexpected_error')
    expect(car.read_tc).to.eq(readTcAt(1000))
  })
})
