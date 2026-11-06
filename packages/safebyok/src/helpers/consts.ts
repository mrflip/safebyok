import type { Whisper } from '../shapes/shapes-core'

/** The character a scopepath joins its parts on: `^`, which no label or user_id may hold. */
export const ScopepathDelimiter = '^'

/** The latest instant the package accepts, 2255-06-05T23:47:34.740Z: the last millisecond whose epoch microseconds fit a safe integer.
 * `ask_passphrase_at` is near it when the vault asks again only after `lock()`, as under
 * `leaseHours: Infinity`. Show "until locked" for any instant within a minute of it, not only one
 * equal to it.
 *
 * @example ask_passphrase_at >= FarFuture - MinuteMillis ? 'until locked' : new Date(ask_passphrase_at).toLocaleString()
 */
export const FarFuture = 9_007_199_254_740 // Math.floor(Number.MAX_SAFE_INTEGER / 1000)

/** The earliest instant the package accepts, 1981-01-01T00:00:00Z, as `epochMillis` checks. */
export const FarPast = 347_155_200_000 // Date.UTC(1981, 0, 1)

/** One minute, in milliseconds: the margin to leave when asking whether an instant is {@link FarFuture}, the vault's "never". */
export const MinuteMillis = 60_000

/** The lease a vault grants for "until `lock()`", in milliseconds: `leaseHours: Infinity` reads as this in a gating's `leaseMillis`.
 * It spans {@link FarPast} to {@link FarFuture}, so a lease granted at any instant the clock may
 * read ends at {@link FarFuture}.
 *
 * @example gating.leaseMillis >= ForeverMillis - MinuteMillis          // true when the bank was made with leaseHours: Infinity
 */
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

/** The tag a Listing answers true to, so a storable can tell one without importing it. */
export const IsListing: unique symbol = Symbol('safebyok.listing')

/** True for a Listing: an object that answers true to {@link IsListing}. */
export const isListing = (val: unknown): val is { [IsListing]: true } => (
  typeof val === 'object' && val !== null && (val as { [IsListing]?: unknown })[IsListing] === true
)
