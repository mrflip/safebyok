import * as Z from 'zod/mini'
import { VaultError } from './errors'

/** How `mask` shows a whisper: how many characters to reveal, and how many stars to hide it behind. */
export interface MaskOpts {
  /** Characters kept from the start of the whisper. Default 2. */
  head?: number | undefined
  /** Characters kept from the end of the whisper. Default 4. */
  tail?: number | undefined
  /** Fewest stars the result may carry, however short the whisper. Default 6. */
  minStars?: number | undefined
  /**
   * Longest result, in characters (code points). A longer one collapses to `head`, `***...***`,
   * `tail`; if even that is too long, to `maxLen` stars alone. Default 15. `Infinity` never collapses.
   */
  maxLen?: number | undefined
}

/** The stars-and-dots a masked whisper collapses to once the result would pass `maxLen`. */
const Collapsed = '***...***'

/** The most characters `head`, `tail` or `minStars` may ask for: a whiff, not a copy. */
const MaxShown = 1000

const shownCount = Z.int().check(Z.nonnegative(), Z.lte(MaxShown))
const resultLen = Z.union([Z.literal(Infinity), Z.int().check(Z.nonnegative())])
const maskOpts = Z.object({
  head:     Z._default(shownCount, 2),
  tail:     Z._default(shownCount, 4),
  minStars: Z._default(shownCount, 6),
  maxLen:   Z._default(resultLen, 15),
})

const parseMaskOpts = (candidate: MaskOpts | undefined): Record<keyof MaskOpts, number> => {
  const checked = maskOpts.safeParse(candidate ?? {})
  if (! checked.success) {
    throw new VaultError('bad_option', `mask takes head, tail and minStars as whole numbers of characters from 0 to ${String(MaxShown)}, and maxLen as a whole number from 0 to ${String(Number.MAX_SAFE_INTEGER)} or Infinity.`)
  }
  return checked.data
}

/**
 * What `plainLine` removes: combining marks, every control, format, surrogate, private-use and
 * unassigned code point, every space and line or paragraph separator, anything a renderer is told
 * to ignore, the bidirectional controls and direction marks, the symbols drawn blank (the blank
 * braille pattern and the musical null notehead), and the object replacement character, which is
 * drawn as a boxed "OBJ". Right-to-left letters and numbers are not here: they are kept.
 */
const Unsafe = /[\p{M}\p{C}\p{Z}\p{Default_Ignorable_Code_Point}\p{Bidi_Control}\u{2800}\u{1D159}\u{FFFC}]/gu

const composeAndStrip = (text: string): string => text.normalize('NFC').replaceAll(Unsafe, '')

/**
 * `text` reduced to one compact, safe line: composed (so a letter and its accent are one letter),
 * then stripped, never escaped, of every combining mark (stacked "Zalgo" marks among them),
 * invisible or control character, lone surrogate, bidirectional control and direction mark, and
 * space of any kind. Whatever is left is visible and stays on one line, though a wide character
 * (an ideograph, an emoji) takes two columns, and right-to-left letters, which are kept, may
 * reorder the neutral characters beside them in a display. Composed and stripped twice, since
 * removing an invisible from between two Hangul jamo leaves them to compose.
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

/**
 * A whisper's outline, to show in a log or a reminder: a whiff of interesting text from each end
 * with stars between, so a user can tell which API key a lockbox holds without the key being
 * revealed. It is best effort, not a copy: the result is always one plain line, and fidelity
 * gives way to that. The result is public: show it, but never count on it to hide more than it
 * does -- it gives away the whisper's ends, and (up to `maxLen`) its length.
 *
 * `mask` is intended for plain text. Calling it with arbitrary blobs may give unusual behavior.
 * Every combining mark is stripped, so a script that writes its vowels as marks loses them:
 * Hindi `नमस्ते` comes out as `नमसत`, and Thai, Tamil, Bengali and Khmer fare alike. An API key is
 * ASCII, and is untouched.
 *
 * It works in three stages. First it makes the whisper safe to butcher: the whole input is
 * composed and stripped of combining marks (so, the accents of scripts that rely on them),
 * invisible and control characters, every bidirectional control and direction mark, and every
 * kind of space. Then it butchers, cutting head and tail by code point with stars between. Last
 * it checks the result is safe, passing it through the same stripping again; that last stage is
 * what guarantees no result contains a stripped code point, whatever the cut left behind. If it
 * ever changes the result, the result may be shorter than intended.
 *
 * Right-to-left letters and numbers (Hebrew, Arabic and the rest) are kept, and fall where they
 * fall; a display may therefore reorder the neutral characters, such as stars and punctuation,
 * beside them.
 *
 * What is cut is cut by code point, so a cut can part an emoji sequence or a flag; whatever that
 * leaves is visible text. At least `minStars` stars stand in the whisper's place, unless
 * `maxLen` is smaller: a whisper too short to keep `head` and `tail` and still hide `minStars`
 * characters gives up `head` characters first, then `tail`, and one shorter than `minStars`
 * shows only stars. A result that would pass `maxLen` characters is instead the `head` kept,
 * `***...***`, then the `tail` kept; if that is too long too, it is `maxLen` stars, nothing
 * else. Whatever the options, the result is never longer than `maxLen`. An empty whisper gives the empty string; a
 * whisper that is nothing but removed characters gives `minStars` stars.
 *
 * Pass `{ head: 0, tail: 0 }` to show nothing of the whisper but how long it is. Lower `minStars`
 * with care: at 0 a short whisper may be shown whole.
 *
 * @param whisper - Text to mask: an API key, say.
 * @param opts - How much to keep and hide; see {@link MaskOpts}.
 * @returns The masked text. Kind 'bad_option' for an option that is not a whole number of at
 *   least zero (`head`, `tail` and `minStars` at most 1000; `maxLen` also `Infinity`), and
 *   'bad_whisper' for a whisper that is not a string. Neither message quotes the whisper.
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
