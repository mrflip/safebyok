import { describe, expect, it } from 'vitest'
import * as SX from '../../src/shapes/shapes-storage'
import * as TH from '../test-helpers'
import { boxAt, boxFlaws, boxTombstoneOf, priorOf, stale, vaultAt, vaultFlaws, vaultTombstoneOf } from '../test-helpers/storage-world'

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

describe("the row checks a VaultDB's conditional writes run", () => {
  const box = boxAt()
  const vault = vaultAt()
  const putOver = { prior: SX.VoidRevision, ifAbsent: 'add', ifPresent: 'repl' } as const

  it("isLiveVaultRecord and isLiveBoxRecord answer true for a live row of the life named, and false for another life, a tombstone or no row", () => {
    expect(SX.isLiveBoxRecord(box, 'life1')).to.be.true
    expect(SX.isLiveVaultRecord(vault, 'life1')).to.be.true
    expect(SX.isLiveBoxRecord(box, 'life2')).to.be.false
    expect(SX.isLiveVaultRecord(vault, 'life2')).to.be.false
    expect(SX.isLiveBoxRecord(boxTombstoneOf(box), 'life1')).to.be.false
    expect(SX.isLiveVaultRecord(vaultTombstoneOf(vault), 'life1')).to.be.false
    expect(SX.isLiveBoxRecord(null, 'life1')).to.be.false
    expect(SX.isLiveVaultRecord(null, 'life1')).to.be.false
  })

  it.each(boxFlaws)("isLiveBoxRecord and isBoxPutAllowed answer false for a row holding %s", (_flawname, flawOf) => {
    expect(SX.isLiveBoxRecord(flawOf(box), 'life1')).to.be.false
    expect(SX.isBoxPutAllowed(flawOf(box), { ...putOver, prior: priorOf(box) })).to.be.false
  })

  it.each(vaultFlaws)("isLiveVaultRecord and isVaultPutAllowed answer false for a row holding %s", (_flawname, flawOf) => {
    expect(SX.isLiveVaultRecord(flawOf(vault), 'life1')).to.be.false
    expect(SX.isVaultPutAllowed(flawOf(vault), { ...putOver, prior: priorOf(vault) })).to.be.false
  })

  it("isBoxPutAllowed follows prior, ifAbsent and ifPresent over no row, a tombstone and a live row", () => {
    expect(SX.isBoxPutAllowed(null, putOver)).to.be.true
    expect(SX.isBoxPutAllowed(null, { ...putOver, ifAbsent: 'fail' })).to.be.false
    expect(SX.isBoxPutAllowed(null, { ...putOver, prior: stale })).to.be.false
    const tombstone = boxTombstoneOf(box)
    expect(SX.isBoxPutAllowed(tombstone, { ...putOver, prior: priorOf(tombstone) })).to.be.true
    expect(SX.isBoxPutAllowed(tombstone, { ...putOver, prior: priorOf(tombstone), ifAbsent: 'fail' })).to.be.false
    expect(SX.isBoxPutAllowed(box, { ...putOver, prior: priorOf(box) })).to.be.true
    expect(SX.isBoxPutAllowed(box, { ...putOver, prior: priorOf(box), ifPresent: 'fail' })).to.be.false
    expect(SX.isBoxPutAllowed(box, { ...putOver, prior: stale })).to.be.false
  })

  it("isVaultPutAllowed answers true at a tombstone's revision, and false over a live row a gate verb did not name", () => {
    const tombstone = vaultTombstoneOf(vault)
    expect(SX.isVaultPutAllowed(null, putOver)).to.be.true
    expect(SX.isVaultPutAllowed(tombstone, { ...putOver, prior: priorOf(tombstone) })).to.be.true
    expect(SX.isVaultPutAllowed(vault, { ...putOver, prior: priorOf(vault), ifPresent: 'fail' })).to.be.false
  })

  it("isLifeOver answers true for no row, a tombstone or another life's row, and false for this life's row and any row failing its check", () => {
    expect(SX.isLifeOver(null, 'life1')).to.be.true
    expect(SX.isLifeOver(vaultTombstoneOf(vault), 'life1')).to.be.true
    expect(SX.isLifeOver(vaultAt(0, 'life2'), 'life1')).to.be.true
    expect(SX.isLifeOver(vault, 'life1')).to.be.false
    expect(SX.isLifeOver({ ...vault, am: 'x' }, 'life1')).to.be.false
    expect(SX.isLifeOver({ ...vault, vault_tok: 'life2', smuggled: 'field' }, 'life1')).to.be.false
    expect(SX.isLifeOver({ garbage: true }, 'life1')).to.be.false
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
