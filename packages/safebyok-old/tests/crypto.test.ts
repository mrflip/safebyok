import { describe, expect, it } from 'vitest'
import { cipherCtx, cipherBytes, decipherBytes, deriveWrappingKey, fromB64, fromB64OrNull, importWrappingKeyBytes, makeLeaseKey, makeBoxKey, makeLifeTok, makeVaultKey, randomBytes, randomId, toB64, unwrapKeyUnder, wrapKeyUnder, type CipherCtxRecord } from '../src/crypto'
import * as TH from './test-helpers'
import { vault_tok } from '../src/shapes/fields'

const utf8 = (text: string) => new TextEncoder().encode(text)

describe("base64url text", () => {
  it("round-trips bytes exactly", () => {
    const bytes = randomBytes(33)
    expect(fromB64(toB64(bytes))).to.deep.equal(bytes)
  })

  it("refuses text that is not base64url", () => {
    expect(() => fromB64('not/base64url+!')).to.throw(/Unknown letter/)
  })

  it("reads base64url text as bytes, or null for text that is not base64url, as fromB64OrNull's examples show", () => {
    expect(fromB64OrNull('Y3JlZC1sYXB0b3A')).to.have.lengthOf(11)
    expect(fromB64OrNull('not/base64url+!')).to.be.null
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

  it("makeLifeTok mints distinct life toks, each a token vault_tok accepts", () => {
    const tok = makeLifeTok()
    expect(vault_tok.parse(tok)).to.eq(tok)
    expect(tok).to.not.eq(makeLifeTok())
  })
})

/** A ctx for a test of the primitives alone, under one stamp, its purpose `purpose`. */
const ctxOf = (purpose: string) => cipherCtx({ test: 'crypto' }, purpose)

/** A vault's stamp, a box's and a wayin's header, as plain records: what the cipherCtx cases are built of. */
const vaultStamp = { format: 'safebyok-vault-v6', applabel: 'acme', user_id: 'u1', vaultlabel: 'main', vault_tok: 'vid', registered_at: 1 }
const boxStamp = { boxlabel: 'anthropic', revision_tok: 'r1', written_at: 2 }
const header = { wayinkind: 'passphrase', key_deriver_label: 'test_digest_v0', salt_b64: 'c2FsdA', device_id: 'd1', registered_at: 3 }

describe("cipherCtx", () => {
  it("binds a vault's stamp, a purpose and a header, as its first example shows: the same parts make the same bytes, and other parts others", () => {
    const one = cipherCtx(vaultStamp, 'vault_key_passphrase_wrapped', header)
    expect(toB64(cipherCtx({ ...vaultStamp }, 'vault_key_passphrase_wrapped', { ...header }))).to.eq(toB64(one))
    expect(toB64(cipherCtx({ ...vaultStamp, user_id: 'u2' }, 'vault_key_passphrase_wrapped', header))).to.not.eq(toB64(one))
    expect(toB64(cipherCtx(vaultStamp, 'vault_key_passkey_wrapped', header))).to.not.eq(toB64(one))
    expect(toB64(cipherCtx(vaultStamp, 'vault_key_passphrase_wrapped', { ...header, registered_at: 4 }))).to.not.eq(toB64(one))
    expect(toB64(cipherCtx(vaultStamp, 'vault_key_passphrase_wrapped'))).to.not.eq(toB64(one))
  })

  it("binds a list of stamps, each keeping its own field names, as its second example shows", () => {
    const { format: _format, ...vaultButFormat } = vaultStamp
    const both = cipherCtx([vaultButFormat, { ...boxStamp, registered_at: 5 }], 'box_key_wrapped')
    expect(new TextDecoder().decode(both)).to.eq('[{"applabel":"acme","registered_at":1,"user_id":"u1","vault_tok":"vid","vaultlabel":"main"},{"boxlabel":"anthropic","registered_at":5,"revision_tok":"r1","written_at":2},"box_key_wrapped"]')
    expect(toB64(cipherCtx([vaultButFormat, { ...boxStamp, registered_at: 6 }], 'box_key_wrapped')), 'the box\'s registered_at is its own').to.not.eq(toB64(both))
    expect(toB64(cipherCtx([{ ...vaultButFormat, registered_at: 6 }, { ...boxStamp, registered_at: 5 }], 'box_key_wrapped')), 'the vault\'s is the vault\'s').to.not.eq(toB64(both))
    expect(toB64(cipherCtx([{ ...boxStamp, registered_at: 5 }, vaultButFormat], 'box_key_wrapped')), 'the order of the list is bound').to.not.eq(toB64(both))
  })

  it("keeps parts apart even when their characters could smear together", () => {
    // A naive join would make ('ab','c') and ('a','bc') the same ctx; the encoding must not.
    expect(toB64(cipherCtx({ part: 'ab' }, 'c'))).to.not.eq(toB64(cipherCtx({ part: 'a' }, 'bc')))
  })

  it("encodes each record with its keys sorted, every field bound", () => {
    const sorted = cipherCtx({ revision_tok: 'r1', boxlabel: 'anthropic', written_at: 1 }, 'whisper_ciphered')
    expect(toB64(cipherCtx({ boxlabel: 'anthropic', written_at: 1, revision_tok: 'r1' }, 'whisper_ciphered'))).to.eq(toB64(sorted))
    expect(toB64(cipherCtx({ boxlabel: 'anthropic', written_at: 1, revision_tok: 'r1', sidecar: '{}' }, 'whisper_ciphered'))).to.not.eq(toB64(sorted))
  })

  it("refuses a record holding a field set to undefined as bad_option, rather than treating it as if it were not there", () => {
    const holding = { boxlabel: 'anthropic', written_at: 1, revision_tok: 'r1', sidecar: undefined } as unknown as CipherCtxRecord
    TH.expectSyncRefusal(() => cipherCtx(holding, 'whisper_ciphered'), 'bad_option')
    TH.expectSyncRefusal(() => cipherCtx([vaultStamp, holding], 'whisper_ciphered'), 'bad_option')
    TH.expectSyncRefusal(() => cipherCtx(vaultStamp, 'whisper_ciphered', holding), 'bad_option')
  })

  it("refuses a record holding a field set to null as bad_option, as it does one set to undefined", () => {
    const holding = { ...vaultStamp, registered_at: null } as unknown as CipherCtxRecord
    TH.expectSyncRefusal(() => cipherCtx(holding, 'vault_key_passphrase_wrapped'), 'bad_option')
    TH.expectSyncRefusal(() => cipherCtx([holding, boxStamp], 'box_key_wrapped'), 'bad_option')
    TH.expectSyncRefusal(() => cipherCtx(vaultStamp, 'vault_key_passphrase_wrapped', { ...header, device_id: null } as unknown as CipherCtxRecord), 'bad_option')
  })

  it("refuses a stamp, a purpose or a header that is undefined or null as bad_option, rather than treating it as null", () => {
    for (const missing of [undefined, null]) {
      const part = missing as unknown as CipherCtxRecord
      const err = TH.expectSyncRefusal(() => cipherCtx(part, 'vault_key_lease_wrapped'), 'bad_option')
      expect(err.message).to.include('undefined or null')
      TH.expectSyncRefusal(() => cipherCtx([vaultStamp, part], 'vault_key_lease_wrapped'), 'bad_option')
      TH.expectSyncRefusal(() => cipherCtx(vaultStamp, missing as unknown as string), 'bad_option')
      TH.expectSyncRefusal(() => cipherCtx(vaultStamp, 'vault_key_passphrase_wrapped', part), 'bad_option')
    }
  })

  it("refuses an empty list of stamps as bad_option: a ctx binds at least one", () => {
    TH.expectSyncRefusal(() => cipherCtx([], 'vault_key_lease_wrapped'), 'bad_option')
  })
})

describe("cipher and decipher", () => {
  it("round-trips bytes under a ctx", async () => {
    const boxKey = await makeBoxKey()
    const ctx = ctxOf('whisper_ciphered')
    const ciphered = await cipherBytes(boxKey, utf8('sk-ant-fake'), ctx)
    expect(new TextDecoder().decode(await decipherBytes(boxKey, ciphered, ctx))).to.eq('sk-ant-fake')
  })

  it("never repeats ciphertext or iv for the same plaintext", async () => {
    const boxKey = await makeBoxKey()
    const ctx = ctxOf('test')
    const one = await cipherBytes(boxKey, utf8('the same whisper'), ctx)
    const two = await cipherBytes(boxKey, utf8('the same whisper'), ctx)
    expect(one.cipher_iv_b64).to.not.eq(two.cipher_iv_b64)
    expect(one.ciphertext_b64).to.not.eq(two.ciphertext_b64)
  })

  it("refuses a different ctx: ciphertext does not travel", async () => {
    const boxKey = await makeBoxKey()
    const ciphered = await cipherBytes(boxKey, utf8('sk-ant-fake'), ctxOf('box_a'))
    await expect(decipherBytes(boxKey, ciphered, ctxOf('box_b'))).rejects.toThrow()
  })

  it("refuses altered ciphertext and the wrong key alike", async () => {
    const rightKey = await makeBoxKey()
    const wrongKey = await makeBoxKey()
    const ctx = ctxOf('test')
    const ciphered = await cipherBytes(rightKey, utf8('sk-ant-fake'), ctx)
    const bent = { ...ciphered, ciphertext_b64: TH.tweakB64(ciphered.ciphertext_b64) }
    await expect(decipherBytes(rightKey, bent, ctx)).rejects.toThrow()
    await expect(decipherBytes(wrongKey, ciphered, ctx)).rejects.toThrow()
  })
})

describe("wrap and unwrap", () => {
  it("round-trips a boxKey under a vaultKey, back as a working, non-extractable key", async () => {
    const vaultKey = await makeVaultKey()
    const boxKey = await makeBoxKey()
    const ctx = ctxOf('box_key_wrapped')
    const whisperCtx = ctxOf('whisper_ciphered')
    const ciphered = await cipherBytes(boxKey, utf8('sk-ant-fake'), whisperCtx)

    const wrapped = await wrapKeyUnder(vaultKey, boxKey, ctx)
    const recovered = await unwrapKeyUnder(vaultKey, wrapped, ctx, { extractable: false, usage: ['decrypt'] })
    expect(recovered.extractable).to.be.false
    expect(new TextDecoder().decode(await decipherBytes(recovered, ciphered, whisperCtx))).to.eq('sk-ant-fake')
  })

  it("refuses to unwrap under the wrong key or the wrong ctx", async () => {
    const vaultKey = await makeVaultKey()
    const otherKey = await makeVaultKey()
    const boxKey = await makeBoxKey()
    const wrapped = await wrapKeyUnder(vaultKey, boxKey, ctxOf('right'))
    await expect(unwrapKeyUnder(otherKey, wrapped, ctxOf('right'), { extractable: false, usage: ['decrypt'] })).rejects.toThrow()
    await expect(unwrapKeyUnder(vaultKey, wrapped, ctxOf('wrong'), { extractable: false, usage: ['decrypt'] })).rejects.toThrow()
  })

  it("a non-extractable unwrap refuses exportKey: the platform keeps the bytes", async () => {
    const vaultKey = await makeVaultKey()
    const boxKey = await makeBoxKey()
    const ctx = ctxOf('box_key_wrapped')
    const wrapped = await wrapKeyUnder(vaultKey, boxKey, ctx)
    const recovered = await unwrapKeyUnder(vaultKey, wrapped, ctx, { extractable: false, usage: ['decrypt'] })
    await expect(crypto.subtle.exportKey('raw', recovered)).rejects.toThrow()
  })

  it("a leaseKey is born non-extractable, and still wraps and unwraps", async () => {
    const leaseKey = await makeLeaseKey()
    expect(leaseKey.extractable).to.be.false
    const vaultKey = await makeVaultKey()
    const ctx = ctxOf('vault_key_lease_wrapped')
    const wrapped = await wrapKeyUnder(leaseKey, vaultKey, ctx)
    const recovered = await unwrapKeyUnder(leaseKey, wrapped, ctx, { extractable: true, usage: ['wrapKey', 'unwrapKey'] })
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
    const wrapped = await wrapKeyUnder(derived, vaultKey, ctxOf('kat'))
    const recovered = await unwrapKeyUnder(expected, wrapped, ctxOf('kat'), { extractable: true, usage: ['wrapKey'] })
    const rawOf = async (handle: CryptoKey) => toB64(new Uint8Array(await crypto.subtle.exportKey('raw', handle)))
    expect(await rawOf(recovered)).to.eq(await rawOf(vaultKey))
  })

  it("makes another key for other info, from the same bytes", async () => {
    const keyBytes = randomBytes(32)
    const one = await deriveWrappingKey(keyBytes, utf8('one'))
    const two = await deriveWrappingKey(keyBytes, utf8('two'))
    const wrapped = await wrapKeyUnder(one, await makeVaultKey(), ctxOf('slot'))
    await expect(unwrapKeyUnder(two, wrapped, ctxOf('slot'), { extractable: false, usage: ['wrapKey'] })).rejects.toThrow()
    const again = await deriveWrappingKey(keyBytes, utf8('one'))
    expect(await unwrapKeyUnder(again, wrapped, ctxOf('slot'), { extractable: false, usage: ['wrapKey'] })).to.be.instanceOf(CryptoKey)
  })

  it("is a non-extractable wrapping key", async () => {
    const derived = await deriveWrappingKey(randomBytes(32), utf8('info'))
    expect(derived.extractable).to.be.false
    expect(derived.usages).to.have.members(['wrapKey', 'unwrapKey'])
    await expect(crypto.subtle.exportKey('raw', derived)).rejects.toThrow()
  })
})
