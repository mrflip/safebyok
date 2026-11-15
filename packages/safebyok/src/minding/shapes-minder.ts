/** The shapes of a ThingMinder's arguments and options, and their checks. */

import type * as TSQ from '@tanstack/query-core'
import type * as Z from 'zod'
import { exactOptional } from 'zod'
import { Validator } from 'safebyok-big/internals'
import type { Bank } from '../models/bank'
import * as Phrases from '../phrases'
import { type ThingScope, type ThingWatchScope, type Thingkind, boxSparse, thingWatchScope } from '../storage/shapes-thing'

// == [Query cache options]: QueryCacheOpts, DefaultQueryCacheOpts, FixedQueryCacheOpts, MaxGcTime

/** The TanStack Query options a host may choose for a minder's cache entries. */
export interface QueryCacheOpts {
  /** How long a record stays timely, in milliseconds. */
  staleTime: number
  /** How long an entry no one listens to stays in the cache, in milliseconds. `Infinity` keeps it until `goodbye`. */
  gcTime:    number
}

/** The default {@link QueryCacheOpts}: records stay timely an hour, and entries stay until `goodbye`. */
export const DefaultQueryCacheOpts: Readonly<QueryCacheOpts> = Object.freeze({ staleTime: 60 * 60 * 1000, gcTime: Infinity })

// Under TanStack's own networkMode, 'online', a get made while the browser reports itself offline waits, and so does its
// caller. A retry would put a whizbang in the critical path of a primitive operation (CLAUDE.md).
/** The TanStack Query options every minder sets, which no host can change: a get asks the vaultDB even offline, and is never retried. */
export const FixedQueryCacheOpts = Object.freeze({ networkMode: 'always', retry: false } as const)

// A timer longer than this fires at once, in every JavaScript runtime, and TanStack Query passes gcTime to one as it is.
/** The longest finite gcTime: 2^31 - 1 milliseconds, about 24.8 days. */
const MaxGcTime = (2 ** 31) - 1
// --

// == [Checks]: queryCacheOpts, minderFriend, tsqClient, minderListener, minderAskOpts, minderGetAskOpts

/** The checks of a {@link QueryCacheOpts}, of the parts of `ThingMinder.make`'s arguments that name no minder, of a listener, and of a read's options. */
export const { queryCacheOpts, minderFriend, tsqClient, minderListener, minderAskOpts, minderGetAskOpts } = Validator.Checkers('bad_option', ({ obj, oneof, custom, fn, uint, lit, union, orDefault }) => {
  const gcTime           = union([uint.max(MaxGcTime, Phrases.GcTimeShape), lit(Infinity)])
  const queryCacheOpts   = obj({
    staleTime: orDefault(uint, DefaultQueryCacheOpts.staleTime),
    gcTime:    orDefault(gcTime, DefaultQueryCacheOpts.gcTime),
  }).strict()
  // A live object passes whole where these hold of it: parsing it would hand back a copy, its getters read once.
  const friendFields     = obj({ scope: thingWatchScope, rootBox: boxSparse })
  const minderFriend     = custom<MinderFriend>((val) => friendFields.safeParse(val).success, Phrases.BankExpected)
  const tsqVerbs         = obj({ query: fn(), setQueryData: fn(), setQueryDefaults: fn(), getQueryCache: fn(), removeQueries: fn(), invalidateQueries: fn() })
  const tsqClient        = custom<TSQ.QueryClient>((val) => tsqVerbs.safeParse(val).success, Phrases.QueryClientExpected)
  const minderListener   = fn<(scoped: ThingScope, record: unknown) => void>()
  // Each option may be left out, and never given as undefined.
  const minderGetAskOpts = obj({ staleTime: exactOptional(uint) }).strict()
  const minderAskOpts    = minderGetAskOpts.extend({ ifStale: exactOptional(oneof(['get', 'refresh'])) }).strict()
  return { queryCacheOpts, minderFriend, tsqClient, minderListener, minderAskOpts, minderGetAskOpts }
})

/** A get's options: `staleTime` overrides the minder's own. */
export type MinderGetAskOpts = Z.input<typeof minderGetAskOpts>
/** `tryAt`'s options:
 * - `staleTime`          -- overrides the minder's own
 * - `ifStale: 'get'`     -- read the cache alone (default)
 * - `ifStale: 'refresh'` -- also fetch a stale or vacant record in the background
 */
export type MinderAskOpts    = Z.input<typeof minderAskOpts>
/** Internal. What a minder reads of its bank: its scope, and its root box, the parent of every box under it. */
export type MinderFriend     = Pick<Bank, 'scope' | 'rootBox'>
/** The user, bank and modelkind a minder is tied to: every ask it takes must match them. */
export type ThingTies        = ThingWatchScope & Readonly<{ modelkind: Thingkind }>
// --
