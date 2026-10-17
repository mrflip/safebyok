import * as Z from 'zod/mini'
import { Ciphered } from './crypto'
import { stableJsonify } from './stable-jsonify'
import { NameFloor } from './validators'

/**
 * The JSON a whisper is made of. `null` is legal here -- inside an array or object -- because
 * real JSON payloads carry it; see {@link Whisper} for why a whisper can't be null as a whole.
 */
export type WhisperJson = string | number | boolean | null | WhisperJson[] | { [ckey: string]: WhisperJson }

/**
 * The secret kept in a lockbox: a JSON value -- a string, number, boolean, array or plain object.
 * Two shapes are refused rather than silently mangled:
 *  * `undefined`, anywhere in the value: JSON cannot carry it.
 *  * a bare `null` as the whole whisper: nobody's secret is "nothing here", and emptying a
 *    lockbox is `erase`'s job. (`null` inside a structure is fine: {@link WhisperJson}.)
 *
 * @example 'sk-ant-api03-...'
 * @example { apiKey: 'sk-ant-...', orgId: null }
 */
export type Whisper = Exclude<WhisperJson, null>

/** True for a plain key-value object: one built by a literal or Object.create(null), nothing with its own prototype (a Date, a Map) that JSON would silently flatten. */
const isPlainBag = (val: unknown): val is Record<string, unknown> => {
  if (typeof val !== 'object' || val === null) { return false }
  const proto: unknown = Object.getPrototypeOf(val)
  return proto === Object.prototype || proto === null
}

const whisperJson: Z.ZodMiniType<WhisperJson> = Z.lazy(() => Z.union([
  Z.string(),
  Z.number(),
  Z.boolean(),
  Z.null(),
  whisperArr,
  whisperBag,
]))
const whisperRecord = Z.record(Z.string(), whisperJson)
const whisperBag = Z.pipe(Z.custom<Record<string, unknown>>(isPlainBag, 'a whisper object must be a plain object'), whisperRecord)
const whisperArr = Z.array(whisperJson)

/**
 * Validator for a {@link Whisper}: accepts exactly what JSON can carry, refuses what JSON would
 * mangle (undefined, functions, class instances such as Date or Map), and refuses a bare null.
 *
 * @example Whisper.parse('sk-ant-...')                  // a string passes through
 * @example Whisper.safeParse(new Date()).success        // false: JSON would flatten it to {}
 * @example Whisper.safeParse(undefined).success         // false: undefined cannot be stored
 * @example Whisper.safeParse(null).success              // false: emptying a lockbox is erase's job
 * @example Whisper.safeParse({ orgId: null }).success   // true: null inside a structure is JSON
 */
export const Whisper: Z.ZodMiniType<Whisper> = Z.union([
  Z.string(),
  Z.number(),
  Z.boolean(),
  whisperArr,
  whisperBag,
])

/**
 * The latest instant the package accepts, in epoch ms: the microsecond epochalypse, the last
 * millisecond whose epoch *microseconds* still fit a safe integer, 2255-06-05T23:47:34.740Z. No
 * time the vault keeps lies past it, and a stored record holding a later one fails validation;
 * see {@link EpochMillis}.
 *
 * `askPassphraseAt` is at or near it when the vault never asks for the passphrase again on this
 * device until `lock()`: `forcePassphraseReentryHours: Infinity`. A host shows "until locked"
 * rather than a date in 2255 for any instant within a minute of it, never only for one equal to
 * it: `at >= FarFuture - MinuteMillis`.
 *
 * @example askPassphraseAt >= FarFuture - MinuteMillis ? 'until locked' : new Date(askPassphraseAt).toLocaleString()
 * @example new Date(FarFuture).toISOString()   // '2255-06-05T23:47:34.740Z'
 */
export const FarFuture = 9_007_199_254_740 // Math.floor(Number.MAX_SAFE_INTEGER / 1000)

