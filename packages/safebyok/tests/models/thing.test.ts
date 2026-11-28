/** A Thing: which records its receive adopts, its subscribers, its props and record, and what it refuses. */

import { omit } from 'es-toolkit'
import { describe, expect, it, vi } from 'vitest'
import { Thing } from '../../src/models/thing'
import { ThingCar } from '../../src/minding/thing-car'
import { type Lifepath, Lifeseq, VoidLifeseq } from '../../src/shapes/primitives'
import { Shell } from '../../src/shapes/shapes-thing'
import type { ReadTc, SeenThing, VaultItemEvent } from '../../src/shapes/shapes-vault-event'
import * as TH from '../test-helpers'

// == [Harness]: lifepathOf, readTcOf, tcchunkOf, eventOf, received, propsOf

// At box/openai, a record of life n has the lifepath `n/n` and a void of life n `n/-000000001`, each n spelled as a
// lifeseq, so that lifepaths sort as the lives do.
/** The lifepath at box/openai of a record or a void of `life` */
function lifepathOf(life: number, isVoid: boolean): Lifepath {
  if (isVoid) { return `${Lifeseq.ofLifenum(Math.max(life, 0))}/${VoidLifeseq}` }
  return `${Lifeseq.ofLifenum(life)}/${Lifeseq.ofLifenum(life)}`
}

// A chunk's read_tc is a UUID version 7 whose first eight hexadecimal digits spell the chunk's number: chunk 0 is the
// first 65.536 seconds of 1970.
/** A read_tc in `chunk` */
function readTcOf(chunk: number): ReadTc { return `${tcchunkOf(chunk)}-0000-7000-8000-000000000000` }

/** The tcchunk a read_tc in `chunk` begins with */
function tcchunkOf(chunk: number): string { return chunk.toString(16).padStart(8, '0') }

/** The item event of `record` read at `read_tc`, as a VaultMinder builds it, with no source or bank banktok */
function eventOf(record: SeenThing, read_tc: ReadTc = readTcOf(0)): VaultItemEvent {
  return { ...TH.itemEventOf(record), read_tc }
}

/** Hand `thing`'s receive the event of `record` read at `read_tc`, a plain Thing made at `record`'s shell where there is none yet, and return the Thing and whether it adopted the record */
function received(thing: TH.PlainThing | undefined, record: SeenThing, read_tc: ReadTc = readTcOf(0)): readonly [TH.PlainThing, boolean] {
  const receiver = thing ?? TH.PlainThing.make(Thing.shellOf(record))
  return [receiver, receiver.receive(eventOf(record, read_tc))]
}

// The spread is the subject: what a host's `{ ...thing }` sees of a Thing.
/** `thing`'s props, as its spread shows them */
function propsOf(thing: TH.PlainThing): Record<string, unknown> { return { ...thing } } // eslint-disable-line @typescript-eslint/no-misused-spread
// --

describe("Thing.receive", () => {
  const whole2 = TH.boxThingOf('openai', { revseq: 2 })

  it("adopts a whole record newer than the record held, and answers true", () => {
    const whole4 = TH.boxThingOf('openai', { revseq: 4, revtok: TH.revtokOf('four') })
    const [thing, adopted] = received(undefined, whole2)
    expect([adopted, thing.pickle()]).to.deep.equal([true, whole2])
    expect(received(thing, whole4)[1]).to.eq(true)
    expect(thing.pickle()).to.eq(whole4)
  })

  it("adopts a tombstone of a later life, and the void sentinel of a later life of the box above it", () => {
    const tomb1 = TH.boxThingOf('openai', { am: 'x', lifepath: lifepathOf(1, false), lifeseq: Lifeseq.ofLifenum(1), revseq: 0 })
    const void2 = Shell.of({ ...TH.BoxScope, lifepath: lifepathOf(2, true) })
    const [thing] = received(undefined, whole2)
    for (const record of [tomb1, void2]) {
      expect(received(thing, record)[1]).to.eq(true)
      expect(thing.pickle()).to.eq(record)
    }
  })

  it("answers false, and holds the very record it held, for the same revision again or an older one", () => {
    const [thing] = received(undefined, whole2)
    for (const record of [structuredClone(whole2), TH.boxThingOf('openai', { revseq: 1 })]) {
      const event = eventOf(record, readTcOf(1))
      expect(thing.receive(event)).to.eq(false)
      expect(thing.pickle()).to.equal(whole2)
    }
  })

  it("answers false, and holds the shell, for a live box's sparse form, however new", () => {
    const [thing, adopted] = received(undefined, TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 9 })))
    expect(adopted).to.eq(false)
    expect(thing.pickle()).to.deep.equal(Thing.shellOf(whole2))
  })

  it("answers false for a life or aged event, and changes nothing", () => {
    const soon = TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 3 }))
    const car  = ThingCar.make(Thing.shellOf(soon), { bank: TH.PlainCarBank })
    const [, life, aged] = car.receive(eventOf(soon))
    const [thing] = received(undefined, whole2)
    for (const event of [life, aged]) { expect(thing.receive(event as never)).to.eq(false) }
    expect(thing.pickle()).to.eq(whole2)
  })

  it("takes a root's records, its lifepath a single lifeseq", () => {
    const [thing] = received(undefined, Shell.of(TH.RootScope))
    expect(received(thing, TH.rootBoxOf())[1]).to.eq(true)
    expect(thing.pickle()).to.deep.equal(TH.rootBoxOf())
  })
})

