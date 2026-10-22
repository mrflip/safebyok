import * as Z from 'zod/mini'
import { Ciphered } from './crypto'
import { NameFloor } from './validators'

/** The JSON a whisper is made of, `null` included inside an array or object: a whole {@link Whisper} cannot be null. */
export type WhisperJson = string | number | boolean | null | WhisperJson[] | { [ckey: string]: WhisperJson }

/** The secret kept in a box: a JSON value, a string, number, boolean, array or plain object.
 * `undefined` anywhere in it is refused, as JSON cannot carry it. A bare `null` is refused too:
 * emptying a box is `delBox`'s job.
 *
 * @example 'sk-ant-api03-...'
 * @example { apiKey: 'sk-ant-...', orgId: null }
 */
export type Whisper = Exclude<WhisperJson, null>

/** True for a plain object, built by a literal or `Object.create(null)`: never a Date or Map, which JSON would flatten. */
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

/** The check for a {@link Whisper}: exactly what JSON can carry, never what it would mangle, and never a bare null.
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

/** The latest instant the package accepts, 2255-06-05T23:47:34.740Z: the last millisecond whose epoch microseconds fit a safe integer.
 * `askPassphraseAt` is near it when the vault asks again only after `lock()`, as under
 * `leaseHours: Infinity`. Show "until locked" for any instant within a minute of it, not only one
 * equal to it.
 *
 * @example askPassphraseAt >= FarFuture - MinuteMillis ? 'until locked' : new Date(askPassphraseAt).toLocaleString()
 * @example new Date(FarFuture).toISOString()   // '2255-06-05T23:47:34.740Z'
 */
export const FarFuture = 9_007_199_254_740 // Math.floor(Number.MAX_SAFE_INTEGER / 1000)

/** The earliest instant the package accepts, 1981-01-01T00:00:00Z, as {@link EpochMillis} checks.
 *
 * @example new Date(FarPast).toISOString()   // '1981-01-01T00:00:00.000Z'
 */
export const FarPast = 347_155_200_000 // Date.UTC(1981, 0, 1)

/** One minute, in milliseconds: the margin to leave when asking whether an instant is {@link FarFuture}, the vault's "never".
 *
 * @example askPassphraseAt >= FarFuture - MinuteMillis   // true while the vault stays unlocked until lock()
 */
export const MinuteMillis = 60_000

/** The lease a vault grants for "until `lock()`", in milliseconds: `leaseHours: Infinity` reads as this in a vault's `leaseMillis`.
 * It spans {@link FarPast} to {@link FarFuture}, so a lease granted at any instant the clock may
 * read ends at {@link FarFuture}.
 *
 * @example vault.leaseMillis >= ForeverMillis - MinuteMillis           // true when opened with leaseHours: Infinity
 * @example FarPast + ForeverMillis === FarFuture                       // true: a window from the earliest instant ends at the last
 */
export const ForeverMillis = FarFuture - FarPast

/** The check for an instant: whole UTC epoch milliseconds from {@link FarPast} to {@link FarFuture}, both included.
 * Every time the package keeps is one, and a stored record holding anything else fails its check.
 * The bounds catch epoch seconds and epoch microseconds passed by mistake.
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

/** What names one vault: the app's label, the signed-in user's id, and the vault's own label.
 * It checks each name only against {@link NameFloor}. The vault's `validators` say what else a
 * name may be, where it enters (`Label` and `UserId` by default).
 */
export const VaultScope = Z.object({
  applabel:   NameFloor,
  user_id:    NameFloor,
  vaultlabel: NameFloor,
})
export type VaultScope = Z.infer<typeof VaultScope>

/** A CryptoKey, as a record holds one: never its bytes. */
const cryptoKeyHandle = Z.custom<CryptoKey>((val) => val instanceof CryptoKey, 'a CryptoKey handle')

