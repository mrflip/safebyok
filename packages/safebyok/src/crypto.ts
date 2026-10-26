import { base64urlnopad } from '@scure/base'
import type * as Z from 'zod'
import { VaultError } from './errors'
import { Validator } from './checks/validator'
import { stableJsonify } from './stable-jsonify'

/** The cryptography under the vault: AES-256-GCM encryption and key wrapping through WebCrypto, every primitive the platform's.
 * Every encryption binds a {@link cipherCtx} as AES-GCM's additional data, so ciphertext copied
 * anywhere else refuses to open. Key derivation from a passphrase is in key-deriver.ts.
 */

/** An encrypted value as stored, a wrapped key or a ciphered whisper: its cipherIv and its ciphertext (tag on the end), each base64url text. Its `parse` refuses 'bad_record', and it is strict. */
export const { Ciphered } = Validator('bad_record', ({ obj, str }) => ({
  Ciphered: obj({
    cipher_iv_b64:  str.min(1),
    ciphertext_b64: str.min(1),
  }).strict(),
}))
export type Ciphered = Z.infer<typeof Ciphered>

/** `count` cryptographically secure random bytes, from the platform. */
export const randomBytes = (count: number): Uint8Array => (
  crypto.getRandomValues(new Uint8Array(count))
)

/** A fresh random UUID from the platform, for a vaultTok or revisionTok. */
export const randomId = (): string => crypto.randomUUID()

/** Bytes as unpadded base64url text: the `_b64` form every stored record uses.
 *
 * @example toB64(new TextEncoder().encode('cred-laptop'))  // 'Y3JlZC1sYXB0b3A'
 */
export const toB64 = (bytes: Uint8Array): string => base64urlnopad.encode(bytes)

/** Base64url text back to bytes; throws on other text, where {@link fromB64OrNull} answers null.
 *
 * @example new TextDecoder().decode(fromB64('Y3JlZC1sYXB0b3A'))  // 'cred-laptop'
 */
export const fromB64 = (b64: string): Uint8Array => base64urlnopad.decode(b64)

/** Base64url text back to bytes, or null for text that is not base64url: for judging a salt's shape.
 *
 * @example fromB64OrNull('Y3JlZC1sYXB0b3A')?.length   // 11
 * @example fromB64OrNull('not/base64url+!')           // null
 */
export const fromB64OrNull = (b64: string): Uint8Array | null => {
  try {
    return fromB64(b64)
  } catch {
    return null
  }
}

const AesGcm = { name: 'AES-GCM', length: 256 } as const
const IvBytes = 12

/** One record of a {@link cipherCtx}, a stamp or a header: a flat record of strings and numbers, encoded with its keys sorted, every field bound. */
export type CipherCtxRecord = Readonly<Record<string, string | number>>

/** The ctx an encryption is bound to, as AES-GCM additional data or HKDF info: the thing's stamp, the purpose its slot names, and its visible header.
 * The stamp is one record, or a list of them where a thing binds the stamp of what it lies in
 * beside its own: each keeps its own field names. The ctx is the UTF-8 JSON of the parts in order,
 * each stamp, the purpose, then the header where there is one, each record's keys sorted. It is
 * rebuilt rather than stored, so ciphertext refuses to open under any other. It refuses
 * 'bad_option' for no stamp, or for a part or a record's field that is undefined or null: each
 * would bind the same as some other ctx.
 *
 * @example cipherCtx(vaultStamp, 'vault_key_passphrase_wrapped', { wayinkind: 'passphrase', key_deriver_label, salt_b64, device_id, registered_at })
 * @example cipherCtx([vaultStampButFormat, leaseStamp], 'vault_key_lease_wrapped')
 */
export const cipherCtx = (stamp: CipherCtxRecord | readonly CipherCtxRecord[], purpose: string, ...header: [] | [CipherCtxRecord]): Uint8Array => {
  const stamps: readonly CipherCtxRecord[] = Array.isArray(stamp) ? stamp : [stamp as CipherCtxRecord]
  const parts = [...stamps, purpose, ...header]
  if (stamps.length === 0 || parts.some((part) => isUnbound(part))) {
    throw new VaultError('bad_option', "A cipher ctx was handed no stamp, or a part or a field of one that is undefined or null, which would bind as if it were something else, so nothing was encrypted or opened. This is a bug in the code calling it.")
  }
  return new TextEncoder().encode(stableJsonify(parts))
}

/** True when `part` is undefined or null, or a record with a field set to undefined: what its type forbids and a caller may still hand in. */
const isUnbound = (part: CipherCtxRecord | string | null | undefined): boolean => (
  part === undefined || part === null
  || (typeof part === 'object' && Object.values(part as Readonly<Record<string, unknown>>).includes(undefined))
)

/** A fresh random 256-bit AES-GCM key for wrapping other keys: a brand-new vaultKey.
 * It is extractable, as a key must be to be wrapped. So keep it only inside the operation that
 * wraps it. The vaultKey a vault holds between operations is a separate, non-extractable unwrap.
 */
