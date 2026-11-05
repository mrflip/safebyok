/** The VaultDB's puts and gate verbs, over a MemoryVaultDB: what each does to the rows, and what each refuses by the row it finds. */

import { describe, expect, it } from 'vitest'
import { isVaultError } from '../../src/refusals/errors'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import * as SX from '../../src/shapes/shapes-storage'
import type { VaultRecord } from '../../src/shapes/shapes-storage'
import { bankScope, vaultScope, boxscope, Now, passphraseWayin, passkeyWayin, vaultAt, boxAt, vaultTombstoneOf, boxTombstoneOf, priorOf, stale, storeWith } from '../test-helpers/storage-world'

/** A gate verb's params: a vault record holding a gate that holds the wayin. */
const paramsOf = (vault: VaultRecord, gate: object) => ({ ...vault, gate }) as never

/** A box deleted, and the rebirth that would stand on its tombstone. */
const withBoxTombstone = async () => {
  const { vaultDB, vault, box } = await storeWith({ box: true })
  const tombstone = boxTombstoneOf(box)
  await vaultDB.delBox(tombstone, { prior: priorOf(box) })
  return { vaultDB, vault, tombstone, reborn: boxAt(tombstone.revision_seq + 1, 'life1', { box_tok: 'box2' }) }
}

