/** The battery's races and notices: two devices' writes made at once, a bank deleted under a gate verb, what a watch hears, and a bankDB's own failure. */

import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { isVaultError } from '../../src/refusals/errors'
import type { WatchScope } from '../../src/shapes/shapes-storage'
import * as BX from '../../src/shapes/shapes-bankdb'
import type { VaultRow } from '../../src/shapes/shapes-bankdb'
import type { BankDB, Notice } from '../../src/storage/bank-db'
import type { AdapterBankDB } from '../../src/storage/adapter-bank-db'
import {
  bankScope, gateScope, vaultScope, MainOnly, mainWayin, passkey0Wayin, otherMainWayin, bankAt, gateAt, vaultAt, boxAt,
  bankTombstoneOf, vaultTombstoneOf, boxListAsk, bankBuildAskOf, gatePutAskOf, bankDelAskOf,
  vaultGetAskOf, boxGetAskOf, vaultPutAskOf, boxPutAskOf, vaultDelAskOf,
} from './bankdb-world'
import { aWhile, beforeNextCall } from './timing'
import type { BatteryWorld } from './bank-db-battery'

/** The answers that were written, and those refused. */
function splitOf<AnswerT extends { ok: boolean }>(answers: AnswerT[]) {
  return {
    written: answers.filter(({ ok }) => ok),
    refused: answers.filter(({ ok }) => ! ok),
  }
}

/** Runs `meanwhile`, another device's doings, just before the gate verb's doPutGate. */
function slipInFront(bankDB: AdapterBankDB, meanwhile: () => Promise<unknown>): void {
  /** A bankDB seen as the protected call a gate verb moves the gate row by. */
  type MovesGateRow = { doPutGate: (...args: never[]) => Promise<unknown> }
  beforeNextCall(bankDB as unknown as MovesGateRow, 'doPutGate', meanwhile)
}

/** A watch on `bankDB` at `scope`, closed when the test ends, and the notices it has heard so far. */
function watching(bankDB: BankDB, scope: WatchScope) {
  const notices: Notice[] = []
  const unwatch = bankDB.watch(scope, (notice) => { notices.push(notice) })
  onTestFinished(unwatch)
  return { notices, unwatch }
}

