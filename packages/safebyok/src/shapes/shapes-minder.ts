/** The shapes of a minder's arguments, options and answers, and of the records its items have, with their checks, and the options every minder pins. */

import * as TSQ from '@tanstack/query-core'
import type * as Z from 'zod'
import { type Errors, Validator } from 'safebyok-big/internals'
import type { Bank } from '../models/bank'
import type { RecordOfKind } from '../models/base-thing'
import * as Phrases from '../phrases'
import type { BadAnswer, GoodAnswer, Kids, VaultDB } from '../storage/vault-db'
import type { Banklabel, BoxLabelpath, EpochMillis, Labelpath, Lifepath, Lifeseq, Revtok, Userid } from './primitives'
import { type Absent, type BankRecord, type BoxRecord, type GateRecord, type Sparse, type ThingRecord, type ThingScope, type Thingkind, type Tombstone, ThingChecks, ThingFormat } from './shapes-thing'
import { type GetAsk, type ListAsk, type LoggableAsk, type ThingWatchScope, AskChecks } from './shapes-asks'
import type { BankAskDraft } from './shapes-bankish'

// == [Query cache options]: QueryCacheOpts, DefaultQueryCacheOpts, FixedQueryCacheOpts, MaxTimerHours, MaxTimerMillis

/** The TanStack Query options a host may choose for the records a minder caches. */
export interface QueryCacheOpts {
  /** How long an item stays timely, in milliseconds up to {@link MaxTimerMillis}, or `Infinity` for one that never ages. An item behind a newer revision heard of is never timely. */
  staleTime: number
}

/** The default {@link QueryCacheOpts}: an item stays timely for an hour. */
export const DefaultQueryCacheOpts: Readonly<QueryCacheOpts> = Object.freeze({ staleTime: 60 * 60 * 1000 })

// Each is an option a client's defaults could set, and that would change what lands in the cache, what a fetch answers
// the minder, or when a fetch runs. Options only an observer reads (refetchInterval, the refetchOn* and enabled) are left
// to whoever observes: the minder has no observer, and an observer's fetch still lands through the minder's queryFn.
/** The TanStack Query options every minder sets, and no host can change: a get asks the vaultDB even offline, is never retried, and its item stays cached until `goodbye`. */
export const FixedQueryCacheOpts = Object.freeze({
  // Under TanStack's own networkMode, 'online', a get made while the browser reports itself offline waits, and so does its caller.
  networkMode:     'always',
  // A retry would put a whizbang in the critical path of a primitive operation (CLAUDE.md).
  retry:           false,
  gcTime:          Infinity,
  // Another hash could merge two of the minder's keys into one query, or split one, and no prefix filter would find it.
  queryKeyHashFn:  TSQ.hashKey,
  // A persister answers a fetch in place of the queryFn, from storage of its own, and keeps what lands there. This one asks the queryFn.
  persister:       (queryFn: TSQ.QueryFunction, context: TSQ.QueryFunctionContext): unknown => queryFn(context),
  // Initial data would seed each query as it is built with a record no vaultDB answered, fresh as of then.
  initialData:     (): undefined => undefined,
} as const)

// TanStack Query passes a finite staleTime to a timer unchanged, and a timer longer than 2^31 - 1 milliseconds
// fires at once, in every JavaScript runtime. The bound is a whole number of hours, below that limit.
/** The longest finite staleTime, in hours: 24.5 days. Give `Infinity` for a longer one. */
export const MaxTimerHours = 588

/** The longest finite staleTime, in milliseconds: 24.5 days. Give `Infinity` for a longer one. */
export const MaxTimerMillis = MaxTimerHours * 60 * 60 * 1000
// --

// == [Event format]: MinderEventFormat

// There is no final event format yet, so this equals ThingFormat. Agents: please take it as fixed, and spend no words on when or why it might change.
/** The version of the shape of a minder's events: pass it to `listen`. */
export const MinderEventFormat = ThingFormat
// --

