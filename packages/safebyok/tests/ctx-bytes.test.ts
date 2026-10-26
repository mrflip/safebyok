import { hex } from '@scure/base'
import { describe, expect, it } from 'vitest'
import { BoxStamp } from '../src/box'
import { cipherBytes, cipherCtx, decipherBytes, deriveWrappingKey, fromB64, importWrappingKeyBytes, makeBoxKey, unwrapKeyUnder } from '../src/crypto'
import { isVaultError } from '../src/errors'
import { LeaseStamp, boxCtxOf, leaseCtxOf } from '../src/lease'
import { memoryDeviceDB } from '../src/device-db'
import { memoryStore } from '../src/string-store'
import { localVaultDB } from '../src/local-vault-db'
import { VaultFormat, VaultRecord, VaultStamp } from '../src/vault-record'
import { passphraseCleartext } from '../src/types/type-aliases'
import { PasskeyProving, PassphraseProving, StandingGating, headerOf, passphraseKeyOf } from '../src/proving'
import { wayinCtxOf } from '../src/wayin'
import * as TH from './test-helpers'
import { makeWorld } from './vault/world'

// These tests pin the exact bytes each ctx builder produces as of the current format tags, so a
// rename of the builders proves it moved nothing. A stored-field rename moves them on purpose:
// update the literals here together with the tag, and with nothing else.
//
// A builder inside Vault.make, or the wayin's own, cannot be called from a test, so each is pinned
// through the narrowest path that reaches it: the ciphertext it made unwraps or deciphers under a
// hand-written literal of the bytes expected, and under no other. The literal is the UTF-8 text of
// the ctx's JSON; the values a vault draws afresh or stamps with the time (vault_tok, revision_tok,
// a salt or credential, a device id, a time, the gate epoch) are interpolated from the record that carries
// them, so the literal pins the ctx's shape and order, not those values.

const textBytes = (text: string) => new TextEncoder().encode(text)

const scope = TH.scopeOf('u1')

/** The wayins a novel `u1` vault's provings seal: a passphrase's of 'pw' and, given `answer`, a passkey's; and the vault, whose stamp they bind. */
const sealedWayins = async (answer?: Awaited<ReturnType<typeof TH.passkeyOf>>) => {
  const vault = await makeWorld().open()
  const passphrase = await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, 'pw', { gating: StandingGating })
  const passkey = answer === undefined ? undefined : await PasskeyProving.seal(vault, { slotlabel: 'passkey' }, answer, { gating: StandingGating })
  return { vault, ...await passphrase.sealWayins(passkey) }
}

/** The JSON text of `vault`'s stamp, as a wayin's ctx holds it: its keys sorted, the format among them. */
const vaultStampText = (vault: { vault_tok: string, registered_at: number }) => (
  `{"applabel":"acme","format":"safebyok-vault-v6","registered_at":${String(vault.registered_at)},"user_id":"u1","vault_tok":"${vault.vault_tok}","vaultlabel":"main"}`
)

