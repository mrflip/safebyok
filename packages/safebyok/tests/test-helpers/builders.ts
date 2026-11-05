import type { Ciphered, BoxKeyWrapped, VaultKeyLeaseWrapped, VaultKeyWayinWrapped, WhisperCiphered }                                                                                                                              from '../../src/shapes/fields'
import type { PasskeyAnswer } from '../../src/shapes/vault'
import type { PassphraseWayinRecord } from '../../src/models/models-shapes'
import      * as FX                                 from '../../src/shapes/fields'
import      { toB64 }                               from '../../src/helpers/crypto'
import type { KeyDeriver }                          from '../../src/deriver/basederiver'
import      { type StrengthChecker, StrongVerdict } from '../../src/helpers/passphrase-strength'
import type { VaultScope }                          from '../../src/shapes/scopes'

/**
 * A cheap KeyDeriver for tests: one SHA-256 instead of 64 MiB of Argon2id, so a suite full of
 * unlocking runs in milliseconds. Deterministic in passphrase and salt, like the real one; unlike
 * the real one, worthless against a brute-forcer -- which is why its label says `test`. Never
 * hand it to a vault that holds a real secret.
 *
 * @example Bank.make({ ...opts, keyDeriver: testDeriver })
 */
export const testDeriver: KeyDeriver = {
  key_deriver_label: 'test_digest_v0',
  salt_bytes:        16,
  deriveKeyBytes: async (passphrase, saltBytes) => {
    const passphraseBytes = new TextEncoder().encode(passphrase)
    const joined = new Uint8Array(passphraseBytes.length + saltBytes.length)
    joined.set(passphraseBytes)
    joined.set(saltBytes, passphraseBytes.length)
    return new Uint8Array(await crypto.subtle.digest('SHA-256', joined))
  },
}

/**
 * A strengthChecker for tests, admitting every passphrase, so a suite may unlock with a
 * short one such as 'pw'. Never hand it to a vault that holds a real secret.
 *
 * @example Bank.make({ ...opts, strengthChecker: anyStrengthChecker })
 */
export const anyStrengthChecker: StrengthChecker = () => StrongVerdict

/** A Ciphered that opens under no key, so it stands in any ciphered role: what {@link fakeCiphered} makes. */
export type FakeCiphered = WhisperCiphered & BoxKeyWrapped & VaultKeyWayinWrapped & VaultKeyLeaseWrapped

/** A shape-valid Ciphered that opens nothing, in any ciphered role: for storage-layer tests, which never decrypt.
 * Opening under no key, it is no more one role's than another's, so it fills any ciphered field (a
 * box's `whisper_ciphered`, a wayin's wrap) without a parse.
 *
 * @example fakeCiphered('a1')  // => { cipher_iv_b64: 'iv-a1', ciphertext_b64: 'ct-a1' }
 * @example boxOf('anthropic', 'a1', { whisper_ciphered: fakeCiphered('SUPERSECRET') })
 */
export const fakeCiphered = (tag: string): FakeCiphered => {
  const fake: Ciphered = { cipher_iv_b64: `iv-${tag}`, ciphertext_b64: `ct-${tag}` }
  return fake as FakeCiphered
}

/**
 * The scope of `user_id`'s vault in the `acme` app.
 *
 * @example scopeOf('u1')           // => { applabel: 'acme', user_id: 'u1', vaultlabel: 'main' }
 * @example scopeOf('u1', 'spare')  // => { applabel: 'acme', user_id: 'u1', vaultlabel: 'spare' }
 */
export const scopeOf = (user_id: string, vaultlabel = 'main'): VaultScope => ({ applabel: 'acme', user_id, vaultlabel })

/**
 * A shape-valid passphrase wayin, its wrap fake (`wayin-<tag>`): for storage-layer tests, which
 * never decrypt. It wraps the vault's first vaultKey, and was sealed by `device-one`.
 *
 * @example wayinOf('passphrase')                                            // as gateOf's, but for its wrap
 * @example wayinOf('home_phrase', { registered_at: Date.UTC(2026, 9, 15) })
 */
export const wayinOf = (tag: string, overrides: Partial<PassphraseWayinRecord> = {}): PassphraseWayinRecord => ({
  wayinkind:               'passphrase',
  key_deriver_label:       'test_digest_v0',
  // base64 of the literal text 'saltsaltsaltsalt': a fake salt, public material anyway
  salt_b64:                FX.salt_b64.parse('c2FsdHNhbHRzYWx0c2FsdA'),
  device_id:               'device-one',
  registered_at:           Date.UTC(2026, 9, 14),
  vault_key_wayin_wrapped: fakeCiphered(`wayin-${tag}`),
  ...overrides,
})

/** SHA-256 of `text`'s UTF-8 bytes. */
const digestOf = async (text: string): Promise<Uint8Array> => (
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
)

/**
 * A passkey's answer, as a fake authenticator would give it: for tests, in place of a WebAuthn
 * call. The credential is `tag`'s own (its id base64url of `cred-<tag>`), the salt a 32-byte one
 * made from `tag` unless given, and the answer SHA-256 of the credential and salt -- so the same
 * passkey asked with the same salt answers the same, and with another salt answers otherwise, as
 * a real PRF does. Worthless as a secret: never hand it to a vault that holds a real one.
 *
 * @example await TH.putWayin(vault, 'pw', await passkeyOf('laptop'))
 * @example await TH.unlock(vault, await passkeyOf('laptop'))
 * @example await passkeyOf('laptop', otherSaltB64)  // the same credential, answering another salt
 */
export const passkeyOf = async (tag: string, prfSaltGiven?: string): Promise<PasskeyAnswer> => {
  const credential_id = toB64(new TextEncoder().encode(`cred-${tag}`))
  const saltB64 = prfSaltGiven ?? toB64(await digestOf(`salt-${tag}`))
  return { credential_id, prf_salt_b64: saltB64, prfBytes: await digestOf(`${credential_id}:${saltB64}`) }
}

/**
 * Base64url text, bent a little: its first character swapped for another valid one, so it is
 * always different, keeps its length, decodes whenever `b64` does, and a tamper test reaches the
 * check it means to exercise. Blank text has no character to bend, and nothing put in its place
 * decodes, so it throws: a tamper test aimed at an empty field is aimed at the wrong field.
 *
 * @param b64 - Base64url text, not blank.
 * @returns Text that differs from `b64` in its first character only.
 *
 * @example tweakB64('Zm9v') // 'am9v'
 * @example tweakB64('am9v') // 'bm9v'
 * @example tweakB64('')     // throws a TypeError
 */
export const tweakB64 = (b64: string): string => {
  if (b64 === '') { throw new TypeError('tweakB64 needs base64url text to bend, and was handed blank text.') }
  const replacer = b64.startsWith('a') ? 'b' : 'a'
  return replacer + b64.slice(1)
}
