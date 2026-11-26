import { describe, expect, it } from 'vitest'
import { SX } from 'safebyok-big/internals'
import * as ManifestTags from '../../src/storage/manifest-tags'
import * as TH from '../test-helpers'

describe("ManifestTags, over the raw rows in a datastore", () => {
  it("never throws on a row that is no object, and finds it a tombstone that cites nothing", () => {
    for (const row of ['not a Thing', 42, true, []]) {
      expect(ManifestTags.presenceOf(row)).to.eq('gone')
      expect(ManifestTags.writeTagsOf(TH.birthAskOf(), row, false)).to.deep.include({ presence: 'gone', revtok_cmp: 'neq', revseq_cmp: 'birth', lifepath_eq: false })
    }
  })

  it("finds no cited revision behind a row whose revseq is no number", () => {
    const gate = TH.gateThingOf()
    const ask  = TH.replaceAskOf(gate, TH.nextGateOf(gate))
    expect(ManifestTags.writeTagsOf(ask, { ...gate, revseq: 'zero' }, false)).to.deep.include({ revtok_cmp: 'eq', revseq_cmp: 'ahead' })
  })

  it("judges a storage policy only over a live gate, and judges a gate whose wayins are no object as having none", () => {
    const gate = TH.gateThingOf()
    const ask  = TH.replaceAskOf(gate, TH.nextGateOf(gate, { wayins: { ...gate.wayins, passkey0: TH.Passkey0Wayin } }), { policies: ['add_passkey'] })
    expect(ManifestTags.writeTagsOf(ask, null, false).policies).to.deep.equal({ add_passkey: { ok: true } })
    expect(ManifestTags.writeTagsOf(ask, { ...gate, am: 'x' }, false).policies).to.deep.equal({ add_passkey: { ok: true } })
    expect(ManifestTags.writeTagsOf(ask, gate, false).policies).to.deep.equal({ add_passkey: { ok: true } })
    expect(ManifestTags.writeTagsOf(ask, { ...gate, wayins: 'none' }, false).policies.add_passkey).to.deep.include({ ok: false })
  })

  it("makes a written write's tags of its ask alone: those of the ante row its write predicate lets through", () => {
    const gate = TH.gateThingOf()
    const bank = TH.bankThingOf()
    const box  = TH.boxThingOf()
    const tomb = TH.boxTombOf(box)
    const writes = [
      [TH.birthAskOf(),                                                                                                       null],
      [TH.replaceAskOf(gate, TH.nextGateOf(gate, { wayins: { ...gate.wayins, passkey0: TH.Passkey0Wayin } }), { policies: ['add_passkey'] }), gate],
      [TH.replaceAskOf(bank, TH.nextOf(bank)),                                                                               bank],
      [TH.delAskFor(box, tomb),                                                                                               box],
      [TH.birthAskOf(TH.nextOf(tomb, { am: 'a' }), tomb),                                                                     tomb],
    ] as const
    for (const [ask, ante] of writes) {
      expect(ManifestTags.writtenTagsOf(ask), ask.labelpath).to.deep.equal(ManifestTags.writeTagsOf(ask, ante, true))
    }
  })

  it("gives the void lifetok for no bank row, the lifetok as it stands otherwise, and null for a row without one", () => {
    expect(ManifestTags.banktokOf(null)).to.eq(SX.VoidLifeTok)
    expect(ManifestTags.banktokOf(TH.bankThingOf())).to.eq(TH.bankThingOf().lifetok)
    expect(ManifestTags.banktokOf({ lifetok: 7 })).to.eq(7)
    expect(ManifestTags.banktokOf({ am: 'a' })).to.eq(null)
    expect(ManifestTags.banktokOf('damaged')).to.eq(null)
  })

  it("tracks each root as the same where its revseq and lifepath are the ones tracked, else its row", () => {
    const ask = { ...TH.getAskAt('box'), track: TH.trackOf() }
    const rows = { bank: TH.bankThingOf(), gate: 'not a Thing', box: null }
    expect(ManifestTags.trackedOf(ask, rows)).to.deep.equal({ bank: 'same', gate: 'not a Thing', box: null })
  })
})