export const makeVaultKey = (): Promise<CryptoKey> => (
  crypto.subtle.generateKey(AesGcm, true, ['wrapKey', 'unwrapKey'])
)

/** A fresh random 256-bit AES-GCM key for one box: a boxKey, made new on every store. Extractable, so that it can be wrapped. */
export const makeBoxKey = (): Promise<CryptoKey> => (
  crypto.subtle.generateKey(AesGcm, true, ['encrypt', 'decrypt'])
)

/** A fresh leaseKey, non-extractable so that it cannot leave the device even through the code that made it.
 * It persists only by structured clone (IndexedDB), never as bytes.
 */
export const makeLeaseKey = (): Promise<CryptoKey> => (
  crypto.subtle.generateKey(AesGcm, false, ['wrapKey', 'unwrapKey'])
)

/** A key deriver's output bytes as a non-extractable AES-GCM wrapping key: the passphraseKey.
 * The bytes stay with the caller: wipe or drop them promptly.
 */
export const importWrappingKeyBytes = (keyBytes: Uint8Array): Promise<CryptoKey> => (
  crypto.subtle.importKey('raw', keyBytes as BufferSource, AesGcm, false, ['wrapKey', 'unwrapKey'])
)

/** A non-extractable AES-GCM wrapping key made by HKDF-SHA256 from uniformly random secret bytes, a passkey's PRF output: the passkeyKey.
 * It uses no salt, the RFC 5869 default for uniform input. `info` names what the key is for and
 * where, so the same bytes put to another use make another key. The bytes stay with the caller:
 * drop them promptly.
 *
 * @example await deriveWrappingKey(prfBytes, cipherCtx(vaultStamp, 'vault_key_passkey_wrapped', header))
 */
export const deriveWrappingKey = async (keyBytes: Uint8Array, info: Uint8Array): Promise<CryptoKey> => {
  const inputKey = await crypto.subtle.importKey('raw', keyBytes as BufferSource, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: info as BufferSource },
    inputKey,
    AesGcm,
    false,
    ['wrapKey', 'unwrapKey'],
  )
}

/** `plainBytes` encrypted under `cipherKey`, bound to `ctx`, under a fresh cipherIv every call. */
export const cipherBytes = async (cipherKey: CryptoKey, plainBytes: Uint8Array, ctx: Uint8Array): Promise<Ciphered> => {
  const cipherIv = randomBytes(IvBytes)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: cipherIv as BufferSource, additionalData: ctx as BufferSource },
    cipherKey,
    plainBytes as BufferSource,
  )
  return { cipher_iv_b64: toB64(cipherIv), ciphertext_b64: toB64(new Uint8Array(ciphertext)) }
}

/** The plain bytes back out of a {@link Ciphered}, verifying its tag and `ctx`.
 * It rejects with WebCrypto's DOMException when the key is wrong, the ctx differs, or the
 * ciphertext was altered. The caller turns that into its own calm refusal.
 */
export const decipherBytes = async (cipherKey: CryptoKey, ciphered: Ciphered, ctx: Uint8Array): Promise<Uint8Array> => {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(ciphered.cipher_iv_b64) as BufferSource, additionalData: ctx as BufferSource },
    cipherKey,
    fromB64(ciphered.ciphertext_b64) as BufferSource,
  )
  return new Uint8Array(plain)
}

/** `wrappedKey`, which must be extractable, encrypted under `wrappingKey` and bound to `ctx`, under a fresh cipherIv every call. */
export const wrapKeyUnder = async (wrappingKey: CryptoKey, wrappedKey: CryptoKey, ctx: Uint8Array): Promise<Ciphered> => {
  const cipherIv = randomBytes(IvBytes)
  const ciphertext = await crypto.subtle.wrapKey(
    'raw',
    wrappedKey,
    wrappingKey,
    { name: 'AES-GCM', iv: cipherIv as BufferSource, additionalData: ctx as BufferSource },
  )
  return { cipher_iv_b64: toB64(cipherIv), ciphertext_b64: toB64(new Uint8Array(ciphertext)) }
}

/** The key back out of a wrapped key, verifying its tag and `ctx`.
 * It rejects with WebCrypto's DOMException on a wrong wrappingKey, a different ctx, or altered
 * ciphertext. For a wayin, that rejection is how a wrong proof is learned: there is no comparison.
 *
 * @param usages - What the recovered key may do, and whether it is extractable. Unwrap
 *   non-extractable unless the operation is about to wrap the key again, and drop it after.
 */
export const unwrapKeyUnder = async (
  wrappingKey: CryptoKey,
  wrapped: Ciphered,
  ctx: Uint8Array,
  usages: { extractable: boolean, usage: readonly KeyUsage[] },
): Promise<CryptoKey> => (
  crypto.subtle.unwrapKey(
    'raw',
    fromB64(wrapped.ciphertext_b64) as BufferSource,
    wrappingKey,
    { name: 'AES-GCM', iv: fromB64(wrapped.cipher_iv_b64) as BufferSource, additionalData: ctx as BufferSource },
    AesGcm,
    usages.extractable,
    [...usages.usage],
  )
)
