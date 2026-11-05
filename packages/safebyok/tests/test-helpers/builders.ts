import type { Ciphered, BoxKeyWrapped, VaultKeyLeaseWrapped, VaultKeyWayinWrapped, WhisperCiphered }                                                                                                                              from '../../src/shapes/fields'
import      { type PasskeyAnswer, type GatedVaultRecord, type GateRecord, type PassphraseWayinRecord, type PasskeyWayinRecord, type VaultRecord, VaultFormat, type VaultDraft } from '../../src/shapes/vault'
import      * as FX                                 from '../../src/shapes/fields'
import      { toB64 }                               from '../../src/helpers/crypto'
import type { KeyDeriver }                          from '../../src/deriver/basederiver'
import      { type StrengthChecker, StrongVerdict } from '../../src/helpers/passphrase-strength'
import type { BoxRecord }    from '../../src/shapes/box'
import type { VaultScope }                          from '../../src/shapes/scopes'
import type { DeviceRecord, LeaseRecord }           from '../../src/shapes/device'

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

/**
 * A shape-valid passkey wayin, its wrap fake (`wayin-<tag>`) and its credential_id `cred-<tag>`:
 * for storage-layer tests, which never decrypt. It wraps the vault's first vaultKey, and was added
 * by `device-one`.
 *
 * @example passkeyWayinOf('laptop')
 * @example gateOf('u1', { passkey: passkeyWayinOf('laptop') })
 */
