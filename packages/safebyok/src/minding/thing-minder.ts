// The ThingMinder is an exemplar at both of its ends. Its interface is the minder as we would design it for the layer in
// front of it: scopes, records, acts and refusals, in our vocabulary. Its implementation shows TanStack Query used as
// its authors intend: each need is met by the feature TanStack built for that job (query defaults, structural sharing,
// the error state, the cache's events), chosen because it fits, not because it was nearest to hand.
// Where a ruling, a design note or this code seems to serve one end at the other's expense, report it rather than split
// the difference.

/** `ThingMinder`, which minds every Thing in one bank in a TanStack Query cache of its own. */

import * as TSQ from '@tanstack/query-core'
import { deepFreeze, union } from 'es-toolkit'
import { Outcome, Validator } from 'safebyok-big/internals'
import { type Banklabel, type Userid, Labelpath } from '../shapes/primitives'
import { type Sparse, type ThingRecord, type ThingScope, type Tombstone, type VoidSentinel, Shell, ThingChecks } from '../shapes/shapes-thing'
import { Thing } from '../models/thing'
import type { BankScope } from '../shapes/shapes-stamps'
import { type GetAsk, type ThingWatchScope, type WriteAsk } from '../shapes/shapes-asks'
import type { ThingNotice, VaultDB, WriteThingAnswer } from '../storage/vault-db'
import { refusedAnswerOf } from '../storage/refused-answer'
import {
  type DeliverableThing, type GotAnswer, type MinderEvent, type MinderFriend, type MinderGetOpts, type MinderOpts, type MinderTryAtOpts,
  type MinderInvalidateOpts, type QueryCacheOpts, type ScopeAt, type TSQAnswer, type TSQGotAnswer, type ThingAt, type ThingEvent, type SoonEvent, type TsqStaleTime, type ListingEvent, type MinderEventkind, type MinderEventFormat, type TSQQueryAction,
  FixedQueryCacheOpts, MinderChecks,
} from '../shapes/shapes-minder'
import { newerThingOf } from './newer-thing'
import { bulletproofHandlerOf } from '../helpers/bulletproof'
import * as Phrases from '../phrases'
import * as Throwers from '../refusals/throwers'

/** Anything naming a labelpath: a scope, an ask or a record. */
export type Labelpathed = { labelpath: Labelpath }

