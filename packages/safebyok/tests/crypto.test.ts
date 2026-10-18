import { describe, expect, it } from 'vitest'
import {
  cipherCtx, cipherBytes, decipherBytes, deriveWrappingKey, fromB64, importWrappingKeyBytes,
  makeLocalUnlockKey, makeLockboxKey, makeVaultKey, randomBytes, randomId, toB64, unwrapKeyUnder, wrapKeyUnder,
  type CipherCtxPart,
} from '../src/crypto'
import * as TH from './test-helpers'

const utf8 = (text: string) => new TextEncoder().encode(text)

describe("base64url text", () => {
  it("round-trips bytes exactly", () => {
    const bytes = randomBytes(33)
    expect(fromB64(toB64(bytes))).to.deep.equal(bytes)
  })

  it("refuses text that is not base64url", () => {
    expect(() => fromB64('not/base64url+!')).to.throw(/Unknown letter/)
  })
})

describe("random material", () => {
  it("randomBytes gives the asked-for count, fresh every call", () => {
    expect(randomBytes(16)).to.have.lengthOf(16)
    expect(toB64(randomBytes(16))).to.not.eq(toB64(randomBytes(16)))
  })

  it("randomId mints distinct ids", () => {
    expect(randomId()).to.not.eq(randomId())
  })
})

describe("cipherCtx", () => {
  it("is deterministic in its parts, and different parts never collide", () => {
    const one = cipherCtx('safebyok-vault-v1', 'acme', 'u1', 'main', 'vid', 1, 'vault_key_passphrase_wrapped')
    const same = cipherCtx('safebyok-vault-v1', 'acme', 'u1', 'main', 'vid', 1, 'vault_key_passphrase_wrapped')
    const other = cipherCtx('safebyok-vault-v1', 'acme', 'u2', 'main', 'vid', 1, 'vault_key_passphrase_wrapped')
    expect(toB64(one)).to.eq(toB64(same))
    expect(toB64(one)).to.not.eq(toB64(other))
  })

  it("keeps parts apart even when their characters could smear together", () => {
    // A naive join would make ('ab','c') and ('a','bc') the same ctx; the encoding must not.
    expect(toB64(cipherCtx('ab', 'c'))).to.not.eq(toB64(cipherCtx('a', 'bc')))
  })

  it("encodes a record part with its keys sorted, every field bound", () => {
    const header = cipherCtx('safebyok-lockbox-v5', { revision_id: 'r1', boxlabel: 'anthropic', written_at: 1 })
    expect(toB64(cipherCtx('safebyok-lockbox-v5', { boxlabel: 'anthropic', written_at: 1, revision_id: 'r1' }))).to.eq(toB64(header))
    expect(toB64(cipherCtx('safebyok-lockbox-v5', { boxlabel: 'anthropic', written_at: 1, revision_id: 'r1', sidecar_json: '{}' }))).to.not.eq(toB64(header))
  })

  it("refuses a record part holding a field set to undefined as bad_option, rather than treating it as if it were not there", () => {
    const holding = { boxlabel: 'anthropic', written_at: 1, revision_id: 'r1', sidecar_json: undefined } as unknown as CipherCtxPart
    TH.expectSyncRefusal(() => cipherCtx('safebyok-lockbox-v5', holding), 'bad_option')
  })

  it("refuses a part that is undefined or null as bad_option, rather than treating it as null", () => {
    for (const missing of [undefined, null]) {
      const part = missing as unknown as CipherCtxPart
      const err = TH.expectSyncRefusal(() => cipherCtx('safebyok-unlock-v1', 'acme', part, 'main'), 'bad_option')
      expect(err.message).to.include('undefined or null')
      TH.expectSyncRefusal(() => cipherCtx(part), 'bad_option')
    }
  })
})

describe("cipher and decipher", () => {
  it("round-trips bytes under a ctx", async () => {
    const lockboxKey = await makeLockboxKey()
    const ctx = cipherCtx('test', 'whisper_ciphered')
    const ciphered = await cipherBytes(lockboxKey, utf8('sk-ant-fake'), ctx)
    expect(new TextDecoder().decode(await decipherBytes(lockboxKey, ciphered, ctx))).to.eq('sk-ant-fake')
  })

  it("never repeats ciphertext or iv for the same plaintext", async () => {
    const lockboxKey = await makeLockboxKey()
    const ctx = cipherCtx('test')
    const one = await cipherBytes(lockboxKey, utf8('the same whisper'), ctx)
    const two = await cipherBytes(lockboxKey, utf8('the same whisper'), ctx)
    expect(one.cipher_iv_b64).to.not.eq(two.cipher_iv_b64)
    expect(one.ciphertext_b64).to.not.eq(two.ciphertext_b64)
  })

  it("refuses a different ctx: ciphertext does not travel", async () => {
    const lockboxKey = await makeLockboxKey()
    const ciphered = await cipherBytes(lockboxKey, utf8('sk-ant-fake'), cipherCtx('box_a'))
    await expect(decipherBytes(lockboxKey, ciphered, cipherCtx('box_b'))).rejects.toThrow()
  })

  it("refuses altered ciphertext and the wrong key alike", async () => {
    const rightKey = await makeLockboxKey()
    const wrongKey = await makeLockboxKey()
    const ctx = cipherCtx('test')
    const ciphered = await cipherBytes(rightKey, utf8('sk-ant-fake'), ctx)
    const bent = { ...ciphered, ciphertext_b64: TH.tweakB64(ciphered.ciphertext_b64) }
    await expect(decipherBytes(rightKey, bent, ctx)).rejects.toThrow()
    await expect(decipherBytes(wrongKey, ciphered, ctx)).rejects.toThrow()
  })
})