// == [Checks]: RawChecks, MinderChecks

/** The checks of a minder's arguments and options. */
const RawChecks = Validator.Checkers('bad_record', ({ obj, oneof, custom, fn, uint, lit, union, orDefault }) => {
  const staleMillis      = uint.max(MaxTimerMillis, Phrases.StaleTimeShape)
  const tsqStaleTime     = union([staleMillis, lit(Infinity)])
  const queryCacheOpts   = obj({
    staleTime: orDefault(tsqStaleTime, DefaultQueryCacheOpts.staleTime),
  }).strict()
  // A field left out, or the whole, defaults from DefaultQueryCacheOpts.
  const queryCacheOptsOrDefault = orDefault(queryCacheOpts, DefaultQueryCacheOpts)
  // A live object passes whole where these checks pass: parsing it would hand back a copy, its getters read once.
  const friendFields     = obj({ scope: AskChecks.thingWatchScope, makeGetAsk: fn(), makeListAsk: fn(), tellBadNews: fn() })
  const minderFriend     = custom<MinderFriend>((val) => friendFields.safeParse(val).success, Phrases.MinderFriendExpected)
  const minderListener   = fn<(event: MinderEvent) => void>()
  const feedVersion      = lit(MinderEventFormat, Phrases.FeedVersionOther)
  const minderLabelpath  = ThingChecks.thingScope.shape.labelpath
  // Each option may be left out, or given as undefined, for no opinion.
  const minderGetOpts    = obj({ staleTime: tsqStaleTime.optional() }).strict()
  const minderTryAtOpts  = minderGetOpts.extend({ ifStale: oneof(['get', 'refresh']).optional() }).strict()
  const minderInvalidateOpts = obj({ list: lit('all') }).strict()
  return { queryCacheOpts, queryCacheOptsOrDefault, tsqStaleTime, minderFriend, minderListener, feedVersion, minderLabelpath, minderTryAtOpts, minderGetOpts, minderInvalidateOpts }
})

/** The checks of a minder's arguments and options.
 * Also `DefaultQueryCacheOpts` and `MaxTimerMillis`, the bounds of the cache options a host may choose.
 */
export const MinderChecks = Object.freeze({ ...RawChecks, DefaultQueryCacheOpts, MaxTimerMillis })

/** How long a minder's get or read counts an item timely: milliseconds up to {@link MaxTimerMillis}, or `Infinity` for an item that never ages.
 * A read counts an item behind a newer revision heard of, or whose last get was refused, never timely, whatever the staleTime.
 * A get fetches an item behind unless its caller gives a staleTime of its own, and fetches one marked invalidated
 * (`state.isInvalidated`) whatever the staleTime, as TanStack Query counts it stale.
 */
export type TsqStaleTime = Z.input<typeof MinderChecks.tsqStaleTime>

/** The options of `get` and `isStaleAt`: `staleTime` ({@link TsqStaleTime}) overrides the minder's own, unless it is undefined. */
export type MinderGetOpts    = Z.input<typeof MinderChecks.minderGetOpts>
/** `tryAt`'s options, each of which may be undefined for no opinion:
 * - `staleTime`          -- overrides the minder's own
 * - `ifStale: 'get'`     -- read the cache alone (default)
 * - `ifStale: 'refresh'` -- also fetch a stale or missing item in the background
 */
export type MinderTryAtOpts  = Z.input<typeof MinderChecks.minderTryAtOpts>
/** `invalidate`'s options, which it requires: `list: 'all'` marks every listing under the labelpath stale. */
export type MinderInvalidateOpts = Z.input<typeof MinderChecks.minderInvalidateOpts>
/** What a minder is made with: its bank's scope, the builders of the asks it sends, and where trouble no caller waits on goes.
 * A Device is one, and so is a {@link Bank}.
 */