/** This device's cache of one bank's Things, kept from everything the vaultDB tells of them.
 * Each Thing has an item, with the whole record a host shows: live, its tombstone, or its shell where nothing is stored.
 * A Thing may also have a soon: a sparse record newer than the item, removed once the item catches up. The root box and
 * each Thing listed have a listing of their children.
 * Records arrive from gets, lists, good writes and the watch, in any order, late or more than once. A whole record,
 * tombstone or shell lands in the item and a sparse record in the soon, and each adds the Thing to its parent's listing,
 * where one is cached. A list sets the parent's listing. It caches only from `hello` until `goodbye`, and
 * `goodbye` empties its cache. `hello` caches the root box's listing, empty and bare: bare until a list sets it.
 *
 * ## Invariants
 * - For a caller or listener using it as documented, what it shows depends only on which records the minder has heard
 *   of, never on the order they arrived in.
 * - An item and a soon never go back. The item has the newest whole record, tombstone or shell heard of, and the soon
 *   the newest sparse record while that is newer than the item. A newer life replaces an older one whole.
 * - A record that would take the item or soon back is dropped, nothing is told, and the item keeps its time: a sparse
 *   record no newer than the item or the soon, or a whole record older than the item from any source but a get. A whole record at the item's
 *   revision lands, and makes the item fresh as of then. The soon is removed once the item is no older than it.
 * - An item is behind while a soon newer than it is cached, or a soon with no item. Behind is that comparison, not
 *   whether a soon is cached: a `tryAt` or `isBehindAt` made while a record lands, once it has caught the item up but
 *   before the soon is removed, already finds the item not behind. An item behind is never timely, and the next get
 *   fetches the newest whole record.
 * - A sparse record lands in the soon before its item is invalidated, so from the soon's `success` on, every read and
 *   get finds the item behind ({@link SoonEvent}). A refused get leaves the item invalidated too, until a record lands in it.
 * - A listener is told of each item, soon and listing in the order the cache changes, and what it is told never goes
 *   back either: each record told of an item, or of a soon, is no older than the last, and each listing lists every
 *   labelpath the last one did. Only a removal breaks the run, and what is told after it starts over. A soon is removed
 *   whenever the item catches up with it; the cache removes an item or a listing only at `goodbye`.
 *   {@link ThingEvent}, {@link SoonEvent} and {@link ListingEvent} give the order of the events.
 * - A get answered with a revision older than the newest cached when it began refuses `stale_read`, and changes nothing.
 * - A listing never drops a labelpath: a list adds what it answers, and each record that lands adds its own. So once a
 *   listing is cached, what it lists depends only on which records arrived, never on their order.
 * - The root box's listing is cached from `hello` until `goodbye`. So each box that lands
 *   joins it, before its first list or after: what it lists depends only on which records arrived since `hello`, never
 *   on whether they came before the answer of its first list.
 * - A listing is bare from `hello` until a list sets it, even a list that answers nothing. A record joining it, or an
 *   `invalidate`, leaves it bare. Only the root box's listing is ever bare.
 * - A listing is the same array until a labelpath joins it.
 * - A listing lists only Things the vaultDB has stored, tombstones included, never a shell. It lists by labelpath alone,
 *   so when the parent's life changes it keeps the earlier life's children beside the new life's.
 * - A record that lands while its parent has no listing cached joins none: the parent's next list lists it. The root
 *   box always has one cached.
 * - An operation caches only its own good answer: the record got, written or listed, never a write's ask. Any other
 *   record an answer carries (a refusal's `dbhas`, or a tracked bank, main gate or root box) is cached only as the watch
 *   tells of it, and the watch tells of it before the operation returns.
 * - A refused write changes no item and marks nothing stale. Its `dbhas`, through the watch, may still change an item.
 * - A write's answer and the watch's notice of the same write leave the same item and listing, in either order: the
 *   later changes nothing.
 * - `invalidate` asks the vaultDB nothing, and marks listings stale, never items: it changes no item, and no listing's labelpaths.
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

  // The client's own defaults are left to whoever owns it. TanStack matches query defaults by key prefix, and the kind of
  // entry follows the bank's segments in every key, so one prefix each gives the items, the soons and the listings of
  // this bank their own, the fixed options over any the client sets. Under skipToken, TanStack never fetches a soon.
  // TanStack calls the cache's onSuccess right after a fetch's record lands, and never for setQueryData: #sendToTSQ does
  // the same for every other record.
  /** The QueryClient whose cache has this minder's items, soons and listings, its query defaults set. */
  #makeTSQ(): TSQ.QueryClient {
    const fixed = { ...FixedQueryCacheOpts, staleTime: this.#queryCacheOpts.staleTime }
    const tsq   = new TSQ.QueryClient({
      queryCache: new TSQ.QueryCache({ onSuccess: (val, tsqQuery) => { this.#landedByFetch(val, tsqQuery.queryKey) } }),
    })
    const bankHead = bankKeyHeadOf(this.scope)
    tsq.setQueryDefaults([...bankHead, Itemkind], {
      ...fixed,
      queryFn:           ({ queryKey }) => this.#fetchRecord(this.#askAt(this.#scopeOfQueryKey(queryKey))),
      structuralSharing: newerThingOf,
    })
    tsq.setQueryDefaults([...bankHead, Soonkind], { ...fixed, queryFn: TSQ.skipToken, structuralSharing: newerThingOf })
    tsq.setQueryDefaults([...bankHead, Listkind], {
      ...fixed,
      queryFn:           ({ queryKey }) => this.#fetchListing(this.#scopeOfQueryKey(queryKey)),
      structuralSharing: landedListingOf,
    })
    return tsq
  }
  // --

  // == [Starting and ending]: hello, goodbye

  /** Start minding: until `goodbye`, answer gets, and cache each change the vaultDB notifies. A second call does nothing.
   * It caches the root box's listing empty and bare: each box received joins it, and it is bare until a list sets it.
   */
  hello(): void {
    if (this.#isReady) { return }
    this.#isReady = true
    this.#seedListing(this.#rootBoxScope)
    this.#unwatch = this.#vaultDB.watch(
      this.scope,
      // Synchronous on purpose: the vaultDB notifies of a refusal's dbhas, each changed tracked Thing and each Thing a list answers before its verb returns. An await here would cache them after the operation resumes.
      (notice: ThingNotice) => { this.#sendToTSQ(notice.val) },
      (news)                => { this.#bank.tellBadNews([news]) },
    )
  }

  /** Stop minding, and empty the cache. A later `hello` starts minding again. */
  goodbye(): void {
    this.#isReady = false
    if (this.#unwatch) { this.#unwatch() }
    this.#unwatch = null
    this.#tsq.removeQueries({ queryKey: bankKeyHeadOf(this.scope) })
  }
  // --

  // == [Reading]: at, soonAt, isBehindAt, listingAt, isListingBareAt, tryAt, get, tryGet, backgroundRefresh, list, tryList, isStaleAt, listen

  /** The record `scoped`'s item has, however old, or undefined for no item. Never asks the vaultDB. */
  at<LabelpathT extends Labelpath>(scoped: ScopeAt<LabelpathT>): ThingAt<LabelpathT> | Tombstone<ThingAt<LabelpathT>> | undefined {
    return this.#itemAt(this.#demandOwnScope(scoped)) as ThingAt<LabelpathT> | Tombstone<ThingAt<LabelpathT>> | undefined
  }

  /** The sparse record `scoped`'s soon has, newer than its item, or undefined for no soon. Never asks the vaultDB. */
  soonAt<LabelpathT extends Labelpath>(scoped: ScopeAt<LabelpathT>): Sparse<ThingAt<LabelpathT>> | undefined {
    return this.#soonAt(this.#demandOwnScope(scoped)) as Sparse<ThingAt<LabelpathT>> | undefined
  }

  /** True when `scoped`'s item is behind: a soon newer than the item is cached, or a soon with no item. Never asks the vaultDB. */
  isBehindAt(scoped: ThingScope): boolean {
    return this.#isBehindAt(this.#demandOwnScope(scoped))
  }

  /** The cached listing of `scoped`'s children, however old, or undefined for none. Never asks the vaultDB.
   * A bare listing lists only the children received since `hello` ({@link isListingBareAt}).
   */
  listingAt(scoped: ThingScope): readonly Labelpath[] | undefined {
    return this.#tsq.getQueryData<readonly Labelpath[]>(this.listQueryKey(this.#demandOwnScope(scoped)))
  }

  /** True when `scoped`'s listing is cached but bare: no list has set it since `hello`, so the vaultDB may have more. */
  isListingBareAt(scoped: ThingScope): boolean {
    // A listing a first list is still fetching, or left refused, is a query with no labelpaths: it is not cached.
    const listing = this.#tsq.getQueryState(this.listQueryKey(this.#demandOwnScope(scoped)))
    return (listing?.data !== undefined) && (listing.dataUpdatedAt === BareListedAt)
  }

  /** The cache's answer for `scoped`, without waiting on the vaultDB.
   * An item that is not timely answers `untimely`, with no `val`, and so does a newer revision heard of with no item.
   * Under `ifStale: 'refresh'`, it also fetches a stale or missing item in the background ({@link MinderTryAtOpts}).
   */
  tryAt<LabelpathT extends Labelpath>(scoped: ScopeAt<LabelpathT>, opts: MinderTryAtOpts = {}): TSQAnswer<ThingAt<LabelpathT>> {
    try {
      MinderChecks.minderTryAtOpts.parse(opts)
      this.#demandReady()
      const scope = this.#demandOwnScope(scoped)
      if (opts.ifStale === 'refresh') { this.backgroundRefresh(scope, { staleTime: opts.staleTime }) }
      return this.#answerOfTSQ(this.#askAt(scope), opts) as TSQGotAnswer<ThingAt<LabelpathT>>
    } catch (err) {
      // The try asks the vaultDB nothing: what it throws that is no refusal is a bug.
      return refusedAnswerOf({ ...scoped, op: 'get', ifAbsent: 'nil' }, err)
    }
  }

  /** Get `scoped`'s whole record, its tombstone or its shell: the cached one if timely, else from the vaultDB. A get already under way is shared.
   * Refuses `stale_read` when the vaultDB answers with a revision older than one cached when the get began. A later get asks again.
   * With no root box cached, a get of a box the vaultDB has nothing for refuses: get the root box first.
   */
  async get<LabelpathT extends Labelpath>(scoped: ScopeAt<LabelpathT>, opts: MinderGetOpts = {}): Promise<ThingAt<LabelpathT> | Tombstone<ThingAt<LabelpathT>>> {
    MinderChecks.minderGetOpts.parse(opts)
    this.#demandReady()
    return await this.#doGet(this.#demandOwnScope(scoped), opts) as ThingAt<LabelpathT> | Tombstone<ThingAt<LabelpathT>>
  }

  /** {@link get}, resolving an `Outcome` instead of throwing: a refusal, misuse included, is its bad outcome. */
  async tryGet<LabelpathT extends Labelpath>(scoped: ScopeAt<LabelpathT>, opts: MinderGetOpts = {}): Promise<Outcome.Outcome<ThingAt<LabelpathT> | Tombstone<ThingAt<LabelpathT>>>> {
    return await Outcome.outcomeOf(() => this.get(scoped, opts))
  }

  /** Get `scoped`'s whole record in the background, unless its item is timely, and return at once.
   * It throws nothing and tells no one of a refusal, misuse included. A refusal from the vaultDB shows as `lastErr` in the next {@link tryAt}.
   */
  backgroundRefresh(scoped: ThingScope, opts: MinderGetOpts = {}): void {
    void this.tryGet(scoped, opts)
  }

  /** List the labelpaths of the Things directly under `labelpath`, tombstones included, in labelpath order, from the vaultDB.
   * A list called while another of the same labelpath is under way answers what that one does.
   * They are added to the listing at `labelpath` ({@link listingAt}). A live Thing listed is cached as its soon where it
   * is newer than the item, so the next get fetches the item whole. A tombstone lands in the item, so a get of it answers
   * from the cache. A Thing stored damaged is left out, and reported to the bank's `tellBadNews`.
   */
  async list(labelpath: Labelpath): Promise<Labelpath[]> {
    MinderChecks.minderLabelpath.parse(labelpath)
    this.#demandReady()
    // Under staleTime 0 TanStack fetches whatever the listing holds, and shares a fetch under way. Each caller gets its own
    // array: callers sharing a list share the one its fetch returned.
    return [...await this.#tsq.query<readonly Labelpath[]>({ queryKey: this.listQueryKey({ labelpath }), staleTime: 0 })]
  }

  /** {@link list}, resolving an `Outcome` instead of throwing: a refusal, misuse included, is its bad outcome. */
  async tryList(labelpath: Labelpath): Promise<Outcome.Outcome<Labelpath[]>> {
    return await Outcome.outcomeOf(() => this.list(labelpath))
  }

  /** True when the item is not timely for a {@link get} with these `opts`.
   * A `staleTime` given wins over the item's being behind, as for a get, and an item invalidated is stale whatever the staleTime.
   */
  isStaleAt(scoped: ThingScope, opts: MinderGetOpts = {}): boolean {
    MinderChecks.minderGetOpts.parse(opts)
    const scope = this.#demandOwnScope(scoped)
    return this.#tsqFind(scope)?.isStaleByTime(this.#staleTimeOf(scope, opts)) ?? true
  }

  /** Call `listener` with each change to the cache, and return the function that stops it.
   * Pass `MinderEventFormat` as `version`: the event shape `listener` was written for. Any other refuses.
   * It tells of each of this bank's queries added, changed or removed, and of nothing an observer does. Narrow each event on its
   * `eventkind`: {@link ThingEvent}, {@link SoonEvent} and {@link ListingEvent} say what each tells, and when.
   * Nothing is told when an item ages past `staleTime`, and listening caches nothing.
   * What `listener` throws goes to the bank's `tellBadNews`, and stops nothing.
   */
  listen(listener: (event: MinderEvent) => void, version: typeof MinderEventFormat): () => void {
    MinderChecks.minderListener.parse(listener)
    MinderChecks.feedVersion.parse(version)
    const tellListener = bulletproofHandlerOf(listener, { ifError: 'tell', transformer: Throwers.unexpectedError, onBadNews: (err) => { this.#bank.tellBadNews([err]) } })
    return this.#tsq.getQueryCache().subscribe((tsqEvent) => {
      const event = this.#minderEventOf(tsqEvent)
      if (event === undefined) { return }
      tellListener(event)
    })
  }
  // --

  // == [Invalidating]: invalidate

  /** Mark stale the listings under the Thing at `labelpath`, its own included, or every listing where `labelpath` is undefined.
   * Each listing marked tells one {@link ListingEvent} with `state.isInvalidated` true, and no more until a list or a joining record sets it again.
   * A listing a refused list left stale tells none.
   * It asks the vaultDB nothing, and leaves what each listing lists unchanged.
   */
  invalidate(labelpath: Labelpath | undefined, opts: MinderInvalidateOpts): void {
    MinderChecks.minderInvalidateOpts.parse(opts)
    const labels = (labelpath === undefined) ? [] : labelsOf(MinderChecks.minderLabelpath.parse(labelpath))
    // refetchType 'none': TanStack would otherwise refetch each listing an observer keeps active, and invalidate asks the vaultDB nothing.
    void this.#tsq.invalidateQueries({ queryKey: [...bankKeyHeadOf(this.scope), Listkind, ...labels], refetchType: 'none' })
  }
  // --

  // == [Writing]: tryWrite, write

  /** Write `ask` through the vaultDB, and return its answer, a refusal included.
   * The record written is cached before it answers. A refusal's `dbhas`, and the bank, main gate and root box its answer reports, are cached only as the watch tells of them.
   * Before `hello`, after `goodbye`, or for a scope outside this bank, it answers the refusal without asking the vaultDB.
   * Rejects, whether or not the write was made, when the answer carries a record of another bank.
   */
  async tryWrite(ask: WriteAsk): Promise<WriteThingAnswer> {
    try {
      this.#demandReady()
      this.#demandOwnScope(ask)
    } catch (err) {
      return refusedAnswerOf(ask, err)
    }
    const answer = await this.#vaultDB.tryWriteThing(ask)
    // Only the record written lands here. A refusal's dbhas, and any tracked and updated bank, main gate or root box, land through the watch.
    if (answer.ok) { this.#sendToTSQ(answer.val) }
    return answer
  }

  /** {@link tryWrite}, throwing its refusal instead of answering it: the record written, on success. */
  async write(ask: WriteAsk): Promise<ThingRecord> {
    return Outcome.valOf(await this.tryWrite(ask))
  }
  // --

  // == [TSQ Direct Cache Calls]: #doGet, #fetchRecord, #fetchListing, #itemAt, #soonAt, #soonestAt, #isBehindAt, #tsqFind, #sendToTSQ, #landedByFetch, #settleLanded, #markBehinds, #seedListing, #addToParentListing

  // TanStack resolves with what the queryFn returned, not what structural sharing left in the cache: a notice that landed during the
  // get may have left the item a later record.
  /** `scoped`'s record: the item's if timely within `opts.staleTime`, else from the vaultDB. */
  async #doGet(scoped: ThingScope, opts: MinderGetOpts): Promise<ThingRecord | Tombstone<ThingRecord>> {
    const fetched = await this.#tsq.query(this.#tsqQueryOptions(scoped, opts))
    return this.#itemAt(scoped) ?? fetched
  }

  /** Fetch `ask`'s record, deeply frozen, or its shell where the vaultDB has nothing.
   * Refuses `stale_read` for an answer older than the soonest record cached when the fetch began.
   */
  async #fetchRecord(ask: GetAsk): Promise<ThingRecord | Tombstone<ThingRecord>> {
    // Read before asking: a record that lands while the get waits only makes its answer late (notes/wontfix.md).
    const prior  = this.#soonestAt(ask)
    const answer = await this.#vaultDB.tryGetThing(ask)
    // Thrown unchanged. The `dbhas` is delivered through the watch, never from here.
    if (! answer.ok) { throw answer.err }
    const record = (answer.act === 'gotvoid') ? this.#shellAt(ask) : this.#checkedDelivered(answer.val, ask)
    // TanStack leaves the item and its time as they were, marks it invalidated, and caches the refusal beside it as its error.
    if ((prior !== undefined) && (Thing.cmp(prior, record) < 0)) { throw Throwers.staleRead(ask) }
    return deepFreeze(record)
  }

  // Only the labelpaths land here: the vaultDB notifies each Thing listed before it answers, so each lands through the
  // watch, and joins the listing where one is cached, before the listing itself does.
  /** Fetch the labelpaths listed under `scoped`, telling the bank's `tellBadNews` of any Thing stored damaged. */
  async #fetchListing(scoped: ThingScope): Promise<readonly Labelpath[]> {
    const ask    = this.#bank.makeListAsk({ labelpath: scoped.labelpath, ifAbsent: 'nil' })
    const answer = await this.#vaultDB.tryListThings(ask)
    if (! answer.ok) { throw answer.err }
    if (answer.damaged_rows.length > 0) { this.#bank.tellBadNews([Throwers.childrenStoredDamaged(ask, answer.damaged_rows)]) }
    return Object.freeze(answer.val.map((record) => record.labelpath))
  }

  /** The record `scoped`'s item has, or undefined for no item. */
  #itemAt(scoped: Labelpathed): ThingRecord | Tombstone<ThingRecord> | undefined {
    return this.#tsq.getQueryData<ThingRecord | Tombstone<ThingRecord>>(this.itemQueryKey(scoped))
  }

  /** The sparse record `scoped`'s soon has, or undefined for no soon. */
  #soonAt(scoped: Labelpathed): Sparse<ThingRecord> | undefined {
    return this.#tsq.getQueryData<Sparse<ThingRecord>>(this.soonQueryKey(scoped))
  }

  /** The soonest record cached for `scoped`: its soon where the item is behind it, else its item, or undefined for neither. */
  #soonestAt(scoped: Labelpathed): DeliverableThing | undefined {
    return this.#isBehindAt(scoped) ? this.#soonAt(scoped) : this.#itemAt(scoped)
  }

  // A soon the item has caught up with stays cached while the record that caught it up lands: listeners hear the landing first.
  /** True when `scoped`'s soon is newer than its item, or there is a soon and no item. */
  #isBehindAt(scoped: Labelpathed): boolean {
    const soon = this.#soonAt(scoped)
    return (soon !== undefined) && isNewer(this.#itemAt(scoped), soon)
  }

  /** The cache's query of `scoped`'s item, or undefined for none. */
  #tsqFind(scoped: Labelpathed): TSQ.Query<ThingRecord | Tombstone<ThingRecord>> | undefined {
    return this.#tsq.getQueryCache().find<ThingRecord | Tombstone<ThingRecord>>({ queryKey: this.itemQueryKey(scoped), exact: true })
  }

  // Every record but a get's lands here: TanStack lands a get's record in the item itself, then calls #landedByFetch.
  // A whole record at the item's revision lands, and makes the item fresh as of now, as TanStack counts a confirmation from
  // the server. An older one lands nowhere: it would make the newer record read fresh as of its arrival.
  /** Cache `record` in its item or soon, and in its parent's listing, while minding.
   * A whole record older than the item, or a sparse one no newer than the soonest cached, joins only the listing.
   */
  #sendToTSQ(record: DeliverableThing): void {
    if (! this.#isReady) { return }
    deepFreeze(this.#checkedDelivered(record, this.scope))
    if (! Thing.isSparse(record)) {
      if (! isOlder(this.#itemAt(record), record)) { this.#tsq.setQueryData(this.itemQueryKey(record), record) }
    } else if (isNewer(this.#soonestAt(record), record)) {
      this.#tsq.setQueryData(this.soonQueryKey(record), record)
    }
    this.#settleLanded(record)
  }

  // A listing's fetch needs nothing more: the Things it lists landed through the watch before it. A soon is never fetched.
  /** Settle what a fetch that just landed `val` under `queryKey` brings about, where it is an item of this bank. */
  #landedByFetch(val: unknown, queryKey: TSQ.QueryKey): void {
    if (TSQ.partialMatchKey(queryKey, [...bankKeyHeadOf(this.scope), Itemkind])) { this.#settleLanded(val as DeliverableThing) }
  }

  // The record has landed before #markBehinds invalidates the item or removes the soon, so a listener told of a soon's
  // success already finds the item behind, and a get there fetches it; and the item's invalidate follows the soon's
  // success at once, before the listing's join.
  /** Bring `record`'s soon, item and parent's listing up to date with its having landed, or been dropped. */
  #settleLanded(record: DeliverableThing): void {
    this.#markBehinds(record)
    this.#addToParentListing(record)
  }

  // TanStack tells nothing when it invalidates a query already invalidated, so an item tells its falling behind once until
  // a record lands in it, and not at all after a refused get. refetchType 'none': the next get of the item fetches it.
  /** Remove `scoped`'s soon if its item has caught up with it, else invalidate the item.
   * Does nothing unless both are cached.
   */
  #markBehinds(scoped: Labelpathed): void {
    const item = this.#itemAt(scoped)
    const soon = this.#soonAt(scoped)
    if ((item === undefined) || (soon === undefined)) { return }
    if (! isNewer(item, soon)) {
      this.#tsq.removeQueries({ queryKey: this.soonQueryKey(scoped), exact: true })
      return
    }
    void this.#tsq.invalidateQueries({ queryKey: this.itemQueryKey(scoped), exact: true, refetchType: 'none' })
  }

  // Its time is TanStack's for a query never fetched, so the listing reads as bare until a list sets it.
  /** Cache `scoped`'s listing empty and bare. */
  #seedListing(scoped: ThingScope): void {
    this.#tsq.setQueryData<readonly Labelpath[]>(this.listQueryKey(scoped), [], { updatedAt: BareListedAt })
  }

  // Each record that lands joins its parent's listing here, whatever its source. A shell is stored nowhere, so it is no
  // one's child; and a root's parent, '', is never listed. A join is not a list, so the listing's time stays the time a list
  // last set it, as TanStack dates data derived from another query at that query's time: a bare listing stays bare.
  /** Add `record`'s labelpath to its parent's listing, where one is cached that lacks it. */
  #addToParentListing(record: DeliverableThing): void {
    if (Thing.isVoidSentinel(record)) { return }
    const parentKey = this.listQueryKey({ labelpath: Labelpath.parentOf(record.labelpath) })
    const listing   = this.#tsq.getQueryState<readonly Labelpath[]>(parentKey)
    if ((listing?.data === undefined) || listing.data.includes(record.labelpath)) { return }
    this.#tsq.setQueryData<readonly Labelpath[]>(parentKey, listingOf(listing.data, [record.labelpath]), { updatedAt: listing.dataUpdatedAt })
  }
  // --

  // == [TSQ Asks]: itemQueryKeyOf, listQueryKeyOf, bankQueryKeyOf, itemQueryKey, soonQueryKey, listQueryKey, #tsqQueryOptions, #staleTimeOf, #askAt, #shellAt

  // A key is the bank's three segments, the kind of entry ('item', 'soon' or 'list'), the labelpath's labels with '/'
  // between them, then a mark: '!' for the item, '~' for the soon, '#' and 'kids' for the listing. TanStack matches query
  // defaults and invalidation by key prefix, so the kind's prefix singles out every entry of that kind, and a Thing's
  // listing key without its mark covers every listing under it too. Without a mark the root box's item key would start
  // every box's. No label is '!', '~', '/' or '#', so no mark is mistaken for one. A labelpath starts with its modelkind.
  /** The query key a minder caches `scope`'s item under. A host caching the same record may use the same key. */
  static itemQueryKeyOf(scope: ThingScope): TSQ.QueryKey {
    const { userid, banklabel, labelpath } = ThingChecks.thingScope.parse(scope)
    return [...bankKeyHeadOf({ userid, banklabel }), Itemkind, ...labelsOf(labelpath), '!']
  }

  /** The query key a minder caches the listing of `scope`'s children under. A host caching the same labelpaths may use the same key. */
  static listQueryKeyOf(scope: ThingScope): TSQ.QueryKey {
    const { userid, banklabel, labelpath } = ThingChecks.thingScope.parse(scope)
    return [...bankKeyHeadOf({ userid, banklabel }), Listkind, ...labelsOf(labelpath), '#', 'kids']
  }

  /** The key prefix of everything a minder of `scope`'s bank caches. */
  static bankQueryKeyOf(scope: BankScope): TSQ.QueryKey {
    return bankKeyHeadOf(ThingChecks.bankScope.parse(scope))
  }

  /** The query key `labelpathed`'s item is cached under. */
  itemQueryKey(labelpathed: Labelpathed): TSQ.QueryKey { return [...bankKeyHeadOf(this.scope), Itemkind, ...labelsOf(labelpathed.labelpath), '!'] }

  /** The query key `labelpathed`'s soon is cached under. */
  soonQueryKey(labelpathed: Labelpathed): TSQ.QueryKey { return [...bankKeyHeadOf(this.scope), Soonkind, ...labelsOf(labelpathed.labelpath), '~'] }

  /** The query key the listing of `labelpathed`'s children is cached under. */
  listQueryKey(labelpathed: Labelpathed): TSQ.QueryKey { return [...bankKeyHeadOf(this.scope), Listkind, ...labelsOf(labelpathed.labelpath), '#', 'kids'] }

  /** TanStack's query options for a get of `labelpathed`'s item, under {@link #staleTimeOf}'s staleTime. */
  #tsqQueryOptions(labelpathed: Labelpathed, opts: MinderGetOpts): TSQ.QueryExecuteOptions<ThingRecord | Tombstone<ThingRecord>> {
    return { queryKey: this.itemQueryKey(labelpathed), staleTime: this.#staleTimeOf(labelpathed, opts) }
  }

  // A listener on a soon's success runs before the item is invalidated, so a get there needs the 0.
  /** The staleTime a get of `labelpathed`'s item runs under: `opts.staleTime` where given, else 0 for an item behind, else the minder's own. */
  #staleTimeOf(labelpathed: Labelpathed, opts: MinderGetOpts): TsqStaleTime {
    if (opts.staleTime !== undefined) { return opts.staleTime }
    return this.#isBehindAt(labelpathed) ? 0 : this.#queryCacheOpts.staleTime
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

  /** `record`, refused where it is of another bank, or of another labelpath than `scoped` names. */
  #checkedDelivered<RecordT extends DeliverableThing>(record: RecordT, scoped: ThingWatchScope): RecordT {
    DeliveredChecks.thingScope.parseConsistent(record, scoped, { message: Phrases.DeliveredOfOtherScope })
    return record
  }

  /** Demand that the minder is minding: after `hello`, before `goodbye`. */
  #demandReady(): void {
    if (! this.#isReady) { throw Throwers.minderNotStarted() }
  }

  /** The scope whose item, soon or listing is cached under `queryKey`, one of this minder's query keys. */
  #scopeOfQueryKey(queryKey: TSQ.QueryKey): ThingScope {
    const afterEntrykind = queryKey.slice(EntrykindIdx + 1)
    const labels         = afterEntrykind.slice(0, afterEntrykind.findIndex((segment) => Marks.has(segment)))
    return { ...this.scope, labelpath: labels.filter((segment) => segment !== '/').join('/') }
  }
  // --

  // == [TSQ Helpers]: #answerOfTSQ, #minderEventOf

  // Its caller starts any refresh first, so that a vacant answer is isFetching. A removed item is vacant.
  /** The {@link TSQGotAnswer} the cache gives for `ask`'s scope, timely within `opts.staleTime`, or the minder's own. */
  #answerOfTSQ(ask: GetAsk, opts: MinderGetOpts): TSQGotAnswer {
    const itemQuery = this.#tsqFind(ask)
    const lastErr   = itemQuery?.state.error ? Outcome.storageRefusalOf(itemQuery.state.error) : null
    return {
      ...gotAnswerOf(ask, itemQuery, this.#isBehindAt(ask), opts.staleTime ?? this.#queryCacheOpts.staleTime),
      refreshedAt: itemQuery?.state.dataUpdatedAt ?? 0,
      isFetching:  (itemQuery?.state.fetchStatus === 'fetching'),
      lastErr,
    }
  }

  // The emitted event pragmatically mimics the incoming TSQ event.
  // A key's kind says what its query caches: an item, a soon or a listing. A removed query still has its last state, which its
  // event tells, though the cache no longer has it. An item is invalidated when it falls behind its soon, or its get is
  // refused; a listing, by `invalidate` or a refused list. A soon is never invalidated or fetched.
  /** The event a listener is told of `tsqEvent`, an event of the minder's cache, or undefined for an observer's or another bank's. */
  #minderEventOf(tsqEvent: TSQ.QueryCacheNotifyEvent): MinderEvent | undefined {
    if (! isTellableTSQEvent(tsqEvent)) { return undefined }
    if (! TSQ.partialMatchKey(tsqEvent.query.queryKey, bankKeyHeadOf(this.scope))) { return undefined }
    const { queryKey, queryHash, state } = tsqEvent.query
    const { labelpath } = this.#scopeOfQueryKey(queryKey)
    const told = {
      eventkind: queryKey[EntrykindIdx] as MinderEventkind,
      type:      tsqEvent.type,
      action:    (tsqEvent.type === 'updated') ? Object.freeze({ ...tsqEvent.action }) : undefined,
      queryKey:  Object.freeze([...queryKey]),
      queryHash,
      state:     Object.freeze({ ...state }),
      ...this.scope,
      labelpath,
      modelkind: Labelpath.modelkindOf(labelpath),
    }
    // A listing lists Things of its parent's kind, as a labelpath starts with its parent's.
    if (told.eventkind === Listkind) { return Object.freeze(told) as ListingEvent }
    const record = told.state.data as DeliverableThing | undefined
    // The record at a labelpath is of the kind its labelpath starts with.
    return Object.freeze({
      ...told, revtok: record?.revtok, revseq: record?.revseq, am: record?.am, lifeseq: record?.lifeseq, lifepath: record?.lifepath,
    }) as ThingEvent | SoonEvent
  }
  // --
}

