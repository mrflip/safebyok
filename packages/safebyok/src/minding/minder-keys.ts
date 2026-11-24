/** The head every query key a minder makes starts with. */

import type { Labelpath } from '../shapes/primitives'
import type { BankScope } from '../shapes/shapes-stamps'

/** The first segment of every query key a minder makes, whatever its bank. */
export const MinderKeyRoot = 'sok'

/** The part of a query key that every key of `scope`'s bank has in common, in either minder's cache. */
export function bankKeyHeadOf({ userid, banklabel }: BankScope): string[] { return [MinderKeyRoot, userid, banklabel] }

/** The labels of `labelpath`, with '/' between them, as a query key spells them. */
export function labelsOf(labelpath: Labelpath): string[] {
  return labelpath.split('/').flatMap((label) => ['/', label]).slice(1)
}