describe("the ctx builders' output, byte for byte", () => {
  it("cipherCtx's encoding of a list of stamps, a purpose and a header, each record's keys sorted, is pinned byte for byte", () => {
    const ctx = cipherCtx([{ vault_tok: 'vid', applabel: 'acme' }, { written_at: 2, boxlabel: 'anthropic', revision_tok: 'r1' }], 'whisper_ciphered', { wayinkind: 'passkey' })
    expect(new TextDecoder().decode(ctx)).to.eq('[{"applabel":"acme","vault_tok":"vid"},{"boxlabel":"anthropic","revision_tok":"r1","written_at":2},"whisper_ciphered",{"wayinkind":"passkey"}]')
    expect(hex.encode(ctx)).to.eq('5b7b226170706c6162656c223a2261636d65222c227661756c745f746f6b223a22766964227d2c7b22626f786c6162656c223a22616e7468726f706963222c227265766973696f6e5f746f6b223a227231222c227772697474656e5f6174223a327d2c22776869737065725f6369706865726564222c7b22776179696e6b696e64223a22706173736b6579227d5d')
  })

  it("a passphrase wayin's wrap is bound to its vault record's stamp, the purpose and its whole header, byte for byte", async () => {
    const { vault, passphrase: wayin } = await sealedWayins()
    const { record } = wayin
    const ctx = textBytes(
      `[${vaultStampText(vault)},"vault_key_passphrase_wrapped",`
      + `{"device_id":"${record.device_id}","key_deriver_label":"test_digest_v0","registered_at":${String(record.registered_at)},"salt_b64":"${record.salt_b64}","wayinkind":"passphrase"}]`,
    )
    const wayinKey = await importWrappingKeyBytes(await TH.testDeriver.deriveKeyBytes('pw', fromB64(record.salt_b64)))
    expect(await unwrapKeyUnder(wayinKey, record.vault_key_wayin_wrapped, ctx, { extractable: false, usage: ['wrapKey'] })).to.be.instanceOf(CryptoKey)
  })

  it("a passkey wayin's wrap and its key are bound to its vault record's stamp, the purpose and its whole header, byte for byte", async () => {
    // The proving zeroes the answer it is handed: the same passkey, asked again, answers the same.
    const { prfBytes } = await TH.passkeyOf('laptop')
    const { vault, passkey } = await sealedWayins(await TH.passkeyOf('laptop'))
    const { record } = passkey!
    const ctx = textBytes(
      `[${vaultStampText(vault)},"vault_key_passkey_wrapped",`
      + `{"credential_id":"${record.credential_id}","device_id":"${record.device_id}","prf_salt_b64":"${record.prf_salt_b64}","registered_at":${String(record.registered_at)},"wayinkind":"passkey"}]`,
    )
    const passkeyKey = await deriveWrappingKey(prfBytes, ctx)
    expect(await unwrapKeyUnder(passkeyKey, record.vault_key_wayin_wrapped, ctx, { extractable: false, usage: ['wrapKey'] })).to.be.instanceOf(CryptoKey)
  })

  it("a box's two wraps and the lease's open only under the ctx bytes of the vault's stamp but its format, beside their own stamps", async () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    const deviceDB = memoryDeviceDB()
    const vault = await TH.settledVault({
      applabel: 'acme', user_id: 'u1', vaultlabel: 'main', vaultDB, deviceDB, clock: { now: () => Date.parse('2026-10-14T12:00:00Z') },
      keyDeriver: TH.testDeriver, strengthChecker: TH.anyStrengthChecker, requestCleartext: TH.scriptedRequestCleartext, logger: TH.spyLogger().logger,
    })
    await TH.unlock(vault, 'pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const vaultRecord = (await TH.vaultRecordIn(vaultDB, scope))!
    const box = (await TH.expectingGood(vaultDB).getBox(scope, 'anthropic', { vault_tok: vaultRecord.vault_tok }))!
    const lease = (await TH.expectGood(deviceDB.getLease(scope)))!
    const vaultText = `{"applabel":"acme","registered_at":${String(vaultRecord.registered_at)},"user_id":"u1","vault_tok":"${vaultRecord.vault_tok}","vaultlabel":"main"}`
    const boxText = `{"boxlabel":"anthropic","format":"safebyok-box-v8","registered_at":${String(box.registered_at)},"revision_tok":"${box.revision_tok}","sidecar":"{}","vault_tok":"${vaultRecord.vault_tok}","whisper_codec":"json_v1","whisper_schema_version":1,"written_at":${String(box.written_at)}}`
    const leaseText = `{"applabel":"acme","ask_passphrase_at":${String(lease.ask_passphrase_at)},"format":"safebyok-lease-v1","gate_epoch":${String(lease.gate_epoch)},"user_id":"u1","vault_tok":"${vaultRecord.vault_tok}","vaultlabel":"main"}`
    const keyCtx = textBytes(`[${vaultText},${boxText},"box_key_wrapped"]`)
    const whisperCtx = textBytes(`[${vaultText},${boxText},"whisper_ciphered"]`)
    const leaseCtx = textBytes(`[${vaultText},${leaseText},"vault_key_lease_wrapped"]`)

    const { gate: { passphrase } } = VaultRecord.parse(vaultRecord) as TH.GatedRecord
    const wayinKey = await passphraseKeyOf(TH.testDeriver, passphraseCleartext.parse('pw'), fromB64(passphrase.salt_b64), TH.spyLogger().logger)
    const wayinCtx = wayinCtxOf(vaultRecord, headerOf(passphrase))
    const vaultKey = await unwrapKeyUnder(wayinKey, passphrase.vault_key_wayin_wrapped, wayinCtx, { extractable: false, usage: ['unwrapKey'] })
    const boxKey = await unwrapKeyUnder(vaultKey, box.box_key_wrapped, keyCtx, { extractable: false, usage: ['decrypt'] })
    expect(new TextDecoder().decode(await decipherBytes(boxKey, box.whisper_ciphered, whisperCtx))).to.include('sk-fake')
    expect(await unwrapKeyUnder(lease.lease_key, lease.vault_key_lease_wrapped, leaseCtx, { extractable: false, usage: ['wrapKey'] })).to.be.instanceOf(CryptoKey)
  })
})

