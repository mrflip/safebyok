/** The battery's races and notices: two devices' writes landing at once, a vault deleted under a gate verb, what a watch hears, and a store's own failure. */

import { describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import * as SX from '../../src/shapes/shapes-storage'
import type { WatchScope } from '../../src/shapes/shapes-storage'
import type { Notice, VaultDB } from '../../src/storage/vault-db-new'
import { bankScope, vaultScope, boxscope, passphraseWayin, passkeyWayin, vaultAt, boxAt, vaultTombstoneOf, priorOf } from './storage-world'
import { aWhile, beforeNextCall } from './timing'
import { gateParamsOf } from './vault-db-battery-puts'
import type { BatteryWorld } from './vault-db-battery'

const vaultQuery = { ...vaultScope, vault_tok: 'life1' }
const boxQuery   = { ...boxscope, vault_tok: 'life1' }

/** The answers that landed, and those refused. */
const splitOf = <AnswerT extends { ok: boolean }>(answers: AnswerT[]) => ({
  landed:  answers.filter(({ ok }) => ok),
  refused: answers.filter(({ ok }) => ! ok),
})

/** Runs `meanwhile`, another device's doings, just before the gate verb's doPutVault, after its doGetVault found the live row. */
const slipInFront = (vaultDB: VaultDB, meanwhile: () => Promise<unknown>): void => {
  /** A store seen as the protected call a gate verb moves the vault row by. */
  type MovesVaultRow = { doPutVault: (...args: never[]) => Promise<unknown> }
  beforeNextCall(vaultDB as unknown as MovesVaultRow, 'doPutVault', meanwhile)
}

/** A watch on `vaultDB` at `scope`, and the notices it has heard so far. */
const watching = (vaultDB: VaultDB, scope: WatchScope) => {
  const notices: Notice[] = []
  const unwatch = vaultDB.watch(scope, (notice) => { notices.push(notice) })
  return { notices, unwatch }
}

/** Registers the races', notices' and failure's cases over `world`. */
export const describeRaces = ({ fresh, storeWith, rowsOf, twinOf, hasCap, makeCapped, canFail, failNextCall, watches }: BatteryWorld): void => {
  describe("two devices at once", () => {
    it("two births of one vault settle on one life, the other declined with it", async () => {
      const vaultDB = await fresh()
      const twin = await twinOf(vaultDB)
      const answers = await Promise.all([
        vaultDB.putVault(vaultAt(0, 'lifeA'), { prior: SX.VoidRevision, ifPresent: 'get' }),
        twin.putVault(vaultAt(0, 'lifeB'), { prior: SX.VoidRevision, ifPresent: 'get' }),
      ])
      expect(answers.map(({ act }) => act)).to.have.members(['born', 'declined'])
      const born = answers.find(({ act }) => act === 'born')?.val
      expect(answers.map(({ val }) => val)).to.deep.equal([born, born])
      expect(await rowsOf(vaultDB).vaultRowOf(vaultScope)).to.deep.equal(born)
    })

    it("two replacements of one box at one prior land one, the other refused holding the winner", async () => {
      const { vaultDB, box } = await storeWith({ box: true })
      const twin = await twinOf(vaultDB)
      const ours = boxAt(1, 'life1', { sidecar: { by: 'ours' } })
      const theirs = boxAt(1, 'life1', { sidecar: { by: 'theirs' }, revision_tok: 'brev1b' })
      const prior = priorOf(box)
      const { landed, refused } = splitOf(await Promise.all([vaultDB.tryPutBox(ours, { prior }), twin.tryPutBox(theirs, { prior })]))
      expect([landed.length, refused.length]).to.deep.equal([1, 1])
      expect(refused[0]).to.deep.include({ act: 'stale_write', dbhas: landed[0]?.val })
      expect(await vaultDB.getBox(boxQuery)).to.deep.include({ val: landed[0]?.val })
    })

    it("two first writes of one box land one, the other refused holding the winner", async () => {
      const { vaultDB } = await storeWith()
      const twin = await twinOf(vaultDB)
      const ours = boxAt(0, 'life1', { box_tok: 'boxA' })
      const theirs = boxAt(0, 'life1', { box_tok: 'boxB', revision_tok: 'brev0b' })
      const { landed, refused } = splitOf(await Promise.all([vaultDB.tryPutBox(ours, { prior: SX.VoidRevision }), twin.tryPutBox(theirs, { prior: SX.VoidRevision })]))
      expect([landed.length, refused.length]).to.deep.equal([1, 1])
      expect(refused[0]).to.deep.include({ dbhas: landed[0]?.val })
    })

    it("writes to two boxes of one vault both land", async () => {
      const { vaultDB } = await storeWith()
      const twin = await twinOf(vaultDB)
      const other = boxAt(0, 'life1', { boxlabel: 'other' })
      await Promise.all([vaultDB.putBox(boxAt(), { prior: SX.VoidRevision }), twin.putBox(other, { prior: SX.VoidRevision })])
      const { val } = await vaultDB.listBoxes(vaultQuery)
      expect(val.boxes.map(({ boxlabel }) => boxlabel)).to.have.members(['openai', 'other'])
    })

    it("a vault deleted while a box is written leaves no live box under the life it ended", async () => {
      const { vaultDB, vault, box } = await storeWith()
      const twin = await twinOf(vaultDB)
      await Promise.all([vaultDB.delVault(vaultTombstoneOf(vault), { prior: priorOf(vault) }), twin.tryPutBox(box, { prior: SX.VoidRevision })])
      const boxrows = await rowsOf(vaultDB).boxRowsOf(vaultScope, 'life1')
      expect([...boxrows.values()].filter((row) => SX.isLiveRow(row))).to.deep.equal([])
    })

    it("two gate verbs at one revision land one, the other refused holding the winner", async () => {
      const { vaultDB, vault } = await storeWith()
      const twin = await twinOf(vaultDB)
      const ours = gateParamsOf(vault, { passkey_wayin: passkeyWayin })
      const theirs = gateParamsOf(vault, { passphrase_wayin: { ...passphraseWayin, device_id: 'd2' } })
      const { landed, refused } = splitOf(await Promise.all([vaultDB.tryAddPasskey(ours), twin.tryReplacePassphrase(theirs)]))
      expect([landed.length, refused.length]).to.deep.equal([1, 1])
      expect(refused[0]).to.deep.include({ act: 'stale_write', dbhas: landed[0]?.val })
      expect(await rowsOf(vaultDB).vaultRowOf(vaultScope)).to.deep.include({ revision_seq: 1 })
    })

    it.skipIf(! hasCap)("writers racing for a vault's last place under a cap land one", async () => {
      const vaultDB = await makeCapped(2)
      const twin = await twinOf(vaultDB)
      await vaultDB.putVault(vaultAt(), { prior: SX.VoidRevision })
      await vaultDB.putBox(boxAt(), { prior: SX.VoidRevision })
      const racers = ['racer_a', 'racer_b', 'racer_c', 'racer_d'].map((boxlabel, ii) => ((ii % 2) ? twin : vaultDB).tryPutBox(boxAt(0, 'life1', { boxlabel }), { prior: SX.VoidRevision }))
      const { landed, refused } = splitOf(await Promise.all(racers))
      expect([landed.length, refused.length]).to.deep.equal([1, 3])
      const boxrows = await rowsOf(vaultDB).boxRowsOf(vaultScope, 'life1')
      expect([...boxrows.values()].filter((row) => SX.isLiveRow(row))).to.have.lengthOf(2)
    })
  })

  describe("a vault changed between a gate verb's look at it and its move", () => {
    it("refuses as gone when the vault was deleted", async () => {
      const { vaultDB, vault } = await storeWith()
      const twin = await twinOf(vaultDB)
      slipInFront(vaultDB, async () => await twin.delVault(vaultTombstoneOf(vault), { prior: priorOf(vault) }))
      expect(await vaultDB.tryAddPasskey(gateParamsOf(vault, { passkey_wayin: passkeyWayin }))).to.deep.include({ ok: false, act: 'vault_gone' })
    })

    it("refuses as another life when the vault was deleted and born again", async () => {
      const { vaultDB, vault } = await storeWith()
      const twin = await twinOf(vaultDB)
      const tombstone = vaultTombstoneOf(vault)
      slipInFront(vaultDB, async () => {
        await twin.delVault(tombstone, { prior: priorOf(vault) })
        await twin.putVault(vaultAt(2, 'life2'), { prior: priorOf(tombstone) })
      })
      expect(await vaultDB.tryAddPasskey(gateParamsOf(vault, { passkey_wayin: passkeyWayin }))).to.deep.include({ ok: false, act: 'vault_mismatch' })
    })
  })

  describe.skipIf(! watches)("watch", () => {
    it("hears a box written and its vault deleted, each as stored", async () => {
      const { vaultDB, vault, box } = await storeWith()
      const { notices } = watching(vaultDB, vaultScope)
      await vaultDB.putBox(box, { prior: SX.VoidRevision })
      const tombstone = vaultTombstoneOf(vault)
      await vaultDB.delVault(tombstone, { prior: priorOf(vault) })
      await vi.waitFor(() => {
        expect(notices).to.deep.include.members([{ act: 'got', val: box, world: vault }, { act: 'gone', val: tombstone, world: tombstone }])
      })
    })

    it("hears what another device writes", async () => {
      const { vaultDB, vault, box } = await storeWith()
      const twin = await twinOf(vaultDB)
      const { notices } = watching(vaultDB, vaultScope)
      await twin.putBox(box, { prior: SX.VoidRevision })
      await vi.waitFor(() => { expect(notices).to.deep.include({ act: 'got', val: box, world: vault }) })
    })

    it("hears its own vault under a vault's scope, and every vault of its own bank under a bank's", async () => {
      const { vaultDB, box } = await storeWith()
      const bankwide = watching(vaultDB, bankScope)
      const vaultwide = watching(vaultDB, vaultScope)
      const other = vaultAt(0, 'life2', { vaultlabel: 'other' })
      await vaultDB.putVault(other, { prior: SX.VoidRevision })
      await vaultDB.putVault(vaultAt(0, 'life3', { user_id: 'u2' }), { prior: SX.VoidRevision })
      await vaultDB.putBox(box, { prior: SX.VoidRevision })
      await vi.waitFor(() => {
        expect(bankwide.notices.map(({ val }) => val)).to.deep.include.members([other, box])
        expect(vaultwide.notices.map(({ val }) => val)).to.deep.include(box)
      })
      await aWhile()
      expect(bankwide.notices.filter(({ val }) => val.user_id !== 'u1')).to.deep.equal([])
      expect(vaultwide.notices.filter(({ val }) => val.vaultlabel !== 'main')).to.deep.equal([])
    })

    it("hears nothing once told to stop", async () => {
      const { vaultDB, box } = await storeWith()
      const { notices, unwatch } = watching(vaultDB, vaultScope)
      await vaultDB.putBox(box, { prior: SX.VoidRevision })
      await vi.waitFor(() => { expect(notices).to.have.lengthOf(1) })
      unwatch()
      await vaultDB.putBox(boxAt(1), { prior: priorOf(box) })
      await aWhile()
      expect(notices).to.have.lengthOf(1)
    })

    it("hears a cascade's box under the vault row stored, not the request's tombstone", async () => {
      const { vaultDB, vault } = await storeWith()
      await rowsOf(vaultDB).plantBoxRow(boxscope, 'oldlife', boxAt(0, 'oldlife'))
      const { notices } = watching(vaultDB, vaultScope)
      const oldLife = vaultAt(0, 'oldlife')
      await vaultDB.delVault(vaultTombstoneOf(oldLife), { prior: priorOf(oldLife) })
      await vi.waitFor(() => { expect(notices.map(({ world }) => world)).to.deep.equal([vault]) })
      await aWhile()
      expect(notices.map(({ world }) => world)).to.deep.equal([vault])
    })
  })

  describe("a store's own failure", () => {
    it.skipIf(! canFail)("refuses the call its storage failed, and answers the next", async () => {
      const { vaultDB, vault } = await storeWith()
      await failNextCall(vaultDB)
      const answer = await vaultDB.tryGetVault(vaultScope)
      expect(answer).to.deep.include({ ok: false, req_params: vaultScope })
      expect(answer.err).to.be.instanceOf(VaultError)
      expect(await vaultDB.getVault(vaultScope)).to.deep.include({ val: vault })
    })
  })
}
