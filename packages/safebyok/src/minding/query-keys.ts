/** The head every query key this package makes starts with, and how a key spells a labelpath. */

import type { Labelpath } from '../shapes/primitives'
import type { TableScope } from '../shapes/shapes-thing'

/** The first segment of every query key this package makes, whatever its bank. */
export const QueryKeyRoot = 'sok'

// The kind comes first, so that one default set on `[QueryKeyRoot, modelkind]` reaches every key of that kind, in every bank.
/** The part of a query key that every key of `scope`'s table has in common: the Things of its kind in its bank. */
export function tableKeyHeadOf({ modelkind, userid, banklabel }: TableScope): string[] { return [QueryKeyRoot, modelkind, userid, banklabel] }

/** The labels of `labelpath`, with '/' between them, as a query key spells them. */
export function labelsOf(labelpath: Labelpath): string[] {
  return labelpath.split('/').flatMap((label) => ['/', label]).slice(1)
}
