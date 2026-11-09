/** The check of `mask`'s options. Imported as `UX`. */

// Kept apart from the other shapes so that `safebyok/utils` carries no other validator.

import type * as Z from 'zod'
import { objCheck } from '../helpers/validator'

/** The most characters `head`, `tail` or `minStars` may ask for: a whiff, not a copy. */
const MaxShown = 1000

/** The check of `mask`'s options, each defaulted, a field it does not accept refused. Its `parse` refuses 'bad_option'. */
export const maskOpts = objCheck(({ union, lit, uint }) => {
  const shownCount = uint.lte(MaxShown)
  const resultLen  = union([lit(Infinity), uint])
  return {
    /** Characters kept from the start of the text. Default 2. */
    head:     shownCount.default(2),
    /** Characters kept from the end of the text. Default 4. */
    tail:     shownCount.default(4),
    /** Fewest stars the result may carry, however short the text. Default 6. */
    minStars: shownCount.default(6),
    /** Longest result, in code points. Default 15. `Infinity` never collapses. */
    maxLen:   resultLen.default(15),
  }
}, 'bad_option')

/** How `mask` shows a text: how many characters to reveal, and how many stars to hide it behind. */
export type MaskOpts = Z.input<typeof maskOpts>