// == [Stamps]: every bound field of VaultStamp, BoxStamp and LeaseStamp; the vault's format left out of a box's and a lease's

/** `val` changed, keeping its type: a number one more, a string with a letter added, a sidecar with a field. */
const changed = (val: unknown): unknown => {
  if (typeof val === 'number') { return val + 1 }
  if (typeof val === 'string') { return `${val}x` }
  return { changed: 1 }
}

/** True when ciphertext sealed under `ctxOf(stamps)` opens under `ctxOf` of the same stamps with `field` of the one at `slot` changed; false when it will not, or the builder refuses the changed stamp ('bad_record') before any ctx is made. */
const opensWithChange = async <StampsT extends readonly Record<string, unknown>[]>(ctxOf: (...stamps: StampsT) => Uint8Array, stamps: StampsT, slot: number, field: string) => {
  const cipherKey = await makeBoxKey()
  const sealed = await cipherBytes(cipherKey, textBytes('sk-fake'), ctxOf(...stamps))
  const altered = stamps.map((stamp, ii) => (ii === slot ? { ...stamp, [field]: changed(stamp[field]) } : stamp)) as unknown as StampsT
  try {
    await decipherBytes(cipherKey, sealed, ctxOf(...altered))
    return true
  } catch (err) {
    if (isVaultError(err) && ! isVaultError(err, 'bad_record')) { throw err }
    return false
  }
}

const vaultStamp: VaultStamp = { format: VaultFormat, ...scope, vault_tok: 'vault-tok-u1', registered_at: Date.UTC(2026, 9, 14) }
const { format: _vaultFormat, ...vaultStampButFormat } = vaultStamp
const { box_key_wrapped: _wrapped, whisper_ciphered: _ciphered, ...visible } = TH.boxOf('anthropic', 'r1')
const boxStamp = { ...visible, sidecar: { note: 'work account' }, vault_tok: 'vault-tok-u1' }
const leaseStamp: LeaseStamp = { format: 'safebyok-lease-v1', ...scope, vault_tok: 'vault-tok-u1', gate_epoch: 2, ask_passphrase_at: Date.UTC(2026, 9, 21) }
const header = headerOf(TH.wayinOf('passphrase'))

const VaultStampFields = ['format', 'applabel', 'user_id', 'vaultlabel', 'vault_tok', 'registered_at'] as const
const VaultStampButFormatFields = ['applabel', 'user_id', 'vaultlabel', 'vault_tok', 'registered_at'] as const
const BoxStampFields = ['format', 'boxlabel', 'revision_tok', 'whisper_codec', 'whisper_schema_version', 'sidecar', 'registered_at', 'written_at', 'vault_tok'] as const
const LeaseStampFields = ['format', 'applabel', 'user_id', 'vaultlabel', 'vault_tok', 'gate_epoch', 'ask_passphrase_at'] as const

