/** The VaultDB base class, over a MemoryVaultDB: its constructor, the gets, and how it calls a store and reads what the store did. */

import { describe, expect, it } from 'vitest'
import { VaultError, isVaultError } from '../../src/refusals/errors'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import * as SX from '../../src/shapes/shapes-storage'
import { bankScope, vaultScope, boxscope, vaultAt, boxAt, vaultTombstoneOf, boxTombstoneOf, priorOf, storeWith } from '../test-helpers/storage-world'

const thrownBy = async (thunk: () => Promise<unknown>): Promise<unknown> => {
  try { await thunk() } catch (err) { return err }
  return null
}

describe("MemoryVaultDB", () => {
  describe("the constructor", () => {
    it("refuses a maxBoxes or maxRecordBytes it cannot use", () => {
      for (const opts of [{ maxBoxes: NaN }, { maxBoxes: -1 }, { maxRecordBytes: -1 }]) {
        expect(() => new MemoryVaultDB(opts)).to.throw(VaultError).with.property('refusalkind', 'bad_option')
      }
    })
  })

  describe("getBank", () => {
    it("answers gotvoid over a bank with no vaults, its world the scope", async () => {
      const vaultDB = new MemoryVaultDB()
      const answer = await vaultDB.getBank(bankScope)
      expect(answer).to.deep.include({ ok: true, act: 'gotvoid', world: bankScope })
      expect(answer.val).to.deep.equal({ vaults: [], damaged_records: [] })
    })

    it("lists vaults full or tombstone, and sets aside a row failing validation as a tombstone in the one shape", async () => {
      const { vaultDB, vault } = await storeWith()
      vaultDB._cheat_vaultRowsOf(bankScope).set('broken', { revision_tok: 'r9', revision_seq: 9, am: 'a', vault_tok: 'life9', garbage: true })
      vaultDB._cheat_vaultRowsOf(bankScope).set('rubble', 'not even an object')
      const { act, val } = await vaultDB.getBank(bankScope)
      expect(act).to.eq('got')
      expect(val.vaults).to.deep.equal([vault])
      expect(val.damaged_records.map(({ vaultlabel, am, revision_seq, vault_tok }) => ({ vaultlabel, am, revision_seq, vault_tok }))).to.deep.equal([
        { vaultlabel: 'broken', am: 'd', revision_seq: 9, vault_tok: 'life9' },
        { vaultlabel: 'rubble', am: 'd', revision_seq: SX.VoidRevisionSeq, vault_tok: SX.VoidRevisionTok },
      ])
      for (const damaged of val.damaged_records) { expect(SX.vaultSparse.safeParse(damaged).success).to.be.true }
    })

    it("says format_mismatch of a row of a later fmt, and damaged_record of any other it sets aside", async () => {
      const { vaultDB } = await storeWith()
      vaultDB._cheat_vaultRowsOf(bankScope).set('newer', { fmt: SX.VaultFormat + 1, revision_seq: 9 })
      vaultDB._cheat_vaultRowsOf(bankScope).set('rubble', 'not even an object')
      const { val } = await vaultDB.getBank(bankScope)
      expect(val.damaged_records.map(({ vaultlabel, damagekind }) => ({ vaultlabel, damagekind }))).to.deep.equal([
        { vaultlabel: 'newer',  damagekind: 'format_mismatch' },
        { vaultlabel: 'rubble', damagekind: 'damaged_record' },
      ])
    })

    it("lists a row under a label failing its check among the damaged, and the rest as ever", async () => {
      const { vaultDB, vault } = await storeWith()
      vaultDB._cheat_vaultRowsOf(bankScope).set('Not A Label', { garbage: true })
      const { val } = await vaultDB.getBank(bankScope)
      expect(val.vaults).to.deep.equal([vault])
      expect(val.damaged_records.map(({ vaultlabel, am }) => ({ vaultlabel, am }))).to.deep.equal([{ vaultlabel: 'Not A Label', am: 'd' }])
    })
  })

  describe("getVault", () => {
    it("answers the record, its sparse boxes tombstones included, and the rows it set aside", async () => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      const other = boxAt(0, 'life1', { boxlabel: 'other' })
      await vaultDB.putBox(other, { prior: SX.VoidRevision })
      await vaultDB.delBox(boxTombstoneOf(other), { prior: priorOf(other) })
      vaultDB._cheat_boxRowsOf(vaultScope, 'life1').set('rubble', 12)
      const { act, val, world } = await vaultDB.getVault(vaultScope)
      expect(act).to.eq('got')
      expect(world).to.deep.equal(vault)
      expect(val?.gate).to.deep.equal(vault.gate)
      expect(val?.boxes).to.deep.equal([SX.boxSparse.parse(box), SX.boxSparse.parse(boxTombstoneOf(other))])
      expect(val?.damaged_records.map(({ boxlabel, am }) => ({ boxlabel, am }))).to.deep.equal([{ boxlabel: 'rubble', am: 'd' }])
    })

    it("says format_mismatch of a box row of a later fmt", async () => {
      const { vaultDB, vault } = await storeWith()
      vaultDB._cheat_boxRowsOf(vaultScope, vault.vault_tok).set('newer', { fmt: SX.BoxFormat + 1 })
      const { val } = await vaultDB.getVault(vaultScope)
      expect(val?.damaged_records.map(({ boxlabel, damagekind }) => ({ boxlabel, damagekind }))).to.deep.equal([{ boxlabel: 'newer', damagekind: 'format_mismatch' }])
    })

    it("lists a box under a label failing its check among the damaged", async () => {
      const { vaultDB } = await storeWith({ box: true })
      vaultDB._cheat_boxRowsOf(vaultScope, 'life1').set('Not A Label', { garbage: true })
      const { val } = await vaultDB.getVault(vaultScope)
      expect(val?.boxes.map(({ boxlabel }) => boxlabel)).to.deep.equal(['openai'])
      expect(val?.damaged_records.map(({ boxlabel, am }) => ({ boxlabel, am }))).to.deep.equal([{ boxlabel: 'Not A Label', am: 'd' }])
    })

    it("over a void row, refuses vault_empty with no row, and answers null with ifAbsent nil", async () => {
      const vaultDB = new MemoryVaultDB()
      const answer = await vaultDB.tryGetVault(vaultScope)
      expect(answer).to.deep.include({ ok: false, act: 'vault_empty', dbhas: null })
      expect(answer.world).to.deep.equal(SX.sentinelVaultOf(vaultScope))
      const nil = await vaultDB.getVault(vaultScope, { ifAbsent: 'nil' })
      expect(nil).to.deep.include({ act: 'gotvoid', val: null, dbhas: null })
    })

    it("over a tombstone, refuses vault_gone holding it, and answers null with ifAbsent nil", async () => {
      const { vaultDB, vault } = await storeWith()
      const tombstone = vaultTombstoneOf(vault)
      await vaultDB.delVault(tombstone, { prior: priorOf(vault) })
      const answer = await vaultDB.tryGetVault(vaultScope)
      expect(answer).to.deep.include({ ok: false, act: 'vault_gone', dbhas: tombstone, world: tombstone })
      expect(await vaultDB.getVault(vaultScope, { ifAbsent: 'nil' })).to.deep.include({ act: 'gotgone', val: null, dbhas: tombstone, world: tombstone })
    })

    it("refuses damaged_row for a row failing validation, and newer_format for one of a later fmt, with no world and the request's safe metadata", async () => {
      const { vaultDB } = await storeWith()
      vaultDB._cheat_vaultRowsOf(bankScope).set('main', { garbage: true })
      expect(await vaultDB.tryGetVault(vaultScope)).to.deep.include({ ok: false, act: 'damaged_row', world: null, req_params: vaultScope })
      vaultDB._cheat_vaultRowsOf(bankScope).set('main', { fmt: SX.VaultFormat + 1 })
      expect(await vaultDB.tryGetVault(vaultScope)).to.deep.include({ ok: false, act: 'newer_format', world: null })
    })
  })

  describe("getBox", () => {
    it("answers the record, and the vault row as world", async () => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      expect(await vaultDB.getBox({ ...boxscope, vault_tok: 'life1' })).to.deep.include({ ok: true, act: 'got', val: box, world: vault })
    })

    it("over a void box row, refuses absent_box as void, and answers null with ifAbsent nil", async () => {
      const { vaultDB, vault } = await storeWith()
      const answer = await vaultDB.tryGetBox({ ...boxscope, vault_tok: 'life1' })
      expect(answer).to.deep.include({ ok: false, act: 'void', dbhas: null, world: vault })
      expect(answer.err?.refusalkind).to.eq('absent_box')
      expect(await vaultDB.getBox({ ...boxscope, vault_tok: 'life1' }, { ifAbsent: 'nil' })).to.deep.include({ act: 'gotvoid', val: null, dbhas: null, world: vault })
    })

    it("over a tombstoned box row, refuses absent_box as gone, and answers null with ifAbsent nil", async () => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      const tombstone = boxTombstoneOf(box)
      await vaultDB.delBox(tombstone, { prior: priorOf(box) })
      const answer = await vaultDB.tryGetBox({ ...boxscope, vault_tok: 'life1' })
      expect(answer).to.deep.include({ ok: false, act: 'gone', dbhas: tombstone, world: vault })
      expect(await vaultDB.getBox({ ...boxscope, vault_tok: 'life1' }, { ifAbsent: 'nil' })).to.deep.include({ act: 'gotgone', val: null, dbhas: tombstone })
    })

    it("refuses vault_remade under a live row of another vault_tok, holding that row, whatever ifAbsent says", async () => {
      const { vaultDB, vault } = await storeWith({ box: true })
      const answer = await vaultDB.tryGetBox({ ...boxscope, vault_tok: 'oldlife' }, { ifAbsent: 'nil' })
      expect(answer).to.deep.include({ ok: false, act: 'vault_remade', world: vault, dbhas: vault })
    })

    it("refuses vault_empty for a vault_tok no row holds, over no row or another life's tombstone", async () => {
      const vaultDB = new MemoryVaultDB()
      const asked = { ...boxscope, vault_tok: 'oldlife' }
      const sentinel = SX.sentinelVaultOf(vaultScope, 'oldlife')
      expect(await vaultDB.tryGetBox(asked)).to.deep.include({ ok: false, act: 'vault_empty', world: sentinel, dbhas: null })
      const vault = vaultAt()
      await vaultDB.putVault(vault, { prior: SX.VoidRevision })
      await vaultDB.delVault(vaultTombstoneOf(vault), { prior: priorOf(vault) })
      expect(await vaultDB.tryGetBox(asked)).to.deep.include({ ok: false, act: 'vault_empty', world: sentinel, dbhas: null })
    })

    it("refuses vault_gone under this life's tombstone, and damaged_row for a box row failing validation", async () => {
      const { vaultDB, vault } = await storeWith({ box: true })
      vaultDB._cheat_boxRowsOf(vaultScope, 'life1').set('openai', { garbage: true })
      expect(await vaultDB.tryGetBox({ ...boxscope, vault_tok: 'life1' })).to.deep.include({ ok: false, act: 'damaged_row' })
      await vaultDB.delVault(vaultTombstoneOf(vault), { prior: priorOf(vault) })
      expect(await vaultDB.tryGetBox({ ...boxscope, vault_tok: 'life1' })).to.deep.include({ ok: false, act: 'vault_gone' })
    })
  })

  describe("a store's own failure", () => {
    class FailingVaultDB extends MemoryVaultDB {
      protected override doGetBank(): never { throw new Error('socket closed') }
    }

    it("reads as storage_unavailable, the store's error its cause, by a throw and by an answer alike", async () => {
      const vaultDB = new FailingVaultDB()
      await expect(vaultDB.getBank(bankScope)).rejects.toSatisfy((err) => isVaultError(err, 'storage_unavailable'))
      const answer = await vaultDB.tryGetBank(bankScope)
      expect(answer).to.deep.include({ ok: false, act: 'storage_unavailable', world: null, req_params: bankScope, meta: { call: 'getBank' } })
      expect((answer.err?.cause as Error).message).to.eq('socket closed')
    })

    it("a VaultError a store throws passes up unchanged, with the request's safe metadata", async () => {
      class RefusingVaultDB extends MemoryVaultDB {
        protected override doGetBank(): never { throw new VaultError('storage_unavailable', 'Storage is down.') }
      }
      expect(await new RefusingVaultDB().tryGetBank(bankScope)).to.deep.include({ ok: false, act: 'storage_unavailable', req_params: bankScope })
    })
  })

  describe("the plain verb and its try form", () => {
    it("read the same: a refusal's act, world and dbhas in an answer are its meta in the error", async () => {
      const { vaultDB, vault } = await storeWith()
      const rival = vaultAt(0, 'life2')
      const answer = await vaultDB.tryPutVault(rival, { prior: SX.VoidRevision, ifPresent: 'fail' })
      const thrown = await thrownBy(() => vaultDB.putVault(rival, { prior: SX.VoidRevision, ifPresent: 'fail' }))
      expect(isVaultError(thrown, 'camped')).to.be.true
      expect(thrown).to.deep.include({ refusalkind: answer.act })
      expect((thrown as { meta: object }).meta).to.deep.include({ world: vault, dbhas: vault, req_params: answer.req_params, call: 'putVault' })
    })
  })
})
