import { v } from 'convex/values'

/**
 * Convex validators for safebyok's stored records, field for field with the core's Zod records
 * (`Lockbox`, `VaultBundle`, `Ciphered`, `VaultScope` in `safebyok`). They check what Convex can:
 * which fields, their types, which are optional, and each record's `format`. Every name, and a
 * lockbox's public bag, is any text here: the floor beneath every name (well-formed, NFC, no
 * control characters, 1 KiB) and that the bag is JSON are the core's records' to hold, and what text each may be beyond it
 * the vault's validators', which the server never sees. The finer rules -- the floor, non-empty
 * strings, a positive whole `unlock_epoch`, each time's bounds as epoch milliseconds -- are the
 * client's, checked by the core's Zod records on every write and every read.
 *
 * A new record format widens its `format` union: an additive deploy, shipped with this package.
 */

/**
 * An encrypted value as a record holds it: its cipherIv and its ciphertext, each base64url
 * text. Every encrypted field of every record is this one shape, nested as the record holds it.
 *
 * @example { cipher_iv_b64: 'q83vEjRWeJA', ciphertext_b64: 'yL3cKX0...' }
 */
export const Ciphered = v.object({
  cipher_iv_b64:  v.string(),
  ciphertext_b64: v.string(),
})

/**
 * What names one vault: the host application's label, the user, and the vault's own label.
 *
 * @example { applabel: 'acme', user_id: 'user_2fJ8...', vaultlabel: 'main' }
 */
export const VaultScope = v.object({
  applabel:   v.string(),
  user_id:    v.string(),
  vaultlabel: v.string(),
})

/** The formats of a VaultBundle this package stores. */
export const VaultBundleFormat = v.union(v.literal('safebyok-vault-v2'))

/** The formats of a Lockbox this package stores. */
export const LockboxFormat = v.union(v.literal('safebyok-lockbox-v3'))

/**
 * A passphrase's way into a vault: its `unlock_id` and `unlocklabel`, how its passphraseKey is
 * derived (`key_deriver_label`, `salt_b64`), which vaultKey it wraps (`vault_key_epoch`), the
 * device and time that added it (`device_id`, `registered_at`), and the vaultKey wrapped under
 * that passphraseKey.
 *
 * @example { method: 'passphrase', unlock_id: '1b9d...', unlocklabel: 'passphrase', key_deriver_label: 'argon2id_web_v1', salt_b64: 'q83v...', vault_key_wrapped: { cipher_iv_b64, ciphertext_b64 } }
 */
export const PassphraseEnvelope = v.object({
  method:            v.literal('passphrase'),
  unlock_id:         v.string(),
  unlocklabel:       v.string(),
  key_deriver_label: v.string(),
  salt_b64:          v.string(),
  vault_key_epoch:   v.number(),
  device_id:         v.string(),
  registered_at:     v.number(),
  vault_key_wrapped: Ciphered,
})

/**
 * A passkey's way into a vault: its `unlock_id` and `unlocklabel`, which WebAuthn credential to ask
 * (`credential_id`) and the salt to ask its PRF with (`prf_salt_b64`), which vaultKey it wraps,
 * the device and time that added it, and the vaultKey wrapped under the key that answer makes.
 *
 * @example { method: 'passkey', unlock_id: '7c2e...', unlocklabel: 'laptop', credential_id: 'AXk3...', prf_salt_b64: 'q83v...', vault_key_wrapped: { cipher_iv_b64, ciphertext_b64 } }
 */
export const PasskeyEnvelope = v.object({
  method:            v.literal('passkey'),
  unlock_id:         v.string(),
  unlocklabel:       v.string(),
  credential_id:     v.string(),
  prf_salt_b64:      v.string(),
  vault_key_epoch:   v.number(),
  device_id:         v.string(),
  registered_at:     v.number(),
  vault_key_wrapped: Ciphered,
})

/**
 * One way into a vault, told apart by its `method`: a {@link PassphraseEnvelope} or a
 * {@link PasskeyEnvelope}. A new method widens this union, an additive deploy shipped with this
 * package.
 */
export const UnlockEnvelope = v.union(PassphraseEnvelope, PasskeyEnvelope)

/**
 * The vaultKey before a bundle's own, wrapped under its own, at its `vault_key_epoch`: absent
 * until a vault's vaultKey is first replaced.
 */