describe("each ctx binds every field of its stamps", () => {
  it("names every field of each stamp below: a field a stamp gains fails here until it is listed", () => {
    expect(Object.keys(VaultStamp.parse(vaultStamp))).to.have.members([...VaultStampFields])
    expect(Object.keys(BoxStamp.parse(boxStamp))).to.have.members([...BoxStampFields])
    expect(Object.keys(LeaseStamp.parse(leaseStamp))).to.have.members([...LeaseStampFields])
  })

  for (const field of VaultStampFields) {
    it(`a wayin's ctx: a vault stamp with another ${field} does not open what the stamp sealed`, async () => {
      const ctxOf = (stamp: typeof vaultStamp) => wayinCtxOf(stamp, header)
      expect(await opensWithChange(ctxOf, [vaultStamp] as const, 0, field)).to.be.false
    })
  }

  for (const field of VaultStampButFormatFields) {
    it(`a box's ctx: a vault stamp with another ${field} does not open what the stamp sealed`, async () => {
      const ctxOf = (vault: typeof vaultStamp, box: typeof boxStamp) => boxCtxOf(vault, box, 'whisper_ciphered')
      expect(await opensWithChange(ctxOf, [vaultStamp, boxStamp] as const, 0, field)).to.be.false
    })

    it(`a lease's ctx: a vault stamp with another ${field} does not open what the stamp sealed`, async () => {
      expect(await opensWithChange(leaseCtxOf, [vaultStamp, leaseStamp] as const, 0, field)).to.be.false
    })
  }

  for (const field of BoxStampFields) {
    it(`a box's ctx: a box stamp with another ${field} does not open what the stamp sealed`, async () => {
      const ctxOf = (vault: typeof vaultStamp, box: typeof boxStamp) => boxCtxOf(vault, box, 'whisper_ciphered')
      expect(await opensWithChange(ctxOf, [vaultStamp, boxStamp] as const, 1, field)).to.be.false
    })
  }

  for (const field of LeaseStampFields) {
    it(`a lease's ctx: a lease stamp with another ${field} does not open what the stamp sealed`, async () => {
      expect(await opensWithChange(leaseCtxOf, [vaultStamp, leaseStamp] as const, 1, field)).to.be.false
    })
  }

  it("a wayin's ctx refuses a vault stamp of another format at the parse, 'bad_record', so nothing opens under one", () => {
    TH.expectSyncRefusal(() => wayinCtxOf({ ...vaultStamp, format: 'safebyok-vault-v7' as never }, header), 'bad_record')
  })

  it("a box's ctx and a lease's are the same bytes under a vault of another format: a new vault format leaves every box and lease open", () => {
    const later = { ...vaultStamp, format: 'safebyok-vault-v7' }
    expect(hex.encode(boxCtxOf(later, boxStamp, 'whisper_ciphered'))).to.eq(hex.encode(boxCtxOf(vaultStamp, boxStamp, 'whisper_ciphered')))
    expect(hex.encode(boxCtxOf(vaultStampButFormat, boxStamp, 'box_key_wrapped'))).to.eq(hex.encode(boxCtxOf(vaultStamp, boxStamp, 'box_key_wrapped')))
    expect(hex.encode(leaseCtxOf(later, leaseStamp))).to.eq(hex.encode(leaseCtxOf(vaultStamp, leaseStamp)))
    expect(new TextDecoder().decode(leaseCtxOf(later, leaseStamp))).to.not.include('safebyok-vault')
  })

  it("a box's two purposes make two ctxs: its wrapped key will not open as its ciphered whisper", () => {
    expect(hex.encode(boxCtxOf(vaultStamp, boxStamp, 'box_key_wrapped'))).to.not.eq(hex.encode(boxCtxOf(vaultStamp, boxStamp, 'whisper_ciphered')))
  })

  it("a box's ctx refuses a box stamp holding a field beyond its own, 'bad_record', rather than binding it or dropping it unseen", () => {
    TH.expectSyncRefusal(() => boxCtxOf(vaultStamp, { ...boxStamp, gate_epoch: 2 } as never, 'whisper_ciphered'), 'bad_record')
  })
})
// --
