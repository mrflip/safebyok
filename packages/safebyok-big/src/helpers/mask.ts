/** `mask`, the outline of a secret text that is safe to show, and the schedule it follows. */

import { Checker } from './validator'
import * as UX from '../shapes/shapes-utils'
import type { MaskOpts, MaskRow } from '../shapes/shapes-utils'

const maskArgs = Checker(({ str }) => str, 'bad_record')

// A short text may be a password, so it shows nothing, and is padded so that its length stays hidden too. A long one
// is likely a random API key, whose ends identify it and give away little: at least 11 characters stay hidden in
// every row, and a text over 20 characters always comes out 24 long.
/** How much `mask` shows of a text, by the text's length: the first row whose bound its length meets. */
export const MaskSchedule = Object.freeze({
  lte_12: Object.freeze({ head: 0, tail: 0, minLen: 12 }),
  lte_20: Object.freeze({ head: 0, tail: 2, minLen: 20 }),
  lte_32: Object.freeze({ head: 2, tail: 3, minLen: 24, maxLen: 24 }),
  gte_33: Object.freeze({ head: 3, tail: 4, maxLen: 24 }),
}) satisfies Readonly<Record<string, MaskRow>>

/** The row of {@link MaskSchedule} for a text `len` characters long. */
function maskRowOf(len: number): MaskRow {
  if (len <= 12) { return MaskSchedule.lte_12 }
  if (len <= 20) { return MaskSchedule.lte_20 }
  if (len <= 32) { return MaskSchedule.lte_32 }
  return MaskSchedule.gte_33
}

/** The visible ASCII characters of `text`'s first line. */
function plainFirstLine(text: string): string {
  const [firstLine = ''] = text.split(/[\n\r]/, 1)
  return firstLine.replaceAll(/[^!-~]/g, '')
}

/** An outline of a secret text, safe to show, so that a user can tell which API key a box has.
 * Only the visible ASCII characters of its first line count: the rest is dropped first. How much of them shows
 * depends on how many there are, by {@link MaskSchedule}, and each field of `opts` overrides its field of the row.
 * A text of 12 characters or fewer shows none of itself.
 * The result is public: it gives away the text's ends, and roughly how long it is.
 *
 * @example mask('sk-ant-api03-abcdefghijklmnopqrstuvwxyz')  // 'sk-*****************wxyz': a long key shows its ends, cut to 24 characters
 * @example mask('hunter2')                                  // '************': a short text shows only stars, twelve of them
 * @example mask('abcdefghijklmnop')                         // '******************op': a middling one, its last two characters
 * @example mask('hunter2', { tail: 4 })                     // '********ter2': an option overrides its row
 */
export function mask(text: string, opts?: MaskOpts): string {
  const secret = maskArgs.parse(text)
  const overrides = UX.maskOpts.parse(opts ?? {})
  const chars = plainFirstLine(secret)
  if (chars === '') { return '' }
  const row = maskRowOf(chars.length)
  const head = overrides.head ?? row.head
  const tail = overrides.tail ?? row.tail
  const minLen = overrides.minLen ?? row.minLen ?? 0
  const maxLen = overrides.maxLen ?? row.maxLen ?? Infinity
  const resultLen = Math.min(Math.max(chars.length, minLen), maxLen)
  const headShown = Math.min(head, chars.length, resultLen)
  const tailShown = Math.min(tail, chars.length - headShown, resultLen - headShown)
  const tailChars = (tailShown > 0) ? chars.slice(-tailShown) : ''
  return chars.slice(0, headShown) + '*'.repeat(resultLen - headShown - tailShown) + tailChars
}