// == [Helpers]: Itemkind, Soonkind, Listkind, EntrykindIdx, Marks, labelsOf, bankKeyHeadOf, BareListedAt, TellableTSQEvent, isTellableTSQEvent, isNewer, isOlder, gotAnswerOf, isTimelyQuery, listingOf, landedListingOf

/** The entrykind segment of an item's query key. */
const Itemkind = 'item'
/** The entrykind segment of a soon's query key. */
const Soonkind = 'soon'
/** The entrykind segment of a listing's query key. */
const Listkind = 'list'
/** Where a query key's entrykind segment is: after the bank's three. */
const EntrykindIdx = 3
/** The marks a query key's labels end at. */
const Marks: ReadonlySet<unknown> = new Set(['!', '~', '#'])

/** The labels of `labelpath`, with '/' between them, as a query key spells them. */
function labelsOf(labelpath: Labelpath): string[] {
  return labelpath.split('/').flatMap((label) => ['/', label]).slice(1)
}

/** The part of a query key that every key of `scope`'s bank has in common. */
function bankKeyHeadOf({ userid, banklabel }: BankScope): string[] { return ['sok', userid, banklabel] }

/** The time a bare listing was last listed: TanStack's `dataUpdatedAt` for a query no fetch has set. */
const BareListedAt = 0