/**
 * The earliest instant the package accepts, in epoch ms: 1981-01-01T00:00:00Z. A stored
 * record holding an earlier time fails validation; see {@link EpochMillis}.
 *
 * @example new Date(FarPast).toISOString()   // '1981-01-01T00:00:00.000Z'
 */
export const FarPast = 347_155_200_000 // Date.UTC(1981, 0, 1)

/**
 * One minute, in milliseconds: the margin a host leaves when it asks whether an instant is
 * {@link FarFuture}, the vault's "never".
 *
 * @example askPassphraseAt >= FarFuture - MinuteMillis   // true while the vault stays unlocked until lock()
 */
export const MinuteMillis = 60_000

/**
 * The unlock window a vault keeps for "until `lock()`", in milliseconds: from {@link FarPast} to
 * {@link FarFuture}, so a deadline it sets from any instant the clock may read is
 * {@link FarFuture}. `forcePassphraseReentryHours: Infinity` becomes this window as `openVault`
 * parses it, and a vault's `reentryWindowMillis` reads as it then.
 *
 * @example vault.reentryWindowMillis >= ForeverMillis - MinuteMillis   // true when opened with forcePassphraseReentryHours: Infinity
 * @example FarPast + ForeverMillis === FarFuture                       // true: a window from the earliest instant ends at the last
 */
export const ForeverMillis = FarFuture - FarPast

/**
 * Validator for an instant as whole UTC epoch milliseconds, from {@link FarPast} (1981) to
 * {@link FarFuture} (2255), both included. Every time the package keeps is one -- a lockbox's
 * `registered_at` and `written_at`, a vault bundle's `registered_at`, a remembered unlock's
 * `ask_passphrase_at` -- and a stored record holding anything else fails validation. A host can
 * check its own times with it.
 *
 * The bounds catch a unit mistake either way: epoch *seconds* read as milliseconds land in
 * January 1970, below the floor; epoch *microseconds* read as milliseconds land tens of thousands
 * of years out, above the ceiling. `Infinity` and `NaN` never pass. (The host's {@link Clock} may
 * return a fraction of a millisecond; the vault rounds each reading down before keeping it.)
 *
 * @example EpochMillis.parse(Date.UTC(2026, 9, 15))                // 1792022400000
 * @example EpochMillis.safeParse(1_792_022_400).success            // false: seconds, not ms
 * @example EpochMillis.safeParse(1_792_022_400_000_000).success    // false: microseconds, not ms
 * @example EpochMillis.safeParse(1_792_022_400_000.5).success      // false: whole milliseconds only
 * @example EpochMillis.safeParse(Infinity).success                 // false: never a time
 */
export const EpochMillis = Z.number().check(
  Z.gte(FarPast, "An instant is epoch milliseconds no earlier than 1981; a smaller number is likely epoch seconds"),
  Z.lte(FarFuture, "An instant is epoch milliseconds no later than 2255; a larger number is likely epoch microseconds"),
  Z.int("An instant is whole epoch milliseconds"),
)

/**
 * What names one vault: the host application's label, the authenticated user, and the vault's own
 * label. Two users may each have a vault labelled `main` without collision; so may two apps
 * sharing a backend. This checks each name against the floor every name is held to
 * (`NameFloor`); what text a name may be beyond that is the vault's validators' to say, at its
 * entry (`Label` and `UserId` by default, from `safebyok/validators`).
 */
export const VaultScope = Z.object({
  applabel:   NameFloor,
  user_id:    NameFloor,
  vaultlabel: NameFloor,
})
export type VaultScope = Z.infer<typeof VaultScope>

/**
 * Which vaultKey a record stands for: 1 for a vault's first, and one more for each vaultKey that
 * replaces the one before. A bundle's `vault_key_epoch` is its envelopes' vaultKey; a lockbox's,
 * the vaultKey its lockboxKey is wrapped under.
 */
const vaultKeyEpoch = Z.int().check(Z.positive())

/** A WebCrypto key handle, as a record holds one. Never bytes: a handle, and nothing but. */
const cryptoKeyHandle = Z.custom<CryptoKey>((val) => val instanceof CryptoKey, 'a CryptoKey handle')

