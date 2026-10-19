import { type Ciphered, toB64 } from '../../src/crypto'
import { memoryDeviceDB, type LeaseExpectation } from '../../src/device-db'
import type { KeyDeriver } from '../../src/key-deriver'
import { type PassphraseStrengthTest, StrongVerdict } from '../../src/passphrase-strength'
import { memoryStore } from '../../src/string-store'
import type { Lockbox } from '../../src/lockbox'
import type { VaultScope, PassphraseWayin, PasskeyWayin, PasskeyProof, VaultProps, Sidecar, LockboxSummary, DamagedLockbox, DeviceMark, SeenVault, Lease } from '../../src/types'
import { stableJsonify } from '../../src/stable-jsonify'
import { Vault } from '../../src/vault'
import { type MakeVaultOpts } from '../../src/vault-opts'
import { localVaultDB } from '../../src/vault-db'


/**
 * A cheap KeyDeriver for tests: one SHA-256 instead of 64 MiB of Argon2id, so a suite full of
 * unlocking runs in milliseconds. Deterministic in passphrase and salt, like the real one; unlike
 * the real one, worthless against a brute-forcer -- which is why its label says `test`. Never
 * hand it to a vault that holds a real secret.
 *
 * @example Vault.make({ ...opts, keyDeriver: testDeriver })
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
 * A passphraseStrengthTest for tests, admitting every passphrase, so a suite may unlock with a
 * short one such as 'pw'. Never hand it to a vault that holds a real secret.
 *
 * @example Vault.make({ ...opts, passphraseStrengthTest: anyPassphraseTest })
 */
export const anyPassphraseTest: PassphraseStrengthTest = () => StrongVerdict

/**
 * Everything Vault.make needs, over stores in memory made fresh for each call: `u1`'s `main` vault
 * in the `acme` app (as {@link scopeOf} has it), deriving through {@link testDeriver}, and
 * admitting any passphrase ({@link anyPassphraseTest}). `overrides`
 * replace any of it -- a store of the test's own, a clock, a logger, another user.
 *
 * @param overrides - Options to use in place of the defaults.
 * @returns A complete bag of options for Vault.make, or (`userId` aside) for a VaultProvider.
 *
 * @example const vault = await TH.settledVault(TH.memoryVaultOpts())
 * @example const vault = await TH.settledVault(TH.memoryVaultOpts({ userId: 'u2', vaultDB: myVaultDB }))
 */
export const memoryVaultOpts = (overrides: Partial<MakeVaultOpts> = {}): MakeVaultOpts => ({
  applabel:   'acme',
  userId:     'u1',
  vaultlabel: 'main',
  vaultDB:    localVaultDB({ store: memoryStore() }),
  deviceDB:   memoryDeviceDB(),
  keyDeriver: testDeriver,
  passphraseStrengthTest: anyPassphraseTest,
  ...overrides,
})

/**
 * A vault made with `opts` and settled: `Vault.make(opts)`, then its `hello()` awaited, so its
 * snapshot says `absent`, `locked` or `unlocked`. Throws as `Vault.make` does for misuse, and
 * rejects as `hello()` does, leaving that handle open: a test that needs it closed makes the vault
 * itself.
 *
 * @param opts - Everything Vault.make takes; {@link memoryVaultOpts} makes a bag of them.
 * @returns The vault, settled.
 *
 * @example const vault = await TH.settledVault(TH.memoryVaultOpts())
 * @example
 *   // two devices over one vaultDB, each with a device store of its own
 *   const here = await TH.settledVault({ ...opts, deviceDB: memoryDeviceDB() })
 *   const there = await TH.settledVault({ ...opts, deviceDB: memoryDeviceDB() })
 */
export const settledVault = async (opts: MakeVaultOpts): Promise<Vault> => {
  const vault = Vault.make(opts)
  await vault.hello()
  return vault
}

/**
 * A database name no other call has handed out, so each test of an IndexedDB adapter starts
 * from an empty database of its own.
 *
 * @example idbVaultDB({ dbName: TH.freshDbName() })
 */
export const freshDbName = (): string => `safebyok_test_${crypto.randomUUID().slice(0, 8)}`

