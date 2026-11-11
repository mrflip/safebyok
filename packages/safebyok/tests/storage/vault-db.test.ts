/** The AdapterVaultDB base class, over a MemoryVaultDB: how it reads a VaultDB's own failure, how a plain verb and its try form agree, and the duck a model takes for a VaultDB. */

import { describe, expect, it } from 'vitest'
import { VaultError, isVaultError } from '../../src/refusals/errors'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import * as SX from '../../src/shapes/shapes-storage'
import { brandedVaultDB } from '../../src/shapes/shapes-vaultish'
import { VaultDBVerbnames } from '../../src/storage/vault-db'
import { bankScope, boxscope, vaultAt, vaultScope } from '../test-helpers/storage-world'

/** Each verb of `vaultDB`, bound, as a client of it would answer them. */
const verbsOf = (vaultDB: MemoryVaultDB): Record<string, unknown> => Object.fromEntries(VaultDBVerbnames.map((verbname) => [verbname, vaultDB[verbname].bind(vaultDB)]))

const thrownBy = async (thunk: () => Promise<unknown>): Promise<unknown> => {
  try { await thunk() } catch (err) { return err }
  return null
}

describe("AdapterVaultDB", () => {
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

  describe("a VaultDB's own failure", () => {
    class FailingVaultDB extends MemoryVaultDB {
      protected override doListVaults(): never { throw new Error('socket closed') }
    }

    it("is refused with the VaultDB's error as the cause, whether thrown or returned in an answer", async () => {
      const vaultDB = new FailingVaultDB()
      await expect(vaultDB.listVaults(bankScope)).rejects.toSatisfy((err) => isVaultError(err, 'storage_unavailable'))
      const answer = await vaultDB.tryListVaults(bankScope)
      expect(answer).to.deep.include({ ok: false, act: 'storage_unavailable', world: null, req_params: bankScope })
      expect(answer.err?.meta).to.deep.include({ call: 'listVaults' })
      expect((answer.err?.cause as Error).message).to.eq('socket closed')
    })

    it("a VaultError a VaultDB throws passes up unchanged, with the request's safe metadata", async () => {
      class RefusingVaultDB extends MemoryVaultDB {
        protected override doListVaults(): never { throw new VaultError('storage_unavailable', 'Storage is down.') }
      }
      expect(await new RefusingVaultDB().tryListVaults(bankScope)).to.deep.include({ ok: false, act: 'storage_unavailable', req_params: bankScope })
    })
  })

  describe("the plain verb and its try form", () => {
    it("agree, except that only the answer carries world and dbhas", async () => {
      const vaultDB = new MemoryVaultDB()
      const vault = vaultAt()
      await vaultDB.putVault(vault, { prior: SX.VoidRevision })
      const rival = vaultAt(0, 'life2')
      const answer = await vaultDB.tryPutVault(rival, { prior: SX.VoidRevision, ifPresent: 'fail' })
      const thrown = await thrownBy(() => vaultDB.putVault(rival, { prior: SX.VoidRevision, ifPresent: 'fail' }))
      expect(isVaultError(thrown, 'camped')).to.be.true
      expect(thrown).to.deep.include({ refusalkind: answer.act })
      const { meta } = thrown as { meta: object }
      expect(meta).to.deep.include({ req_params: answer.req_params, call: 'putVault' })
      expect(meta).to.not.have.any.keys('world', 'dbhas')
      expect(answer).to.deep.include({ world: vault, dbhas: vault })
      expect(JSON.stringify({ ...(thrown as object), meta })).to.not.include(vault.gate.passphrase_wayin.vault_key_wayin_wrapped.ciphertext_b64)
    })
  })

  describe("what a model accepts as a VaultDB", () => {
    const brand = { [Symbol.for('@safebyok/vaultdb')]: true }

    it("accepts a VaultDB, or a client that has the brand and every verb", () => {
      const vaultDB = new MemoryVaultDB()
      expect(brandedVaultDB.parse(vaultDB)).to.eq(vaultDB)
      const client = { ...brand, ...verbsOf(vaultDB) }
      expect(brandedVaultDB.parse(client)).to.eq(client)
    })

    it("refuses a brand without the verbs, the verbs without a brand, or a verb that is no function", () => {
      const verbs = verbsOf(new MemoryVaultDB())
      expect(() => brandedVaultDB.parse(brand)).to.throw(VaultError).with.property('refusalkind', 'bad_option')
      expect(() => brandedVaultDB.parse(verbs)).to.throw(VaultError).with.property('refusalkind', 'bad_option')
      expect(() => brandedVaultDB.parse({ ...brand, ...verbs, watch: 'soon' })).to.throw(VaultError).with.property('refusalkind', 'bad_option')
    })
  })
})