/**
 * A lockbox's public bag: any JSON value the host keeps beside the whisper -- what the user calls
 * the account, which project a key belongs to -- shown while the vault is locked, and never
 * interpreted by safebyok. It is stored in the clear, as its JSON (`public_json`), and bound into
 * the lockbox's encryption, so a bag altered or swapped in storage makes the lockbox refuse to
 * open. A host checks its own bag's shape before `store()`. Never put secret material in it.
 *
 * @example PublicBag.parse({ note: 'work account', project: 'atlas' })
 * @example PublicBag.safeParse({ when: new Date() }).success   // false: JSON would flatten it to {}
 * @example PublicBag.safeParse(undefined).success              // false: undefined is not JSON
 */
export const PublicBag: Z.ZodMiniType<WhisperJson> = whisperJson
export type PublicBag = Z.infer<typeof PublicBag>

/**
 * True when `text` is a public bag's JSON exactly as the vault writes it: parsed and serialized
 * again, keys sorted, it comes back the same. Text respaced, reordered, or nested too deep to
 * serialize is not, and the lockbox holding it reads as damaged, its refusal a calm one.
 */
const isStableJsonText = (text: string): boolean => {
  try {
    return stableJsonify(JSON.parse(text)) === text
  } catch {
    // Not JSON, or nested past what the stack can serialize (a RangeError).
    return false
  }
}

/**
 * One lockbox as the storage layer holds it: the whisper ciphered under its own lockboxKey, that
 * lockboxKey wrapped under the vaultKey, and the public shell -- boxlabel, public bag, the times
 * it was first stored and last written -- a locked vault may show. Nothing in this record opens
 * without the vaultKey.
 *
 * `revision_id` is minted fresh on every write and bound into both encryptions, so ciphertext
 * moved between revisions (or boxes, or vaults) refuses to open. So is every other field but the
 * two encrypted ones: an altered bag, time or codec refuses to open as well.
 *
 * Stored fields are underbar_case: this record is written to the storage layer as-is, and it is
 * plain JSON -- any backend that can hold text can hold it. Its boxlabel is checked here against
 * the floor every name is held to (`NameFloor`); the vault's validators check it only where a
 * host hands it in.
 */
export const Lockbox = Z.object({
  format:                 Z.literal('safebyok-lockbox-v4'),
  boxlabel:               NameFloor,
  revision_id:            Z.string().check(Z.minLength(1)),
  /**
   * Which vaultKey this lockbox's lockboxKey is wrapped under: the bundle's `vault_key_epoch` when
   * it was written. Public, so a locked vault's listing shows which lockboxes stand under which.
   */
  vault_key_epoch:        vaultKeyEpoch,
  /** This lockbox's lockboxKey, wrapped under the vaultKey. */
  lockbox_key_wrapped:    Ciphered,
  /** The whisper, ciphered under this lockbox's lockboxKey. */
  whisper_ciphered:       Ciphered,
  /** How the whisper became the bytes ciphered: `json_v1`, its JSON with every object's keys sorted, as UTF-8. */
  whisper_codec:          Z.literal('json_v1'),
  /** Which generation of the whisper's own shape this lockbox holds: 1, the only one so far. */
  whisper_schema_version: Z.literal(1),
  /**
   * The lockbox's {@link PublicBag}, as JSON with every object's keys sorted and no spacing,
   * exactly as `stableJsonify` writes it: `{}` when the host gave none. Always written, so a lockbox with no bag and one with an empty bag are one record.
   */
  public_json:            Z.string().check(Z.refine(isStableJsonText, "public_json holds the lockbox's public bag as the JSON text the vault writes, keys sorted")),
  /** When this boxlabel was first stored, an {@link EpochMillis}: every later store carries it forward. */
  registered_at:          EpochMillis,
  /**
   * When this revision was written, an {@link EpochMillis}: every store stamps it anew. It says
   * nothing of whether the whisper changed -- a store of the same whisper moves it too.
   */
  written_at:             EpochMillis,
})
export type Lockbox = Z.infer<typeof Lockbox>

