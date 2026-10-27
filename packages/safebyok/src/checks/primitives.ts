/** The names every scope is made of, and the instant every time is, as plain Zod schemas: labels, the user_id and EpochMillis. Each failure says what is wrong in a sentence from {@link Phrases}, quoting nothing. */

import { number as num, string as str } from 'zod'
import type * as Z from 'zod'
import { FarFuture, FarPast } from '../consts'
import * as Phrases from '../phrases'

// == [Labels]: MaxLabelChars, LabelPattern, label, MaxUserIdChars, UserIdPattern, user_id

/** The most characters a label holds. */
export const MaxLabelChars = 40

/** The pattern a label matches, two characters at least: its `source` suits an HTML input's `pattern` attribute.
 * It has no repeated group, so text of millions of characters is refused, not thrown at.
 *
 * @example <input pattern={LabelPattern.source} maxLength={MaxLabelChars} />
 */
export const LabelPattern = /^(?!.*__)[a-z][a-z0-9_]*[a-z0-9]$/

/** An applabel, a vaultlabel or a boxlabel: lowercase words of letters and digits joined by single underscores, starting with a letter, two to {@link MaxLabelChars} characters.
 * It is plain Zod: its `parse` throws a ZodError. Check a label a user types with `safeParse`
 * before handing it to the vault, which refuses one that fails as 'bad_scope'.
 *
 * @example label.safeParse('anthropic_api_key').success  // true
 * @example label.safeParse('ANTHROPIC_API_KEY').success  // false: lowercase only
 */
export const label = str().max(MaxLabelChars, Phrases.labelTooLong(MaxLabelChars)).regex(LabelPattern, Phrases.LabelShape)

/** The most characters a user_id holds. */
export const MaxUserIdChars = 100

/** The characters a user_id is made of, ASCII letters and digits and `-_.~:@+|%`, and never dots alone. Its `source` suits an HTML input's `pattern`.
 *
 * @example UserIdPattern.test('auth0|5f7c8ec7c33c6c004bbafe82')  // true
 */
export const UserIdPattern = /^(?!\.+$)[A-Za-z0-9_.~:@+|%-]+$/

/** A user_id: 1 to {@link MaxUserIdChars} of ASCII letters, digits and `-_.~:@+|%`, never dots alone, opaque, compared byte for byte.
 * Those cover an email address and the common identity providers' ids; percent-encode (RFC 3986)
 * one that holds anything else. Pass the provider's stable id: a vault is found by its user_id,
 * and one that changes orphans the vault. Plain Zod, as {@link label} is.
 *
 * @example user_id.safeParse('user_2abc.def+work').success  // true
 * @example user_id.safeParse('auth0|5f7c8ec7').success      // true
 * @example user_id.safeParse('..').success                  // false: dots alone
 * @example user_id.safeParse('a/b').success                 // false: percent-encode it, 'a%2Fb'
 */
export const user_id = str().min(1, { error: Phrases.UserIdMissing, abort: true }).max(MaxUserIdChars, Phrases.userIdTooLong(MaxUserIdChars)).regex(UserIdPattern, Phrases.UserIdChars)
// --

// == [Instants]: EpochMillis

/** The check for an instant: whole UTC epoch milliseconds from {@link FarPast} to {@link FarFuture}, both included.
 * Every time the package keeps is one, and a stored record holding anything else fails its check.
 * The bounds catch epoch seconds and epoch microseconds passed by mistake. It is plain Zod, as
 * {@link label} is: its `parse` throws a ZodError.
 *
 * @example EpochMillis.parse(Date.UTC(2026, 9, 15))                // 1792022400000
 * @example EpochMillis.safeParse(1_792_022_400).success            // false: seconds, not ms
 * @example EpochMillis.safeParse(1_792_022_400_000_000).success    // false: microseconds, not ms
 * @example EpochMillis.safeParse(1_792_022_400_000.5).success      // false: whole milliseconds only
 * @example EpochMillis.safeParse(Infinity).success                 // false: never a time
 */
export const EpochMillis = num().gte(FarPast, Phrases.InstantTooEarly).lte(FarFuture, Phrases.InstantTooLate).int(Phrases.InstantNotWhole)

/** An instant, whole UTC epoch milliseconds, as `Date.now()` gives and {@link EpochMillis} checks: a plain number, since a host writes one by hand. */
export type EpochMillis = Z.infer<typeof EpochMillis>
// --
