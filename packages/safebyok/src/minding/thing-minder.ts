// The ThingMinder is an exemplar at both of its ends. Its interface is the minder as we would design it for the layer in
// front of it: scopes, records, cars, acts and refusals, in our vocabulary. Its implementation shows TanStack Query used as
// its authors intend: each need is met by the feature TanStack built for that job (query defaults, structural sharing,
// the error state, the cache's events), chosen because it fits, not because it was nearest to hand.
// Where a ruling, a design note or this code seems to serve one end at the other's expense, report it rather than split
// the difference.

/** `ThingMinder`, which minds every Thing in one bank in a TanStack Query cache of its own. */

import * as TSQ from '@tanstack/query-core'
import { noop, union } from 'es-toolkit'
import { Outcome, Validator } from 'safebyok-big/internals'
import { type Banklabel, type Userid, Labelpath } from '../shapes/primitives'
import { type ThingRecord, type ThingScope, type VoidSentinel, Shell, ThingChecks } from '../shapes/shapes-thing'
import { Thing } from '../models/thing'
import { type GetAsk, type ThingWatchScope, loggableAskOf } from '../shapes/shapes-asks'
import type { ThingNotice, VaultDB } from '../storage/vault-db'
import {
  type CarAt, type CarFreshness, type DeliverableThing, type GotAnswer, type MinderEvent, type MinderFriend, type MinderGetOpts, type MinderOpts, type MinderTryAtOpts,
  type QueryCacheOpts, type ScopeAt, type TSQAnswer, type TSQGotAnswer, type ThingAt, type ThingCar, type ThingEvent, type TsqStaleTime, type ListingEvent,
  FixedQueryCacheOpts, MinderChecks,
} from '../shapes/shapes-minder'
import { bestCarOf, carOf, dbHasNewer } from './thing-car'
import * as Throwers from '../refusals/throwers'

/** One bank's Things as best known on this device, a car for each, from all the vaultDB has said of them, and a listing of
 * the children of each Thing listed.
 * Three sources tell it of a Thing, in any order, late or more than once: a get's answer (the whole record, or the
 * Thing's shell where nothing is stored), the watch's notice of each write, and a list's sparse record. Each lands
 * in the Thing's car through one merge, and adds the Thing to its parent's listing, where one is cached. A list sets
 * the parent's listing. It caches only from `hello` until `goodbye`, and `goodbye` empties its cache.
 *
 * ## Invariants
 * - For a caller or listener using the library as documented, what it shows depends only on which records the minder
 *   has heard of, never on the order they arrived in.
 * - The order records arrive in never changes a car's liveness, or the revisions it carries.
 * - A car never goes back: it carries the newest revision any source has told of, and a newer life replaces an older one whole.
 * - A sparse live record never displaces a whole live record of the same life: it leaves the car `behind`, its fullest
 *   still a record. A sparse record of a newer life makes the car `bare`, its fullest undefined. Either way, the next
 *   get fetches the newest whole.
 * - A get answered with a revision older than the car it began with changes nothing in the cache, and refuses `stale_read`.
 * - A listing never drops a labelpath: a list adds what it answers, and each record that lands adds its own. So once a
 *   listing is cached, what it lists depends only on which records arrived, never on their order.
 * - A listing is the same array until a labelpath joins it.
 * - A listing lists only Things the vaultDB has stored, tombstones included, never a shell. It lists by labelpath alone:
 *   when the parent's life changes, it keeps the earlier life's children beside the new life's.
 * - A record that lands while its parent has no listing cached joins none: the parent's next list lists it.
 */
export class ThingMinder {
  // == [Props]: userid, banklabel, #bank, #vaultDB, #tsq, #queryCacheOpts, #unwatch, #isReady
  readonly userid:    Userid
  readonly banklabel: Banklabel
  readonly #bank:           MinderFriend
  readonly #vaultDB:        VaultDB
  readonly #tsq:            TSQ.QueryClient
  readonly #queryCacheOpts: Readonly<QueryCacheOpts>
  #unwatch: (() => void) | null = null
  /** True while minding: from `hello` until `goodbye`. */
  #isReady = false
  // --

