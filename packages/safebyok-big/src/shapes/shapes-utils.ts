/** The check of `mask`'s options. Imported as `UX`. */

// Kept apart from the other shapes so that `safebyok-big/utils` carries no other validator.

import type * as Z from 'zod'
import { objCheck } from '../helpers/validator'

/** The most characters `head`, `tail` or `minLen` may ask for: a whiff, not a copy. */
const MaxShown = 1000

/** The check of `mask`'s options, a field it does not accept refused. Its `parse` refuses 'bad_record'. */
export const maskOpts = objCheck(({ union, lit, uint }) => {
  const shownCount = uint.lte(MaxShown)
  return {
    /** Characters shown from the start of the text. */
    head:   shownCount.optional(),
    /** Characters shown from the end of the text, fewer where they would overlap the head. */
    tail:   shownCount.optional(),
    /** Shortest result: a shorter one is padded with stars. */
    minLen: shownCount.optional(),
    /** Longest result: a longer one loses stars from its middle, then its tail, then its head. Wins over `minLen`. `Infinity` never cuts. */
    maxLen: union([lit(Infinity), uint]).optional(),
  }
}, 'bad_record')

/** How `mask` shows a text: how many characters to show, and how long a result to make. Each field left out comes from the text's row of `MaskSchedule`. */
export type MaskOpts = Z.input<typeof maskOpts>

/** A row of `MaskSchedule`. Without `minLen` nothing is padded, and without `maxLen` nothing is cut. */
export type MaskRow = Readonly<{ head: number, tail: number, minLen?: number, maxLen?: number }>
