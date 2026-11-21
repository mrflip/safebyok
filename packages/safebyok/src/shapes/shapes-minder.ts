/** The shapes of a ThingMinder's arguments, options and answers, and of the cars it caches, with their checks. */

import type * as TSQ from '@tanstack/query-core'
import type * as Z from 'zod'
import { type Errors, Validator } from 'safebyok-big/internals'
import type { ThingMinder } from '../minding/thing-minder'
import type { Bank } from '../models/bank'
import type { RecordOfKind } from '../models/base-thing'
import * as Phrases from '../phrases'
import type { BadAnswer, GoodAnswer, VaultDB } from '../storage/vault-db'
import type { Banklabel, BoxLabelpath, EpochMillis, Labelpath, Lifepath, Lifeseq, Revtok, Userid } from './primitives'
import { type BankRecord, type BoxRecord, type GateRecord, type Sparse, type ThingRecord, type ThingScope, type Thingkind, type Tombstone, type VoidSentinel, ThingChecks, ThingFormat } from './shapes-thing'
import { type GetAsk, type LoggableAsk, AskChecks } from './shapes-asks'

// == [Query cache options]: QueryCacheOpts, DefaultQueryCacheOpts, FixedQueryCacheOpts, MaxTimerHours, MaxTimerMillis

/** The TanStack Query options a host may choose for the cars a minder caches. */
export interface QueryCacheOpts {
  /** How long a car stays timely, in milliseconds up to {@link MaxTimerMillis}, or `Infinity` for one that never ages. A `bhnd` or `bare` car is never timely. */
  staleTime: number
}

/** The default {@link QueryCacheOpts}: a car stays timely for an hour. */
export const DefaultQueryCacheOpts: Readonly<QueryCacheOpts> = Object.freeze({ staleTime: 60 * 60 * 1000 })

// Under TanStack's own networkMode, 'online', a get made while the browser reports itself offline waits, and so does its
// caller. A retry would put a whizbang in the critical path of a primitive operation (CLAUDE.md).
/** The TanStack Query options every minder sets, and no host can change: a get asks the vaultDB even offline, is never retried, and its car stays cached until `goodbye`. */
export const FixedQueryCacheOpts = Object.freeze({ networkMode: 'always', retry: false, gcTime: Infinity } as const)

// TanStack Query passes a finite staleTime to a timer as it is, and a timer longer than 2^31 - 1 milliseconds
// fires at once, in every JavaScript runtime. The bound is a whole number of hours, below that limit.
/** The longest finite staleTime, in hours: 24.5 days. Give `Infinity` for a longer one. */
export const MaxTimerHours = 588

/** The longest finite staleTime, in milliseconds: 24.5 days. Give `Infinity` for a longer one. */
export const MaxTimerMillis = MaxTimerHours * 60 * 60 * 1000
// --

// == [Checks]: RawChecks, MinderChecks

/** The checks of a minder's arguments and options. */
const RawChecks = Validator.Checkers('bad_record', ({ obj, oneof, custom, fn, uint, lit, union, orDefault }) => {
  const staleMillis      = uint.max(MaxTimerMillis, Phrases.StaleTimeShape)
  const staleTime        = union([staleMillis, lit(Infinity)])
  const queryCacheOpts   = obj({
    staleTime: orDefault(staleTime, DefaultQueryCacheOpts.staleTime),
  }).strict()
  // A field left out, or the whole, defaults from DefaultQueryCacheOpts.
  const queryCacheOptsOrDefault = orDefault(queryCacheOpts, DefaultQueryCacheOpts)
  // A live object passes whole where these checks pass: parsing it would hand back a copy, its getters read once.
  const friendFields     = obj({ scope: AskChecks.thingWatchScope, rootBox: obj({ ...ThingChecks.thingScope.shape, lifepath: ThingChecks.thingCited.shape.lifepath }), makeGetAsk: fn(), makeListAsk: fn(), tellBadNews: fn() })
  const minderFriend     = custom<MinderFriend>((val) => friendFields.safeParse(val).success, Phrases.BankExpected)
  const minderListener   = fn<(event: MinderEvent) => void>()
  const feedVersion      = lit(ThingFormat, Phrases.FeedVersionOther)
  const minderLabelpath  = ThingChecks.thingScope.shape.labelpath
  const tsqStaleTime     = union([staleMillis, lit(Infinity), lit('static')])
  // Each option may be left out, or given as undefined, for no opinion.
  const minderGetOpts    = obj({ staleTime: tsqStaleTime.optional() }).strict()
  const minderTryAtOpts  = minderGetOpts.extend({ ifStale: oneof(['get', 'refresh']).optional() }).strict()
  const minderInvalidateOpts = obj({ list: lit('all') }).strict()
  return { queryCacheOpts, queryCacheOptsOrDefault, tsqStaleTime, minderFriend, minderListener, feedVersion, minderLabelpath, minderTryAtOpts, minderGetOpts, minderInvalidateOpts }
})

