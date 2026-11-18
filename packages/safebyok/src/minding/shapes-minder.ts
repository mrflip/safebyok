/** The shapes of a ThingMinder's arguments and options, and their checks. */

import type * as TSQ from '@tanstack/query-core'
import type * as Z from 'zod'
import { Validator } from 'safebyok-big/internals'
import type { Bank } from '../models/bank'
import * as Phrases from '../phrases'
import { type GetAsk, type ThingWatchScope, type Thingkind, type Track, AskChecks, thingScope, thingWatchScope, trackShape } from '../storage/shapes-thing'
import type { TSQGotAnswer } from './thing-minder'

// == [Query cache options]: QueryCacheOpts, DefaultQueryCacheOpts, FixedQueryCacheOpts, MaxTimerHours, MaxTimerMillis

/** The TanStack Query options a host may choose for the cars a minder caches. */
export interface QueryCacheOpts {
  /** How long a car stays timely, in milliseconds up to {@link MaxTimerMillis}, or `Infinity` for one that never ages. A `behind` or `bare` car is never timely. */
  staleTime: number
  /** How long a car stays in the cache once no TanStack observer uses it, in milliseconds up to {@link MaxTimerMillis}. `Infinity` means until `goodbye`. */
  gcTime:    number
}

/** The default {@link QueryCacheOpts}: a car stays timely for an hour, and stays cached until `goodbye`. */
export const DefaultQueryCacheOpts: Readonly<QueryCacheOpts> = Object.freeze({ staleTime: 60 * 60 * 1000, gcTime: Infinity })

// Under TanStack's own networkMode, 'online', a get made while the browser reports itself offline waits, and so does its
// caller. A retry would put a whizbang in the critical path of a primitive operation (CLAUDE.md).
/** The TanStack Query options every minder sets, and no host can change: a get asks the vaultDB even offline, and is never retried. */
export const FixedQueryCacheOpts = Object.freeze({ networkMode: 'always', retry: false } as const)

// TanStack Query passes a finite gcTime or staleTime to a timer as it is, and a timer longer than 2^31 - 1 milliseconds
// fires at once, in every JavaScript runtime. The bound is a whole number of hours, below that limit.
/** The longest finite gcTime or staleTime, in hours: 24.5 days. Give `Infinity` for a longer one. */
export const MaxTimerHours = 588

/** The longest finite gcTime or staleTime, in milliseconds: 24.5 days. Give `Infinity` for a longer one. */
export const MaxTimerMillis = MaxTimerHours * 60 * 60 * 1000
// --

// == [Checks]: queryCacheOpts, tsqStaleTime, minderFriend, tsqClient, minderListener, minderScope, minderGetAsk, minderAskOpts, minderGetAskOpts

/** The checks of a ThingMinder's arguments and options. */
export const {
  queryCacheOpts, tsqStaleTime, minderFriend, tsqClient, minderListener, minderScope, minderGetAsk, minderAskOpts, minderGetAskOpts,
} = Validator.Checkers('bad_record', ({ obj, oneof, custom, fn, uint, lit, union, orDefault }) => {
  const gcTime           = union([uint.max(MaxTimerMillis, Phrases.GcTimeShape), lit(Infinity)])
  const staleMillis      = uint.max(MaxTimerMillis, Phrases.StaleTimeShape)
  const staleTime        = union([staleMillis, lit(Infinity)])
  const queryCacheOpts   = obj({
    staleTime: orDefault(staleTime, DefaultQueryCacheOpts.staleTime),
    gcTime:    orDefault(gcTime, DefaultQueryCacheOpts.gcTime),
  }).strict()
  // A live object passes whole where these hold of it: parsing it would hand back a copy, its getters read once.
  const friendFields     = obj({ scope: thingWatchScope, makeGetAsk: fn(), makeListAsk: fn(), tellBadNews: fn() })
  const minderFriend     = custom<MinderFriend>((val) => friendFields.safeParse(val).success, Phrases.BankExpected)
  const tsqVerbs         = obj({ query: fn(), setQueryData: fn(), setQueryDefaults: fn(), getQueryCache: fn(), removeQueries: fn() })
  const tsqClient        = custom<TSQ.QueryClient>((val) => tsqVerbs.safeParse(val).success, Phrases.QueryClientExpected)
  const minderListener   = fn<(answer: TSQGotAnswer) => void>()
  // Its fields alone: an ask or a record passes, and is read as its scope.
  const minderScope      = obj(thingScope.shape)
  // Zod refuses to `extend` a refined object over keys it has; `safeExtend` narrows them, and keeps the refinement.
  const minderGetAsk     = AskChecks.getAsk.safeExtend({ ifAbsent: lit('nil'), track: trackShape })
  const tsqStaleTime     = union([staleMillis, lit(Infinity), lit('static')])
  // Each option may be left out, or given as undefined, for no opinion.
  const minderGetAskOpts = obj({ staleTime: tsqStaleTime.optional() }).strict()
  const minderAskOpts    = minderGetAskOpts.extend({ ifStale: oneof(['get', 'refresh']).optional() }).strict()
  return { queryCacheOpts, tsqStaleTime, minderFriend, tsqClient, minderListener, minderScope, minderGetAsk, minderAskOpts, minderGetAskOpts }
})

/** How long a minder's get or read counts a car timely: milliseconds up to {@link MaxTimerMillis}, or `Infinity` or `'static'` for a car that never ages.
 * A `behind` or `bare` car is never timely, whatever the staleTime. An invalidated car, or one whose last get was refused, is not timely under `Infinity`, and is under `'static'`, as TanStack Query counts them.
 */
export type TsqStaleTime = Z.input<typeof tsqStaleTime>

/** A get ask with `ifAbsent: 'nil'` and a `track`, which the minder sends to the vaultDB exactly as given. */
export type MinderGetAsk     = GetAsk & Readonly<{ ifAbsent: 'nil', track: Track }>
/** A get's options: `staleTime` overrides the minder's own, unless it is undefined. */
export type MinderGetAskOpts = Z.input<typeof minderGetAskOpts>
/** `tryAt`'s options, each of which may be undefined for no opinion:
 * - `staleTime`          -- overrides the minder's own
 * - `ifStale: 'get'`     -- read the cache alone (default)
 * - `ifStale: 'refresh'` -- also fetch a stale or missing car in the background
 */
export type MinderAskOpts    = Z.input<typeof minderAskOpts>
/** The parts of a {@link Bank} a minder uses: its scope, its ask builders, and where trouble no caller waits on goes. */
export type MinderFriend     = Pick<Bank, 'scope' | 'makeGetAsk' | 'makeListAsk' | 'tellBadNews'>
/** The user, bank and modelkind a minder is tied to: every ask it takes must match them. */
export type ThingTies        = ThingWatchScope & Readonly<{ modelkind: Thingkind }>
// --
