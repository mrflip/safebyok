/** The dojo's strength checker: strong at four characters or more, or, while switched to weak, a weak verdict on every passphrase. */

import type { StrengthChecker } from 'safebyok/browser'

/** The fewest characters the dojo judges strong. */
const MinChars = 4

/** The reason the checker gives a passphrase shorter than {@link MinChars}. */
const TooShortReason = `The dojo takes a passphrase of ${String(MinChars)} characters or more.`

/** The reason the checker gives while switched to weak. */
export const ForcedWeakReason = 'The dojo switched its strength checker to judge every passphrase weak.'

/** Whether the checker judges every passphrase weak. */
const switched = { isWeakForced: false }

/** Switch the checker to judge every passphrase weak, or back to its own verdict. Set by the forms' scenario buttons. */
export function forceWeak(isWeakForced: boolean): void { switched.isWeakForced = isWeakForced }

/** Strong at four characters or more, unless switched to weak by {@link forceWeak}. */
export const switchableChecker: StrengthChecker = (typed) => {
  if (switched.isWeakForced) { return { strong: false, reason: ForcedWeakReason } }
  if (typed.length < MinChars) { return { strong: false, reason: TooShortReason } }
  return { strong: true }
}
