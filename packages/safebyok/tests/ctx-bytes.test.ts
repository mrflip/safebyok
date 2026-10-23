import { hex } from '@scure/base'
import { describe, expect, it } from 'vitest'
import { cipherCtx, decipherBytes, deriveWrappingKey, fromB64, importWrappingKeyBytes, unwrapKeyUnder } from '../src/crypto'
import { memoryDeviceDB } from '../src/device-db'
import { memoryStore } from '../src/string-store'
import { localVaultDB } from '../src/local-vault-db'
import { GatedVaultProps } from '../src/types'
import { PasskeyProving, PassphraseProving, headerOf, passphraseKeyOf } from '../src/proving'
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

/** The wayins a novel `u1` vault's provings seal: a passphrase's of 'pw' and, given `answer`, a passkey's. */
const sealedWayins = async (answer?: Awaited<ReturnType<typeof TH.passkeyOf>>) => {
  const vault = await makeWorld().open()
  const passphrase = await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, 'pw')
  const passkey = answer === undefined ? undefined : await PasskeyProving.seal(vault, { slotlabel: 'passkey' }, answer)
  return await passphrase.sealWayins(passkey)
}

describe("the ctx builders' output, byte for byte", () => {
  it("cipherCtx's encoding of strings, numbers and a record with its keys sorted is pinned byte for byte", () => {
    const ctx = cipherCtx('safebyok-box-v6', 'acme', 'u1', 'main', 'vid', 1, 'whisper_ciphered', { written_at: 2, boxlabel: 'anthropic', revision_tok: 'r1' })
    expect(new TextDecoder().decode(ctx)).to.eq('["safebyok-box-v6","acme","u1","main","vid",1,"whisper_ciphered",{"boxlabel":"anthropic","revision_tok":"r1","written_at":2}]')
    expect(hex.encode(ctx)).to.eq('5b227361666562796f6b2d626f782d7636222c2261636d65222c227531222c226d61696e222c22766964222c312c22776869737065725f6369706865726564222c7b22626f786c6162656c223a22616e7468726f706963222c227265766973696f6e5f746f6b223a227231222c227772697474656e5f6174223a327d5d')
  })

  it("a passphrase wayin's wrap is bound to the vault, the purpose and its whole header, byte for byte", async () => {
    const { passphrase: wayin } = await sealedWayins()
    const { record } = wayin
    const ctx = textBytes(
      `["safebyok-vault-v6","acme","u1","main","${wayin.vault_tok}","vault_key_passphrase_wrapped",`
      + `{"device_id":"${record.device_id}","key_deriver_label":"test_digest_v0","registered_at":${String(record.registered_at)},"salt_b64":"${record.salt_b64}","wayinkind":"passphrase"}]`,
    )
    const wayinKey = await importWrappingKeyBytes(await TH.testDeriver.deriveKeyBytes('pw', fromB64(record.salt_b64)))
    expect(await unwrapKeyUnder(wayinKey, record.vault_key_wayin_wrapped, ctx, { extractable: false, usage: ['wrapKey'] })).to.be.instanceOf(CryptoKey)
  })

  it("a passkey wayin's wrap and its key are bound to the vault, the purpose and its whole header, byte for byte", async () => {
    // The proving zeroes the answer it is handed: the same passkey, asked again, answers the same.
    const { prfBytes } = await TH.passkeyOf('laptop')
    const sealed = await sealedWayins(await TH.passkeyOf('laptop'))
    const { record, vault_tok: vaultTok } = sealed.passkey!
    const ctx = textBytes(
      `["safebyok-vault-v6","acme","u1","main","${vaultTok}","vault_key_passkey_wrapped",`
      + `{"credential_id":"${record.credential_id}","device_id":"${record.device_id}","prf_salt_b64":"${record.prf_salt_b64}","registered_at":${String(record.registered_at)},"wayinkind":"passkey"}]`,
    )
    const passkeyKey = await deriveWrappingKey(prfBytes, ctx)
    expect(await unwrapKeyUnder(passkeyKey, record.vault_key_wayin_wrapped, ctx, { extractable: false, usage: ['wrapKey'] })).to.be.instanceOf(CryptoKey)
  })

  it("a box's two wraps and the lease's open only under the ctx bytes they have always been made with", async () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    const deviceDB = memoryDeviceDB()
    const vault = await TH.settledVault({
      applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB, deviceDB, clock: { now: () => Date.parse('2026-10-14T12:00:00Z') },
      keyDeriver: TH.testDeriver, strengthChecker: TH.anyStrengthChecker, logger: TH.spyLogger().logger,
    })
    await vault.unlock('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const vaultProps = (await TH.propsOf(vaultDB, scope))!
    const box = (await TH.expectingGood(vaultDB).getBox(scope, 'anthropic', { vault_tok: vaultProps.vault_tok }))!
    const lease = (await TH.expectGood(deviceDB.getLease(scope)))!
    const scopeText = `"acme","u1","main","${vaultProps.vault_tok}"`
    const header = `{"boxlabel":"anthropic","registered_at":${String(box.registered_at)},"revision_tok":"${box.revision_tok}","sidecar":"{}","whisper_codec":"json_v1","whisper_schema_version":1,"written_at":${String(box.written_at)}}`
    const keyCtx = textBytes(`["safebyok-box-v8",${scopeText},"box_key_wrapped",${header}]`)
    const whisperCtx = textBytes(`["safebyok-box-v8",${scopeText},"whisper_ciphered",${header}]`)
    const leaseCtx = textBytes(`["safebyok-lease-v1",${scopeText},${String(lease.gate_epoch)},${String(lease.ask_passphrase_at)},"vault_key_lease_wrapped"]`)

    const { passphrase } = GatedVaultProps.parse(vaultProps)
    const wayinKey = await passphraseKeyOf(TH.testDeriver, 'pw', fromB64(passphrase.salt_b64))
    const wayinCtx = wayinCtxOf(scope, vaultProps.vault_tok, headerOf(passphrase))
    const vaultKey = await unwrapKeyUnder(wayinKey, passphrase.vault_key_wayin_wrapped, wayinCtx, { extractable: false, usage: ['unwrapKey'] })
    const boxKey = await unwrapKeyUnder(vaultKey, box.box_key_wrapped, keyCtx, { extractable: false, usage: ['decrypt'] })
    expect(new TextDecoder().decode(await decipherBytes(boxKey, box.whisper_ciphered, whisperCtx))).to.include('sk-fake')
    expect(await unwrapKeyUnder(lease.lease_key, lease.vault_key_lease_wrapped, leaseCtx, { extractable: false, usage: ['wrapKey'] })).to.be.instanceOf(CryptoKey)
  })
})