/** A box's sidecar: your app's own JSON object beside the whisper, `{}` for none, shown while the vault is locked. Never put secret material in it.
 * It is stored in the clear, as the JSON object it is (a `jsonb` column, say, which a server can
 * query), so anyone who can read the database can read it. It is bound into the box's encryption
 * as its JSON with keys sorted, so a sidecar altered in storage makes the box refuse to open, while
 * one whose keys storage reorders still opens. safebyok never looks inside it: check its shape
 * before `putBox()`.
 *
 * @example Sidecar.parse({ note: 'work account', project: 'atlas' })
 * @example Sidecar.safeParse({ when: new Date() }).success     // false: JSON would flatten it to {}
 * @example Sidecar.safeParse('work account').success           // false: a sidecar is an object -- { note: 'work account' }
 */
export const Sidecar: Z.ZodMiniType<Record<string, WhisperJson>> = whisperBag
export type Sidecar = Z.infer<typeof Sidecar>

/** The visible fields of a sound box, readable while locked: what a vault's snapshot holds beside {@link DamagedBox}es.
 * They are a `Box`'s own fields, as `{ ...box }` holds them, `vault_tok` among them, and `damaged`
 * false. Its sidecar is `{}` when the host gave none. The sidecar is as storage holds it: only
 * `getWhisper()` opens the box and so proves it unaltered.
 *
 * @example BoxSummary.parse({ boxlabel: 'anthropic', revision_tok: 'r1', sidecar: {}, registered_at, written_at, vault_tok }).damaged // false
 */
export const BoxSummary = Z.object({
  boxlabel:        NameFloor,
  revision_tok:    Z.string().check(Z.minLength(1)),
  sidecar:         Sidecar,
  registered_at:   EpochMillis,
  written_at:      EpochMillis,
  vault_tok:       Z.string().check(Z.minLength(1)),
  damaged:         Z._default(Z.literal(false), false),
})
export type BoxSummary = Z.infer<typeof BoxSummary>

/** A box as a VaultDB's `listBoxes` lists it: a {@link BoxSummary} but for its `vault_tok`, which the vault adds from the vault props it read beside the listing. */
export type ListedSummary = Omit<BoxSummary, 'vault_tok'>

/** A box whose stored record does not read back as one, listed under its boxlabel among the {@link BoxSummary}s of a vault's snapshot.
 * That covers damage, tampering, another version's record, or a vaultKey the vault does not hold.
 * Nothing of it is trusted but its `revision_tok`, which only names the record to write over; null
 * when it holds none as text. `delBox()` removes it and `putBox()` writes a fresh box over it.
 * `getBox()`, `getWhisper()` and `useWhisper()` refuse it 'damaged_box'.
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

/** How much room a vault has: boxes against the most it holds, and bytes against the most its storage holds of one vault.
 * A vault reckons it from its last read; a VaultDB from storage, in `getCapacity` and a
 * `vault_full`'s `meta.capacity`. Either is an estimate: storage checks again on every write, and
 * its answer wins. A limit storage reports as `Infinity` reads as `Number.MAX_SAFE_INTEGER`.
 *
 * @example { boxes: { used: 12, max: 100 }, bytes: { used: 48_000, max: 1_000_000 } }
 */
export const Capacity = Z.object({ boxes: Room, bytes: Room })
export type Capacity = Z.infer<typeof Capacity>

/** The kinds of wayin, each with a record shape and a vault props slot of its own: a `passphrase` the user types, or a `passkey` the user touches. */
export const WayinKindVals = ['passphrase', 'passkey'] as const
export type WayinKind = typeof WayinKindVals[number]

/** A passphrase wayin as stored: the vaultKey wrapped under the passphraseKey the passphrase and this wayin's passphraseSalt make.
 * Every other field is visible, and bound into that wrap, so a wayin altered or moved to another
 * vault refuses to open. A vault holds exactly one, as its props' `passphrase`.
 */
