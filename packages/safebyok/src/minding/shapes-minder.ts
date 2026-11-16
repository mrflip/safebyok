/** The shapes of a ThingMinder's arguments and options, and their checks. */

import type * as TSQ from '@tanstack/query-core'
import { Validator } from 'safebyok-big/internals'
import type { Bank } from '../models/bank'
import * as Phrases from '../phrases'
import { type GetThingAsk, type ThingWatchScope, type Thingkind, type Track, boxSparse, thingWatchScope, trackShape } from '../storage/shapes-thing'
import type { TSQGotAnswer } from './thing-minder'

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

// == [Checks]: queryCacheOpts, minderFriend, tsqClient, minderListener, minderAskTail

/** The checks of a {@link QueryCacheOpts}, of the parts of `ThingMinder.make`'s arguments that name no minder, of a listener, and of a minder's own fields of its get ask. */
export const { queryCacheOpts, minderFriend, tsqClient, minderListener, minderAskTail } = Validator.Checkers('bad_option', ({ obj, oneof, custom, fn, uint, lit, union, orDefault }) => {
  const gcTime           = union([uint.max(MaxGcTime, Phrases.GcTimeShape), lit(Infinity)])
  const queryCacheOpts   = obj({
    staleTime: orDefault(uint, DefaultQueryCacheOpts.staleTime),
    gcTime:    orDefault(gcTime, DefaultQueryCacheOpts.gcTime),
  }).strict()
  // A live object passes whole where these hold of it: parsing it would hand back a copy, its getters read once.
  const friendFields     = obj({ scope: thingWatchScope, rootBox: boxSparse, makeGetAsk: fn(), tellBadNews: fn() })
  const minderFriend     = custom<MinderFriend>((val) => friendFields.safeParse(val).success, Phrases.BankExpected)
  const tsqVerbs         = obj({ query: fn(), setQueryData: fn(), setQueryDefaults: fn(), getQueryCache: fn(), removeQueries: fn(), invalidateQueries: fn() })
  const tsqClient        = custom<TSQ.QueryClient>((val) => tsqVerbs.safeParse(val).success, Phrases.QueryClientExpected)
  const minderListener   = fn<(answer: TSQGotAnswer) => void>()
  // The rest of the ask is the vaultDB's, which checks it.
  const minderAskTail    = obj({ staleTime: uint, ifStale: oneof(['get', 'refresh']), track: trackShape }).loose()
  return { queryCacheOpts, minderFriend, tsqClient, minderListener, minderAskTail }
})

// Nothing is filled in: `ThingMinder.makeGetAsk` builds a whole one.
/** A minder's get ask: the bank's get ask, which the minder sends to the vaultDB exactly as given, and the minder's own two fields.
 * - `staleTime`          -- a record older than this (milliseconds) is not timely
 * - `ifStale: 'get'`     -- `tryAt` reads the cache alone
 * - `ifStale: 'refresh'` -- `tryAt` also fetches a stale or vacant record in the background
 *
 * `get` reads `staleTime` alone, and fetches what is not timely.
 */
export type MinderGetAsk     = GetThingAsk & Readonly<{ ifAbsent: 'nil', track: Track, staleTime: number, ifStale: 'get' | 'refresh' }>
/** The arguments of `ThingMinder.makeGetAsk`: the labelpath, and the minder's own fields where they differ from its defaults. */
export type MinderGetAskArgs = Readonly<{ labelpath: string, staleTime?: number, ifStale?: 'get' | 'refresh' }>
/** Internal. What a minder reads of its bank: its scope, its get asks, where trouble with no caller goes, and its root box, which a box minder caches when it starts. */
export type MinderFriend     = Pick<Bank, 'scope' | 'rootBox' | 'makeGetAsk' | 'tellBadNews'>
/** The user, bank and modelkind a minder is tied to: every ask it takes must match them. */
export type ThingTies        = ThingWatchScope & Readonly<{ modelkind: Thingkind }>
// --