/** A cache event a listener hears of, as {@link isTellableTSQEvent} narrows it: a query added, updated or removed. */
type TellableTSQEvent = Readonly<
  | { type: 'added' | 'removed', query: TSQ.Query }
  | { type: 'updated', query: TSQ.Query, action: TSQQueryAction }
>

// The observers' events are of another flavour: their bookkeeping changes no query's state, and the minder has none.
/** True for a cache event a listener hears of: any but an observer's. */
function isTellableTSQEvent(event: TSQ.QueryCacheNotifyEvent): event is TellableTSQEvent {
  return (event.type === 'added') || (event.type === 'updated') || (event.type === 'removed')
}

/** True when `record` is newer than `prior`, or `prior` is undefined. */
function isNewer(prior: DeliverableThing | undefined, record: DeliverableThing): boolean {
  return (prior === undefined) || (Thing.cmp(prior, record) > 0)
}

/** True when `record` is older than `prior`; false where `prior` is undefined. */
function isOlder(prior: DeliverableThing | undefined, record: DeliverableThing): boolean {
  return (prior !== undefined) && (Thing.cmp(prior, record) < 0)
}

/** The {@link GotAnswer} for `itemQuery`, the query of `ask`'s item, with its record and whether it is timely within `staleTime`. */
function gotAnswerOf(ask: GetAsk, itemQuery: TSQ.Query<ThingRecord | Tombstone<ThingRecord>> | undefined, isBehind: boolean, staleTime: TsqStaleTime): GotAnswer & Pick<TSQGotAnswer, 'record' | 'isTimely'> {
  const record   = itemQuery?.state.data
  const isTimely = isTimelyQuery(itemQuery, isBehind, staleTime)
  const base     = { ok: true, record, ask, world: null, isTimely } as const
  // A newer revision heard of, with no item, is something cached all the same.
  if ((record === undefined) && (! isBehind))  { return { ...base, act: 'vacant',   val: undefined } }
  if ((record === undefined) || (! isTimely))  { return { ...base, act: 'untimely', val: undefined } }
  if (Thing.isVoidSentinel(record))            { return { ...base, act: 'gotvoid',  val: null } }
  if (Thing.isGone(record))                    { return { ...base, act: 'gotgone',  val: record } }
  return                                                { ...base, act: 'gotlive',  val: record }
}

