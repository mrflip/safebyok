import type { Bank } from '../models/bank'
import type { BankListing } from '../models/bank-listing'
import type { Device } from '../models/device'
import type { Box } from '../models/box'
import type { BoxListing } from '../models/box-listing'
import type { Gate } from '../models/gate'
import type { GateListing } from '../models/gate-listing'
import type { Gating } from '../models/gating'
import type { Lease } from '../models/lease'
import type { Proving } from '../models/proving'
import type { Vault } from '../models/vault'
import type { VaultListing } from '../models/vault-listing'
import type { Wayin } from '../models/wayin'
import type { Whisper } from '../shapes/shapes-core'

/** The character between a scopepath's parts. No label or user_id may contain it. */
export const ScopepathDelimiter = '^'

/** The latest time the package accepts, 2255-06-05T23:47:34.740Z.
 * It is the last millisecond whose count of microseconds since the epoch is a safe integer.
 */
export const FarFuture = 9_007_199_254_740 // Math.floor(Number.MAX_SAFE_INTEGER / 1000)

/** The earliest time the package accepts, 1981-01-01T00:00:00Z. */
export const FarPast = 347_155_200_000 // Date.UTC(1981, 0, 1)

/** One minute, in milliseconds. */
export const MinuteMillis = 60_000

/** The longest span between two times the package accepts, in milliseconds: {@link FarPast} to {@link FarFuture}. */
export const ForeverMillis = FarFuture - FarPast

// The version of this package, written to each device row. A release bumps it by hand, in the Version PR; a test holds it to package.json.
/** The npm version of safebyok. */
export const PackageVersion = '0.5.0'

// A name carrying it marks a stored layout: increment a version when its layout changes, and every older database is deleted unread. Three zero-padded parts, so that names sort as versions do.
/** The layout version in the name of the device database, `safebyok:device-v002-001-001`. */
export const DeviceDBVersion = '002-001-001'

/** The layout version in the name of the device row database, `safebyok:devicerow-v002-001-001`. */
export const DeviceRowDBVersion = '002-001-001'

// RFC 9106's recommendation for Argon2id. One length for every deriver, until a host asks for another.
/** The length in bytes of a passphraseSalt, and so the `salt_size` of every key deriver. */
export const PassphraseSaltSize = 16

/** The length in bytes of a passphraseKey, a 256-bit AES-GCM key. */
export const PassphraseKeySize = 32

/** The length in bytes of a passkey wayin's PRF salt.
 * A new passkey's answer with a salt of any other length is refused, and a stored one fails its record's check.
 */
export const PasskeySaltSize = 32

/** The most box rows a vault life may have, live and deleted together, unless its bankDB was made with `maxBoxes`. */
export const DefaultMaxBoxes = 100

// About 95% of Postgres's 8,000-byte NOTIFY payload, less the 1,944 bytes of the Larger vault row in notes/reference-sizes.md, rounded down.
/** The most bytes a box record's JSON may weigh, unless its bankDB was made with `maxRecordSizeEst`. */
export const DefaultMaxRecordSizeEst = 5600

// A brand is a `Symbol.for` key, so a second copy of safebyok (our ESM and CJS builds side by side, or one an adapter
// bundles) wears and reads the same one, and a host may wear one on purpose. Non-enumerable, it stays out of a spread,
// `Object.keys`, `JSON.stringify` and a log line.
/** Mark `obj` with `val` under the symbol `Brand`, fixed and hidden, and return `obj`. {@link brandOf} reads it back. */
export function brand<ObjT extends object>(obj: ObjT, Brand: symbol, val: unknown = true): ObjT {
  return Object.defineProperty(obj, Brand, { value: val, enumerable: false, writable: false, configurable: false })
}

/** The mark `val` carries under `Brand`, or undefined. Safe to call on any value. */
export function brandOf(val: unknown, Brand: symbol): unknown {
  return (typeof val === 'function' || (typeof val === 'object' && val !== null)) ? (val as Partial<Record<symbol, unknown>>)[Brand] : undefined
}

/** The mark on the stand-in that `box.whisper` returns when it will not show the whisper.
 * Don't read the mark or compare `box.whisper` with a bag: ask `box.exposure`, `box.isShowing`, `box.isVeiled` or {@link isWhisperedBag}.
 */
export const Whispered: unique symbol = Symbol.for('@safebyok/whispered')

/** The stand-in that `box.whisper` returns when it will not show the whisper. It types as a whisper, and carries {@link Whispered}. */
export type WhisperedBag = Whisper & { readonly [Whispered]: 'encrypted' | 'locked' | 'veiled' }

