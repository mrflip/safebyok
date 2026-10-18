import { hex } from '@scure/base'
import { describe, expect, it } from 'vitest'
import { cipherCtx, decipherBytes, deriveWrappingKey, fromB64, importWrappingKeyBytes, makeVaultKey, unwrapKeyUnder } from '../src/crypto'
import { memoryDeviceDB } from '../src/device-db'
import { memoryStore } from '../src/string-store'
import { localVaultDB } from '../src/vault-db'
import * as Wayin from '../src/wayin'
import * as TH from './test-helpers'

// These tests pin the exact bytes each ctx builder produces as of the current format tags, so a
// rename of the builders proves it moved nothing. A stored-field rename moves them on purpose:
// update the literals here together with the tag, and with nothing else.
//
// A builder inside Vault.make, or the wayin's own, cannot be called from a test, so each is pinned
// through the narrowest path that reaches it: the ciphertext it made unwraps or deciphers under a
// hand-written literal of the bytes expected, and under no other. The literal is the UTF-8 text of
// the ctx's JSON; the values a vault draws afresh or stamps from its clock (vault_id, revision_tok,
// a salt or credential, a time, the unlock epoch) are interpolated from the record that carries
// them, so the literal pins the ctx's shape and order, not those values.

const textBytes = (text: string) => new TextEncoder().encode(text)

const scope = TH.scopeOf('u1')
const identity = TH.vaultPropsOf('u1')
const stamp = (wayinlabel: string): Wayin.WayinStamp => (
  { wayin_id: `wayin-${wayinlabel}`, wayinlabel, vault_key_epoch: 1, device_id: 'device-one', registered_at: Date.UTC(2026, 9, 15) }
)

describe("the ctx builders' output, byte for byte", () => {
  it("cipherCtx's encoding of strings, numbers and a record with its keys sorted is pinned byte for byte", () => {
    const ctx = cipherCtx('safebyok-lockbox-v4', 'acme', 'u1', 'main', 'vid', 1, 'whisper_ciphered', { written_at: 2, boxlabel: 'anthropic', revision_id: 'r1' })
    expect(new TextDecoder().decode(ctx)).to.eq('["safebyok-lockbox-v4","acme","u1","main","vid",1,"whisper_ciphered",{"boxlabel":"anthropic","revision_id":"r1","written_at":2}]')
    expect(hex.encode(ctx)).to.eq('5b227361666562796f6b2d6c6f636b626f782d7634222c2261636d65222c227531222c226d61696e222c22766964222c312c22776869737065725f6369706865726564222c7b22626f786c6162656c223a22616e7468726f706963222c227265766973696f6e5f6964223a227231222c227772697474656e5f6174223a327d5d')
  })

  it("a passphrase wayin's wrap is bound to the vault, the purpose and its whole header, byte for byte", async () => {
    const vaultKey = await makeVaultKey()
    const wayin = await Wayin.sealPassphrase(TH.testDeriver, 'pw', scope, identity, stamp('passphrase'), vaultKey)
    const ctx = textBytes(
      '["safebyok-vault-v3","acme","u1","main","vault-id-u1",' + String(identity.registered_at) + ',"vault_key_passphrase_wrapped",'
      + `{"device_id":"device-one","key_deriver_label":"test_digest_v0","registered_at":${String(Date.UTC(2026, 9, 15))},"salt_b64":"${wayin.salt_b64}","vault_key_epoch":1,"wayin_id":"wayin-passphrase","wayinkind":"passphrase","wayinlabel":"passphrase"}]`,
    )
    const wayinKey = await importWrappingKeyBytes(await TH.testDeriver.deriveKeyBytes('pw', fromB64(wayin.salt_b64)))
    expect(await unwrapKeyUnder(wayinKey, wayin.vault_key_wayin_wrapped, ctx, { extractable: false, usage: ['wrapKey'] })).to.be.instanceOf(CryptoKey)
  })

  it("a passkey wayin's wrap and its key are bound to the vault, the purpose and its whole header, byte for byte", async () => {
    const passkey = await TH.passkeyOf('laptop')
    const wayin = await Wayin.sealPasskey(passkey, scope, identity, stamp('laptop'), await makeVaultKey())
    const ctx = textBytes(
      '["safebyok-vault-v3","acme","u1","main","vault-id-u1",' + String(identity.registered_at) + ',"vault_key_passkey_wrapped",'
      + `{"credential_id":"${wayin.credential_id}","device_id":"device-one","prf_salt_b64":"${wayin.prf_salt_b64}","registered_at":${String(Date.UTC(2026, 9, 15))},"vault_key_epoch":1,"wayin_id":"wayin-laptop","wayinkind":"passkey","wayinlabel":"laptop"}]`,
    )
    const passkeyKey = await deriveWrappingKey(passkey.prfBytes, ctx)
    expect(await unwrapKeyUnder(passkeyKey, wayin.vault_key_wayin_wrapped, ctx, { extractable: false, usage: ['wrapKey'] })).to.be.instanceOf(CryptoKey)
  })

  it("a lockbox's two wraps and the lease's open only under the ctx bytes they have always been made with", async () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    const deviceDB = memoryDeviceDB()
    const vault = await TH.settledVault({
      applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB, deviceDB, clock: { now: () => Date.parse('2026-10-14T12:00:00Z') },
      keyDeriver: TH.testDeriver, passphraseStrengthTest: TH.anyPassphraseTest, logger: TH.spyLogger().logger,
    })
    await vault.unlock('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    const vaultProps = (await vaultDB.readVaultProps(scope))!
    const lockbox = (await vaultDB.readBox(scope, 'anthropic'))!
    const lease = (await deviceDB.readLease(scope))!
    const box = `"acme","u1","main","${vaultProps.vault_id}"`
    const header = `{"boxlabel":"anthropic","registered_at":${String(lockbox.registered_at)},"revision_tok":"${lockbox.revision_tok}","sidecar_json":"{}","vault_key_epoch":1,"whisper_codec":"json_v1","whisper_schema_version":1,"written_at":${String(lockbox.written_at)}}`
    const keyCtx = textBytes(`["safebyok-lockbox-v5",${box},"lockbox_key_wrapped",${header}]`)
    const whisperCtx = textBytes(`["safebyok-lockbox-v5",${box},"whisper_ciphered",${header}]`)
    const leaseCtx = textBytes(`["safebyok-lease-v1",${box},${String(lease.unlock_epoch)},${String(lease.ask_passphrase_at)},"vault_key_lease_wrapped"]`)

    const { sessionKey } = await Wayin.openWithPassphrase(TH.testDeriver, 'pw', scope, vaultProps)
    const lockboxKey = await unwrapKeyUnder(sessionKey, lockbox.lockbox_key_wrapped, keyCtx, { extractable: false, usage: ['decrypt'] })
    expect(new TextDecoder().decode(await decipherBytes(lockboxKey, lockbox.whisper_ciphered, whisperCtx))).to.include('sk-fake')
    expect(await unwrapKeyUnder(lease.lease_key, lease.vault_key_lease_wrapped, leaseCtx, { extractable: false, usage: ['wrapKey'] })).to.be.instanceOf(CryptoKey)
  })
})

