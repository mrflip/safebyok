import { describe, expect, it } from 'vitest'
import { AskChecks } from '../../src/shapes/shapes-asks'
import { StampChecks } from '../../src/shapes/shapes-stamps'
import { BankChecks, BoxChecks, GateChecks, ThingkindChecks } from '../../src/shapes/shapes-thingkinds'
import * as TH from '../test-helpers'

describe("BankChecks, GateChecks and BoxChecks", () => {
  it("carry each kind's stamp and ask checks as the same checks StampChecks and AskChecks hold", () => {
    expect(BankChecks.stamp).to.eq(StampChecks.bankStamp)
    expect(BankChecks.birthAsk).to.eq(AskChecks.birthBankAsk)
    expect(GateChecks.stamp).to.eq(StampChecks.gateStamp)
    expect(GateChecks.stampedGate).to.eq(StampChecks.stampedGate)
    expect(BoxChecks.stamp).to.eq(StampChecks.boxStamp)
  })

  it("are frozen", () => {
    for (const bundle of [BankChecks, GateChecks, BoxChecks, ThingkindChecks]) { expect(Object.isFrozen(bundle)).to.be.true }
  })

  it("take a box's stamp out of its record, dropping its sidecar and sealed whisper", () => {
    const { sidecar: _sidecar, whisper_sealed: _whisperSealed, ...thing } = TH.boxThingOf()
    expect(BoxChecks.stamp.parse(TH.boxThingOf())).to.deep.equal(thing)
  })
})

describe("ThingkindChecks", () => {
  it("gives each kind's bundle by its modelkind", () => {
    expect(ThingkindChecks.byModelkind.bank).to.eq(BankChecks)
    expect(ThingkindChecks.byModelkind.gate).to.eq(GateChecks)
    expect(ThingkindChecks.byModelkind.box).to.eq(BoxChecks)
  })

  it("gives each kind's bundle by a labelpath of that kind", () => {
    expect(ThingkindChecks.ofLabelpath('bank')).to.eq(BankChecks)
    expect(ThingkindChecks.ofLabelpath('gate')).to.eq(GateChecks)
    expect(ThingkindChecks.ofLabelpath('box/anthropic')).to.eq(BoxChecks)
  })
})
