/** The VaultDB base class, over a MemoryVaultDB: how it reads a store's own failure, how a plain verb and its try form agree, and its relay. */

import { describe, expect, it, vi } from 'vitest'
import { VaultError, isVaultError } from '../../src/refusals/errors'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import * as SX from '../../src/shapes/shapes-storage'
import { bankScope, boxAt, boxQuery, boxscope, vaultAt, vaultScope } from '../test-helpers/storage-world'

const thrownBy = async (thunk: () => Promise<unknown>): Promise<unknown> => {
  try { await thunk() } catch (err) { return err }
  return null
}

describe("VaultDB", () => {
  describe("a scope failing its check", () => {
    it("listBoxes refuses a query without its vault_tok, or under a vaultlabel failing its check", async () => {
      const vaultDB = new MemoryVaultDB()
      expect(await vaultDB.tryListBoxes(vaultScope as never)).to.deep.include({ ok: false, act: 'bad_scope' })
      expect(await vaultDB.tryListBoxes({ ...vaultScope, vault_tok: 'life1', vaultlabel: 'No Good!' })).to.deep.include({ ok: false, act: 'bad_scope' })
    })

    it("getBox refuses a query without its vault_tok, or under a boxlabel failing its check", async () => {
      const vaultDB = new MemoryVaultDB()
      expect(await vaultDB.tryGetBox(boxscope as never)).to.deep.include({ ok: false, act: 'bad_scope' })
      expect(await vaultDB.tryGetBox({ ...boxscope, boxlabel: 'No Good!', vault_tok: 'life1' })).to.deep.include({ ok: false, act: 'bad_scope' })
    })

    it("watch refuses a scope failing its check, before it watches", () => {
      const vaultDB = new MemoryVaultDB()
      expect(() => vaultDB.watch({ ...bankScope, applabel: '' }, () => undefined)).to.throw(VaultError).with.property('refusalkind', 'bad_scope')
      expect(() => vaultDB.watch({ ...vaultScope, vaultlabel: 'No Good!' }, () => undefined)).to.throw(VaultError).with.property('refusalkind', 'bad_scope')
    })
  })

  describe("a store's own failure", () => {
    class FailingVaultDB extends MemoryVaultDB {
      protected override doListVaults(): never { throw new Error('socket closed') }
    }

    it("reads as storage_unavailable, the store's error its cause, by a throw and by an answer alike", async () => {
      const vaultDB = new FailingVaultDB()
      await expect(vaultDB.listVaults(bankScope)).rejects.toSatisfy((err) => isVaultError(err, 'storage_unavailable'))
      const answer = await vaultDB.tryListVaults(bankScope)
      expect(answer).to.deep.include({ ok: false, act: 'storage_unavailable', world: null, req_params: bankScope })
      expect(answer.err?.meta).to.deep.include({ call: 'listVaults' })
      expect((answer.err?.cause as Error).message).to.eq('socket closed')
    })

    it("a VaultError a store throws passes up unchanged, with the request's safe metadata", async () => {
      class RefusingVaultDB extends MemoryVaultDB {
        protected override doListVaults(): never { throw new VaultError('storage_unavailable', 'Storage is down.') }
      }
      expect(await new RefusingVaultDB().tryListVaults(bankScope)).to.deep.include({ ok: false, act: 'storage_unavailable', req_params: bankScope })
    })
  })

  describe("the plain verb and its try form", () => {
    it("read the same: a refusal's act, world and dbhas in an answer are its meta in the error", async () => {
      const vaultDB = new MemoryVaultDB()
      const vault = vaultAt()
      await vaultDB.putVault(vault, { prior: SX.VoidRevision })
      const rival = vaultAt(0, 'life2')
      const answer = await vaultDB.tryPutVault(rival, { prior: SX.VoidRevision, ifPresent: 'fail' })
      const thrown = await thrownBy(() => vaultDB.putVault(rival, { prior: SX.VoidRevision, ifPresent: 'fail' }))
      expect(isVaultError(thrown, 'camped')).to.be.true
      expect(thrown).to.deep.include({ refusalkind: answer.act })
      expect((thrown as { meta: object }).meta).to.deep.include({ world: vault, dbhas: vault, req_params: answer.req_params, call: 'putVault' })
    })
  })

  describe("its relay", () => {
    it("answers each call as the store's generic call does", async () => {
      const vaultDB = new MemoryVaultDB()
      const vault = vaultAt()
      const box = boxAt()
      expect(await vaultDB.relay.putVault(vault, { prior: SX.VoidRevision })).to.deep.equal({ landed: true, ante: null })
      expect(await vaultDB.relay.putBox(box, { prior: SX.VoidRevision })).to.deep.equal({ landed: true, ante: null, vault })
      expect(await vaultDB.relay.getBox(boxQuery)).to.deep.equal({ vault, box })
      expect(await vaultDB.relay.putVault(vaultAt(0, 'life2'), { prior: SX.VoidRevision, ifPresent: 'fail' })).to.deep.equal({ landed: false, ante: vault })
    })

    it("refuses what the verb would refuse before the store is asked", async () => {
      const vaultDB = new MemoryVaultDB({ maxRecordBytes: 2000 })
      await vaultDB.putVault(vaultAt(), { prior: SX.VoidRevision })
      const heavy = boxAt(0, 'life1', { sidecar: { note: 'x'.repeat(3000) } })
      await expect(vaultDB.relay.putBox(heavy, { prior: SX.VoidRevision })).rejects.toSatisfy((err) => isVaultError(err, 'box_too_large'))
      await expect(vaultDB.relay.putBox(boxAt(1), { prior: SX.VoidRevision })).rejects.toSatisfy((err) => isVaultError(err, 'bad_option'))
      await expect(vaultDB.relay.getVault({ ...vaultScope, vaultlabel: 'no way' })).rejects.toSatisfy((err) => isVaultError(err, 'bad_option'))
      expect(() => vaultDB.relay.watch({ ...bankScope, user_id: '' }, () => undefined)).to.throw(VaultError)
      expect(await vaultDB.relay.listBoxes({ ...vaultScope, vault_tok: 'life1' })).to.deep.equal({ vault: vaultAt(), boxes: [] })
    })

    it("refuses for a store's own failure, whatever it threw", async () => {
      class FailingVaultDB extends MemoryVaultDB {
        protected override doListVaults(): never { throw new Error('socket closed') }
      }
      await expect(new FailingVaultDB().relay.listVaults(bankScope)).rejects.toSatisfy((err) => isVaultError(err, 'storage_unavailable'))
    })

    it("hears what the store's watch hears, the rows unchecked", async () => {
      const vaultDB = new MemoryVaultDB()
      const heard: unknown[] = []
      const unwatch = vaultDB.relay.watch(vaultScope, (each) => { heard.push(each) })
      const vault = vaultAt()
      await vaultDB.relay.putVault(vault, { prior: SX.VoidRevision })
      await vi.waitFor(() => { expect(heard).to.deep.equal([{ vault }]) })
      unwatch()
    })
  })
})
