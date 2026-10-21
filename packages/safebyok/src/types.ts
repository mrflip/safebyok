import * as Z from 'zod/mini'
import { Ciphered } from './crypto'
import { NameFloor } from './validators'

/**
 * The JSON a whisper is made of. `null` is legal here -- inside an array or object -- because
 * real JSON payloads carry it; see {@link Whisper} for why a whisper can't be null as a whole.
 */
export type WhisperJson = string | number | boolean | null | WhisperJson[] | { [ckey: string]: WhisperJson }

/**
 * The secret kept in a box: a JSON value -- a string, number, boolean, array or plain object.
 * Two shapes are refused rather than silently mangled:
 *  * `undefined`, anywhere in the value: JSON cannot carry it.
 *  * a bare `null` as the whole whisper: nobody's secret is "nothing here", and emptying a
 *    box is `delBox`'s job. (`null` inside a structure is fine: {@link WhisperJson}.)
 *
 * @example 'sk-ant-api03-...'
 * @example { apiKey: 'sk-ant-...', orgId: null }
 */
export type Whisper = Exclude<WhisperJson, null>

/** True for a plain key-value object: one built by a literal or Object.create(null), nothing with its own prototype (a Date, a Map) that JSON would silently flatten. */
export const isPlainBag = (val: unknown): val is Record<string, unknown> => {
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
 * @example Whisper.safeParse(null).success              // false: emptying a box is delBox's job
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
 * device until `lock()`: `leaseHours: Infinity`. A host shows "until locked" rather than a date
 * in 2255 for any instant within a minute of it, never only for one equal to it:
 * `at >= FarFuture - MinuteMillis`.
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
 * The lease a vault grants for "until `lock()`", in milliseconds: from {@link FarPast} to
 * {@link FarFuture}, so a deadline it sets from any instant the clock may read is
 * {@link FarFuture}. `leaseHours: Infinity` becomes this as `Vault.make` parses it, and a vault's
 * `leaseMillis` reads as it then.
 *
 * @example vault.leaseMillis >= ForeverMillis - MinuteMillis           // true when opened with leaseHours: Infinity
 * @example FarPast + ForeverMillis === FarFuture                       // true: a window from the earliest instant ends at the last
 */
export const ForeverMillis = FarFuture - FarPast

/**
 * Validator for an instant as whole UTC epoch milliseconds, from {@link FarPast} (1981) to
 * {@link FarFuture} (2255), both included. Every time the package keeps is one -- a box's
 * `registered_at` and `written_at`, the vault props' `registered_at`, a lease's
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

/** A WebCrypto key handle, as a record holds one. Never bytes: a handle, and nothing but. */
const cryptoKeyHandle = Z.custom<CryptoKey>((val) => val instanceof CryptoKey, 'a CryptoKey handle')

/**
 * A box's sidecar: your app's own data, riding beside the whisper, visible in storage --
 * authenticated, but never encrypted, so anyone who can read the database can read it. Any JSON value -- what the user calls the account, which project a key belongs
 * to, what your app wants searchable server-side -- shown while the vault is locked, and never interpreted by safebyok. It is stored in the clear, as its JSON (`sidecar_json`), and bound into
 * the box's encryption, so a sidecar altered or swapped in storage makes the box refuse to
 * open. A host checks its own sidecar's shape before `putBox()`. Never put secret material in it.
 *
 * @example Sidecar.parse({ note: 'work account', project: 'atlas' })
 * @example Sidecar.safeParse({ when: new Date() }).success     // false: JSON would flatten it to {}
 * @example Sidecar.safeParse(undefined).success                // false: undefined is not JSON
 */
export const Sidecar: Z.ZodMiniType<WhisperJson> = whisperJson
export type Sidecar = Z.infer<typeof Sidecar>

/**
 * The visible fields of a box: its boxlabel, revision and times, its sidecar
 * as the JSON value the host stored (`{}` when it gave none), and `damaged` false. This, or a
 * {@link DamagedBox}, is what a VaultDB's `listBoxes` returns and a vault's snapshot holds,
 * readable while locked. The sidecar is shown as storage holds it: only `getWhisper()` opens the box
 * and so proves it unaltered.
 *
 * @example BoxSummary.parse({ boxlabel: 'anthropic', revision_tok: 'r1', sidecar: {}, registered_at, written_at }).damaged // false
 */
export const BoxSummary = Z.object({
  boxlabel:        NameFloor,
  revision_tok:    Z.string().check(Z.minLength(1)),
  sidecar:         Sidecar,
  registered_at:   EpochMillis,
  written_at:      EpochMillis,
  damaged:         Z._default(Z.literal(false), false),
})
export type BoxSummary = Z.infer<typeof BoxSummary>

/**
 * A box whose stored record does not read back as one -- damaged, tampered with, written by
 * another version of safebyok, or sealed under a vaultKey the vault does not hold -- listed under
 * the boxlabel it is stored under, with nothing else from it trusted but its `revision_tok`, when
 * it holds one as text (null otherwise), which only names the record for a write over it. It
 * sits in a vault's snapshot beside the {@link BoxSummary}s, sorted among them, so a UI can
 * offer to remove it: `delBox()` removes it and `putBox()` writes a fresh box over it,
 * while `getBox()`, `getWhisper()` and `useWhisper()` refuse it with kind 'damaged_box'.
 *
 * @example
 *   for (const box of snapshot.boxes) {
 *     if (box.damaged) { showRemovable(box.boxlabel) } else { showSummary(box.boxlabel, box.sidecar) }
 *   }
 */
export type DamagedBox = { boxlabel: string, damaged: true, revision_tok: string | null }

/** A limit as a storage adapter reports one: a whole number above zero, or `Infinity` for none. */
const roomLimit = Z.union([Z.int().check(Z.positive()), Z.literal(Infinity)])

// A storage adapter's `Infinity`, its way of saying it sets no limit, is kept as the largest
// safe integer, as Vault.make keeps a declared limit: past this check, no limit is infinite.
const roomKept = Z.transform((most: number) => Math.min(most, Number.MAX_SAFE_INTEGER))

/** How much of one limit a vault has used: a whole number `used`, against a whole number `max` above zero. */
const Room = Z.object({ used: Z.int().check(Z.nonnegative()), max: Z.pipe(roomLimit, roomKept) })

/**
 * How much room a vault has: boxes against the most it holds, and bytes against the most its
 * storage holds of one vault. A vault reckons it from its last read; a VaultDB from storage,
 * through `getCapacity` and on a `vault_full` refusal's `meta.capacity`. Either is an estimate:
 * storage checks again on every write, and its answer wins.
 *
 * @example { boxes: { used: 12, max: 100 }, bytes: { used: 48_000, max: 1_000_000 } }
 */
export const Capacity = Z.object({ boxes: Room, bytes: Room })
export type Capacity = Z.infer<typeof Capacity>

/**
 * The ways into a vault, each a {@link WayinRecord}'s `wayinkind`: a `passphrase` the user types,
 * or a `passkey` the user touches (a fingerprint, a face, a security key). Each wayinkind has a
 * wayin shape of its own, and its own slot in the vault props: `passphrase` and `passkey`.
 */
export const WayinKindVals = ['passphrase', 'passkey'] as const
export type WayinKind = typeof WayinKindVals[number]

/**
 * A passphrase's way into the vault: the vaultKey wrapped under the passphraseKey that the vault's
 * passphrase and this wayin's own passphraseSalt make. Every field but `vault_key_wayin_wrapped`
 * is visible, and all of them are bound into that wrap, so a wayin altered or moved to another
 * vault refuses to open. A vault holds exactly one, as its props' `passphrase`.
 */
export const PassphraseWayinRecord = Z.object({
  wayinkind:               Z.literal('passphrase'),
  /** Which keyDeriverSpec made the passphraseKey: `argon2id_web_v1`, or a host's own label. */
  key_deriver_label:       Z.string().check(Z.minLength(1)),
  /** This wayin's passphraseSalt: fresh for every passphrase the vault takes. */
  salt_b64:                Z.string().check(Z.minLength(1)),
  /**
   * The id the device that sealed this way in keeps for the vault in its device mark: random, one
   * per vault per device, never drawn from the device itself.
   */
  device_id:               Z.string().check(Z.minLength(1)),
  /** When this way in was sealed, an {@link EpochMillis}: a new passphrase stamps it afresh. */
  registered_at:           EpochMillis,
  /** The vaultKey, wrapped under the passphraseKey: decrypting this IS the passphrase check. */
  vault_key_wayin_wrapped: Ciphered,
})
export type PassphraseWayinRecord = Z.infer<typeof PassphraseWayinRecord>

/**
 * How many random bytes a passkey wayin's PRF salt holds, as `prf_salt_b64`: what the vault
 * asks the passkey's authenticator to evaluate its PRF over. A {@link PasskeyAnswer} for a new
 * passkey carries a fresh salt this long; `safebyok-react`'s `createPasskey` mints one.
 */
export const PasskeySaltBytes = 32

/**
 * A passkey's way into the vault: the vaultKey wrapped under a passkeyKey made from what the
 * passkey's authenticator answers, through the WebAuthn PRF extension, when asked to evaluate its
 * PRF over this wayin's own salt. The authenticator holds the secret; the wayin holds only
 * which credential to ask (`credential_id`) and what to ask it (`prf_salt_b64`). Every field but
 * `vault_key_wayin_wrapped` is visible, and all of them are bound into that wrap. A vault holds at
 * most one, as its props' `passkey`.
 */
export const PasskeyWayinRecord = Z.object({
  wayinkind:               Z.literal('passkey'),
  /** The WebAuthn credential's id, base64url, as `PublicKeyCredential.id` gives it: which passkey to ask. */
  credential_id:           Z.string().check(Z.minLength(1)),
  /** The salt the passkey's PRF is evaluated over: {@link PasskeySaltBytes} random bytes, fresh for every wayin. */
  prf_salt_b64:            Z.string().check(Z.minLength(1)),
  /**
   * The id the device that added this way in keeps for the vault in its device mark: random, one
   * per vault per device, never drawn from the device itself.
   */
  device_id:               Z.string().check(Z.minLength(1)),
  /** When this way in was added, an {@link EpochMillis}. */
  registered_at:           EpochMillis,
  /** The vaultKey, wrapped under the passkeyKey: decrypting this IS the passkey check. */
  vault_key_wayin_wrapped: Ciphered,
})
export type PasskeyWayinRecord = Z.infer<typeof PasskeyWayinRecord>

/**
 * One way into a vault as stored: the vaultKey, wrapped under a key that one {@link WayinKind}
 * makes, with the visible fields that kind needs. Told apart by `wayinkind`: a
 * {@link PassphraseWayinRecord} or a {@link PasskeyWayinRecord}. The vault hands each out as a
 * `Wayin`, made from its record by `Wayin.make`.
 */
export const WayinRecord = Z.discriminatedUnion('wayinkind', [PassphraseWayinRecord, PasskeyWayinRecord])
export type WayinRecord = Z.infer<typeof WayinRecord>

/**
 * The visible fields of a vault's passphrase, as its snapshot shows them even while locked: its
 * `wayinkind`, and when it was sealed (`registered_at`) and by which device (`device_id`, this
 * vault's id for that device: one per device per vault, so it links nothing the vault does not
 * already link). Never its salt, never its wrap.
 *
 * @example vault.getSnapshot().passphrase   // { wayinkind: 'passphrase', device_id: 'k3x9...', registered_at: 1760000000000 }
 */
export type PassphraseWayinSummary = Pick<PassphraseWayinRecord, 'wayinkind' | 'device_id' | 'registered_at'>

/**
 * The visible fields of a vault's passkey, as its snapshot shows them even while locked: its
 * `wayinkind`, when it was added and by which device, as for {@link PassphraseWayinSummary}, and
 * the `credential_id` and `prf_salt_b64` a host needs before unlocking, to ask the authenticator
 * (`safebyok-react`'s `askPasskey` takes this summary). Never its wrap.
 *
 * @example vault.getSnapshot().passkey   // { wayinkind: 'passkey', device_id, registered_at, credential_id: 'AXk3...', prf_salt_b64: 'q83v...' }, or null
 */
export type PasskeyWayinSummary = Pick<PasskeyWayinRecord, 'wayinkind' | 'device_id' | 'registered_at' | 'credential_id' | 'prf_salt_b64'>

/**
 * The visible fields of one way into a vault, either kind: a {@link PassphraseWayinSummary} or a
 * {@link PasskeyWayinSummary}, told apart by `wayinkind`. What a `damaged_wayin` refusal's
 * `meta.wayin_listed` holds.
 */
export type WayinSummary = PassphraseWayinSummary | PasskeyWayinSummary

/**
 * What a passkey answers when asked for a vault's PRF, as a host hands it to the vault: which
 * credential answered (`credentialId`, base64url, as `PublicKeyCredential.id` gives it), the salt
 * it was asked to evaluate (`prfSaltB64`), and its 32-byte answer (`prfBytes`). The vault checks it
 * into a `PasskeyProof` at its door. The bytes are secret, as good as a passphrase for this vault:
 * pass them to the vault, then drop them.
 * `safebyok-react`'s `createPasskey` and `askPasskey` make one.
 *
 * @example
 *   const passkey = await askPasskey(vault.getSnapshot().passkey)   // null when the user dismissed it
 *   if (passkey !== null) { await vault.unlock(passkey) }
 */
export type PasskeyAnswer = {
  credentialId: string
  prfSaltB64:   string
  prfBytes:     Uint8Array
}

/**
 * The per-vault record the storage layer holds so any device can unlock the vault: its scope,
 * its `vault_id`, and its two ways in, each wrapping the one vaultKey: the `passphrase`, which
 * every vault has, and the `passkey`, which it may have (null when it has none). All of it is
 * safe in the open; none of it opens without the passphrase or the passkey.
 *
 * `unlock_epoch` goes up by one on every change to the ways in -- the passphrase changed, a
 * passkey added, replaced or removed -- so other devices and leases know to ask again.
 */
export const VaultProps = Z.object({
  format:              Z.literal('safebyok-vault-v6'),
  applabel:            NameFloor,
  user_id:             NameFloor,
  vaultlabel:          NameFloor,
  /** Random id minted when the vault is made, and never changed; bound into every encryption. */
  vault_id:            Z.string().check(Z.minLength(1)),
  unlock_epoch:        Z.int().check(Z.positive()),
  /** The vault's passphrase: its one way in by a passphrase, which every vault has. */
  passphrase:          PassphraseWayinRecord,
  /** The vault's passkey, or null when it has none: at most one. */
  passkey:             Z.nullable(PasskeyWayinRecord),
  /** When the vault was made, an {@link EpochMillis}; never changed. */
  registered_at:       EpochMillis,
})
export type VaultProps = Z.infer<typeof VaultProps>

/**
 * The device-local record of a lease: this browser's leaseKey (a non-extractable handle -- it
 * cannot leave the device even through the code that made it) and the vaultKey wrapped under it.
 * Held only by structured-clone storage (IndexedDB) or memory; it has no JSON form, and nothing
 * in it ever goes to the backend. What a `Lease` is made from, and gives back as its `props`.
 */
export const LeaseRecord = Z.object({
  format:            Z.literal('safebyok-lease-v1'),
  applabel:          NameFloor,
  user_id:           NameFloor,
  vaultlabel:        NameFloor,
  vault_id:          Z.string().check(Z.minLength(1)),
  /** The vault props' unlock_epoch when this lease was granted; a mismatch voids it. */
  unlock_epoch:      Z.int().check(Z.positive()),
  /** This browser's leaseKey: non-extractable, usable only to unwrap what it wrapped. */
  lease_key:         cryptoKeyHandle,
  /** The vaultKey, wrapped under the leaseKey. */
  vault_key_lease_wrapped: Ciphered,
  /** The instant from which the lease no longer counts, and the vault asks for the passphrase: an {@link EpochMillis}. */
  ask_passphrase_at: EpochMillis,
})
export type LeaseRecord = Z.infer<typeof LeaseRecord>

/**
 * What a device mark holds of the vault it has seen under its scope: the device's own random
 * `device_id` for the vault, which every way in it adds carries, and the highest `unlock_epoch` it
 * has seen the vault props at, so that an older copy of the vault props storage hands back later is
 * refused (kind 'rolled_back').
 */
export const SeenVault = Z.object({
  /** This device's id for the vault: random, minted the first time it reads or makes the vault. */
  device_id:       Z.string().check(Z.minLength(1)),
  /** The vault this mark is of. */
  vault_id:        Z.string().check(Z.minLength(1)),
  /** The highest `unlock_epoch` this device has seen the vault props at. */
  unlock_epoch:    Z.int().check(Z.positive()),
})
export type SeenVault = Z.infer<typeof SeenVault>

/**
 * What a device keeps of a vault's scope, locked or not, on its own storage: what it has `seen` of
 * the vault standing under the scope, a {@link SeenVault}. Nothing in it is secret. One per scope:
 * a vault made anew under the scope, with another `vault_id`, is seen afresh, under a new
 * `device_id`. `lock()` leaves the mark; `del()` erases it.
 *
 * @example { format: 'safebyok-mark-v5', ...scope, seen: { device_id, vault_id, unlock_epoch: 1 } }
 */
export const DeviceMark = Z.object({
  format:     Z.literal('safebyok-mark-v5'),
  applabel:   NameFloor,
  user_id:    NameFloor,
  vaultlabel: NameFloor,
  /** The vault this device has seen under the scope. */
  seen:       SeenVault,
})
export type DeviceMark = Z.infer<typeof DeviceMark>

/**
 * How many hours a lease lasts on the device, after a proof unlocks the vault, before the vault
 * asks for a proof again, unless the caller says otherwise: seven days.
 */
export const LeaseHours = 168 // seven days

/**
 * How many minutes a `hello()` trusts the vault's last read of storage, unless the caller says
 * otherwise: within five minutes of it, a hello reads nothing anew, so a burst of hellos -- each
 * component that mounts calling one -- costs one read.
 *
 * @example Vault.make({ ...opts, staleMinutes: 1 })   // hello() reads at most once a minute
 */
export const StaleMinutes = 5

/**
 * The longest finite `leaseHours` a vault takes: 588 hours, 24.5 days. The vault drops its key
 * with a timer when the lease ends, and one timer reaches no further than 2^31 - 1 milliseconds,
 * about 24.8 days. A longer lease is `Infinity`, until `lock()`; anything between is refused.
 *
 * @example Vault.make({ ...opts, leaseHours: MaxLeaseHours })   // the longest that ends by itself
 */
export const MaxLeaseHours = 588

/**
 * The largest whisper a vault stores unless the caller says otherwise, in bytes of its JSON and
 * its box's sidecar's together: several times the beefiest credential (an RSA-8192 private key as PEM is about 6.4 KB), and
 * well inside what every storage backend can hold. A larger whisper is usually a sign that the
 * wrong value is being stored.
 */
export const MaxWhisperBytes = 40_444 // searchable: 40444

/**
 * The most boxes a vault holds unless the caller says otherwise: room for every API key a
 * person plausibly keeps, at the largest default whisper, inside what every in-tree storage
 * adapter can hold and still delete in one go. A vault that needs more raises its `maxBoxes`.
 */
export const MaxBoxes = 100

/**
 * Injected time source, so expiry is testable; defaults to the wall clock. `now()` returns epoch
 * milliseconds, as `Date.now()` does, from {@link FarPast} to {@link FarFuture}; a fraction is
 * fine, and rounded down. `Vault.make` reads it once, and refuses a clock that reads outside
 * those bounds -- counting in seconds or microseconds, say -- or throws, with kind 'bad_option'.
 * The vault takes every later reading as it comes.
 */
export type Clock = { now(): number }

/** The wall clock: the default `Clock`. */
export const wallClock: Clock = { now: () => Date.now() }
