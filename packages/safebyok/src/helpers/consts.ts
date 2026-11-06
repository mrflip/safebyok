import type { Bank } from '../models/bank'
import type { Box } from '../models/box'
import type { BoxListing } from '../models/box-listing'
import type { Gate } from '../models/gate'
import type { Gating } from '../models/gating'
import type { Lease } from '../models/lease'
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

/** The most bytes `crypto.getRandomValues` hands out at once, and so the longest passphraseSalt. */
export const MaxSaltBytes = 65_536

/** How many bytes a passphraseKey is: a 256-bit AES-GCM key. */
export const PassphraseKeyBytes = 32

/** How many random bytes a passkey wayin's `prf_salt_b64` holds: a new passkey's answer carries a fresh salt this long, and a stored salt of any other length fails its record's check. */
export const PasskeySaltBytes = 32

/** The mark on what a box answers for a whisper it will not show: `box.whisper[Whispered]` says why.
 * It is `Symbol.for`, as two copies of this module, such as our ESM and CJS builds, would otherwise make two symbols. */
export const Whispered: unique symbol = Symbol.for('@safebyok/whispered')

/** What `box.whisper` answers for a whisper it will not show: a whisper to the type checker, carrying {@link Whispered}. */
export type WhisperedBag = Whisper & { readonly [Whispered]: 'encrypted' | 'locked' | 'veiled' }

/** What `box.whisper` answers for a whisper not exposed. */
export const ENCRYPTED: WhisperedBag = Object.freeze({ [Whispered]: 'encrypted' })

/** What `box.whisper` answers for a whisper exposed while the vault is locked. */
export const LOCKED: WhisperedBag = Object.freeze({ [Whispered]: 'locked' })

/** What `box.whisper` answers for a whisper exposed and veiled. */
export const VEILED: WhisperedBag = Object.freeze({ [Whispered]: 'veiled' })

/** True for anything carrying {@link Whispered}, a copy included. Forging one is harmless: it only ever refuses at a put. */
export const isWhisperedBag = (val: unknown): val is WhisperedBag => (typeof val === 'object') && (val !== null) && Object.hasOwn(val, Whispered)

// A check reads the getter in place of instanceof, which needs the class imported (a cycle, often) and fails across the
// ESM and CommonJS builds. A getter sits on the prototype, so it is no own key that a spread or Object.keys would meet.
/** The model class each `modelkind` names: `ModelkindClasses['box']` is `Box`. */
export type ModelkindClasses = {
  bank: Bank, vault: Vault, box: Box, vault_listing: VaultListing, box_listing: BoxListing, gating: Gating, gate: Gate, wayin: Wayin, lease: Lease,
}

/** What each model's `modelkind` getter answers: `box.modelkind` is `'box'`. */
export type Modelkind = keyof ModelkindClasses

/** True when `val` is a model of one of `modelkinds`, and typed as its class. */
export const hasModelkind = <MKT extends Modelkind>(val: unknown, ...modelkinds: MKT[]): val is ModelkindClasses[MKT] => (
  (typeof val === 'object') && (val !== null) && (modelkinds as Modelkind[]).includes((val as { modelkind?: unknown }).modelkind as Modelkind)
)

// `Symbol.for`, as an adapter package may bundle a second copy of safebyok, whose stores must pass this one's checks.
/** The tag a VaultDB answers true to, so a model can tell one from a duck. */
export const IsVaultDB: unique symbol = Symbol.for('@safebyok/vaultdb')

/** True for a VaultDB, made by whichever copy of safebyok: an object that answers true to {@link IsVaultDB}. */
export const isVaultDB = (val: unknown): boolean => (
  typeof val === 'object' && val !== null && (val as { [IsVaultDB]?: unknown })[IsVaultDB] === true
)

// `Symbol.for`, for the same reason as IsVaultDB.
/** The tag a DeviceDB answers true to, so a model can tell one from a duck. */
export const IsDeviceDB: unique symbol = Symbol.for('@safebyok/devicedb')

/** True for a DeviceDB, made by whichever copy of safebyok: an object that answers true to {@link IsDeviceDB}. */
export const isDeviceDB = (val: unknown): boolean => (
  typeof val === 'object' && val !== null && (val as { [IsDeviceDB]?: unknown })[IsDeviceDB] === true
)

/** The tag a host's function answers true to once a bank has wrapped it, so a world can tell it from the bare one. */
export const IsGuarded: unique symbol = Symbol('safebyok.guarded')

/** True for a host's function as a bank wraps it: one that answers true to {@link IsGuarded}. */
export const isGuarded = (val: unknown): boolean => (
  (typeof val === 'function' || (typeof val === 'object' && val !== null)) && (val as { [IsGuarded]?: unknown })[IsGuarded] === true
)

// A getter, never an own enumerable field, so the brand neither serializes nor rides along in a spread.
/** `made`, frozen, answering true to {@link IsGuarded}. */
export const brandGuarded = <MadeT extends object>(made: MadeT): MadeT => Object.freeze(Object.defineProperty(made, IsGuarded, { get: () => true }))
