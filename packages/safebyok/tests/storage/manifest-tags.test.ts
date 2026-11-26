import { describe, expect, it } from 'vitest'
import { SX } from 'safebyok-big/internals'
import { banktokOf, presenceOf, trackedOf, writeTagsOf } from '../../src/storage/manifest-tags'
import * as TH from '../test-helpers'

describe("ManifestTags, over rows a datastore holds", () => {
  it("never throws on a row that is no object, and finds it a tombstone that cites nothing", () => {
    for (const row of ['not a Thing', 42, true, []]) {
      expect(presenceOf(row)).to.eq('gone')
      expect(writeTagsOf(TH.birthAskOf(), row, false)).to.deep.include({ presence: 'gone', revtok_cmp: 'neq', revseq_cmp: 'birth', lifepath_eq: false })
    }
  })

  it("finds no cited revision behind a row whose revseq is no number", () => {
    const gate = TH.gateThingOf()
    const ask  = TH.replaceAskOf(gate, TH.nextGateOf(gate))
    expect(writeTagsOf(ask, { ...gate, revseq: 'zero' }, false)).to.deep.include({ revtok_cmp: 'eq', revseq_cmp: 'ahead' })
  })

  it("judges a storage policy only over a live gate, and judges a gate whose wayins are no object as having none", () => {
    const gate = TH.gateThingOf()
    const ask  = TH.replaceAskOf(gate, TH.nextGateOf(gate, { wayins: { ...gate.wayins, passkey0: TH.Passkey0Wayin } }), { policies: ['add_passkey'] })
    expect(writeTagsOf(ask, null, false).policies).to.deep.equal({ add_passkey: { ok: true } })
    expect(writeTagsOf(ask, { ...gate, am: 'x' }, false).policies).to.deep.equal({ add_passkey: { ok: true } })
    expect(writeTagsOf(ask, gate, false).policies).to.deep.equal({ add_passkey: { ok: true } })
    expect(writeTagsOf(ask, { ...gate, wayins: 'none' }, false).policies.add_passkey).to.deep.include({ ok: false })
  })

  it("gives the void lifetok for no bank row, and the lifetok as it stands otherwise", () => {
    expect(banktokOf(null)).to.eq(SX.VoidLifeTok)
    expect(banktokOf(TH.bankThingOf())).to.eq(TH.bankThingOf().lifetok)
    expect(banktokOf({ lifetok: 7 })).to.eq(7)
  })

  it("tracks each root as the same where its revseq and lifepath are the ones tracked, else its row", () => {
    const ask = { ...TH.getAskAt('box'), track: TH.trackOf() }
    const rows = { bank: TH.bankThingOf(), gate: 'not a Thing', box: null }
    expect(trackedOf(ask, rows)).to.deep.equal({ bank: 'same', gate: 'not a Thing', box: null })
  })
})
