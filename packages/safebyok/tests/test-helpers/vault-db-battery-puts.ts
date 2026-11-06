/** The battery's puts and gate verbs: what each does to the rows, and what each refuses by the row it finds. */

import { describe, expect, it } from 'vitest'
import { isVaultError } from '../../src/refusals/errors'
import * as SX from '../../src/shapes/shapes-storage'
import type { VaultRecord } from '../../src/shapes/shapes-storage'
import { vaultScope, boxscope, Now, passphraseWayin, passkeyWayin, vaultAt, boxAt, vaultTombstoneOf, boxTombstoneOf, priorOf, stale } from './storage-world'
import type { BatteryWorld } from './vault-db-battery'

const boxQuery = { ...boxscope, vault_tok: 'life1' }
const anyIfPresent = ['repl', 'fail', 'get'] as const
const anyIfAbsent  = ['add', 'fail'] as const

/** A gate verb's params: a vault record holding a gate that holds the wayin. */
export const gateParamsOf = (vault: VaultRecord, gate: object) => ({ ...vault, gate }) as never

/** Registers the puts' and gate verbs' cases over `world`. */
export const describePuts = ({ fresh, storeWith, rowsOf, hasCap, makeCapped }: BatteryWorld): void => {
  /** A box deleted, and the rebirth that would stand on its tombstone. */
  const withBoxTombstone = async () => {
    const { vaultDB, vault, box } = await storeWith({ box: true })
    const tombstone = boxTombstoneOf(box)
    await vaultDB.delBox(tombstone, { prior: priorOf(box) })
    return { vaultDB, vault, tombstone, reborn: boxAt(tombstone.revision_seq + 1, 'life1', { box_tok: 'box2' }) }
  }

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
      expect(await vaultDB.tryPutVault(next, { prior: priorOf(vault) })).to.deep.include({ ok: false, act: 'camped' })
      expect(await vaultDB.tryPutVault(next, { prior: priorOf(vault), ifPresent: 'repl' } as never)).to.deep.include({ ok: false })
    })

    it("over a live row, ifPresent get answers it as declined, and fail refuses, neither saving", async () => {
      const { vaultDB, vault } = await storeWith()
      const rival = vaultAt(0, 'life2')
      expect(await vaultDB.putVault(rival, { prior: SX.VoidRevision, ifPresent: 'get' })).to.deep.include({ act: 'declined', val: vault, world: vault, req_params: { ...vaultScope, vault_tok: 'life2', revision_tok: rival.revision_tok, revision_seq: 0, prior: SX.VoidRevision } })
      expect(await vaultDB.tryPutVault(rival, { prior: SX.VoidRevision, ifPresent: 'fail' })).to.deep.include({ ok: false, act: 'camped', dbhas: vault, world: vault })
      expect(await vaultDB.tryPutVault(vaultAt(1), { prior: priorOf(vault), ifPresent: 'fail' })).to.deep.include({ ok: false, act: 'camped', dbhas: vault })
      expect(await vaultDB.getVault(vaultScope)).to.deep.include({ world: vault })
    })

    it("refuses over a live row whatever its revision, holding the row", async () => {
      const { vaultDB, vault } = await storeWith()
      expect(await vaultDB.tryPutVault(vaultAt(8), { prior: stale })).to.deep.include({ ok: false, act: 'camped', dbhas: vault, world: vault })
    })

    it("refuses when the prior names a row that is void", async () => {
      const vaultDB = await fresh()
      expect(await vaultDB.tryPutVault(vaultAt(8), { prior: stale })).to.deep.include({ ok: false, act: 'stale_write', dbhas: null })
    })

    it("refuses a record's revision_seq not one past its prior's, and a record failing its checks, naming the field and quoting none of it", async () => {
      const vaultDB = await fresh()
      expect(await vaultDB.tryPutVault(vaultAt(3), { prior: SX.VoidRevision })).to.deep.include({ ok: false })
      const secretish = 'hunter2'
      const answer = await vaultDB.tryPutVault({ ...vaultAt(), vaultlabel: `${secretish}^^bad label` }, { prior: SX.VoidRevision })
      expect(answer).to.deep.include({ ok: false, req_params: {} })
      expect(answer.err?.meta?.fieldnames).to.deep.equal(['vaultlabel'])
      expect(JSON.stringify([answer.err?.message, answer.req_params])).to.not.include(secretish)
    })

    it("refuses a box record, a box tombstone or a vault tombstone failing its checks, naming the field and storing nothing", async () => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      const answers = [
        await vaultDB.tryPutBox({ ...boxAt(1), whisper_ciphered: 7 } as never, { prior: priorOf(box) }),
        await vaultDB.tryDelBox({ ...boxTombstoneOf(box), am: 'a' } as never, { prior: priorOf(box) }),
        await vaultDB.tryDelVault({ ...vaultTombstoneOf(vault), gate: vault.gate } as never, { prior: priorOf(vault) }),
      ]
      for (const answer of answers) { expect(answer).to.deep.include({ ok: false }) }
      expect(answers.slice(0, 2).map(({ err }) => err?.meta?.fieldnames)).to.deep.equal([['whisper_ciphered'], ['am']])
      expect(await vaultDB.getBox(boxQuery)).to.deep.include({ val: box })
    })

    it("names the whole sentinel as a birth's prior, so a void row takes no record past revision_seq 0", async () => {
      const vaultDB = await fresh()
      const answer = await vaultDB.tryPutVault(vaultAt(6), { prior: { revision_tok: SX.VoidRevisionTok, revision_seq: 5 } })
      expect(answer).to.deep.include({ ok: false, act: 'stale_write', dbhas: null })
      expect(await rowsOf(vaultDB).vaultRowOf(vaultScope)).to.be.null
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

    it("over a live row, ifPresent get answers it as declined, and fail refuses", async () => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      const next = boxAt(1)
      expect(await vaultDB.putBox(next, { prior: priorOf(box), ifPresent: 'get' })).to.deep.include({ act: 'declined', val: box, world: vault })
      expect(await vaultDB.tryPutBox(next, { prior: priorOf(box), ifPresent: 'fail' })).to.deep.include({ ok: false, act: 'camped', dbhas: box, world: vault })
    })

    it("refuses over a row moved past its prior, holding the row and leaving it", async () => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      expect(await vaultDB.tryPutBox(boxAt(8), { prior: stale })).to.deep.include({ ok: false, act: 'stale_write', dbhas: box, world: vault })
      expect(await vaultDB.getBox(boxQuery)).to.deep.include({ val: box })
    })

    it("refuses a put under a vault_tok that is not the live one's, and under this life's tombstone", async () => {
      const { vaultDB, vault, box } = await storeWith()
      expect(await vaultDB.tryPutBox(boxAt(0, 'oldlife'), { prior: SX.VoidRevision })).to.deep.include({ ok: false, dbhas: vault })
      await vaultDB.delVault(vaultTombstoneOf(vault), { prior: priorOf(vault) })
      expect(await vaultDB.tryPutBox(box, { prior: SX.VoidRevision })).to.deep.include({ ok: false })
    })

    it("refuses a box over maxRecordBytes", async () => {
      const vaultDB = await fresh({ maxRecordBytes: 2000 })
      await vaultDB.putVault(vaultAt(), { prior: SX.VoidRevision })
      const heavy = boxAt(0, 'life1', { sidecar: { memo: 'x'.repeat(2000) } })
      expect(await vaultDB.tryPutBox(heavy, { prior: SX.VoidRevision })).to.deep.include({ ok: false, act: 'box_too_large' })
      expect(await rowsOf(vaultDB).boxRowsOf(vaultScope, 'life1')).to.have.property('size', 0)
    })

    it.skipIf(! hasCap)("refuses a new box past its store's cap, and replaces one held", async () => {
      const vaultDB = await makeCapped(1)
      await vaultDB.putVault(vaultAt(), { prior: SX.VoidRevision })
      const box = boxAt()
      await vaultDB.putBox(box, { prior: SX.VoidRevision })
      const full = await vaultDB.tryPutBox(boxAt(0, 'life1', { boxlabel: 'other' }), { prior: SX.VoidRevision })
      expect(full).to.deep.include({ ok: false, act: 'vault_full' })
      expect(full.err?.meta?.capacity?.boxes).to.deep.equal({ used: 1, max: 1 })
      expect(full.req_params).to.include({ boxlabel: 'other' })
      expect(await vaultDB.putBox(boxAt(1), { prior: priorOf(box) })).to.deep.include({ act: 'replaced' })
    })
  })

  describe("what a put hears, by the row it finds and its ifAbsent and ifPresent", () => {
    it.each(anyIfPresent)("refuses over a void box row with ifAbsent fail and ifPresent %s", async (ifPresent) => {
      const { vaultDB, vault, box } = await storeWith()
      expect(await vaultDB.tryPutBox(box, { prior: SX.VoidRevision, ifAbsent: 'fail', ifPresent })).to.deep.include({ ok: false, act: 'void', dbhas: null, world: vault })
      expect(await rowsOf(vaultDB).boxRowsOf(vaultScope, 'life1')).to.have.property('size', 0)
    })

    it.each(anyIfPresent)("refuses over a box tombstone with ifAbsent fail and ifPresent %s, at its revision or not", async (ifPresent) => {
      const { vaultDB, vault, tombstone, reborn } = await withBoxTombstone()
      for (const prior of [priorOf(tombstone), { ...stale, revision_seq: reborn.revision_seq - 1 }]) {
        const answer = await vaultDB.tryPutBox(reborn, { prior, ifAbsent: 'fail', ifPresent })
        expect(answer).to.deep.include({ ok: false, act: 'gone', dbhas: tombstone, world: vault })
        expect(isVaultError(answer.err, 'absent_box')).to.be.true
      }
    })

    it.each(anyIfAbsent)("refuses over a live box with ifAbsent %s and ifPresent fail, at its revision or not", async (ifAbsent) => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      expect(await vaultDB.tryPutBox(boxAt(1), { prior: priorOf(box), ifAbsent, ifPresent: 'fail' })).to.deep.include({ ok: false, act: 'camped', dbhas: box, world: vault })
      expect(await vaultDB.tryPutBox(boxAt(8), { prior: stale, ifAbsent, ifPresent: 'fail' })).to.deep.include({ ok: false, act: 'camped', dbhas: box, world: vault })
    })

    it.each(anyIfAbsent)("answers declined with the live box under ifAbsent %s and ifPresent get, at its revision or not", async (ifAbsent) => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      expect(await vaultDB.putBox(boxAt(1), { prior: priorOf(box), ifAbsent, ifPresent: 'get' })).to.deep.include({ act: 'declined', val: box, world: vault })
      expect(await vaultDB.putBox(boxAt(8), { prior: stale, ifAbsent, ifPresent: 'get' })).to.deep.include({ act: 'declined', val: box, world: vault })
    })

    it.each(anyIfAbsent)("replaces a live box at its revision under ifAbsent %s and ifPresent repl, and refuses past it", async (ifAbsent) => {
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

    it.each(anyIfPresent)("refuses over a void box row or a tombstone a prior misses, under ifAbsent add and ifPresent %s", async (ifPresent) => {
      const { vaultDB } = await storeWith()
      expect(await vaultDB.tryPutBox(boxAt(8), { prior: stale, ifAbsent: 'add', ifPresent })).to.deep.include({ ok: false, act: 'stale_write', dbhas: null })
      const { vaultDB: other, tombstone, reborn } = await withBoxTombstone()
      const prior = { ...stale, revision_seq: reborn.revision_seq - 1 }
      expect(await other.tryPutBox(reborn, { prior, ifAbsent: 'add', ifPresent })).to.deep.include({ ok: false, act: 'stale_write', dbhas: tombstone })
    })

    it("takes ifAbsent add by default, and refuses fetch's nil", async () => {
      const { vaultDB, vault, box } = await storeWith()
      expect(await vaultDB.tryPutBox(box, { prior: SX.VoidRevision, ifAbsent: 'nil' } as never)).to.deep.include({ ok: false })
      expect(await vaultDB.tryPutVault(vaultAt(1), { prior: priorOf(vault), ifAbsent: 'nil' } as never)).to.deep.include({ ok: false })
      expect(await vaultDB.putBox(box, { prior: SX.VoidRevision })).to.deep.include({ act: 'born' })
    })

    it.each(['fail', 'get'] as const)("refuses a put over a void vault row and over a tombstone, with ifAbsent fail and ifPresent %s", async (ifPresent) => {
      const empty = await fresh()
      const answer = await empty.tryPutVault(vaultAt(), { prior: SX.VoidRevision, ifAbsent: 'fail', ifPresent })
      expect(answer).to.deep.include({ ok: false, dbhas: null })
      expect(await rowsOf(empty).vaultRowOf(vaultScope)).to.be.null
      const { vaultDB, vault } = await storeWith()
      const tombstone = vaultTombstoneOf(vault)
      await vaultDB.delVault(tombstone, { prior: priorOf(vault) })
      expect(await vaultDB.tryPutVault(vaultAt(2, 'life2'), { prior: priorOf(tombstone), ifAbsent: 'fail', ifPresent })).to.deep.include({ ok: false, dbhas: tombstone, world: tombstone })
    })

    it("over a live vault row, ifAbsent changes nothing: fail refuses and get declines", async () => {
      const { vaultDB, vault } = await storeWith()
      expect(await vaultDB.tryPutVault(vaultAt(1), { prior: priorOf(vault), ifAbsent: 'fail', ifPresent: 'fail' })).to.deep.include({ ok: false, act: 'camped', dbhas: vault })
      expect(await vaultDB.putVault(vaultAt(1), { prior: priorOf(vault), ifAbsent: 'fail', ifPresent: 'get' })).to.deep.include({ act: 'declined', val: vault })
    })

    it("lands a gate verb, which takes no ifAbsent, over the live row it moves", async () => {
      const { vaultDB, vault } = await storeWith()
      expect(await vaultDB.tryRevokePasskey(gateParamsOf(vault, { passkey_wayin: null }))).to.deep.include({ ok: true })
    })
  })

  describe("box writes under a vault row failing its checks", () => {
    it("refuse under any such row, a later fmt among them, and change nothing", async () => {
      const { vaultDB, vault, box } = await storeWith({ box: true })
      await rowsOf(vaultDB).plantVaultRow(vaultScope, { ...vault, gate: 'rubble' })
      const nextBox = boxAt(1)
      expect(await vaultDB.tryPutBox(nextBox, { prior: priorOf(box) })).to.deep.include({ ok: false, act: 'damaged_row' })
      expect(await vaultDB.tryDelBox(boxTombstoneOf(box), { prior: priorOf(box) })).to.deep.include({ ok: false, act: 'damaged_row' })
      await rowsOf(vaultDB).plantVaultRow(vaultScope, { ...vault, fmt: SX.VaultFormat + 1 })
      expect(await vaultDB.tryPutBox(nextBox, { prior: priorOf(box) })).to.deep.include({ ok: false, act: 'damaged_row' })
      const boxrows = await rowsOf(vaultDB).boxRowsOf(vaultScope, 'life1')
      expect(boxrows.get('openai')).to.deep.equal(box)
    })
  })

  describe("gate verbs", () => {
    it("replacePassphrase lays the wayin on, moves gate_epoch and the revision each one up, and leaves the rest as stored", async () => {
      const { vaultDB, vault } = await storeWith()
      const wayin = { ...passphraseWayin, device_id: 'd2' }
      const { act, val, world } = await vaultDB.replacePassphrase(gateParamsOf(vault, { passphrase_wayin: wayin }))
      expect(act).to.eq('replaced')
      expect(world).to.deep.equal(val)
      expect(val).to.deep.include({ ...vaultScope, vault_tok: 'life1', registered_at: Now, fmt: SX.VaultFormat, revision_seq: 1, written_at: Now + 1 })
      expect(val.revision_tok).to.not.eq(vault.revision_tok)
      expect(val.gate).to.deep.equal({ gate_epoch: 2, passphrase_wayin: wayin, passkey_wayin: null })
      expect(await vaultDB.getVault(vaultScope)).to.deep.include({ world: val })
    })

    it("addPasskey adds over no passkey, and refuses over one held, with the stored record", async () => {
      const { vaultDB, vault } = await storeWith()
      const { act, val } = await vaultDB.addPasskey(gateParamsOf(vault, { passkey_wayin: passkeyWayin }))
      expect(act).to.eq('added')
      expect(val.gate).to.deep.equal({ gate_epoch: 2, passphrase_wayin: passphraseWayin, passkey_wayin: passkeyWayin })
      expect(await vaultDB.tryAddPasskey(gateParamsOf(val, { passkey_wayin: { ...passkeyWayin, device_id: 'd2' } }))).to.deep.include({ ok: false, act: 'camped', dbhas: val, world: val })
    })

    it("revokePasskey nulls a passkey held, and over none answers revoked with nothing moved", async () => {
      const { vaultDB, vault } = await storeWith()
      const { val: holding } = await vaultDB.addPasskey(gateParamsOf(vault, { passkey_wayin: passkeyWayin }))
      const { act, val } = await vaultDB.revokePasskey(gateParamsOf(holding, { passkey_wayin: null }))
      expect(act).to.eq('revoked')
      expect(val.gate).to.deep.equal({ gate_epoch: 3, passphrase_wayin: passphraseWayin, passkey_wayin: null })
      expect(await vaultDB.revokePasskey(gateParamsOf(val, { passkey_wayin: null }))).to.deep.include({ act: 'revoked', val, world: val })
      expect(await vaultDB.getVault(vaultScope)).to.deep.include({ world: val })
    })

    it("a gate verb refuses when the row moved past its params' revision, even a verb its row would otherwise refuse", async () => {
      const { vaultDB, vault } = await storeWith()
      const { val: moved } = await vaultDB.addPasskey(gateParamsOf(vault, { passkey_wayin: passkeyWayin }))
      expect(await vaultDB.tryAddPasskey(gateParamsOf(vault, { passkey_wayin: passkeyWayin }))).to.deep.include({ ok: false, act: 'stale_write', dbhas: moved })
      expect(await vaultDB.tryRevokePasskey(gateParamsOf(vault, { passkey_wayin: null }))).to.deep.include({ ok: false, act: 'stale_write', dbhas: moved })
      expect(await vaultDB.tryReplacePassphrase(gateParamsOf(vault, { passphrase_wayin: passphraseWayin }))).to.deep.include({ ok: false, act: 'stale_write', dbhas: moved })
    })

    it("refuses a verb touching the other wayin, and params that disagree with the row", async () => {
      const { vaultDB, vault } = await storeWith()
      expect(await vaultDB.tryReplacePassphrase(gateParamsOf(vault, { passphrase_wayin: passphraseWayin, passkey_wayin: passkeyWayin }))).to.deep.include({ ok: false })
      expect(await vaultDB.tryAddPasskey(gateParamsOf(vault, { passkey_wayin: passkeyWayin, passphrase_wayin: passphraseWayin }))).to.deep.include({ ok: false })
      expect(await vaultDB.tryRevokePasskey(gateParamsOf(vault, { passkey_wayin: null, passphrase_wayin: passphraseWayin }))).to.deep.include({ ok: false })
      expect(await vaultDB.tryReplacePassphrase(gateParamsOf({ ...vault, registered_at: Now + 5 }, { passphrase_wayin: passphraseWayin }))).to.deep.include({ ok: false, world: vault })
      expect(await vaultDB.getVault(vaultScope)).to.deep.include({ world: vault })
    })

    it("refuses under this life's tombstone, and for another life", async () => {
      const { vaultDB, vault } = await storeWith()
      const oldLife = vaultAt(0, 'oldlife')
      expect(await vaultDB.tryReplacePassphrase(gateParamsOf(oldLife, { passphrase_wayin: passphraseWayin }))).to.deep.include({ ok: false, dbhas: vault })
      await vaultDB.delVault(vaultTombstoneOf(vault), { prior: priorOf(vault) })
      expect(await vaultDB.tryReplacePassphrase(gateParamsOf(vault, { passphrase_wayin: passphraseWayin }))).to.deep.include({ ok: false })
    })

    it("carries no wayin in its request's safe metadata", async () => {
      const { vaultDB, vault } = await storeWith()
      const { req_params } = await vaultDB.replacePassphrase(gateParamsOf(vault, { passphrase_wayin: passphraseWayin }))
      expect(Object.keys(req_params)).to.not.include('gate')
    })
  })
}
