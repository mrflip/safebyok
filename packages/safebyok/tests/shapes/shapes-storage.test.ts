import { describe, expect, it } from 'vitest'
import * as SX from '../../src/shapes/shapes-storage'

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
