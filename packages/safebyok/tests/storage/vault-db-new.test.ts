import { describe, expect, it } from 'vitest'
import { VaultError, isVaultError } from '../../src/errors'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import type { BoxRecord, BoxTombstone, Revision, VaultRecord, VaultTombstone } from '../../src/storage/vault-db-shapes'
import * as VS from '../../src/storage/vault-db-shapes'

const bankScope  = { applabel: 'acme', user_id: 'u1' }
const vaultScope = { ...bankScope, vaultlabel: 'main' }
const boxscope   = { ...vaultScope, boxlabel: 'openai' }
const Now = Date.UTC(2026, 9, 15)

const ciphered = { cipher_iv_b64: 'aXY', ciphertext_b64: 'Y3Q' }

const passphraseWayin = VS.passphraseWayin.parse({ wayinkind: 'passphrase', key_deriver_label: 'test', salt_b64: 'c2FsdA', device_id: 'd1', registered_at: Now, vault_key_wayin_wrapped: ciphered })
const passkeyWayin = VS.passkeyWayin.parse({ wayinkind: 'passkey', credential_id: 'cred1', prf_salt_b64: 'A'.repeat(43), device_id: 'd1', registered_at: Now, vault_key_wayin_wrapped: ciphered })

const vaultAt = (revision_seq = 0, vault_tok = 'life1'): VaultRecord => VS.vaultRecord.parse({
  ...vaultScope, fmt: VS.VaultFormat, revision_tok: `vrev${String(revision_seq)}`, revision_seq, registered_at: Now, written_at: Now, am: 'a', vault_tok,
  gate: { gate_epoch: 1, passphrase_wayin: passphraseWayin, passkey_wayin: null },
})

const boxAt = (revision_seq = 0, vault_tok = 'life1', extra: object = {}): BoxRecord => VS.boxRecord.parse({
  ...boxscope, fmt: VS.BoxFormat, revision_tok: `brev${String(revision_seq)}`, revision_seq, registered_at: Now, written_at: Now, am: 'a', vault_tok, box_tok: 'box1',
  whisper_codec: 'json_v1', whisper_schema_version: 1, sidecar: {}, box_key_wrapped: ciphered, whisper_ciphered: ciphered,
  ...extra,
})

const tombstoneFieldsOf = ({ revision_tok, revision_seq }: Revision) => ({ revision_tok: `${revision_tok}x`, revision_seq: revision_seq + 1, am: 'x' as const })
const vaultTombstoneOf = (record: VaultRecord): VaultTombstone => VS.vaultTombstone.parse({ ...VS.vaultSparse.parse(record), ...tombstoneFieldsOf(record) })
const boxTombstoneOf = (record: BoxRecord): BoxTombstone => VS.boxTombstone.parse({ ...VS.boxSparse.parse(record), ...tombstoneFieldsOf(record) })

const thrownBy = async (thunk: () => Promise<unknown>): Promise<unknown> => {
  try { await thunk() } catch (err) { return err }
  return null
}

/** A gate verb's params: a vault record holding a gate that holds the wayin. */
const paramsOf = (vault: VaultRecord, gate: object) => ({ ...vault, gate }) as never

const priorOf = VS.revisionOf
const stale: Revision = { revision_tok: 'nope', revision_seq: 7 }

/** A store holding a live vault, and a live box when asked. */
const storeWith = async (opts: { box?: boolean } = {}) => {
  const vaultDB = new MemoryVaultDB({ clock: { now: () => Now + 1 } })
  const vault = vaultAt()
  await vaultDB.putVault(vault, { prior: VS.NeverStored })
  const box = boxAt()
  if (opts.box) { await vaultDB.putBox(box, { prior: VS.NeverStored }) }
  return { vaultDB, vault, box }
}

