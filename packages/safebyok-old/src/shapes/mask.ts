/** The check of `mask`'s options. */

// Kept apart from the other shapes so that `safebyok/utils` carries no other validator.

import type * as Z from 'zod'
import { objCheck } from '../checks/validator'
import type { MaskOpts } from '../mask'

/** The most characters `head`, `tail` or `minStars` may ask for: a whiff, not a copy. */
const MaxShown = 1000

/** The check of `mask`'s options, defaulting each, refusing 'bad_option', a field it does not take among them. */
export const maskOpts = objCheck(({ union, lit, uint }) => {
  const shownCount = uint.lte(MaxShown)
  const resultLen  = union([lit(Infinity), uint])
  return {
    head:     shownCount.default(2),
    tail:     shownCount.default(4),
    minStars: shownCount.default(6),
    maxLen:   resultLen.default(15),
  } satisfies Record<keyof MaskOpts, Z.ZodType>
}, 'bad_option')