export const PassphraseWayinRecord = Z.object({
  wayinkind:               Z.literal('passphrase'),
  /** Which keyDeriverSpec made the passphraseKey: `argon2id_web_v1`, or a host's own label. */
  key_deriver_label:       Z.string().check(Z.minLength(1)),
  /** This wayin's passphraseSalt: fresh for every passphrase the vault takes. */
  salt_b64:                Z.string().check(Z.minLength(1)),
  /** The sealing device's random id for the vault, from its device mark: never drawn from the device itself. */
  device_id:               Z.string().check(Z.minLength(1)),
  /** When this wayin was sealed: a new passphrase stamps it afresh. */
  registered_at:           EpochMillis,
  /** The vaultKey, wrapped under the passphraseKey: unwrapping it is the passphrase check. */
  vault_key_wayin_wrapped: Ciphered,
})
export type PassphraseWayinRecord = Z.infer<typeof PassphraseWayinRecord>

/** How many random bytes a passkey wayin's `prf_salt_b64` holds.
 * A new passkey's {@link PasskeyAnswer} carries a fresh salt this long, as `createPasskey` mints.
 */
export const PasskeySaltBytes = 32

/** A passkey wayin as stored: the vaultKey wrapped under the passkeyKey made from the authenticator's PRF answer over this wayin's salt.
 * The authenticator holds the secret. Every other field is visible, and bound into that wrap. A
 * vault holds at most one, as its props' `passkey`.
 */
export const PasskeyWayinRecord = Z.object({
  wayinkind:               Z.literal('passkey'),
  /** The WebAuthn credential's id, base64url, as `PublicKeyCredential.id` gives it: which passkey to ask. */
  credential_id:           Z.string().check(Z.minLength(1)),
  /** The salt the passkey's PRF is evaluated over: {@link PasskeySaltBytes} random bytes, fresh for every wayin. */
  prf_salt_b64:            Z.string().check(Z.minLength(1)),
  /** The adding device's random id for the vault, from its device mark: never drawn from the device itself. */
  device_id:               Z.string().check(Z.minLength(1)),
  /** When this wayin was added. */
  registered_at:           EpochMillis,
  /** The vaultKey, wrapped under the passkeyKey: unwrapping it is the passkey check. */
  vault_key_wayin_wrapped: Ciphered,
})
export type PasskeyWayinRecord = Z.infer<typeof PasskeyWayinRecord>

/** One wayin as stored, a {@link PassphraseWayinRecord} or a {@link PasskeyWayinRecord}, told apart by `wayinkind`; `Wayin.make` reads one. */
export const WayinRecord = Z.discriminatedUnion('wayinkind', [PassphraseWayinRecord, PasskeyWayinRecord])
export type WayinRecord = Z.infer<typeof WayinRecord>

/** A vault's passphrase as its snapshot shows it, even while locked: its kind, when and by which device it was sealed, and its `vault_tok`.
 * The `device_id` is one per device per vault, so it links nothing the vault does not already link.
 *
 * @example vault.getSnapshot().passphrase   // { wayinkind: 'passphrase', device_id: 'k3x9...', registered_at: 1760000000000, vault_tok: 'v7q2...' }
 */
export type PassphraseWayinSummary = Pick<PassphraseWayinRecord, 'wayinkind' | 'device_id' | 'registered_at'> & Pick<VaultProps, 'vault_tok'>

/** A vault's passkey as its snapshot shows it, even while locked: a {@link PassphraseWayinSummary}'s fields, and what to ask the authenticator with.
 * `safebyok-react`'s `askPasskey` takes it.
 *
 * @example vault.getSnapshot().passkey   // { wayinkind: 'passkey', device_id, registered_at, vault_tok, credential_id: 'AXk3...', prf_salt_b64: 'q83v...' }, or null
 */
export type PasskeyWayinSummary = Pick<PasskeyWayinRecord, 'wayinkind' | 'device_id' | 'registered_at' | 'credential_id' | 'prf_salt_b64'> & Pick<VaultProps, 'vault_tok'>

/** A wayin of either kind as a snapshot shows it, told apart by `wayinkind`: what a `damaged_wayin` refusal's `meta.wayin_listed` holds. */
export type WayinSummary = PassphraseWayinSummary | PasskeyWayinSummary

