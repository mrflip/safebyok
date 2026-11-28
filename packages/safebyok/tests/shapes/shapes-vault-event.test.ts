import { describe, expect, it } from 'vitest'
import { Shell } from '../../src/shapes/shapes-thing'
import { SeenChecks } from '../../src/shapes/shapes-vault-event'
import * as Phrases from '../../src/phrases'
import * as TH from '../test-helpers'

describe("SeenChecks.itemEvent", () => {
  it("accepts the item event of a gate, of the root box and of a box", () => {
    for (const record of [TH.gateThingOf(), TH.rootBoxOf(), TH.boxThingOf()]) {
      const event = TH.thingEventOf(record)
      expect(SeenChecks.itemEvent.parse(event)).to.deep.equal(event)
    }
  })

  it("accepts the item events of the gate and the root box of a bank labelled box, at one labelpath", () => {
    const gate = TH.gateThingOf({ banklabel: 'box', labelpath: 'box', label: 'box' })
    const root = TH.rootBoxOf({ banklabel: 'box' })
    for (const record of [gate, root]) {
      const event = TH.thingEventOf(record)
      expect(SeenChecks.itemEvent.parse(event)).to.deep.equal(event)
      expect(event).to.deep.include({ modelkind: record.modelkind, labelpath: 'box' })
    }
  })

  it("accepts the item event of a shell", () => {
    const event = TH.thingEventOf(Shell.of(TH.GateScope))
    expect(SeenChecks.itemEvent.parse(event)).to.deep.equal(event)
  })

  const BadEventCases = [
    [{ ...TH.thingEventOf(TH.boxThingOf()), modelkind: 'gate' },            Phrases.EventModelkind,        "a gate's event of a box's record"],
    [{ ...TH.thingEventOf(TH.gateThingOf()), modelkind: 'box' },            Phrases.EventModelkind,        "a box's event of a gate's record"],
    [TH.omitting(TH.thingEventOf(TH.boxThingOf()), 'modelkind'),            'modelkind',                   'no modelkind'],
    [TH.thingEventOf({ ...TH.boxThingOf(), modelkind: 'gate' } as never),   Phrases.LabelpathOfOtherKind,  "a gate's record at a box's labelpath"],
    [TH.thingEventOf({ ...TH.gateThingOf(), modelkind: 'box' } as never),   Phrases.LabelpathOfOtherKind,  "a box's record at the banklabel"],
    [{ ...TH.thingEventOf(TH.boxThingOf()), labelpath: 'box/other' },       Phrases.EventOfOtherThing,     "a record at another labelpath than the event's"],
  ] as const

  for (const [event, said, blurb] of BadEventCases) {
    it(`refuses ${blurb}`, () => {
      const err = TH.expectSyncRefusal(() => SeenChecks.itemEvent.parse(event), 'bad_record')
      expect(err.message).to.include(said)
    })
  }
})

describe("SeenChecks.shell", () => {
  it("accepts the shell of a gate and of a box", () => {
    for (const shell of [Shell.of(TH.GateScope), Shell.of(TH.RootScope), TH.boxShellInParentLivesOf(TH.boxThingOf())]) {
      expect(SeenChecks.shell.parse(shell)).to.deep.equal(shell)
    }
  })

  it("refuses the shell of a gate at another labelpath than its banklabel", () => {
    const err = TH.expectSyncRefusal(() => SeenChecks.shell.parse({ ...Shell.of(TH.GateScope), labelpath: 'other', label: 'other' }), 'bad_record')
    expect(err.message).to.include(Phrases.GateNotAtBanklabel)
  })
})
