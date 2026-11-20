// The ThingMinder is an exemplar at both of its ends. Its interface is the minder as we would design it for the layer in
// front of it: scopes, records, cars, acts and refusals, in our vocabulary. Its implementation shows TanStack Query used as
// its authors intend: each need is met by the feature TanStack built for that job (query defaults, structural sharing,
// the error state, the cache's events), chosen because it fits, not because it was nearest to hand.
// Where a ruling, a design note or this code seems to serve one end at the other's expense, report it rather than split
// the difference.

/** `ThingMinder`, which minds every Thing in one bank in a TanStack Query cache of its own. */

import * as TSQ from '@tanstack/query-core'
import { noop, union } from 'es-toolkit'
import { Errors, Outcome, Validator } from 'safebyok-big/internals'
import { type Banklabel, type Userid, Labelpath } from '../shapes/primitives'
import { type ThingFormat, type ThingRecord, type ThingScope, type VoidSentinel, Shell, ThingChecks } from '../shapes/shapes-thing'
import { Thing } from '../models/thing'
import type { BankScope } from '../shapes/shapes-stamps'
import { type GetAsk, type ThingWatchScope, type WriteAsk, loggableAskOf } from '../shapes/shapes-asks'
import type { ThingNotice, VaultDB, WriteThingAnswer } from '../storage/vault-db'
import {
  type CarAt, type CarFreshness, type DeliverableThing, type GotAnswer, type MinderEvent, type MinderFriend, type MinderGetOpts, type MinderOpts, type MinderTryAtOpts,
  type MinderInvalidateOpts, type QueryCacheOpts, type ScopeAt, type TSQAnswer, type TSQGotAnswer, type ThingAt, type ThingCar, type ThingEvent, type TsqStaleTime, type ListingEvent,
  FixedQueryCacheOpts, MinderChecks,
} from '../shapes/shapes-minder'
import { bestCarOf, carOf, dbHasNewer } from './thing-car'
import * as Phrases from '../phrases'
import * as Throwers from '../refusals/throwers'

/** Anything naming a labelpath: a scope, an ask or a record. */
export type Labelpathed = { labelpath: Labelpath }

/** One bank's Things as best known on this device, a car for each, from all the vaultDB has said of them, and a listing of
 * the children of the root box and of each Thing listed.
 * Four sources tell it of a Thing, in any order, late or more than once: a get's answer (the whole record, or the
 * Thing's shell where nothing is stored), the watch's notice (of each write, each changed tracked Thing and each
 * refusal's `dbhas`), a list's sparse record, and the record a good write's answer carries. Each lands in the Thing's
 * car through one merge, and adds the Thing to its parent's listing, where one is cached. A list sets the parent's
 * listing. It caches only from `hello` until `goodbye`, and `goodbye` empties its cache. `hello` caches the root box's
 * listing, empty and bare: bare until a list sets it.
 *
 * ## Invariants
 * - For a caller or listener using the library as documented, what it shows depends only on which records the minder
 *   has heard of, never on the order they arrived in.
 * - The order records arrive in never changes a car's liveness, or the revisions it carries.
 * - A car never goes back: it carries the newest revision any source has told of, and a newer life replaces an older one whole.
 * - A listener is told of each car and listing as the cache changes, in that order, so what it is told never goes back either.
 *   Each car told of a Thing has a newest no older than the last, and within one life it never loses its fullest record or
 *   takes an older one. A refused get tells the car unchanged. Each listing told lists every labelpath the last one did.
 *   Only a removal breaks the run: it tells no car, and what arrives after starts afresh. Removal is contemplated as part of a
 *   later feature allowing nested boxes, but not yet. Access after `goodbye()` or altering the gcTime is misuse (the customer
 *   may do as they please with the Giver's React Query cache).
 * - A sparse live record never displaces a whole live record of the same life: it leaves the car `bhnd`, its fullest
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
 * - An operation caches only its own good answer: the record got, written or listed. Nothing of a write's ask is cached.
 * - Every other record an answer carries (a refusal's `dbhas`, the bank, the main gate, the root box) is cached only as
 *   the watch notifies it.
 * - Records accompanying an operation (updates in `tracked`, or a record in `dbhas`) will be delivered to the Minder -- and
 *   therefore cached -- before returning to the operation.
 * - A refused write itself changes no car and marks nothing stale. (Its `dbhas`, delivered via notify, may update its car.)
 * - A write's answer and the watch's notice of the same write leave the same car and listing, in either order: the
 *   later changes nothing.
 * - `invalidate` asks the vaultDB nothing, and changes no car and no listing's labelpaths: it marks listings, never cars.
 */