/** What a passkey answers when asked for a vault's PRF, to hand to the vault as proof: `safebyok-react`'s `askPasskey` makes one.
 * `credentialId` is base64url, as `PublicKeyCredential.id` gives it. `prfBytes`, 32 of them, are
 * as good as the passphrase for this vault: pass them to the vault, then drop them.
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

/** The fields every vault props record opens with, gated or gateless: its format, its scope and its `vault_tok`. */
const VaultPropsHead = {
  format:              Z.literal('safebyok-vault-v6'),
  applabel:            NameFloor,
  user_id:             NameFloor,
  vaultlabel:          NameFloor,
  /** A random token minted when the vault is made, never changed, and bound into every encryption. */
  vault_tok:           Z.string().check(Z.minLength(1)),
  /** A counter the store bumps on every write of the gate and on the vault's deletion, and carries on into a new life of the scope.
   * It only goes up; a device that has seen a higher one than storage shows knows storage was rolled back.
   * No box write moves it, and a writer's own value is ignored: the store decides.
   */
  vault_epoch:         Z.int().check(Z.nonnegative()),
}

/** The vault props of a vault whose gate is made: a `gate_epoch` of 1 or more, its passphrase wayin, and its passkey or null.
 * `gate_epoch` goes up by one on every change of wayins, so other devices and leases know to ask
 * again.
 */
export const GatedVaultProps = Z.object({
  ...VaultPropsHead,
  gate_epoch:          Z.int().check(Z.positive()),
  /** The vault's passphrase wayin, which every gated vault has. */
  passphrase:          PassphraseWayinRecord,
  /** The vault's passkey, or null when it has none: at most one. */
  passkey:             Z.nullable(PasskeyWayinRecord),
  /** When the vault was made; never changed. */
  registered_at:       EpochMillis,
})
export type GatedVaultProps = Z.infer<typeof GatedVaultProps>

/** The vault props of a vault made with no gate yet: `gate_epoch` 0, and no way in.
 * A vault is first stored so, by `VaultDB.ensureVault`. Its first gate is written over it at
 * `gate_epoch` 1, expecting 0.
 *
 * @example { format: 'safebyok-vault-v6', ...scope, vault_tok, vault_epoch: 0, registered_at, gate_epoch: 0, passphrase: null, passkey: null }
 */
export const GatelessVaultProps = Z.object({
  ...VaultPropsHead,
  gate_epoch:          Z.literal(0),
  passphrase:          Z.null(),
  passkey:             Z.null(),
  registered_at:       EpochMillis,
})
export type GatelessVaultProps = Z.infer<typeof GatelessVaultProps>

/** The `format` a {@link Tombstone} carries, which tells it from vault props stored in the same place. */
export const TombstoneFormat = 'safebyok-tombstone-v1'

/** What a deleted vault leaves in its scope: its counter, which the next life of the scope carries on.
 * `vault_epoch` is the deleted vault's plus one. Every write refuses over a tombstone as it does
 * over no vault, a deletion included: it holds no `vault_tok` for an expectation to name. The next
 * `ensureVault` of the scope replaces it with a new life.
 *
 * @example { format: 'safebyok-tombstone-v1', ...scope, vault_epoch: 4 }
 */
export const Tombstone = Z.object({
  format:              Z.literal(TombstoneFormat),
  applabel:            NameFloor,
  user_id:             NameFloor,
  vaultlabel:          NameFloor,
  vault_epoch:         Z.int().check(Z.positive()),
})
export type Tombstone = Z.infer<typeof Tombstone>

/** The one record per vault that every device syncs: its scope, its `vault_tok`, and its wayins, each wrapping the one vaultKey.
 * None of it opens without a proof. It is {@link GatedVaultProps} once the vault has a gate, and
 * {@link GatelessVaultProps} before. Vault props at a `gate_epoch` of 1 or more with no
 * passphrase are neither, and refused.
 */
export const VaultProps = Z.union([GatedVaultProps, GatelessVaultProps])
export type VaultProps = Z.infer<typeof VaultProps>

/** True for vault props whose gate is made: {@link GatedVaultProps}, as opposed to gateless ones.
 *
 * @example if (isGated(vaultProps)) { offerUnlock(vaultProps.passphrase) } else { offerNewPassphrase() }
 */