describe("thing.subscribe(listener)", () => {
  it("tells each subscriber once for each record it adopts, and for none it does not, a newer sparse revision among them", () => {
    const whole2   = TH.boxThingOf('openai', { revseq: 2 })
    const thing    = TH.PlainThing.make(Thing.shellOf(whole2))
    const listener = vi.fn()
    thing.subscribe(listener)
    thing.receive(eventOf(whole2))
    thing.receive(eventOf(whole2, readTcOf(1)))
    thing.receive(eventOf(TH.boxThingOf('openai', { revseq: 1 })))
    const soon4 = TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 4 }))
    thing.receive(eventOf(soon4))
    expect(listener).toHaveBeenCalledOnce()
    thing.receive(eventOf(TH.boxThingOf('openai', { revseq: 4 })))
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it("tells a subscriber once the record is adopted, the Thing reading as that record", () => {
    const whole2 = TH.boxThingOf('openai', { revseq: 2 })
    const thing  = TH.PlainThing.make(Thing.shellOf(whole2))
    const read: unknown[] = []
    thing.subscribe(() => { read.push([thing.pickle(), thing.revseq]) })
    thing.receive(eventOf(whole2))
    expect(read).to.deep.equal([[whole2, 2]])
  })

  it("stops telling a listener once it unsubscribes", () => {
    const thing       = TH.PlainThing.make(Thing.shellOf(TH.boxThingOf()))
    const listener    = vi.fn()
    const unsubscribe = thing.subscribe(listener)
    unsubscribe()
    thing.receive(eventOf(TH.boxThingOf()))
    expect(listener).not.toHaveBeenCalled()
  })

  it("lets what a subscriber throws reach receive's caller, where its maker gave no bulletproofCallback", () => {
    const thing = TH.PlainThing.make(Thing.shellOf(TH.boxThingOf()))
    thing.subscribe(() => { throw new Error("a bug in the host") })
    expect(() => thing.receive(eventOf(TH.boxThingOf()))).to.throw("a bug in the host")
  })

  it("refuses a listener that is not a function", () => {
    const thing = TH.PlainThing.make(Thing.shellOf(TH.boxThingOf()))
    TH.expectSyncRefusal(() => thing.subscribe('call me' as never), 'bad_record')
  })
})

