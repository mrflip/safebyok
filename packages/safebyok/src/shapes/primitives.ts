/** The names every scope is made of, and the instant every time is: labels, the user_id and epochMillis, imported as `PX`.
 * Each is plain Zod: its `parse` throws a ZodError, not a VaultError. Each failure says what is
 * wrong in a sentence from {@link Phrases}, quoting nothing.
 */

import { number as num, string as str } from 'zod'
import type * as Z from 'zod'
import { FarFuture, FarPast } from '../helpers/consts'
import * as Phrases from '../helpers/phrases'

// == [Patterns and labels]: Patterns, MaxLabelChars, label, MaxUserIdChars, user_id

// A browser compiles an input's `pattern` with the v flag, which refuses a `-` or `|` in a character class unescaped.
/** The patterns text is matched against: a `source` suits an HTML input's `pattern` attribute, and none has a repeated group, so each refuses text of millions of characters without throwing.
 *
 * @example <input pattern={Patterns.label.source} maxLength={MaxLabelChars} />
 */
export const Patterns = Object.freeze({
  /** Base64url text without padding: the letters, the digits, `-` and `_`. */
  b64url:  /^[A-Za-z0-9_\-]+$/,
  /** A label: lowercase letters, digits and single underscores, starting with a letter and ending on a letter or digit, two characters at least. */
  label:   /^(?!.*__)[a-z][a-z0-9_]*[a-z0-9]$/,
  /** A user_id: ASCII letters and digits and `-_.~:@+|%`, never dots alone. */
  user_id: /^(?!\.+$)[A-Za-z0-9_.~:@+\|%\-]+$/,
})

/** The most characters a label contains. */
export const MaxLabelChars = 40

/** An applabel, a vaultlabel or a boxlabel: lowercase letters, digits and single underscores, starting with a letter and ending on a letter or digit, two to {@link MaxLabelChars} characters.
 * Check a label a user types with `safeParse` before handing it to the vault, which refuses one
 * that fails.
 *
 * @example label.safeParse('anthropic_api_key').success   // true
 * @example label.safeParse('0__b_').success               // false three ways: a digit first, '__' inside, '_' last
 * @example label.safeParse('0__b_').error?.issues.length  // 1: one sentence names every rule, so show it whole
 */
export const label = str().max(MaxLabelChars).regex(Patterns.label, Phrases.LabelShape)

/** The most characters a user_id contains. */
export const MaxUserIdChars = 100

/** A user_id: 1 to {@link MaxUserIdChars} of ASCII letters, digits and `-_.~:@+|%`, never dots alone, opaque, compared byte for byte.
 * Those cover an email address and the common identity providers' ids; percent-encode (RFC 3986)
 * one that contains anything else. Pass the provider's stable id: a vault is found by its user_id,
 * and one that changes orphans the vault.
 *
 * @example user_id.safeParse('auth0|5f7c8ec7').success      // true
 * @example user_id.safeParse('a/b').success                 // false: percent-encode it, 'a%2Fb'
 */
export const user_id = str().min(1, { error: Phrases.UserIdMissing, abort: true }).max(MaxUserIdChars).regex(Patterns.user_id, Phrases.UserIdChars)
// --

// == [Instants]: epochMillis, EpochMillis

/** The check for an instant: whole UTC epoch milliseconds from {@link FarPast} to {@link FarFuture}, both included.
 * Every time the package keeps is one, and a stored record with anything else fails its check.
 * The bounds catch epoch seconds and epoch microseconds passed by mistake.
 *
 * @example epochMillis.safeParse(1_792_022_400).success            // false: seconds, not ms
 */
export const epochMillis = num().gte(FarPast, Phrases.InstantTooEarly).lte(FarFuture, Phrases.InstantTooLate).int()

/** An instant, whole UTC epoch milliseconds, as `Date.now()` gives and {@link epochMillis} checks: a plain number, since a host writes one by hand. */
export type EpochMillis = Z.infer<typeof epochMillis>
// --
