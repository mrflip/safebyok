/** The character a scopepath joins its parts on: `^`, which no label or user_id may hold. */
export const ScopepathDelimiter = '^'

/** The latest instant the package accepts, 2255-06-05T23:47:34.740Z: the last millisecond whose epoch microseconds fit a safe integer.
 * `ask_passphrase_at` is near it when the vault asks again only after `lock()`, as under
 * `leaseHours: Infinity`. Show "until locked" for any instant within a minute of it, not only one
 * equal to it.
 *
 * @example ask_passphrase_at >= FarFuture - MinuteMillis ? 'until locked' : new Date(ask_passphrase_at).toLocaleString()
 * @example new Date(FarFuture).toISOString()   // '2255-06-05T23:47:34.740Z'
 */
export const FarFuture = 9_007_199_254_740 // Math.floor(Number.MAX_SAFE_INTEGER / 1000)

/** The earliest instant the package accepts, 1981-01-01T00:00:00Z, as `epochMillis` checks.
 *
 * @example new Date(FarPast).toISOString()   // '1981-01-01T00:00:00.000Z'
 */
export const FarPast = 347_155_200_000 // Date.UTC(1981, 0, 1)

/** One minute, in milliseconds: the margin to leave when asking whether an instant is {@link FarFuture}, the vault's "never".
 *
 * @example ask_passphrase_at >= FarFuture - MinuteMillis   // true while the vault stays unlocked until lock()
 */
export const MinuteMillis = 60_000

/** The lease a vault grants for "until `lock()`", in milliseconds: `leaseHours: Infinity` reads as this in a gating's `leaseMillis`.
 * It spans {@link FarPast} to {@link FarFuture}, so a lease granted at any instant the clock may
 * read ends at {@link FarFuture}.
 *
 * @example gating.leaseMillis >= ForeverMillis - MinuteMillis          // true when the bank was made with leaseHours: Infinity
 * @example FarPast + ForeverMillis === FarFuture                       // true: a window from the earliest instant ends at the last
 */
export const ForeverMillis = FarFuture - FarPast

/** The most bytes `crypto.getRandomValues` hands out at once, and so the longest passphraseSalt. */
export const MaxSaltBytes = 65_536

/** How many bytes a passphraseKey is: a 256-bit AES-GCM key. */
export const PassphraseKeyBytes = 32

/** The longest duration we use for a timer, in hours -- the equivalent of 24.5 days (close to, but below, the hard limit of 2**31-1 milliseconds).
 * A trigger arms no timer for a launch further off than this: the launch waits for a call that finds it due, and the trigger reads untimely once the launch is due, as with any other.
 */
export const MaxTimerHours = 588

/** The longest duration we use for a timer, in milliseconds -- the equivalent of 24.5 days (close to, but below, the hard limit of 2**31-1 milliseconds).
 * A trigger arms no timer for a launch further off than this: the launch waits for a call that finds it due, and the trigger reads untimely once the launch is due, as with any other.
 */
export const MaxTimerMillis = MaxTimerHours * 60 * 60 * 1000
