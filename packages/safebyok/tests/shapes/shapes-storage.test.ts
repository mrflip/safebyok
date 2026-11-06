import { describe, expect, it } from 'vitest'
import * as SX from '../../src/shapes/shapes-storage'
import * as TH from '../test-helpers'

describe("SX.sentinelBoxOf and the void row", () => {
  it("passes the void row a sentinel makes, its zero toks and its 2008 date, as a tombstone of its kind", () => {
    const scope = { applabel: 'testapp', user_id: 'u1', vaultlabel: 'default', boxlabel: 'anthropic_api_key' }
    const sentinel = SX.sentinelBoxOf(scope, 'vault-tok-1')
    expect(SX.boxTombstone.parse(sentinel)).to.deep.include({ ...SX.VoidRevision, box_tok: SX.VoidLifeTok, registered_at: SX.VoidTime, written_at: SX.VoidTime, am: 'x' })
    expect(new Date(SX.VoidTime).toISOString()).to.eq('2008-08-08T08:08:08.777Z')
    expect(SX.VoidRevisionTok).to.eq('00000000-0000-0000-0000-000000000000')
    expect(SX.VoidLifeTok).to.eq('00000000-0000-0000-0000-000000000000')
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
