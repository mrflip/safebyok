/** A Box: what `Box.make` takes, and its scope and stamp. */

import { describe, expect, it } from 'vitest'
import { Box } from '../../src/models/box'
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