/** The checks of a ThingMinder's arguments and options.
 * Also `DefaultQueryCacheOpts` and `MaxTimerMillis`, the bounds of the cache options a host may choose.
 */
export const MinderChecks = Object.freeze({ ...RawChecks, DefaultQueryCacheOpts, MaxTimerMillis })

/** How long a minder's get or read counts a car timely: milliseconds up to {@link MaxTimerMillis}, or `Infinity` or `'static'` for a car that never ages.
 * A `bhnd` or `bare` car is never timely, whatever the staleTime. A car whose last get was refused is not timely under `Infinity`, and is under `'static'`, as TanStack Query counts it.
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
/** `invalidate`'s options, which it requires: `list: 'all'` marks every listing under the labelpath stale. */
export type MinderInvalidateOpts = Z.input<typeof MinderChecks.minderInvalidateOpts>
/** The parts of a {@link Bank} a minder uses: its scope, its ask builders, and where trouble no caller waits on goes. */
export type MinderFriend     = Pick<Bank, 'scope' | 'rootBox' | 'makeGetAsk' | 'makeListAsk' | 'tellBadNews'>
// --

// == [The car]: ThingCar, BankCar, BoxCar, GateCar, ThingAt, CarAt, DeliverableThing, carLivenessVals

// The vaultDB has a newer whole record when liveness is 'bhnd' or 'bare' (dbHasNewer).
/** A ThingMinder's cache value for a Thing, deeply frozen: among records we've seen, carries its newest (perhaps sparse), and its fullest (perhaps null, or undefined for "exists, but nothing useful cached").
 * - `newest` is always a record: full, sparse, the void sentinel when void, or a deleted Thing's tombstone when gone.
 * - `fullest` is null when gone or void, and undefined when bare. It stands for the *record* `fullest ?? newest`.
 * - Both records have identical scope and lifepath. (This implies a car with a newer lifepath should always replace the other.)
 * - On `full`, the two are *identical* (`newest === fullest`): the same object, not just the same content.
 * - When `bhnd`, `fullest` is of a strictly earlier revision: `newest.revseq > fullest.revseq`.
 */
export type ThingCar<RecordT extends Sparse<ThingRecord>> = Readonly<(
  | { liveness: 'full', newest: RecordT,            fullest: RecordT   } // the same record in both. dbHasNewer: false
  | { liveness: 'bhnd', newest: Sparse<RecordT>,    fullest: RecordT   } // fullest is strictly older. Newest is strictly Sparse (not full, not gone, not void). dbHasNewer: true
  | { liveness: 'bare', newest: Sparse<RecordT>,    fullest: undefined } // never fetched a whole record; newest is strictly sparse. dbHasNewer: true
  | { liveness: 'gone', newest: Tombstone<RecordT>, fullest: null      } // a deleted Thing's tombstone: known to be gone. dbHasNewer: false
  | { liveness: 'void', newest: VoidSentinel,       fullest: null      } // a shell:     known to be void. dbHasNewer: false
) & {
  /** A string that compares as the car's age: of two cars of one Thing, the newer has the greater agerank.
   * Two cars with the same revisions and liveness have equal ageranks.
   */
  agerank: string
}>

/** The car of the bank's Thing. */
export type BankCar = ThingCar<BankRecord>
/** The car of a box. */
export type BoxCar  = ThingCar<BoxRecord>
/** The car of a gate. */
export type GateCar = ThingCar<GateRecord>

/** The kind of Thing stored at `LabelpathT`, read from its modelkind, or any Thing for a labelpath not known when compiled. */
export type ThingAt<LabelpathT extends Labelpath> =
  LabelpathT extends 'gate' | `gate/${string}` ? GateRecord
    : LabelpathT extends BoxLabelpath ? BoxRecord
      : LabelpathT extends 'bank' ? BankRecord
        : ThingRecord

/** The car of the Thing stored at `LabelpathT` ({@link ThingAt}). */
export type CarAt<LabelpathT extends Labelpath> = ThingCar<ThingAt<LabelpathT>>

/** A record a car is made from: a Thing, whole or sparse, or the void sentinel. */
export type DeliverableThing = ThingRecord | Sparse<ThingRecord> | VoidSentinel

/** Each `liveness` a car may have. */
export const carLivenessVals = ['full', 'bhnd', 'bare', 'gone', 'void'] as const
// --

// == [A minder's answers]: GotAnswer, CarFreshness, TSQGotAnswer, TSQAnswer, ScopeAt

