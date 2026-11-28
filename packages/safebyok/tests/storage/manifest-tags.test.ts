import { describe, expect, it } from 'vitest'
import { SX } from 'safebyok-big/internals'
import { birthPutsOf } from '../../src/shapes/shapes-asks'
import * as ManifestTags from '../../src/storage/manifest-tags'
import * as TH from '../test-helpers'

describe("ManifestTags, over the raw rows in a datastore", () => {
  it("reads a row that is no object as a tombstone that cites nothing", () => {
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

  it("judges a storage policy only over a live gate", () => {
    const gate = TH.gateThingOf()
    const ask  = TH.replaceAskOf(gate, TH.nextGateOf(gate, { wayins: TH.WithPasskey }), { policies: ['add_passkey'] })
    expect(ManifestTags.writeTagsOf(ask, null, false).policies).to.deep.equal({ add_passkey: { ok: true } })
    expect(ManifestTags.writeTagsOf(ask, { ...gate, am: 'x' }, false).policies).to.deep.equal({ add_passkey: { ok: true } })
    expect(ManifestTags.writeTagsOf(ask, gate, false).policies).to.deep.equal({ add_passkey: { ok: true } })
  })

  it("judges a gate whose wayins are no object as having none", () => {
    const gate = TH.gateThingOf()
    const ask  = TH.replaceAskOf(gate, TH.nextGateOf(gate, { wayins: TH.WithPasskey }), { policies: ['add_passkey'] })
    expect(ManifestTags.writeTagsOf(ask, { ...gate, wayins: 'none' }, false).policies.add_passkey).to.deep.equal({ ok: false, refusaltag: 'PasskeyStored' })
  })

  it("makes a written write's tags of its ask alone: those of the ante row its write predicate lets through", () => {
    const gate = TH.gateThingOf()
    const box  = TH.boxThingOf()
    const tomb = TH.boxTombOf(box)
    const writes = [
      [TH.birthAskOf(),                                                                                                       null],
      [TH.replaceAskOf(gate, TH.nextGateOf(gate, { wayins: TH.WithPasskey }), { policies: ['add_passkey'] }), gate],
      [TH.replaceAskOf(gate, TH.nextGateOf(gate)),                                                                           gate],
      [TH.delAskFor(gate, TH.gateTombOf(gate)),                                                                               gate],
      [TH.delAskFor(box, tomb),                                                                                               box],
      [TH.birthAskOf(TH.nextOf(tomb, { am: 'a' }), tomb),                                                                     tomb],
    ] as const
    for (const [ask, ante] of writes) {
      expect(ManifestTags.writtenTagsOf(ask), ask.labelpath).to.deep.equal(ManifestTags.writeTagsOf(ask, ante, true))
    }
  })

  it("makes a written birth's tags of its puts alone, those it makes of the roots each put cites", () => {
    const gateGone = TH.gateTombOf(TH.gateThingOf())
    const rootGone = TH.boxTombOf(TH.rootBoxOf())
    const cases = [[null, null], [gateGone, null], [gateGone, rootGone], [null, rootGone]] as const
    for (const [gate, root] of cases) {
      const puts = birthPutsOf(TH.rebirthBankAskOf(gate, root))
      expect(ManifestTags.writtenBirthTagsOf(puts)).to.deep.equal(ManifestTags.birthTagsOf(puts, { gate, root }, true))
    }
  })

  it("gives a gate row's banktok as it stands, the void banktok for no row, and null for a row without one", () => {
    expect(ManifestTags.banktokOf(null)).to.eq(SX.VoidLifeTok)
    const gate = TH.gateThingOf()
    expect(ManifestTags.banktokOf(gate)).to.eq(gate.banktok)
    expect(ManifestTags.banktokOf(TH.gateTombOf(gate))).to.eq(gate.banktok)
    expect(ManifestTags.banktokOf({ banktok: 7 })).to.eq(7)
    expect(ManifestTags.banktokOf({ am: 'a' })).to.eq(null)
    expect(ManifestTags.banktokOf('damaged')).to.eq(null)
  })

  it("tracks each root as the same where its revseq and lifepath are the ones tracked, else its row", () => {
    const ask = { ...TH.getAskAt('box', 'box'), track: TH.trackOf() }
    expect(ManifestTags.trackedOf(ask, { gate: TH.gateThingOf(), root: null })).to.deep.equal({ gate: 'same', root: null })
    expect(ManifestTags.trackedOf(ask, { gate: 'not a Thing', root: TH.rootBoxOf() })).to.deep.equal({ gate: 'not a Thing', root: 'same' })
  })
})
