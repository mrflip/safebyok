/** The battery's races and notices: two devices' writes made at once, a vault deleted under a gate verb, what a watch hears, and a VaultDB's own failure. */

import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { isVaultError } from '../../src/refusals/errors'
import type { VaultRow, WatchScope } from '../../src/shapes/shapes-storage'
import type { Notice, VaultDB } from '../../src/storage/vault-db'
import type { AdapterVaultDB } from '../../src/storage/adapter-vault-db'
import {
  bankScope, vaultScope, passphraseWayin, passkeyWayin, vaultAt, boxAt, vaultTombstoneOf, boxListAsk, gateMoveOf,
  vaultGetAskOf, boxGetAskOf, vaultPutAskOf, boxPutAskOf, vaultDelAskOf,
} from './storage-world'
import { aWhile, beforeNextCall } from './timing'
import type { BatteryWorld } from './vault-db-battery'

/** The answers that were written, and those refused. */
function splitOf<AnswerT extends { ok: boolean }>(answers: AnswerT[]) {
  return {
    written: answers.filter(({ ok }) => ok),
    refused: answers.filter(({ ok }) => ! ok),
  }
}

/** Runs `meanwhile`, another device's doings, just before the gate verb's doPutVault. */
function slipInFront(vaultDB: AdapterVaultDB, meanwhile: () => Promise<unknown>): void {
  /** A VaultDB seen as the protected call a gate verb moves the vault row by. */
  type MovesVaultRow = { doPutVault: (...args: never[]) => Promise<unknown> }
  beforeNextCall(vaultDB as unknown as MovesVaultRow, 'doPutVault', meanwhile)
}

/** A watch on `vaultDB` at `scope`, closed when the test ends, and the notices it has heard so far. */
function watching(vaultDB: VaultDB, scope: WatchScope) {
  const notices: Notice[] = []
  const unwatch = vaultDB.watch(scope, (notice) => { notices.push(notice) })
  onTestFinished(unwatch)
  return { notices, unwatch }
}