export const PriorVaultKey = v.object({
  vault_key_epoch:   v.number(),
  vault_key_wrapped: Ciphered,
})

/**
 * A vault's bundle: its scope, `vault_id`, `unlock_epoch`, which vaultKey its ways in wrap
 * (`vault_key_epoch`, and the one before as `prior_vault_key`), its ways in (`unlocks`, each the
 * vaultKey wrapped under a key one method makes), and when it was made (`registered_at`, epoch
 * milliseconds). Nothing in it opens without a passphrase or passkey. How many ways in, and that no two
 * share an id or label, are the client's rules.
 */
export const VaultBundle = v.object({
  format:           VaultBundleFormat,
  applabel:         v.string(),
  user_id:          v.string(),
  vaultlabel:       v.string(),
  vault_id:         v.string(),
  unlock_epoch:     v.number(),
  vault_key_epoch:  v.number(),
  prior_vault_key:  v.optional(PriorVaultKey),
  unlocks:          v.array(UnlockEnvelope),
  registered_at:    v.number(),
})

/**
 * One lockbox: its whisper ciphered under its own lockboxKey, that lockboxKey wrapped under the
 * vaultKey, and the public shell -- boxlabel, revision, which vaultKey (`vault_key_epoch`), the
 * whisper's codec and schema version, the public bag as JSON text (`public_json`, always
 * written), and the epoch-millisecond times it was first stored (`registered_at`) and its whisper
 * last changed (`changed_at`).
 */
export const Lockbox = v.object({
  format:                 LockboxFormat,
  boxlabel:               v.string(),
  revision_id:            v.string(),
  vault_key_epoch:        v.number(),
  lockbox_key_wrapped:    Ciphered,
  whisper_ciphered:       Ciphered,
  whisper_codec:          v.literal('json_v1'),
  whisper_schema_version: v.literal(1),
  public_json:            v.string(),
  registered_at:          v.number(),
  changed_at:             v.number(),
})

/**
 * A lockbox as a listing returns it: every field but the two ciphered ones, `format` kept, so the
 * client validates it as it would a whole record.
 */
export const ListedLockbox = Lockbox.omit('lockbox_key_wrapped', 'whisper_ciphered')

/**
 * What a bundle update was proven against: it lands only while the standing bundle still has
 * this `vault_id` and `unlock_epoch`.
 *
 * @example { vault_id: standing.vault_id, unlock_epoch: standing.unlock_epoch }
 */
export const BundleExpectation = v.object({
  vault_id:         v.string(),
  unlock_epoch:     v.number(),
})

/**
 * What a lockbox update was written for and read: it lands only while the scope's bundle has this
 * `vault_id`, and the standing lockbox this `revision_id` -- or, for null, there is no lockbox. Its
 * `vault_key_epoch` names the vaultKey the lockbox was sealed under.
 *
 * @example { vault_id: bundle.vault_id, revision_id: null, vault_key_epoch: bundle.vault_key_epoch }   // a box that was not there
 */
export const LockboxExpectation = v.object({
  vault_id:        v.string(),
  revision_id:     v.nullable(v.string()),
  vault_key_epoch: v.number(),
})

/**
 * What an erase was meant for: the vault it lands in. An erase lands only while the scope's
 * bundle has this `vault_id`, whatever revision any lockbox stands at -- so a stale session
 * never erases from a vault made anew elsewhere.
 *
 * @example { vault_id: bundle.vault_id }
 */
export const EraseExpectation = v.object({
  vault_id: v.string(),
})

/**
 * One lockbox's place in a {@link VaultSignature}: `[boxlabel, revision_id]`. Convex has no
 * fixed-length tuple validator, so any list of strings passes: the component makes these, and a
 * client only compares one signature with the next.
 */
const BoxRevision = v.array(v.string())

/**
 * The vault's change signature: its bundle's `vault_id` and `unlock_epoch` (null while it has
 * no bundle) and each lockbox's `[boxlabel, revision_id]`, in boxlabel order. It changes exactly
 * when a write lands in the vault, and holds nothing a listing does not already show.
 *
 * @example { vault_id: 'b3f1...', unlock_epoch: 2, boxes: [['anthropic_api_key', '9c4e...']] }
 */
export const VaultSignature = v.object({
  vault_id:         v.nullable(v.string()),
  unlock_epoch:     v.nullable(v.number()),
  boxes:            v.array(BoxRevision),
})