describe("MemoryVaultDB", () => {
  describe("putVault", () => {
    it("is born over a void row at the sentinel prior, seq 0, and reborn over a tombstone at its revision", async () => {
      const { vaultDB, vault } = await storeWith()
      expect(await vaultDB.getVault(vaultScope)).to.deep.include({ act: 'got', world: vault })
      const tombstone = vaultTombstoneOf(vault)
      await vaultDB.delVault(tombstone, { prior: priorOf(vault) })
      const reborn = vaultAt(2, 'life2')
      expect(await vaultDB.putVault(reborn, { prior: priorOf(tombstone) })).to.deep.include({ act: 'reborn', val: reborn, world: reborn })
    })

    it("refuses a live row at its revision: a vault row moves only by a gate verb", async () => {
      const { vaultDB, vault } = await storeWith()
      const next = vaultAt(1)
      await expect(vaultDB.putVault(next, { prior: priorOf(vault) })).rejects.toSatisfy((err) => isVaultError(err, 'camped'))
      await expect(vaultDB.putVault(next, { prior: priorOf(vault), ifPresent: 'repl' } as never)).rejects.toSatisfy((err) => isVaultError(err, 'invalid_input'))
    })

    it("over a live row, ifPresent get answers it as declined, and fail refuses camped, neither saving", async () => {
      const { vaultDB, vault } = await storeWith()
      const rival = vaultAt(0, 'life2')
      expect(await vaultDB.putVault(rival, { prior: SX.VoidRevision, ifPresent: 'get' })).to.deep.include({ act: 'declined', val: vault, world: vault, req_params: { ...vaultScope, vault_tok: 'life2', revision_tok: rival.revision_tok, revision_seq: 0, prior: SX.VoidRevision } })
      expect(await vaultDB.tryPutVault(rival, { prior: SX.VoidRevision, ifPresent: 'fail' })).to.deep.include({ ok: false, act: 'camped', dbhas: vault, world: vault })
      expect(await vaultDB.tryPutVault(vaultAt(1), { prior: priorOf(vault), ifPresent: 'fail' })).to.deep.include({ ok: false, act: 'camped', dbhas: vault })
      expect(await vaultDB.getVault(vaultScope)).to.deep.include({ world: vault })
    })

    it("refuses camped over a live row whatever its revision, holding the row", async () => {
      const { vaultDB, vault } = await storeWith()
      const next = vaultAt(8)
      expect(await vaultDB.tryPutVault(next, { prior: stale })).to.deep.include({ ok: false, act: 'camped', dbhas: vault, world: vault })
    })

    it("refuses stale_write when the prior names a row that is void", async () => {
      const vaultDB = new MemoryVaultDB()
      expect(await vaultDB.tryPutVault(vaultAt(8), { prior: stale })).to.deep.include({ ok: false, act: 'stale_write', dbhas: null })
    })

    it("refuses invalid_input for a record's revision_seq not one past its prior's, and for a bad field, quoting none of it", async () => {
      const vaultDB = new MemoryVaultDB()
      expect(await vaultDB.tryPutVault(vaultAt(3), { prior: SX.VoidRevision })).to.deep.include({ ok: false, act: 'invalid_input' })
      const secretish = 'hunter2'
      const answer = await vaultDB.tryPutVault({ ...vaultAt(), vaultlabel: `${secretish}^^bad label` }, { prior: SX.VoidRevision })
      expect(answer).to.deep.include({ ok: false, act: 'invalid_input', req_params: {} })
      expect(JSON.stringify([answer.err?.message, answer.req_params])).to.not.include(secretish)
    })
  })

  describe("a birth", () => {
    it("names the whole sentinel as its prior, so a void row takes no record past revision_seq 0", async () => {
      const vaultDB = new MemoryVaultDB()
      const answer = await vaultDB.tryPutVault(vaultAt(6), { prior: { revision_tok: SX.VoidRevisionTok, revision_seq: 5 } })
      expect(answer).to.deep.include({ ok: false, act: 'stale_write', dbhas: null })
      expect(vaultDB._cheat_vaultRowsOf(bankScope).size).to.eq(0)
    })
  })

  describe("putBox", () => {
    it("is born, replaced and reborn by the row it lands on, with the vault row as world", async () => {
      const { vaultDB, vault, box } = await storeWith()
      expect(await vaultDB.putBox(box, { prior: SX.VoidRevision })).to.deep.include({ act: 'born', val: box, world: vault })
      const next = boxAt(1)
      expect(await vaultDB.putBox(next, { prior: priorOf(box) })).to.deep.include({ act: 'replaced', val: next, world: vault })
      const tombstone = boxTombstoneOf(next)
      await vaultDB.delBox(tombstone, { prior: priorOf(next) })
      const reborn = boxAt(3, 'life1', { box_tok: 'box2' })
      expect(await vaultDB.putBox(reborn, { prior: priorOf(tombstone) })).to.deep.include({ act: 'reborn', val: reborn, world: vault })
    })

    it("over a live row, ifPresent get answers it as declined, and fail refuses camped", async () => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      const next = boxAt(1)
      expect(await vaultDB.putBox(next, { prior: priorOf(box), ifPresent: 'get' })).to.deep.include({ act: 'declined', val: box, world: vault })
      expect(await vaultDB.tryPutBox(next, { prior: priorOf(box), ifPresent: 'fail' })).to.deep.include({ ok: false, act: 'camped', dbhas: box, world: vault })
    })

    it("refuses stale_write over a row moved past its prior, holding the row and leaving it", async () => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      expect(await vaultDB.tryPutBox(boxAt(8), { prior: stale })).to.deep.include({ ok: false, act: 'stale_write', dbhas: box, world: vault })
      expect(await vaultDB.getBox({ ...boxscope, vault_tok: 'life1' })).to.deep.include({ val: box })
    })

    it("refuses vault_mismatch under a vault_tok that is not the live one's, and vault_gone under this life's tombstone", async () => {
      const { vaultDB, vault, box } = await storeWith()
      expect(await vaultDB.tryPutBox(boxAt(0, 'oldlife'), { prior: SX.VoidRevision })).to.deep.include({ ok: false, act: 'vault_mismatch', dbhas: vault })
      await vaultDB.delVault(vaultTombstoneOf(vault), { prior: priorOf(vault) })
      expect(await vaultDB.tryPutBox(box, { prior: SX.VoidRevision })).to.deep.include({ ok: false, act: 'vault_gone' })
    })

    it("refuses box_too_large over maxRecordBytes, and vault_full for a new box past maxBoxes", async () => {
      const vaultDB = new MemoryVaultDB({ maxRecordBytes: 2000, maxBoxes: 1 })
      await vaultDB.putVault(vaultAt(), { prior: SX.VoidRevision })
      const heavy = boxAt(0, 'life1', { sidecar: { memo: 'x'.repeat(2000) } })
      expect(await vaultDB.tryPutBox(heavy, { prior: SX.VoidRevision })).to.deep.include({ ok: false, act: 'box_too_large' })
      await vaultDB.putBox(boxAt(), { prior: SX.VoidRevision })
      const full = await vaultDB.tryPutBox(boxAt(0, 'life1', { boxlabel: 'other' }), { prior: SX.VoidRevision })
      expect(full).to.deep.include({ ok: false, act: 'vault_full' })
      expect(full.err?.meta?.capacity?.boxes).to.deep.equal({ used: 1, max: 1 })
      expect(full.req_params).to.include({ boxlabel: 'other' })
    })
  })

  describe("what a put hears, by the row it finds and its ifAbsent and ifPresent", () => {
    const anyIfPresent = ['repl', 'fail', 'get'] as const
    const anyIfAbsent  = ['add', 'fail'] as const

    it.each(anyIfPresent)("refuses absent_box over a void box row with ifAbsent fail and ifPresent %s", async (ifPresent) => {
      const { vaultDB, vault, box } = await storeWith()
      expect(await vaultDB.tryPutBox(box, { prior: SX.VoidRevision, ifAbsent: 'fail', ifPresent })).to.deep.include({ ok: false, act: 'void', dbhas: null, world: vault })
      expect(vaultDB._cheat_boxRowsOf(boxscope, 'life1').size).to.eq(0)
    })

    it.each(anyIfPresent)("refuses absent_box over a box tombstone with ifAbsent fail and ifPresent %s, at its revision or not", async (ifPresent) => {
      const { vaultDB, vault, tombstone, reborn } = await withBoxTombstone()
      for (const prior of [priorOf(tombstone), { ...stale, revision_seq: reborn.revision_seq - 1 }]) {
        const answer = await vaultDB.tryPutBox(reborn, { prior, ifAbsent: 'fail', ifPresent })
        expect(answer).to.deep.include({ ok: false, act: 'gone', dbhas: tombstone, world: vault })
        expect(isVaultError(answer.err, 'absent_box')).to.be.true
      }
    })

    it.each(anyIfAbsent)("refuses camped over a live box with ifAbsent %s and ifPresent fail, at its revision or not", async (ifAbsent) => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      expect(await vaultDB.tryPutBox(boxAt(1), { prior: priorOf(box), ifAbsent, ifPresent: 'fail' })).to.deep.include({ ok: false, act: 'camped', dbhas: box, world: vault })
      expect(await vaultDB.tryPutBox(boxAt(8), { prior: stale, ifAbsent, ifPresent: 'fail' })).to.deep.include({ ok: false, act: 'camped', dbhas: box, world: vault })
    })

    it.each(anyIfAbsent)("answers declined with the live box under ifAbsent %s and ifPresent get, at its revision or not", async (ifAbsent) => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      expect(await vaultDB.putBox(boxAt(1), { prior: priorOf(box), ifAbsent, ifPresent: 'get' })).to.deep.include({ act: 'declined', val: box, world: vault })
      expect(await vaultDB.putBox(boxAt(8), { prior: stale, ifAbsent, ifPresent: 'get' })).to.deep.include({ act: 'declined', val: box, world: vault })
    })

    it.each(anyIfAbsent)("replaces a live box at its revision under ifAbsent %s and ifPresent repl, and refuses stale_write past it", async (ifAbsent) => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      const next = boxAt(1)
      expect(await vaultDB.tryPutBox(boxAt(8), { prior: stale, ifAbsent, ifPresent: 'repl' })).to.deep.include({ ok: false, act: 'stale_write', dbhas: box, world: vault })
      expect(await vaultDB.putBox(next, { prior: priorOf(box), ifAbsent, ifPresent: 'repl' })).to.deep.include({ act: 'replaced', val: next, world: vault })
    })

    it.each(anyIfPresent)("adds over a void box row or a tombstone at its revision under ifAbsent add and ifPresent %s", async (ifPresent) => {
      const { vaultDB, vault, box } = await storeWith()
      expect(await vaultDB.putBox(box, { prior: SX.VoidRevision, ifAbsent: 'add', ifPresent })).to.deep.include({ act: 'born', val: box, world: vault })
      const { vaultDB: other, tombstone, reborn } = await withBoxTombstone()
      expect(await other.putBox(reborn, { prior: priorOf(tombstone), ifAbsent: 'add', ifPresent })).to.deep.include({ act: 'reborn', val: reborn })
    })

    it.each(anyIfPresent)("refuses stale_write over a void box row or a tombstone a prior misses, under ifAbsent add and ifPresent %s", async (ifPresent) => {
      const { vaultDB } = await storeWith()
      expect(await vaultDB.tryPutBox(boxAt(8), { prior: stale, ifAbsent: 'add', ifPresent })).to.deep.include({ ok: false, act: 'stale_write', dbhas: null })
      const { vaultDB: other, tombstone, reborn } = await withBoxTombstone()
      const prior = { ...stale, revision_seq: reborn.revision_seq - 1 }
      expect(await other.tryPutBox(reborn, { prior, ifAbsent: 'add', ifPresent })).to.deep.include({ ok: false, act: 'stale_write', dbhas: tombstone })
    })

    it("takes ifAbsent add by default, and refuses invalid_input for fetch's nil", async () => {
      const { vaultDB, vault, box } = await storeWith()
      expect(await vaultDB.tryPutBox(box, { prior: SX.VoidRevision, ifAbsent: 'nil' } as never)).to.deep.include({ ok: false, act: 'invalid_input' })
      expect(await vaultDB.tryPutVault(vaultAt(1), { prior: priorOf(vault), ifAbsent: 'nil' } as never)).to.deep.include({ ok: false, act: 'invalid_input' })
      expect(await vaultDB.putBox(box, { prior: SX.VoidRevision })).to.deep.include({ act: 'born' })
    })

    it.each(['fail', 'get'] as const)("refuses vault_empty over a void vault row and vault_gone over a tombstone, with ifAbsent fail and ifPresent %s", async (ifPresent) => {
      const empty = new MemoryVaultDB()
      const answer = await empty.tryPutVault(vaultAt(), { prior: SX.VoidRevision, ifAbsent: 'fail', ifPresent })
      expect(answer).to.deep.include({ ok: false, act: 'vault_empty', dbhas: null })
      expect(empty._cheat_vaultRowsOf(bankScope).size).to.eq(0)
      const { vaultDB, vault } = await storeWith()
      const tombstone = vaultTombstoneOf(vault)
      await vaultDB.delVault(tombstone, { prior: priorOf(vault) })
      expect(await vaultDB.tryPutVault(vaultAt(2, 'life2'), { prior: priorOf(tombstone), ifAbsent: 'fail', ifPresent })).to.deep.include({ ok: false, act: 'vault_gone', dbhas: tombstone, world: tombstone })
    })

    it("over a live vault row, ifAbsent changes nothing: fail is camped and get is declined", async () => {
      const { vaultDB, vault } = await storeWith()
      expect(await vaultDB.tryPutVault(vaultAt(1), { prior: priorOf(vault), ifAbsent: 'fail', ifPresent: 'fail' })).to.deep.include({ ok: false, act: 'camped', dbhas: vault })
      expect(await vaultDB.putVault(vaultAt(1), { prior: priorOf(vault), ifAbsent: 'fail', ifPresent: 'get' })).to.deep.include({ act: 'declined', val: vault })
    })

    it("lands a gate verb, which takes no ifAbsent, over the live row it moves", async () => {
      const { vaultDB, vault } = await storeWith()
      expect(await vaultDB.tryRevokePasskey(paramsOf(vault, { passkey_wayin: null }))).to.deep.include({ ok: true })
    })
  })

  describe("box writes under a vault row failing its checks", () => {
    it("refuse as a read does, and change nothing", async () => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      const boxRows = vaultDB._cheat_boxRowsOf(vaultScope, 'life1')
      vaultDB._cheat_vaultRowsOf(bankScope).set('main', { ...vault, gate: 'rubble' })
      const nextBox = boxAt(1)
      expect(await vaultDB.tryPutBox(nextBox, { prior: priorOf(box) })).to.deep.include({ ok: false, act: 'damaged_record' })
      expect(await vaultDB.tryDelBox(boxTombstoneOf(box), { prior: priorOf(box) })).to.deep.include({ ok: false, act: 'damaged_record' })
      vaultDB._cheat_vaultRowsOf(bankScope).set('main', { ...vault, fmt: SX.VaultFormat + 1 })
      expect(await vaultDB.tryPutBox(nextBox, { prior: priorOf(box) })).to.deep.include({ ok: false, act: 'newer_format' })
      expect(boxRows.get('openai')).to.deep.equal(box)
    })
  })

  describe("gate verbs", () => {
    it("replacePassphrase lays the wayin on, moves gate_epoch and the revision each one up, and leaves the rest as stored", async () => {
      const { vaultDB, vault } = await storeWith()
      const wayin = { ...passphraseWayin, device_id: 'd2' }
      const { act, val, world } = await vaultDB.replacePassphrase(paramsOf(vault, { passphrase_wayin: wayin }))
      expect(act).to.eq('replaced')
      expect(world).to.deep.equal(val)
      expect(val).to.deep.include({ ...vaultScope, vault_tok: 'life1', registered_at: Now, fmt: SX.VaultFormat, revision_seq: 1, written_at: Now + 1 })
      expect(val.revision_tok).to.not.eq(vault.revision_tok)
      expect(val.gate).to.deep.equal({ gate_epoch: 2, passphrase_wayin: wayin, passkey_wayin: null })
      expect(await vaultDB.getVault(vaultScope)).to.deep.include({ world: val })
    })

    it("addPasskey adds over no passkey, and refuses camped over one held, with the stored record", async () => {
      const { vaultDB, vault } = await storeWith()
      const { act, val } = await vaultDB.addPasskey(paramsOf(vault, { passkey_wayin: passkeyWayin }))
      expect(act).to.eq('added')
      expect(val.gate).to.deep.equal({ gate_epoch: 2, passphrase_wayin: passphraseWayin, passkey_wayin: passkeyWayin })
      expect(await vaultDB.tryAddPasskey(paramsOf(val, { passkey_wayin: { ...passkeyWayin, device_id: 'd2' } }))).to.deep.include({ ok: false, act: 'camped', dbhas: val, world: val })
    })

    it("revokePasskey nulls a passkey held, and over none answers revoked with nothing moved", async () => {
      const { vaultDB, vault } = await storeWith()
      const { val: holding } = await vaultDB.addPasskey(paramsOf(vault, { passkey_wayin: passkeyWayin }))
      const { act, val } = await vaultDB.revokePasskey(paramsOf(holding, { passkey_wayin: null }))
      expect(act).to.eq('revoked')
      expect(val.gate).to.deep.equal({ gate_epoch: 3, passphrase_wayin: passphraseWayin, passkey_wayin: null })
      expect(await vaultDB.revokePasskey(paramsOf(val, { passkey_wayin: null }))).to.deep.include({ act: 'revoked', val, world: val })
      expect(await vaultDB.getVault(vaultScope)).to.deep.include({ world: val })
    })

    it("a gate verb refuses stale_write when the row moved past its params' revision, even a verb its row would otherwise refuse", async () => {
      const { vaultDB, vault } = await storeWith()
      const { val: moved } = await vaultDB.addPasskey(paramsOf(vault, { passkey_wayin: passkeyWayin }))
      expect(await vaultDB.tryAddPasskey(paramsOf(vault, { passkey_wayin: passkeyWayin }))).to.deep.include({ ok: false, act: 'stale_write', dbhas: moved })
      expect(await vaultDB.tryRevokePasskey(paramsOf(vault, { passkey_wayin: null }))).to.deep.include({ ok: false, act: 'stale_write', dbhas: moved })
      expect(await vaultDB.tryReplacePassphrase(paramsOf(vault, { passphrase_wayin: passphraseWayin }))).to.deep.include({ ok: false, act: 'stale_write', dbhas: moved })
    })

    it("refuses gate_issue for a verb touching the other wayin, and for params that disagree with the row", async () => {
      const { vaultDB, vault } = await storeWith()
      expect(await vaultDB.tryReplacePassphrase(paramsOf(vault, { passphrase_wayin: passphraseWayin, passkey_wayin: passkeyWayin }))).to.deep.include({ ok: false, act: 'gate_issue', world: vault })
      expect(await vaultDB.tryAddPasskey(paramsOf(vault, { passkey_wayin: passkeyWayin, passphrase_wayin: passphraseWayin }))).to.deep.include({ ok: false, act: 'gate_issue' })
      expect(await vaultDB.tryRevokePasskey(paramsOf(vault, { passkey_wayin: null, passphrase_wayin: passphraseWayin }))).to.deep.include({ ok: false, act: 'gate_issue' })
      expect(await vaultDB.tryReplacePassphrase(paramsOf({ ...vault, registered_at: Now + 5 }, { passphrase_wayin: passphraseWayin }))).to.deep.include({ ok: false, act: 'gate_issue' })
      expect(await vaultDB.getVault(vaultScope)).to.deep.include({ world: vault })
    })

    it("refuses vault_gone under this life's tombstone, and vault_mismatch for another life", async () => {
      const { vaultDB, vault } = await storeWith()
      const oldLife = vaultAt(0, 'oldlife')
      expect(await vaultDB.tryReplacePassphrase(paramsOf(oldLife, { passphrase_wayin: passphraseWayin }))).to.deep.include({ ok: false, act: 'vault_mismatch', dbhas: vault })
      await vaultDB.delVault(vaultTombstoneOf(vault), { prior: priorOf(vault) })
      expect(await vaultDB.tryReplacePassphrase(paramsOf(vault, { passphrase_wayin: passphraseWayin }))).to.deep.include({ ok: false, act: 'vault_gone' })
    })

    it("carries no wayin in its request's safe metadata", async () => {
      const { vaultDB, vault } = await storeWith()
      const { req_params } = await vaultDB.replacePassphrase(paramsOf(vault, { passphrase_wayin: passphraseWayin }))
      expect(Object.keys(req_params)).to.not.include('gate')
    })
  })
})
