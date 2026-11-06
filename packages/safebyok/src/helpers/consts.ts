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

/** What each model's `modelkind` getter answers, so a check can tell one without importing its class. */
export type Modelkind = 'bank' | 'vault' | 'box' | 'vault_listing' | 'box_listing' | 'gating' | 'gate' | 'wayin' | 'lease'

/** The `modelkind` of `val`, or undefined for anything that has none. */
export const modelkindOf = (val: unknown): unknown => (
  ((typeof val === 'object') && (val !== null)) ? (val as { modelkind?: unknown }).modelkind : undefined
)
