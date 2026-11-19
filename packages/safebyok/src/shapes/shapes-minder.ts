/** The shapes of a ThingMinder's arguments, options and answers, and of the cars it caches, with their checks. */

import type * as Z from 'zod'
import { type Errors, Validator } from 'safebyok-big/internals'
import type { ThingMinder } from '../minding/thing-minder'
import type { Bank } from '../models/bank'
import * as Phrases from '../phrases'
import type { BadAnswer, GoodAnswer, VaultDB } from '../storage/vault-db'
import type { EpochMillis, Labelpath } from './primitives'
import { type BankThing, type BoxThing, type GateThing, type Sparse, type Thing, type ThingRecord, type ThingScope, type Tombstone, type VoidSentinel, ThingChecks } from './shapes-thing'
import { type GetAsk, type LoggableAsk, AskChecks } from './shapes-asks'

// == [Query cache options]: QueryCacheOpts, DefaultQueryCacheOpts, FixedQueryCacheOpts, MaxTimerHours, MaxTimerMillis

/** The TanStack Query options a host may choose for the cars a minder caches. */
export interface QueryCacheOpts {
  /** How long a car stays timely, in milliseconds up to {@link MaxTimerMillis}, or `Infinity` for one that never ages. A `behind` or `bare` car is never timely. */
  staleTime: number
  /** How long a car stays in the cache after it was first cached or last fetched from the vaultDB, in milliseconds up to {@link MaxTimerMillis}. `Infinity` means until `goodbye`.
   * A record that arrives by a notice or a list does not extend it, and nor does a get answered from the cache. The root box's car stays until `goodbye`, whatever the gcTime.
   */
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

// == [Checks]: RawChecks, MinderChecks

/** The checks of a minder's arguments and options. */
const RawChecks = Validator.Checkers('bad_record', ({ obj, oneof, custom, fn, uint, lit, union, orDefault }) => {
  const gcTime           = union([uint.max(MaxTimerMillis, Phrases.GcTimeShape), lit(Infinity)])
  const staleMillis      = uint.max(MaxTimerMillis, Phrases.StaleTimeShape)
  const staleTime        = union([staleMillis, lit(Infinity)])
  const queryCacheOpts   = obj({
    staleTime: orDefault(staleTime, DefaultQueryCacheOpts.staleTime),
    gcTime:    orDefault(gcTime, DefaultQueryCacheOpts.gcTime),
  }).strict()
  // A field left out, or the whole, defaults from DefaultQueryCacheOpts.
  const queryCacheOptsOrDefault = orDefault(queryCacheOpts, DefaultQueryCacheOpts)
  // A live object passes whole where these hold of it: parsing it would hand back a copy, its getters read once.
  const friendFields     = obj({ scope: AskChecks.thingWatchScope, rootBox: obj({ ...ThingChecks.thingScope.shape, lifepath: ThingChecks.thingCited.shape.lifepath }), makeGetAsk: fn(), makeListAsk: fn(), tellBadNews: fn() })
  const minderFriend     = custom<MinderFriend>((val) => friendFields.safeParse(val).success, Phrases.BankExpected)
  const minderListener   = fn<(answer: TSQGotAnswer) => void>()
  const minderLabelpath  = ThingChecks.thingScope.shape.labelpath
  const tsqStaleTime     = union([staleMillis, lit(Infinity), lit('static')])
  // Each option may be left out, or given as undefined, for no opinion.
  const minderGetOpts    = obj({ staleTime: tsqStaleTime.optional() }).strict()
  const minderTryAtOpts  = minderGetOpts.extend({ ifStale: oneof(['get', 'refresh']).optional() }).strict()
  return { queryCacheOpts, queryCacheOptsOrDefault, tsqStaleTime, minderFriend, minderListener, minderLabelpath, minderTryAtOpts, minderGetOpts }
})

/** The checks of a ThingMinder's arguments and options.
 * Also `DefaultQueryCacheOpts` and `MaxTimerMillis`, the bounds of the cache options a host may choose.
 */
export const MinderChecks = Object.freeze({ ...RawChecks, DefaultQueryCacheOpts, MaxTimerMillis })

/** How long a minder's get or read counts a car timely: milliseconds up to {@link MaxTimerMillis}, or `Infinity` or `'static'` for a car that never ages.
 * A `behind` or `bare` car is never timely, whatever the staleTime. A car whose last get was refused is not timely under `Infinity`, and is under `'static'`, as TanStack Query counts it.
 */
export type TsqStaleTime = Z.input<typeof MinderChecks.tsqStaleTime>

/** The options of `get` and `isStaleAt`: `staleTime` overrides the minder's own, unless it is undefined. */
export type MinderGetOpts    = Z.input<typeof MinderChecks.minderGetOpts>
/** `tryAt`'s options, each of which may be undefined for no opinion:
 * - `staleTime`          -- overrides the minder's own
 * - `ifStale: 'get'`     -- read the cache alone (default)
 * - `ifStale: 'refresh'` -- also fetch a stale or missing car in the background
 */
export type MinderTryAtOpts  = Z.input<typeof MinderChecks.minderTryAtOpts>
/** The parts of a {@link Bank} a minder uses: its scope, its ask builders, and where trouble no caller waits on goes. */
export type MinderFriend     = Pick<Bank, 'scope' | 'rootBox' | 'makeGetAsk' | 'makeListAsk' | 'tellBadNews'>
// --

// == [The car]: ThingCar, BankCar, BoxCar, GateCar, ThingAt, CarAt, DeliverableThing, carLivenessVals

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

/** The car of the bank's Thing. */
export type BankCar = ThingCar<BankThing>
/** The car of a box. */
export type BoxCar  = ThingCar<BoxThing>
/** The car of a gate. */
export type GateCar = ThingCar<GateThing>

/** The kind of Thing stored at `LabelpathT`, read from its modelkind, or any Thing for a labelpath not known when compiled. */
export type ThingAt<LabelpathT extends Labelpath> =
  LabelpathT extends 'gate' | `gate/${string}` ? GateThing
    : LabelpathT extends 'box' | `box/${string}` ? BoxThing
      : LabelpathT extends 'bank' ? BankThing
        : Thing

/** The car of the Thing stored at `LabelpathT` ({@link ThingAt}). */
export type CarAt<LabelpathT extends Labelpath> = ThingCar<ThingAt<LabelpathT>>

/** A record a car is made from: a Thing, whole or sparse, or the void sentinel. */
export type DeliverableThing = Thing | Sparse<Thing> | VoidSentinel

/** Each `liveness` a car may have. */
export const carLivenessVals = ['full', 'behind', 'bare', 'gone', 'void'] as const
// --

// == [A minder's answers]: GotAnswer, CarFreshness, TSQGotAnswer, TSQAnswer, ScopeAt

// `val` is undefined under `vacant` and `untimely`, where the cache knows nothing timely; null under `gotvoid`, where storage holds nothing.
// A timely car is full, gone or void: a behind or bare car is never timely.
/** A get's answer, read from the cache. Beside a get's own acts:
 * - `vacant`   -- nothing is cached
 * - `untimely` -- the car is `behind` or `bare`, or TanStack Query counts it stale under `staleTime`: older than it, or its last get refused
 */
export type GotAnswer<RecordT extends Thing = Thing> = (
  | GoodAnswer<RecordT, 'gotlive'>
  | GoodAnswer<Tombstone<RecordT>, 'gotgone'>
  | GoodAnswer<null, 'gotvoid'>
  | { ok: true, ask: LoggableAsk, act: 'vacant' | 'untimely', world: null, val: undefined }
) & { ask: GetAsk }

/** The car cached for a scope, however old, and the state of its gets. */
export interface CarFreshness<RecordT extends Thing = Thing> {
  /** The cached car, or undefined for none. */
  car:         ThingCar<RecordT> | undefined
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
export type TSQGotAnswer<RecordT extends Thing = Thing> = GotAnswer<RecordT> & CarFreshness<RecordT>

/** `tryAt`'s answer: a {@link TSQGotAnswer}, or a refusal. */
export type TSQAnswer<RecordT extends Thing = Thing> = TSQGotAnswer<RecordT> | BadAnswer

/** A scope whose labelpath is `LabelpathT`, which types the car a minder answers for it ({@link ThingAt}). */
export type ScopeAt<LabelpathT extends Labelpath> = ThingScope & Readonly<{ labelpath: LabelpathT }>
// --

// == [A minder's making]: MinderOpts

/** Options for {@link ThingMinder.make}. */
export interface MinderOpts {
  /** Where the bank's Things are stored. */
  vaultDB:         VaultDB
  /** The cache's timings ({@link QueryCacheOpts}). A field left out defaults from {@link DefaultQueryCacheOpts}. */
  queryCacheOpts?: Partial<QueryCacheOpts>
}
// --
