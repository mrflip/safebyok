/** Every call into WebCrypto: AES-256-GCM encryption and key wrapping, the key makers, HKDF and randomness.
 * Every encryption binds a {@link cipherCtx} as additional data, so ciphertext moved anywhere else will not open.
 * Key derivation from a passphrase is in `deriver/`.
 */

import { base64urlnopad } from '@scure/base'
import type { Ciphered } from '../shapes/shapes-core'
import * as Phrases from './phrases'
import { stableJsonify } from './stable-jsonify'
import { Checker } from './validator'

// == [Constants]: AesGcm, IvSize

const AesGcm = { name: 'AES-GCM', length: 256 } as const
const IvSize = 12
// --

// == [Randomness and base64]: randomBytes, randomId, makeLifeTok, toB64, fromB64, fromB64OrNull

/** `count` cryptographically secure random bytes, from the platform. */
export function randomBytes(count: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(count))
}

/** A fresh random UUID, for a token such as a `revision_tok` or a `device_tok`. */
export function randomId(): string { return crypto.randomUUID() }

/** A fresh life tok: the `bank_tok`, `gate_tok`, `vault_tok` or `box_tok` minted at each birth of what it marks. */
export function makeLifeTok(): string { return randomId() }

/** `bytes` as unpadded base64url text, the `_b64` form every stored record uses. */
export function toB64(bytes: Uint8Array): string { return base64urlnopad.encode(bytes) }

/** Base64url text back to bytes. Throws on other text: {@link fromB64OrNull} returns null instead. */
export function fromB64(b64: string): Uint8Array { return base64urlnopad.decode(b64) }

/** Base64url text back to bytes, or null for text that is not base64url.
 *
 * @example fromB64OrNull('not/base64url+!')           // null
 */
export function fromB64OrNull(b64: string): Uint8Array | null {
  try {
    return fromB64(b64)
  } catch {
    return null
  }
}
// --

// == [The ctx]: CipherCtxRecord, cipherCtx, ctxBound, isBoundCtx, isBoundPart

/** A stamp or a header in a {@link cipherCtx}: a flat record of strings and numbers, every field bound, encoded with its keys sorted. */
export type CipherCtxRecord = Readonly<Record<string, string | number>>

/** The bytes an encryption is bound to, as AES-GCM additional data or HKDF info: the thing's stamp, a purpose, and its visible header if any.
 * The purpose is the name of the field the ciphertext is stored in. Pass a list of stamps where a thing
 * binds the stamp of what it lies in beside its own. The ctx is rebuilt at each use, never stored, so
 * ciphertext opens only where every bound field is the same.
 * It refuses a call with no stamp, or with a part or field undefined or null, since each would bind the same as some other ctx.
 *
 * @example cipherCtx([bankStamp, gateStamp], 'bank_key_passphrase_wrapped', { wayinkind: 'passphrase', wayinlabel: 'main', key_deriver_label, salt_b64, device_tok, registered_at })
 * @example cipherCtx([bankStamp, leaseStamp], 'bank_key_lease_wrapped')
 */
export function cipherCtx(stamp: CipherCtxRecord | readonly CipherCtxRecord[], purpose: string, ...header: [] | [CipherCtxRecord]): Uint8Array {
  const stamps: readonly CipherCtxRecord[] = Array.isArray(stamp) ? stamp : [stamp as CipherCtxRecord]
  const parts = [...stamps, purpose, ...header]
  ctxBound.parse({ stamps, parts })
  return new TextEncoder().encode(stableJsonify(parts))
}

/** The check that a ctx has a stamp and every part is bound. */
const ctxBound = Checker(({ custom }) => custom((bag) => isBoundCtx(bag as CtxBag), Phrases.UnboundCipherCtx), 'unexpected_error')

/** True when a ctx has a stamp and each of its parts is bound. */
function isBoundCtx({ stamps, parts }: CtxBag): boolean { return stamps.length > 0 && parts.every((part) => isBoundPart(part)) }

/** A ctx's stamps and its parts, for {@link ctxBound}. */
type CtxBag = { stamps: readonly unknown[], parts: readonly (CipherCtxRecord | string)[] }

// The type forbids undefined and null, in a part or a record's field, but a caller may still hand them in.
/** True when `part` is a string, or a record with no field undefined or null. */
function isBoundPart(part: CipherCtxRecord | string | null | undefined): boolean {
  return (
    (part !== undefined) && (part !== null)
    && ((typeof part !== 'object') || Object.values(part as Readonly<Record<string, unknown>>).every((val) => (val !== undefined) && (val !== null)))
  )
}
// --

// == [Making keys]: makeBankKey, makeBoxKey, makeLeaseKey, importWrappingKeyBytes, deriveWrappingKey

/** A fresh random bankKey, a 256-bit AES-GCM key for wrapping other keys.
 * It is extractable, as a key must be to be wrapped: keep it only inside the operation that wraps it.
 */