export const passkeyWayinOf = (tag: string, overrides: Partial<PasskeyWayinRecord> = {}): PasskeyWayinRecord => ({
  wayinkind:               'passkey',
  credential_id:           `cred-${tag}`,
  // base64 of the literal text 'prfsaltprfsaltprfsaltprfsaltprfs': a fake 32-byte salt, public material anyway
  prf_salt_b64:            FX.prf_salt_b64.parse('cHJmc2FsdHByZnNhbHRwcmZzYWx0cHJmc2FsdHByZnM'),
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

/** A shape-valid gate for `user_id`'s `main` vault: its passphrase a {@link wayinOf} whose wrap is `vault-<user_id>`, and no passkey.
 * For storage-layer tests, which never decrypt. Any field as `overrides` says otherwise.
 *
 * @example gateOf('u1', { passkey: passkeyWayinOf('laptop') })
 */
export const gateOf = (user_id: string, overrides: Partial<GateRecord> = {}): GateRecord => ({
  passphrase:          wayinOf(`vault-${user_id}`, { vault_key_wayin_wrapped: fakeCiphered(`vault-${user_id}`) }),
  passkey:             null,
  ...overrides,
})

/** A shape-valid gated vault record for `user_id`'s `main` vault, its gate a {@link gateOf}'s.
 * For storage-layer tests, which never decrypt. Its vault_tok is `vault-tok-<user_id>`, its
 * vault_epoch and gate_epoch 1.
 *
 * @example vaultRecordOf('u1', { gate_epoch: 2 })
 * @example vaultRecordOf('u1', { gate: gateOf('u1', { passkey: passkeyWayinOf('laptop') }) })
 */
export const vaultRecordOf = (user_id: string, overrides: Partial<GatedVaultRecord> = {}): GatedVaultRecord => ({
  format:              VaultFormat,
  ...scopeOf(user_id),
  vault_tok:           `vault-tok-${user_id}`,
  registered_at:       Date.UTC(2026, 9, 14),
  vault_epoch:         1,
  gate_epoch:          1,
  gate:                gateOf(user_id),
  ...overrides,
})

/** The novel vault record a vault is first stored as, for `user_id`'s `main` vault: `gate_epoch` 0 and no gate.
 * Otherwise as {@link vaultRecordOf} makes it, its vault_tok `vault-tok-<user_id>`. With a
 * `vault_epoch`, it is no draft but the new life a store makes of one over a tombstone, the counter
 * carried on.
 *
 * @example vaultDB.tryEnsureVault(gatelessOf('u1'))
 * @example gatelessOf('u1', { vault_tok: 'vault-tok-two' })
 * @example gatelessOf('u1', { vault_epoch: 2 })   // a new life, as a read over a tombstone shows it
 */
export function gatelessOf(user_id: string, overrides?: Partial<VaultDraft>): VaultDraft
export function gatelessOf(user_id: string, overrides: Partial<Omit<VaultDraft, 'vault_epoch'>> & Pick<VaultRecord, 'vault_epoch'>): VaultRecord
export function gatelessOf(user_id: string, overrides: Partial<VaultRecord> = {}): VaultRecord {
  return {
    format:              VaultFormat,
    ...scopeOf(user_id),
    vault_tok:           `vault-tok-${user_id}`,
    registered_at:       Date.UTC(2026, 9, 14),
    vault_epoch:         0,
    gate_epoch:          0,
    gate:                null,
    ...overrides,
  }
}

/**
 * A shape-valid BoxRecord for storage-layer tests, its ciphered fields fake: revision `rev-<tag>`,
 * with the sidecar `{ note: 'a test box' }` unless
 * `overrides` says otherwise.
 *
 * @example boxOf('anthropic_api_key', 'a1', { sidecar: { note: 'work account' } })
 */
export const boxOf = (boxlabel: string, tag: string, overrides: Partial<BoxRecord> = {}): BoxRecord => ({
  format:                 'safebyok-box-v8',
  boxlabel,
  revision_tok:           `rev-${tag}`,
  box_key_wrapped:        fakeCiphered(`boxkey-${tag}`),
  whisper_ciphered:       fakeCiphered(`whisper-${tag}`),
  whisper_codec:          'json_v1',
  whisper_schema_version: 1,
  sidecar:                { note: 'a test box' },
  registered_at:          Date.UTC(2026, 9, 14),
  written_at:             Date.UTC(2026, 9, 14),
  ...overrides,
})

/** Labels that differ only by an underscore, a digit or where an underscore falls: the nearest neighbours a store's keys might run together. */
export const OddLabels = Object.freeze([
  'main', 'main_x', 'mainx', 'main_1', 'main1', 'ma_in', 'mai_n', 'm_ain',
] as const)

/**
 * What a write into {@link vaultRecordOf}('u1')'s vault expects when its box is not there yet:
 * that vault, under its first vaultKey, and no revision. Frozen, since every test shares it.
 *
 * @example vaultDB.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one'))
 */
export const noBoxYet = Object.freeze({ vault_tok: 'vault-tok-u1', revision_tok: null } as const)

/** What a box read in {@link vaultRecordOf}('u1')'s vault expects: that vault.
 * Frozen, since every test shares it.
 *
 * @example vaultDB.tryGetBox(TH.scopeOf('u1'), 'anthropic', TH.inThisVault)
 */
export const inThisVault = Object.freeze({ vault_tok: 'vault-tok-u1' } as const)

/**
 * What a deletion of {@link vaultRecordOf}('u1')'s vault expects: that vault, at its first gate.
 * Frozen, since every test shares it.
 *
 * @example vaultDB.tryDelVault(TH.scopeOf('u1'), TH.thisVault)
 */
export const thisVault = Object.freeze({ vault_tok: 'vault-tok-u1', gate_epoch: 1 } as const)

/**
 * What a deletion of a box in {@link vaultRecordOf}('u1')'s vault expects: that vault, and
 * the revision the deleting device read -- `rev-` and its tag, for a box {@link boxOf} made --
 * or null, for one listed with none.
 *
 * @example vaultDB.tryDelBox(TH.scopeOf('u1'), 'anthropic', TH.deleting('rev-one'))
 */
export const deleting = (revisionTok: string | null) => ({ vault_tok: 'vault-tok-u1', revision_tok: revisionTok })

/** A shape-valid DeviceRecord for device-storage tests: `user_id`'s `main` vault, its device `device-one`, having seen `vault_epoch` 1.
 * Any field as `overrides` says otherwise.
 *
 * @example await deviceDB.tryRaiseDeviceRecord(TH.deviceRecordOf('u1'))
 * @example TH.deviceRecordOf('u1', { highest_vault_epoch: 3 })    // a device that has seen the vault at epoch 3
 */
export const deviceRecordOf = (user_id: string, overrides: Partial<DeviceRecord> = {}): DeviceRecord => ({
  format:              'safebyok-device-v1',
  ...scopeOf(user_id),
  device_id:           'device-one',
  highest_vault_epoch: 1,
  ...overrides,
})

/** A real lease record for device-storage tests: a live non-extractable leaseKey around fake wrapped material. */
export const leaseOf = async (user_id: string, overrides: Partial<LeaseRecord> = {}): Promise<LeaseRecord> => ({
  format:                  'safebyok-lease-v1',
  ...scopeOf(user_id),
  vault_tok:               `vault-tok-${user_id}`,
  gate_epoch:              1,
  lease_key:               await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']),
  vault_key_lease_wrapped: fakeCiphered(`lease-${user_id}`),
  ask_passphrase_at:       1_900_000_000_000,
  ...overrides,
})

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
