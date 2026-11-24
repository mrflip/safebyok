/** A Box: what `Box.make` takes, its props, and its scope and stamp. */

import { describe, expect, it } from 'vitest'
import { Box } from '../../src/models/box'
import { Thing } from '../../src/models/thing'
import { Lifeseq } from '../../src/shapes/primitives'
import { Shell } from '../../src/shapes/shapes-thing'
import * as TH from '../test-helpers'

describe("Box.make(record)", () => {
  it("makes the box of a whole live record, with its scope and stamp", () => {
    const record = TH.boxThingOf()
    const box = Box.make(record)
    expect(box.pickle()).to.deep.equal(record)
    expect(box.scope).to.deep.equal({ ...TH.ThingBank, labelpath: 'box/openai' })
    expect(box.stamp).to.deep.include({ revtok: record.revtok, lifepath: record.lifepath })
    expect(box.stamp).to.not.have.property('whisper_sealed')
  })

  it("pickles to the very record it was made from", () => {
    const record = TH.boxThingOf()
    expect(Box.make(record).pickle()).to.eq(record)
  })

  it("makes the box of its shell, whose stamp refuses", () => {
    const shell = Shell.inParentLivesOf(TH.boxThingOf())
    const box = Box.make(shell)
    expect(box.pickle()).to.deep.equal(shell)
    TH.expectSyncRefusal(() => box.stamp, 'bad_record')
  })

  const RefusedCases = [
    [TH.gateThingOf(),                                     'a record of another kind'],
    [{ ...TH.boxThingOf(), whisper_sealed: undefined },    'a box record with no sealed whisper'],
    [null,                                                 'no record at all'],
  ] as const

  for (const [record, blurb] of RefusedCases) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => Box.make(record as never), 'bad_record')
    })
  }
})

describe("a Box's props", () => {
  it("answers every field of its record by name, its body hidden", () => {
    const record = TH.boxThingOf()
    const box = Box.make(record)
    expect(Object.getOwnPropertyNames(box)).to.have.members(Object.keys(record))
    expect(box.sidecar).to.eq(record.sidecar)
    expect(box.whisper_sealed).to.eq(record.whisper_sealed)
    expect(Object.getOwnPropertyDescriptor(box, 'whisper_sealed')).to.include({ enumerable: false })
  })

  it("sets every field non-writable, its scope fields non-configurable and the rest configurable", () => {
    const record = TH.boxThingOf()
    const box = Box.make(record)
    const scopeFieldnames = new Set(['userid', 'banklabel', 'labelpath'])
    for (const fieldname of Object.keys(record)) {
      const configurable = ! scopeFieldnames.has(fieldname)
      expect(Object.getOwnPropertyDescriptor(box, fieldname), fieldname).to.include({ writable: false, configurable })
    }
    expect(() => { (box as { revseq: number }).revseq = 9 }).to.throw(TypeError)
    expect(Reflect.deleteProperty(box, 'labelpath')).to.eq(false)
  })

  it("stops answering its live record's body once it adopts a sparse tombstone", () => {
    const box = Box.make(TH.boxThingOf())
    const life1 = Lifeseq.ofLifenum(1)
    const tomb = Thing.sparseOf(TH.boxThingOf('openai', { am: 'x', lifepath: `${TH.Life0}/${life1}`, lifeseq: life1, revseq: 1 }))
    box.receive(TH.thingEventOf(tomb))
    expect(box.pickle()).to.eq(tomb)
    expect(Object.getOwnPropertyNames(box)).to.have.members(Object.keys(tomb))
    expect(box.sidecar).to.eq(undefined)
    expect(box).to.include({ am: 'x', labelpath: tomb.labelpath })
  })
})
