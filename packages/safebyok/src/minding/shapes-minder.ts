/** The shapes of a ThingMinder's arguments and options, and their checks. */

import type * as TSQ from '@tanstack/query-core'
import type * as Z from 'zod'
import { exactOptional } from 'zod'
import { Validator } from 'safebyok-big/internals'
import type { Bank } from '../models/bank'
import * as Phrases from '../phrases'
import { type GetAsk, type ThingWatchScope, type Thingkind, type Track, thingScope, thingWatchScope, trackShape } from '../storage/shapes-thing'
import type { TSQGotAnswer } from './thing-minder'

// == [Query cache options]: QueryCacheOpts, DefaultQueryCacheOpts, FixedQueryCacheOpts, MaxGcTime

/** The TanStack Query options a host may choose for the cars a minder caches. */
export interface QueryCacheOpts {
  /** How long a car stays timely, in milliseconds. A `behind` or `bare` car is never timely. */
  staleTime: number
  /** How long a car stays in the cache once no TanStack observer uses it, in milliseconds. `Infinity` means until `goodbye`. */
  gcTime:    number
}

/** The default {@link QueryCacheOpts}: a car stays timely for an hour, and stays cached until `goodbye`. */
export const DefaultQueryCacheOpts: Readonly<QueryCacheOpts> = Object.freeze({ staleTime: 60 * 60 * 1000, gcTime: Infinity })

// Under TanStack's own networkMode, 'online', a get made while the browser reports itself offline waits, and so does its
// caller. A retry would put a whizbang in the critical path of a primitive operation (CLAUDE.md).
/** The TanStack Query options every minder sets, and no host can change: a get asks the vaultDB even offline, and is never retried. */
export const FixedQueryCacheOpts = Object.freeze({ networkMode: 'always', retry: false } as const)

// A timer longer than this fires at once, in every JavaScript runtime, and TanStack Query passes gcTime to one as it is.
/** The longest finite gcTime: 2^31 - 1 milliseconds, about 24.8 days. */
const MaxGcTime = (2 ** 31) - 1
// --

// == [Checks]: queryCacheOpts, minderFriend, tsqClient, minderListener, minderScope, minderTrack, minderAskOpts, minderGetAskOpts

/** The checks of a ThingMinder's arguments and options. */
export const { queryCacheOpts, minderFriend, tsqClient, minderListener, minderScope, minderTrack, minderAskOpts, minderGetAskOpts } = Validator.Checkers('bad_record', ({ obj, oneof, custom, fn, uint, lit, union, orDefault }) => {
  const gcTime           = union([uint.max(MaxGcTime, Phrases.GcTimeShape), lit(Infinity)])
  const queryCacheOpts   = obj({
    staleTime: orDefault(uint, DefaultQueryCacheOpts.staleTime),
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
  // The rest of the ask is the vaultDB's, which checks it.
  const minderTrack      = obj({ track: trackShape }).loose()
  // Each option may be left out, and never given as undefined.
  const minderGetAskOpts = obj({ staleTime: exactOptional(uint) }).strict()
  const minderAskOpts    = minderGetAskOpts.extend({ ifStale: exactOptional(oneof(['get', 'refresh'])) }).strict()
  return { queryCacheOpts, minderFriend, tsqClient, minderListener, minderScope, minderTrack, minderAskOpts, minderGetAskOpts }
})

/** A get ask with `ifAbsent: 'nil'` and a `track`, which the minder sends to the vaultDB exactly as given. */
export type MinderGetAsk     = GetAsk & Readonly<{ ifAbsent: 'nil', track: Track }>
/** A get's options: `staleTime` overrides the minder's own. */
export type MinderGetAskOpts = Z.input<typeof minderGetAskOpts>
/** `tryAt`'s options:
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