// Literals, not `brand()`: the mark is an own enumerable key, so a spread or an assign carries it to the put that refuses it.
// Each copy of safebyok freezes its own bags, so a host comparing `box.whisper` with one fails across copies, where
// `box.exposure`, a string, does not.
/** What `box.whisper` returns when the whisper is not exposed. Ask `box.exposure` instead of comparing with this bag. */
export const ENCRYPTED: WhisperedBag = Object.freeze({ [Whispered]: 'encrypted' })

/** What `box.whisper` returns when the whisper is exposed but the bank is locked. Ask `box.exposure` instead of comparing with this bag. */
export const LOCKED: WhisperedBag = Object.freeze({ [Whispered]: 'locked' })

/** What `box.whisper` returns when the whisper is exposed but veiled. Ask `box.exposure` instead of comparing with this bag. */
export const VEILED: WhisperedBag = Object.freeze({ [Whispered]: 'veiled' })

/** True for anything carrying {@link Whispered}, a spread copy included.
 * Forging one is harmless: a put refuses it as a whisper.
 */
export function isWhisperedBag(val: unknown): val is WhisperedBag { return (typeof val === 'object') && (brandOf(val, Whispered) !== undefined) }

// A check reads the getter in place of instanceof, which needs the class imported (a cycle, often) and fails across the
// ESM and CommonJS builds. A getter sits on the prototype, so it is no own key that a spread or Object.keys would meet.
/** The model class each `modelkind` names: `ClassForModelkind['box']` is `Box`. */
export type ClassForModelkind = {
  device: Device, bank: Bank, gate: Gate, vault: Vault, box: Box, bank_listing: BankListing, gate_listing: GateListing, vault_listing: VaultListing, box_listing: BoxListing,
  gating: Gating, wayin: Wayin, lease: Lease, proving: Proving,
}

/** What a model's `modelkind` getter returns: `box.modelkind` is `'box'`. */
export type Modelkind = keyof ClassForModelkind

/** True when `val` is a model of one of `modelkinds`, narrowing it to that class. */
export function hasModelkind<MKT extends Modelkind>(val: unknown, ...modelkinds: MKT[]): val is ClassForModelkind[MKT] {
  return (typeof val === 'object') && (val !== null) && (modelkinds as Modelkind[]).includes((val as { modelkind?: unknown }).modelkind as Modelkind)
}

/** The brand every BankDB carries, read by {@link isBankDB}. */
export const IsBankDB: unique symbol = Symbol.for('@safebyok/bankdb')

/** True for a BankDB made by any copy of safebyok. */
export function isBankDB(val: unknown): val is { [IsBankDB]: true } { return brandOf(val, IsBankDB) === true }

/** The brand every AdapterBankDB carries, read by {@link isAdapterBankDB}. A client bankDB, such as GraphQL's, lacks it. */
export const IsAdapterBankDB: unique symbol = Symbol.for('@safebyok/adapterbankdb')

/** True for an AdapterBankDB made by any copy of safebyok. */
export function isAdapterBankDB(val: unknown): val is { [IsAdapterBankDB]: true } { return brandOf(val, IsAdapterBankDB) === true }

/** The brand every DeviceDB carries, read by {@link isDeviceDB}. */
export const IsDeviceDB: unique symbol = Symbol.for('@safebyok/devicedb')

/** True for a DeviceDB made by any copy of safebyok. */
export const isDeviceDB = (val: unknown): val is { [IsDeviceDB]: true } => brandOf(val, IsDeviceDB) === true

/** The brand on a host's function once the core has wrapped it, read by {@link isGuarded}. */
export const IsGuarded: unique symbol = Symbol.for('@safebyok/guarded')

/** True for a host's function the core has wrapped, false for the bare one. */
export const isGuarded = (val: unknown): boolean => brandOf(val, IsGuarded) === true

/** Freeze `made` and brand it {@link IsGuarded}, then return it. */
export function brandGuarded<MadeT extends object>(made: MadeT): MadeT { return Object.freeze(brand(made, IsGuarded)) }

/** The brand every VaultError carries, so `isVaultError` knows one from any copy of safebyok. */
export const IsVaultError: unique symbol = Symbol.for('@safebyok/vaulterror')

/** The stand-in for an answer, passed to `refusedAnswerOf` when a refusal came before storage answered. */
export const UNANSWERED: unique symbol = Symbol.for('@safebyok/unanswered')