/**
 * The public face of a lockbox: its boxlabel, revision, vaultKey epoch and times, its public bag
 * as the JSON value the host stored (`{}` when it gave none), and `damaged` false. This, or a
 * {@link DamagedLockbox}, is what a VaultDB's `listBoxes` returns and a vault's snapshot holds,
 * readable while locked. The bag is shown as storage holds it: only `read()` opens the lockbox
 * and so proves it unaltered.
 *
 * @example LockboxSummary.parse({ boxlabel: 'anthropic', revision_id: 'r1', vault_key_epoch: 1, public: {}, registered_at, written_at }).damaged  // false
 */
export const LockboxSummary = Z.object({
  boxlabel:        NameFloor,
  revision_id:     Z.string().check(Z.minLength(1)),
  vault_key_epoch: vaultKeyEpoch,
  public:          PublicBag,
  registered_at:   EpochMillis,
  written_at:      EpochMillis,
  damaged:         Z._default(Z.literal(false), false),
})
export type LockboxSummary = Z.infer<typeof LockboxSummary>

/**
 * A lockbox whose stored record does not read back as one -- damaged, tampered with, written by
 * another version of safebyok, or sealed under a vaultKey the vault does not hold -- listed under
 * the boxlabel it is stored under, with nothing else from it trusted but its `revision_id`, when
 * it holds one as text (null otherwise), which only names the record for a write over it. It
 * sits in a vault's snapshot beside the {@link LockboxSummary}s, sorted among them, so a UI can
 * offer to remove it: `erase()` removes it and `store()` writes a fresh lockbox over it, while
 * `read()` and `use()` refuse it with kind 'damaged_lockbox'.
 *
 * @example
 *   for (const box of snapshot.boxes) {
 *     if (box.damaged) { showRemovable(box.boxlabel) } else { showSummary(box.boxlabel, box.public) }
 *   }
 */
export type DamagedLockbox = { boxlabel: string, damaged: true, revision_id: string | null }

/**
 * The ways into a vault, each an {@link UnlockEnvelope}'s `method`: a `passphrase` the user types,
 * or a `passkey` the user touches (a fingerprint, a face, a security key). Each method has an
 * envelope shape of its own, and the vault tells them apart by this field.
 */
export const UnlockMethodVals = ['passphrase', 'passkey'] as const
export type UnlockMethod = typeof UnlockMethodVals[number]

/**
 * The most unlock envelopes a vault holds, passphrases and passkeys together: room for every way
 * in a person plausibly keeps (a daily passphrase, one written down at home, a fingerprint on
 * each of their devices), and a bound on how long an unlock can take. An unlock not aimed at one envelope tries each passphrase envelope in turn,
 * one key derivation apiece, so a wrong passphrase costs up to this many. A stored bundle with
 * more fails validation.
 */
export const MaxUnlocks = 8

/**
 * A passphrase's way into the vault: the vaultKey wrapped under the passphraseKey that this
 * envelope's passphrase and its own passphraseSalt make. Every field but `vault_key_wrapped` is
 * public, and all of them are bound into that wrap, so an envelope altered or moved to another
 * vault refuses to open.
 */