  // == [Construction]: make, constructor, #makeTSQ

  /** Make a minder of every Thing in `bank`. It does nothing until `hello`. */
  static make(opts: MinderOpts, bank: MinderFriend): ThingMinder {
    const checked = Checks.minderMakeArgs.parse({ opts, bank })
    return new ThingMinder(checked.opts, checked.bank)
  }

  private constructor(opts: MinderOpts & { queryCacheOpts: QueryCacheOpts }, bank: MinderFriend) {
    const { userid, banklabel } = bank.scope
    this.userid          = userid
    this.banklabel       = banklabel
    this.#bank           = bank
    this.#vaultDB        = opts.vaultDB
    this.#queryCacheOpts = Object.freeze(opts.queryCacheOpts)
    this.#tsq            = this.#makeTSQ()
    Object.freeze(this)
  }

  /** The QueryClient whose cache holds this minder's cars, its query defaults set. */
  #makeTSQ(): TSQ.QueryClient {
    const tsq = new TSQ.QueryClient({ defaultOptions: { queries: {
      ...this.#queryCacheOpts,
      ...FixedQueryCacheOpts,
      staleTime:         staleTimeFnOf(this.#queryCacheOpts.staleTime),
      queryFn:           ({ queryKey }) => this.#fetchCar(this.#askAt(this.#scopeOfQueryKey(queryKey))),
      structuralSharing: bestCarOf,
    } } })
    // The root box's car stays, whatever the host's gcTime: its own query key's defaults reach no box under it.
    tsq.setQueryDefaults(this.queryKey(this.#rootBoxScope), { gcTime: Infinity })
    return tsq
  }
  // --

  // == [Starting and ending]: hello, goodbye

  /** Start minding: until `goodbye`, answer gets, and cache each change the vaultDB tells of. A second call does nothing. */
  hello(): void {
    if (this.#isReady) { return }
    this.#isReady = true
    this.#unwatch = this.#vaultDB.watch(
      this.scope,
      (notice: ThingNotice) => { this.#sendToTSQ(notice.val) },
      (news)                => { this.#bank.tellBadNews([news]) },
    )
  }

  /** Stop minding, and empty the cache. A get still waiting refuses `disabled`. A later `hello` starts minding again. */
  goodbye(): void {
    this.#isReady = false
    if (this.#unwatch) { this.#unwatch() }
    this.#unwatch = null
    this.#tsq.clear()
  }
  // --

  // == [Reading]: at, listingAt, tryAt, get, list, isStaleAt, listen

  /** The cached car for `scoped`, however old, or undefined for none. Never asks the vaultDB. */
  at<LabelpathT extends Labelpath>(scoped: ScopeAt<LabelpathT>): CarAt<LabelpathT> | undefined {
    return this.#cachedAt(this.#demandOwnScope(scoped)) as CarAt<LabelpathT> | undefined
  }

  /** The cached listing of `scoped`'s children, however old, or undefined for none. Never asks the vaultDB. */
  listingAt(scoped: ThingScope): readonly Labelpath[] | undefined {
    return this.#tsq.getQueryData<readonly Labelpath[]>(this.listingQueryKey(this.#demandOwnScope(scoped)))
  }

  /** The cache's answer for `scoped`, without waiting on the vaultDB.
   * A car that is not timely answers `untimely`, with no `val`.
   * Under `ifStale: 'refresh'`, it also fetches a stale or missing car in the background ({@link MinderTryAtOpts}).
   */
  tryAt<LabelpathT extends Labelpath>(scoped: ScopeAt<LabelpathT>, opts: MinderTryAtOpts = {}): TSQAnswer<ThingAt<LabelpathT>> {
    try {
      MinderChecks.minderTryAtOpts.parse(opts)
      this.#demandReady()
      const scope = this.#demandOwnScope(scoped)
      if (opts.ifStale === 'refresh') { this.#backgroundRefresh(scope, opts) }
      return this.#answerOfTSQ(this.#askAt(scope), opts) as TSQGotAnswer<ThingAt<LabelpathT>>
    } catch (err) {
      return { ok: false, ask: loggableAskOf({ ...scoped, op: 'get', ifAbsent: 'nil' }), act: 'unclassified_storing', world: null, dbhas: null, err: Outcome.storageRefusalOf(err) }
    }
  }

  /** Get `scoped`'s car: the cached one if timely, else from the vaultDB. A get already under way is shared.
   * Refuses `stale_read` when the vaultDB answers with a revision older than one cached when the get began. A later get asks again.
   * With no root car cached, a get of a box the vaultDB has nothing for refuses: get the root box first.
   */
  async get<LabelpathT extends Labelpath>(scoped: ScopeAt<LabelpathT>, opts: MinderGetOpts = {}): Promise<CarAt<LabelpathT>> {
    MinderChecks.minderGetOpts.parse(opts)
    this.#demandReady()
    return await this.#doGet(this.#demandOwnScope(scoped), opts) as CarAt<LabelpathT>
  }

  /** List the Things directly under the Thing at `labelpath`, in labelpath order, tombstones included.
   * Each joins the Thing's listing ({@link listingAt}), which keeps every labelpath it had. Each record is cached sparse.
   * Where that leaves a car `behind` or `bare`, the next get fetches it whole. A deleted Thing's car is `gone`, and
   * answers from the cache.
   */
  async list(labelpath: Labelpath): Promise<Labelpath[]> {
    MinderChecks.minderLabelpath.parse(labelpath)
    this.#demandReady()
    const answer = await this.#vaultDB.tryListThings(this.#bank.makeListAsk({ labelpath, ifAbsent: 'nil' }))
    if (! answer.ok) { throw answer.err }
    const labelpaths = answer.val.map((record) => record.labelpath)
    TSQ.notifyManager.batch(() => {
      this.#sendListingToTSQ({ ...this.scope, labelpath }, labelpaths)
      for (const record of answer.val) { this.#sendToTSQ(record) }
    })
    return labelpaths
  }

  /** True when `scoped`'s car is missing or not timely. */
  isStaleAt(scoped: ThingScope, opts: MinderGetOpts = {}): boolean {
    MinderChecks.minderGetOpts.parse(opts)
    const carQuery = this.#tsqFind(this.#demandOwnScope(scoped))
    return (! isTimelyQuery(carQuery, opts.staleTime ?? this.#queryCacheOpts.staleTime))
  }

  /** Call `listener` with each change the cache tells of, as a {@link MinderEvent}. Returns the function that stops it.
   * It tells a `thing` event each time a record arrives in a car (even one that changes nothing), a get of it is refused,
   * or it is removed; and a `listing` event each time a list sets a listing (even to the labelpaths it had), a labelpath
   * joins it, or it is removed.
   * Nothing is called when a car ages past `staleTime`, and listening caches no car.
   * What `listener` throws goes to the bank's `tellBadNews`, and stops nothing.
   */
  listen(listener: (event: MinderEvent) => void): () => void {
    MinderChecks.minderListener.parse(listener)
    return this.#tsq.getQueryCache().subscribe((tsqEvent: unknown) => {
      const event = this.#minderEventOf(tsqEvent)
      if (event === undefined) { return }
      try {
        listener(event)
      } catch (err) {
        this.#bank.tellBadNews([Throwers.unexpectedError(err)])
      }
    })
  }
  // --

  // == [TSQ Direct Cache Calls]: #backgroundRefresh, #doGet, #fetchCar, #cachedAt, #tsqFind, #sendToTSQ, #sendListingToTSQ, #joinParentListing

  // Its refusal is cached beside the car, where the next tryAt finds it as `lastErr`.
  /** Fetch `scoped`'s car in the background, if it is stale. */
  #backgroundRefresh(scoped: ThingScope, opts: MinderGetOpts): void {
    void this.#doGet(scoped, opts).catch(noop)
  }

  /** `scoped`'s car: the cached one if timely within `opts.staleTime`, else from the vaultDB. Its Thing joins its parent's listing. */
  async #doGet(scoped: ThingScope, opts: MinderGetOpts): Promise<ThingCar<ThingRecord>> {
    let fetched: ThingCar<ThingRecord>
    try {
      fetched = await this.#tsq.query(this.#tsqQueryOptions(scoped, opts))
    } catch (err) {
      // TanStack cancels a get under way when goodbye empties the cache.
      throw (err instanceof TSQ.CancelledError) ? Throwers.minderNotStarted() : err
    }
    // TanStack resolves with what the queryFn returned, not what structural sharing kept: a notice that landed during the
    // get may have left the cache a later record.
    const car = this.#cachedAt(scoped) ?? fetched
    this.#joinParentListing(car.newest)
    return car
  }

  /** Fetch `ask`'s car from the vaultDB, made of its shell where storage has nothing.
   * Refuses `stale_read` for an answer older than the revision cached when it began.
   */
  async #fetchCar(ask: GetAsk): Promise<ThingCar<ThingRecord>> {
    // Held before asking: a record that lands while the get waits only makes its answer late (notes/wontfix.md).
    const prior  = this.#cachedAt(ask)
    const answer = await this.#vaultDB.tryGetThing(ask)
    if (! answer.ok) { throw answer.err }
    const record = answer.val ?? this.#shellAt(ask)
    // TanStack leaves the car and its time as they were, marks it invalidated, and caches the refusal beside it as its error.
    if ((prior !== undefined) && (Thing.cmp(prior.newest, record) < 0)) { throw Throwers.staleRead(ask) }
    return carOf(record)
  }

  /** The cached car for `scoped`, a scope in this minder's bank, or undefined for none. */
  #cachedAt(scoped: ThingScope): ThingCar<ThingRecord> | undefined {
    return this.#tsq.getQueryData<ThingCar<ThingRecord>>(this.queryKey(scoped))
  }

  /** The cache's query of `scoped`'s car, or undefined for none. */
  #tsqFind(scoped: ThingScope): TSQ.Query<ThingCar<ThingRecord>> | undefined {
    return this.#tsq.getQueryCache().find<ThingCar<ThingRecord>>({ queryKey: this.queryKey(scoped), exact: true })
  }

  // Every record that lands but a get's comes through here: TanStack lands a get's in the car itself.
  /** Send `record`'s car to TanStack, to merge into its cached car, and add it to its parent's listing, while minding. */
  #sendToTSQ(record: DeliverableThing): void {
    if (! this.#isReady) { return }
    this.#tsq.setQueryData(this.queryKey(record), carOf(record))
    this.#joinParentListing(record)
  }

  // TanStack matches query defaults by key prefix, and no prefix starts every listing's key and no car's, so each listing's
  // key gets defaults of its own: without them a listing would take the cars', and be fetched and merged as a car.
  // Under skipToken, TanStack never fetches the listing, and invalidating it only marks it stale.
  /** Set `scoped`'s listing to the labelpaths it had and `labelpaths`, while minding. */
  #sendListingToTSQ(scoped: ThingScope, labelpaths: readonly Labelpath[]): void {
    if (! this.#isReady) { return }
    const listingKey = this.listingQueryKey(scoped)
    this.#tsq.setQueryDefaults(listingKey, { queryFn: TSQ.skipToken, structuralSharing: stableListingOf, staleTime: this.#queryCacheOpts.staleTime })
    this.#tsq.setQueryData<readonly Labelpath[]>(listingKey, (prior) => listingOf(prior ?? [], labelpaths))
  }

  // Each record that lands joins its parent's listing here, whatever its source. An updater that answers undefined leaves
  // the cache as it was. A shell is stored nowhere, so it is no one's child; and a root's parent, '', is never listed.
  /** Add `record`'s labelpath to its parent's listing, where one is cached that lacks it. */
  #joinParentListing(record: DeliverableThing): void {
    if (Thing.isVoidSentinel(record)) { return }
    const parentKey = this.listingQueryKey({ ...record, labelpath: Labelpath.parentOf(record.labelpath) })
    this.#tsq.setQueryData<readonly Labelpath[]>(parentKey, (prior) => (
      ((prior === undefined) || prior.includes(record.labelpath)) ? undefined : listingOf(prior, [record.labelpath])
    ))
  }
  // --

  // == [TSQ Asks]: queryKey, listingQueryKey, subtreeQueryKey, #keyHeadOf, #tsqQueryOptions, #askAt, #shellAt

  // A key is the bank's three segments, the labelpath's labels with '/' between them, then a mark: '!' for the Thing's car,
  // '#' and 'kids' for its listing. Dropping the mark and putting '/' in its place makes a prefix that selects everything
  // under the Thing and neither of its own keys. No label is '!', '/' or '#', so no mark is mistaken for one. TanStack matches
  // query defaults by key prefix too, so without a mark the root box's key would start every box's key, and no defaults
  // could single out the root box. A labelpath starts with its modelkind, so the key does too.
  /** The query key `scoped`'s car is cached under. */
  queryKey(scoped: ThingScope): TSQ.QueryKey { return [...this.#keyHeadOf(scoped), '!'] }

  /** The query key the list of `scoped`'s children is cached under. */
  listingQueryKey(scoped: ThingScope): TSQ.QueryKey { return [...this.#keyHeadOf(scoped), '#', 'kids'] }

  /** The key prefix of everything cached under `scoped`, a car or a listing, and of neither of its own. */
  subtreeQueryKey(scoped: ThingScope): TSQ.QueryKey { return [...this.#keyHeadOf(scoped), '/'] }

  /** The part of a query key that `scoped` has in common with each of its keys. */
  #keyHeadOf(scoped: ThingScope): string[] {
    const labels = scoped.labelpath.split('/').flatMap((label) => ['/', label]).slice(1)
    return ['safebyok', this.userid, this.banklabel, ...labels]
  }

  // TanStack spreads these over the query defaults: a staleTime key given as undefined would put TanStack's 0 in place of the minder's own.
  /** TanStack's query options for a get of `scoped`'s car, with `opts.staleTime` where given, else the minder's query defaults' own. */
  #tsqQueryOptions(scoped: ThingScope, opts: MinderGetOpts): TSQ.QueryExecuteOptions<ThingCar<ThingRecord>> {
    const queryOpts = { queryKey: this.queryKey(scoped) }
    if (opts.staleTime === undefined) { return queryOpts }
    return { ...queryOpts, staleTime: staleTimeFnOf(opts.staleTime) }
  }

  /** The get ask the minder sends the vaultDB for `scoped`, a scope in this minder's bank. */
  #askAt(scoped: ThingScope): GetAsk {
    return this.#bank.makeGetAsk({ labelpath: scoped.labelpath, ifAbsent: 'nil' })
  }

  // Boxes are the only Things under a root, for now: one label under the root box.
  /** The shell at `scoped`. Below a root, it lives in the life of the bank's root box. */
  #shellAt(scoped: ThingScope): VoidSentinel {
    return scoped.labelpath.includes('/') ? Shell.of(scoped, this.rootBox) : Shell.of(scoped)
  }
  // --

  // == [Checks]: scope, rootBox, #rootBoxScope, #demandOwnScope, #demandReady, #scopeOfQueryKey

  /** The scope of this minder's bank. */
  get scope(): ThingWatchScope { return { userid: this.userid, banklabel: this.banklabel } }

  /** The bank's root box, the parent of every box: before the bank's birth, its shell. */
  get rootBox(): MinderFriend['rootBox'] { return this.#bank.rootBox }

  /** The scope of the bank's root box. */
  get #rootBoxScope(): ThingScope { return { ...this.scope, labelpath: Labelpath.RootBox } }

  /** The scope of `scoped`, demanding that it is in this minder's bank. */
  #demandOwnScope(scoped: ThingScope): ThingScope {
    // Its fields alone: an ask or a record passes, and is read as its scope.
    return ThingChecks.thingScope.parseConsistent(scoped, this.scope)
  }

  /** Demand that the minder is minding: after `hello`, before `goodbye`. */
  #demandReady(): void {
    if (! this.#isReady) { throw Throwers.minderNotStarted() }
  }

  /** The scope whose car, or whose list of children, is cached under `queryKey`, one of this minder's query keys. */
  #scopeOfQueryKey(queryKey: TSQ.QueryKey): ThingScope {
    const afterBank = queryKey.slice(3)
    const labels    = afterBank.slice(0, afterBank.findIndex((segment) => (segment === '!') || (segment === '#')))
    return { ...this.scope, labelpath: labels.filter((segment) => segment !== '/').join('/') }
  }
  // --

  // == [TSQ Helpers]: #answerOfTSQ, #minderEventOf

  // Its caller starts any refresh first, so that a vacant answer is isFetching. A removed car is vacant.
  /** The {@link TSQGotAnswer} the cache gives for `ask`'s scope, timely within `opts.staleTime`, or the minder's own. */
  #answerOfTSQ(ask: GetAsk, opts: MinderGetOpts): TSQGotAnswer {
    const carQuery = this.#tsqFind(ask)
    const lastErr  = carQuery?.state.error ?? null
    return {
      ...gotAnswerOf(ask, carQuery, opts.staleTime ?? this.#queryCacheOpts.staleTime),
      refreshedAt: carQuery?.state.dataUpdatedAt ?? 0,
      isFetching:  (carQuery?.state.fetchStatus === 'fetching'),
      lastErr:     (lastErr === null) ? null : Outcome.storageRefusalOf(lastErr),
    }
  }

  // A key's mark says what its query caches: '!' a car, '#' and 'kids' a listing. A removed query keeps its last state, but
  // no longer caches it.
  /** What a listener is told of `tsqEvent`, an event of the minder's cache, or undefined for one it is not told of. */
  #minderEventOf(tsqEvent: unknown): MinderEvent | undefined {
    if (! isUsefulTSQEvent(tsqEvent)) { return undefined }
    const { queryKey, state } = tsqEvent.query
    const { labelpath }       = this.#scopeOfQueryKey(queryKey)
    const modelkind           = Labelpath.modelkindOf(labelpath)
    if (queryKey.at(-1) === '!') {
      const car = (tsqEvent.type === 'removed') ? undefined : state.data
      // The car at a labelpath is of the kind its labelpath starts with.
      return { carkind: 'thing', modelkind, labelpath, car } as ThingEvent
    }
    if (queryKey.at(-1) === 'kids') {
      const labelpaths = (tsqEvent.type === 'removed') ? undefined : state.data
      // A listing lists Things of its parent's kind, as a labelpath starts with its parent's.
      return { carkind: 'listing', modelkind, labelpaths, tag: 'kids', of: { parentpath: labelpath } } as ListingEvent
    }
    return undefined
  }
  // --
}

