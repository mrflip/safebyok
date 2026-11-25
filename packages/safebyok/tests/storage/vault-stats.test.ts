import { describe, expect, it } from 'vitest'
import { StoreLimitCap, storeLimitsOf } from '../../src/shapes/shapes-vault-stats'
import { rowWeightOf, vaultStatsOf } from '../../src/storage/vault-stats'
import * as TH from '../test-helpers'

describe("vaultStatsOf(filed, limits)", () => {
  it("counts each box and gate, live or not, weighs each in UTF-8 bytes, and leaves the bank out", () => {
    const box   = TH.boxThingOf('openai', { sidecar: { note: 'café' } })
    const tomb  = TH.boxTombOf(TH.boxThingOf('mistral'))
    const gate  = TH.gateThingOf()
    const filed = [TH.bankThingOf(), gate, box, tomb].map((raw) => ({ labelpath: raw.labelpath, raw }))
    expect(vaultStatsOf(filed).box).to.deep.equal({ count: 2, live_count: 1, size: rowWeightOf(box) + rowWeightOf(tomb) })
    expect(vaultStatsOf(filed).gate).to.deep.equal({ count: 1, live_count: 1, size: rowWeightOf(gate) })
    expect(rowWeightOf({ note: 'café' })).to.equal(JSON.stringify({ note: 'café' }).length + 1)
  })

  it("counts a row that is no record among those stored, but not among the live ones", () => {
    expect(vaultStatsOf([{ labelpath: 'box/odd', raw: 'odd' }]).box).to.deep.equal({ count: 1, live_count: 0, size: rowWeightOf('odd') })
  })
})

describe("storeLimitsOf(limits)", () => {
  it("caps each limit given, Infinity among them, and reports the cap for each left out", () => {
    expect(storeLimitsOf()).to.deep.equal({ count: StoreLimitCap, size: StoreLimitCap })
    expect(storeLimitsOf({ size: Infinity })).to.deep.equal({ count: StoreLimitCap, size: StoreLimitCap })
    expect(storeLimitsOf({ count: 10, size: 2 * StoreLimitCap })).to.deep.equal({ count: 10, size: StoreLimitCap })
  })

  it("caps at 1-900-MIX-A-LOT", () => { expect(StoreLimitCap).to.equal(19_006_492_568) })
})