describe("wrap and unwrap", () => {
  it("round-trips a lockboxKey under a vaultKey, back as a working, non-extractable key", async () => {
    const vaultKey = await makeVaultKey()
    const lockboxKey = await makeLockboxKey()
    const ctx = cipherCtx('lockbox_key_wrapped')
    const whisperCtx = cipherCtx('whisper_ciphered')
    const ciphered = await cipherBytes(lockboxKey, utf8('sk-ant-fake'), whisperCtx)

    const wrapped = await wrapKeyUnder(vaultKey, lockboxKey, ctx)
    const recovered = await unwrapKeyUnder(vaultKey, wrapped, ctx, { extractable: false, usage: ['decrypt'] })
    expect(recovered.extractable).to.be.false
    expect(new TextDecoder().decode(await decipherBytes(recovered, ciphered, whisperCtx))).to.eq('sk-ant-fake')
  })

  it("refuses to unwrap under the wrong key or the wrong ctx", async () => {
    const vaultKey = await makeVaultKey()
    const otherKey = await makeVaultKey()
    const lockboxKey = await makeLockboxKey()
    const wrapped = await wrapKeyUnder(vaultKey, lockboxKey, cipherCtx('right'))
    await expect(unwrapKeyUnder(otherKey, wrapped, cipherCtx('right'), { extractable: false, usage: ['decrypt'] })).rejects.toThrow()
    await expect(unwrapKeyUnder(vaultKey, wrapped, cipherCtx('wrong'), { extractable: false, usage: ['decrypt'] })).rejects.toThrow()
  })

  it("a non-extractable unwrap refuses exportKey: the platform keeps the bytes", async () => {
    const vaultKey = await makeVaultKey()
    const lockboxKey = await makeLockboxKey()
    const ctx = cipherCtx('lockbox_key_wrapped')
    const wrapped = await wrapKeyUnder(vaultKey, lockboxKey, ctx)
    const recovered = await unwrapKeyUnder(vaultKey, wrapped, ctx, { extractable: false, usage: ['decrypt'] })
    await expect(crypto.subtle.exportKey('raw', recovered)).rejects.toThrow()
  })

  it("a localUnlockKey is born non-extractable, and still wraps and unwraps", async () => {
    const localUnlockKey = await makeLocalUnlockKey()
    expect(localUnlockKey.extractable).to.be.false
    const vaultKey = await makeVaultKey()
    const ctx = cipherCtx('vault_key_local_wrapped')
    const wrapped = await wrapKeyUnder(localUnlockKey, vaultKey, ctx)
    const recovered = await unwrapKeyUnder(localUnlockKey, wrapped, ctx, { extractable: true, usage: ['wrapKey', 'unwrapKey'] })
    expect(recovered).to.be.instanceOf(CryptoKey)
  })
})

/** Hex text to bytes, for a published test vector. */
const hexBytes = (hex: string) => Uint8Array.from(hex.match(/../gu) ?? [], (pair) => Number.parseInt(pair, 16))

describe("deriveWrappingKey", () => {
  it("is HKDF-SHA256 with no salt: RFC 5869's test case 3 makes the same key", async () => {
    // RFC 5869, A.3: IKM 22 bytes of 0x0b, no salt, no info; the first 32 bytes of its OKM.
    const derived = await deriveWrappingKey(new Uint8Array(22).fill(0x0B), new Uint8Array(0))
    const expected = await importWrappingKeyBytes(hexBytes('8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d'))
    const vaultKey = await makeVaultKey()
    const wrapped = await wrapKeyUnder(derived, vaultKey, cipherCtx('kat'))
    const recovered = await unwrapKeyUnder(expected, wrapped, cipherCtx('kat'), { extractable: true, usage: ['wrapKey'] })
    const rawOf = async (handle: CryptoKey) => toB64(new Uint8Array(await crypto.subtle.exportKey('raw', handle)))
    expect(await rawOf(recovered)).to.eq(await rawOf(vaultKey))
  })

  it("makes another key for other info, from the same bytes", async () => {
    const keyBytes = randomBytes(32)
    const one = await deriveWrappingKey(keyBytes, utf8('one'))
    const two = await deriveWrappingKey(keyBytes, utf8('two'))
    const wrapped = await wrapKeyUnder(one, await makeVaultKey(), cipherCtx('slot'))
    await expect(unwrapKeyUnder(two, wrapped, cipherCtx('slot'), { extractable: false, usage: ['wrapKey'] })).rejects.toThrow()
    const again = await deriveWrappingKey(keyBytes, utf8('one'))
    expect(await unwrapKeyUnder(again, wrapped, cipherCtx('slot'), { extractable: false, usage: ['wrapKey'] })).to.be.instanceOf(CryptoKey)
  })

  it("is a non-extractable wrapping key", async () => {
    const derived = await deriveWrappingKey(randomBytes(32), utf8('info'))
    expect(derived.extractable).to.be.false
    expect(derived.usages).to.have.members(['wrapKey', 'unwrapKey'])
    await expect(crypto.subtle.exportKey('raw', derived)).rejects.toThrow()
  })
})