export const PassphraseEnvelope = Z.object({
  method:            Z.literal('passphrase'),
  /** Random id minted when the envelope is added, and kept when its passphrase changes. */
  unlock_id:         Z.string().check(Z.minLength(1)),
  /** What the user calls this way in, so they can tell one from another: `home_phrase`, say. */
  unlocklabel:       NameFloor,
  /** Which keyDeriverSpec made the passphraseKey: `argon2id_web_v1`, or a host's own label. */
  key_deriver_label: Z.string().check(Z.minLength(1)),
  /** This envelope's passphraseSalt: fresh for every envelope, and for every change of its passphrase. */
  salt_b64:          Z.string().check(Z.minLength(1)),
  /** The `vault_key_epoch` of the vaultKey this envelope wraps: in a sound bundle, the bundle's own. */
  vault_key_epoch:   vaultKeyEpoch,
  /**
   * The id the device that added this way in keeps for the vault in its device mark: random, one
   * per vault per device, never drawn from the device itself. Kept when the envelope is sealed anew.
   */
  device_id:         Z.string().check(Z.minLength(1)),
  /** When this way in was added, an {@link EpochMillis}. Kept when the envelope is sealed anew. */
  registered_at:     EpochMillis,
  /** The vaultKey, wrapped under the passphraseKey: decrypting this IS the passphrase check. */
  vault_key_wrapped: Ciphered,
})
export type PassphraseEnvelope = Z.infer<typeof PassphraseEnvelope>

/**
 * How many random bytes a passkey envelope's PRF salt holds, as `prf_salt_b64`: what the vault
 * asks the passkey's authenticator to evaluate its PRF over. A {@link PasskeyProof} for a new
 * passkey carries a fresh salt this long; `safebyok-react`'s `createPasskey` mints one.
 */
export const PasskeySaltBytes = 32

/**
 * A passkey's way into the vault: the vaultKey wrapped under a passkeyKey made from what the
 * passkey's authenticator answers, through the WebAuthn PRF extension, when asked to evaluate its
 * PRF over this envelope's own salt. The authenticator holds the secret; the envelope holds only
 * which credential to ask (`credential_id`) and what to ask it (`prf_salt_b64`). Every field but
 * `vault_key_wrapped` is public, and all of them are bound into that wrap.
 */
export const PasskeyEnvelope = Z.object({
  method:            Z.literal('passkey'),
  /** Random id minted when the envelope is added. */
  unlock_id:         Z.string().check(Z.minLength(1)),
  /** What the user calls this way in, so they can tell one from another: `laptop_fingerprint`, say. */
  unlocklabel:       NameFloor,
  /** The WebAuthn credential's id, base64url, as `PublicKeyCredential.id` gives it: which passkey to ask. */
  credential_id:     Z.string().check(Z.minLength(1)),
  /** The salt the passkey's PRF is evaluated over: {@link PasskeySaltBytes} random bytes, fresh for every envelope. */
  prf_salt_b64:      Z.string().check(Z.minLength(1)),
  /** The `vault_key_epoch` of the vaultKey this envelope wraps: in a sound bundle, the bundle's own. */
  vault_key_epoch:   vaultKeyEpoch,
  /**
   * The id the device that added this way in keeps for the vault in its device mark: random, one
   * per vault per device, never drawn from the device itself. Kept when the envelope is sealed anew.
   */
  device_id:         Z.string().check(Z.minLength(1)),
  /** When this way in was added, an {@link EpochMillis}. Kept when the envelope is sealed anew. */
  registered_at:     EpochMillis,
  /** The vaultKey, wrapped under the passkeyKey: decrypting this IS the passkey check. */
  vault_key_wrapped: Ciphered,
})
export type PasskeyEnvelope = Z.infer<typeof PasskeyEnvelope>

/**
 * One way into a vault: the vaultKey, wrapped under a key that one {@link UnlockMethod} makes,
 * with the public fields that method needs. Told apart by `method`: a {@link PassphraseEnvelope}
 * or a {@link PasskeyEnvelope}.
 */
export const UnlockEnvelope = Z.discriminatedUnion('method', [PassphraseEnvelope, PasskeyEnvelope])
export type UnlockEnvelope = Z.infer<typeof UnlockEnvelope>

/** True when no two of `envelopes` share `field`. */
const distinctIn = (envelopes: readonly UnlockEnvelope[], field: 'unlock_id' | 'unlocklabel'): boolean => (
  new Set(envelopes.map((envelope) => envelope[field])).size === envelopes.length
)