// == [Helpers]: isUsefulTSQEvent, gotAnswerOf, isTimelyQuery, staleTimeFnOf, listingOf, stableListingOf

// A record arrives (success), a get is refused (which leaves the car untimely), or the car is removed. A fetch starting,
// pausing or failing once, and the observers' bookkeeping change none.
/** True for a cache event a listener may hear of: a query removed, or a query's success or error. */
function isUsefulTSQEvent(event: unknown): event is Readonly<{ type: 'removed' | 'updated', query: TSQ.Query }> {
  if (! (event instanceof Object)) { return false }
  const qcne = event as TSQ.QueryCacheNotifyEvent
  if (qcne.type === 'removed') { return true }
  return (qcne.type === 'updated') && ['success', 'error'].includes(qcne.action.type)
}

/** The {@link GotAnswer} for `carQuery`, the query of `ask`'s car, with the car and whether it is timely within `staleTime`. */
function gotAnswerOf(ask: GetAsk, carQuery: TSQ.Query<ThingCar<ThingRecord>> | undefined, staleTime: TsqStaleTime): GotAnswer & Pick<CarFreshness, 'car' | 'isTimely'> {
  const car      = carQuery?.state.data
  const isTimely = isTimelyQuery(carQuery, staleTime)
  const base     = { ok: true, car, ask, world: null, isTimely } as const
  if (car === undefined)          { return { ...base, act: 'vacant',   val: undefined } }
  if (isTimely) {
    if (car.liveness === 'full')  { return { ...base, act: 'gotlive',  val: car.newest } }
    if (car.liveness === 'gone')  { return { ...base, act: 'gotgone',  val: car.newest } }
    if (car.liveness === 'void')  { return { ...base, act: 'gotvoid',  val: null } }
  }
  // A behind or bare car has no whole record of its newest revision.
  return                                   { ...base, act: 'untimely', val: undefined }
}

