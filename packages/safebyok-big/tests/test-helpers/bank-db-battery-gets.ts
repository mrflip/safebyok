/** The battery's gets: ensureBank, getVault, listBoxes and getBox over each row they may find, and what a bankDB keeps whole and to itself. */

import { describe, expect, it } from 'vitest'
import * as BX from '../../src/shapes/shapes-bankdb'
import * as SX from '../../src/shapes/shapes-storage'
import {
  bankScope, vaultScope, boxscope, vaultScopeOf, boxscopeOf, bankAt, gateAt, vaultAt, boxAt, bankTombstoneOf, vaultTombstoneOf, boxTombstoneOf,
  bankEnsureAsk, boxListAsk, boxQuery, bankBuildAskOf, bankDelAskOf, vaultGetAskOf, boxGetAskOf, vaultPutAskOf, boxPutAskOf, vaultDelAskOf, boxDelAskOf,
} from './bankdb-world'
import type { BatteryWorld } from './bank-db-battery'

/** User ids a bankDB keying its rows by a joined string could run together. */
const NearUserIds = ['u1', 'u1:', 'u1|', 'u1%', 'u1%3A', 'u1.', 'u1@', 'u1~', 'u1+']

/** A sidecar no bankDB may change on the way back: accents composed and decomposed, an emoji, a tab, a newline, quotes, backslashes, Hebrew, a null and a fraction. */
const LiteralSidecar = {
  note:  'caf\u{E9} cafe\u{301} \u{1F511}\trotated\nin March',
  path:  String.raw`C:\keys\"work"`,
  tags:  ['\u{5D0}\u{5D1}', null, 1.5],
}