/** True when no two of `envelopes`' passkeys are the same credential. */
const distinctCredentials = (envelopes: readonly UnlockEnvelope[]): boolean => {
  const credentialIds = envelopes
    .filter((envelope): envelope is PasskeyEnvelope => envelope.method === 'passkey')
    .map((envelope) => envelope.credential_id)
  return new Set(credentialIds).size === credentialIds.length
}

/** A bundle's unlock envelopes: at least one, at most {@link MaxUnlocks}, no id, label or credential twice. */
const unlockList = Z.array(UnlockEnvelope).check(
  Z.minLength(1, "A vault has at least one way in"),
  Z.maxLength(MaxUnlocks, `A vault holds at most ${String(MaxUnlocks)} unlock envelopes`),
  Z.refine((envelopes) => distinctIn(envelopes, 'unlock_id'), "No two unlock envelopes share an unlock_id"),
  Z.refine((envelopes) => distinctIn(envelopes, 'unlocklabel'), "No two unlock envelopes share an unlocklabel"),
  Z.refine(distinctCredentials, "No two passkey envelopes share a credential_id"),
)

/**
 * The public face of one way into a vault, as a vault's snapshot lists it even while locked:
 * what a host shows the user, and what it names when it aims `unlock()` or `removeUnlock()` at
 * one. Every way in shows its `method`, `unlock_id` and `unlocklabel`, and when it was added
 * (`registered_at`) and by which device (`device_id`, this vault's id for that device: one per
 * device per vault, so it links nothing the vault does not already link), so the user can tell
 * the way in they made last week from one made on a phone they do not recognise; a passkey also shows its
 * `credential_id` and `prf_salt_b64`, which a host needs before unlocking, to ask the
 * authenticator (`safebyok-react`'s `askPasskey` takes the list whole). Never a salt of a
 * passphrase, never a wrap.
 *
 * @example vault.getSnapshot().unlocks  // [{ method: 'passphrase', unlock_id: '1b9d...', unlocklabel: 'passphrase', device_id: 'k3x9...', registered_at: 1760000000000 }]
 * @example vault.getSnapshot().unlocks.filter((unlock) => unlock.method === 'passkey')  // [{ method: 'passkey', unlock_id, unlocklabel: 'laptop', device_id, registered_at, credential_id: 'AXk3...', prf_salt_b64: 'q83v...' }]
 */
export type UnlockSummary =
  | Pick<PassphraseEnvelope, 'method' | 'unlock_id' | 'unlocklabel' | 'device_id' | 'registered_at'>
  | Pick<PasskeyEnvelope, 'method' | 'unlock_id' | 'unlocklabel' | 'device_id' | 'registered_at' | 'credential_id' | 'prf_salt_b64'>

/**
 * What a passkey answers when asked for a vault's PRF, as a host hands it to the vault: which
 * credential answered (`credentialId`, base64url, as `PublicKeyCredential.id` gives it), the salt
 * it was asked to evaluate (`prfSaltB64`), and its 32-byte answer (`prfBytes`). The bytes are
 * secret, as good as a passphrase for this vault: pass them to the vault, then drop them.
 * `safebyok-react`'s `createPasskey` and `askPasskey` make one.
 *
 * @example
 *   const passkey = await askPasskey(vault.getSnapshot().unlocks)  // null when the user dismissed it
 *   if (passkey !== null) { await vault.unlock(passkey) }
 */
export type PasskeyProof = {
  credentialId: string
  prfSaltB64:   string
  prfBytes:     Uint8Array
}

/**
 * The vaultKey before a bundle's own, wrapped under its own: `vault_key_wrapped` opens only under
 * the vaultKey that replaced it, so a holder of the older vaultKey gains nothing from it.
 */
const PriorVaultKey = Z.object({
  vault_key_epoch:   vaultKeyEpoch,
  vault_key_wrapped: Ciphered,
})

/** True when a bundle holds the vaultKey just before its own as its prior, from its second vaultKey on, and no prior before then. */
const priorFits = (bundle: { vault_key_epoch: number, prior_vault_key?: { vault_key_epoch: number } }): boolean => (
  bundle.prior_vault_key === undefined
    ? bundle.vault_key_epoch === 1
    : bundle.prior_vault_key.vault_key_epoch === bundle.vault_key_epoch - 1
)