/**
 * A shape-valid Ciphered that opens nothing: for storage-layer tests, which never decrypt.
 *
 * @example fakeCiphered('a1')  // => { cipher_iv_b64: 'iv-a1', ciphertext_b64: 'ct-a1' }
 */
export const fakeCiphered = (tag: string): Ciphered => ({
  cipher_iv_b64:  `iv-${tag}`,
  ciphertext_b64: `ct-${tag}`,
})

/**
 * The scope of `userId`'s vault in the `acme` app.
 *
 * @example scopeOf('u1')           // => { applabel: 'acme', user_id: 'u1', vaultlabel: 'main' }
 * @example scopeOf('u1', 'spare')  // => { applabel: 'acme', user_id: 'u1', vaultlabel: 'spare' }
 */
export const scopeOf = (userId: string, vaultlabel = 'main'): VaultScope => ({ applabel: 'acme', user_id: userId, vaultlabel })

/**
 * A shape-valid passphrase wayin labelled `wayinlabel`, its wrap fake: for storage-layer
 * tests, which never decrypt. Its wayin_id is `wayin-<wayinlabel>`; it wraps the vault's first
 * vaultKey, and was added by `device-one`.
 *
 * @example wayinOf('passphrase')                                            // the one vaultPropsOf holds
 * @example wayinOf('home_phrase', { vault_key_wayin_wrapped: fakeCiphered('home') })
 */
export const wayinOf = (wayinlabel: string, overrides: Partial<PassphraseWayin> = {}): PassphraseWayin => ({
  wayinkind:               'passphrase',
  wayin_id:                `wayin-${wayinlabel}`,
  wayinlabel,
  key_deriver_label:       'test_digest_v0',
  // base64 of the literal text 'saltsaltsaltsalt': a fake salt, public material anyway
  salt_b64:                'c2FsdHNhbHRzYWx0c2FsdA',
  vault_key_epoch:         1,
  device_id:               'device-one',
  registered_at:           Date.UTC(2026, 9, 14),
  vault_key_wayin_wrapped: fakeCiphered(`wayin-${wayinlabel}`),
  ...overrides,
})

/**
 * A shape-valid passkey wayin labelled `wayinlabel`, its wrap fake: for storage-layer tests,
 * which never decrypt. Its wayin_id is `wayin-<wayinlabel>`, its credential_id
 * `cred-<wayinlabel>`; it wraps the vault's first vaultKey, and was added by `device-one`.
 *
 * @example passkeyWayinOf('laptop')
 * @example vaultPropsOf('u1', { wayins: [wayinOf('passphrase'), passkeyWayinOf('laptop')] })
 */
