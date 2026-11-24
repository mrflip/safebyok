/** The head every query key this package makes starts with, and how a key spells a labelpath. */

import type { Labelpath } from '../shapes/primitives'
import type { BankScope } from '../shapes/shapes-stamps'

/** The first segment of every query key this package makes, whatever its bank. */
export const QueryKeyRoot = 'sok'

/** The part of a query key that every key of `scope`'s bank has in common. */
export function bankKeyHeadOf({ userid, banklabel }: BankScope): string[] { return [QueryKeyRoot, userid, banklabel] }

/** The labels of `labelpath`, with '/' between them, as a query key spells them. */
export function labelsOf(labelpath: Labelpath): string[] {
  return labelpath.split('/').flatMap((label) => ['/', label]).slice(1)
}
