/** A Box: what `Box.make` takes, its props, and its scope and stamp. */

import { describe, expect, it } from 'vitest'
import { omit } from 'es-toolkit'
import { BaseBox } from '../../src/models/base-box'
import { Box } from '../../src/models/box'
import { Thing } from '../../src/models/thing'
import { type BoxRecord, Shell } from '../../src/shapes/shapes-thing'
import { BoxChecks } from '../../src/shapes/shapes-thingkinds'
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
    [{ ...TH.boxThingOf(), sidecar: undefined },           'a box record whose sidecar is undefined'],
    [omit(TH.boxThingOf(), ['sidecar']),                   'a box record with no sidecar'],
    [null,                                                 'no record at all'],
  ] as const

  for (const [record, blurb] of RefusedCases) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => Box.make(record as never), 'bad_record')
    })
  }
})

describe("a Box's props", () => {
  it("answers every field of its record by name: its Thing fields as its own props, its body by getters", () => {
    const record = TH.boxThingOf()
    const box = Box.make(record)
    expect(Object.getOwnPropertyNames(box)).to.have.members(Object.keys(Thing.sparseOf(record)))
    expect(box.sidecar).to.eq(record.sidecar)
    expect(box.whisper_sealed).to.eq(record.whisper_sealed)
  })

  it("sets every Thing field non-writable, its scope fields non-configurable and the rest configurable, and its body read-only", () => {
    const record = TH.boxThingOf()
    const box = Box.make(record)
    const scopeFieldnames = new Set(['userid', 'banklabel', 'labelpath'])
    const thingFieldnames = Object.keys(Thing.sparseOf(record))
    for (const fieldname of thingFieldnames) {
      const configurable = ! scopeFieldnames.has(fieldname)
      expect(Object.getOwnPropertyDescriptor(box, fieldname), fieldname).to.include({ writable: false, configurable })
    }
    expect(() => { (box as { revseq: number }).revseq = 9 }).to.throw(TypeError)
    expect(() => { (box as { sidecar: object }).sidecar = {} }).to.throw(TypeError)
    expect(Reflect.deleteProperty(box, 'labelpath')).to.eq(false)
  })

  it("answers an undefined body over the shell, and is sealable and citable as it stands", () => {
    const box = Box.make(Shell.inParentLivesOf(TH.boxThingOf()))
    expect([box.sidecar, box.whisper_sealed]).to.deep.equal([undefined, undefined])
    expect(BaseBox.nextRevisionOf(box, { sidecar: {} })).to.deep.include({ am: 'a', revseq: 0, sidecar: {} })
    expect(BoxChecks.cited.parse(box)).to.deep.include(box.citable)
  })

  it("answers the tombstone's own body once it adopts one, never its live record's", () => {
    const live = TH.boxThingOf('openai', { sidecar: { account: 'work' } })
    const box  = Box.make(live)
    const tomb = TH.boxTombOf(live)
    box.receive(TH.thingEventOf<BoxRecord>(tomb))
    expect(box.pickle()).to.eq(tomb)
    expect(Object.getOwnPropertyNames(box)).to.have.members(Object.keys(Thing.sparseOf(tomb)))
    expect([box.sidecar, box.whisper_sealed]).to.deep.equal([{}, tomb.whisper_sealed])
    expect(box).to.include({ am: 'x', labelpath: tomb.labelpath })
  })
})
