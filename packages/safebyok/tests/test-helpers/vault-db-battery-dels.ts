/** The battery's dels and tidyGone: a box or a vault deleted, a row past reading named and deleted, and the box rows of an ended life tidied away. */

import { describe, expect, it } from 'vitest'
import * as SX from '../../src/shapes/shapes-storage'
import { bankScope, vaultScope, boxscope, Now, vaultAt, boxAt, vaultTombstoneOf, boxTombstoneOf, priorOf, stale, boxQuery } from './storage-world'
import type { VaultDB } from '../../src/storage/vault-db'
import type { BatteryWorld } from './vault-db-battery'

/** Registers the dels' and tidyGone's cases over `world`. */
export const describeDels = ({ storeWith, rowsOf }: BatteryWorld): void => {
  /** The box row `openai` under the life `vault_tok` of the vault, as stored. */
  const storedBoxOf = async (vaultDB: VaultDB, vault_tok = 'life1'): Promise<unknown> => {
    const boxrows = await rowsOf(vaultDB).boxRowsOf(vaultScope, vault_tok)
    return boxrows.get('openai')
  }

  describe("delBox", () => {
    it("writes the tombstone over a live row at its revision", async () => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      const tombstone = boxTombstoneOf(box)
      expect(await vaultDB.delBox(tombstone, { prior: priorOf(box) })).to.deep.include({ act: 'deleted', val: tombstone, world: vault })
      expect(await vaultDB.getBox(boxQuery, { ifAbsent: 'nil' })).to.deep.include({ act: 'gotgone', dbhas: tombstone })
    })

    it("answers void with a sentinel over a void row, and gone with the stored tombstone over a tombstone, whatever the revision", async () => {
      const { vaultDB, vault, box } = await storeWith()
      expect(await vaultDB.delBox(boxTombstoneOf(box), { prior: priorOf(box) })).to.deep.include({ act: 'void', val: SX.sentinelBoxOf(boxscope, 'life1'), world: vault })
      await vaultDB.putBox(box, { prior: SX.VoidRevision })
      const tombstone = boxTombstoneOf(box)
      await vaultDB.delBox(tombstone, { prior: priorOf(box) })
      expect(await vaultDB.delBox({ ...tombstone, revision_tok: 'again', revision_seq: 8 }, { prior: stale })).to.deep.include({ act: 'gone', val: tombstone, world: vault })
    })

    it("refuses over a live row moved past its prior, holding the row", async () => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      expect(await vaultDB.tryDelBox({ ...boxTombstoneOf(box), revision_seq: 8 }, { prior: stale })).to.deep.include({ ok: false, act: 'stale_write', dbhas: box, world: vault })
    })
  })

  describe("delVault", () => {
    it("writes the tombstone at its revision and tombstones this life's boxes in the same step, moving their revisions", async () => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      const tombstone = vaultTombstoneOf(vault)
      expect(await vaultDB.delVault(tombstone, { prior: priorOf(vault) })).to.deep.include({ act: 'deleted', val: tombstone, world: tombstone })
      const row = SX.boxTombstone.parse(await storedBoxOf(vaultDB))
      expect(row).to.deep.include({ ...SX.boxSparse.parse(box), am: 'x', revision_seq: 1, written_at: tombstone.written_at, revision_tok: row.revision_tok })
      expect(row.revision_tok).to.not.eq(box.revision_tok)
    })

    it("refuses over a live row moved past its prior, holding the row and tombstoning no box", async () => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      expect(await vaultDB.tryDelVault({ ...vaultTombstoneOf(vault), revision_seq: 8 }, { prior: stale })).to.deep.include({ ok: false, act: 'stale_write', dbhas: vault })
      expect(await vaultDB.getBox(boxQuery)).to.deep.include({ val: box })
    })

    it("a repeat over this life's tombstone moves no revision, whatever its own, and answers the tombstone", async () => {
      const { vaultDB, vault } = await storeWith()
      const tombstone = vaultTombstoneOf(vault)
      await vaultDB.delVault(tombstone, { prior: priorOf(vault) })
      expect(await vaultDB.delVault({ ...tombstone, revision_tok: 'again', revision_seq: 8 }, { prior: stale })).to.deep.include({ act: 'gone', val: tombstone, world: tombstone })
      expect(await rowsOf(vaultDB).vaultRowOf(vaultScope)).to.deep.equal(tombstone)
    })

    it("over no row, or another life's, writes nothing, tombstones what lies under its vault_tok, and answers void with a sentinel", async () => {
      const { vaultDB, vault } = await storeWith()
      await rowsOf(vaultDB).plantBoxRow(boxscope, 'oldlife', boxAt(0, 'oldlife'))
      const sentinel = SX.sentinelVaultOf(vaultScope, 'oldlife')
      const oldLife = vaultAt(0, 'oldlife')
      expect(await vaultDB.delVault(vaultTombstoneOf(oldLife), { prior: priorOf(oldLife) })).to.deep.include({ act: 'void', val: sentinel, world: sentinel })
      expect(await rowsOf(vaultDB).vaultRowOf(vaultScope)).to.deep.equal(vault)
      expect(await storedBoxOf(vaultDB, 'oldlife')).to.include({ am: 'x', revision_seq: 1 })
    })

    it("refuses a row failing its checks, a later fmt among them, and tombstones no box", async () => {
      const { vaultDB, box } = await storeWith({ box: true })
      const tombstone = vaultTombstoneOf(vaultAt())
      const prior = priorOf(vaultAt())
      await rowsOf(vaultDB).plantVaultRow(vaultScope, { garbage: true })
      expect(await vaultDB.tryDelVault(tombstone, { prior })).to.deep.include({ ok: false, act: 'damaged_row' })
      await rowsOf(vaultDB).plantVaultRow(vaultScope, { fmt: SX.VaultFormat + 1 })
      expect(await vaultDB.tryDelVault(tombstone, { prior })).to.deep.include({ ok: false, act: 'damaged_row' })
      expect(await storedBoxOf(vaultDB)).to.deep.equal(box)
    })
  })

  describe("a damaged row named as damaged_rows lists it", () => {
    it("delVault deletes rubble at the sentinels and cascades over nothing else; any other prior refuses it", async () => {
      const { vaultDB, box } = await storeWith({ box: true })
      await rowsOf(vaultDB).plantVaultRow(vaultScope, { garbage: true })
      const tombstone = SX.vaultTombstone.parse({ ...SX.sentinelVaultOf(vaultScope), ...SX.nextRevisionOf(SX.VoidRevision, Now) })
      const missed = await vaultDB.tryDelVault(tombstone, { prior: { ...SX.VoidRevision, revision_tok: 'nope' } })
      expect(missed).to.deep.include({ ok: false, act: 'damaged_row' })
      const named = await vaultDB.tryDelVault(tombstone, { prior: SX.VoidRevision })
      expect(named).to.deep.include({ ok: true, act: 'deleted' })
      expect(await rowsOf(vaultDB).vaultRowOf(vaultScope)).to.include({ am: 'x', revision_seq: 0 })
      expect(await storedBoxOf(vaultDB)).to.deep.equal(box)
    })

    it("delVault at the row's own revision and vault_tok deletes it, and this life's boxes; another vault_tok does not", async () => {
      const { vaultDB, vault } = await storeWith({ box: true })
      await rowsOf(vaultDB).plantVaultRow(vaultScope, { ...vault, am: 'x', gate: 'rubble' })
      const tombstone = vaultTombstoneOf(vault)
      const prior = priorOf(vault)
      const missed = await vaultDB.tryDelVault({ ...tombstone, vault_tok: 'otherlife' }, { prior })
      expect(missed).to.deep.include({ ok: false, act: 'damaged_row' })
      const named = await vaultDB.tryDelVault(tombstone, { prior })
      expect(named).to.deep.include({ ok: true, act: 'deleted' })
      expect(await rowsOf(vaultDB).vaultRowOf(vaultScope)).to.include({ am: 'x', revision_seq: 1 })
      expect(await storedBoxOf(vaultDB)).to.include({ am: 'x' })
    })

    it("delBox deletes rubble at the sentinels, and refuses any other prior", async () => {
      const { vaultDB, box } = await storeWith({ box: true })
      await rowsOf(vaultDB).plantBoxRow(boxscope, 'life1', { garbage: true })
      const tombstone = SX.boxTombstone.parse({ ...SX.sentinelBoxOf(boxscope, 'life1'), ...SX.nextRevisionOf(SX.VoidRevision, Now) })
      const missed = await vaultDB.tryDelBox(boxTombstoneOf(box), { prior: priorOf(box) })
      expect(missed).to.deep.include({ ok: false, act: 'damaged_row' })
      const named = await vaultDB.tryDelBox(tombstone, { prior: SX.VoidRevision })
      expect(named).to.deep.include({ ok: true, act: 'deleted' })
      expect(await storedBoxOf(vaultDB)).to.include({ am: 'x', revision_seq: 0 })
    })
  })

  describe("tidyGone", () => {
    it("removes the box rows of a tombstoned or vanished life, and counts the rows left in the bank", async () => {
      const { vaultDB, vault } = await storeWith({ box: true })
      await rowsOf(vaultDB).plantBoxRow(boxscope, 'oldlife', boxAt(0, 'oldlife'))
      await rowsOf(vaultDB).plantBoxRow({ ...boxscope, vaultlabel: 'never' }, 'lost', 'whatever')
      expect(await vaultDB.tidyGone(bankScope)).to.deep.include({ act: 'tidied', val: { totalCount: 1 }, world: bankScope })
      expect(await rowsOf(vaultDB).boxRowsOf(vaultScope, 'oldlife')).to.have.property('size', 0)
      await vaultDB.delVault(vaultTombstoneOf(vault), { prior: priorOf(vault) })
      expect(await vaultDB.tidyGone(bankScope)).to.deep.include({ val: { totalCount: 0 } })
      expect(await rowsOf(vaultDB).boxRowsOf(vaultScope, 'life1')).to.have.property('size', 0)
    })

    it("keeps the boxes under a vault row past reading, as it may yet be read", async () => {
      const { vaultDB, box } = await storeWith({ box: true })
      await rowsOf(vaultDB).plantVaultRow(vaultScope, { garbage: true })
      expect(await vaultDB.tidyGone(bankScope)).to.deep.include({ val: { totalCount: 1 } })
      expect(await storedBoxOf(vaultDB)).to.deep.equal(box)
    })
  })
}
