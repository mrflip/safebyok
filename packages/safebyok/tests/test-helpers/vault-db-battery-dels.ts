/** The battery's dels and tidyGone: a box or a vault deleted, a row past reading refused, and the box rows of an ended life tidied away. */

import { describe, expect, it } from 'vitest'
import * as SX from '../../src/shapes/shapes-storage'
import {
  bankScope, vaultScope, boxscope, vaultScopeOf, vaultAt, boxAt, boxFlaws, vaultFlaws, LaterFmtFlaw, vaultTombstoneOf, boxTombstoneOf, boxQuery,
  boxGetAskOf, vaultPutAskOf, boxPutAskOf, vaultDelAskOf, boxDelAskOf,
} from './storage-world'
import type { VaultDB } from '../../src/storage/vault-db'
import type { BatteryWorld } from './vault-db-battery'

/** A revision_tok no other record here has: what another device's write at the same seq would bring. */
const Rival = { revision_tok: 'rival' }

const noVaultYet = SX.sentinelVaultOf(vaultScope)
const noBoxYet   = SX.sentinelBoxOf(boxscope, 'life1')

/** Flaws a vault row may have that leave its boxes' life in doubt. */
const VaultRowsInDoubt = [
  ['of a later fmt',                    { fmt: SX.VaultFormat + 1 }],
  ['that reads as a tombstone',         { am: 'x' }],
  ["that reads as another life's row",  { vault_tok: 'life2', gate: 'rubble' }],
] as const