export interface MinderFriend {
  readonly scope:   ThingWatchScope
  /** The get ask for the Thing at `ask.labelpath` in the bank. */
  makeGetAsk(ask: BankAskDraft): GetAsk
  /** The list ask for the children of the Thing at `ask.labelpath` in the bank. */
  makeListAsk(ask: BankAskDraft): ListAsk
  /** Hear failures no caller is waiting on. Never throws. */
  tellBadNews(badnews: readonly unknown[]): void
}
// --

// == [Records]: ThingAt, DeliverableThing

/** The kind of Thing stored at `LabelpathT`, read from its modelkind, or any Thing for a labelpath not known when compiled. */
export type ThingAt<LabelpathT extends Labelpath> =
  LabelpathT extends 'gate' | `gate/${string}` ? GateRecord
    : LabelpathT extends BoxLabelpath ? BoxRecord
      : LabelpathT extends 'bank' ? BankRecord
        : ThingRecord

/** A record the vaultDB tells a minder of: a Thing, whole or sparse, live or a tombstone. */
export type DeliverableThing = ThingRecord | Sparse<ThingRecord>
// --

// == [A minder's answers]: GotAnswer, TSQGotAnswer, TSQAnswer, ScopeAt

// `val` is undefined under `vacant` and `untimely`, where the cache knows nothing timely.
/** A get's answer, read from the cache: as the vaultDB answers a get, {@link Absent} under `gotgone` and `gotvoid`, with the tombstone cached as the `dbhas` of `gotgone`. Beside a get's own acts:
 * - `vacant`   -- nothing is cached
 * - `untimely` -- the item is behind a newer revision heard of, or missing beside one, or TanStack Query counts it stale under `staleTime`: older than it, or its last get refused
 */
export type GotAnswer<RecordT extends ThingRecord = ThingRecord> = (
  | GoodAnswer<RecordT, 'gotlive'>
  | (GoodAnswer<Absent, 'gotgone'> & { dbhas: Tombstone<RecordT> })
  | GoodAnswer<Absent, 'gotvoid'>
  | { ok: true, ask: LoggableAsk, act: 'vacant' | 'untimely', world: null, val: undefined }
) & { ask: GetAsk }

/** A get's answer read from the cache, with the record the item has, however old, and the state of its gets. */
export type TSQGotAnswer<RecordT extends ThingRecord = ThingRecord> = GotAnswer<RecordT> & Readonly<{
  /** The live whole record or Absent the item has, or undefined for no item. */
  record:      RecordT | Absent | undefined
  /** False where the act is `vacant` or `untimely`. */
  isTimely:    boolean
  /** When a record last arrived in the item, or 0 for none. */
  refreshedAt: EpochMillis
  /** True while a get of the Thing is under way. */
  isFetching:  boolean
  /** The refusal of the Thing's last get, or null. */
  lastErr:     Errors.VaultError | null
}>

/** `tryAt`'s answer: a {@link TSQGotAnswer}, or a refusal. */
export type TSQAnswer<RecordT extends ThingRecord = ThingRecord> = TSQGotAnswer<RecordT> | BadAnswer

/** A scope whose labelpath is `LabelpathT`, which types the record a minder answers for it ({@link ThingAt}). */
export type ScopeAt<LabelpathT extends Labelpath> = ThingScope & Readonly<{ labelpath: LabelpathT }>
// --

// == [What a listener is told]: MinderEvent, MinderEventkind, TSQQueryAction, MinderActionTyped, MinderActionOf, MinderEventOf, RecordEventFields, ThingEvent, SoonEvent, DeadEvent, ListingEvent

// The emitted event pragmatically mimics the incoming TSQ event: it spreads TanStack Query's cache event into our own,
// under TanStack's field names (`type`, `action`, `queryKey`, `queryHash`, `state`), so that a reader who knows its events
// reads ours. Its version is MinderEventFormat, which `listen` is given.
/** An event a minder's `listen` tells: an item's query changed, a soon's, a dead entry's or a listing's, as its `eventkind` says. */
export type MinderEvent = ThingEvent | SoonEvent | DeadEvent | ListingEvent