export class ThingMinder {
  // == [Props]: userid, banklabel, #bank, #vaultDB, #tsq, #queryCacheOpts, #unwatch, #minding, #isReady
  readonly userid:    Userid
  readonly banklabel: Banklabel
  readonly #bank:           MinderFriend
  readonly #vaultDB:        VaultDB
  readonly #tsq:            TSQ.QueryClient
  readonly #queryCacheOpts: Readonly<QueryCacheOpts>
  #unwatch: (() => void) | null = null
  /** A token for each stretch of minding, from `hello` until `goodbye`, or null while not minding. */
  #minding: symbol | null = null

  /** True while minding: from `hello` until `goodbye`. */
  get #isReady(): boolean { return this.#minding !== null }
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
    this.#minding = Symbol('minding')
    this.#seedListing(this.#rootBoxScope)
    this.#unwatch = this.#vaultDB.watch(
      this.scope,
      // Synchronous on purpose: the vaultDB notifies of a refusal's dbhas and each changed tracked Thing before its verb returns. An await here would cache them after the operation resumes.
      (notice: ThingNotice) => { this.#sendToTSQ(notice.val) },
      (news)                => { this.#bank.tellBadNews([news]) },
    )
  }

  /** Stop minding, and empty the cache. A get still waiting refuses `disabled`. A later `hello` starts minding again. */
  goodbye(): void {
    this.#minding = null
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

  /** The cached listing of `labelpathed`'s children, however old, or undefined for none. Never asks the vaultDB.
   * A bare listing lists only the children heard of since `hello` ({@link isListingBareAt}).
   */
  listingAt(labelpathed: Labelpathed): readonly Labelpath[] | undefined {
    return this.#tsq.getQueryData<readonly Labelpath[]>(this.listingQueryKey(this.#demandOwnScope(labelpathed)))
  }

  /** True when `labelpathed`'s listing is cached but bare: no list has set it since `hello`, so the vaultDB may have more. */
  isListingBareAt(labelpathed: Labelpathed): boolean {
    return this.#tsq.getQueryState(this.listingQueryKey(this.#demandOwnScope(labelpathed)))?.dataUpdatedAt === BareListedAt
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
      // The try asks the vaultDB nothing: what it throws that is no refusal is a bug.
      return { ok: false, ask: loggableAskOf({ ...scoped, op: 'get', ifAbsent: 'nil' }), act: 'unclassified_storing', world: null, dbhas: null, err: Errors.isVaultError(err) ? err : Throwers.unexpectedError(err) }
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
   * Where that leaves a car `bhnd` or `bare`, the next get fetches it whole. A deleted Thing's car is `gone`, and
   * answers from the cache.
   * A Thing stored damaged is left out, and told to the bank's `tellBadNews` by its labelpath.
   * A list answered after `goodbye` caches nothing.
   */
  async list(labelpath: Labelpath): Promise<Labelpath[]> {
    MinderChecks.minderLabelpath.parse(labelpath)
    this.#demandReady()
    const minding = this.#minding
    const ask     = this.#bank.makeListAsk({ labelpath, ifAbsent: 'nil' })
    const answer  = await this.#vaultDB.tryListThings(ask)
    if (! answer.ok) { throw answer.err }
    if (answer.damaged_rows.length > 0) { this.#bank.tellBadNews([Throwers.childrenStoredDamaged(ask, answer.damaged_rows)]) }
    const labelpaths = answer.val.map((record) => record.labelpath)
    // A list answered after goodbye belongs to the cache goodbye emptied, though a fresh hello has started another.
    if (this.#minding !== minding) { return labelpaths }
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
   * `version` is the version of the feed `listener` was written against, which is `ThingFormat`; any other refuses.
   * It tells a `thing` event each time a record arrives in a car (even one that changes nothing), a get of it is refused,
   * or it is removed. It tells a `listing` event each time a list sets a listing (even to the labelpaths it had), a labelpath
   * joins it, `hello` caches the root box's, `invalidate` marks it stale, or it is removed.
   * Nothing is called when a car ages past `staleTime`, and listening caches no car.
   * What `listener` throws goes to the bank's `tellBadNews`, and stops nothing.
   */
  listen(listener: (event: MinderEvent) => void, version: typeof ThingFormat): () => void {
    MinderChecks.minderListener.parse(listener)
    MinderChecks.feedVersion.parse(version)
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
   * Each listing marked tells a `listing` event whose `state.isInvalidated` is true, once until the listing is next set, by a list or by a record joining it. It asks the vaultDB nothing, and
   * leaves what each listing lists as it was.
   */
  invalidate(labelpath: Labelpath | undefined, opts: MinderInvalidateOpts): void {
    MinderChecks.minderInvalidateOpts.parse(opts)
    const keyHead = (labelpath === undefined) ? bankKeyHeadOf(this.scope) : this.#keyHeadOf({ ...this.scope, labelpath: MinderChecks.minderLabelpath.parse(labelpath) })
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
   * The record written is cached before it answers. A refusal's `dbhas`, and the bank, main gate and root box its answer reports, are cached only as the watch tells of them.
   * Before `hello`, after `goodbye`, or for a scope outside this bank, it answers the refusal without asking the vaultDB.
   * A write answered after `goodbye` caches nothing.
   * Rejects, whether or not the write was made, when the answer carries a record of another bank.
   */
  async tryWrite(ask: WriteAsk): Promise<WriteThingAnswer> {
    try {
      this.#demandReady()
      this.#demandOwnScope(ask)
    } catch (err) {
      return { ok: false, ask: loggableAskOf(ask), act: 'unclassified_storing', world: null, dbhas: null, err: Errors.isVaultError(err) ? err : Throwers.unexpectedError(err) }
    }
    const minding = this.#minding
    const answer  = await this.#vaultDB.tryWriteThing(ask)
    // Only the record written lands here, and only in the cache the write began in: a fresh hello's is another. A refusal's
    // dbhas, and any tracked and updated bank, main gate or root box, land through the watch.
    if (answer.ok && (this.#minding === minding)) { this.#sendToTSQ(answer.val) }
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
    const minding = this.#minding
    let fetched: ThingCar<ThingRecord>
    try {
      fetched = await this.#tsq.query(this.#tsqQueryOptions(scoped, opts))
    } catch (err) {
      // TanStack cancels a get under way when goodbye empties the cache.
      throw (err instanceof TSQ.CancelledError) ? Throwers.minderNotStarted() : err
    }
    // A get whose fetch had settled when goodbye came is not cancelled, and resumes some microtasks later, perhaps after a
    // fresh hello: its record belongs to the cache goodbye emptied, and must join no listing of the new one.
    if (this.#minding !== minding) { throw Throwers.minderNotStarted() }
    // TanStack resolves with what the queryFn returned, not what structural sharing kept: a notice that landed during the
    // get may have left the cache a later record.
    const car = this.#cachedAt(scoped) ?? fetched
    this.#joinParentListing(car.newest)
    return car
  }

  /** Fetch `ask`'s car from the vaultDB, made of its shell where storage has nothing.
   * Refuses an answer older than the revision cached when it began.
   * Refuses a record of another Thing than `ask`'s.
   */
  async #fetchCar(ask: GetAsk): Promise<ThingCar<ThingRecord>> {
    // Held before asking: a record that lands while the get waits only makes its answer late (notes/wontfix.md).
    const prior  = this.#cachedAt(ask)
    const answer = await this.#vaultDB.tryGetThing(ask)
    // Thrown as it came. The `dbhas` is delivered through the watch, never from here.
    if (! answer.ok) { throw answer.err }
    const record = (answer.act === 'gotvoid') ? this.#shellAt(ask) : this.#checkedDelivered(answer.val, ask)
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
  /** Land `record` in its car and its parent's listing, while minding. A record of another bank refuses. */
  #sendToTSQ(record: DeliverableThing): void {
    if (! this.#isReady) { return }
    this.#checkedDelivered(record, this.scope)
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

  // == [TSQ Asks]: queryKeyOf, bankQueryKeyOf, queryKey, listingQueryKey, childrenQueryKey, #keyHeadOf, #tsqQueryOptions, #askAt, #shellAt

  // A key is the bank's three segments, the labelpath's labels with '/' between them, then a mark: '!' for the Thing's car,
  // '#' and 'kids' for its listing. Dropping the mark and putting '/' in its place makes a prefix that selects everything
  // under the Thing and neither of its own keys. No label is '!', '/' or '#', so no mark is mistaken for one. TanStack matches
  // query defaults by key prefix too, so without a mark the root box's key would start every box's key, and no defaults
  // could single out the root box. A labelpath starts with its modelkind, so the key does too.
  /** The query key a minder caches `scope`'s car under: a host caching the same car keys it the same. */
  static queryKeyOf(scope: ThingScope): TSQ.QueryKey {
    const { userid, banklabel, labelpath } = ThingChecks.thingScope.parse(scope)
    return [...keyHeadOf({ userid, banklabel }, labelpath), '!']
  }

  /** The key prefix of everything a minder of `scope`'s bank caches. */
  static bankQueryKeyOf(scope: BankScope): TSQ.QueryKey {
    return bankKeyHeadOf(ThingChecks.bankScope.parse(scope))
  }

  /** The query key `labelpathed`'s car is cached under. */
  queryKey(labelpathed: Labelpathed): TSQ.QueryKey { return [...this.#keyHeadOf(labelpathed), '!'] }

  /** The query key the list of `labelpathed`'s children is cached under. */
  listingQueryKey(labelpathed: Labelpathed): TSQ.QueryKey { return [...this.#keyHeadOf(labelpathed), '#', 'kids'] }

  /** The key prefix of everything cached under `labelpathed`, a car or a listing, and of neither of its own. */
  childrenQueryKey(labelpathed: Labelpathed): TSQ.QueryKey { return [...this.#keyHeadOf(labelpathed), '/'] }

  /** The part of a query key that `labelpathed` has in common with each of its keys. */
  #keyHeadOf(labelpathed: Labelpathed): string[] { return keyHeadOf(this.scope, labelpathed.labelpath) }

  // TanStack spreads these over the query defaults: a staleTime key given as undefined would put TanStack's 0 in place of the minder's own.
  /** TanStack's query options for a get of `labelpathed`'s car, with `opts.staleTime` where given, else the minder's query defaults' own. */
  #tsqQueryOptions(labelpathed: Labelpathed, opts: MinderGetOpts): TSQ.QueryExecuteOptions<ThingCar<ThingRecord>> {
    const queryOpts = { queryKey: this.queryKey(labelpathed) }
    if (opts.staleTime === undefined) { return queryOpts }
    return { ...queryOpts, staleTime: staleTimeFnOf(opts.staleTime) }
  }

  /** The get ask the minder sends the vaultDB for `labelpathed`, in this minder's bank. */
  #askAt(labelpathed: Labelpathed): GetAsk {
    return this.#bank.makeGetAsk({ labelpath: labelpathed.labelpath, ifAbsent: 'nil' })
  }

  // Boxes are the only Things under a root, for now: one label under the root box.
  /** The shell at `labelpathed`. Below a root, it lives in the life of the bank's root box. */
  #shellAt(labelpathed: Labelpathed): VoidSentinel {
    return labelpathed.labelpath.includes('/') ? Shell.of(labelpathed, this.rootBox) : Shell.of(labelpathed)
  }
  // --

  // == [Checks]: scope, rootBox, #rootBoxScope, #demandOwnScope, #checkedDelivered, #demandReady, #scopeOfQueryKey

  /** The scope of this minder's bank. */
  get scope(): ThingWatchScope { return { userid: this.userid, banklabel: this.banklabel } }

  /** The bank's root box, the parent of every box: before the bank's birth, its shell. */
  get rootBox(): MinderFriend['rootBox'] { return this.#bank.rootBox }

  /** The scope of the bank's root box. */
  get #rootBoxScope(): ThingScope { return { ...this.scope, labelpath: Labelpath.RootBox } }

  /** The scope of `labelpathed`, demanding that it is in this minder's bank. */
  #demandOwnScope(labelpathed: Labelpathed): ThingScope {
    // Its fields alone: an ask or a record passes, and is read as its scope.
    return ThingChecks.thingScope.parseConsistent(labelpathed, this.scope)
  }

  /** `record`, refused where the vaultDB delivered it of another bank, or of another labelpath than `scoped` names. */
  #checkedDelivered<RecordT extends DeliverableThing>(record: RecordT, scoped: ThingWatchScope): RecordT {
    DeliveredChecks.thingScope.parseConsistent(record, scoped, { message: Phrases.DeliveredOfOtherScope })
    return record
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
  // no longer caches it, so its event tells no data. A car's invalidation can't arise, as the minder invalidates none.
  /** What a listener is told of `tsqEvent`, an event of the minder's cache, or undefined for one it is not told of. */
  #minderEventOf(tsqEvent: unknown): MinderEvent | undefined {
    if (! isUsefulTSQEvent(tsqEvent)) { return undefined }
    const { queryKey }  = tsqEvent.query
    const { labelpath } = this.#scopeOfQueryKey(queryKey)
    const isRemoved     = (tsqEvent.type === 'removed')
    const told = {
      type:      tsqEvent.type,
      action:    isRemoved ? undefined : Object.freeze({ type: tsqEvent.action.type }),
      queryKey:  Object.freeze([...queryKey]),
      state:     Object.freeze(isRemoved ? { ...tsqEvent.query.state, data: undefined } : { ...tsqEvent.query.state }),
      ...this.scope,
      labelpath,
      modelkind: Labelpath.modelkindOf(labelpath),
    }
    if (queryKey.at(-1) === '!') {
      const car    = told.state.data as ThingCar<ThingRecord> | undefined
      const newest = car?.newest
      // The car at a labelpath is of the kind its labelpath starts with.
      return Object.freeze({
        ...told, carkind: 'thing', agerank: car?.agerank,
        revtok: newest?.revtok, revseq: newest?.revseq, am: newest?.am, lifeseq: newest?.lifeseq, lifepath: newest?.lifepath,
      }) as ThingEvent
    }
    // A listing lists Things of its parent's kind, as a labelpath starts with its parent's.
    if (queryKey.at(-1) === 'kids') { return Object.freeze({ ...told, carkind: 'listing', tag: 'kids' }) as ListingEvent }
    return undefined
  }
  // --
}

// == [Helpers]: keyHeadOf, bankKeyHeadOf, BareListedAt, UsefulTSQEvent, isUsefulTSQEvent, gotAnswerOf, isTimelyQuery, staleTimeFnOf, listingOf, stableListingOf

/** The part of a query key that the Thing at `labelpath` in `scope`'s bank has in common with each of its keys. */
function keyHeadOf(scope: BankScope, labelpath: Labelpath): string[] {
  const labels = labelpath.split('/').flatMap((label) => ['/', label]).slice(1)
  return [...bankKeyHeadOf(scope), ...labels]
}

/** The part of a query key that every key of `scope`'s bank has in common. */
function bankKeyHeadOf({ userid, banklabel }: BankScope): string[] { return ['sok', userid, banklabel] }

/** The time a bare listing was last listed: TanStack's `dataUpdatedAt` for a query no fetch has set. */
const BareListedAt = 0

/** A cache event a listener may hear of, as {@link isUsefulTSQEvent} narrows it. */
type UsefulTSQEvent = Readonly<
  | { type: 'removed', query: TSQ.Query }
  | { type: 'updated', query: TSQ.Query, action: Readonly<{ type: 'success' | 'error' | 'invalidate' }> }
>

// A record arrives (success), a get is refused (which leaves the car untimely), the car is removed, or a listing is
// invalidated. A fetch starting, pausing or failing once, and the observers' bookkeeping change none.
/** True for a cache event a listener may hear of: a query removed, or a query's success, error or invalidation. */
function isUsefulTSQEvent(event: unknown): event is UsefulTSQEvent {
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
  // A bhnd or bare car has no whole record of its newest revision.
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
  return union(prior, labelpaths).toSorted((one: Labelpath, other: Labelpath) => ((one < other) ? -1 : 1)) // eslint-disable-line unicorn/prefer-simple-sort-comparator
}

/** TanStack's structural sharing for a listing: `prior` where `next` lists the same labelpaths, else `next`, frozen. */
const stableListingOf = (prior: unknown, next: unknown): unknown => Object.freeze(TSQ.replaceEqualDeep(prior, next))
// --

// == [Checks]: Checks, DeliveredChecks

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

/** The check of a record the vaultDB delivers, refusing `unexpected_error`: a record of another scope is a bug in the vaultDB. */
const DeliveredChecks = {
  thingScope: ThingChecks.thingScope.refusingAs('unexpected_error'),
}
// --
