import { VaultError } from './errors'
import { Validator } from './checks/validator'

/** How `mask` shows a whisper: how many characters to reveal, and how many stars to hide it behind. */
export interface MaskOpts {
  /** Characters kept from the start of the whisper. Default 2. */
  head?: number | undefined
  /** Characters kept from the end of the whisper. Default 4. */
  tail?: number | undefined
  /** Fewest stars the result may carry, however short the whisper. Default 6. */
  minStars?: number | undefined
  /** Longest result, in code points. Default 15. `Infinity` never collapses. */
  maxLen?: number | undefined
}

/** The stars-and-dots a masked whisper collapses to once the result would pass `maxLen`. */
const Collapsed = '***...***'

/** The most characters `head`, `tail` or `minStars` may ask for: a whiff, not a copy. */
const MaxShown = 1000

/** What `mask` takes as options, each defaulted, refusing 'bad_option'. */
const { maskOpts } = Validator('bad_option', ({ obj, union, lit, uint }) => {
  const shownCount = uint.lte(MaxShown)
  const resultLen  = union([lit(Infinity), uint])
  return {
    maskOpts: obj({
      head:     shownCount.default(2),
      tail:     shownCount.default(4),
      minStars: shownCount.default(6),
      maxLen:   resultLen.default(15),
    }),
  }
})

const parseMaskOpts = (candidate: MaskOpts | undefined): Record<keyof MaskOpts, number> => {
  const checked = maskOpts.safeParse(candidate ?? {})
  if (! checked.success) {
    throw new VaultError('bad_option', `mask takes head, tail and minStars as whole numbers of characters from 0 to ${String(MaxShown)}, and maxLen as a whole number from 0 to ${String(Number.MAX_SAFE_INTEGER)} or Infinity.`)
  }
  return checked.data
}

/** What `plainLine` removes: combining marks, controls, invisibles, spaces, bidirectional controls, and symbols drawn blank or boxed.
 * Right-to-left letters and numbers are kept.
 */
const Unsafe = /[\p{M}\p{C}\p{Z}\p{Default_Ignorable_Code_Point}\p{Bidi_Control}\u{2800}\u{1D159}\u{FFFC}]/gu

const composeAndStrip = (text: string): string => text.normalize('NFC').replaceAll(Unsafe, '')

/** `text` reduced to one compact line of visible characters: composed to NFC, then stripped, never escaped, of all {@link Unsafe} holds.
 * It runs twice, since removing an invisible from between two Hangul jamo leaves them to compose.
 */
const plainLine = (text: string): string => composeAndStrip(composeAndStrip(text))

/** `text` as a list of its code points, so that a surrogate pair is never parted. */
const codePointsOf = (text: string): string[] => text.match(/./gsu) ?? []

/** The cut itself: `chars`, already safe, reduced to head, stars and tail by the give-up rules. */
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

/** A whisper's outline for a log or a reminder: a whiff of each end with stars between, so a user can tell which API key a box holds.
 * The result is always one plain line of visible characters, and fidelity gives way to that. It is
 * public: it gives away the whisper's ends and, up to `maxLen`, its length. Pass `{ head: 0, tail:
 * 0 }` to show only the length. At `minStars: 0` a short whisper may be shown whole.
 *
 * It is meant for plain text. It strips marks, invisibles, controls and spaces, so a script that
 * writes vowels as marks loses them (Hindi `नमस्ते` comes out as `नमसत`). An API key is ASCII, and
 * untouched. Right-to-left letters are kept, so a display may reorder the stars beside them.
 *
 * It cuts by code point, so it can part an emoji sequence. At least `minStars` stars hide the
 * whisper: a short one gives up `head` characters first, then `tail`. The result never passes
 * `maxLen`: past it, the result is `head`, `***...***`, `tail`, or else `maxLen` stars alone.
 *
 * It refuses 'bad_option' for an option out of range, and 'bad_whisper' for a whisper that is no
 * string. Neither message quotes the whisper.
 *
 * @example mask('sk-ant-api03-abcdefghijklmnopqrstuvwxyz')  // 'sk***...***wxyz'
 * @example mask('sk-ant-abcd1234')                          // 'sk*********1234'
 * @example mask('sk-1234abcd')                              // 's******abcd'
 * @example mask('sk-123abcd')                               // '******abcd'
 * @example mask('abc')                                      // '******'
 * @example mask('sk-1234abcd', { head: 0, tail: 0 })        // '***********'
 * @example mask('sk-\nant-\tabcd1234')                      // 'sk*********1234'
 * @example mask('sk-ant-abcd1234xyz', { maxLen: 8 })        // '********'
 */
export const mask = (whisper: string, opts?: MaskOpts): string => {
  if (typeof whisper !== 'string') {
    throw new VaultError('bad_whisper', 'mask masks a whisper that is a string.')
  }
  const { head, tail, minStars, maxLen } = parseMaskOpts(opts)
  if (whisper === '') { return '' }
  const safeToButcher = plainLine(whisper)
  const butchered = butcher(codePointsOf(safeToButcher), { head, tail, minStars, maxLen })
  return plainLine(butchered)
}
