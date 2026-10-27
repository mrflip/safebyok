/** The names every scope is made of, as schemas: labels and the user_id. Each failure says what is wrong in a sentence from {@link Phrases}, quoting nothing. */

// eslint-disable-next-line no-restricted-imports -- this exercise is written against classic zod; src/ keeps to zod/mini
import { string as str } from 'zod'
import * as Phrases from '../utils/phrases'

// == [Labels]: MaxLabelChars, LabelPattern, label, MaxUserIdChars, UserIdPattern, user_id

/** The most characters a label holds. */
export const MaxLabelChars = 40

/** The pattern a label matches, two characters at least: its `source` suits an HTML input's `pattern` attribute. */
export const LabelPattern = /^(?!.*__)[a-z][a-z0-9_]*[a-z0-9]$/

/** A label: lowercase words of letters and digits joined by single underscores, starting with a letter, two to {@link MaxLabelChars} characters.
 *
 * @example label.safeParse('anthropic_api_key').success  // true
 * @example label.safeParse('ANTHROPIC_API_KEY').success  // false: lowercase only
 */
export const label = str().max(MaxLabelChars, Phrases.labelTooLong(MaxLabelChars)).regex(LabelPattern, Phrases.LabelShape)

/** The most characters a user_id holds. */
export const MaxUserIdChars = 100

/** The characters a user_id is made of, ASCII letters and digits and `-_.~:@+|%`, and never dots alone. Its `source` suits an HTML input's `pattern`. */
export const UserIdPattern = /^(?!\.+$)[A-Za-z0-9\-_.~:@+\|%]+$/

/** A user_id: 1 to {@link MaxUserIdChars} of ASCII letters, digits and `-_.~:@+|%`, opaque, compared byte for byte.
 * Those cover an email address and the common identity providers' ids; percent-encode one that
 * holds anything else.
 *
 * @example user_id.safeParse('user_2abc.def+work').success  // true
 * @example user_id.safeParse('auth0|5f7c8ec7').success      // true
 * @example user_id.safeParse('..').success                  // false: dots alone
 * @example user_id.safeParse('a/b').success                 // false: percent-encode it, 'a%2Fb'
 */
export const user_id = str().min(1, Phrases.UserIdMissing).max(MaxUserIdChars, Phrases.userIdTooLong(MaxUserIdChars)).regex(UserIdPattern, Phrases.UserIdChars)
// --
