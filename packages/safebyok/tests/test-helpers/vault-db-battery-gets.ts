/** The battery's gets: listVaults, getVault, listBoxes and getBox over each row they may find, and what a VaultDB keeps whole and to itself. */

import { describe, expect, it } from 'vitest'
import * as SX from '../../src/shapes/shapes-storage'
import {
  bankScope, vaultScope, boxscope, vaultScopeOf, boxscopeOf, vaultAt, boxAt, vaultTombstoneOf, boxTombstoneOf, vaultListAsk, boxListAsk, boxQuery,
  vaultGetAskOf, boxGetAskOf, vaultPutAskOf, boxPutAskOf, vaultDelAskOf, boxDelAskOf,
} from './storage-world'
import type { BatteryWorld } from './vault-db-battery'

/** User ids a VaultDB keying its rows by a joined string could run together. */
const NearUserIds = ['u1', 'u1:', 'u1|', 'u1%', 'u1%3A', 'u1.', 'u1@', 'u1~', 'u1+']

/** A sidecar no VaultDB may change on the way back: accents composed and decomposed, an emoji, a tab, a newline, quotes, backslashes, Hebrew, a null and a fraction. */
const LiteralSidecar = {
  note:  'caf\u{E9} cafe\u{301} \u{1F511}\trotated\nin March',
  path:  String.raw`C:\keys\"work"`,
  tags:  ['\u{5D0}\u{5D1}', null, 1.5],
}