// `val` is undefined under `vacant` and `untimely`, where the cache knows nothing timely; null under `gotvoid`, where storage has nothing.
// A timely car is full, gone or void: a bhnd or bare car is never timely.
/** A get's answer, read from the cache. Beside a get's own acts:
 * - `vacant`   -- nothing is cached
 * - `untimely` -- the car is `bhnd` or `bare`, or TanStack Query counts it stale under `staleTime`: older than it, or its last get refused
 */
export type GotAnswer<RecordT extends ThingRecord = ThingRecord> = (
  | GoodAnswer<RecordT, 'gotlive'>
  | GoodAnswer<Tombstone<RecordT>, 'gotgone'>
  | GoodAnswer<null, 'gotvoid'>
  | { ok: true, ask: LoggableAsk, act: 'vacant' | 'untimely', world: null, val: undefined }
) & { ask: GetAsk }

/** The car cached for a scope, however old, and the state of its gets. */
export interface CarFreshness<RecordT extends ThingRecord = ThingRecord> {
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
export type TSQGotAnswer<RecordT extends ThingRecord = ThingRecord> = GotAnswer<RecordT> & CarFreshness<RecordT>

/** `tryAt`'s answer: a {@link TSQGotAnswer}, or a refusal. */
export type TSQAnswer<RecordT extends ThingRecord = ThingRecord> = TSQGotAnswer<RecordT> | BadAnswer

/** A scope whose labelpath is `LabelpathT`, which types the car a minder answers for it ({@link ThingAt}). */
export type ScopeAt<LabelpathT extends Labelpath> = ThingScope & Readonly<{ labelpath: LabelpathT }>
// --

// == [What a listener is told]: MinderEvent, ThingEvent, ListingEvent, MinderEventOf

// Each event spreads TanStack Query's cache event into our own, under TanStack's field names (`type`, `action.type`,
// `state`) so that a reader who knows its events reads ours. A change to this shape bumps ThingFormat, which `listen` takes.
/** An event a minder's `listen` tells: a car's query changed, or a listing's. {@link ThingMinder.isThingEvent} tells them apart. */
export type MinderEvent = ThingEvent | ListingEvent

/** The fields every minder event carries: TanStack Query's cache event, less its live query, and the scope of the Thing it is about. */
export type MinderEventOf<DataT> = Readonly<{
  /** `'updated'` when the query's state changed, `'removed'` when the cache dropped the query. */
  type:      'updated' | 'removed'
  /** The action that changed the state, by TanStack's name for it, or undefined for a removal:
   * - `'success'`    -- a record arrived
   * - `'error'`      -- a get was refused
   * - `'invalidate'` -- a listing was marked stale
   */
  action:    Readonly<{ type: 'success' | 'error' | 'invalidate' }> | undefined
  /** The key the query is cached under, frozen. A host caching the same value may use the same key. */
  queryKey:  TSQ.QueryKey
  /** A frozen shallow copy of the query's state: `data`, `dataUpdatedAt`, `error`, `isInvalidated`, `status` and the rest.
   * `data` is the same object until it changes, and undefined after a removal.
   */
  state:     Readonly<TSQ.QueryState<DataT>>
  /** The user of the bank. */
  userid:    Userid
  /** The bank. */
  banklabel: Banklabel
  /** Where the Thing is stored in its bank: the Thing a car is of, or whose children a listing lists. */
  labelpath: Labelpath
}>

/** A car's query changed. `state.data` is the car as now cached, or undefined where none is (it is removed, or its first get was refused). Its `modelkind` types its car.
 * It also carries the car's `agerank` and its newest record's revision and life, each undefined where no car is cached.
 */
export type ThingEvent<KindT extends Thingkind = Thingkind> = KindT extends Thingkind ? MinderEventOf<ThingCar<RecordOfKind<KindT>>> & Readonly<{
  /** The modelkind of the Thing, which its labelpath starts with. */
  modelkind: KindT
  /** The car's agerank: of two events of one Thing, the greater agerank tells the newer car. */
  agerank:   string | undefined
  /** The revtok of the car's newest record. */
  revtok:    Revtok | undefined
  /** The revseq of the car's newest record. */
  revseq:    number | undefined
  /** The am of the car's newest record: `'x'` where the Thing is deleted or void. */
  am:        DeliverableThing['am'] | undefined
  /** The lifeseq of the car's newest record. */
  lifeseq:   Lifeseq | undefined
  /** The lifepath of the car's newest record. */
  lifepath:  Lifepath | undefined
}> : never

/** A listing's query changed. `state.data` is the labelpaths it now lists, in labelpath order, or undefined once removed.
 * The array stays the same object until a labelpath joins. A listing marked stale has `state.isInvalidated` true, and still lists what it did.
 */
export type ListingEvent = MinderEventOf<readonly Labelpath[]> & Readonly<{
  /** The modelkind of the Thing at `labelpath` and of every Thing listed, which is the same: a labelpath starts with its parent's. */
  modelkind: Thingkind
}>
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