export const isGated = (vaultProps: VaultProps): vaultProps is GatedVaultProps => vaultProps.gate_epoch > 0

/** A lease as this device keeps it: the non-extractable leaseKey, and the vaultKey wrapped under it. What a `Lease` is made from.
 * It has no JSON form, so only structured-clone storage (IndexedDB) or memory holds it. Nothing in
 * it ever goes to the backend.
 */
export const LeaseRecord = Z.object({
  format:            Z.literal('safebyok-lease-v1'),
  applabel:          NameFloor,
  user_id:           NameFloor,
  vaultlabel:        NameFloor,
  vault_tok:         Z.string().check(Z.minLength(1)),
  /** The vault props' `gate_epoch` when this lease was granted: a mismatch voids it. */
  gate_epoch:        Z.int().check(Z.positive()),
  /** This browser's leaseKey: non-extractable, usable only to unwrap what it wrapped. */
  lease_key:         cryptoKeyHandle,
  /** The vaultKey, wrapped under the leaseKey. */
  vault_key_lease_wrapped: Ciphered,
  /** The instant from which the lease no longer counts, and the vault asks for a proof. */
  ask_passphrase_at: EpochMillis,
})
export type LeaseRecord = Z.infer<typeof LeaseRecord>

/** What a device mark holds of the vault it has seen under its scope: its own id for the vault, and the highest `gate_epoch` it has seen.
 * Older vault props that storage hands back later are refused as 'rolled_back'.
 */
export const SeenVault = Z.object({
  /** This device's random id for the vault, minted the first time it reads or makes the vault, and carried by every wayin it seals. */
  device_id:       Z.string().check(Z.minLength(1)),
  /** The vault this mark is of. */
  vault_tok:       Z.string().check(Z.minLength(1)),
  /** The highest `gate_epoch` this device has seen the vault props at. */
  gate_epoch:      Z.int().check(Z.positive()),
})
export type SeenVault = Z.infer<typeof SeenVault>

/** What a device keeps of a vault's scope, locked or not: what it has `seen` of the vault there. Nothing in it is secret.
 * There is one per scope: a vault made anew there is seen afresh, under a new `device_id`.
 * `lock()` leaves the mark, and `del()` erases it.
 *
 * @example { format: 'safebyok-mark-v5', ...scope, seen: { device_id, vault_tok, gate_epoch: 1 } }
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

/** The default `leaseHours`: how long a proof's unlock lasts on this device before the vault asks again. */
export const LeaseHours = 168 // seven days

/** The default `staleMinutes`: how long a `hello()` trusts the last read of storage, so a burst of hellos costs one read.
 *
 * @example Vault.make({ ...opts, staleMinutes: 1 })   // hello() reads at most once a minute
 */
export const StaleMinutes = 5

/** The longest finite `leaseHours` a vault takes, 24.5 days: the most one timer reaches. Above it, only `Infinity`, until `lock()`, is taken.
 *
 * @example Vault.make({ ...opts, leaseHours: MaxLeaseHours })   // the longest that ends by itself
 */
export const MaxLeaseHours = 588

/** The default `maxWhisperBytes`: bytes of a whisper's JSON and its sidecar's together, several times an RSA-8192 private key's PEM.
 * A larger whisper is usually a sign that the wrong value is being stored.
 */
export const MaxWhisperBytes = 40_444 // searchable: 40444

/** The default `maxBoxes`: within what every supplied storage adapter can hold and still delete in one go, at the default largest whisper. */
export const MaxBoxes = 100

/** A source of the time, `Vault.make`'s `clock`: `now()` is epoch milliseconds, as `Date.now()` gives, a fraction rounded down.
 * `Vault.make` reads it once, and refuses 'bad_option' for a reading outside {@link FarPast} to
 * {@link FarFuture}, or a throw. The vault takes every later reading as it comes.
 */
export type Clock = { now(): number }

/** The wall clock: the default `Clock`. */
export const wallClock: Clock = { now: () => Date.now() }