/** True when `itemQuery` has a record, is not behind, and is fresh under `staleTime` as TanStack Query counts it. */
function isTimelyQuery(itemQuery: TSQ.Query<ThingRecord | Tombstone<ThingRecord>> | undefined, isBehind: boolean, staleTime: TsqStaleTime): boolean {
  if ((itemQuery === undefined) || isBehind) { return false }
  return (! itemQuery.isStaleByTime(staleTime))
}

/** A listing of every labelpath in `prior` and in `labelpaths`, once each, in labelpath order. */
function listingOf(prior: readonly Labelpath[], labelpaths: readonly Labelpath[]): Labelpath[] {
  // Labelpaths sort by code unit, as the vaultDB lists them; the union has no two alike. The rule's `one - other` is for numbers.
  return union(prior, labelpaths).toSorted((one: Labelpath, other: Labelpath) => ((one < other) ? -1 : 1)) // eslint-disable-line unicorn/prefer-simple-sort-comparator
}

// A list lands what it lists over what the listing had, so a Thing that joined while the list was under way stays listed.
/** TanStack's structural sharing for a listing: every labelpath `prior` and `next` list, frozen; `prior` itself where `next` adds none. */
const landedListingOf = (prior: unknown, next: unknown): unknown => {
  const landed = listingOf((prior ?? []) as readonly Labelpath[], next as readonly Labelpath[])
  return Object.freeze(TSQ.replaceEqualDeep(prior, landed))
}
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