/** Registers the races', notices' and failure's cases over `world`. */
export function describeRaces({ fresh, putWith, rowsOf, twinOf, adapterOf, hasCap, makeCapped, canFail, failNextCall, watches, boxNoticesCarryVault }: BatteryWorld): void {
  /** The world a watch hears beside a box of `vault`: the vault row, or null from a VaultDB whose box notices carry none. */
  function boxWorld(vault: VaultRow) { return (boxNoticesCarryVault ? vault : null) }

  describe("two devices at once", () => {
    it("two births of one vault store one, and the other is passed it", async () => {
      const vaultDB = await fresh()
      const twin = await twinOf(vaultDB)
      const ours = vaultPutAskOf(vaultAt(0, 'lifeA', { revision_tok: 'vrevA' }), null, { ifPresent: 'get' })
      const theirs = vaultPutAskOf(vaultAt(0, 'lifeB', { revision_tok: 'vrevB' }), null, { ifPresent: 'get' })
      const answers = await Promise.all([vaultDB.putVault(ours), twin.putVault(theirs)])
      expect(answers.map(({ act }) => act)).to.have.members(['born', 'passed'])
      const born = answers.find(({ act }) => act === 'born')?.val
      expect(answers.map(({ val }) => val)).to.deep.equal([born, born])
      expect(await rowsOf(vaultDB).vaultRowOf(vaultScope)).to.deep.equal(born)
    })

    it("two replacements of one box at one revision write one, and the other is refused with the winner", async () => {
      const { vaultDB, box } = await putWith({ box: true })
      const twin = await twinOf(vaultDB)
      const ours = boxPutAskOf(boxAt(1, 'life1', { sidecar: { by: 'ours' } }), box)
      const theirs = boxPutAskOf(boxAt(1, 'life1', { sidecar: { by: 'theirs' }, revision_tok: 'brev1b' }), box)
      const { written, refused } = splitOf(await Promise.all([vaultDB.tryPutBox(ours), twin.tryPutBox(theirs)]))
      expect([written.length, refused.length]).to.deep.equal([1, 1])
      expect(refused[0]).to.deep.include({ act: 'stale', dbhas: written[0]?.val })
      expect(refused[0]?.err?.refusalkind).to.eq('stale_write')
      expect(await vaultDB.getBox(boxGetAskOf())).to.deep.include({ val: written[0]?.val })
    })

    it("two first writes of one box write one, and the other is refused with the winner", async () => {
      const { vaultDB } = await putWith()
      const twin = await twinOf(vaultDB)
      const ours = boxPutAskOf(boxAt(0, 'life1', { box_tok: 'boxA' }))
      const theirs = boxPutAskOf(boxAt(0, 'life1', { box_tok: 'boxB', revision_tok: 'brev0b' }))
      const { written, refused } = splitOf(await Promise.all([vaultDB.tryPutBox(ours), twin.tryPutBox(theirs)]))
      expect([written.length, refused.length]).to.deep.equal([1, 1])
      expect(refused[0]).to.deep.include({ act: 'stale', dbhas: written[0]?.val })
    })

    it("writes to two boxes of one vault are both written", async () => {
      const { vaultDB, box } = await putWith()
      const twin = await twinOf(vaultDB)
      const other = boxAt(0, 'life1', { boxlabel: 'other' })
      await Promise.all([vaultDB.putBox(boxPutAskOf(box)), twin.putBox(boxPutAskOf(other))])
      const { val } = await vaultDB.listBoxes(boxListAsk)
      expect(val.boxes.map(({ boxlabel }) => boxlabel)).to.have.members(['openai', 'other'])
    })

    it("a vault deleted while a box is written answers no box of the life it ended", async () => {
      const { vaultDB, vault, box } = await putWith()
      const twin = await twinOf(vaultDB)
      await Promise.all([vaultDB.delVault(vaultDelAskOf(vault)), twin.tryPutBox(boxPutAskOf(box))])
      expect(await vaultDB.tryGetBox(boxGetAskOf())).to.deep.include({ ok: false, act: 'vault_gone', world: vaultTombstoneOf(vault) })
      expect(await vaultDB.tryListBoxes(boxListAsk)).to.deep.include({ ok: false, act: 'vault_gone' })
    })

    it("two gate verbs at one revision write one, and the other is refused with the winner", async () => {
      const { vaultDB, vault } = await putWith()
      const twin = await twinOf(vaultDB)
      const ours = gateMoveOf(vault, { passkey_wayin: passkeyWayin })
      const theirs = gateMoveOf(vault, { passphrase_wayin: { ...passphraseWayin, device_id: '00000000-0000-4000-8000-0000000000d2' } })
      const { written, refused } = splitOf(await Promise.all([vaultDB.tryAddPasskey(...ours), twin.tryReplacePassphrase(...theirs)]))
      expect([written.length, refused.length]).to.deep.equal([1, 1])
      expect(refused[0]).to.deep.include({ act: 'stale', dbhas: written[0]?.val })
      expect(refused[0]?.err?.refusalkind).to.eq('stale_write')
      expect(await rowsOf(vaultDB).vaultRowOf(vaultScope)).to.deep.equal(written[0]?.val)
    })

    if (hasCap) {
      // The cap is soft: each writer counts the box rows outside any lock, so several may take the last place at once.
      it("writers racing for a vault's last place under a cap write at least one, and refuse the rest as full", async () => {
        const vaultDB = await makeCapped(2)
        const twin = await twinOf(vaultDB)
        await vaultDB.putVault(vaultPutAskOf(vaultAt()))
        await vaultDB.putBox(boxPutAskOf(boxAt()))
        const racers = ['racer_a', 'racer_b', 'racer_c', 'racer_d'].map((boxlabel, ii) => ((ii % 2) ? twin : vaultDB).tryPutBox(boxPutAskOf(boxAt(0, 'life1', { boxlabel }))))
        const { written, refused } = splitOf(await Promise.all(racers))
        expect(written.length).to.be.at.least(1)
        expect(written.length + refused.length).to.equal(racers.length)
        expect(refused.map(({ act }) => act)).to.deep.equal(refused.map(() => 'vault_full'))
        expect(await rowsOf(vaultDB).boxRowsOf(vaultScope, 'life1')).to.have.property('size', 1 + written.length)
      })
    }
  })

  describe("a vault changed while a gate verb runs", () => {
    it("refuses 'stale_write' with the tombstone when the vault was deleted", async () => {
      const { vaultDB, vault } = await putWith()
      const twin = await twinOf(vaultDB)
      const tombstone = vaultTombstoneOf(vault)
      slipInFront(adapterOf(vaultDB), async () => await twin.delVault(vaultDelAskOf(vault)))
      const answer = await vaultDB.tryAddPasskey(...gateMoveOf(vault, { passkey_wayin: passkeyWayin }))
      expect(answer).to.deep.include({ ok: false, act: 'stale', dbhas: tombstone, world: tombstone })
      expect(answer.err?.refusalkind).to.eq('stale_write')
      expect(await rowsOf(vaultDB).vaultRowOf(vaultScope)).to.deep.equal(tombstone)
    })

    it("refuses 'stale_write' with the new life when the vault was deleted and born again", async () => {
      const { vaultDB, vault } = await putWith()
      const twin = await twinOf(vaultDB)
      const tombstone = vaultTombstoneOf(vault)
      const reborn = vaultAt(2, 'life2')
      slipInFront(adapterOf(vaultDB), async () => {
        await twin.delVault(vaultDelAskOf(vault))
        await twin.putVault(vaultPutAskOf(reborn, tombstone))
      })
      const answer = await vaultDB.tryAddPasskey(...gateMoveOf(vault, { passkey_wayin: passkeyWayin }))
      expect(answer).to.deep.include({ ok: false, act: 'stale', dbhas: reborn, world: reborn })
      expect(answer.err?.refusalkind).to.eq('stale_write')
    })
  })

  if (watches) {
    describe("watch", () => {
      it("notifies of a box written and its vault deleted, each as stored", async () => {
        const { vaultDB, vault, box } = await putWith()
        const { notices } = watching(vaultDB, vaultScope)
        await vaultDB.putBox(boxPutAskOf(box))
        const tombstone = vaultTombstoneOf(vault)
        await vaultDB.delVault(vaultDelAskOf(vault))
        await vi.waitFor(() => {
          expect(notices).to.deep.include.members([{ act: 'got', val: box, world: boxWorld(vault) }, { act: 'gone', val: tombstone, world: tombstone }])
        })
      })

      it("notifies of what another device writes", async () => {
        const { vaultDB, vault, box } = await putWith()
        const twin = await twinOf(vaultDB)
        const { notices } = watching(vaultDB, vaultScope)
        await twin.putBox(boxPutAskOf(box))
        await vi.waitFor(() => { expect(notices).to.deep.include({ act: 'got', val: box, world: boxWorld(vault) }) })
      })

      it("notifies of its own vault under a vault's scope, and of every vault of its bank under a bank's", async () => {
        const { vaultDB, box } = await putWith()
        const bankwide = watching(vaultDB, bankScope)
        const vaultwide = watching(vaultDB, vaultScope)
        const other = vaultAt(0, 'life2', { vaultlabel: 'other' })
        await vaultDB.putVault(vaultPutAskOf(other))
        await vaultDB.putVault(vaultPutAskOf(vaultAt(0, 'life3', { user_id: 'u2' })))
        await vaultDB.putBox(boxPutAskOf(box))
        await vi.waitFor(() => {
          expect(bankwide.notices.map(({ val }) => val)).to.deep.include.members([other, box])
          expect(vaultwide.notices.map(({ val }) => val)).to.deep.include(box)
        })
        await aWhile()
        expect(bankwide.notices.filter(({ val }) => val.user_id !== 'u1')).to.deep.equal([])
        expect(vaultwide.notices.filter(({ val }) => val.vaultlabel !== 'main')).to.deep.equal([])
      })

      it("notifies of nothing once stopped", async () => {
        const { vaultDB, box } = await putWith()
        const { notices, unwatch } = watching(vaultDB, vaultScope)
        await vaultDB.putBox(boxPutAskOf(box))
        await vi.waitFor(() => { expect(notices.map(({ val }) => val)).to.deep.include(box) })
        // A store may still be delivering the notice of putWith's own vault put, so count from the box's notice, which follows it.
        const heard = notices.length
        unwatch()
        await vaultDB.putBox(boxPutAskOf(boxAt(1), box))
        await aWhile()
        expect(notices).to.have.lengthOf(heard)
      })

      it("is safe to stop twice", async () => {
        const { vaultDB, box } = await putWith()
        const { notices, unwatch } = watching(vaultDB, vaultScope)
        unwatch()
        expect(() => { unwatch() }).not.to.throw()
        await vaultDB.putBox(boxPutAskOf(box))
        await aWhile()
        expect(notices).to.deep.equal([])
      })
    })
  }

  if (canFail) {
    describe("a VaultDB's own failure", () => {
      it("refuses the call its storage failed, and completes the next", async () => {
        const { vaultDB, vault } = await putWith()
        await failNextCall(vaultDB)
        const answer = await vaultDB.tryGetVault(vaultGetAskOf())
        expect(answer).to.deep.include({ ok: false, act: 'storage_unavailable', world: null })
        expect(answer.ask).to.deep.include(vaultScope)
        expect(isVaultError(answer.err, 'storage_unavailable')).to.be.true
        expect(await vaultDB.getVault(vaultGetAskOf())).to.deep.include({ val: vault })
      })
    })
  }
}