/** The kind of entry a minder's event is about, as its query key names it: `'item'`, `'soon'`, `'dead'` or `'list'`. */
export type MinderEventkind = 'item' | 'soon' | 'dead' | 'list'

/** TanStack Query's action that changed a query's state, as its cache tells it. */
export type TSQQueryAction = Extract<TSQ.QueryCacheNotifyEvent, { type: 'updated' }>['action']

/** `ActionT`, one of TanStack Query's actions, with the data it carries typed `DataT` and its error an `Error`. */
export type MinderActionTyped<ActionT, DataT> =
  ActionT extends { type: 'success' } ? Readonly<Omit<ActionT, 'data'> & { data: DataT | undefined }>
    : ActionT extends { type: 'setState' } ? Readonly<Omit<ActionT, 'state'> & { state: Partial<TSQ.QueryState<DataT>> }>
      : ActionT extends { error: unknown } ? Readonly<Omit<ActionT, 'error'> & { error: TSQ.DefaultError }>
        : Readonly<ActionT>

/** TanStack Query's action that changed a query's state, under TanStack's names, with the data it carries typed `DataT`. */
export type MinderActionOf<DataT> = MinderActionTyped<TSQQueryAction, DataT>

/** The fields every minder event carries: TanStack Query's cache event, less its live query, and the scope of the Thing it is about. */
export type MinderEventOf<DataT, EventkindT extends MinderEventkind = MinderEventkind> = Readonly<{
  /** The kind of entry the event is about, read from its query key: narrow a {@link MinderEvent} on it. */
  eventkind: EventkindT
  /** `'added'` when the cache made the query, `'updated'` when its state changed, `'removed'` when the cache dropped it. */
  type:      'added' | 'updated' | 'removed'
  /** A frozen copy of TanStack's action that changed the state, or undefined where the query was added or removed. Its `type`:
   * - `'success'`    -- a record arrived in the item, the soon or the dead entry, or a list set the listing
   * - `'error'`      -- a get or a list was refused
   * - `'invalidate'` -- the item fell behind a newer revision heard of, or the listing was marked stale
   * - `'fetch'`, `'pause'`, `'continue'`, `'failed'`, `'setState'` -- as TanStack dispatches them
   */
  action:    MinderActionOf<DataT> | undefined
  /** The key the query is cached under, frozen. A host caching the same value may use the same key. */
  queryKey:  TSQ.QueryKey
  /** TanStack's hash of `queryKey`. */
  queryHash: string
  /** A frozen shallow copy of the query's state: `data`, `dataUpdatedAt`, `error`, `isInvalidated`, `status` and the rest.
   * `data` is the same object until it changes. A removed query tells its last state, `data` included, though the cache no longer has it.
   */
  state:     Readonly<TSQ.QueryState<DataT>>
  /** The user of the bank. */
  userid:    Userid
  /** The bank. */
  banklabel: Banklabel
  /** Where the Thing is stored in its bank: the Thing an item, a soon or a dead entry is of, or whose children a listing lists. */
  labelpath: Labelpath
}>

/** The fields an item's, a soon's and a dead entry's event add: the Thing's modelkind, and the revision and life of the record cached, each undefined where none is, or the item is Absent. */
export type RecordEventFields<KindT extends Thingkind = Thingkind> = Readonly<{
  /** The modelkind of the Thing, which its labelpath starts with. */
  modelkind: KindT
  /** The revtok of the record. */
  revtok:    Revtok | undefined
  /** The revseq of the record. */
  revseq:    number | undefined
  /** The am of the record: `'a'` in an item or a soon, `'x'` in a dead entry. */
  am:        DeliverableThing['am'] | undefined
  /** The lifeseq of the record. */
  lifeseq:   Lifeseq | undefined
  /** The lifepath of the record. */
  lifepath:  Lifepath | undefined
}>