/** True when `carQuery` has a car the vaultDB has nothing newer for, and which TanStack Query counts fresh under `staleTime`. */
function isTimelyQuery(carQuery: TSQ.Query<ThingCar<ThingRecord>> | undefined, staleTime: TsqStaleTime): boolean {
  const car = carQuery?.state.data
  if ((carQuery === undefined) || (car === undefined)) { return false }
  if (dbHasNewer(car))                                 { return false }
  return (! carQuery.isStaleByTime(staleTime))
}

// Every query in the minder's cache has a car the minder cached.
/** TanStack's staleTime for a car's query: `staleTime`, or 0 where {@link dbHasNewer}. */
function staleTimeFnOf(staleTime: TsqStaleTime): (carQuery: Readonly<{ state: Readonly<{ data: unknown }> }>) => TSQ.StaleTime {
  return (carQuery) => {
    const car = carQuery.state.data as ThingCar<ThingRecord> | undefined
    return ((car !== undefined) && dbHasNewer(car)) ? 0 : staleTime
  }
}

/** A listing of every labelpath in `prior` and in `labelpaths`, once each, in labelpath order. */
function listingOf(prior: readonly Labelpath[], labelpaths: readonly Labelpath[]): Labelpath[] {
  // Labelpaths sort by code unit, as the vaultDB lists them; the union holds no two alike. The rule's `one - other` is for numbers.
  return union(prior, labelpaths).toSorted((one, other) => ((one < other) ? -1 : 1)) // eslint-disable-line unicorn/prefer-simple-sort-comparator
}

/** TanStack's structural sharing for a listing: `prior` where `next` lists the same labelpaths, else `next`, frozen. */
const stableListingOf = (prior: unknown, next: unknown): unknown => Object.freeze(TSQ.replaceEqualDeep(prior, next))
// --

// == [Checks]: Checks

/** The checks of {@link ThingMinder.make}'s arguments. */
const Checks = Validator.Checkers('bad_record', ({ obj }) => ({
  minderMakeArgs: obj({
    opts: obj({
      vaultDB:        ThingChecks.vaultDBShape,
      queryCacheOpts: MinderChecks.queryCacheOptsOrDefault,
    }),
    bank: MinderChecks.minderFriend,
  }),
}))
// --
