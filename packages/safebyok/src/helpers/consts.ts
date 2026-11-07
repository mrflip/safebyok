import type { Bank } from '../models/bank'
import type { Box } from '../models/box'
import type { BoxListing } from '../models/box-listing'
import type { Gate } from '../models/gate'
import type { Gating } from '../models/gating'
import type { Lease } from '../models/lease'
import type { Proving } from '../models/proving'
import type { Vault } from '../models/vault'
import type { VaultListing } from '../models/vault-listing'
import type { Wayin } from '../models/wayin'
import type { Whisper } from '../shapes/shapes-core'

/** The character a scopepath joins its parts on: `^`, which no label or user_id may hold. */
export const ScopepathDelimiter = '^'

/** The latest instant the package accepts, 2255-06-05T23:47:34.740Z, as `epochMillis` checks: the last millisecond whose epoch microseconds fit a safe integer. */
export const FarFuture = 9_007_199_254_740 // Math.floor(Number.MAX_SAFE_INTEGER / 1000)

/** The earliest instant the package accepts, 1981-01-01T00:00:00Z, as `epochMillis` checks. */
export const FarPast = 347_155_200_000 // Date.UTC(1981, 0, 1)

/** One minute, in milliseconds. */
export const MinuteMillis = 60_000

/** The span from {@link FarPast} to {@link FarFuture}, in milliseconds: the longest that runs between two instants the package accepts. */
export const ForeverMillis = FarFuture - FarPast

// A name carrying it marks a stored layout: raise a version when its layout changes, and every older database is deleted unread. Three zero-padded parts, so that names sort as versions do.
/** The layout version in the name of the device database, `${dbName}:device-v001-001-001`. */
export const DeviceDBVersion = '001-001-001'

/** The layout version in the name of the bank database, `${dbName}:bank-v001-001-001`. */
export const BankDBVersion = '001-001-001'

/** The layout version in the name of the IndexedDB vault database, `${dbName}:vaults-v001-001-001`. */
export const VaultsDBVersion = '001-001-001'

// RFC 9106's recommendation for Argon2id. One length for every deriver, until a host asks for another.
/** How many random bytes a passphraseSalt holds: the `salt_bytes` of every key deriver. */
export const PassphraseSaltBytes = 16

/** How many bytes a passphraseKey is: a 256-bit AES-GCM key. */
export const PassphraseKeyBytes = 32

/** How many random bytes a passkey wayin's `prf_salt_b64` holds: a new passkey's answer carries a fresh salt this long, and a stored salt of any other length fails its record's check. */
export const PasskeySaltBytes = 32

// A brand is a `Symbol.for` key, so a second copy of safebyok (our ESM and CJS builds side by side, or one an adapter
// bundles) wears and reads the same one, and a host may wear one on purpose. Non-enumerable, it stays out of a spread,
// `Object.keys`, `JSON.stringify` and a log line.
/** `obj`, wearing `Brand` as `val`, a fixed and hidden mark that {@link brandOf} reads back. */
export const brand = <ObjT extends object>(obj: ObjT, Brand: symbol, val: unknown = true): ObjT => (
  Object.defineProperty(obj, Brand, { value: val, enumerable: false, writable: false, configurable: false })
)

/** The value `val` wears as `Brand`, or undefined, for anything at all. */
export const brandOf = (val: unknown, Brand: symbol): unknown => (
  (typeof val === 'function' || (typeof val === 'object' && val !== null)) ? (val as Partial<Record<symbol, unknown>>)[Brand] : undefined
)

/** The mark on what a box answers for a whisper it will not show.
 * Never read it: compare `box.whisper` with {@link ENCRYPTED}, {@link LOCKED} or {@link VEILED}, or ask `box.isShowing` or {@link isWhisperedBag}.
 */
export const Whispered: unique symbol = Symbol.for('@safebyok/whispered')

/** What `box.whisper` answers for a whisper it will not show: a whisper to the type checker, carrying {@link Whispered}. */
export type WhisperedBag = Whisper & { readonly [Whispered]: 'encrypted' | 'locked' | 'veiled' }