/** Registers the gets' cases over `world`. */
export function describeGets({ fresh, putWith, rowsOf, twinOf }: BatteryWorld): void {
  describe("listVaults", () => {
    it("returns act 'gotvoid' for a bank with no vaults", async () => {
      const vaultDB = await fresh()
      const answer = await vaultDB.listVaults(vaultListAsk)
      expect(answer).to.deep.include({ ok: true, act: 'gotvoid', world: bankScope })
      expect(answer.val).to.deep.equal({ vaults: [], damaged_rows: [] })
    })

    it("lists the sound vaults, a tombstone among them, and sets aside a row that fails its checks as its scope alone", async () => {
      const { vaultDB, vault } = await putWith()
      const deleted = vaultAt(0, 'life2', { vaultlabel: 'deleted' })
      await vaultDB.putVault(vaultPutAskOf(deleted))
      await vaultDB.delVault(vaultDelAskOf(deleted))
      await rowsOf(vaultDB).plantVaultRow(vaultScopeOf('newer'), { ...vaultAt(9, 'life9', { vaultlabel: 'newer' }), fmt: SX.VaultFormat + 1 })
      const { act, val } = await vaultDB.listVaults(vaultListAsk)
      expect(act).to.eq('got')
      expect(val.vaults).to.have.deep.members([vault, vaultTombstoneOf(deleted)])
      expect(val.damaged_rows).to.deep.equal([{ ...vaultScopeOf('newer'), am: 'd' }])
    })

    it("lists a row under a label failing its check among the damaged, and the rest as ever", async () => {
      const { vaultDB, vault } = await putWith()
      await rowsOf(vaultDB).plantVaultRow(vaultScopeOf('Not A Label'), { ...vault, vaultlabel: 'Not A Label' })
      const { val } = await vaultDB.listVaults(vaultListAsk)
      expect(val.vaults).to.deep.equal([vault])
      expect(val.damaged_rows.map(({ vaultlabel, am }) => ({ vaultlabel, am }))).to.deep.equal([{ vaultlabel: 'Not A Label', am: 'd' }])
    })
  })

  describe("getVault", () => {
    it("returns the record as both val and world", async () => {
      const { vaultDB, vault } = await putWith({ box: true })
      expect(await vaultDB.getVault(vaultGetAskOf())).to.deep.include({ ok: true, act: 'gotlive', val: vault, world: vault })
    })

    it("returns a vault row of any vault_tok", async () => {
      const { vaultDB } = await putWith()
      const otherLife = vaultAt(3, 'life2')
      await rowsOf(vaultDB).plantVaultRow(vaultScope, otherLife)
      expect(await vaultDB.getVault(vaultGetAskOf())).to.deep.include({ ok: true, act: 'gotlive', val: otherLife })
    })

    it("returns what is stored, whatever row its caller holds", async () => {
      const { vaultDB, vault } = await putWith()
      for (const expected of [vault, vaultAt(7, 'life2'), vaultTombstoneOf(vault)]) {
        expect(await vaultDB.getVault({ ...vaultGetAskOf(), expected })).to.deep.include({ act: 'gotlive', val: vault, world: vault })
      }
    })

    it("over a void row, refuses, or returns null under ifAbsent 'nil'", async () => {
      const vaultDB = await fresh()
      const shell = SX.shellVaultOf(vaultScope)
      const answer = await vaultDB.tryGetVault(vaultGetAskOf())
      expect(answer).to.deep.include({ ok: false, act: 'void', dbhas: null, world: shell })
      expect(answer.err?.refusalkind).to.eq('absent_vault')
      expect(await vaultDB.getVault(vaultGetAskOf(vaultScope, 'nil'))).to.deep.include({ act: 'gotvoid', val: null, world: shell })
    })

    it("over a tombstone, refuses, or returns the tombstone under ifAbsent 'nil'", async () => {
      const { vaultDB, vault } = await putWith()
      const tombstone = vaultTombstoneOf(vault)
      await vaultDB.delVault(vaultDelAskOf(vault))
      const answer = await vaultDB.tryGetVault(vaultGetAskOf())
      expect(answer).to.deep.include({ ok: false, act: 'gone', dbhas: tombstone, world: tombstone })
      expect(answer.err?.refusalkind).to.eq('absent_vault')
      expect(await vaultDB.getVault(vaultGetAskOf(vaultScope, 'nil'))).to.deep.include({ act: 'gotgone', val: tombstone, world: tombstone })
    })

    it("refuses a row of a later fmt, naming the field", async () => {
      const { vaultDB, vault } = await putWith()
      await rowsOf(vaultDB).plantVaultRow(vaultScope, { ...vault, fmt: SX.VaultFormat + 1 })
      const answer = await vaultDB.tryGetVault(vaultGetAskOf(vaultScope, 'nil'))
      expect(answer).to.deep.include({ ok: false, act: 'damaged_row', world: null })
      expect(answer.ask).to.deep.include(vaultScope)
      expect(answer.err?.meta?.fieldnames).to.deep.equal(['fmt'])
    })
  })

  describe("listBoxes", () => {
    it("returns the sparse boxes, tombstones included, the rows it set aside, and the vault row as world", async () => {
      const { vaultDB, vault, box } = await putWith({ box: true })
      const other = boxAt(0, 'life1', { boxlabel: 'other' })
      await vaultDB.putBox(boxPutAskOf(other))
      await vaultDB.delBox(boxDelAskOf(other))
      await rowsOf(vaultDB).plantBoxRow(boxscopeOf('newer'), 'life1', { ...boxAt(9, 'life1', { boxlabel: 'newer' }), fmt: SX.BoxFormat + 1 })
      const { act, val, world } = await vaultDB.listBoxes(boxListAsk)
      expect(act).to.eq('got')
      expect(world).to.deep.equal(vault)
      expect(val.boxes).to.have.deep.members([SX.boxSparse.parse(box), SX.boxSparse.parse(boxTombstoneOf(other))])
      expect(val.damaged_rows).to.deep.equal([{ ...boxscopeOf('newer'), vault_tok: 'life1', am: 'd' }])
    })

    it("returns act 'gotvoid' for a vault with no boxes", async () => {
      const { vaultDB, vault } = await putWith()
      const answer = await vaultDB.listBoxes(boxListAsk)
      expect(answer).to.deep.include({ ok: true, act: 'gotvoid', world: vault })
      expect(answer.val).to.deep.equal({ boxes: [], damaged_rows: [] })
    })

    it("lists a box under a label failing its check among the damaged", async () => {
      const { vaultDB, box } = await putWith({ box: true })
      await rowsOf(vaultDB).plantBoxRow(boxscopeOf('Not A Label'), 'life1', { ...box, boxlabel: 'Not A Label' })
      const { val } = await vaultDB.listBoxes(boxListAsk)
      expect(val.boxes.map(({ boxlabel }) => boxlabel)).to.deep.equal(['openai'])
      expect(val.damaged_rows.map(({ boxlabel, am }) => ({ boxlabel, am }))).to.deep.equal([{ boxlabel: 'Not A Label', am: 'd' }])
    })

    it("refuses under a vault_tok that is not the live vault's, under a vault's tombstone and under no vault, with the vault row as its world", async () => {
      const { vaultDB, vault } = await putWith({ box: true })
      const reborn = await vaultDB.tryListBoxes({ op: 'list', ...vaultScope, vault_tok: 'oldlife' })
      expect(reborn).to.deep.include({ ok: false, act: 'vault_reborn', world: vault })
      expect(reborn.err?.refusalkind).to.eq('vault_reborn')
      const { val: tombstone } = await vaultDB.delVault(vaultDelAskOf(vault))
      const gone = await vaultDB.tryListBoxes(boxListAsk)
      expect(gone).to.deep.include({ ok: false, act: 'vault_gone', world: tombstone })
      expect(gone.err?.refusalkind).to.eq('absent_vault')
      const nowhere = vaultScopeOf('nowhere')
      const overVoid = await vaultDB.tryListBoxes({ op: 'list', ...nowhere, vault_tok: 'life1' })
      expect(overVoid).to.deep.include({ ok: false, act: 'vault_void', world: SX.shellVaultOf(nowhere) })
      expect(overVoid.err?.refusalkind).to.eq('absent_vault')
    })

    it("lists each of many boxes", async () => {
      const { vaultDB } = await putWith()
      const boxlabels = Array.from({ length: 25 }, (_unused, ii) => `box${String(ii)}`)
      await Promise.all(boxlabels.map(async (boxlabel) => await vaultDB.putBox(boxPutAskOf(boxAt(0, 'life1', { boxlabel })))))
      const { val } = await vaultDB.listBoxes(boxListAsk)
      expect(val.boxes.map(({ boxlabel }) => boxlabel)).to.have.members(boxlabels)
    })
  })

  describe("getBox", () => {
    it("returns the record, with the vault row as world", async () => {
      const { vaultDB, vault, box } = await putWith({ box: true })
      expect(await vaultDB.getBox(boxGetAskOf())).to.deep.include({ ok: true, act: 'gotlive', val: box, world: vault })
    })

    it("returns what is stored, whatever row its caller holds", async () => {
      const { vaultDB, vault, box } = await putWith({ box: true })
      for (const expected of [box, boxAt(7, 'life1', { box_tok: 'box9' }), boxTombstoneOf(box)]) {
        expect(await vaultDB.getBox({ ...boxGetAskOf(), expected })).to.deep.include({ act: 'gotlive', val: box, world: vault })
      }
    })

    it("over a void box row, refuses as void, or returns null under ifAbsent 'nil'", async () => {
      const { vaultDB, vault } = await putWith()
      const answer = await vaultDB.tryGetBox(boxGetAskOf())
      expect(answer).to.deep.include({ ok: false, act: 'void', dbhas: null, world: vault })
      expect(answer.err?.refusalkind).to.eq('absent_box')
      expect(await vaultDB.getBox(boxGetAskOf(boxQuery, 'nil'))).to.deep.include({ act: 'gotvoid', val: null, world: vault })
    })

    it("over a tombstoned box row, refuses as gone, or returns the tombstone under ifAbsent 'nil'", async () => {
      const { vaultDB, vault, box } = await putWith({ box: true })
      const tombstone = boxTombstoneOf(box)
      await vaultDB.delBox(boxDelAskOf(box))
      const answer = await vaultDB.tryGetBox(boxGetAskOf())
      expect(answer).to.deep.include({ ok: false, act: 'gone', dbhas: tombstone, world: vault })
      expect(answer.err?.refusalkind).to.eq('absent_box')
      expect(await vaultDB.getBox(boxGetAskOf(boxQuery, 'nil'))).to.deep.include({ act: 'gotgone', val: tombstone, world: vault })
    })

    it("refuses under a live vault of another vault_tok, whatever ifAbsent says", async () => {
      const { vaultDB, vault } = await putWith({ box: true })
      const answer = await vaultDB.tryGetBox(boxGetAskOf({ ...boxscope, vault_tok: 'oldlife' }, 'nil'))
      expect(answer).to.deep.include({ ok: false, act: 'vault_reborn', world: vault, dbhas: null })
      expect(answer.err?.refusalkind).to.eq('vault_reborn')
    })

    it("refuses over no vault row, and under a vault's tombstone, with the row it met as world", async () => {
      const vaultDB = await fresh()
      const overVoid = await vaultDB.tryGetBox(boxGetAskOf(boxQuery, 'nil'))
      expect(overVoid).to.deep.include({ ok: false, act: 'vault_void', world: SX.shellVaultOf(vaultScope), dbhas: null })
      expect(overVoid.err?.refusalkind).to.eq('absent_vault')
      const vault = vaultAt()
      await vaultDB.putVault(vaultPutAskOf(vault))
      await vaultDB.putBox(boxPutAskOf(boxAt()))
      await vaultDB.delVault(vaultDelAskOf(vault))
      const overGone = await vaultDB.tryGetBox(boxGetAskOf(boxQuery, 'nil'))
      expect(overGone).to.deep.include({ ok: false, act: 'vault_gone', world: vaultTombstoneOf(vault), dbhas: null })
      expect(overGone.err?.refusalkind).to.eq('absent_vault')
    })

    it("refuses a box row of a later fmt, naming the field", async () => {
      const { vaultDB, box } = await putWith({ box: true })
      await rowsOf(vaultDB).plantBoxRow(boxscope, 'life1', { ...box, fmt: SX.BoxFormat + 1 })
      const answer = await vaultDB.tryGetBox(boxGetAskOf(boxQuery, 'nil'))
      expect(answer).to.deep.include({ ok: false, act: 'damaged_row' })
      expect(answer.err?.meta?.fieldnames).to.deep.equal(['fmt'])
    })

    it("refuses under a vault row failing its checks, whatever the box row", async () => {
      const { vaultDB, vault } = await putWith({ box: true })
      await rowsOf(vaultDB).plantVaultRow(vaultScope, { ...vault, fmt: SX.VaultFormat + 1 })
      for (const boxlabel of ['openai', 'never_put']) {
        const answer = await vaultDB.tryGetBox(boxGetAskOf({ ...boxQuery, boxlabel }, 'nil'))
        expect(answer).to.deep.include({ ok: false, act: 'damaged_vault' })
        expect(answer.err?.meta?.fieldnames).to.deep.equal(['fmt'])
      }
    })
  })

  describe("what a VaultDB keeps", () => {
    it("hands back a sidecar as the JSON value written, every string in it byte for byte", async () => {
      const { vaultDB } = await putWith()
      const box = boxAt(0, 'life1', { sidecar: LiteralSidecar })
      await vaultDB.putBox(boxPutAskOf(box))
      expect(await vaultDB.getBox(boxGetAskOf())).to.deep.include({ val: box })
    })

    it("keeps each bank to itself, however near its user_id to another's", async () => {
      const vaultDB = await fresh()
      const vaults = NearUserIds.map((user_id, ii) => vaultAt(0, `life${String(ii)}`, { user_id }))
      await Promise.all(vaults.map(async (vault) => await vaultDB.putVault(vaultPutAskOf(vault))))
      for (const vault of vaults) {
        const { val } = await vaultDB.listVaults({ op: 'list', applabel: vault.applabel, user_id: vault.user_id })
        expect(val.vaults).to.deep.equal([vault])
      }
    })

    it("keeps each vault's boxes to it, under a near vaultlabel or another applabel", async () => {
      const { vaultDB, box } = await putWith({ box: true })
      const neighbours = [vaultAt(0, 'life2', { vaultlabel: 'main_2' }), vaultAt(0, 'life1', { applabel: 'acme_2' })]
      await Promise.all(neighbours.map(async (vault) => await vaultDB.putVault(vaultPutAskOf(vault))))
      for (const { applabel, vaultlabel, vault_tok } of neighbours) {
        const { val } = await vaultDB.listBoxes({ op: 'list', ...vaultScope, applabel, vaultlabel, vault_tok })
        expect(val.boxes).to.deep.equal([])
      }
      const { val } = await vaultDB.listBoxes(boxListAsk)
      expect(val.boxes).to.deep.equal([SX.boxSparse.parse(box)])
    })

    it("hands another device what one wrote", async () => {
      const { vaultDB, vault, box } = await putWith({ box: true })
      const twin = await twinOf(vaultDB)
      expect(await twin.getVault(vaultGetAskOf())).to.deep.include({ val: vault })
      expect(await twin.getBox(boxGetAskOf())).to.deep.include({ val: box })
    })
  })
}
