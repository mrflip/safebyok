/** The battery's dels and tidyGone: a box, a vault or a bank deleted with what it holds, and the rows of an ended life tidied away. */

import { describe, expect, it } from 'vitest'
import * as BX from '../../src/shapes/shapes-bankdb'
import * as SX from '../../src/shapes/shapes-storage'
import type { BankDB } from '../../src/storage/bank-db'
import {
  bankScope, gateScope, vaultScope, boxscope, boxQuery, boxListAsk, boxTidyAsk, bankEnsureAsk, vaultScopeOf,
  bankAt, gateAt, vaultAt, boxAt, bankTombstoneOf, vaultTombstoneOf, boxTombstoneOf,
  bankBuildAskOf, bankDelAskOf, boxGetAskOf, vaultGetAskOf, vaultPutAskOf, boxPutAskOf, vaultDelAskOf, boxDelAskOf,
} from './bankdb-world'
import type { BatteryWorld } from './bank-db-battery'

/** A revision_tok no other record here has: what another device's write at the same seq would bring. */
const Rival = { revision_tok: 'rival' }

const noBoxYet = BX.shellBoxOf(boxQuery)

/** Registers the dels' and tidyGone's cases over `world`. */
export function describeDels({ fresh, putWith, rowsOf }: BatteryWorld): void {
  /** The box row `openai` of the vault's life `bank1/life1`, as stored. */
  async function storedBoxOf(bankDB: BankDB): Promise<unknown> {
    const boxrows = await rowsOf(bankDB).boxRowsOf(vaultScope, 'bank1', 'life1')
    return boxrows.get('openai')
  }

  describe("delBox", () => {
    it("stores the tombstone over a live row at its revision", async () => {
      const { bankDB, vault, box } = await putWith({ box: true })
      const tombstone = boxTombstoneOf(box)
      expect(await bankDB.delBox(boxDelAskOf(box))).to.deep.include({ ok: true, act: 'deleted', val: tombstone, parent: vault })
      expect(await bankDB.getBox(boxGetAskOf(boxQuery, 'nil'))).to.deep.include({ act: 'gotgone', val: tombstone })
      expect(await storedBoxOf(bankDB)).to.deep.equal(tombstone)
    })

    it("refuses over a void row, whether it expects none or one", async () => {
      const { bankDB, vault, box } = await putWith()
      expect(await bankDB.tryDelBox(boxDelAskOf(noBoxYet))).to.deep.include({ ok: false, act: 'void', dbhas: null, parent: vault })
      expect(await bankDB.tryDelBox(boxDelAskOf(box))).to.deep.include({ ok: false, act: 'ahead', dbhas: null, parent: vault })
      expect(await rowsOf(bankDB).boxRowsOf(vaultScope, 'bank1', 'life1')).to.have.property('size', 0)
    })

    it("refuses over a tombstone, at its revision or an earlier one, and moves no revision", async () => {
      const { bankDB, vault, box } = await putWith({ box: true })
      const tombstone = boxTombstoneOf(box)
      await bankDB.delBox(boxDelAskOf(box))
      const refusals = [
        ['dubdel', boxDelAskOf(tombstone)],
        ['gone',   boxDelAskOf(box, { ...tombstone, ...Rival })],
        ['gone',   boxDelAskOf(noBoxYet)],
      ] as const
      for (const [act, ask] of refusals) {
        expect(await bankDB.tryDelBox(ask)).to.deep.include({ ok: false, act, dbhas: tombstone, parent: vault })
      }
      expect(await storedBoxOf(bankDB)).to.deep.equal(tombstone)
    })

    it("refuses 'stale_write' where the row stored has the revision_tok its tombstone brings", async () => {
      const { bankDB, vault, box } = await putWith({ box: true })
      const tombstone = boxTombstoneOf(box)
      await bankDB.delBox(boxDelAskOf(box))
      const answer = await bankDB.tryDelBox(boxDelAskOf(box))
      expect(answer).to.deep.include({ ok: false, act: 'retcon', dbhas: tombstone, parent: vault })
      expect(answer.err?.refusalkind).to.eq('stale_write')
    })

    it("refuses 'stale_write' over a live row moved past the one expected, with the row", async () => {
      const { bankDB, vault, box } = await putWith({ box: true })
      const next = boxAt(1)
      await bankDB.putBox(boxPutAskOf(next, box))
      const answer = await bankDB.tryDelBox(boxDelAskOf(box))
      expect(answer).to.deep.include({ ok: false, act: 'stale', dbhas: next, parent: vault })
      expect(answer.err?.refusalkind).to.eq('stale_write')
      expect(await storedBoxOf(bankDB)).to.deep.equal(next)
    })

    it("refuses under a vault's tombstone, and under a life pair that is not the live vault's", async () => {
      const { bankDB, vault, box } = await putWith({ box: true })
      for (const ended of [boxAt(0, 'bank1', 'oldlife'), boxAt(0, 'bank0', 'life1')]) {
        expect(await bankDB.tryDelBox(boxDelAskOf(ended))).to.deep.include({ ok: false, act: 'vault_reborn', parent: vault, dbhas: null })
      }
      expect(await storedBoxOf(bankDB)).to.deep.equal(box)
      await bankDB.delVault(vaultDelAskOf(vault))
      expect(await bankDB.tryDelBox(boxDelAskOf(box))).to.deep.include({ ok: false, act: 'vault_gone', parent: vaultTombstoneOf(vault), dbhas: null })
    })
  })

  describe("delVault", () => {
    it("stores the tombstone at its revision, and deletes the boxes of the life it ends", async () => {
      const { bankDB, bank, vault } = await putWith({ box: true })
      const tombstone = vaultTombstoneOf(vault)
      expect(await bankDB.delVault(vaultDelAskOf(vault))).to.deep.include({ ok: true, act: 'deleted', val: tombstone, parent: bank })
      expect(await rowsOf(bankDB).vaultRowOf(vaultScope)).to.deep.equal(tombstone)
      expect(await rowsOf(bankDB).boxRowsOf(vaultScope, 'bank1', 'life1')).to.have.property('size', 0)
    })

    it("leaves the boxes of every other vault", async () => {
      const { bankDB, vault } = await putWith({ box: true })
      const other = vaultAt(0, 'bank1', 'life1', { vaultlabel: 'other' })
      const otherBox = boxAt(0, 'bank1', 'life1', { vaultlabel: 'other' })
      await bankDB.putVault(vaultPutAskOf(other))
      await bankDB.putBox(boxPutAskOf(otherBox))
      await bankDB.delVault(vaultDelAskOf(vault))
      expect(await bankDB.getBox(boxGetAskOf({ ...boxQuery, vaultlabel: 'other' }))).to.deep.include({ act: 'gotlive', val: otherBox, parent: other })
    })

    it("a vault born again has none of the boxes of its earlier life", async () => {
      const { bankDB, vault } = await putWith({ box: true })
      const tombstone = vaultTombstoneOf(vault)
      await bankDB.delVault(vaultDelAskOf(vault))
      const reborn = vaultAt(2, 'bank1', 'life2')
      await bankDB.putVault(vaultPutAskOf(reborn, tombstone))
      expect(await bankDB.listBoxes({ ...boxListAsk, vault_tok: 'life2' })).to.deep.include({ act: 'gotvoid', parent: reborn })
      expect(await bankDB.tryGetBox(boxGetAskOf(boxQuery, 'nil'))).to.deep.include({ ok: false, act: 'vault_reborn', parent: reborn })
    })

    it("a vault born again has none of the boxes an earlier life left, if its store could not delete them with the vault", async () => {
      const { bankDB, vault, box } = await putWith({ box: true })
      const tombstone = vaultTombstoneOf(vault)
      await bankDB.delVault(vaultDelAskOf(vault))
      await rowsOf(bankDB).plantBoxRow(boxscope, 'bank1', 'life1', box)
      const reborn = vaultAt(2, 'bank1', 'life2')
      await bankDB.putVault(vaultPutAskOf(reborn, tombstone))
      const asked = { ...boxQuery, vault_tok: 'life2' }
      expect(await bankDB.listBoxes({ ...boxListAsk, vault_tok: 'life2' })).to.deep.include({ act: 'gotvoid', parent: reborn })
      expect(await bankDB.getBox(boxGetAskOf(asked, 'nil'))).to.deep.include({ ok: true, act: 'gotvoid', val: null, parent: reborn })
      const newBox = boxAt(0, 'bank1', 'life2')
      expect(await bankDB.putBox(boxPutAskOf(newBox))).to.deep.include({ ok: true, act: 'born', val: newBox, parent: reborn })
    })

    it("refuses 'stale_write' over a live row moved past the one expected, with the row and deleting no box", async () => {
      const { bankDB, bank, vault, box } = await putWith({ box: true })
      const next = vaultAt(1)
      await bankDB.putVault(vaultPutAskOf(next, vault))
      const answer = await bankDB.tryDelVault(vaultDelAskOf(vault))
      expect(answer).to.deep.include({ ok: false, act: 'stale', dbhas: next, parent: bank })
      expect(answer.err?.refusalkind).to.eq('stale_write')
      expect(await bankDB.getBox(boxGetAskOf())).to.deep.include({ val: box })
    })

    it("refuses over a tombstone, at its revision or an earlier one, and moves no revision", async () => {
      const { bankDB, bank, vault } = await putWith()
      const tombstone = vaultTombstoneOf(vault)
      await bankDB.delVault(vaultDelAskOf(vault))
      const refusals = [
        ['dubdel', vaultDelAskOf(tombstone)],
        ['gone',   vaultDelAskOf(vault, { ...tombstone, ...Rival })],
        ['retcon', vaultDelAskOf(vault)],
      ] as const
      for (const [act, ask] of refusals) {
        expect(await bankDB.tryDelVault(ask)).to.deep.include({ ok: false, act, dbhas: tombstone, parent: bank })
      }
      const answer = await bankDB.tryDelVault(vaultDelAskOf(vault))
      expect(answer.err?.refusalkind).to.eq('stale_write')
      expect(await rowsOf(bankDB).vaultRowOf(vaultScope)).to.deep.equal(tombstone)
    })

    it("refuses over a void row", async () => {
      const { bankDB, bank } = await putWith()
      const shell = { ...BX.shellVaultOf(vaultScopeOf('never')), bank_tok: 'bank1' }
      expect(await bankDB.tryDelVault(vaultDelAskOf(shell))).to.deep.include({ ok: false, act: 'void', dbhas: null, parent: bank })
      expect(await rowsOf(bankDB).vaultRowOf(vaultScopeOf('never'))).to.be.null
    })

    it("refuses a del where the row expected has the stored revision_tok under another vault_tok, deleting no box", async () => {
      const { bankDB, bank, vault, box } = await putWith({ box: true })
      const ask = vaultDelAskOf(vaultAt(0, 'bank1', 'oldlife'))
      expect(await bankDB.tryDelVault(ask)).to.deep.include({ ok: false, act: 'clash', dbhas: vault, parent: bank })
      expect(await rowsOf(bankDB).vaultRowOf(vaultScope)).to.deep.equal(vault)
      expect(await storedBoxOf(bankDB)).to.deep.equal(box)
    })
  })

  describe("delBank", () => {
    it("stores the tombstone at its revision, and deletes the gate, the vaults and the boxes of the life it ends", async () => {
      const { bankDB, bank } = await putWith({ box: true })
      const tombstone = bankTombstoneOf(bank)
      expect(await bankDB.delBank(bankDelAskOf(bank))).to.deep.include({ ok: true, act: 'deleted', val: tombstone, parent: BX.BankTop })
      expect(await rowsOf(bankDB).bankRowOf(bankScope)).to.deep.equal(tombstone)
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.be.null
      expect(await rowsOf(bankDB).vaultRowOf(vaultScope)).to.be.null
      expect(await rowsOf(bankDB).boxRowsOf(vaultScope, 'bank1', 'life1')).to.have.property('size', 0)
      expect(await bankDB.ensureBank(bankEnsureAsk)).to.deep.include({ act: 'gotgone', val: null, parent: tombstone })
    })

    it("deletes every vault of the life it ends, with the boxes of each, tombstones among them", async () => {
      const { bankDB, bank } = await putWith({ box: true })
      const other = vaultAt(0, 'bank1', 'life2', { vaultlabel: 'other' })
      const otherBox = boxAt(0, 'bank1', 'life2', { vaultlabel: 'other' })
      const deleted = vaultAt(0, 'bank1', 'life3', { vaultlabel: 'deleted' })
      await bankDB.putVault(vaultPutAskOf(other))
      await bankDB.putBox(boxPutAskOf(otherBox))
      await bankDB.putVault(vaultPutAskOf(deleted))
      await bankDB.delVault(vaultDelAskOf(deleted))
      await bankDB.delBank(bankDelAskOf(bank))
      for (const vaultlabel of ['main', 'other', 'deleted']) {
        expect(await rowsOf(bankDB).vaultRowOf(vaultScopeOf(vaultlabel))).to.be.null
      }
      expect(await rowsOf(bankDB).boxRowsOf(vaultScope, 'bank1', 'life1')).to.have.property('size', 0)
      expect(await rowsOf(bankDB).boxRowsOf(vaultScopeOf('other'), 'bank1', 'life2')).to.have.property('size', 0)
    })

    it("leaves every other bank", async () => {
      const { bankDB } = await putWith({ box: true })
      const elsewhere = { banklabel: 'other' }
      const other = { ...bankAt(), ...elsewhere }
      const otherGate = { ...gateAt(), ...elsewhere }
      const otherVault = vaultAt(0, 'bank1', 'life1', elsewhere)
      const otherBox = boxAt(0, 'bank1', 'life1', elsewhere)
      await bankDB.buildBank(bankBuildAskOf(other, otherGate))
      await bankDB.putVault(vaultPutAskOf(otherVault))
      await bankDB.putBox(boxPutAskOf(otherBox))
      await bankDB.delBank(bankDelAskOf(bankAt()))
      const elsewhereBank = await bankDB.ensureBank({ ...bankEnsureAsk, ...elsewhere })
      expect(elsewhereBank.val?.gates).to.deep.equal({ main: otherGate })
      expect(await bankDB.getVault(vaultGetAskOf('bank1', 'fail', { ...vaultScope, ...elsewhere }))).to.deep.include({ val: otherVault, parent: other })
      expect(await bankDB.getBox(boxGetAskOf({ ...boxQuery, ...elsewhere }))).to.deep.include({ val: otherBox, parent: otherVault })
    })

    it("refuses over no bank row, and over its tombstone, at its revision or with its own tombstone", async () => {
      const bankDB = await fresh()
      const ask = bankDelAskOf(BX.shellBankOf(bankScope))
      expect(await bankDB.tryDelBank(ask)).to.deep.include({ ok: false, act: 'void', dbhas: null, parent: BX.BankTop })

      const { bankDB: deleted, bank } = await putWith()
      const tombstone = bankTombstoneOf(bank)
      await deleted.delBank(bankDelAskOf(bank))
      expect(await deleted.tryDelBank(bankDelAskOf(tombstone))).to.deep.include({ ok: false, act: 'dubdel', dbhas: tombstone })
      const retcon = await deleted.tryDelBank(bankDelAskOf(bank))
      expect(retcon).to.deep.include({ ok: false, act: 'retcon', dbhas: tombstone })
      expect(retcon.err?.refusalkind).to.eq('stale_write')
      expect(await rowsOf(deleted).bankRowOf(bankScope)).to.deep.equal(tombstone)
    })

    it("refuses a del that expects a later revision or another at its seq, or whose tombstone's bank_tok is not new, deleting nothing", async () => {
      const { bankDB, bank, gate, vault, box } = await putWith({ box: true })
      const tombstone = bankTombstoneOf(bank)
      const asks = [
        [{ ok: false, act: 'ahead', dbhas: bank }, bankDelAskOf(bankAt(7))],
        [{ ok: false, act: 'forked', dbhas: bank }, bankDelAskOf({ ...bank, ...Rival })],
        [{ ok: false, act: 'unclassified_storing' }, bankDelAskOf(bank, { ...tombstone, bank_tok: bank.bank_tok })],
        [{ ok: false, act: 'unclassified_storing' }, bankDelAskOf(bank, { ...tombstone, bank_tok: SX.VoidLifeTok })],
      ] as const
      for (const [answered, ask] of asks) { expect(await bankDB.tryDelBank(ask)).to.deep.include(answered) }
      expect(await rowsOf(bankDB).bankRowOf(bankScope)).to.deep.equal(bank)
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.deep.equal(gate)
      expect(await rowsOf(bankDB).vaultRowOf(vaultScope)).to.deep.equal(vault)
      expect(await storedBoxOf(bankDB)).to.deep.equal(box)
    })

    it("refuses a del where the row expected has the stored revision_tok under another bank_tok, deleting nothing", async () => {
      const { bankDB, bank, gate, box } = await putWith({ box: true })
      const ask = bankDelAskOf(bankAt(0, 'bank2'))
      expect(await bankDB.tryDelBank(ask)).to.deep.include({ ok: false, act: 'clash', dbhas: bank })
      expect(await rowsOf(bankDB).bankRowOf(bankScope)).to.deep.equal(bank)
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.deep.equal(gate)
      expect(await storedBoxOf(bankDB)).to.deep.equal(box)
    })
  })

  describe("tidyGone", () => {
    it("removes the box rows of a vault life that is over, counts the box rows left in the bank, and leaves none of an ended life", async () => {
      const { bankDB, vault, box } = await putWith({ box: true })
      await rowsOf(bankDB).plantBoxRow(boxscope, 'bank1', 'oldlife', boxAt(0, 'bank1', 'oldlife'))
      expect(await bankDB.tidyGone(boxTidyAsk)).to.deep.include({ ok: true, act: 'tidied', val: { totalCount: 1, leftover: 'none' }, parent: bankScope })
      expect(await rowsOf(bankDB).boxRowsOf(vaultScope, 'bank1', 'oldlife')).to.have.property('size', 0)
      expect(await storedBoxOf(bankDB)).to.deep.equal(box)

      // A box row under the life a tombstone ended: one a store that cannot delete a life's boxes with its vault would leave.
      await bankDB.delVault(vaultDelAskOf(vault))
      await rowsOf(bankDB).plantBoxRow(boxscope, 'bank1', 'life1', box)
      expect(await bankDB.tidyGone(boxTidyAsk)).to.deep.include({ val: { totalCount: 0, leftover: 'none' } })
      expect(await rowsOf(bankDB).boxRowsOf(vaultScope, 'bank1', 'life1')).to.have.property('size', 0)
    })

    it("removes the vault rows of a bank life that is over, with their box rows, under a live bank or its tombstone", async () => {
      const { bankDB, bank, vault } = await putWith()
      const endedScope = vaultScopeOf('ended')
      await rowsOf(bankDB).plantVaultRow(endedScope, vaultAt(0, 'bank0', 'life1', { vaultlabel: 'ended' }))
      await rowsOf(bankDB).plantBoxRow({ ...endedScope, boxlabel: 'openai' }, 'bank0', 'life1', boxAt(0, 'bank0', 'life1', { vaultlabel: 'ended' }))
      expect(await bankDB.tidyGone(boxTidyAsk)).to.deep.include({ val: { totalCount: 0, leftover: 'none' } })
      expect(await rowsOf(bankDB).vaultRowOf(endedScope)).to.be.null
      expect(await rowsOf(bankDB).boxRowsOf(endedScope, 'bank0', 'life1')).to.have.property('size', 0)
      expect(await rowsOf(bankDB).vaultRowOf(vaultScope)).to.deep.equal(vault)

      // A vault row under the life a bank's tombstone ended: one a store that cannot delete a bank's vaults with it would leave.
      await bankDB.delBank(bankDelAskOf(bank))
      await rowsOf(bankDB).plantVaultRow(vaultScope, vault)
      await bankDB.tidyGone(boxTidyAsk)
      expect(await rowsOf(bankDB).vaultRowOf(vaultScope)).to.be.null
    })

    it("tidies the bank it is asked of and no other", async () => {
      const { bankDB } = await putWith()
      const elsewhere = { banklabel: 'other' }
      await bankDB.buildBank(bankBuildAskOf({ ...bankAt(), ...elsewhere }, { ...gateAt(), ...elsewhere }))
      const ended = vaultAt(0, 'bank0', 'life1', elsewhere)
      await rowsOf(bankDB).plantVaultRow({ ...vaultScope, ...elsewhere }, ended)
      await bankDB.tidyGone(boxTidyAsk)
      expect(await rowsOf(bankDB).vaultRowOf({ ...vaultScope, ...elsewhere })).to.deep.equal(ended)
    })
  })
}
