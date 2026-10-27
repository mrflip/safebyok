import type * as Z from 'zod'
import { record } from 'zod'
import * as Phrases from '../phrases'
import { Validator } from '../checks/validator'
import * as CX from '../checks/core-checks'
import type { PasskeyWayinSparse, PassphraseWayinSparse, VaultRecord } from '../vault-record'
import { vault_key_lease_wrapped, vault_tok } from './type-aliases'

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

/** The check for a {@link Whisper}, exactly what JSON can carry, never what it would mangle, and never a bare null; and `whisperBag`, the plain JSON object a whisper or a {@link Sidecar} may be.
 * Its `parse` refuses 'bad_whisper', quoting none of it, and naming none of an object's keys: an
 * object that is not plain JSON fails whole.
 *
 * @example Whisper.parse('sk-ant-...')                  // a string passes through
 * @example Whisper.safeParse(new Date()).success        // false: JSON would flatten it to {}
 * @example Whisper.safeParse(undefined).success         // false: undefined cannot be stored
 * @example Whisper.safeParse(null).success              // false: emptying a box is delBox's job
 * @example Whisper.safeParse({ orgId: null }).success   // true: null inside a structure is JSON
 */
export const { Whisper, whisperBag } = Validator('bad_whisper', ({ lazy, union, str, num, bool, lit, arr, custom }) => {
  const whisperJson: Z.ZodType<WhisperJson> = lazy(() => union([str, num, bool, lit(null), whisperArr, plainBag]))
  // An object is judged whole, so a refusal's path never holds one of its keys, which are the caller's own.
  const whisperMembers = record(str, whisperJson)
  const plainBag = custom<Record<string, WhisperJson>>((val) => isPlainBag(val) && whisperMembers.safeParse(val).success, Phrases.WhisperBagShape)
  const whisperArr = arr(whisperJson)
  // A judged object is the caller's own, so each check hands back a copy, as a parse of an object does:
  // a box freezes its record through, and must never freeze, or share, the caller's sidecar.
  const whisperBag = plainBag.overwrite((bag) => structuredClone(bag))
  const Whisper: Z.ZodType<Whisper> = union([str, num, bool, whisperArr, plainBag]).overwrite((whisper) => structuredClone(whisper))
  return { Whisper, whisperBag }
})

/** The applabel, user_id and vaultlabel that name one vault. Its `parse` hands back a frozen copy, or refuses 'bad_scope'.
 * Each label is a `label`, and the user_id a `user_id`. A scope carrying more fields passes, the
 * rest left out: a vault record, or a Vault object, passes as its scope.
 */
export const VaultScope = CX.vaultScope
export type VaultScope = CX.VaultScope

/** A box's sidecar: your app's own JSON object beside the whisper, `{}` for none, shown while the vault is locked. Never put secret material in it.
 * It is stored in the clear, as the JSON object it is (a `jsonb` column, say, which a server can
 * query), so anyone who can read the database can read it. It is in the box's stamp as its JSON
 * with keys sorted: a sidecar altered in storage makes the box refuse to open, while one whose
 * keys storage reorders still opens. safebyok never looks inside it: check its shape before
 * `putBox()`. Its `parse` refuses 'bad_option', as `putBox()` does.
 *
 * @example Sidecar.parse({ note: 'work account', project: 'atlas' })
 * @example Sidecar.safeParse({ when: new Date() }).success     // false: JSON would flatten it to {}
 * @example Sidecar.safeParse('work account').success           // false: a sidecar is an object -- { note: 'work account' }
 */
export const { Sidecar } = Validator('bad_option', () => ({ Sidecar: whisperBag }))
export type Sidecar = Z.infer<typeof Sidecar>

/** How much room a vault has: boxes against the most it holds, and bytes against the most its storage holds of one vault.
 * A vault reckons it from its last read; a VaultDB from storage, in `getCapacity` and a
 * `vault_full`'s `meta.capacity`. Either is an estimate: storage checks again on every write, and
 * its answer wins. A limit storage reports as `Infinity` reads as `Number.MAX_SAFE_INTEGER`. Its
 * `parse` refuses 'bad_record'.
 *
 * @example { boxes: { used: 12, max: 100 }, bytes: { used: 48_000, max: 1_000_000 } }
 */
