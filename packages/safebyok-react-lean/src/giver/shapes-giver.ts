/** The giver's types and checks: the events it reads of a minder, and what a host hands it. */

import type { QueryKey, UseQueryOptions } from '@tanstack/react-query'
import { type Banklabel, type Userid, Checkers } from 'safebyok'

// == [Types]: GiverEvent, BoxQueryOpts

/** The fields the giver reads of a minder's event about a box's item or its soon. A minder's `ThingEvent` or `SoonEvent` of a box has them all. */
export type GiverEvent = Readonly<{
  /** Whether the event is of the box's item or of its soon. */
  eventkind: 'item' | 'soon'
  type:      'added' | 'updated' | 'removed'
  /** What changed the item or soon, or undefined where it was added or removed: `'invalidate'` when the item fell behind a newer revision heard of. */
  action:    Readonly<{ type: string }> | undefined
  /** The key the minder caches the item or soon under. An item's is the host's key for it too. */
  queryKey:  QueryKey
  userid:    Userid
  banklabel: Banklabel
  labelpath: string
  /** `data` is the item's record, or the soon's sparse record. */
  state:     Readonly<{ data: unknown, dataUpdatedAt: number }>
}>

/** React Query's options for a box's query, less the key and the fetch. Each one given replaces the giver's default. */
export type BoxQueryOpts<RecordT, SelT> = Omit<UseQueryOptions<RecordT, Error, SelT>, 'queryKey' | 'queryFn'>
// --

// == [Checks]: ScopeChecks

/** The check that a banklabel names the giver's bank. */
export const ScopeChecks = Checkers('bad_scope', ({ obj, label }) => ({
  bankScoped: obj({ banklabel: label }),
}))
// --
