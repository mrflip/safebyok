/** The battery's dels and tidyGone: a box or a vault deleted, a row past reading refused, and the box rows of an ended life tidied away. */

import { describe, expect, it } from 'vitest'
import * as SX from '../../src/shapes/shapes-storage'
import { bankScope, vaultScope, boxscope, Now, vaultAt, boxAt, boxFlaws, vaultFlaws, vaultTombstoneOf, boxTombstoneOf, priorOf, stale, boxQuery } from './storage-world'
import type { VaultDB } from '../../src/storage/vault-db'
import type { BatteryWorld } from './vault-db-battery'

/** Registers the dels' and tidyGone's cases over `world`. */
export const describeDels = ({ putWith, rowsOf }: BatteryWorld): void => {
  /** The box row `openai` under the life `vault_tok` of the vault, as stored. */
  const storedBoxOf = async (vaultDB: VaultDB, vault_tok = 'life1'): Promise<unknown> => {
    const boxrows = await rowsOf(vaultDB).boxRowsOf(vaultScope, vault_tok)
    return boxrows.get('openai')
  }

  describe("delBox", () => {
    it("writes the tombstone over a live row at its revision", async () => {
      const { vaultDB, vault, box } = await putWith({ box: true })
      const tombstone = boxTombstoneOf(box)
      expect(await vaultDB.delBox(tombstone, { prior: priorOf(box) })).to.deep.include({ act: 'deleted', val: tombstone, world: vault })
      expect(await vaultDB.getBox(boxQuery, { ifAbsent: 'nil' })).to.deep.include({ act: 'gotgone', dbhas: tombstone })
    })

    it("answers void with a sentinel over a void row, and gone with the stored tombstone over a tombstone, whatever the revision", async () => {
      const { vaultDB, vault, box } = await putWith()
      expect(await vaultDB.delBox(boxTombstoneOf(box), { prior: priorOf(box) })).to.deep.include({ act: 'void', val: SX.sentinelBoxOf(boxscope, 'life1'), world: vault })
      await vaultDB.putBox(box, { prior: SX.VoidRevision })
      const tombstone = boxTombstoneOf(box)
      await vaultDB.delBox(tombstone, { prior: priorOf(box) })
      expect(await vaultDB.delBox({ ...tombstone, revision_tok: 'again', revision_seq: 8 }, { prior: stale })).to.deep.include({ act: 'gone', val: tombstone, world: vault })
    })

    it("refuses over a live row moved past its prior, with the row", async () => {
      const { vaultDB, vault, box } = await putWith({ box: true })
      expect(await vaultDB.tryDelBox({ ...boxTombstoneOf(box), revision_seq: 8 }, { prior: stale })).to.deep.include({ ok: false, act: 'stale_write', dbhas: box, world: vault })
    })

    it("refuses a row past peeking at any prior, the sentinels a listing shows among them, with the row", async () => {
      const { vaultDB, box } = await putWith({ box: true })
      await rowsOf(vaultDB).plantBoxRow(boxscope, 'life1', { garbage: true })
      const sentinelled = SX.boxTombstone.parse({ ...SX.sentinelBoxOf(boxscope, 'life1'), ...SX.nextRevisionOf(SX.VoidRevision, Now) })
      expect(await vaultDB.tryDelBox(boxTombstoneOf(box), { prior: priorOf(box) })).to.deep.include({ ok: false, act: 'damaged_row' })
      expect(await vaultDB.tryDelBox(sentinelled, { prior: SX.VoidRevision })).to.deep.include({ ok: false, act: 'damaged_row' })
      expect(await storedBoxOf(vaultDB)).to.deep.equal({ garbage: true })
    })

    it.each(boxFlaws)("refuses a row with %s at its own revision, with the row", async (_flawname, flawOf) => {
      const { vaultDB, box } = await putWith({ box: true })
      const flawed = flawOf(box)
      await rowsOf(vaultDB).plantBoxRow(boxscope, 'life1', flawed)
      expect(await vaultDB.tryDelBox(boxTombstoneOf(box), { prior: priorOf(box) })).to.deep.include({ ok: false, act: 'damaged_row' })
      expect(await storedBoxOf(vaultDB)).to.deep.equal(flawed)
    })
  })

  describe("delVault", () => {
    it("writes the tombstone at its revision and tombstones this life's boxes in the same step, moving their revisions", async () => {
      const { vaultDB, vault, box } = await putWith({ box: true })
      const tombstone = vaultTombstoneOf(vault)
      expect(await vaultDB.delVault(tombstone, { prior: priorOf(vault) })).to.deep.include({ act: 'deleted', val: tombstone, world: tombstone })
      const row = SX.boxTombstone.parse(await storedBoxOf(vaultDB))
      expect(row).to.deep.include({ ...SX.boxSparse.parse(box), am: 'x', revision_seq: 1, written_at: tombstone.written_at, revision_tok: row.revision_tok })
      expect(row.revision_tok).to.not.eq(box.revision_tok)
    })

    it("refuses over a live row moved past its prior, with the row and tombstoning no box", async () => {
      const { vaultDB, vault, box } = await putWith({ box: true })
      expect(await vaultDB.tryDelVault({ ...vaultTombstoneOf(vault), revision_seq: 8 }, { prior: stale })).to.deep.include({ ok: false, act: 'stale_write', dbhas: vault })
      expect(await vaultDB.getBox(boxQuery)).to.deep.include({ val: box })
    })

    it("a repeat over this life's tombstone moves no revision, whatever its own, and answers the tombstone", async () => {
      const { vaultDB, vault } = await putWith()
      const tombstone = vaultTombstoneOf(vault)
      await vaultDB.delVault(tombstone, { prior: priorOf(vault) })
      expect(await vaultDB.delVault({ ...tombstone, revision_tok: 'again', revision_seq: 8 }, { prior: stale })).to.deep.include({ act: 'gone', val: tombstone, world: tombstone })
      expect(await rowsOf(vaultDB).vaultRowOf(vaultScope)).to.deep.equal(tombstone)
    })

    it("over no row, or another life's, writes nothing, tombstones what lies under its vault_tok, and answers void with a sentinel", async () => {
      const { vaultDB, vault } = await putWith()
      await rowsOf(vaultDB).plantBoxRow(boxscope, 'oldlife', boxAt(0, 'oldlife'))
      const sentinel = SX.sentinelVaultOf(vaultScope, 'oldlife')
      const oldLife = vaultAt(0, 'oldlife')
      expect(await vaultDB.delVault(vaultTombstoneOf(oldLife), { prior: priorOf(oldLife) })).to.deep.include({ act: 'void', val: sentinel, world: sentinel })
      expect(await rowsOf(vaultDB).vaultRowOf(vaultScope)).to.deep.equal(vault)
      expect(await storedBoxOf(vaultDB, 'oldlife')).to.include({ am: 'x', revision_seq: 1 })
    })

    it("refuses a row failing its checks, a later fmt among them, and tombstones no box", async () => {
      const { vaultDB, box } = await putWith({ box: true })
      const tombstone = vaultTombstoneOf(vaultAt())
      const prior = priorOf(vaultAt())
      await rowsOf(vaultDB).plantVaultRow(vaultScope, { garbage: true })
      expect(await vaultDB.tryDelVault(tombstone, { prior })).to.deep.include({ ok: false, act: 'damaged_row' })
      await rowsOf(vaultDB).plantVaultRow(vaultScope, { fmt: SX.VaultFormat + 1 })
      expect(await vaultDB.tryDelVault(tombstone, { prior })).to.deep.include({ ok: false, act: 'damaged_row' })
      expect(await storedBoxOf(vaultDB)).to.deep.equal(box)
    })

    it("refuses a row past peeking at the sentinels a listing shows, and a damaged tombstone at its own revision, tombstoning no box", async () => {
      const { vaultDB, vault, box } = await putWith({ box: true })
      await rowsOf(vaultDB).plantVaultRow(vaultScope, { garbage: true })
      const sentinelled = SX.vaultTombstone.parse({ ...SX.sentinelVaultOf(vaultScope), ...SX.nextRevisionOf(SX.VoidRevision, Now) })
      expect(await vaultDB.tryDelVault(sentinelled, { prior: SX.VoidRevision })).to.deep.include({ ok: false, act: 'damaged_row' })
      await rowsOf(vaultDB).plantVaultRow(vaultScope, { ...vault, am: 'x', gate: 'rubble' })
      expect(await vaultDB.tryDelVault(vaultTombstoneOf(vault), { prior: priorOf(vault) })).to.deep.include({ ok: false, act: 'damaged_row' })
      expect(await storedBoxOf(vaultDB)).to.deep.equal(box)
    })

    it.each(vaultFlaws)("refuses a row with %s at its own revision, with the row and tombstoning no box", async (_flawname, flawOf) => {
      const { vaultDB, vault, box } = await putWith({ box: true })
      const flawed = flawOf(vault)
      await rowsOf(vaultDB).plantVaultRow(vaultScope, flawed)
      expect(await vaultDB.tryDelVault(vaultTombstoneOf(vault), { prior: priorOf(vault) })).to.deep.include({ ok: false, act: 'damaged_row' })
      expect(await rowsOf(vaultDB).vaultRowOf(vaultScope)).to.deep.equal(flawed)
      expect(await storedBoxOf(vaultDB)).to.deep.equal(box)
    })
  })

  describe("tidyGone", () => {
    it("removes the box rows of a tombstoned or vanished life, and counts the rows left in the bank", async () => {
      const { vaultDB, vault } = await putWith({ box: true })
      await rowsOf(vaultDB).plantBoxRow(boxscope, 'oldlife', boxAt(0, 'oldlife'))
      await rowsOf(vaultDB).plantBoxRow({ ...boxscope, vaultlabel: 'never' }, 'lost', 'whatever')
      expect(await vaultDB.tidyGone(bankScope)).to.deep.include({ act: 'tidied', val: { totalCount: 1 }, world: bankScope })
      expect(await rowsOf(vaultDB).boxRowsOf(vaultScope, 'oldlife')).to.have.property('size', 0)
      await vaultDB.delVault(vaultTombstoneOf(vault), { prior: priorOf(vault) })
      expect(await vaultDB.tidyGone(bankScope)).to.deep.include({ val: { totalCount: 0 } })
      expect(await rowsOf(vaultDB).boxRowsOf(vaultScope, 'life1')).to.have.property('size', 0)
    })

    it("keeps the boxes under a vault row past reading, as it may yet be read", async () => {
      const { vaultDB, box } = await putWith({ box: true })
      await rowsOf(vaultDB).plantVaultRow(vaultScope, { garbage: true })
      expect(await vaultDB.tidyGone(bankScope)).to.deep.include({ val: { totalCount: 1 } })
      expect(await storedBoxOf(vaultDB)).to.deep.equal(box)
    })

    it.each([
      ['a tombstone',       { am: 'x', smuggled: 'field' }],
      ["another life's row", { vault_tok: 'life2', smuggled: 'field' }],
    ])("keeps the boxes under a row failing its check that peeks as %s", async (_peekname, flaw) => {
      const { vaultDB, vault, box } = await putWith({ box: true })
      await rowsOf(vaultDB).plantVaultRow(vaultScope, { ...vault, ...flaw })
      expect(await vaultDB.tidyGone(bankScope)).to.deep.include({ val: { totalCount: 1 } })
      expect(await storedBoxOf(vaultDB)).to.deep.equal(box)
    })
  })
}