export const { Capacity } = Validator('bad_record', ({ obj, union, int, uint, lit }) => {
  // A storage adapter's `Infinity`, its way of saying it sets no limit, is kept as the largest
  // safe integer, as Bank.make keeps a declared limit: past this check, no limit is infinite.
  const roomLimit = union([int.positive(), lit(Infinity)]).transform((most) => Math.min(most, Number.MAX_SAFE_INTEGER))
  const room      = obj({ used: uint, max: roomLimit })
  return { Capacity: obj({ boxes: room, bytes: room }) }
})
export type Capacity = Z.infer<typeof Capacity>

/** The kinds of wayin, each with a record shape and a slot of the gate of its own: a `passphrase` the user types, or a `passkey` the user touches. */
export const WayinKindVals = ['passphrase', 'passkey'] as const
export type WayinKind = typeof WayinKindVals[number]

/** How many random bytes a passkey wayin's `prf_salt_b64` holds.
 * A new passkey's {@link PasskeyAnswer} carries a fresh salt this long, as `createPasskey` mints.
 */
export const PasskeySaltBytes = 32

/** A vault's passphrase wayin as a log line or a `damaged_wayin` refusal's `meta.wayin_listed` shows it: its {@link PassphraseWayinSparse} and its `vault_tok`.
 * The `device_id` is one per device per vault, so it links nothing the vault does not already
 * link. A snapshot's `gate` shows the sparse shape alone.
 *
 * @example err.meta?.wayin_listed   // { wayinkind: 'passphrase', device_id: 'k3x9...', registered_at: 1760000000000, vault_tok: 'v7q2...' }
 */
export type PassphraseWayinSummary = PassphraseWayinSparse & Pick<VaultRecord, 'vault_tok'>

/** A vault's passkey wayin as a log line or a `damaged_wayin` refusal's `meta.wayin_listed` shows it: its {@link PasskeyWayinSparse} and its `vault_tok`.
 * A snapshot's `gate` shows the sparse shape alone.
 *
 * @example err.meta?.wayin_listed   // { wayinkind: 'passkey', device_id, registered_at, vault_tok, credential_id: 'AXk3...', prf_salt_b64: 'q83v...' }
 */
export type PasskeyWayinSummary = PasskeyWayinSparse & Pick<VaultRecord, 'vault_tok'>

/** A wayin of either kind as a log line shows it, told apart by `wayinkind`: what a `damaged_wayin` refusal's `meta.wayin_listed` holds. */
export type WayinSummary = PassphraseWayinSummary | PasskeyWayinSummary

/** A passkey's answer when asked for a vault's PRF: the cleartext a gating takes for a passkey. `safebyok-react`'s `askPasskey` makes one.
 * An `unlock_vault` gating takes it in `attemptPasskey`; `initialize_gate` and `put_passkey` take
 * it in `attempt`, beside the passphrase.
 *
 * @example
 *   const passkey = await askPasskey(vault.getSnapshot().gate)   // null when the user dismissed it
 *   if (passkey !== null) { await gating.attemptPasskey(passkey) }   // an unlock_vault gating's
 */
export type PasskeyAnswer = {
  /** Base64url, as `PublicKeyCredential.id` gives it. */
  credential_id: string
  prf_salt_b64:  string
  /** 32 bytes, as good as the passphrase for this vault: hand them to the gating, then drop them. */
  prfBytes:      Uint8Array
}

/** A lease as this device keeps it: the non-extractable leaseKey, and the vaultKey wrapped under it. What a `Lease` is made from.
 * It has no JSON form, so only structured-clone storage (IndexedDB) or memory holds it. Nothing in
 * it ever goes to the backend. Its `parse` is strict, and refuses 'bad_record'.
 */