/**
 * The per-vault record the storage layer holds so any device can unlock the vault: its scope,
 * its `vault_id`, and its `unlocks`, each an {@link UnlockEnvelope} wrapping the one vaultKey.
 * All of it is safe in the open; none of it opens without a passphrase or a passkey.
 *
 * `unlock_epoch` goes up by one on every change to the unlocks -- a passphrase or passkey
 * added, removed or changed -- so other devices and remembered unlocks know to ask again.
 * `vault_key_epoch` says which vaultKey the unlocks wrap, and from a vault's second vaultKey on,
 * `prior_vault_key` holds the one before it.
 */
export const VaultBundle = Z.object({
  format:              Z.literal('safebyok-vault-v2'),
  applabel:            NameFloor,
  user_id:             NameFloor,
  vaultlabel:          NameFloor,
  /** Random id minted when the vault is made, and never changed; bound into every encryption. */
  vault_id:            Z.string().check(Z.minLength(1)),
  unlock_epoch:        Z.int().check(Z.positive()),
  /** Which vaultKey the unlocks wrap: 1 for the vault's first, one more for each that replaces it. */
  vault_key_epoch:     vaultKeyEpoch,
  /**
   * The vaultKey before this one, wrapped under this one, at the `vault_key_epoch` just below the
   * bundle's: absent while the bundle's is 1, and present from then on.
   */
  prior_vault_key:     Z.exactOptional(PriorVaultKey),
  /** The ways into the vault, each wrapping the one vaultKey: see {@link UnlockEnvelope}. */
  unlocks:             unlockList,
  /** When the vault was made, an {@link EpochMillis}; never changed. */
  registered_at:       EpochMillis,
}).check(Z.refine(priorFits, "A bundle holds the vaultKey just before its own as prior_vault_key, from its second vaultKey on, and none before then"))
export type VaultBundle = Z.infer<typeof VaultBundle>

/**
 * The device-local record of a remembered unlock: this browser's localUnlockKey (a
 * non-extractable handle -- it cannot leave the device even through the code that made it) and
 * the vaultKey wrapped under it. Held only by structured-clone storage (IndexedDB) or memory;
 * it has no JSON form, and nothing in it ever goes to the backend.
 */
export const DeviceUnlock = Z.object({
  format:           Z.literal('safebyok-unlock-v1'),
  applabel:         NameFloor,
  user_id:          NameFloor,
  vaultlabel:       NameFloor,
  vault_id:         Z.string().check(Z.minLength(1)),
  /** The bundle's unlock_epoch when this unlock was remembered; a mismatch voids it. */
  unlock_epoch:     Z.int().check(Z.positive()),
  /** This browser's localUnlockKey: non-extractable, usable only to unwrap what it wrapped. */
  local_unlock_key: cryptoKeyHandle,
  /** The vaultKey, wrapped under the localUnlockKey. */
  vault_key_local_wrapped: Ciphered,
  /** The instant from which the remembered unlock no longer counts, and the vault asks for the passphrase: an {@link EpochMillis}. */
  ask_passphrase_at: EpochMillis,
})
export type DeviceUnlock = Z.infer<typeof DeviceUnlock>

/**
 * What a device mark holds of the vault it has seen under its scope: the device's own random
 * `device_id` for the vault, which every way in it adds carries, and the highest `unlock_epoch` and
 * `vault_key_epoch` it has seen the vault's bundle at, so that an older copy of the bundle storage
 * hands back later is refused (kind 'rolled_back').
 */
