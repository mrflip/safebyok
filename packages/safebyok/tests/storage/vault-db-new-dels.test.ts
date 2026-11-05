/** The VaultDB's dels and watch, over a MemoryVaultDB: a box or a vault deleted, rows past reading, tidyGone, and the notices a watch hears. */

import { describe, expect, it } from 'vitest'
import * as SX from '../../src/shapes/shapes-storage'
import type { BoxTombstone } from '../../src/shapes/shapes-storage'
import { bankScope, vaultScope, boxscope, Now, vaultAt, boxAt, vaultTombstoneOf, boxTombstoneOf, priorOf, stale, storeWith } from '../test-helpers/storage-world'

describe("MemoryVaultDB", () => {
  describe("delBox", () => {
    it("writes the tombstone over a live row at its revision", async () => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      const tombstone = boxTombstoneOf(box)
      expect(await vaultDB.delBox(tombstone, { prior: priorOf(box) })).to.deep.include({ act: 'deleted', val: tombstone, world: vault })
      expect(await vaultDB.getBox({ ...boxscope, vault_tok: 'life1' }, { ifAbsent: 'nil' })).to.deep.include({ act: 'gotgone', dbhas: tombstone })
    })

    it("answers void with a sentinel over a void row, and gone with the stored tombstone over a tombstone, whatever the revision", async () => {
      const { vaultDB, vault, box } = await storeWith()
      expect(await vaultDB.delBox(boxTombstoneOf(box), { prior: priorOf(box) })).to.deep.include({ act: 'void', val: SX.sentinelBoxOf(boxscope, 'life1'), world: vault })
      await vaultDB.putBox(box, { prior: SX.VoidRevision })
      const tombstone = boxTombstoneOf(box)
      await vaultDB.delBox(tombstone, { prior: priorOf(box) })
      expect(await vaultDB.delBox({ ...tombstone, revision_tok: 'again', revision_seq: 8 }, { prior: stale })).to.deep.include({ act: 'gone', val: tombstone, world: vault })
    })

    it("refuses stale_write over a live row moved past its prior, holding the row", async () => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      expect(await vaultDB.tryDelBox({ ...boxTombstoneOf(box), revision_seq: 8 }, { prior: stale })).to.deep.include({ ok: false, act: 'stale_write', dbhas: box, world: vault })
    })
  })

  describe("delVault", () => {
    it("writes the tombstone at its revision and tombstones this life's boxes in the same step, moving their revisions", async () => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      const tombstone = vaultTombstoneOf(vault)
      expect(await vaultDB.delVault(tombstone, { prior: priorOf(vault) })).to.deep.include({ act: 'deleted', val: tombstone, world: tombstone })
      const [row] = vaultDB._cheat_boxRowsOf(vaultScope, 'life1').values() as Iterable<BoxTombstone>
      expect(row).to.deep.include({ ...SX.boxSparse.parse(box), am: 'x', revision_seq: 1, written_at: tombstone.written_at, revision_tok: row?.revision_tok })
      expect(row?.revision_tok).to.not.eq(box.revision_tok)
      expect(SX.boxTombstone.safeParse(row).success).to.be.true
    })

    it("refuses stale_write over a live row moved past its prior, holding the row and tombstoning no box", async () => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      expect(await vaultDB.tryDelVault({ ...vaultTombstoneOf(vault), revision_seq: 8 }, { prior: stale })).to.deep.include({ ok: false, act: 'stale_write', dbhas: vault })
      expect(await vaultDB.getBox({ ...boxscope, vault_tok: 'life1' })).to.deep.include({ val: box })
    })

    it("a repeat over this life's tombstone moves no revision, whatever its own, and answers the tombstone", async () => {
      const { vaultDB, vault } = await storeWith()
      const tombstone = vaultTombstoneOf(vault)
      await vaultDB.delVault(tombstone, { prior: priorOf(vault) })
      expect(await vaultDB.delVault({ ...tombstone, revision_tok: 'again', revision_seq: 8 }, { prior: stale })).to.deep.include({ act: 'gone', val: tombstone, world: tombstone })
      expect(vaultDB._cheat_vaultRowsOf(bankScope).get('main')).to.deep.equal(tombstone)
    })

    it("over no row, or another life's, writes nothing, tombstones what lies under its vault_tok, and answers void with a sentinel", async () => {
      const { vaultDB, vault } = await storeWith()
      const oldBox = boxAt(0, 'oldlife')
      vaultDB._cheat_boxRowsOf(vaultScope, 'oldlife').set('openai', oldBox)
      const sentinel = SX.sentinelVaultOf(vaultScope, 'oldlife')
      const oldLife = vaultAt(0, 'oldlife')
      expect(await vaultDB.delVault(vaultTombstoneOf(oldLife), { prior: priorOf(oldLife) })).to.deep.include({ act: 'void', val: sentinel, world: sentinel })
      expect(vaultDB._cheat_vaultRowsOf(bankScope).get('main')).to.deep.equal(vault)
      expect(vaultDB._cheat_boxRowsOf(vaultScope, 'oldlife').get('openai')).to.include({ am: 'x', revision_seq: 1 })
    })
  })

  describe("delVault over a row past reading", () => {
    it("refuses 'damaged_row' or 'newer_format', and tombstones no box", async () => {
      const { vaultDB, box } = await storeWith({ box: true })
      const tombstone = vaultTombstoneOf(vaultAt())
      const prior = priorOf(vaultAt())
      vaultDB._cheat_vaultRowsOf(bankScope).set('main', { garbage: true })
      expect(await vaultDB.tryDelVault(tombstone, { prior })).to.deep.include({ ok: false, act: 'damaged_row' })
      vaultDB._cheat_vaultRowsOf(bankScope).set('main', { fmt: SX.VaultFormat + 1 })
      expect(await vaultDB.tryDelVault(tombstone, { prior })).to.deep.include({ ok: false, act: 'newer_format' })
      expect(vaultDB._cheat_boxRowsOf(vaultScope, 'life1').get('openai')).to.deep.equal(box)
    })
  })

  describe("a damaged row named as damaged_rows lists it", () => {
    it("delVault deletes rubble at the sentinels and cascades over nothing else; any other prior refuses 'damaged_row'", async () => {
      const { vaultDB, box } = await storeWith({ box: true })
      const rows = vaultDB._cheat_vaultRowsOf(bankScope)
      rows.set('main', { garbage: true })
      const tombstone = SX.vaultTombstone.parse({ ...SX.sentinelVaultOf(vaultScope), ...SX.nextRevisionOf(SX.VoidRevision, Now) })
      const missed = await vaultDB.tryDelVault(tombstone, { prior: { ...SX.VoidRevision, revision_tok: 'nope' } })
      expect(missed).to.deep.include({ ok: false, act: 'damaged_row' })
      const named = await vaultDB.tryDelVault(tombstone, { prior: SX.VoidRevision })
      expect(named).to.deep.include({ ok: true, act: 'deleted' })
      expect(rows.get('main')).to.include({ am: 'x', revision_seq: 0 })
      expect(vaultDB._cheat_boxRowsOf(vaultScope, 'life1').get('openai')).to.deep.equal(box)
    })

    it("delVault at the row's own revision and vault_tok deletes it, and this life's boxes; another vault_tok does not", async () => {
      const { vaultDB, vault } = await storeWith({ box: true })
      const rows = vaultDB._cheat_vaultRowsOf(bankScope)
      rows.set('main', { ...vault, am: 'x', gate: 'rubble' })
      const tombstone = vaultTombstoneOf(vault)
      const prior = priorOf(vault)
      const missed = await vaultDB.tryDelVault({ ...tombstone, vault_tok: 'otherlife' }, { prior })
      expect(missed).to.deep.include({ ok: false, act: 'damaged_row' })
      const named = await vaultDB.tryDelVault(tombstone, { prior })
      expect(named).to.deep.include({ ok: true, act: 'deleted' })
      expect(rows.get('main')).to.include({ am: 'x', revision_seq: 1 })
      expect(vaultDB._cheat_boxRowsOf(vaultScope, 'life1').get('openai')).to.include({ am: 'x' })
    })

    it("delBox deletes rubble at the sentinels, and refuses any other prior", async () => {
      const { vaultDB, box } = await storeWith({ box: true })
      const rows = vaultDB._cheat_boxRowsOf(vaultScope, 'life1')
      rows.set('openai', { garbage: true })
      const tombstone = SX.boxTombstone.parse({ ...SX.sentinelBoxOf(boxscope, 'life1'), ...SX.nextRevisionOf(SX.VoidRevision, Now) })
      const missed = await vaultDB.tryDelBox(boxTombstoneOf(box), { prior: priorOf(box) })
      expect(missed).to.deep.include({ ok: false, act: 'damaged_row' })
      const named = await vaultDB.tryDelBox(tombstone, { prior: SX.VoidRevision })
      expect(named).to.deep.include({ ok: true, act: 'deleted' })
      expect(rows.get('openai')).to.include({ am: 'x', revision_seq: 0 })
    })
  })

  describe("tidyGone", () => {
    it("removes the box rows of a tombstoned or vanished life, and counts the rows left in the bank", async () => {
      const { vaultDB, vault } = await storeWith({ box: true })
      vaultDB._cheat_boxRowsOf(vaultScope, 'oldlife').set('openai', boxAt(0, 'oldlife'))
      vaultDB._cheat_boxRowsOf({ ...vaultScope, vaultlabel: 'never' }, 'lost').set('openai', 'whatever')
      expect(await vaultDB.tidyGone(bankScope)).to.deep.include({ act: 'tidied', val: { totalCount: 1 }, world: bankScope })
      expect(vaultDB._cheat_boxRowsOf(vaultScope, 'oldlife').size).to.eq(0)
      await vaultDB.delVault(vaultTombstoneOf(vault), { prior: priorOf(vault) })
      expect(await vaultDB.tidyGone(bankScope)).to.deep.include({ val: { totalCount: 0 } })
      expect(vaultDB._cheat_boxRowsOf(vaultScope, 'life1').size).to.eq(0)
    })
  })

  describe("tidyGone over a vault row past reading", () => {
    it("keeps its boxes, as it may yet be read", async () => {
      const { vaultDB, box } = await storeWith({ box: true })
      vaultDB._cheat_vaultRowsOf(bankScope).set('main', { garbage: true })
      expect(await vaultDB.tidyGone(bankScope)).to.deep.include({ val: { totalCount: 1 } })
      expect(vaultDB._cheat_boxRowsOf(vaultScope, 'life1').get('openai')).to.deep.equal(box)
    })
  })

  describe("watch", () => {
    it("tells of a box row and a vault row that changed, as got and gone, until told to stop", async () => {
      const { vaultDB, vault, box } = await storeWith()
      const notices: unknown[] = []
      const unwatch = vaultDB.watch(vaultScope, (notice) => { notices.push(notice) })
      await vaultDB.putBox(box, { prior: SX.VoidRevision })
      await vaultDB.delVault(vaultTombstoneOf(vault), { prior: priorOf(vault) })
      expect(notices).to.have.lengthOf(3)
      expect(notices[0]).to.deep.equal({ act: 'got', val: box, world: vault })
      expect(notices[1]).to.deep.equal({ act: 'gone', val: vaultTombstoneOf(vault), world: vaultTombstoneOf(vault) })
      unwatch()
      await vaultDB.putVault(vaultAt(2, 'life2'), { prior: priorOf(vaultTombstoneOf(vault)) })
      expect(notices).to.have.lengthOf(3)
    })
  })

  describe("watch over a cascade", () => {
    it("hears its box under the vault row stored, not the request's tombstone", async () => {
      const { vaultDB, vault } = await storeWith()
      const oldLife = vaultAt(0, 'oldlife')
      vaultDB._cheat_boxRowsOf(vaultScope, 'oldlife').set('openai', boxAt(0, 'oldlife'))
      const notices: { world: unknown }[] = []
      vaultDB.watch(vaultScope, (notice) => { notices.push(notice) })
      await vaultDB.delVault(vaultTombstoneOf(oldLife), { prior: priorOf(oldLife) })
      expect(notices.map(({ world }) => world)).to.deep.equal([vault])
    })
  })
})
