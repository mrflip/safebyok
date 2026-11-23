/** The head every query key a minder makes starts with. */

import type { BankScope } from '../shapes/shapes-stamps'

/** The first segment of every query key a minder makes, whatever its bank. */
export const MinderKeyRoot = 'sok'

/** The part of a query key that every key of `scope`'s bank has in common, in either minder's cache. */
export function bankKeyHeadOf({ userid, banklabel }: BankScope): string[] { return [MinderKeyRoot, userid, banklabel] }