/** Registers the gets' cases over `world`. */
export function describeGets({ fresh, putWith, rowsOf, twinOf }: BatteryWorld): void {
  describe("ensureBank", () => {
    it("returns act 'gotvoid' and a null val over no bank, with the shell bank row as parent", async () => {
      const bankDB = await fresh()
      expect(await bankDB.ensureBank(bankEnsureAsk)).to.deep.include({ ok: true, act: 'gotvoid', val: null, parent: BX.shellBankOf(bankScope) })
    })

    it("returns act 'gotgone' and a null val over the bank's tombstone, with the tombstone as parent", async () => {
      const { bankDB, bank } = await putWith()
      await bankDB.delBank(bankDelAskOf(bank))
      expect(await bankDB.ensureBank(bankEnsureAsk)).to.deep.include({ ok: true, act: 'gotgone', val: null, parent: bankTombstoneOf(bank) })
    })

    it("returns the main gate and the vaults of a live bank, a tombstone among them, with the bank row as parent", async () => {
      const { bankDB, bank, gate, vault } = await putWith()
      const deleted = vaultAt(0, 'bank1', 'life2', { vaultlabel: 'deleted' })
      await bankDB.putVault(vaultPutAskOf(deleted))
      await bankDB.delVault(vaultDelAskOf(deleted))
      const answer = await bankDB.ensureBank(bankEnsureAsk)
      expect(answer).to.deep.include({ ok: true, act: 'gotlive', parent: bank })
      expect(answer.val?.gates).to.deep.equal({ main: gate })
      expect(answer.val?.vaults).to.have.deep.members([vault, vaultTombstoneOf(deleted)])
      expect(answer.val?.damaged_rows).to.deep.equal([])
    })

    it("leaves out a vault row of an ended life of the bank, and sets aside a row of a later fmt as its scope alone", async () => {
      const { bankDB, vault } = await putWith()
      await rowsOf(bankDB).plantVaultRow(vaultScopeOf('ended'), vaultAt(0, 'bank0', 'life1', { vaultlabel: 'ended' }))
      await rowsOf(bankDB).plantVaultRow(vaultScopeOf('newer'), { ...vaultAt(9, 'bank1', 'life9', { vaultlabel: 'newer' }), fmt: BX.VaultFormat + 1 })
      const { val } = await bankDB.ensureBank(bankEnsureAsk)
      expect(val?.vaults).to.deep.equal([vault])
      expect(val?.damaged_rows).to.deep.equal([SX.damagedVaultOf(vaultScopeOf('newer'))])
    })
  })

  describe("getVault", () => {
    it("returns the record as val, with the bank row as parent", async () => {
      const { bankDB, bank, vault } = await putWith({ box: true })
      expect(await bankDB.getVault(vaultGetAskOf())).to.deep.include({ ok: true, act: 'gotlive', val: vault, parent: bank })
    })

    it("returns a vault row of any vault_tok", async () => {
      const { bankDB } = await putWith()
      const otherLife = vaultAt(3, 'bank1', 'life2')
      await rowsOf(bankDB).plantVaultRow(vaultScope, otherLife)
      expect(await bankDB.getVault(vaultGetAskOf())).to.deep.include({ ok: true, act: 'gotlive', val: otherLife })
    })

    it("returns what is stored, whatever row its caller holds", async () => {
      const { bankDB, bank, vault } = await putWith()
      for (const expected of [vault, vaultAt(7, 'bank1', 'life2'), vaultTombstoneOf(vault)]) {
        expect(await bankDB.getVault({ ...vaultGetAskOf(), expected })).to.deep.include({ act: 'gotlive', val: vault, parent: bank })
      }
    })

    it("over a void row, refuses, or returns null under ifAbsent 'nil'", async () => {
      const { bankDB, bank } = await putWith()
      const nowhere = vaultScopeOf('nowhere')
      const answer = await bankDB.tryGetVault(vaultGetAskOf('bank1', 'fail', nowhere))
      expect(answer).to.deep.include({ ok: false, act: 'void', dbhas: null, parent: bank })
      expect(await bankDB.getVault(vaultGetAskOf('bank1', 'nil', nowhere))).to.deep.include({ act: 'gotvoid', val: null, parent: bank })
    })

    it("over a tombstone, refuses, or returns the tombstone under ifAbsent 'nil'", async () => {
      const { bankDB, bank, vault } = await putWith()
      const tombstone = vaultTombstoneOf(vault)
      await bankDB.delVault(vaultDelAskOf(vault))
      const answer = await bankDB.tryGetVault(vaultGetAskOf())
      expect(answer).to.deep.include({ ok: false, act: 'gone', dbhas: tombstone, parent: bank })
      expect(await bankDB.getVault(vaultGetAskOf('bank1', 'nil'))).to.deep.include({ act: 'gotgone', val: tombstone, parent: bank })
    })

    it("reads a vault row of an ended life of the bank as no row", async () => {
      const { bankDB, bank } = await putWith()
      await rowsOf(bankDB).plantVaultRow(vaultScope, vaultAt(4, 'bank0'))
      expect(await bankDB.getVault(vaultGetAskOf('bank1', 'nil'))).to.deep.include({ ok: true, act: 'gotvoid', val: null, parent: bank })
    })

    it("refuses a row of a later fmt, naming the field", async () => {
      const { bankDB, vault } = await putWith()
      await rowsOf(bankDB).plantVaultRow(vaultScope, { ...vault, fmt: BX.VaultFormat + 1 })
      const answer = await bankDB.tryGetVault(vaultGetAskOf('bank1', 'nil'))
      expect(answer).to.deep.include({ ok: false, act: 'unclassified_storing' })
      expect(answer.ask).to.deep.include(vaultScope)
      expect(answer.err?.meta?.fieldnames).to.deep.equal(['fmt'])
    })
  })

  describe("listBoxes", () => {
    it("returns the sparse boxes, tombstones included, the rows it set aside, and the vault row as parent", async () => {
      const { bankDB, vault, box } = await putWith({ box: true })
      const other = boxAt(0, 'bank1', 'life1', { boxlabel: 'other' })
      await bankDB.putBox(boxPutAskOf(other))
      await bankDB.delBox(boxDelAskOf(other))
      await rowsOf(bankDB).plantBoxRow(boxscopeOf('newer'), 'bank1', 'life1', { ...boxAt(9, 'bank1', 'life1', { boxlabel: 'newer' }), fmt: BX.BoxFormat + 1 })
      const { act, val, parent } = await bankDB.listBoxes(boxListAsk)
      expect(act).to.eq('got')
      expect(parent).to.deep.equal(vault)
      expect(val.boxes).to.have.deep.members([BX.boxSparse.parse(box), BX.boxSparse.parse(boxTombstoneOf(other))])
      expect(val.damaged_rows).to.deep.equal([BX.damagedBoxOf(boxscopeOf('newer'), boxListAsk)])
    })

    it("returns act 'gotvoid' for a vault with no boxes", async () => {
      const { bankDB, vault } = await putWith()
      const answer = await bankDB.listBoxes(boxListAsk)
      expect(answer).to.deep.include({ ok: true, act: 'gotvoid', parent: vault })
      expect(answer.val).to.deep.equal({ boxes: [], damaged_rows: [] })
    })

    it("refuses under a life pair that is not the live vault's, under a vault's tombstone and under no vault, with the vault row as its parent", async () => {
      const { bankDB, vault } = await putWith({ box: true })
      for (const life of [{ vault_tok: 'oldlife' }, { bank_tok: 'bank0' }]) {
        expect(await bankDB.tryListBoxes({ ...boxListAsk, ...life })).to.deep.include({ ok: false, act: 'vault_reborn', parent: vault })
      }
      const { val: tombstone } = await bankDB.delVault(vaultDelAskOf(vault))
      expect(await bankDB.tryListBoxes(boxListAsk)).to.deep.include({ ok: false, act: 'vault_gone', parent: tombstone })
      const nowhere = vaultScopeOf('nowhere')
      expect(await bankDB.tryListBoxes({ ...boxListAsk, ...nowhere })).to.deep.include({ ok: false, act: 'vault_void', parent: BX.shellVaultOf(nowhere) })
    })

    it("lists each of many boxes", async () => {
      const { bankDB } = await putWith()
      const boxlabels = Array.from({ length: 25 }, (_unused, ii) => `box${String(ii)}`)
      await Promise.all(boxlabels.map(async (boxlabel) => await bankDB.putBox(boxPutAskOf(boxAt(0, 'bank1', 'life1', { boxlabel })))))
      const { val } = await bankDB.listBoxes(boxListAsk)
      expect(val.boxes.map(({ boxlabel }) => boxlabel)).to.have.members(boxlabels)
    })
  })

  describe("getBox", () => {
    it("returns the record, with the vault row as parent", async () => {
      const { bankDB, vault, box } = await putWith({ box: true })
      expect(await bankDB.getBox(boxGetAskOf())).to.deep.include({ ok: true, act: 'gotlive', val: box, parent: vault })
    })

    it("returns what is stored, whatever row its caller holds", async () => {
      const { bankDB, vault, box } = await putWith({ box: true })
      for (const expected of [box, boxAt(7, 'bank1', 'life1', { box_tok: 'box9' }), boxTombstoneOf(box)]) {
        expect(await bankDB.getBox({ ...boxGetAskOf(), expected })).to.deep.include({ act: 'gotlive', val: box, parent: vault })
      }
    })

    it("over a void box row, refuses as void, or returns null under ifAbsent 'nil'", async () => {
      const { bankDB, vault } = await putWith()
      const answer = await bankDB.tryGetBox(boxGetAskOf())
      expect(answer).to.deep.include({ ok: false, act: 'void', dbhas: null, parent: vault })
      expect(await bankDB.getBox(boxGetAskOf(boxQuery, 'nil'))).to.deep.include({ act: 'gotvoid', val: null, parent: vault })
    })

    it("over a tombstoned box row, refuses as gone, or returns the tombstone under ifAbsent 'nil'", async () => {
      const { bankDB, vault, box } = await putWith({ box: true })
      const tombstone = boxTombstoneOf(box)
      await bankDB.delBox(boxDelAskOf(box))
      const answer = await bankDB.tryGetBox(boxGetAskOf())
      expect(answer).to.deep.include({ ok: false, act: 'gone', dbhas: tombstone, parent: vault })
      expect(await bankDB.getBox(boxGetAskOf(boxQuery, 'nil'))).to.deep.include({ act: 'gotgone', val: tombstone, parent: vault })
    })

    it("reads a box row under another life pair than its vault row's as no row", async () => {
      const { bankDB, vault } = await putWith()
      await rowsOf(bankDB).plantBoxRow(boxscope, 'bank1', 'life1', boxAt(0, 'bank0', 'life1'))
      expect(await bankDB.getBox(boxGetAskOf(boxQuery, 'nil'))).to.deep.include({ ok: true, act: 'gotvoid', val: null, parent: vault })
    })

    it("refuses under a live vault of another life pair, whatever ifAbsent says", async () => {
      const { bankDB, vault } = await putWith({ box: true })
      for (const life of [{ vault_tok: 'oldlife' }, { bank_tok: 'bank0' }]) {
        const answer = await bankDB.tryGetBox(boxGetAskOf({ ...boxQuery, ...life }, 'nil'))
        expect(answer).to.deep.include({ ok: false, act: 'vault_reborn', parent: vault, dbhas: null })
      }
    })

    it("refuses over no vault row, and under a vault's tombstone, with the row it met as parent", async () => {
      const { bankDB, vault } = await putWith({ box: true })
      const nowhere = { ...boxQuery, vaultlabel: 'nowhere' }
      const overVoid = await bankDB.tryGetBox(boxGetAskOf(nowhere, 'nil'))
      expect(overVoid).to.deep.include({ ok: false, act: 'vault_void', parent: BX.shellVaultOf(nowhere), dbhas: null })
      await bankDB.delVault(vaultDelAskOf(vault))
      const overGone = await bankDB.tryGetBox(boxGetAskOf(boxQuery, 'nil'))
      expect(overGone).to.deep.include({ ok: false, act: 'vault_gone', parent: vaultTombstoneOf(vault), dbhas: null })
    })

    it("refuses a box row of a later fmt, naming the field", async () => {
      const { bankDB, box } = await putWith({ box: true })
      await rowsOf(bankDB).plantBoxRow(boxscope, 'bank1', 'life1', { ...box, fmt: BX.BoxFormat + 1 })
      const answer = await bankDB.tryGetBox(boxGetAskOf(boxQuery, 'nil'))
      expect(answer).to.deep.include({ ok: false, act: 'unclassified_storing' })
      expect(answer.err?.meta?.fieldnames).to.deep.equal(['fmt'])
    })

    it("refuses under a vault row failing its checks, whatever the box row", async () => {
      const { bankDB, vault } = await putWith({ box: true })
      await rowsOf(bankDB).plantVaultRow(vaultScope, { ...vault, fmt: BX.VaultFormat + 1 })
      for (const boxlabel of ['openai', 'never_put']) {
        const answer = await bankDB.tryGetBox(boxGetAskOf({ ...boxQuery, boxlabel }, 'nil'))
        expect(answer).to.deep.include({ ok: false, act: 'unclassified_storing' })
        expect(answer.err?.meta?.fieldnames).to.deep.equal(['fmt'])
      }
    })
  })

  describe("what a bankDB keeps", () => {
    it("hands back a sidecar as the JSON value written, every string in it byte for byte", async () => {
      const { bankDB } = await putWith()
      const box = boxAt(0, 'bank1', 'life1', { sidecar: LiteralSidecar })
      await bankDB.putBox(boxPutAskOf(box))
      expect(await bankDB.getBox(boxGetAskOf())).to.deep.include({ val: box })
    })

    it("keeps each bank to itself, however near its user_id to another's", async () => {
      const bankDB = await fresh()
      const vaults = NearUserIds.map((user_id, ii) => vaultAt(0, 'bank1', `life${String(ii)}`, { user_id }))
      for (const vault of vaults) {
        await bankDB.buildBank(bankBuildAskOf({ ...bankAt(), user_id: vault.user_id }, { ...gateAt(), user_id: vault.user_id }))
        await bankDB.putVault(vaultPutAskOf(vault))
      }
      for (const vault of vaults) {
        const { val } = await bankDB.ensureBank({ ...bankEnsureAsk, user_id: vault.user_id })
        expect(val?.vaults).to.deep.equal([vault])
      }
    })

    it("keeps each vault's boxes to it, under a near vaultlabel", async () => {
      const { bankDB, box } = await putWith({ box: true })
      const neighbour = vaultAt(0, 'bank1', 'life2', { vaultlabel: 'main_2' })
      await bankDB.putVault(vaultPutAskOf(neighbour))
      const { val: none } = await bankDB.listBoxes({ ...boxListAsk, vaultlabel: 'main_2', vault_tok: 'life2' })
      expect(none.boxes).to.deep.equal([])
      const { val } = await bankDB.listBoxes(boxListAsk)
      expect(val.boxes).to.deep.equal([BX.boxSparse.parse(box)])
    })

    it("keeps each bank's rows to it, under a near banklabel", async () => {
      const { bankDB, vault, box } = await putWith({ box: true })
      const nearScope = { ...bankScope, banklabel: 'acme_2' }
      await bankDB.buildBank(bankBuildAskOf({ ...bankAt(), ...nearScope }, { ...gateAt(), ...nearScope }))
      await bankDB.putVault(vaultPutAskOf({ ...vault, ...nearScope }))
      const { val: none } = await bankDB.listBoxes({ ...boxListAsk, ...nearScope })
      expect(none.boxes).to.deep.equal([])
      const { val } = await bankDB.listBoxes(boxListAsk)
      expect(val.boxes).to.deep.equal([BX.boxSparse.parse(box)])
    })

    it("hands another device what one wrote", async () => {
      const { bankDB, gate, vault, box } = await putWith({ box: true })
      const twin = await twinOf(bankDB)
      const twinBank = await twin.ensureBank(bankEnsureAsk)
      expect(twinBank.val?.gates).to.deep.equal({ main: gate })
      expect(await twin.getVault(vaultGetAskOf())).to.deep.include({ val: vault })
      expect(await twin.getBox(boxGetAskOf())).to.deep.include({ val: box })
    })
  })
}