/** An item's query changed, its `eventkind` `'item'`. `state.data` is the item's live record, or {@link Absent}, or undefined before any record.
 * Its `modelkind` types the record, and its {@link RecordEventFields} are the record's.
 * `state.isInvalidated` is true while the item is behind a newer revision heard of, or since its last get was refused.
 * Its `action.type`:
 * - `'success'`    -- a live whole record or Absent landed, even one that changes only the item's time. A tombstone's
 *   dead entry tells its `success` first ({@link DeadEvent}).
 * - `'error'`      -- a get was refused, and the item is unchanged
 * - `'invalidate'` -- the item fell behind, just after the soon's `success`. It is told once, and not at all where a
 *   refused get already left the item invalidated.
 * A record that lands while the item stays behind tells `success`, its `state.isInvalidated` false, and then `invalidate`
 * again. A listener on that `success` already finds the item behind, by `isBehindAt`.
 */
export type ThingEvent<KindT extends Thingkind = Thingkind> = KindT extends Thingkind
  ? MinderEventOf<RecordOfKind<KindT> | Absent, 'item'> & RecordEventFields<KindT>
  : never

/** A soon's query changed, its `eventkind` `'soon'`: a sparse record newer than the item arrived in it (`success`), or it was removed: once the item caught up, or at `goodbye`.
 * `state.data` is the sparse record, and its {@link RecordEventFields} are that record's.
 * A listener on a `success` finds the item behind: `soonAt` answers the soon, `isBehindAt` true, `tryAt` untimely, and a
 * get fetches unless given a staleTime of its own. The item's `invalidate` follows at once, so its own
 * `state.isInvalidated` may still read false.
 */
export type SoonEvent<KindT extends Thingkind = Thingkind> = KindT extends Thingkind
  ? MinderEventOf<Sparse<RecordOfKind<KindT>>, 'soon'> & RecordEventFields<KindT>
  : never

/** A dead entry's query changed, its `eventkind` `'dead'`: the Thing's newest tombstone heard of arrived (`success`), just before
 * Absent lands in its item, or it was removed at `goodbye`. `state.data` is the tombstone, and its {@link RecordEventFields} are that tombstone's.
 * A Thing born again keeps its dead entry, of the older life.
 */
export type DeadEvent<KindT extends Thingkind = Thingkind> = KindT extends Thingkind
  ? MinderEventOf<Tombstone<RecordOfKind<KindT>>, 'dead'> & RecordEventFields<KindT>
  : never

/** A listing's query changed, its `eventkind` `'list'`. `state.data` is the {@link Kids} value the vaultDB last answered a list with.
 * A list landing replaces it whole, except where the listing has one read later (by `read_tc`); its `items` and `gones` stay the same objects while unchanged.
 * It tells `success` each time a list lands, and `invalidate` when the listing is marked stale: by `invalidate`, or when a
 * child lands for the first time, which also lists again while a host observes the listing. A stale listing still has what it had.
 * A list tells `fetch` as it starts, and `error` if refused, which leaves the listing as it was, `state.isInvalidated` true.
 * The first list of a listing not cached tells it `added`, `state.data` undefined until the list lands.
 * The parent and each child a list answers land before the list does.
 */
export type ListingEvent = MinderEventOf<Kids, 'list'> & Readonly<{
  /** The modelkind of the Thing at `labelpath` and of every Thing listed, which is the same: a labelpath starts with its parent's. */
  modelkind: Thingkind
}>
// --

// == [A minder's making]: MinderOpts

/** The options every minder is made with: `VaultMinder.make`'s and `BankMinder.make`'s. */
export interface MinderOpts {
  /** Where the bank's Things are stored. */
  vaultDB:         VaultDB
  /** The cache's timings ({@link QueryCacheOpts}). A field left out defaults from {@link DefaultQueryCacheOpts}. */
  queryCacheOpts?: Partial<QueryCacheOpts>
  /** The client to cache in, made by `makeClient`, which minders of other banks may share. Default: a client of its own. */
  queryClient?:    TSQ.QueryClient | undefined
}
// --