export const SeenVault = Z.object({
  /** This device's id for the vault: random, minted the first time it reads or makes the vault. */
  device_id:       Z.string().check(Z.minLength(1)),
  /** The vault this mark is of. */
  vault_id:        Z.string().check(Z.minLength(1)),
  /** The highest `unlock_epoch` this device has seen the vault's bundle at. */
  unlock_epoch:    Z.int().check(Z.positive()),
  /** The highest `vault_key_epoch` this device has seen the vault's bundle at. */
  vault_key_epoch: vaultKeyEpoch,
})
export type SeenVault = Z.infer<typeof SeenVault>

/**
 * What a device keeps of a vault's scope, locked or not, on its own storage: its `lock_generation`,
 * how many times a lock on this device has forgotten the remembered unlock, so that an unlock under
 * way in another tab when the lock lands remembers nothing; and what it has `seen` of the vault
 * standing under the scope (a {@link SeenVault}), or null when it has seen none. Nothing in it is
 * secret. One per scope: a vault made anew under the scope, with another `vault_id`, is seen
 * afresh, under a new `device_id`, and the lock generation counts on. `lock()` leaves the mark,
 * raising its lock generation; `destroy()` raises it too, and forgets what was seen.
 *
 * @example { format: 'safebyok-mark-v3', ...scope, lock_generation: 0, seen: { device_id, vault_id, unlock_epoch: 1, vault_key_epoch: 1 } }
 * @example { format: 'safebyok-mark-v3', ...scope, lock_generation: 2, seen: null }  // locked twice, the vault since destroyed
 */
export const DeviceMark = Z.object({
  format:          Z.literal('safebyok-mark-v3'),
  applabel:        NameFloor,
  user_id:         NameFloor,
  vaultlabel:      NameFloor,
  /**
   * How many locks on this device have forgotten the scope's remembered unlock: 0 at first, one
   * more at each. A remembered unlock is written only while the mark stands at the generation its
   * unlock began under; see `DeviceDB.writeUnlock`.
   */
  lock_generation: Z.int().check(Z.gte(0)),
  /** The vault this device has seen under the scope, or null for none. */
  seen:            Z.nullable(SeenVault),
})
export type DeviceMark = Z.infer<typeof DeviceMark>

/**
 * How many hours an entered passphrase lasts on the device before the vault asks for it again,
 * unless the caller says otherwise: seven days.
 */
export const ForcePassphraseReentryHours = 168 // seven days

/**
 * The longest finite `forcePassphraseReentryHours` a vault takes: 588 hours, 24.5 days. The vault
 * drops its key with a timer when the window ends, and one timer reaches no further than
 * 2^31 - 1 milliseconds, about 24.8 days. A longer window is `Infinity`, until `lock()`; anything
 * between is refused.
 *
 * @example openVault({ ...opts, forcePassphraseReentryHours: MaxReentryHours })   // the longest that ends by itself
 */
export const MaxReentryHours = 588

/**
 * The largest whisper a vault stores unless the caller says otherwise, in bytes of its JSON and
 * its lockbox's public bag's together: several times the beefiest credential (an RSA-8192 private key as PEM is about 6.4 KB), and
 * well inside what every storage backend can hold. A larger whisper is usually a sign that the
 * wrong value is being stored.
 */
export const MaxWhisperBytes = 40_444 // searchable: 40444

/**
 * The most lockboxes a vault holds unless the caller says otherwise: room for every API key a
 * person plausibly keeps, at the largest default whisper, inside what every in-tree storage
 * adapter can hold and still erase in one go. A vault that needs more raises its `maxLockboxes`.
 */
export const MaxLockboxes = 100

/**
 * Injected time source, so expiry is testable; defaults to the wall clock. `now()` returns epoch
 * milliseconds, as `Date.now()` does, from {@link FarPast} to {@link FarFuture}; a fraction is
 * fine, and rounded down. The vault checks every reading, and refuses a clock that reads outside
 * those bounds -- counting in seconds or microseconds, say -- or throws, with kind 'bad_option':
 * at `openVault`, and at any later call that reads it so, which drops the vaultKey first.
 */
export type Clock = { now(): number }

/** The wall clock: the default `Clock`. */
export const wallClock: Clock = { now: () => Date.now() }