describe("Thing's props and record", () => {
  it("adopts a record of each later life, every prop set again from it", () => {
    const live0 = TH.boxThingOf('openai', { revseq: 3 })
    const tomb1 = TH.boxThingOf('openai', { am: 'x', lifepath: lifepathOf(1, false), lifeseq: Lifeseq.ofLifenum(1), revseq: 4, written_at: TH.T0 + 9 })
    const live2 = TH.boxThingOf('openai', { lifepath: lifepathOf(2, false), lifeseq: Lifeseq.ofLifenum(2), revseq: 5, born_at: TH.T0 + 10, written_at: TH.T0 + 10 })
    let [thing] = received(undefined, live0)
    for (const record of [tomb1, live2]) {
      ;[thing] = received(thing, record)
      expect(thing).to.deep.include(Thing.sparseOf(record))
      expect(thing.pickle()).to.eq(record)
    }
  })

  it("holds its record on a newer soon, then adopts the whole record that catches up", () => {
    const whole2 = TH.boxThingOf('openai', { revseq: 2 })
    const whole4 = TH.boxThingOf('openai', { revseq: 4, revtok: TH.revtokOf('four') })
    const [thing] = received(undefined, whole2)
    received(thing, TH.boxSparseOf(whole4))
    expect(thing.pickle()).to.eq(whole2)
    expect(thing).to.include({ revseq: 2, revtok: whole2.revtok })
    received(thing, whole4)
    expect(thing.pickle()).to.eq(whole4)
    expect(thing).to.include({ revseq: 4, revtok: whole4.revtok })
  })

  it("adopts an older whole record after a newer soon", () => {
    const whole4 = TH.boxThingOf('openai', { revseq: 4, revtok: TH.revtokOf('four') })
    const [thing] = received(undefined, TH.boxSparseOf(whole4))
    const whole2 = TH.boxThingOf('openai', { revseq: 2 })
    expect(received(thing, whole2)[1]).to.eq(true)
    expect(thing.pickle()).to.eq(whole2)
  })

  describe("begun by a soon", () => {
    const soon4 = TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 4, revtok: TH.revtokOf('four') }))
    /** The shell at box/openai under the root box's life 0, which the soon's lifepath names */
    const shell = Shell.of({ ...TH.BoxScope, lifepath: lifepathOf(0, true) })

    it("pickles as the shell under the lives the soon names for the Things above it", () => {
      const [thing] = received(undefined, soon4)
      expect(thing.pickle()).to.deep.equal(shell)
      expect(thing.pickle()).to.include({ lifepath: `${TH.Life0}/${VoidLifeseq}` })
      expect(Object.isFrozen(thing.pickle())).to.eq(true)
    })

    it("pickles as the shell under a later life of the root box, where the soon names one", () => {
      const soon = TH.boxSparseOf(TH.boxThingOf('openai', { lifepath: lifepathOf(2, false), lifeseq: Lifeseq.ofLifenum(2), revseq: 1 }))
      expect(TH.PlainThing.make(eventOf(soon)).pickle()).to.deep.equal(Shell.of({ ...TH.BoxScope, lifepath: `${Lifeseq.ofLifenum(2)}/${VoidLifeseq}` }))
    })

    it("pickles as a root's own shell, begun by a soon of the root", () => {
      const soon = TH.boxSparseOf(TH.rootBoxOf({ revseq: 3 }))
      expect(TH.PlainThing.make(eventOf(soon)).pickle()).to.deep.equal(Shell.of(TH.RootScope))
    })

    it("has the shell's props", () => {
      const [thing] = received(undefined, soon4)
      expect(propsOf(thing)).to.deep.equal(Thing.sparseOf(shell))
    })

    it("holds the shell on a newer soon", () => {
      const [thing] = received(undefined, soon4)
      const soon5 = TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 5, revtok: TH.revtokOf('five') }))
      received(thing, soon5, readTcOf(3))
      expect(thing.pickle()).to.deep.equal(shell)
      expect(propsOf(thing)).to.deep.equal(Thing.sparseOf(shell))
    })

    it("adopts a whole record in place of the shell, and its props follow", () => {
      const [thing] = received(undefined, soon4)
      const whole4 = TH.boxThingOf('openai', { revseq: 4, revtok: TH.revtokOf('four') })
      received(thing, whole4)
      expect(thing.pickle()).to.eq(whole4)
      expect(propsOf(thing)).to.deep.equal(Thing.sparseOf(whole4))
    })
  })

  it("made from an item event, holds its record, whole, a tombstone or the void sentinel, having received it", () => {
    const tomb = TH.boxThingOf('openai', { am: 'x', lifepath: lifepathOf(1, false), lifeseq: Lifeseq.ofLifenum(1), revseq: 0 })
    for (const record of [TH.boxThingOf(), tomb, Shell.of({ ...TH.BoxScope, lifepath: lifepathOf(0, true) })]) {
      const thing = TH.PlainThing.make(eventOf(record))
      expect(thing.pickle()).to.eq(record)
      expect(propsOf(thing)).to.deep.equal(Thing.sparseOf(record))
    }
  })

  it("made from the shell, holds it until it first adopts a record", () => {
    const shell = Thing.shellOf(TH.boxThingOf())
    const thing = TH.PlainThing.make(shell)
    expect(thing.pickle()).to.eq(shell)
  })

  it("shows only its Thing fields in a spread, its keys and JSON", () => {
    const record = TH.boxThingOf()
    const [thing] = received(undefined, record)
    expect(Object.keys(thing)).to.have.members(Object.keys(Thing.sparseOf(record)))
    expect(propsOf(thing)).to.deep.equal(Thing.sparseOf(record))
    expect(JSON.stringify(thing)).to.eq(JSON.stringify(propsOf(thing)))
  })

  it("answers its Thing fields by name, and no body: a kind writes out its own", () => {
    const record = TH.boxThingOf()
    const thing = TH.PlainThing.make(eventOf(record))
    expect(Object.getOwnPropertyNames(thing)).to.have.members(Object.keys(Thing.sparseOf(record)))
  })

  it("sets every Thing field non-writable, its scope fields and modelkind non-configurable and the rest configurable", () => {
    const record = TH.boxThingOf()
    const thing = TH.PlainThing.make(eventOf(record))
    const scopeFieldnames = new Set(['userid', 'banklabel', 'labelpath', 'modelkind'])
    const thingFieldnames = Object.keys(Thing.sparseOf(record))
    for (const fieldname of thingFieldnames) {
      const configurable = ! scopeFieldnames.has(fieldname)
      expect(Object.getOwnPropertyDescriptor(thing, fieldname), fieldname).to.include({ writable: false, configurable })
    }
    expect(() => { (thing as { revseq: number }).revseq = 9 }).to.throw(TypeError)
    expect(Reflect.deleteProperty(thing, 'labelpath')).to.eq(false)
  })

  it("pickles to the very record its item event carried, deeply frozen", () => {
    const record = TH.boxThingOf()
    const thing = TH.PlainThing.make(eventOf(record))
    expect(thing.pickle()).to.eq(record)
    expect(Object.isFrozen(record.sidecar)).to.eq(true)
  })

  it("is the scope of its record, and has no stamp", () => {
    const thing = TH.PlainThing.make(eventOf(TH.boxThingOf()))
    expect(thing.scope).to.deep.equal(TH.BoxScope)
    expect(thing.stamp).to.eq(undefined)
  })

  it("is left as it was by a receive whose adopt throws", () => {
    const live2 = TH.boxThingOf('openai', { revseq: 2 })
    const thing = TH.RefusingThing.make(eventOf(live2))
    const before = [thing.pickle(), thing.revseq]
    const refused = TH.boxThingOf('openai', { revseq: TH.RefusingThing.RefusedRevseq, revtok: TH.revtokOf('three') })
    expect(() => thing.receive(eventOf(refused, readTcOf(1)))).to.throw(TH.RefusingThing.Refusal)
    expect([thing.pickle(), thing.revseq]).to.deep.equal(before)
  })
})

