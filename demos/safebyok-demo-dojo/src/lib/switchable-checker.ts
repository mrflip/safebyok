/** The dojo's strength checker: zxcvbn's, or, while switched to weak, a weak verdict on every passphrase. */

import { zxcvbnStrengthChecker, type StrengthChecker } from 'safebyok/browser'

/** The reason the checker gives while switched to weak. */
export const ForcedWeakReason = 'The dojo switched its strength checker to judge every passphrase weak.'

/** Whether the checker judges every passphrase weak. */
const switched = { isWeakForced: false }

/** Switch the checker to judge every passphrase weak, or back to zxcvbn's verdict. Set by the forms' scenario buttons. */
export function forceWeak(isWeakForced: boolean): void { switched.isWeakForced = isWeakForced }

/** zxcvbn's checker, unless switched to weak by {@link forceWeak}. */
export const switchableChecker: StrengthChecker = Object.assign(
  async (typed: string, scope: Parameters<StrengthChecker>[1]) => (switched.isWeakForced ? { strong: false, reason: ForcedWeakReason } : await zxcvbnStrengthChecker(typed, scope)),
  { load: zxcvbnStrengthChecker.load },
)