/** Registers the races', notices' and failure's cases over `world`. */
export function describeRaces({ fresh, putWith, rowsOf, twinOf, adapterOf, hasCap, makeCapped, canFail, failNextCall, watches, boxNoticesCarryVault }: BatteryWorld): void {
  /** The parent a watch hears beside a box of `vault`: the vault row, or null from a bankDB whose box notices carry none. */
  function boxParent(vault: VaultRow) { return (boxNoticesCarryVault ? vault : null) }

  describe("two devices at once", () => {
    it("two builds of one bank store one, and the other is passed its gate", async () => {
      const bankDB = await fresh()
      const twin = await twinOf(bankDB)
      const ours = bankBuildAskOf(bankAt(0, 'bankA'), gateAt(0, 'bankA'))
      const theirs = bankBuildAskOf({ ...bankAt(0, 'bankB'), revision_tok: 'krevB' }, gateAt(0, 'bankB', MainOnly, 'gateB'))
      const answers = await Promise.all([bankDB.buildBank(ours), twin.buildBank(theirs)])
      expect(answers.map(({ act }) => act)).to.have.members(['born', 'passed'])
      const born = answers.find(({ act }) => act === 'born')
      expect(answers.map(({ val }) => val)).to.deep.equal([born?.val, born?.val])
      expect(await rowsOf(bankDB).bankRowOf(bankScope)).to.deep.equal(born?.parent)
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.deep.equal(born?.val)
    })

    it("two births of one vault store one, and the other is passed it", async () => {
      const { bankDB } = await putWith({ vault: false })
      const twin = await twinOf(bankDB)
      const ours = vaultPutAskOf(vaultAt(0, 'bank1', 'lifeA', { revision_tok: 'vrevA' }), null, { ifPresent: 'get' })
      const theirs = vaultPutAskOf(vaultAt(0, 'bank1', 'lifeB', { revision_tok: 'vrevB' }), null, { ifPresent: 'get' })
      const answers = await Promise.all([bankDB.putVault(ours), twin.putVault(theirs)])
      expect(answers.map(({ act }) => act)).to.have.members(['born', 'passed'])
      const born = answers.find(({ act }) => act === 'born')?.val
      expect(answers.map(({ val }) => val)).to.deep.equal([born, born])
      expect(await rowsOf(bankDB).vaultRowOf(vaultScope)).to.deep.equal(born)
    })

    it("two replacements of one box at one revision write one, and the other is refused with the winner", async () => {
      const { bankDB, box } = await putWith({ box: true })
      const twin = await twinOf(bankDB)
      const ours = boxPutAskOf(boxAt(1, 'bank1', 'life1', { sidecar: { by: 'ours' } }), box)
      const theirs = boxPutAskOf(boxAt(1, 'bank1', 'life1', { sidecar: { by: 'theirs' }, revision_tok: 'brev1b' }), box)
      const { written, refused } = splitOf(await Promise.all([bankDB.tryPutBox(ours), twin.tryPutBox(theirs)]))
      expect([written.length, refused.length]).to.deep.equal([1, 1])
      expect(refused[0]).to.deep.include({ act: 'stale', dbhas: written[0]?.val })
      expect(refused[0]?.err?.refusalkind).to.eq('stale_write')
      expect(await bankDB.getBox(boxGetAskOf())).to.deep.include({ val: written[0]?.val })
    })

    it("two first writes of one box write one, and the other is refused with the winner", async () => {
      const { bankDB } = await putWith()
      const twin = await twinOf(bankDB)
      const ours = boxPutAskOf(boxAt(0, 'bank1', 'life1', { box_tok: 'boxA' }))
      const theirs = boxPutAskOf(boxAt(0, 'bank1', 'life1', { box_tok: 'boxB', revision_tok: 'brev0b' }))
      const { written, refused } = splitOf(await Promise.all([bankDB.tryPutBox(ours), twin.tryPutBox(theirs)]))
      expect([written.length, refused.length]).to.deep.equal([1, 1])
      expect(refused[0]).to.deep.include({ act: 'stale', dbhas: written[0]?.val })
    })

    it("writes to two boxes of one vault are both written", async () => {
      const { bankDB, box } = await putWith()
      const twin = await twinOf(bankDB)
      const other = boxAt(0, 'bank1', 'life1', { boxlabel: 'other' })
      await Promise.all([bankDB.putBox(boxPutAskOf(box)), twin.putBox(boxPutAskOf(other))])
      const { val } = await bankDB.listBoxes(boxListAsk)
      expect(val.boxes.map(({ boxlabel }) => boxlabel)).to.have.members(['openai', 'other'])
    })

    it("a vault deleted while a box is written answers no box of the life it ended", async () => {
      const { bankDB, vault, box } = await putWith()
      const twin = await twinOf(bankDB)
      await Promise.all([bankDB.delVault(vaultDelAskOf(vault)), twin.tryPutBox(boxPutAskOf(box))])
      expect(await bankDB.tryGetBox(boxGetAskOf())).to.deep.include({ ok: false, act: 'vault_gone', parent: vaultTombstoneOf(vault) })
      expect(await bankDB.tryListBoxes(boxListAsk)).to.deep.include({ ok: false, act: 'vault_gone' })
    })

    it("two gate puts at one revision write one, and the other is refused with the winner", async () => {
      const { bankDB, gate } = await putWith()
      const twin = await twinOf(bankDB)
      const ours = gatePutAskOf('add_passkey', gate, { main: mainWayin, passkey0: passkey0Wayin })
      const theirs = gatePutAskOf('replace_passphrase', gate, { main: otherMainWayin })
      const { written, refused } = splitOf(await Promise.all([bankDB.tryPutGate(ours), twin.tryPutGate(theirs)]))
      expect([written.length, refused.length]).to.deep.equal([1, 1])
      expect(refused[0]).to.deep.include({ act: 'stale', dbhas: written[0]?.val })
      expect(refused[0]?.err?.refusalkind).to.eq('stale_write')
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.deep.equal(written[0]?.val)
    })

    if (hasCap) {
      // The cap is soft: each writer counts the box rows outside any lock, so several may take the last place at once.
      it("writers racing for a vault's last place under a cap write at least one, and refuse the rest as full", async () => {
        const bankDB = await makeCapped(2)
        const twin = await twinOf(bankDB)
        await bankDB.buildBank(bankBuildAskOf())
        await bankDB.putVault(vaultPutAskOf(vaultAt()))
        await bankDB.putBox(boxPutAskOf(boxAt()))
        const racers = ['racer_a', 'racer_b', 'racer_c', 'racer_d'].map((boxlabel, ii) => ((ii % 2) ? twin : bankDB).tryPutBox(boxPutAskOf(boxAt(0, 'bank1', 'life1', { boxlabel }))))
        const { written, refused } = splitOf(await Promise.all(racers))
        expect(written.length).to.be.at.least(1)
        expect(written.length + refused.length).to.equal(racers.length)
        expect(refused.map(({ act }) => act)).to.deep.equal(refused.map(() => 'vault_full'))
        expect(await rowsOf(bankDB).boxRowsOf(vaultScope, 'bank1', 'life1')).to.have.property('size', 1 + written.length)
      })
    }
  })

  describe("a bank changed while a gate put runs", () => {
    it("refuses with the tombstone when the bank was deleted", async () => {
      const { bankDB, bank, gate } = await putWith()
      const twin = await twinOf(bankDB)
      const tombstone = bankTombstoneOf(bank)
      slipInFront(adapterOf(bankDB), async () => await twin.delBank(bankDelAskOf(bank)))
      const answer = await bankDB.tryPutGate(gatePutAskOf('add_passkey', gate, { main: mainWayin, passkey0: passkey0Wayin }))
      expect(answer).to.deep.include({ ok: false, act: 'bank_gone', parent: tombstone })
      expect(await rowsOf(bankDB).bankRowOf(bankScope)).to.deep.equal(tombstone)
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.be.null
    })

    it("refuses with the new life when the bank was deleted and built again", async () => {
      const { bankDB, bank, gate } = await putWith()
      const twin = await twinOf(bankDB)
      const reborn = bankAt(2, 'bank2')
      const rebornGate = gateAt(0, 'bank2')
      slipInFront(adapterOf(bankDB), async () => {
        await twin.delBank(bankDelAskOf(bank))
        await twin.buildBank(bankBuildAskOf(reborn, rebornGate, bankTombstoneOf(bank)))
      })
      const answer = await bankDB.tryPutGate(gatePutAskOf('add_passkey', gate, { main: mainWayin, passkey0: passkey0Wayin }))
      expect(answer).to.deep.include({ ok: false, act: 'bank_reborn', parent: reborn })
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.deep.equal(rebornGate)
    })
  })

  if (watches) {
    describe("watch", () => {
      it("notifies of a box written and its vault deleted, each as stored", async () => {
        const { bankDB, bank, vault, box } = await putWith()
        const { notices } = watching(bankDB, vaultScope)
        await bankDB.putBox(boxPutAskOf(box))
        const tombstone = vaultTombstoneOf(vault)
        await bankDB.delVault(vaultDelAskOf(vault))
        await vi.waitFor(() => {
          expect(notices).to.deep.include.members([{ act: 'gotlive', val: box, parent: boxParent(vault) }, { act: 'gotgone', val: tombstone, parent: bank }])
        })
      })

      it("notifies a bank's watch of its gate replaced and of the bank deleted, each as stored, the bank's parent being main", async () => {
        const { bankDB, bank, gate } = await putWith()
        const { notices } = watching(bankDB, bankScope)
        const { val: replaced } = await bankDB.putGate(gatePutAskOf('replace_passphrase', gate, { main: otherMainWayin }))
        const tombstone = bankTombstoneOf(bank)
        await bankDB.delBank(bankDelAskOf(bank))
        await vi.waitFor(() => {
          expect(notices.map(({ act, val }) => ({ act, val }))).to.deep.include.members([{ act: 'gotlive', val: replaced }, { act: 'gotgone', val: tombstone }])
          expect(notices).to.deep.include({ act: 'gotgone', val: tombstone, parent: BX.BankTop })
        })
      })

      it("notifies of what another device writes", async () => {
        const { bankDB, vault, box } = await putWith()
        const twin = await twinOf(bankDB)
        const { notices } = watching(bankDB, vaultScope)
        await twin.putBox(boxPutAskOf(box))
        await vi.waitFor(() => { expect(notices).to.deep.include({ act: 'gotlive', val: box, parent: boxParent(vault) }) })
      })

      it("notifies of its own vault under a vault's scope, and of every vault of its bank under a bank's", async () => {
        const { bankDB, box } = await putWith()
        const bankwide = watching(bankDB, bankScope)
        const vaultwide = watching(bankDB, vaultScope)
        const other = vaultAt(0, 'bank1', 'life2', { vaultlabel: 'other' })
        await bankDB.putVault(vaultPutAskOf(other))
        const stranger = { ...bankAt(), user_id: 'u2' }
        await bankDB.buildBank(bankBuildAskOf(stranger, { ...gateAt(), user_id: 'u2' }))
        await bankDB.putVault(vaultPutAskOf(vaultAt(0, 'bank1', 'life3', { user_id: 'u2' })))
        await bankDB.putBox(boxPutAskOf(box))
        await vi.waitFor(() => {
          expect(bankwide.notices.map(({ val }) => val)).to.deep.include.members([other, box])
          expect(vaultwide.notices.map(({ val }) => val)).to.deep.include(box)
        })
        await aWhile()
        expect(bankwide.notices.filter(({ val }) => val.user_id !== 'u1')).to.deep.equal([])
        expect(vaultwide.notices.filter(({ val }) => (! ('vaultlabel' in val)) || (val.vaultlabel !== 'main'))).to.deep.equal([])
      })

      it("notifies of nothing once stopped", async () => {
        const { bankDB, box } = await putWith()
        const { notices, unwatch } = watching(bankDB, vaultScope)
        await bankDB.putBox(boxPutAskOf(box))
        await vi.waitFor(() => { expect(notices.map(({ val }) => val)).to.deep.include(box) })
        // A store may still be delivering the notice of putWith's own vault put, so count from the box's notice, which follows it.
        const heard = notices.length
        unwatch()
        await bankDB.putBox(boxPutAskOf(boxAt(1), box))
        await aWhile()
        expect(notices).to.have.lengthOf(heard)
      })

      it("is safe to stop twice", async () => {
        const { bankDB, box } = await putWith()
        const { notices, unwatch } = watching(bankDB, vaultScope)
        unwatch()
        expect(() => { unwatch() }).not.to.throw()
        await bankDB.putBox(boxPutAskOf(box))
        await aWhile()
        expect(notices).to.deep.equal([])
      })
    })
  }

  if (canFail) {
    describe("a bankDB's own failure", () => {
      it("refuses the call its storage failed, and completes the next", async () => {
        const { bankDB, vault } = await putWith()
        await failNextCall(bankDB)
        const answer = await bankDB.tryGetVault(vaultGetAskOf())
        expect(answer).to.deep.include({ ok: false, act: 'unclassified_storing', parent: null })
        expect(answer.ask).to.deep.include(vaultScope)
        expect(isVaultError(answer.err)).to.be.true
        expect(await bankDB.getVault(vaultGetAskOf())).to.deep.include({ val: vault })
      })
    })
  }
}
