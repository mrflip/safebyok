/** The shapes of a ThingMinder's arguments, options and answers, and of the cars it caches, with their checks. */

import type * as TSQ from '@tanstack/query-core'
import type * as Z from 'zod'
import { type Errors, Validator } from 'safebyok-big/internals'
import type { ThingMinder } from '../minding/thing-minder'
import type { Bank } from '../models/bank'
import * as Phrases from '../phrases'
import type { BadAnswer, GoodAnswer, VaultDB } from '../storage/vault-db'
import type { EpochMillis } from './primitives'
import { type BoxThing, type GateThing, type Sparse, type Thing, type ThingRecord, type Thingkind, type Tombstone, type VoidSentinel, thingCited, thingScope } from './shapes-thing'
import { type GetAsk, type LoggableAsk, type ThingWatchScope, type Track, AskChecks, thingWatchScope, trackShape } from './shapes-asks'

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
  const friendFields     = obj({ scope: thingWatchScope, rootBox: obj({ ...thingScope.shape, lifepath: thingCited.shape.lifepath }), makeGetAsk: fn(), makeListAsk: fn(), tellBadNews: fn() })
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
export type MinderFriend     = Pick<Bank, 'scope' | 'rootBox' | 'makeGetAsk' | 'makeListAsk' | 'tellBadNews'>
/** The user, bank and modelkind a minder is tied to: every ask it takes must match them. */
export type ThingTies        = ThingWatchScope & Readonly<{ modelkind: Thingkind }>
// --

// == [The car]: ThingCar, BoxCar, GateCar, DeliverableThing, carLivenessVals

// The vaultDB has a newer whole record when liveness is 'behind' or 'bare' (dbHasNewer).
/** A ThingMinder's frozen cache value for a Thing: among records we've seen, carries its newest (perhaps sparse), and its fullest (perhaps null, or undefined for "exists, but nothing useful cached").
 * - `newest` is always a record: full, sparse, the void sentinel when void, or a deleted Thing's tombstone when gone.
 * - `fullest` is null when gone or void, and undefined when bare. It stands for the *record* `fullest ?? newest`.
 * - Both records have identical scope and lifepath. (This implies a car with a newer lifepath should always replace the other.)
 * - On `full`, the two are *identical* (`newest === fullest`): the same object, not just the same content.
 * - When `behind`, `fullest` is of a strictly earlier revision: `newest.revseq > fullest.revseq`.
 */
export type ThingCar<RecordT extends ThingRecord> = Readonly<
  | { liveness: 'full',   newest: RecordT,            fullest: RecordT   } // the same record in both. dbHasNewer: false
  | { liveness: 'behind', newest: Sparse<RecordT>,    fullest: RecordT   } // fullest is strictly older. Newest is strictly Sparse (not full, not gone, not void). dbHasNewer: true
  | { liveness: 'bare',   newest: Sparse<RecordT>,    fullest: undefined } // never fetched a whole record; newest is strictly sparse. dbHasNewer: true
  | { liveness: 'gone',   newest: Tombstone<RecordT>, fullest: null      } // a deleted Thing's tombstone: known to be gone. dbHasNewer: false
  | { liveness: 'void',   newest: VoidSentinel,       fullest: null      } // a shell:     known to be void. dbHasNewer: false
>

/** The car of a box. */
export type BoxCar  = ThingCar<BoxThing>
/** The car of a gate. */
export type GateCar = ThingCar<GateThing>

/** A record a car is made from: a Thing, whole or sparse, or the void sentinel. */
export type DeliverableThing = Thing | Sparse<Thing> | VoidSentinel

/** Each `liveness` a car may have. */
export const carLivenessVals = ['full', 'behind', 'bare', 'gone', 'void'] as const
// --

// == [A minder's answers]: GotAnswer, CarFreshness, TSQGotAnswer, TSQAnswer

// `val` is undefined under `vacant` and `untimely`, where the cache knows nothing timely; null under `gotvoid`, where storage holds nothing.
// A timely car is full, gone or void: a behind or bare car is never timely.
/** A get's answer, read from the cache. Beside a get's own acts:
 * - `vacant`   -- nothing is cached
 * - `untimely` -- the car is `behind` or `bare`, or TanStack Query counts it stale under `staleTime`: older than it, invalidated, or its last get refused
 */
export type GotAnswer = (
  | GoodAnswer<Thing, 'gotlive'>
  | GoodAnswer<Tombstone<Thing>, 'gotgone'>
  | GoodAnswer<null, 'gotvoid'>
  | { ok: true, ask: LoggableAsk, act: 'vacant' | 'untimely', world: null, val: undefined }
) & { ask: GetAsk }

/** The car cached for a scope, however old, and the state of its gets. */
export interface CarFreshness {
  /** The cached car, or undefined for none. */
  car:         ThingCar<Thing> | undefined
  /** False where the act is `vacant` or `untimely`. */
  isTimely:    boolean
  /** When a record last arrived in the car, or 0 for none. */
  refreshedAt: EpochMillis
  /** True while a get of the car is under way. */
  isFetching:  boolean
  /** The refusal of the car's last get, or null. */
  lastErr:     Errors.VaultError | null
}

/** A get's answer read from the cache, with the car and its {@link CarFreshness}. */
export type TSQGotAnswer = GotAnswer & CarFreshness

/** `tryAt`'s answer: a {@link TSQGotAnswer}, or a refusal. */
export type TSQAnswer = TSQGotAnswer | BadAnswer
// --

// == [A minder's making]: MinderOpts

/** Options for {@link ThingMinder.make}. */
export interface MinderOpts {
  /** Where the bank's Things are stored. */
  vaultDB:         VaultDB
  /** The TanStack Query client whose cache has the cars. A host may share its own.
   * TanStack passes an observer's selected and placeholder values through the minder's structural sharing, which throws `unexpected_error` on anything but a car.
   */
  tsq:             TSQ.QueryClient
  /** The cache's timings ({@link QueryCacheOpts}). A field left out defaults from {@link DefaultQueryCacheOpts}. */
  queryCacheOpts?: Partial<QueryCacheOpts>
}
// --
