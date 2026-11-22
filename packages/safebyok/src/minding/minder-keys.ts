/** The head every query key a minder makes starts with. */

import type { QueryClient } from '@tanstack/query-core'
import { uniq } from 'es-toolkit'
import type { Userid } from '../shapes/primitives'
import type { BankScope } from '../shapes/shapes-stamps'

/** The first segment of every query key a minder makes, whatever its bank. */
export const MinderKeyRoot = 'sok'

/** The part of a query key that every key of `scope`'s bank has in common, in either minder's cache. */
export function bankKeyHeadOf({ userid, banklabel }: BankScope): string[] { return [MinderKeyRoot, userid, banklabel] }

/** The userid of each bank with an entry holding a record or Absent in `queryClient`, a minder's client, once each. */
export function useridsCachedIn(queryClient: QueryClient): Userid[] {
  return uniq(queryClient.getQueryCache().getAll().filter((tsqQuery) => tsqQuery.state.data !== undefined).map((tsqQuery) => tsqQuery.queryKey[1] as Userid))
}