export const { LeaseRecord } = Validator('bad_record', ({ obj, int, lit, custom, applabel, user_id, vaultlabel, epochMillis }) => ({
  LeaseRecord: obj({
    format:            lit('safebyok-lease-v1'),
    applabel,
    user_id,
    vaultlabel,
    vault_tok,
    /** The vault record's `gate_epoch` when this lease was granted: a mismatch voids it. */
    gate_epoch:        int.positive(),
    /** This browser's leaseKey, a CryptoKey, never its bytes: non-extractable, usable only to unwrap what it wrapped. */
    lease_key:         custom<CryptoKey>((val) => val instanceof CryptoKey, "a CryptoKey handle"),
    /** The vaultKey, wrapped under the leaseKey. */
    vault_key_lease_wrapped,
    /** The instant from which the lease no longer counts, and the vault asks for cleartext again. */
    ask_passphrase_at: epochMillis,
  }).strict(),
}))
export type LeaseRecord = Z.infer<typeof LeaseRecord>

/** The `format` a {@link DeviceRecord} carries. */
export const DeviceRecordFormat = 'safebyok-device-v1'

/** What this device keeps of one scope, locked or not, across the vault's lives there: its own id, and the highest `vault_epoch` it has seen. Nothing in it is secret.
 * A vault served below `highest_vault_epoch` was rolled back, and the bank refuses it as
 * 'vault_behind'. The DeviceDB raises it, never lowers it: a write of a lower epoch keeps the
 * higher, and the first `device_id` stored stays. `bank.clearCachedVault` erases it. Its `parse`
 * is strict, refuses 'bad_record', and hands back the record frozen. A record that fails it reads
 * as none. `deviceRecordOf` builds one from a parsed scope.
 *
 * @example { format: 'safebyok-device-v1', ...scope, device_id: 'Zm9vYmFy', highest_vault_epoch: 3 }
 */
// A field added here bumps the format: a device whose safebyok predates the field discards the
// record, and with it the `highest_vault_epoch` that guards it against a rolled-back vault, until
// its next read raises it again.
export const { DeviceRecord } = Validator('bad_record', ({ obj, str, uint, lit, applabel, user_id, vaultlabel }) => ({
  DeviceRecord: obj({
    format:              lit(DeviceRecordFormat),
    applabel,
    user_id,
    vaultlabel,
    /** This device's random id for the scope, minted the first time it births the vault there, and carried by every wayin it seals. */
    device_id:           str.min(1),
    /** The highest `vault_epoch` this device has seen the scope's vault at, in any of its lives. */
    highest_vault_epoch: uint,
  }).strict().readonly(),
}))
export type DeviceRecord = Z.infer<typeof DeviceRecord>

/** The default `leaseHours`: how long a lease lasts on this device after a gating unlocks, before the vault asks again. */
export const LeaseHours = 168 // seven days

/** The default `staleMinutes`: how long a `hello()` trusts the last read of storage, so a burst of hellos costs one read.
 *
 * @example Bank.make({ ...opts, staleMinutes: 1 })   // hello() reads at most once a minute
 */
export const StaleMinutes = 5

/** The longest finite `leaseHours` a vault takes, 24.5 days: the most one timer reaches. Above it, only `Infinity`, until `lock()`, is taken.
 *
 * @example Bank.make({ ...opts, leaseHours: MaxLeaseHours })   // the longest that ends by itself
 */
export const MaxLeaseHours = 588

/** The default `maxWhisperBytes`: bytes of a whisper's JSON and its sidecar's together, several times an RSA-8192 private key's PEM.
 * A larger whisper is usually a sign that the wrong value is being stored.
 */
export const MaxWhisperBytes = 40_444 // searchable: 40444

/** The default `maxBoxes`: within what every supplied storage adapter can hold and still delete in one go, at the default largest whisper. */
export const MaxBoxes = 100

/** A source of the time, `Bank.make`'s `clock`: `now()` is epoch milliseconds, as `Date.now()` gives, a fraction rounded down.
 * `Bank.make` reads it once, and refuses 'bad_option' for a reading outside `FarPast` to
 * `FarFuture`, or a throw. The vault takes every later reading as it comes.
 */
export type Clock = { now(): number }

/** The wall clock: the default `Clock`. */
export const wallClock: Clock = { now: () => Date.now() }