describe("MemoryVaultDB", () => {
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
        { vaultlabel: 'rubble', am: 'd', revision_seq: VS.NeverStoredSeq, vault_tok: VS.NeverStoredTok },
      ])
      for (const damaged of val.damaged_records) { expect(VS.vaultSparse.safeParse(damaged).success).to.be.true }
    })
  })

  describe("getVault", () => {
    it("answers the record, its sparse boxes tombstones included, and the rows it set aside", async () => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      const other = boxAt(0, 'life1', { boxlabel: 'other' })
      await vaultDB.putBox(other, { prior: VS.NeverStored })
      await vaultDB.delBox(boxTombstoneOf(other), { prior: priorOf(other) })
      vaultDB._cheat_boxRowsOf(vaultScope, 'life1').set('rubble', 12)
      const { act, val, world } = await vaultDB.getVault(vaultScope)
      expect(act).to.eq('got')
      expect(world).to.deep.equal(vault)
      expect(val?.gate).to.deep.equal(vault.gate)
      expect(val?.boxes).to.deep.equal([VS.boxSparse.parse(box), VS.boxSparse.parse(boxTombstoneOf(other))])
      expect(val?.damaged_records.map(({ boxlabel, am }) => ({ boxlabel, am }))).to.deep.equal([{ boxlabel: 'rubble', am: 'd' }])
    })

    it("over a void row, refuses vault_empty with no row, and answers null with ifAbsent nil", async () => {
      const vaultDB = new MemoryVaultDB()
      const answer = await vaultDB.tryGetVault(vaultScope)
      expect(answer).to.deep.include({ ok: false, act: 'vault_empty', dbhas: null })
      expect(answer.world).to.deep.equal(VS.sentinelVaultOf(vaultScope))
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

    it("refuses damaged_record for a row failing validation, and newer_format for one of a later fmt, with no world and the request's safe metadata", async () => {
      const { vaultDB } = await storeWith()
      vaultDB._cheat_vaultRowsOf(bankScope).set('main', { garbage: true })
      expect(await vaultDB.tryGetVault(vaultScope)).to.deep.include({ ok: false, act: 'damaged_record', world: null, req_params: vaultScope })
      vaultDB._cheat_vaultRowsOf(bankScope).set('main', { fmt: VS.VaultFormat + 1 })
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

    it("refuses vault_mismatch under a live row of another vault_tok, holding that row, whatever ifAbsent says", async () => {
      const { vaultDB, vault } = await storeWith({ box: true })
      const answer = await vaultDB.tryGetBox({ ...boxscope, vault_tok: 'oldlife' }, { ifAbsent: 'nil' })
      expect(answer).to.deep.include({ ok: false, act: 'vault_mismatch', world: vault, dbhas: vault })
    })

    it("refuses vault_empty for a vault_tok no row holds, over no row or another life's tombstone", async () => {
      const vaultDB = new MemoryVaultDB()
      const asked = { ...boxscope, vault_tok: 'oldlife' }
      const sentinel = VS.sentinelVaultOf(vaultScope, 'oldlife')
      expect(await vaultDB.tryGetBox(asked)).to.deep.include({ ok: false, act: 'vault_empty', world: sentinel, dbhas: null })
      const vault = vaultAt()
      await vaultDB.putVault(vault, { prior: VS.NeverStored })
      await vaultDB.delVault(vaultTombstoneOf(vault), { prior: priorOf(vault) })
      expect(await vaultDB.tryGetBox(asked)).to.deep.include({ ok: false, act: 'vault_empty', world: sentinel, dbhas: null })
    })

    it("refuses vault_gone under this life's tombstone, and damaged_record for a box row failing validation", async () => {
      const { vaultDB, vault } = await storeWith({ box: true })
      vaultDB._cheat_boxRowsOf(vaultScope, 'life1').set('openai', { garbage: true })
      expect(await vaultDB.tryGetBox({ ...boxscope, vault_tok: 'life1' })).to.deep.include({ ok: false, act: 'damaged_record' })
      await vaultDB.delVault(vaultTombstoneOf(vault), { prior: priorOf(vault) })
      expect(await vaultDB.tryGetBox({ ...boxscope, vault_tok: 'life1' })).to.deep.include({ ok: false, act: 'vault_gone' })
    })
  })

  describe("putVault", () => {
    it("is born over a void row at the sentinel prior, seq 0, and reborn over a tombstone at its revision", async () => {
      const { vaultDB, vault } = await storeWith()
      expect(await vaultDB.getVault(vaultScope)).to.deep.include({ act: 'got', world: vault })
      const tombstone = vaultTombstoneOf(vault)
      await vaultDB.delVault(tombstone, { prior: priorOf(vault) })
      const reborn = vaultAt(2, 'life2')
      expect(await vaultDB.putVault(reborn, { prior: priorOf(tombstone) })).to.deep.include({ act: 'reborn', val: reborn, world: reborn })
    })

    it("replaces a live row at its revision", async () => {
      const { vaultDB, vault } = await storeWith()
      const next = vaultAt(1)
      expect(await vaultDB.putVault(next, { prior: priorOf(vault) })).to.deep.include({ act: 'replaced', val: next, world: next })
    })

    it("over a live row, ifPresent get answers it as declined, and fail refuses camped, neither saving", async () => {
      const { vaultDB, vault } = await storeWith()
      const rival = vaultAt(0, 'life2')
      expect(await vaultDB.putVault(rival, { prior: VS.NeverStored, ifPresent: 'get' })).to.deep.include({ act: 'declined', val: vault, world: vault, req_params: { ...vaultScope, vault_tok: 'life2', revision_tok: rival.revision_tok, revision_seq: 0, prior: VS.NeverStored } })
      expect(await vaultDB.tryPutVault(rival, { prior: VS.NeverStored, ifPresent: 'fail' })).to.deep.include({ ok: false, act: 'camped', dbhas: vault, world: vault })
      expect(await vaultDB.tryPutVault(vaultAt(1), { prior: priorOf(vault), ifPresent: 'fail' })).to.deep.include({ ok: false, act: 'camped', dbhas: vault })
      expect(await vaultDB.getVault(vaultScope)).to.deep.include({ world: vault })
    })

    it("refuses stale_write over a row moved past its prior, holding the row", async () => {
      const { vaultDB, vault } = await storeWith()
      const next = vaultAt(8)
      expect(await vaultDB.tryPutVault(next, { prior: stale })).to.deep.include({ ok: false, act: 'stale_write', dbhas: vault, world: vault })
    })

    it("refuses stale_write when the prior names a row that is void", async () => {
      const vaultDB = new MemoryVaultDB()
      expect(await vaultDB.tryPutVault(vaultAt(8), { prior: stale })).to.deep.include({ ok: false, act: 'stale_write', dbhas: null })
    })

    it("refuses invalid_input for a record's revision_seq not one past its prior's, and for a bad field, quoting none of it", async () => {
      const vaultDB = new MemoryVaultDB()
      expect(await vaultDB.tryPutVault(vaultAt(3), { prior: VS.NeverStored })).to.deep.include({ ok: false, act: 'invalid_input' })
      const secretish = 'hunter2'
      const answer = await vaultDB.tryPutVault({ ...vaultAt(), vaultlabel: `${secretish}^^bad label` }, { prior: VS.NeverStored })
      expect(answer).to.deep.include({ ok: false, act: 'invalid_input', req_params: {} })
      expect(JSON.stringify([answer.err?.message, answer.req_params])).to.not.include(secretish)
    })
  })

  describe("a birth", () => {
    it("names the whole sentinel as its prior, so a void row takes no record past revision_seq 0", async () => {
      const vaultDB = new MemoryVaultDB()
      const answer = await vaultDB.tryPutVault(vaultAt(6), { prior: { revision_tok: VS.NeverStoredTok, revision_seq: 5 } })
      expect(answer).to.deep.include({ ok: false, act: 'stale_write', dbhas: null })
      expect(vaultDB._cheat_vaultRowsOf(bankScope).size).to.eq(0)
    })
  })

  describe("putBox", () => {
    it("is born, replaced and reborn by the row it lands on, with the vault row as world", async () => {
      const { vaultDB, vault, box } = await storeWith()
      expect(await vaultDB.putBox(box, { prior: VS.NeverStored })).to.deep.include({ act: 'born', val: box, world: vault })
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
      expect(await vaultDB.tryPutBox(boxAt(0, 'oldlife'), { prior: VS.NeverStored })).to.deep.include({ ok: false, act: 'vault_mismatch', dbhas: vault })
      await vaultDB.delVault(vaultTombstoneOf(vault), { prior: priorOf(vault) })
      expect(await vaultDB.tryPutBox(box, { prior: VS.NeverStored })).to.deep.include({ ok: false, act: 'vault_gone' })
    })

    it("refuses box_too_large over maxRecordBytes, and vault_full for a new box past maxBoxes", async () => {
      const vaultDB = new MemoryVaultDB({ maxRecordBytes: 2000, maxBoxes: 1 })
      await vaultDB.putVault(vaultAt(), { prior: VS.NeverStored })
      const heavy = boxAt(0, 'life1', { sidecar: { memo: 'x'.repeat(2000) } })
      expect(await vaultDB.tryPutBox(heavy, { prior: VS.NeverStored })).to.deep.include({ ok: false, act: 'box_too_large' })
      await vaultDB.putBox(boxAt(), { prior: VS.NeverStored })
      const full = await vaultDB.tryPutBox(boxAt(0, 'life1', { boxlabel: 'other' }), { prior: VS.NeverStored })
      expect(full).to.deep.include({ ok: false, act: 'vault_full' })
      expect(full.err?.meta?.capacity?.boxes).to.deep.equal({ used: 1, max: 1 })
      expect(full.req_params).to.include({ boxlabel: 'other' })
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
      vaultDB._cheat_vaultRowsOf(bankScope).set('main', { ...vault, fmt: VS.VaultFormat + 1 })
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
      expect(val).to.deep.include({ ...vaultScope, vault_tok: 'life1', registered_at: Now, fmt: VS.VaultFormat, revision_seq: 1, written_at: Now + 1 })
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

  describe("delBox", () => {
    it("writes the tombstone over a live row at its revision", async () => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      const tombstone = boxTombstoneOf(box)
      expect(await vaultDB.delBox(tombstone, { prior: priorOf(box) })).to.deep.include({ act: 'deleted', val: tombstone, world: vault })
      expect(await vaultDB.getBox({ ...boxscope, vault_tok: 'life1' }, { ifAbsent: 'nil' })).to.deep.include({ act: 'gotgone', dbhas: tombstone })
    })

    it("answers void with a sentinel over a void row, and gone with the stored tombstone over a tombstone, whatever the revision", async () => {
      const { vaultDB, vault, box } = await storeWith()
      expect(await vaultDB.delBox(boxTombstoneOf(box), { prior: priorOf(box) })).to.deep.include({ act: 'void', val: VS.sentinelBoxOf(boxscope, 'life1'), world: vault })
      await vaultDB.putBox(box, { prior: VS.NeverStored })
      const tombstone = boxTombstoneOf(box)
      await vaultDB.delBox(tombstone, { prior: priorOf(box) })
      expect(await vaultDB.delBox({ ...tombstone, revision_tok: 'again', revision_seq: 8 }, { prior: stale })).to.deep.include({ act: 'gone', val: tombstone, world: vault })
    })

    it("refuses stale_write over a live row moved past its prior, holding the row", async () => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      expect(await vaultDB.tryDelBox({ ...boxTombstoneOf(box), revision_seq: 8 }, { prior: stale })).to.deep.include({ ok: false, act: 'stale_write', dbhas: box, world: vault })
    })
  })

  describe("delVault", () => {
    it("writes the tombstone at its revision and tombstones this life's boxes in the same step, moving their revisions", async () => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      const tombstone = vaultTombstoneOf(vault)
      expect(await vaultDB.delVault(tombstone, { prior: priorOf(vault) })).to.deep.include({ act: 'deleted', val: tombstone, world: tombstone })
      const [row] = vaultDB._cheat_boxRowsOf(vaultScope, 'life1').values() as Iterable<BoxTombstone>
      expect(row).to.deep.include({ ...VS.boxSparse.parse(box), am: 'x', revision_seq: 1, written_at: tombstone.written_at, revision_tok: row?.revision_tok })
      expect(row?.revision_tok).to.not.eq(box.revision_tok)
      expect(VS.boxTombstone.safeParse(row).success).to.be.true
    })

    it("refuses stale_write over a live row moved past its prior, holding the row and tombstoning no box", async () => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      expect(await vaultDB.tryDelVault({ ...vaultTombstoneOf(vault), revision_seq: 8 }, { prior: stale })).to.deep.include({ ok: false, act: 'stale_write', dbhas: vault })
      expect(await vaultDB.getBox({ ...boxscope, vault_tok: 'life1' })).to.deep.include({ val: box })
    })

    it("a repeat over this life's tombstone moves no revision, whatever its own, and answers the tombstone", async () => {
      const { vaultDB, vault } = await storeWith()
      const tombstone = vaultTombstoneOf(vault)
      await vaultDB.delVault(tombstone, { prior: priorOf(vault) })
      expect(await vaultDB.delVault({ ...tombstone, revision_tok: 'again', revision_seq: 8 }, { prior: stale })).to.deep.include({ act: 'gone', val: tombstone, world: tombstone })
      expect(vaultDB._cheat_vaultRowsOf(bankScope).get('main')).to.deep.equal(tombstone)
    })

    it("over no row, or another life's, writes nothing, tombstones what lies under its vault_tok, and answers void with a sentinel", async () => {
      const { vaultDB, vault } = await storeWith()
      const oldBox = boxAt(0, 'oldlife')
      vaultDB._cheat_boxRowsOf(vaultScope, 'oldlife').set('openai', oldBox)
      const sentinel = VS.sentinelVaultOf(vaultScope, 'oldlife')
      const oldLife = vaultAt(0, 'oldlife')
      expect(await vaultDB.delVault(vaultTombstoneOf(oldLife), { prior: priorOf(oldLife) })).to.deep.include({ act: 'void', val: sentinel, world: sentinel })
      expect(vaultDB._cheat_vaultRowsOf(bankScope).get('main')).to.deep.equal(vault)
      expect(vaultDB._cheat_boxRowsOf(vaultScope, 'oldlife').get('openai')).to.include({ am: 'x', revision_seq: 1 })
    })
  })

  describe("delVault over a row past reading", () => {
    it("refuses as a read does, and tombstones no box", async () => {
      const { vaultDB, box } = await storeWith({ box: true })
      const tombstone = vaultTombstoneOf(vaultAt())
      const prior = priorOf(vaultAt())
      vaultDB._cheat_vaultRowsOf(bankScope).set('main', { garbage: true })
      expect(await vaultDB.tryDelVault(tombstone, { prior })).to.deep.include({ ok: false, act: 'damaged_record' })
      vaultDB._cheat_vaultRowsOf(bankScope).set('main', { fmt: VS.VaultFormat + 1 })
      expect(await vaultDB.tryDelVault(tombstone, { prior })).to.deep.include({ ok: false, act: 'newer_format' })
      expect(vaultDB._cheat_boxRowsOf(vaultScope, 'life1').get('openai')).to.deep.equal(box)
    })
  })

  describe("tidyGone", () => {
    it("removes the box rows of a tombstoned or vanished life, and counts the rows left in the bank", async () => {
      const { vaultDB, vault } = await storeWith({ box: true })
      vaultDB._cheat_boxRowsOf(vaultScope, 'oldlife').set('openai', boxAt(0, 'oldlife'))
      vaultDB._cheat_boxRowsOf({ ...vaultScope, vaultlabel: 'never' }, 'lost').set('openai', 'whatever')
      expect(await vaultDB.tidyGone(bankScope)).to.deep.include({ act: 'tidied', val: { totalCount: 1 }, world: bankScope })
      expect(vaultDB._cheat_boxRowsOf(vaultScope, 'oldlife').size).to.eq(0)
      await vaultDB.delVault(vaultTombstoneOf(vault), { prior: priorOf(vault) })
      expect(await vaultDB.tidyGone(bankScope)).to.deep.include({ val: { totalCount: 0 } })
      expect(vaultDB._cheat_boxRowsOf(vaultScope, 'life1').size).to.eq(0)
    })
  })

  describe("watch", () => {
    it("tells of a box row and a vault row that changed, as got and gone, until told to stop", async () => {
      const { vaultDB, vault, box } = await storeWith()
      const notices: unknown[] = []
      const unwatch = vaultDB.watch(vaultScope, (notice) => { notices.push(notice) })
      await vaultDB.putBox(box, { prior: VS.NeverStored })
      await vaultDB.delVault(vaultTombstoneOf(vault), { prior: priorOf(vault) })
      expect(notices).to.have.lengthOf(3)
      expect(notices[0]).to.deep.equal({ act: 'got', val: box, world: vault })
      expect(notices[1]).to.deep.equal({ act: 'gone', val: vaultTombstoneOf(vault), world: vaultTombstoneOf(vault) })
      unwatch()
      await vaultDB.putVault(vaultAt(2, 'life2'), { prior: priorOf(vaultTombstoneOf(vault)) })
      expect(notices).to.have.lengthOf(3)
    })
  })

  describe("a store's own failure", () => {
    class FailingVaultDB extends MemoryVaultDB {
      protected override doGetBank(): never { throw new Error('socket closed') }
    }

    it("reads as storage_error, the store's error its cause, by a throw and by an answer alike", async () => {
      const vaultDB = new FailingVaultDB()
      await expect(vaultDB.getBank(bankScope)).rejects.toSatisfy((err) => isVaultError(err, 'storage_error'))
      const answer = await vaultDB.tryGetBank(bankScope)
      expect(answer).to.deep.include({ ok: false, act: 'storage_error', world: null, req_params: bankScope, meta: { call: 'getBank' } })
      expect((answer.err?.cause as Error).message).to.eq('socket closed')
    })

    it("a VaultError a store throws passes up unchanged, with the request's safe metadata", async () => {
      class RefusingVaultDB extends MemoryVaultDB {
        protected override doGetBank(): never { throw new VaultError('not_permitted', 'Not yours.') }
      }
      expect(await new RefusingVaultDB().tryGetBank(bankScope)).to.deep.include({ ok: false, act: 'not_permitted', req_params: bankScope })
    })
  })

  describe("the plain verb and its try form", () => {
    it("read the same: a refusal's act, world and dbhas in an answer are its meta in the error", async () => {
      const { vaultDB, vault } = await storeWith()
      const rival = vaultAt(0, 'life2')
      const answer = await vaultDB.tryPutVault(rival, { prior: VS.NeverStored, ifPresent: 'fail' })
      const thrown = await thrownBy(() => vaultDB.putVault(rival, { prior: VS.NeverStored, ifPresent: 'fail' }))
      expect(isVaultError(thrown, 'camped')).to.be.true
      expect(thrown).to.deep.include({ refusalkind: answer.act })
      expect((thrown as { meta: object }).meta).to.deep.include({ world: vault, dbhas: vault, req_params: answer.req_params, call: 'putVault' })
    })
  })
})
