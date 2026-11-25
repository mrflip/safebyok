/** A Box: what `Box.make` takes, its props, and its scope and stamp. */

import { describe, expect, it } from 'vitest'
import { omit } from 'es-toolkit'
import { BaseBox } from '../../src/models/base-box'
import { Box } from '../../src/models/box'
import { Thing } from '../../src/models/thing'
import { type BoxRecord, Shell } from '../../src/shapes/shapes-thing'
import { BoxChecks } from '../../src/shapes/shapes-thingkinds'
import * as TH from '../test-helpers'

/** A device's world, which every box here is made with. */
const { world } = TH.makeDevice()

/** The box made from the item event of `record`, read now */
function boxOf(record: BoxRecord): Box { return Box.make(TH.thingEventOf<BoxRecord>(record), { world }) }

describe("Box.make(begun, { world })", () => {
  it("makes the box of an item event of a whole live record, with its scope and stamp", () => {
    const record = TH.boxThingOf()
    const box = boxOf(record)
    expect(box.pickle()).to.deep.equal(record)
    expect(box.agekind).to.eq('here')
    expect(box.scope).to.deep.equal({ ...TH.ThingBank, labelpath: 'box/openai' })
    expect(box.stamp).to.deep.include({ revtok: record.revtok, lifepath: record.lifepath })
    expect(box.stamp).to.not.have.property('whisper_sealed')
  })

  it("pickles to the very record its item event carried", () => {
    const record = TH.boxThingOf()
    expect(boxOf(record).pickle()).to.eq(record)
  })

  it("makes the box of its shell, which has received nothing and whose stamp refuses", () => {
    const shell = Shell.inParentLivesOf(TH.boxThingOf())
    const box = Box.make(shell, { world })
    expect(box.pickle()).to.deep.equal(shell)
    expect(box.agekind).to.eq('vacant')
    TH.expectSyncRefusal(() => box.stamp, 'bad_record')
  })

  it("wraps each subscriber in its world's bulletproofCallback", () => {
    const badNews: unknown[] = []
    const device = TH.makeDevice({}, { onBadNews: (news) => { badNews.push(news) } })
    const box = Box.make(Shell.inParentLivesOf(TH.boxThingOf()), { world: device.world })
    box.subscribe(() => { throw new Error("a bug in the host") })
    box.receive(TH.thingEventOf<BoxRecord>(TH.boxThingOf()))
    expect(badNews).to.have.lengthOf(1)
  })

  const RefusedCases = [
    [TH.thingEventOf(TH.gateThingOf()),                                           'an item event of another kind'],
    [TH.gateShellOf(),                                                            "another kind's shell"],
    [TH.boxThingOf(),                                                             'a whole record with no item event'],
    [{ ...TH.thingEventOf(TH.boxThingOf()), val: { ...TH.boxThingOf(), whisper_sealed: undefined } }, 'an item event of a box record with no sealed whisper'],
    [{ ...TH.thingEventOf(TH.boxThingOf()), val: omit(TH.boxThingOf(), ['sidecar']) },               'an item event of a box record with no sidecar'],
    [{ ...TH.thingEventOf(TH.boxThingOf()), read_tc: undefined },                'an item event read at no time'],
    [{ ...TH.thingEventOf(TH.boxThingOf()), sourcelabel: undefined },            'an item event from no source'],
    [null,                                                                        'nothing at all'],
  ] as const

  for (const [begun, blurb] of RefusedCases) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => Box.make(begun as never, { world }), 'bad_record')
    })
  }

  it("refuses to be made with no world", () => {
    TH.expectSyncRefusal(() => Box.make(Shell.inParentLivesOf(TH.boxThingOf()), undefined as never), 'bad_record')
    TH.expectSyncRefusal(() => Box.make(Shell.inParentLivesOf(TH.boxThingOf()), { world: {} } as never), 'bad_record')
  })
})

describe("a Box's props", () => {
  it("answers every field of its record by name: its Thing fields as its own props, its body by getters", () => {
    const record = TH.boxThingOf()
    const box = boxOf(record)
    expect(Object.getOwnPropertyNames(box)).to.have.members(Object.keys(Thing.sparseOf(record)))
    expect(box.sidecar).to.eq(record.sidecar)
    expect(box.whisper_sealed).to.eq(record.whisper_sealed)
  })

  it("sets every Thing field non-writable, its scope fields non-configurable and the rest configurable, and its body read-only", () => {
    const record = TH.boxThingOf()
    const box = boxOf(record)
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
    const box = Box.make(Shell.inParentLivesOf(TH.boxThingOf()), { world })
    expect([box.sidecar, box.whisper_sealed]).to.deep.equal([undefined, undefined])
    expect(BaseBox.nextRevisionOf(box, { sidecar: {} })).to.deep.include({ am: 'a', revseq: 0, sidecar: {} })
    expect(BoxChecks.cited.parse(box)).to.deep.include(box.citable)
  })

  it("answers the tombstone's own body once it adopts one, never its live record's", () => {
    const live = TH.boxThingOf('openai', { sidecar: { account: 'work' } })
    const box  = boxOf(live)
    const tomb = TH.boxTombOf(live)
    box.receive(TH.thingEventOf<BoxRecord>(tomb))
    expect(box.pickle()).to.eq(tomb)
    expect(Object.getOwnPropertyNames(box)).to.have.members(Object.keys(Thing.sparseOf(tomb)))
    expect([box.sidecar, box.whisper_sealed]).to.deep.equal([{}, tomb.whisper_sealed])
    expect(box).to.include({ am: 'x', labelpath: tomb.labelpath })
  })
})
