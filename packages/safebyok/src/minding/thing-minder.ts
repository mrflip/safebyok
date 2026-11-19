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
import { type GetAsk, type ThingWatchScope, type WriteAsk, loggableAskOf } from '../shapes/shapes-asks'
import type { ThingNotice, VaultDB, WriteThingAnswer } from '../storage/vault-db'
import {
  type CarAt, type CarFreshness, type DeliverableThing, type GotAnswer, type MinderEvent, type MinderFriend, type MinderGetOpts, type MinderOpts, type MinderTryAtOpts,
  type MinderInvalidateOpts, type QueryCacheOpts, type ScopeAt, type TSQAnswer, type TSQGotAnswer, type ThingAt, type ThingCar, type ThingEvent, type TsqStaleTime, type ListingEvent,
  FixedQueryCacheOpts, MinderChecks,
} from '../shapes/shapes-minder'
import { bestCarOf, carOf, dbHasNewer } from './thing-car'
import * as Throwers from '../refusals/throwers'

/** One bank's Things as best known on this device, a car for each, from all the vaultDB has said of them, and a listing of
 * the children of the root box and of each Thing listed.
 * Four sources tell it of a Thing, in any order, late or more than once: a get's answer (the whole record, or the
 * Thing's shell where nothing is stored), the watch's notice of each write, a list's sparse record, and the record a
 * write's answer carries. Each lands in the Thing's car through one merge, and adds the Thing to its parent's listing,
 * where one is cached. A list sets the parent's listing. It caches only from `hello` until `goodbye`, and `goodbye`
 * empties its cache. `hello` caches the root box's listing, empty and bare: bare until a list sets it.
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
 * - The root box's listing is cached from `hello` until `goodbye`, whatever the host's gcTime. So each box that lands
 *   joins it, before its first list or after: what it lists depends only on which records arrived since `hello`, never
 *   on whether they came before the answer of its first list.
 * - A listing is bare from `hello` until a list sets it, even a list that answers nothing. A record joining it, or an
 *   `invalidate`, leaves it bare. Only the root box's listing is ever bare.
 * - A listing is the same array until a labelpath joins it.
 * - A listing lists only Things the vaultDB has stored, tombstones included, never a shell. It lists by labelpath alone:
 *   when the parent's life changes, it keeps the earlier life's children beside the new life's.
 * - A record that lands while its parent has no listing cached joins none: the parent's next list lists it. The root
 *   box always has one cached.
 * - Nothing of a write's ask is cached: the minder hears of a write only from its answer, or from the watch's notice.
 * - While the minder is minding, a write's own record has landed before the write resolves: the record written, or the
 *   refusal's `dbhas`. So a listener has heard of its car first. The other records the answer carries, its `world` and
 *   `tracked`, land only as the watch tells of them.
 * - A write's answer and the watch's notice of the same write leave the same car and listing, in either order: the
 *   later changes nothing.
 * - `invalidate` asks the vaultDB nothing, and changes no car and no listing's labelpaths: it marks listings, never cars.
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
    // The root box's car and listing stay, whatever the host's gcTime: their keys' defaults reach no box under it. The
    // listing's are set on '#', its mark without its tag, so that the defaults each list sets at its whole key keep them.
    tsq.setQueryDefaults(this.queryKey(this.#rootBoxScope), { gcTime: Infinity })
    tsq.setQueryDefaults([...this.#keyHeadOf(this.#rootBoxScope), '#'], { gcTime: Infinity })
    return tsq
  }
  // --

  // == [Starting and ending]: hello, goodbye

  /** Start minding: until `goodbye`, answer gets, and cache each change the vaultDB tells of. A second call does nothing.
   * It caches the root box's listing empty and bare: each box heard of joins it, and it is bare until a list sets it.
   */
  hello(): void {
    if (this.#isReady) { return }
    this.#isReady = true
    this.#seedListing(this.#rootBoxScope)
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

  // == [Reading]: at, listingAt, isListingBareAt, tryAt, get, list, isStaleAt, listen

  /** The cached car for `scoped`, however old, or undefined for none. Never asks the vaultDB. */
  at<LabelpathT extends Labelpath>(scoped: ScopeAt<LabelpathT>): CarAt<LabelpathT> | undefined {
    return this.#cachedAt(this.#demandOwnScope(scoped)) as CarAt<LabelpathT> | undefined
  }

  /** The cached listing of `scoped`'s children, however old, or undefined for none. Never asks the vaultDB.
   * A bare listing lists only the children heard of since `hello` ({@link isListingBareAt}).
   */
  listingAt(scoped: ThingScope): readonly Labelpath[] | undefined {
    return this.#tsq.getQueryData<readonly Labelpath[]>(this.listingQueryKey(this.#demandOwnScope(scoped)))
  }

  /** True when `scoped`'s listing is cached but bare: no list has set it since `hello`, so the vaultDB may have more. */
  isListingBareAt(scoped: ThingScope): boolean {
    return this.#tsq.getQueryState(this.listingQueryKey(this.#demandOwnScope(scoped)))?.dataUpdatedAt === BareListedAt
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
   * Each Thing it answers joins the listing of the Thing at `labelpath` ({@link listingAt}). A list never drops a labelpath
   * from that listing. Each record is cached sparse.
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
   * or it is removed. It tells a `listing` event each time a list sets a listing (even to the labelpaths it had), a labelpath
   * joins it, `hello` caches the root box's, or it is removed. It tells an `invalidation` event each time `invalidate` marks a listing stale.
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

  // == [Invalidating]: invalidate

  /** Mark stale the listings under the Thing at `labelpath`, its own included, or every listing where `labelpath` is undefined.
   * Each listing marked tells an `invalidation` event, once until the listing is next set, by a list or by a record joining it. It asks the vaultDB nothing, and
   * leaves what each listing lists as it was.
   */
  invalidate(labelpath: Labelpath | undefined, opts: MinderInvalidateOpts): void {
    MinderChecks.minderInvalidateOpts.parse(opts)
    const keyHead = (labelpath === undefined) ? this.#bankKeyHead() : this.#keyHeadOf({ ...this.scope, labelpath: MinderChecks.minderLabelpath.parse(labelpath) })
    // refetchType 'none': TanStack would otherwise refetch each active match. A listing has no queryFn to run, and the minder fetches nothing here.
    void this.#tsq.invalidateQueries({
      queryKey:    keyHead,
      predicate:   (tsqQuery) => tsqQuery.queryKey.at(-1) === 'kids',
      refetchType: 'none',
    })
  }
  // --

  // == [Writing]: tryWrite

  /** Write `ask` through the vaultDB, and answer as it did, a refusal included.
   * The record written, or a refusal's `dbhas`, is cached before it answers. The bank, main gate and tracked Things its answer reports are cached only as the watch tells of them.
   * Before `hello`, after `goodbye`, or for a scope outside this bank, it answers the refusal without asking the vaultDB.
   * A write answered after `goodbye` caches nothing.
   */
  async tryWrite(ask: WriteAsk): Promise<WriteThingAnswer> {
    try {
      this.#demandReady()
      this.#demandOwnScope(ask)
    } catch (err) {
      return { ok: false, ask: loggableAskOf(ask), act: 'unclassified_storing', world: null, dbhas: null, err: Outcome.storageRefusalOf(err) }
    }
    const answer = await this.#vaultDB.tryWriteThing(ask)
    const record = answer.ok ? answer.val : answer.dbhas
    if (record !== null) { this.#sendToTSQ(record) }
    return answer
  }
  // --

  // == [TSQ Direct Cache Calls]: #backgroundRefresh, #doGet, #fetchCar, #cachedAt, #tsqFind, #sendToTSQ, #seedListing, #sendListingToTSQ, #setListingDefaults, #joinParentListing

  // Its refusal is cached beside the car, where the next tryAt finds it as `lastErr`.
  /** Fetch `scoped`'s car in the background, if it is stale. */
  #backgroundRefresh(scoped: ThingScope, opts: MinderGetOpts): void {
    void this.#doGet(scoped, opts).catch(noop)
  }

  // The car's Thing joins its parent's listing here: TanStack lands a get's record through the queryFn, never through #sendToTSQ.
  /** `scoped`'s car: the cached one if timely within `opts.staleTime`, else from the vaultDB. */
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
  /** Land `record` in its car and its parent's listing, while minding. */
  #sendToTSQ(record: DeliverableThing): void {
    if (! this.#isReady) { return }
    this.#tsq.setQueryData(this.queryKey(record), carOf(record))
    this.#joinParentListing(record)
  }

  // Its time is TanStack's for a query never fetched, so the listing reads as bare until a list sets it.
  /** Cache `scoped`'s listing empty and bare. */
  #seedListing(scoped: ThingScope): void {
    this.#tsq.setQueryData<readonly Labelpath[]>(this.#setListingDefaults(scoped), [], { updatedAt: BareListedAt })
  }

  /** Set `scoped`'s listing to the labelpaths it had and `labelpaths`, while minding. */
  #sendListingToTSQ(scoped: ThingScope, labelpaths: readonly Labelpath[]): void {
    if (! this.#isReady) { return }
    this.#tsq.setQueryData<readonly Labelpath[]>(this.#setListingDefaults(scoped), (prior) => listingOf(prior ?? [], labelpaths))
  }

  // TanStack matches query defaults by key prefix, and no prefix starts every listing's key and no car's, so each listing's
  // key gets defaults of its own: without them a listing would take the cars', and be fetched and merged as a car.
  // Under skipToken, TanStack never fetches the listing, and invalidating it only marks it stale.
  /** Set the query defaults of `scoped`'s listing, and answer its query key. */
  #setListingDefaults(scoped: ThingScope): TSQ.QueryKey {
    const listingKey = this.listingQueryKey(scoped)
    this.#tsq.setQueryDefaults(listingKey, { queryFn: TSQ.skipToken, structuralSharing: stableListingOf, staleTime: this.#queryCacheOpts.staleTime })
    return listingKey
  }

  // Each record that lands joins its parent's listing here, whatever its source. A shell is stored nowhere, so it is no
  // one's child; and a root's parent, '', is never listed. A join is not a list, so the listing keeps the time a list
  // last set it, as TanStack keeps data derived from another query at that query's time: a bare listing stays bare.
  /** Add `record`'s labelpath to its parent's listing, where one is cached that lacks it. */
  #joinParentListing(record: DeliverableThing): void {
    if (Thing.isVoidSentinel(record)) { return }
    const parentKey = this.listingQueryKey({ ...record, labelpath: Labelpath.parentOf(record.labelpath) })
    const listing   = this.#tsq.getQueryState<readonly Labelpath[]>(parentKey)
    if ((listing?.data === undefined) || listing.data.includes(record.labelpath)) { return }
    this.#tsq.setQueryData<readonly Labelpath[]>(parentKey, listingOf(listing.data, [record.labelpath]), { updatedAt: listing.dataUpdatedAt })
  }
  // --

  // == [TSQ Asks]: queryKey, listingQueryKey, subtreeQueryKey, #keyHeadOf, #bankKeyHead, #tsqQueryOptions, #askAt, #shellAt

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
    return [...this.#bankKeyHead(), ...labels]
  }

  /** The part of a query key that every key of this bank has in common. */
  #bankKeyHead(): string[] { return ['safebyok', this.userid, this.banklabel] }

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
  // no longer caches it. A listing is told of when it is invalidated; a car's invalidation can't arise, as the minder invalidates none.
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
      // A listing event is told of the changes of `labelpaths`; an invalidation leaves them as they were.
      if (tsqEvent.action?.type === 'invalidate') { return { carkind: 'invalidation', modelkind, labelpath, card: 'list', tag: 'kids' } }
      const labelpaths = (tsqEvent.type === 'removed') ? undefined : state.data
      // A listing lists Things of its parent's kind, as a labelpath starts with its parent's.
      return { carkind: 'listing', modelkind, labelpaths, tag: 'kids', of: { parentpath: labelpath } } as ListingEvent
    }
    return undefined
  }
  // --
}

// == [Helpers]: BareListedAt, isUsefulTSQEvent, gotAnswerOf, isTimelyQuery, staleTimeFnOf, listingOf, stableListingOf

/** The time a bare listing was last listed: TanStack's `dataUpdatedAt` for a query no fetch has set. */
const BareListedAt = 0

// A record arrives (success), a get is refused (which leaves the car untimely), the car is removed, or a listing is
// invalidated. A fetch starting, pausing or failing once, and the observers' bookkeeping change none.
/** True for a cache event a listener may hear of: a query removed, or a query's success, error or invalidation. */
function isUsefulTSQEvent(event: unknown): event is Readonly<{ type: 'removed' | 'updated', query: TSQ.Query, action?: Readonly<{ type: string }> }> {
  if (! (event instanceof Object)) { return false }
  const qcne = event as TSQ.QueryCacheNotifyEvent
  if (qcne.type === 'removed') { return true }
  return (qcne.type === 'updated') && ['success', 'error', 'invalidate'].includes(qcne.action.type)
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
