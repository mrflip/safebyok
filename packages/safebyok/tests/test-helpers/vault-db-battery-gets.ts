/** The battery's gets: listVaults, getVault, listBoxes and getBox over each row they may find, and what a store keeps whole and to itself. */

import { describe, expect, it } from 'vitest'
import * as SX from '../../src/shapes/shapes-storage'
import { bankScope, vaultScope, boxscope, vaultScopeOf, boxscopeOf, vaultAt, boxAt, vaultTombstoneOf, boxTombstoneOf, priorOf, vaultQuery, boxQuery } from './storage-world'
import type { BatteryWorld } from './vault-db-battery'

/** User ids a store keying its rows by a joined string could run together. */
const NearUserIds = ['u1', 'u1:', 'u1|', 'u1%', 'u1%3A', 'u1.', 'u1@', 'u1~', 'u1+']

/** A sidecar no store may change on the way back: accents composed and decomposed, an emoji, a tab, a newline, quotes, backslashes, Hebrew, a null and a fraction. */
const LiteralSidecar = {
  note:  'caf\u{E9} cafe\u{301} \u{1F511}\trotated\nin March',
  path:  String.raw`C:\keys\"work"`,
  tags:  ['\u{5D0}\u{5D1}', null, 1.5],
}

/** Registers the gets' cases over `world`. */
export const describeGets = ({ fresh, storeWith, rowsOf, twinOf }: BatteryWorld): void => {
  describe("listVaults", () => {
    it("answers gotvoid over a bank with no vaults, its world the scope", async () => {
      const vaultDB = await fresh()
      const answer = await vaultDB.listVaults(bankScope)
      expect(answer).to.deep.include({ ok: true, act: 'gotvoid', world: bankScope })
      expect(answer.val).to.deep.equal({ vaults: [], damaged_rows: [] })
    })

    it("lists vaults full or tombstone, and sets aside a row failing validation as its scope alone", async () => {
      const { vaultDB, vault } = await storeWith()
      await rowsOf(vaultDB).plantVaultRow(vaultScopeOf('broken'), { revision_tok: 'r9', revision_seq: 9, am: 'a', vault_tok: 'life9', garbage: true })
      await rowsOf(vaultDB).plantVaultRow(vaultScopeOf('newer'), { fmt: SX.VaultFormat + 1, revision_seq: 9 })
      const { act, val } = await vaultDB.listVaults(bankScope)
      expect(act).to.eq('got')
      expect(val.vaults).to.deep.equal([vault])
      expect(val.damaged_rows).to.have.deep.members([
        { ...vaultScopeOf('broken'), am: 'd' },
        { ...vaultScopeOf('newer'),  am: 'd' },
      ])
    })

    it("lists a row under a label failing its check among the damaged, and the rest as ever", async () => {
      const { vaultDB, vault } = await storeWith()
      await rowsOf(vaultDB).plantVaultRow(vaultScopeOf('Not A Label'), { garbage: true })
      const { val } = await vaultDB.listVaults(bankScope)
      expect(val.vaults).to.deep.equal([vault])
      expect(val.damaged_rows.map(({ vaultlabel, am }) => ({ vaultlabel, am }))).to.deep.equal([{ vaultlabel: 'Not A Label', am: 'd' }])
    })
  })

  describe("getVault", () => {
    it("answers the record alone, and the record as world", async () => {
      const { vaultDB, vault } = await storeWith({ box: true })
      expect(await vaultDB.getVault(vaultScope)).to.deep.include({ ok: true, act: 'got', val: vault, world: vault })
    })

    it("over a void row, refuses with no row, and answers null with ifAbsent nil", async () => {
      const vaultDB = await fresh()
      const answer = await vaultDB.tryGetVault(vaultScope)
      expect(answer).to.deep.include({ ok: false, dbhas: null })
      expect(answer.world).to.deep.equal(SX.sentinelVaultOf(vaultScope))
      const nil = await vaultDB.getVault(vaultScope, { ifAbsent: 'nil' })
      expect(nil).to.deep.include({ act: 'gotvoid', val: null, dbhas: null })
    })

    it("over a tombstone, refuses holding it, and answers null with ifAbsent nil", async () => {
      const { vaultDB, vault } = await storeWith()
      const tombstone = vaultTombstoneOf(vault)
      await vaultDB.delVault(tombstone, { prior: priorOf(vault) })
      const answer = await vaultDB.tryGetVault(vaultScope)
      expect(answer).to.deep.include({ ok: false, dbhas: tombstone, world: tombstone })
      expect(await vaultDB.getVault(vaultScope, { ifAbsent: 'nil' })).to.deep.include({ act: 'gotgone', val: null, dbhas: tombstone, world: tombstone })
    })

    it("refuses a row failing validation or of a later fmt, naming the field, with no world and the request's safe metadata", async () => {
      const { vaultDB } = await storeWith()
      await rowsOf(vaultDB).plantVaultRow(vaultScope, { garbage: true })
      expect(await vaultDB.tryGetVault(vaultScope)).to.deep.include({ ok: false, act: 'damaged_row', world: null, req_params: vaultScope })
      await rowsOf(vaultDB).plantVaultRow(vaultScope, { ...vaultAt(), fmt: SX.VaultFormat + 1 })
      const newer = await vaultDB.tryGetVault(vaultScope)
      expect(newer).to.deep.include({ ok: false, act: 'damaged_row', world: null })
      expect(newer.err?.meta?.fieldnames).to.deep.equal(['fmt'])
    })
  })

  describe("listBoxes", () => {
    it("answers the sparse boxes, tombstones included, the rows it set aside, and the vault row as world", async () => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      const other = boxAt(0, 'life1', { boxlabel: 'other' })
      await vaultDB.putBox(other, { prior: SX.VoidRevision })
      await vaultDB.delBox(boxTombstoneOf(other), { prior: priorOf(other) })
      await rowsOf(vaultDB).plantBoxRow(boxscopeOf('rubble'), 'life1', { garbage: true })
      const { act, val, world } = await vaultDB.listBoxes(vaultQuery)
      expect(act).to.eq('got')
      expect(world).to.deep.equal(vault)
      expect(val.boxes).to.have.deep.members([SX.boxSparse.parse(box), SX.boxSparse.parse(boxTombstoneOf(other))])
      expect(val.damaged_rows).to.deep.equal([{ ...boxscopeOf('rubble'), vault_tok: 'life1', am: 'd' }])
    })

    it("holds a box row of a later fmt, set aside, to its scope alone", async () => {
      const { vaultDB } = await storeWith()
      await rowsOf(vaultDB).plantBoxRow(boxscopeOf('newer'), 'life1', { fmt: SX.BoxFormat + 1, revision_seq: 9 })
      const { val } = await vaultDB.listBoxes(vaultQuery)
      expect(val.damaged_rows).to.deep.equal([{ ...boxscopeOf('newer'), vault_tok: 'life1', am: 'd' }])
    })

    it("lists a box under a label failing its check among the damaged", async () => {
      const { vaultDB } = await storeWith({ box: true })
      await rowsOf(vaultDB).plantBoxRow(boxscopeOf('Not A Label'), 'life1', { garbage: true })
      const { val } = await vaultDB.listBoxes(vaultQuery)
      expect(val.boxes.map(({ boxlabel }) => boxlabel)).to.deep.equal(['openai'])
      expect(val.damaged_rows.map(({ boxlabel, am }) => ({ boxlabel, am }))).to.deep.equal([{ boxlabel: 'Not A Label', am: 'd' }])
    })

    it("refuses under a stale vault_tok", async () => {
      const { vaultDB, vault } = await storeWith({ box: true })
      expect(await vaultDB.tryListBoxes({ ...vaultScope, vault_tok: 'oldlife' })).to.deep.include({ ok: false, world: null, dbhas: vault })
    })

    it("lists each of many boxes", async () => {
      const { vaultDB } = await storeWith()
      const boxlabels = Array.from({ length: 25 }, (_unused, ii) => `box${String(ii)}`)
      await Promise.all(boxlabels.map(async (boxlabel) => await vaultDB.putBox(boxAt(0, 'life1', { boxlabel }), { prior: SX.VoidRevision })))
      const { val } = await vaultDB.listBoxes(vaultQuery)
      expect(val.boxes.map(({ boxlabel }) => boxlabel)).to.have.members(boxlabels)
    })
  })

  describe("getBox", () => {
    it("answers the record, and the vault row as world", async () => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      expect(await vaultDB.getBox(boxQuery)).to.deep.include({ ok: true, act: 'got', val: box, world: vault })
    })

    it("over a void box row, refuses as void, and answers null with ifAbsent nil", async () => {
      const { vaultDB, vault } = await storeWith()
      const answer = await vaultDB.tryGetBox(boxQuery)
      expect(answer).to.deep.include({ ok: false, act: 'void', dbhas: null, world: vault })
      expect(answer.err?.refusalkind).to.eq('absent_box')
      expect(await vaultDB.getBox(boxQuery, { ifAbsent: 'nil' })).to.deep.include({ act: 'gotvoid', val: null, dbhas: null, world: vault })
    })

    it("over a tombstoned box row, refuses as gone, and answers null with ifAbsent nil", async () => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      const tombstone = boxTombstoneOf(box)
      await vaultDB.delBox(tombstone, { prior: priorOf(box) })
      const answer = await vaultDB.tryGetBox(boxQuery)
      expect(answer).to.deep.include({ ok: false, act: 'gone', dbhas: tombstone, world: vault })
      expect(await vaultDB.getBox(boxQuery, { ifAbsent: 'nil' })).to.deep.include({ act: 'gotgone', val: null, dbhas: tombstone })
    })

    it("refuses under a live row of another vault_tok, whatever ifAbsent says", async () => {
      const { vaultDB, vault } = await storeWith({ box: true })
      const answer = await vaultDB.tryGetBox({ ...boxscope, vault_tok: 'oldlife' }, { ifAbsent: 'nil' })
      expect(answer).to.deep.include({ ok: false, world: null, dbhas: vault })
    })

    it("refuses a vault_tok no row holds, over no row or another life's tombstone", async () => {
      const vaultDB = await fresh()
      const asked = { ...boxscope, vault_tok: 'oldlife' }
      const sentinel = SX.sentinelVaultOf(vaultScope, 'oldlife')
      expect(await vaultDB.tryGetBox(asked)).to.deep.include({ ok: false, world: sentinel, dbhas: null })
      const vault = vaultAt()
      await vaultDB.putVault(vault, { prior: SX.VoidRevision })
      await vaultDB.delVault(vaultTombstoneOf(vault), { prior: priorOf(vault) })
      expect(await vaultDB.tryGetBox(asked)).to.deep.include({ ok: false, world: sentinel, dbhas: null })
    })

    it("refuses a box row failing validation, and any box under this life's tombstone", async () => {
      const { vaultDB, vault } = await storeWith({ box: true })
      await rowsOf(vaultDB).plantBoxRow(boxscope, 'life1', { garbage: true })
      expect(await vaultDB.tryGetBox(boxQuery)).to.deep.include({ ok: false, act: 'damaged_row' })
      await vaultDB.delVault(vaultTombstoneOf(vault), { prior: priorOf(vault) })
      expect(await vaultDB.tryGetBox(boxQuery)).to.deep.include({ ok: false })
    })
  })

  describe("what a store keeps", () => {
    it("hands back a sidecar as the JSON value written, every string in it byte for byte", async () => {
      const { vaultDB } = await storeWith()
      const box = boxAt(0, 'life1', { sidecar: LiteralSidecar })
      await vaultDB.putBox(box, { prior: SX.VoidRevision })
      expect(await vaultDB.getBox(boxQuery)).to.deep.include({ val: box })
    })

    it("keeps each bank to itself, however near its user_id to another's", async () => {
      const vaultDB = await fresh()
      const vaults = NearUserIds.map((user_id, ii) => vaultAt(0, `life${String(ii)}`, { user_id }))
      await Promise.all(vaults.map(async (vault) => await vaultDB.putVault(vault, { prior: SX.VoidRevision })))
      for (const vault of vaults) {
        const { val } = await vaultDB.listVaults({ applabel: vault.applabel, user_id: vault.user_id })
        expect(val.vaults).to.deep.equal([vault])
      }
    })

    it("keeps each vault's boxes to it, under a near vaultlabel or another applabel", async () => {
      const { vaultDB, box } = await storeWith({ box: true })
      const neighbours = [vaultAt(0, 'life2', { vaultlabel: 'main_2' }), vaultAt(0, 'life1', { applabel: 'acme_2' })]
      await Promise.all(neighbours.map(async (vault) => await vaultDB.putVault(vault, { prior: SX.VoidRevision })))
      for (const { applabel, vaultlabel, vault_tok } of neighbours) {
        const { val } = await vaultDB.listBoxes({ ...vaultScope, applabel, vaultlabel, vault_tok })
        expect(val.boxes).to.deep.equal([])
      }
      const { val } = await vaultDB.listBoxes(vaultQuery)
      expect(val.boxes).to.deep.equal([SX.boxSparse.parse(box)])
    })

    it("hands another device what one wrote", async () => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      const twin = await twinOf(vaultDB)
      expect(await twin.getVault(vaultScope)).to.deep.include({ val: vault })
      expect(await twin.getBox(boxQuery)).to.deep.include({ val: box })
    })
  })
}