/** Registers the dels' and tidyGone's cases over `world`. */
export const describeDels = ({ putWith, rowsOf, plantsAnyRow }: BatteryWorld): void => {
  /** The box row `openai` of the vault's life `life1`, as stored. */
  const storedBoxOf = async (vaultDB: VaultDB): Promise<unknown> => {
    const boxrows = await rowsOf(vaultDB).boxRowsOf(vaultScope, 'life1')
    return boxrows.get('openai')
  }

  /** True for a flaw this VaultDB's storage cannot be planted with. */
  const isUnplantable = (flawname: string): boolean => (! plantsAnyRow) && (flawname !== LaterFmtFlaw)

  describe("delBox", () => {
    it("stores the tombstone over a live row at its revision", async () => {
      const { vaultDB, vault, box } = await putWith({ box: true })
      const tombstone = boxTombstoneOf(box)
      expect(await vaultDB.delBox(boxDelAskOf(box))).to.deep.include({ ok: true, act: 'deleted', val: tombstone, world: vault })
      expect(await vaultDB.getBox(boxGetAskOf(boxQuery, 'nil'))).to.deep.include({ act: 'gotgone', val: tombstone })
      expect(await storedBoxOf(vaultDB)).to.deep.equal(tombstone)
    })

    it("refuses over a void row, whether it expects none or one", async () => {
      const { vaultDB, vault, box } = await putWith()
      const overVoid = await vaultDB.tryDelBox(boxDelAskOf(noBoxYet))
      expect(overVoid).to.deep.include({ ok: false, act: 'void', dbhas: null, world: vault })
      expect(overVoid.err?.refusalkind).to.eq('absent_box')
      const ahead = await vaultDB.tryDelBox(boxDelAskOf(box))
      expect(ahead).to.deep.include({ ok: false, act: 'ahead', dbhas: null, world: vault })
      expect(ahead.err?.refusalkind).to.eq('record_conflict')
      expect(await rowsOf(vaultDB).boxRowsOf(vaultScope, 'life1')).to.have.property('size', 0)
    })

    it("refuses over a tombstone, at its revision or an earlier one, and moves no revision", async () => {
      const { vaultDB, vault, box } = await putWith({ box: true })
      const tombstone = boxTombstoneOf(box)
      await vaultDB.delBox(boxDelAskOf(box))
      const refusals = [
        ['dubdel', boxDelAskOf(tombstone)],
        ['gone',   boxDelAskOf(box, { ...tombstone, ...Rival })],
        ['gone',   boxDelAskOf(noBoxYet)],
      ] as const
      for (const [act, ask] of refusals) {
        const answer = await vaultDB.tryDelBox(ask)
        expect(answer).to.deep.include({ ok: false, act, dbhas: tombstone, world: vault })
        expect(answer.err?.refusalkind).to.eq('absent_box')
      }
      expect(await storedBoxOf(vaultDB)).to.deep.equal(tombstone)
    })

    it("refuses 'stale_write' where the row stored has the revision_tok its tombstone brings", async () => {
      const { vaultDB, vault, box } = await putWith({ box: true })
      const tombstone = boxTombstoneOf(box)
      await vaultDB.delBox(boxDelAskOf(box))
      const answer = await vaultDB.tryDelBox(boxDelAskOf(box))
      expect(answer).to.deep.include({ ok: false, act: 'retcon', dbhas: tombstone, world: vault })
      expect(answer.err?.refusalkind).to.eq('stale_write')
    })

    it("refuses 'stale_write' over a live row moved past the one expected, with the row", async () => {
      const { vaultDB, vault, box } = await putWith({ box: true })
      const next = boxAt(1)
      await vaultDB.putBox(boxPutAskOf(next, box))
      const answer = await vaultDB.tryDelBox(boxDelAskOf(box))
      expect(answer).to.deep.include({ ok: false, act: 'stale', dbhas: next, world: vault })
      expect(answer.err?.refusalkind).to.eq('stale_write')
      expect(await storedBoxOf(vaultDB)).to.deep.equal(next)
    })

    it("refuses under a vault's tombstone, and under a vault_tok that is not the live vault's", async () => {
      const { vaultDB, vault, box } = await putWith({ box: true })
      const overReborn = await vaultDB.tryDelBox(boxDelAskOf(boxAt(0, 'oldlife')))
      expect(overReborn).to.deep.include({ ok: false, act: 'vault_reborn', world: vault, dbhas: null })
      expect(await storedBoxOf(vaultDB)).to.deep.equal(box)
      await vaultDB.delVault(vaultDelAskOf(vault))
      const overGone = await vaultDB.tryDelBox(boxDelAskOf(box))
      expect(overGone).to.deep.include({ ok: false, act: 'vault_gone', world: vaultTombstoneOf(vault), dbhas: null })
      expect(overGone.err?.refusalkind).to.eq('absent_vault')
    })

    it.skipIf(! plantsAnyRow)("refuses over a row that lacks the fields every row has, whatever row it expects, and leaves it stored", async () => {
      const { vaultDB, box } = await putWith({ box: true })
      await rowsOf(vaultDB).plantBoxRow(boxscope, 'life1', { garbage: true })
      expect(await vaultDB.tryDelBox(boxDelAskOf(box))).to.deep.include({ ok: false, act: 'damaged_row' })
      expect(await vaultDB.tryDelBox(boxDelAskOf(noBoxYet))).to.deep.include({ ok: false, act: 'damaged_row' })
      expect(await storedBoxOf(vaultDB)).to.deep.equal({ garbage: true })
    })

    for (const [flawname, flawOf] of boxFlaws) {
      it.skipIf(isUnplantable(flawname))(`refuses a row with ${flawname}, at its own revision or expecting none, and leaves it stored`, async () => {
        const { vaultDB, box } = await putWith({ box: true })
        const flawed = flawOf(box)
        await rowsOf(vaultDB).plantBoxRow(boxscope, 'life1', flawed)
        expect(await vaultDB.tryDelBox(boxDelAskOf(box))).to.deep.include({ ok: false, act: 'damaged_row' })
        expect(await vaultDB.tryDelBox(boxDelAskOf(noBoxYet))).to.deep.include({ ok: false, act: 'damaged_row' })
        expect(await storedBoxOf(vaultDB)).to.deep.equal(flawed)
      })
    }
  })

  describe("delVault", () => {
    it("stores the tombstone at its revision, and deletes the boxes of the life it ends", async () => {
      const { vaultDB, vault } = await putWith({ box: true })
      const tombstone = vaultTombstoneOf(vault)
      expect(await vaultDB.delVault(vaultDelAskOf(vault))).to.deep.include({ ok: true, act: 'deleted', val: tombstone, world: tombstone })
      expect(await rowsOf(vaultDB).vaultRowOf(vaultScope)).to.deep.equal(tombstone)
      expect(await rowsOf(vaultDB).boxRowsOf(vaultScope, 'life1')).to.have.property('size', 0)
    })

    it("leaves the boxes of every other vault", async () => {
      const { vaultDB, vault } = await putWith({ box: true })
      const other = vaultAt(0, 'life1', { vaultlabel: 'other' })
      const otherBox = boxAt(0, 'life1', { vaultlabel: 'other' })
      await vaultDB.putVault(vaultPutAskOf(other))
      await vaultDB.putBox(boxPutAskOf(otherBox))
      await vaultDB.delVault(vaultDelAskOf(vault))
      expect(await vaultDB.getBox(boxGetAskOf({ ...boxQuery, vaultlabel: 'other' }))).to.deep.include({ act: 'gotlive', val: otherBox, world: other })
    })

    it("a vault born again has none of the boxes of its earlier life", async () => {
      const { vaultDB, vault } = await putWith({ box: true })
      const tombstone = vaultTombstoneOf(vault)
      await vaultDB.delVault(vaultDelAskOf(vault))
      const reborn = vaultAt(2, 'life2')
      await vaultDB.putVault(vaultPutAskOf(reborn, tombstone))
      const listed = await vaultDB.listBoxes({ ...vaultScope, vault_tok: 'life2' })
      expect(listed).to.deep.include({ act: 'gotvoid', world: reborn })
      expect(await vaultDB.tryGetBox(boxGetAskOf(boxQuery, 'nil'))).to.deep.include({ ok: false, act: 'vault_reborn', world: reborn })
    })

    it("refuses 'stale_write' over a live row moved past the one expected, with the row and deleting no box", async () => {
      const { vaultDB, vault, box } = await putWith({ box: true })
      const next = vaultAt(1)
      await vaultDB.putVault(vaultPutAskOf(next, vault))
      const answer = await vaultDB.tryDelVault(vaultDelAskOf(vault))
      expect(answer).to.deep.include({ ok: false, act: 'stale', dbhas: next, world: next })
      expect(answer.err?.refusalkind).to.eq('stale_write')
      expect(await vaultDB.getBox(boxGetAskOf())).to.deep.include({ val: box })
    })

    it("refuses over a tombstone, at its revision or an earlier one, and moves no revision", async () => {
      const { vaultDB, vault } = await putWith()
      const tombstone = vaultTombstoneOf(vault)
      await vaultDB.delVault(vaultDelAskOf(vault))
      const refusals = [
        ['dubdel', 'absent_vault', vaultDelAskOf(tombstone)],
        ['gone',   'absent_vault', vaultDelAskOf(vault, { ...tombstone, ...Rival })],
        ['retcon', 'stale_write',  vaultDelAskOf(vault)],
      ] as const
      for (const [act, refusalkind, ask] of refusals) {
        const answer = await vaultDB.tryDelVault(ask)
        expect(answer).to.deep.include({ ok: false, act, dbhas: tombstone, world: tombstone })
        expect(answer.err?.refusalkind).to.eq(refusalkind)
      }
      expect(await rowsOf(vaultDB).vaultRowOf(vaultScope)).to.deep.equal(tombstone)
    })

    it("refuses over a void row", async () => {
      const { vaultDB } = await putWith()
      const sentinel = SX.sentinelVaultOf(vaultScopeOf('never'))
      const answer = await vaultDB.tryDelVault(vaultDelAskOf(sentinel))
      expect(answer).to.deep.include({ ok: false, act: 'void', dbhas: null, world: sentinel })
      expect(answer.err?.refusalkind).to.eq('absent_vault')
      expect(await rowsOf(vaultDB).vaultRowOf(vaultScopeOf('never'))).to.be.null
    })

    it("refuses a del where the row expected has the stored revision_tok under another vault_tok, deleting no box", async () => {
      const { vaultDB, vault, box } = await putWith({ box: true })
      const answer = await vaultDB.tryDelVault(vaultDelAskOf(vaultAt(0, 'oldlife')))
      expect(answer).to.deep.include({ ok: false, act: 'clash', dbhas: vault, world: vault })
      expect(answer.err?.refusalkind).to.eq('record_conflict')
      expect(await rowsOf(vaultDB).vaultRowOf(vaultScope)).to.deep.equal(vault)
      expect(await storedBoxOf(vaultDB)).to.deep.equal(box)
    })

    it.skipIf(! plantsAnyRow)("refuses a row that lacks the fields every row has, whatever row it expects, and deletes no box", async () => {
      const { vaultDB, vault, box } = await putWith({ box: true })
      for (const garbage of [{ garbage: true }, { fmt: SX.VaultFormat + 1 }]) {
        await rowsOf(vaultDB).plantVaultRow(vaultScope, garbage)
        expect(await vaultDB.tryDelVault(vaultDelAskOf(vault))).to.deep.include({ ok: false, act: 'damaged_row' })
        expect(await vaultDB.tryDelVault(vaultDelAskOf(noVaultYet))).to.deep.include({ ok: false, act: 'damaged_row' })
      }
      expect(await storedBoxOf(vaultDB)).to.deep.equal(box)
    })

    for (const [flawname, flawOf] of vaultFlaws) {
      it.skipIf(isUnplantable(flawname))(`refuses a row with ${flawname}, at its own revision or expecting none, and deletes no box`, async () => {
        const { vaultDB, vault, box } = await putWith({ box: true })
        const flawed = flawOf(vault)
        await rowsOf(vaultDB).plantVaultRow(vaultScope, flawed)
        expect(await vaultDB.tryDelVault(vaultDelAskOf(vault))).to.deep.include({ ok: false, act: 'damaged_row' })
        expect(await vaultDB.tryDelVault(vaultDelAskOf(noVaultYet))).to.deep.include({ ok: false, act: 'damaged_row' })
        expect(await rowsOf(vaultDB).vaultRowOf(vaultScope)).to.deep.equal(flawed)
        expect(await storedBoxOf(vaultDB)).to.deep.equal(box)
      })
    }
  })

  describe("tidyGone", () => {
    it("removes the box rows of a life that is over, and counts the rows left in the bank", async () => {
      const { vaultDB, vault, box } = await putWith({ box: true })
      await rowsOf(vaultDB).plantBoxRow(boxscope, 'oldlife', boxAt(0, 'oldlife'))
      expect(await vaultDB.tidyGone(bankScope)).to.deep.include({ ok: true, act: 'tidied', val: { totalCount: 1 }, world: bankScope })
      expect(await rowsOf(vaultDB).boxRowsOf(vaultScope, 'oldlife')).to.have.property('size', 0)
      expect(await storedBoxOf(vaultDB)).to.deep.equal(box)

      // A box row under the life a tombstone ended: one a store that cannot delete a life's boxes with its vault would leave.
      await vaultDB.delVault(vaultDelAskOf(vault))
      await rowsOf(vaultDB).plantBoxRow(boxscope, 'life1', box)
      expect(await vaultDB.tidyGone(bankScope)).to.deep.include({ val: { totalCount: 0 } })
      expect(await rowsOf(vaultDB).boxRowsOf(vaultScope, 'life1')).to.have.property('size', 0)
    })

    it.skipIf(! plantsAnyRow)("removes the box rows under no vault row", async () => {
      const { vaultDB, box } = await putWith({ box: true })
      await rowsOf(vaultDB).plantBoxRow({ ...boxscope, vaultlabel: 'never' }, 'lost', 'whatever')
      expect(await vaultDB.tidyGone(bankScope)).to.deep.include({ val: { totalCount: 1 } })
      expect(await rowsOf(vaultDB).boxRowsOf(vaultScopeOf('never'), 'lost')).to.have.property('size', 0)
      expect(await storedBoxOf(vaultDB)).to.deep.equal(box)
    })

    for (const [blurb, flaw] of VaultRowsInDoubt) {
      it.skipIf((! plantsAnyRow) && (! ('fmt' in flaw)))(`keeps the boxes under a vault row failing its checks ${blurb}`, async () => {
        const { vaultDB, vault, box } = await putWith({ box: true })
        await rowsOf(vaultDB).plantVaultRow(vaultScope, { ...vault, ...flaw })
        expect(await vaultDB.tidyGone(bankScope)).to.deep.include({ val: { totalCount: 1 } })
        expect(await storedBoxOf(vaultDB)).to.deep.equal(box)
      })
    }

    it.skipIf(! plantsAnyRow)("keeps the boxes under a vault row that lacks the fields every row has", async () => {
      const { vaultDB, box } = await putWith({ box: true })
      await rowsOf(vaultDB).plantVaultRow(vaultScope, { garbage: true })
      expect(await vaultDB.tidyGone(bankScope)).to.deep.include({ val: { totalCount: 1 } })
      expect(await storedBoxOf(vaultDB)).to.deep.equal(box)
    })
  })
}