export const passkeyWayinOf = (wayinlabel: string, overrides: Partial<PasskeyWayin> = {}): PasskeyWayin => ({
  wayinkind:               'passkey',
  wayin_id:                `wayin-${wayinlabel}`,
  wayinlabel,
  credential_id:           `cred-${wayinlabel}`,
  // base64 of the literal text 'prfsaltprfsaltprfsaltprfsaltprfs': a fake 32-byte salt, public material anyway
  prf_salt_b64:            'cHJmc2FsdHByZnNhbHRwcmZzYWx0cHJmc2FsdHByZnM',
  vault_key_epoch:         1,
  device_id:               'device-one',
  registered_at:           Date.UTC(2026, 9, 14),
  vault_key_wayin_wrapped: fakeCiphered(`wayin-${wayinlabel}`),
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
 * @example await vault.addPasskey('pw', () => passkeyOf('laptop'), { wayinlabel: 'laptop' })
 * @example await vault.unlock(await passkeyOf('laptop'))
 * @example await passkeyOf('laptop', otherSaltB64)  // the same credential, answering another salt
 */
export const passkeyOf = async (tag: string, prfSaltB64?: string): Promise<PasskeyProof> => {
  const credentialId = toB64(new TextEncoder().encode(`cred-${tag}`))
  const saltB64 = prfSaltB64 ?? toB64(await digestOf(`salt-${tag}`))
  return { credentialId, prfSaltB64: saltB64, prfBytes: await digestOf(`${credentialId}:${saltB64}`) }
}

/**
 * A shape-valid VaultProps for `userId`'s `main` vault, its one wayin fake: for storage-layer
 * tests, which never decrypt. Its vault_id is `vault-id-<userId>`, its unlock epoch and its
 * vaultKey's epoch both 1, and its one way in a {@link wayinOf} labelled `passphrase` whose
 * wrap is `vault-<userId>`.
 *
 * @example vaultPropsOf('u1', { unlock_epoch: 2 })
 * @example vaultPropsOf('u1', { wayins: [wayinOf('passphrase'), wayinOf('home_phrase')] })
 */
export const vaultPropsOf = (userId: string, overrides: Partial<VaultProps> = {}): VaultProps => ({
  format:              'safebyok-vault-v3',
  ...scopeOf(userId),
  vault_id:            `vault-id-${userId}`,
  unlock_epoch:        1,
  vault_key_epoch:     1,
  wayins:              [wayinOf('passphrase', { vault_key_wayin_wrapped: fakeCiphered(`vault-${userId}`) })],
  registered_at:       Date.UTC(2026, 9, 14),
  ...overrides,
})

/**
 * {@link vaultPropsOf}'s vault once its vaultKey has been replaced: at unlock epoch 2 and vaultKey
 * epoch 2, its one way in sealed around the new vaultKey, and the first vaultKey kept, fake, as
 * its `prior_vault_key`. What a lockbox write sealed under the first vaultKey meets once the
 * vaultKey has moved on.
 *
 * @example await vaultDB.updateVaultProps(TH.rotatedVaultPropsOf('u1'), { vault_id: 'vault-id-u1', unlock_epoch: 1 })
 */
export const rotatedVaultPropsOf = (userId: string): VaultProps => vaultPropsOf(userId, {
  unlock_epoch:    2,
  vault_key_epoch: 2,
  prior_vault_key: { vault_key_epoch: 1, vault_key_wrapped: fakeCiphered(`prior-${userId}`) },
  wayins:          [wayinOf('passphrase', { vault_key_epoch: 2, vault_key_wayin_wrapped: fakeCiphered(`rotated-${userId}`) })],
})

/**
 * A shape-valid Lockbox for storage-layer tests, its ciphered fields fake: revision `rev-<tag>`,
 * sealed under the vault's first vaultKey, with the sidecar `{ note: 'a test box' }` unless
 * `overrides` says otherwise.
 *
 * @example boxOf('anthropic_api_key', 'a1', { sidecar_json: sidecarJsonOf({ note: 'work account' }) })
 */
export const boxOf = (boxlabel: string, tag: string, overrides: Partial<Lockbox> = {}): Lockbox => ({
  format:                 'safebyok-lockbox-v5',
  boxlabel,
  revision_tok:           `rev-${tag}`,
  vault_key_epoch:        1,
  lockbox_key_wrapped:    fakeCiphered(`boxkey-${tag}`),
  whisper_ciphered:       fakeCiphered(`whisper-${tag}`),
  whisper_codec:          'json_v1',
  whisper_schema_version: 1,
  sidecar_json:           sidecarJsonOf({ note: 'a test box' }),
  registered_at:          Date.UTC(2026, 9, 14),
  written_at:             Date.UTC(2026, 9, 14),
  ...overrides,
})

/**
 * A sidecar as a lockbox's `sidecar_json` holds it: its JSON, every object's keys sorted, as the
 * vault writes it.
 *
 * @example sidecarJsonOf({ note: 'work account' }) // '{"note":"work account"}'
 */
export const sidecarJsonOf = (sidecar: Sidecar): string => stableJsonify(sidecar) ?? ''

/**
 * Labels the default grammar refuses and a host's validators may admit: ones differing only by a
 * colon, a quote, a backslash, a comma or a bracket, ones that would close a JSON string early,
 * and Hebrew, Arabic, Thai and mixed text.
 */
export const OddLabels = Object.freeze([
  'main', 'main:', 'main"', String.raw`main\\`, 'main,', 'main[', 'main]', 'main","x',
  'מפתח העבודה', 'مفتاح العمل', 'กุญแจงาน', 'Mixed: English, עברית, العربية, ไทย',
] as const)

/**
 * A listed lockbox as the summary it should be: undefined stays undefined, and one listed as
 * damaged fails the test, naming its boxlabel. For a test reading a summary's fields out of a
 * listing or a snapshot, where TypeScript would otherwise have it ask after damage first.
 *
 * @example expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({ note: 'work account' })
 */
export const summaryOf = (box: LockboxSummary | DamagedLockbox | undefined): LockboxSummary | undefined => {
  if (box?.damaged === true) { throw new Error(`The lockbox '${box.boxlabel}' is listed as damaged, where a summary was expected.`) }
  return box
}

/**
 * What a write into {@link vaultPropsOf}('u1')'s vault expects when its lockbox is not there yet:
 * that vault, under its first vaultKey, and no revision. Frozen, since every test shares it.
 *
 * @example vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet)
 */
export const noBoxYet = Object.freeze({ vault_id: 'vault-id-u1', revision_tok: null, vault_key_epoch: 1 } as const)

/**
 * What a retirement of {@link vaultPropsOf}('u1')'s vault expects: that vault.
 * Frozen, since every test shares it.
 *
 * @example vaultDB.retireVault(TH.scopeOf('u1'), TH.thisVault)
 */
export const thisVault = Object.freeze({ vault_id: 'vault-id-u1' } as const)

/**
 * What a retirement of a lockbox in {@link vaultPropsOf}('u1')'s vault expects: that vault, and
 * the revision the retiring device read -- `rev-` and its tag, for a lockbox {@link boxOf} made --
 * or null, for one listed with none.
 *
 * @example vaultDB.retireBox(TH.scopeOf('u1'), 'anthropic', TH.retiring('rev-one'))
 */
export const retiring = (revisionTok: string | null) => ({ vault_id: 'vault-id-u1', revision_tok: revisionTok })

/** What {@link markOf} may change of its mark: any field of its own, and any of what it has seen, or null for nothing seen. */
export type MarkOverrides = Partial<Omit<DeviceMark, 'seen'>> & { seen?: Partial<SeenVault> | null }

/**
 * A shape-valid DeviceMark for device-storage tests: `userId`'s `main` vault as {@link vaultPropsOf}
 * has it, seen at unlock epoch 1 and vaultKey epoch 1, by the device `device-one`, never locked.
 *
 * @example await deviceDB.writeMark(TH.markOf('u1'))
 * @example TH.markOf('u1', { seen: { unlock_epoch: 3 } })  // a device that has seen the vault at epoch 3
 * @example TH.markOf('u1', { lock_generation: 2 })         // a device that has locked the vault twice
 * @example TH.markOf('u1', { seen: null })                 // a device that has seen no vault there
 */
export const markOf = (userId: string, overrides: MarkOverrides = {}): DeviceMark => {
  const { seen, ...head } = overrides
  return {
    format:          'safebyok-mark-v3',
    ...scopeOf(userId),
    lock_generation: 0,
    ...head,
    seen:            seen === null ? null : {
      device_id:       'device-one',
      vault_id:        `vault-id-${userId}`,
      unlock_epoch:    1,
      vault_key_epoch: 1,
      ...seen,
    },
  }
}

/**
 * The expectation a lease is written under on a device that has never locked its
 * vault: the lock generation of a scope with no mark, or a mark from {@link markOf}.
 *
 * @example await deviceDB.writeLease(await TH.leaseOf('u1'), TH.NoLocks)
 */
export const NoLocks: LeaseExpectation = Object.freeze({ lock_generation: 0 })

/** A real Lease for device-storage tests: a live non-extractable leaseKey around fake wrapped material. */
export const leaseOf = async (userId: string): Promise<Lease> => ({
  format:                  'safebyok-lease-v1',
  ...scopeOf(userId),
  vault_id:                `vault-id-${userId}`,
  unlock_epoch:            1,
  lease_key:               await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']),
  vault_key_lease_wrapped: fakeCiphered(`lease-${userId}`),
  ask_passphrase_at:       1_900_000_000_000,
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
