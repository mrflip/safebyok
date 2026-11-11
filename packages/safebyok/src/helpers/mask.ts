/** `mask`, the outline of a secret text that is safe to show. */

import { Checker } from './validator'
import * as UX from '../shapes/shapes-utils'
import type { MaskOpts } from '../shapes/shapes-utils'

const maskArgs = Checker(({ str }) => str, 'bad_option')

/** The stars-and-dots a masked text collapses to once the result would pass `maxLen`. */
const Collapsed = '***...***'

/** The characters `plainLine` removes: combining marks, controls, invisibles, spaces, bidirectional controls, and symbols drawn blank or boxed.
 * Right-to-left letters and numbers are kept.
 */
const Unsafe = /[\p{M}\p{C}\p{Z}\p{Default_Ignorable_Code_Point}\p{Bidi_Control}\u{2800}\u{1D159}\u{FFFC}]/gu

const composeAndStrip = (text: string): string => text.normalize('NFC').replaceAll(Unsafe, '')

// Twice, since removing an invisible from between two Hangul jamo leaves them to compose.
/** `text` as one compact line of visible characters: composed to NFC and stripped of all {@link Unsafe} matches, never escaped. */
const plainLine = (text: string): string => composeAndStrip(composeAndStrip(text))

/** `text` as a list of its code points, so that a surrogate pair is never parted. */
const codePointsOf = (text: string): string[] => text.match(/./gsu) ?? []

/** `chars`, already plain, cut to head, stars and tail by the give-up rules `mask` states. */
const butcher = (chars: readonly string[], { head, tail, minStars, maxLen }: Record<keyof MaskOpts, number>): string => {
  // What may be shown at all is what is left once minStars are hidden: tail has first call on it.
  const showable = Math.max(0, chars.length - minStars)
  const tailShown = Math.min(tail, showable)
  const headShown = Math.min(head, showable - tailShown)
  const stars = Math.max(minStars, chars.length - headShown - tailShown)

  const headChars = chars.slice(0, headShown).join('')
  const tailChars = tailShown > 0 ? chars.slice(-tailShown).join('') : ''
  // Lengths are compared before anything is built, so a vast minStars costs nothing it would discard.
  if (headShown + stars + tailShown <= maxLen) { return headChars + '*'.repeat(stars) + tailChars }
  if (headShown + Collapsed.length + tailShown <= maxLen) { return headChars + Collapsed + tailChars }
  return '*'.repeat(maxLen)
}

/** An outline of a secret text for a log or a reminder: a whiff of each end with stars between, so a user can tell which API key a box has.
 * The result is always one plain line of visible characters, and fidelity gives way to that.
 * It is public: it gives away the text's ends and, up to `maxLen`, its length.
 * Marks, invisibles, controls and spaces are stripped, so a script that writes vowels as marks loses
 * them (Hindi `नमस्ते` comes out as `नमसत`); an API key is ASCII, and untouched.
 * At least `minStars` stars hide the text: a short one gives up `head` characters first, then `tail`.
 * It cuts by code point, so it can part an emoji sequence.
 *
 * @example mask('sk-ant-api03-abcdefghijklmnopqrstuvwxyz')  // 'sk***...***wxyz': a long text collapses to its ends
 * @example mask('sk-1234abcd')                              // 's******abcd': a short one gives up head first
 * @example mask('sk-1234abcd', { head: 0, tail: 0 })        // '***********': only its length shows
 * @example mask('sk-\nant-\tabcd1234')                      // 'sk*********1234': controls and spaces go before it is cut
 */
export const mask = (text: string, opts?: MaskOpts): string => {
  const secret = maskArgs.parse(text)
  const { head, tail, minStars, maxLen } = UX.maskOpts.parse(opts ?? {})
  if (secret === '') { return '' }
  const plain = plainLine(secret)
  return plainLine(butcher(codePointsOf(plain), { head, tail, minStars, maxLen }))
}
