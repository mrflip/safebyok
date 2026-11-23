/** The head every query key a minder makes starts with. */

import type { BankScope } from '../shapes/shapes-stamps'

/** The part of a query key that every key of `scope`'s bank has in common, in either minder's cache. */
export function bankKeyHeadOf({ userid, banklabel }: BankScope): string[] { return ['sok', userid, banklabel] }
