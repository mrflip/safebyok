/** A ThingCar: what `ThingCar.make` takes and makes, and how `receive` keeps its refusal and read_tc. */

import { describe, expect, it, vi } from 'vitest'
import { Box } from '../../src/models/box'
import { Thing } from '../../src/models/thing'
import { ThingCar } from '../../src/minding/thing-car'
import type { CarWorld } from '../../src/shapes/shapes-vault-minder'
import { VacantReadTc, readTcNow } from '../../src/storage/agerank'
import * as TH from '../test-helpers'

/** A box's revisions: `two`, which a {@link TH.RefusingThing} takes, and `three` after it, which it refuses. */
const Revs = (() => {
  const two = TH.nextOf(TH.nextOf(TH.boxThingOf()))
  return { two, three: TH.nextOf(two) }
})()

/** A world that makes a {@link TH.RefusingThing} at each labelpath. */
const RefusingWorld: CarWorld<TH.RefusingThing> = Object.freeze({ makeThing: (shell) => TH.RefusingThing.make(shell) })

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