// Literals, not `brand()`: the mark is an own enumerable key, so a spread or an assign carries it to the put that refuses it.
/** What `box.whisper` answers for a whisper not exposed. */
export const ENCRYPTED: WhisperedBag = Object.freeze({ [Whispered]: 'encrypted' })

/** What `box.whisper` answers for a whisper exposed while the vault is locked. */
export const LOCKED: WhisperedBag = Object.freeze({ [Whispered]: 'locked' })

/** What `box.whisper` answers for a whisper exposed and veiled. */
export const VEILED: WhisperedBag = Object.freeze({ [Whispered]: 'veiled' })

/** True for anything carrying {@link Whispered}, a copy included. Forging one is harmless: it only ever refuses at a put. */
export const isWhisperedBag = (val: unknown): val is WhisperedBag => (typeof val === 'object') && (brandOf(val, Whispered) !== undefined)

// A check reads the getter in place of instanceof, which needs the class imported (a cycle, often) and fails across the
// ESM and CommonJS builds. A getter sits on the prototype, so it is no own key that a spread or Object.keys would meet.
/** The model class each `modelkind` names: `ModelkindClasses['box']` is `Box`. */
export type ModelkindClasses = {
  bank: Bank, vault: Vault, box: Box, vault_listing: VaultListing, box_listing: BoxListing, gating: Gating, gate: Gate, wayin: Wayin, lease: Lease, proving: Proving,
}

/** What each model's `modelkind` getter answers: `box.modelkind` is `'box'`. */
export type Modelkind = keyof ModelkindClasses

/** True when `val` is a model of one of `modelkinds`, and typed as its class. */
export const hasModelkind = <MKT extends Modelkind>(val: unknown, ...modelkinds: MKT[]): val is ModelkindClasses[MKT] => (
  (typeof val === 'object') && (val !== null) && (modelkinds as Modelkind[]).includes((val as { modelkind?: unknown }).modelkind as Modelkind)
)

/** The tag a VaultDB answers true to, so a model can tell one from a duck. */
export const IsVaultDB: unique symbol = Symbol.for('@safebyok/vaultdb')

/** True for a VaultDB, made by whichever copy of safebyok: an object that answers true to {@link IsVaultDB}. */
export const isVaultDB = (val: unknown): val is { [IsVaultDB]: true } => brandOf(val, IsVaultDB) === true

/** The tag an AdapterVaultDB answers true to, and no client of one, as a GraphQLVaultDB is. */
export const IsAdapterVaultDB: unique symbol = Symbol.for('@safebyok/adaptervaultdb')

/** True for an AdapterVaultDB, made by whichever copy of safebyok: an object that answers true to {@link IsAdapterVaultDB}. */
export const isAdapterVaultDB = (val: unknown): val is { [IsAdapterVaultDB]: true } => brandOf(val, IsAdapterVaultDB) === true

/** The tag a DeviceDB answers true to, so a model can tell one from a duck. */
export const IsDeviceDB: unique symbol = Symbol.for('@safebyok/devicedb')

/** True for a DeviceDB, made by whichever copy of safebyok: an object that answers true to {@link IsDeviceDB}. */
export const isDeviceDB = (val: unknown): val is { [IsDeviceDB]: true } => brandOf(val, IsDeviceDB) === true

/** The tag a host's function answers true to once a bank has wrapped it, so a world can tell it from the bare one. */
export const IsGuarded: unique symbol = Symbol.for('@safebyok/guarded')

/** True for a host's function as a bank wraps it: one that answers true to {@link IsGuarded}. */
export const isGuarded = (val: unknown): boolean => brandOf(val, IsGuarded) === true

/** `made`, frozen, answering true to {@link IsGuarded}. */
export const brandGuarded = <MadeT extends object>(made: MadeT): MadeT => Object.freeze(brand(made, IsGuarded))

/** The tag a VaultError answers true to, so `isVaultError` knows one from any copy of safebyok. */
export const IsVaultError: unique symbol = Symbol.for('@safebyok/vaulterror')
