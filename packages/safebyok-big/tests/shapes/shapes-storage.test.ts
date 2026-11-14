import { describe, expect, it } from 'vitest'
import * as BX from '../../src/shapes/shapes-bankdb'
import * as SX from '../../src/shapes/shapes-storage'
import { VaultError } from '../../src/refusals/errors'
import * as TH from '../test-helpers'
import * as BW from '../test-helpers/bankdb-world'

describe("the void row", () => {
  it("passes the void row a shell makes, its zero toks and its 2008 date, as a tombstone of its kind", () => {
    const scope = { user_id: 'u1', banklabel: 'testapp', vaultlabel: 'default', boxlabel: 'anthropic_api_key' }
    const shell = BX.shellBoxOf({ ...scope, bank_tok: 'bank-tok-1', vault_tok: 'vault-tok-1' })
    expect(BX.boxTombstone.parse(shell)).to.deep.include({ ...SX.VoidRevision, box_tok: SX.VoidLifeTok, registered_at: SX.VoidTime, written_at: SX.VoidTime, am: 'x' })
    expect(new Date(SX.VoidTime).toISOString()).to.eq('2008-08-08T08:08:08.777Z')
    expect(SX.VoidRevisionTok).to.eq('00000000-0000-0000-0000-000000000000')
    expect(SX.VoidLifeTok).to.eq('00000000-0000-0000-0000-000000000000')
  })
})

describe("SX.isLiveRow", () => {
  it("is true of a live row, false of a tombstone, a void row and anything that is no row", () => {
    const box = BW.boxAt()
    expect(SX.isLiveRow(box)).to.be.true
    expect(SX.isLiveRow(BW.boxTombstoneOf(box))).to.be.false
    expect(SX.isLiveRow(null)).to.be.false
    expect(SX.isLiveRow({ am: 'a' })).to.be.false
  })
})

describe("SX.putOpts", () => {
  const box = BW.boxAt()

  it("fills ifAbsent add and ifPresent repl, whether left out or sent as null", () => {
    const filled = { expected: box, ifAbsent: 'add', ifPresent: 'repl' }
    expect(SX.putOpts.parse({ expected: box })).to.deep.equal(filled)
    expect(SX.putOpts.parse({ expected: box, ifAbsent: null, ifPresent: null })).to.deep.equal(filled)
  })

  it("keeps the row expected whole, with or without a vault_tok, and refuses one that does not read as a row", () => {
    const shell = BX.shellBoxOf(box)
    expect(SX.putOpts.parse({ expected: shell }).expected).to.deep.equal(shell)
    const { vault_tok: _vault_tok, ...bankish } = box
    expect(SX.putOpts.parse({ expected: bankish }).expected).to.deep.equal(bankish)
    expect(() => SX.putOpts.parse({ expected: SX.VoidRevision })).to.throw(VaultError).with.property('refusalkind', 'bad_option')
  })
})

describe("capacity", () => {
  // capacity @example
  it("passes the boxes and the bytes, each its used against its max", () => {
    const full = { boxes: { used: 12, max: 100 }, bytes: { used: 48_000, max: 1_000_000 } }
    expect(SX.capacity.parse(full)).to.deep.equal(full)
  })

  it("keeps a limit of Infinity as the largest safe integer, so no figure past the check is infinite", () => {
    const parsed = SX.capacity.parse({ boxes: { used: 3, max: Infinity }, bytes: { used: 0, max: Infinity } })
    expect(parsed).to.deep.equal({ boxes: { used: 3, max: Number.MAX_SAFE_INTEGER }, bytes: { used: 0, max: Number.MAX_SAFE_INTEGER } })
  })

  const BadCapacities = [
    [{ boxes: { used: 1, max: 5 } },                                      'no bytes'],
    [{ boxes: { used: -1, max: 5 }, bytes: { used: 0, max: 5 } },         'a negative count used'],
    [{ boxes: { used: 1, max: 0 }, bytes: { used: 0, max: 5 } },          'a max of zero'],
    [{ boxes: { used: 1.5, max: 5 }, bytes: { used: 0, max: 5 } },        'a fractional count used'],
    ["full",                                                              'text'],
  ] as const
  for (const [given, blurb] of BadCapacities) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => SX.capacity.parse(given))
    })
  }
})