export function makeBankKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(AesGcm, true, ['wrapKey', 'unwrapKey'])
}

/** A fresh random boxKey, the 256-bit AES-GCM key for one seal of a whisper. It is extractable, so that it can be wrapped. */
export function makeBoxKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(AesGcm, true, ['encrypt', 'decrypt'])
}

/** A fresh random leaseKey, a non-extractable 256-bit AES-GCM key for wrapping.
 * No code can read its bytes, even the code that made it: store the `CryptoKey` itself, by structured clone.
 */
export function makeLeaseKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(AesGcm, false, ['wrapKey', 'unwrapKey'])
}

/** Import a key deriver's output bytes as the passphraseKey, a non-extractable AES-GCM wrapping key.
 * The bytes stay the caller's to zero.
 */
export function importWrappingKeyBytes(keyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', keyBytes as BufferSource, AesGcm, false, ['wrapKey', 'unwrapKey'])
}

/** Derive the passkeyKey, a non-extractable AES-GCM wrapping key, from a passkey's PRF bytes by HKDF-SHA256.
 * `info` names what the key is for and where, so the same bytes under another `info` make another key.
 * No salt is used, the RFC 5869 default for uniformly random input. The bytes stay the caller's to zero.
 *
 * @example await deriveWrappingKey(prfBytes, cipherCtx([bankStamp, gateStamp], 'bank_key_passkey_wrapped', header))
 */
export async function deriveWrappingKey(keyBytes: Uint8Array, info: Uint8Array): Promise<CryptoKey> {
  const inputKey = await crypto.subtle.importKey('raw', keyBytes as BufferSource, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: info as BufferSource },
    inputKey,
    AesGcm,
    false,
    ['wrapKey', 'unwrapKey'],
  )
}
// --

// == [Ciphering]: cipherBytes, decipherBytes

/** Encrypt `plainBytes` under `cipherKey`, bound to `ctx`, with a fresh random IV each call. */
export async function cipherBytes(cipherKey: CryptoKey, plainBytes: Uint8Array, ctx: Uint8Array): Promise<Ciphered> {
  const cipherIv = randomBytes(IvSize)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: cipherIv as BufferSource, additionalData: ctx as BufferSource },
    cipherKey,
    plainBytes as BufferSource,
  )
  return { cipher_iv_b64: toB64(cipherIv), ciphertext_b64: toB64(new Uint8Array(ciphertext)) }
}

/** Decrypt `ciphered` under `cipherKey`, verifying it against `ctx`.
 * It rejects with WebCrypto's DOMException when the key is wrong, the ctx differs, or the ciphertext was
 * altered: catch that and throw a refusal of your own.
 */
export async function decipherBytes(cipherKey: CryptoKey, ciphered: Ciphered, ctx: Uint8Array): Promise<Uint8Array> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(ciphered.cipher_iv_b64) as BufferSource, additionalData: ctx as BufferSource },
    cipherKey,
    fromB64(ciphered.ciphertext_b64) as BufferSource,
  )
  return new Uint8Array(plain)
}
// --

// == [Wrapping]: wrapKeyUnder, unwrapKeyUnder

/** Encrypt the extractable `wrappedKey` under `wrappingKey`, bound to `ctx`, with a fresh random IV each call. */
export async function wrapKeyUnder(wrappingKey: CryptoKey, wrappedKey: CryptoKey, ctx: Uint8Array): Promise<Ciphered> {
  const cipherIv = randomBytes(IvSize)
  const ciphertext = await crypto.subtle.wrapKey(
    'raw',
    wrappedKey,
    wrappingKey,
    { name: 'AES-GCM', iv: cipherIv as BufferSource, additionalData: ctx as BufferSource },
  )
  return { cipher_iv_b64: toB64(cipherIv), ciphertext_b64: toB64(new Uint8Array(ciphertext)) }
}

/** Unwrap `wrapped` under `wrappingKey`, verifying it against `ctx`.
 * It rejects with WebCrypto's DOMException on a wrong wrappingKey, a different ctx, or altered ciphertext.
 * That rejection is how a wrong passphrase or passkey shows: no key is compared.
 *
 * @param usages - What the unwrapped key may do, and whether it is extractable. Unwrap it
 *   non-extractable unless it is about to be wrapped again, and drop it after.
 */
export async function unwrapKeyUnder(
  wrappingKey: CryptoKey,
  wrapped: Ciphered,
  ctx: Uint8Array,
  usages: { extractable: boolean, usage: readonly KeyUsage[] },
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    'raw',
    fromB64(wrapped.ciphertext_b64) as BufferSource,
    wrappingKey,
    { name: 'AES-GCM', iv: fromB64(wrapped.cipher_iv_b64) as BufferSource, additionalData: ctx as BufferSource },
    AesGcm,
    usages.extractable,
    [...usages.usage],
  )
}
// --