describe("Thing refusals", () => {
  const live = TH.boxThingOf('openai', { revseq: 2 })
  const RefusedVals = [
    // not a record:
    [42,                                                  'a number'],
    [null,                                                'null'],
    [{},                                                  'an empty bag'],
    // a record no agerank can order, or of another Thing:
    [{ ...live, userid: "u2" },                           'a record of another user'],
    [{ ...live, banklabel: "other" },                     'a record of another bank'],
    [{ ...live, labelpath: "box/other", label: "other" }, 'a record of another Thing'],
    [{ ...live, lifepath: TH.Life0, lifeseq: TH.Life0 },  'a lifepath shallower than its labelpath'],
    [{ ...Thing.sparseOf(live), ...Shell.Cited },         "the root's shell cited at a box under it"],
    [{ ...live, am: "x" },                                'a tombstone in a live life'],
    [{ ...live, am: "d" },                                'a record marked for deletion'],
    // a record in no form a Thing receives:
    [Thing.sparseOf(TH.boxTombOf(live)),                  'a sparse tombstone'],
    [omit(live, ['whisper_sealed']),                      'a live box with half its body'],
  ] as const

  for (const [val, blurb] of RefusedVals) {
    it(`refuses an event whose val is ${blurb}, holding the record it held`, () => {
      const [thing] = received(undefined, TH.boxThingOf('openai', { revseq: 1 }))
      const held = thing.pickle()
      TH.expectSyncRefusal(() => thing.receive({ ...eventOf(live), val } as never), 'bad_record')
      expect(thing.pickle()).to.eq(held)
    })
  }

  const RefusedEvents = [
    [{ labelpath: "box/other" },                          'of another Thing'],
    [{ banklabel: "other" },                              'of another bank'],
    [{ eventkind: "seen" },                               'of an unknown kind'],
    [{ modelkind: "gate" },                               'whose modelkind is not its labelpath'],
    [{ liveness: "soon" },                                "whose liveness is not its val's"],
    [{ read_tc: crypto.randomUUID() },                    'read at a UUID other than version 7'],
    [{ read_tc: undefined },                              'read at no time'],
  ] as const

  for (const [fields, blurb] of RefusedEvents) {
    it(`refuses an event ${blurb}, holding the record it held`, () => {
      const [thing] = received(undefined, TH.boxThingOf('openai', { revseq: 1 }))
      const held = thing.pickle()
      TH.expectSyncRefusal(() => thing.receive({ ...eventOf(live), ...fields } as never), 'bad_record')
      expect(thing.pickle()).to.eq(held)
    })
  }

  it("refuses to be made from anything but the shell or an item event", () => {
    const shallowShell = { ...Thing.shellOf(live), lifepath: VoidLifeseq }
    for (const val of [undefined, 42, {}, live, shallowShell, { ...eventOf(live), val: { ...live, lifepath: TH.Life0, lifeseq: TH.Life0 } }, { ...eventOf(live), sourcelabel: undefined }]) {
      TH.expectSyncRefusal(() => TH.PlainThing.make(val as never), 'bad_record')
    }
  })
})

