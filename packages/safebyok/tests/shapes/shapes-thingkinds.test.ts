import { describe, expect, it } from 'vitest'
import { AskChecks } from '../../src/shapes/shapes-asks'
import { StampChecks } from '../../src/shapes/shapes-stamps'
import { BankChecks, BoxChecks, GateChecks, ThingkindChecks } from '../../src/shapes/shapes-thingkinds'
import * as TH from '../test-helpers'

describe("BankChecks, GateChecks and BoxChecks", () => {
  it("carry each kind's life, stamp and ask checks, the same checks StampChecks and AskChecks have", () => {
    expect(BankChecks.life).to.eq(StampChecks.bankLife)
    expect(BankChecks.birthAsk).to.eq(AskChecks.birthBankAsk)
    expect(GateChecks.life).to.eq(StampChecks.gateLife)
    expect(GateChecks.stamp).to.eq(StampChecks.gateStamp)
    expect(GateChecks.provable).to.eq(StampChecks.provableGate)
    expect(BoxChecks.stamp).to.eq(StampChecks.boxStamp)
  })

  it("check a gate's record at its banklabel, live or a tombstone, the bank's end, keeping its banktok", () => {
    const tomb = TH.gateTombOf(TH.gateThingOf())
    expect(GateChecks.record.parse(TH.gateThingOf())).to.deep.equal(TH.gateThingOf())
    expect(GateChecks.record.parse(tomb)).to.deep.equal(tomb).and.include({ am: 'x', banktok: TH.gateThingOf().banktok })
    TH.expectSyncRefusal(() => GateChecks.record.parse(TH.gateThingOf({ labelpath: 'other', label: 'other' })), 'bad_record')
    TH.expectSyncRefusal(() => GateChecks.record.parse(TH.omitting(TH.gateThingOf(), 'banktok')), 'bad_record')
  })

  const tomb = TH.gateTombOf(TH.gateThingOf())
  const GateShapeCases = [
    ['a tombstone that keeps its main wayin',        { ...tomb, wayins: TH.gateThingOf().wayins }],
    ['a tombstone that keeps a passkey wayin',       { ...tomb, wayins: { main: null, passkey0: TH.gateThingOf().wayins.main } }],
    ['a tombstone without its wayins',               TH.omitting(tomb, 'wayins')],
    ['a live gate with no main wayin',               { ...TH.gateThingOf(), wayins: TH.GoneWayins }],
    ['a live gate in a tombstone\'s odd life',       { ...TH.gateThingOf(), lifeseq: tomb.lifeseq, lifepath: tomb.lifepath }],
    ['a tombstone in a live even life',              { ...tomb, lifeseq: TH.gateThingOf().lifeseq, lifepath: TH.gateThingOf().lifepath }],
  ] as const

  for (const [blurb, record] of GateShapeCases) {
    it(`refuse a gate record that is ${blurb}, live and tombstone each of its own shape`, () => {
      TH.expectSyncRefusal(() => GateChecks.record.parse(record), 'bad_record')
      TH.expectSyncRefusal(() => GateChecks.stored.parse(record), 'incompatible_row')
    })
  }

  it("check a live gate's record alone as `live`", () => {
    expect(GateChecks.live.parse(TH.gateThingOf())).to.deep.equal(TH.gateThingOf())
    TH.expectSyncRefusal(() => GateChecks.live.parse(tomb), 'bad_record')
  })

  it("refuse a record whose modelkind is another kind's", () => {
    TH.expectSyncRefusal(() => GateChecks.record.parse({ ...TH.gateThingOf(), modelkind: 'box' }), 'bad_record')
    TH.expectSyncRefusal(() => BoxChecks.record.parse({ ...TH.boxThingOf(), modelkind: 'gate' }), 'bad_record')
    TH.expectSyncRefusal(() => GateChecks.record.parse(TH.omitting(TH.gateThingOf(), 'modelkind')), 'bad_record')
  })

  it("are frozen", () => {
    for (const bundle of [BankChecks, GateChecks, BoxChecks, ThingkindChecks]) { expect(Object.isFrozen(bundle)).to.be.true }
  })

  it("extract a box's stamp from its record, dropping its sidecar, sealed whisper, label and lifeseq", () => {
    const { sidecar: _sidecar, whisper_sealed: _whisperSealed, label: _label, lifeseq: _lifeseq, ...thing } = TH.boxThingOf()
    expect(BoxChecks.stamp.parse(TH.boxThingOf())).to.deep.equal(thing)
  })
})

describe("ThingkindChecks", () => {
  it("gives each kind's bundle by its modelkind", () => {
    expect(ThingkindChecks.byModelkind.gate).to.eq(GateChecks)
    expect(ThingkindChecks.byModelkind.box).to.eq(BoxChecks)
  })
})
