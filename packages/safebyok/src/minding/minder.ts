// The Minder is an exemplar at both of its ends. Its interface is the minder as we would design it for the layer in
// front of it: scopes, records, acts and refusals, in our vocabulary. Its implementation shows TanStack Query used as
// its authors intend: each need is met by the feature TanStack built for that job (query defaults, structural sharing,
// the error state, the cache's events), chosen because it fits, not because it was nearest to hand.
// Where a ruling, a design note or this code seems to serve one end at the other's expense, report it rather than split
// the difference.

/** `Minder`, the code a VaultMinder and a BankMinder share: they mind the Things of one bank in a TanStack Query cache, its own or one shared with minders of other banks. */

import * as TSQ from '@tanstack/query-core'
import { deepFreeze } from 'es-toolkit'
import { CX, Outcome, Validator } from 'safebyok-big/internals'
import { type Banklabel, type Userid, Labelpath } from '../shapes/primitives'
import { type BoxRecord, type Sparse, type ThingRecord, type ThingScope, type Tombstone, type VoidSentinel, Shell, ThingChecks } from '../shapes/shapes-thing'
import { Thing } from '../models/thing'
import type { BankScope } from '../shapes/shapes-stamps'
import { type GetAsk, type ThingWatchScope, type WorldRecord, type WriteAsk } from '../shapes/shapes-asks'
import type { Kids, ThingNotice, VaultDB, WriteThingAnswer } from '../storage/vault-db'
import { refusedAnswerOf } from '../storage/refused-answer'
import {
  type DeliverableThing, type GotAnswer, type MinderEvent, type MinderFriend, type MinderGetOpts, type MinderOpts, type MinderTryAtOpts,
  type MinderInvalidateOpts, type QueryCacheOpts, type ScopeAt, type TSQAnswer, type TSQGotAnswer, type ThingAt, type ThingEvent, type SoonEvent, type TsqStaleTime, type ListingEvent, type MinderEventkind, type MinderEventFormat, type TSQQueryAction,
  FixedQueryCacheOpts, MinderChecks,
} from '../shapes/shapes-minder'
import { bankKeyHeadOf } from './minder-keys'
import { newerThingOf } from './newer-thing'
import { bulletproofHandlerOf } from '../helpers/bulletproof'
import * as Phrases from '../phrases'
import * as Throwers from '../refusals/throwers'

/** Anything naming a labelpath: a scope, an ask or a record. */
export type Labelpathed = { labelpath: Labelpath }

/** This device's cache of the Things of one bank it minds, kept from everything the vaultDB tells of them.
 * A subclass says which Things it minds: a VaultMinder the boxes under the root box, a BankMinder the bank, its main gate and its root box.
 * Each Thing minded has an item, with the whole record a host shows: live, its tombstone, or its shell where nothing is stored.
 * It may also have a soon: a sparse record newer than the item, removed once the item catches up. Each Thing whose
 * children it minds has a listing of them, once listed.
 * Records arrive from gets, lists, good writes, the world each answer carries, and the watch, in any order, late or more
 * than once. A whole record, tombstone or shell lands in the item and a sparse record in the soon. A listing is the
 * {@link Kids} value a list answered, replaced whole by the next. A record of a Thing it does not mind lands nowhere. It
 * caches only from `hello` until `goodbye`, and `goodbye` empties its cache.
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
 *   back either: each record told of an item, or of a soon, is no older than the last, and each listing was read no
 *   earlier than the last. Only a removal breaks the run, and what is told after it starts over. A soon is removed
 *   whenever the item catches up with it; the cache removes an item or a listing only at `goodbye`.
 *   {@link ThingEvent}, {@link SoonEvent} and {@link ListingEvent} give the order of the events.
 * - A get answered with a revision older than the newest cached when it began refuses `stale_read`, and changes nothing.
 * - A listing is what the vaultDB last answered a list of its parent with, never joined to: a list landing replaces it
 *   whole, unless the listing cached was read later, by `read_tc`. A list refused leaves it as it was.
 * - A child's first stored record to land, in its item or its soon while the other has none, marks its parent's listing
 *   stale, and a listing a host observes is listed again. A shell marks nothing.
 * - An operation caches its own good answer (the record got or written, or the {@link Kids} value listed, never a write's
 *   ask) and the bank and main gate of the world its answer carries, refused or not. Any other record an answer carries (a
 *   refusal's `dbhas`, a list's parentage and deltas, or a tracked bank, main gate or root box) is cached only as the
 *   watch tells of it, and the watch tells of it before the operation returns.
 * - A refused write changes no item it writes and marks nothing stale. Its `dbhas`, through the watch, may still change an item.
 * - A write's answer and the watch's notice of the same write leave the same item, in either order: the later changes nothing.
 * - `invalidate` asks the vaultDB nothing, and marks listings stale, never items: it changes no item, and no listing.
 */
export abstract class Minder {
  // == [Props]: userid, banklabel, #bank, vaultDB, #tsq, #landers, #queryCacheOpts, #unwatch, #isReady
  readonly userid:    Userid
  readonly banklabel: Banklabel
  readonly #bank:           MinderFriend
  /** Where the bank's Things are stored. */
  protected readonly vaultDB: VaultDB
  readonly #tsq:            TSQ.QueryClient
  /** The minders attached to `#tsq`, this one among them while minding. */
  readonly #landers:        Map<string, Lander>
  readonly #queryCacheOpts: Readonly<QueryCacheOpts>
  #unwatch: (() => void) | null = null
  /** True while minding: from `hello` until `goodbye`. */
  #isReady = false
  // --

  // == [Construction]: constructor, makeClient, isClient, #setQueryDefaults

  // A subclass freezes the minder once its own fields are set.
  /** A minder of `bank`'s Things over `opts`, checked by the subclass's `make`. */
  protected constructor(opts: MinderOpts & Readonly<{ queryCacheOpts: QueryCacheOpts }>, bank: MinderFriend) {
    const { userid, banklabel } = bank.scope
    this.userid          = userid
    this.banklabel       = banklabel
    this.#bank           = bank
    this.vaultDB         = opts.vaultDB
    this.#queryCacheOpts = Object.freeze(opts.queryCacheOpts)
    this.#tsq            = opts.queryClient ?? Minder.makeClient()
    this.#landers        = LandersOfClient.get(this.#tsq)!
  }

  // TanStack calls the cache's onSuccess right after a fetch's record lands, and never for setQueryData: sendToTSQ does
  // the same for every other record.
  /** Make a QueryClient that minders of several banks can share, each minding its own bank's entries.
   * Hand it to `make` as `queryClient`. Its cache settles a fetched record only while a minder of the record's bank is minding.
   */
  static makeClient(): TSQ.QueryClient {
    const landers     = new Map<string, Lander>()
    const queryClient = new TSQ.QueryClient({
      queryCache: new TSQ.QueryCache({ onSuccess: (val, tsqQuery) => { landers.get(bankHashOf(tsqQuery.queryKey))?.(val, tsqQuery.queryKey) } }),
    })
    LandersOfClient.set(queryClient, landers)
    return queryClient
  }

  /** True for a QueryClient {@link makeClient} made: the only kind `make` accepts. */
  static isClient(val: unknown): val is TSQ.QueryClient {
    return LandersOfClient.has(val as TSQ.QueryClient)
  }

  // The client's own defaults are left to whoever owns it. TanStack matches query defaults by key prefix, and the kind of
  // entry follows the bank's segments in every key, so one prefix each gives the items, the soons and the listings of
  // this bank their own, the fixed options over any the client sets. Under skipToken, TanStack never fetches a soon.
  // They are set at hello, not at make: a minder of the same bank made while another minds must not take its queries over.
  /** Set the query defaults of this bank's items, soons and listings in the client. */
  #setQueryDefaults(): void {
    const fixed    = { ...FixedQueryCacheOpts, staleTime: this.#queryCacheOpts.staleTime }
    const bankHead = bankKeyHeadOf(this.scope)
    this.#tsq.setQueryDefaults([...bankHead, Itemkind], {
      ...fixed,
      queryFn:           ({ queryKey }) => this.#fetchRecord(this.#askAt(this.#scopeOfQueryKey(queryKey))),
      structuralSharing: newerThingOf,
    })
    this.#tsq.setQueryDefaults([...bankHead, Soonkind], { ...fixed, queryFn: TSQ.skipToken, structuralSharing: newerThingOf })
    this.#tsq.setQueryDefaults([...bankHead, Listkind], {
      ...fixed,
      queryFn:           ({ queryKey }) => this.#fetchListing(this.#scopeOfQueryKey(queryKey)),
      structuralSharing: landedKidsOf,
    })
  }
  // --

  // == [Starting and ending]: hello, goodbye

  /** Start minding: until `goodbye`, answer gets, and cache each change the vaultDB notifies. A second call does nothing.
   * Refuses while another minder of this bank is minding in the same client.
   */
  hello(): void {
    if (this.#isReady) { return }
    const bankHash = bankHashOf(bankKeyHeadOf(this.scope))
    if (this.#landers.has(bankHash)) { throw Throwers.bankMindedInClient() }
    this.#isReady = true
    this.#landers.set(bankHash, (val, queryKey) => { this.#landedByFetch(val, queryKey) })
    this.#setQueryDefaults()
    this.#unwatch = this.vaultDB.watch(
      this.scope,
      // Synchronous on purpose: the vaultDB notifies of a refusal's dbhas, each changed tracked Thing and a list's parentage and deltas before its verb returns. An await here would cache them after the operation resumes.
      (notice: ThingNotice) => { this.sendToTSQ(notice.val) },
      (news)                => { this.#bank.tellBadNews([news]) },
    )
  }

  /** Stop minding, and remove this bank's entries from the cache. A later `hello` starts minding again. */
  goodbye(): void {
    this.#isReady = false
    if (this.#unwatch) { this.#unwatch() }
    this.#unwatch = null
    this.#landers.delete(bankHashOf(bankKeyHeadOf(this.scope)))
    this.#tsq.removeQueries({ queryKey: bankKeyHeadOf(this.scope) })
  }
  // --

  // == [Reading]: at, soonAt, isBehindAt, listingAt, tryAt, get, tryGet, backgroundRefresh, list, tryList, isStaleAt, listen

  /** The record `scoped`'s item has, however old, or undefined for no item. Never asks the vaultDB. */
  at<LabelpathT extends Labelpath>(scoped: ScopeAt<LabelpathT>): ThingAt<LabelpathT> | Tombstone<ThingAt<LabelpathT>> | undefined {
    return this.#itemAt(this.#demandItemScope(scoped)) as ThingAt<LabelpathT> | Tombstone<ThingAt<LabelpathT>> | undefined
  }

  /** The sparse record `scoped`'s soon has, newer than its item, or undefined for no soon. Never asks the vaultDB. */
  soonAt<LabelpathT extends Labelpath>(scoped: ScopeAt<LabelpathT>): Sparse<ThingAt<LabelpathT>> | undefined {
    return this.#soonAt(this.#demandItemScope(scoped)) as Sparse<ThingAt<LabelpathT>> | undefined
  }

  /** True when `scoped`'s item is behind: a soon newer than the item is cached, or a soon with no item. Never asks the vaultDB. */
  isBehindAt(scoped: ThingScope): boolean {
    return this.#isBehindAt(this.#demandItemScope(scoped))
  }

  /** The cached listing of `scoped`'s children, however old, or undefined for none: the {@link Kids} value a list last answered. Never asks the vaultDB. */
  listingAt(scoped: ThingScope): Kids | undefined {
    return this.#tsq.getQueryData<Kids>(this.listQueryKey(this.#demandListingScope(scoped)))
  }

  /** The cache's answer for `scoped`, without waiting on the vaultDB.
   * An item that is not timely answers `untimely`, with no `val`, and so does a newer revision heard of with no item.
   * Under `ifStale: 'refresh'`, it also fetches a stale or missing item in the background ({@link MinderTryAtOpts}).
   */
  tryAt<LabelpathT extends Labelpath>(scoped: ScopeAt<LabelpathT>, opts: MinderTryAtOpts = {}): TSQAnswer<ThingAt<LabelpathT>> {
    try {
      MinderChecks.minderTryAtOpts.parse(opts)
      this.#demandReady()
      const scope = this.#demandItemScope(scoped)
      if (opts.ifStale === 'refresh') { this.backgroundRefresh(scope, { staleTime: opts.staleTime }) }
      return this.#answerOfTSQ(this.#askAt(scope), opts) as TSQGotAnswer<ThingAt<LabelpathT>>
    } catch (err) {
      // The try asks the vaultDB nothing: what it throws that is no refusal is a bug.
      return refusedAnswerOf({ ...scoped, op: 'get', ifAbsent: 'nil' }, err)
    }
  }

  /** Get `scoped`'s whole record, its tombstone or its shell: the cached one if timely, else from the vaultDB. A get already under way is shared.
   * Refuses `stale_read` when the vaultDB answers with a revision older than one cached when the get began. A later get asks again.
   * A get of a box the vaultDB has nothing for refuses while the root box is not cached: its shell is of the root box's life.
   */
  async get<LabelpathT extends Labelpath>(scoped: ScopeAt<LabelpathT>, opts: MinderGetOpts = {}): Promise<ThingAt<LabelpathT> | Tombstone<ThingAt<LabelpathT>>> {
    MinderChecks.minderGetOpts.parse(opts)
    this.#demandReady()
    return await this.#doGet(this.#demandItemScope(scoped), opts) as ThingAt<LabelpathT> | Tombstone<ThingAt<LabelpathT>>
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

  /** List the Things directly under `labelpath` from the vaultDB, as the {@link Kids} value it answers: the live ones and the tombstones, by label.
   * A list called while another of the same labelpath is under way answers what that one does.
   * The listing at `labelpath` ({@link listingAt}) takes the answer, unless it has one read later. The parent and each child
   * listed land first: a live child as its soon where it is newer than the item, so the next get fetches the item whole; a
   * tombstone in the item, so a get of it answers from the cache. A Thing stored damaged is left out, and reported to the bank's `tellBadNews`.
   */
  async list(labelpath: Labelpath): Promise<Kids> {
    this.#demandListingScope({ ...this.scope, labelpath: MinderChecks.minderLabelpath.parse(labelpath) })
    this.#demandReady()
    // Under staleTime 0 TanStack fetches whatever the listing holds, and shares a fetch under way.
    return await this.#tsq.query<Kids>({ queryKey: this.listQueryKey({ labelpath }), staleTime: 0 })
  }

  /** {@link list}, resolving an `Outcome` instead of throwing: a refusal, misuse included, is its bad outcome. */
  async tryList(labelpath: Labelpath): Promise<Outcome.Outcome<Kids>> {
    return await Outcome.outcomeOf(() => this.list(labelpath))
  }

  /** True when the item is not timely for a {@link get} with these `opts`.
   * A `staleTime` given wins over the item's being behind, as for a get, and an item invalidated is stale whatever the staleTime.
   */
  isStaleAt(scoped: ThingScope, opts: MinderGetOpts = {}): boolean {
    MinderChecks.minderGetOpts.parse(opts)
    const scope = this.#demandItemScope(scoped)
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
   * Each listing marked tells one {@link ListingEvent} with `state.isInvalidated` true, and no more until a list sets it again.
   * A listing a refused list left stale tells none.
   * It asks the vaultDB nothing, and leaves each listing unchanged.
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
   * The record written, and the bank and main gate of the answer's world, are cached before it answers, where this minder minds them. A refusal's `dbhas` is cached only as the watch tells of it.
   * Before `hello`, after `goodbye`, or for a Thing this minder does not mind, it answers the refusal without asking the vaultDB.
   * Rejects, whether or not the write was made, when the answer carries a record of another bank.
   */
  async tryWrite(ask: WriteAsk): Promise<WriteThingAnswer> {
    try {
      this.#demandReady()
      this.#demandItemScope(ask)
    } catch (err) {
      return refusedAnswerOf(ask, err)
    }
    const answer = await this.vaultDB.tryWriteThing(ask)
    // A refusal's dbhas, and any tracked and updated bank, main gate or root box, land through the watch.
    this.#landWorld(answer.world)
    if (answer.ok) { this.sendToTSQ(answer.val) }
    return answer
  }

  /** {@link tryWrite}, throwing its refusal instead of answering it: the record written, on success. */
  async write(ask: WriteAsk): Promise<ThingRecord> {
    return Outcome.valOf(await this.tryWrite(ask))
  }
  // --

  // == [TSQ Direct Cache Calls]: #doGet, #fetchRecord, #fetchListing, #itemAt, #soonAt, #soonestAt, #isBehindAt, #tsqFind, sendToTSQ, #landWorld, #landedByFetch, #settleLanded, #isFirstStored, #markBehinds

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
    const answer = await this.vaultDB.tryGetThing(ask)
    this.#landWorld(answer.world)
    // Thrown unchanged. The `dbhas` is delivered through the watch, never from here.
    if (! answer.ok) { throw answer.err }
    const record = (answer.act === 'gotvoid') ? this.#shellAt(ask) : this.#checkedDelivered(answer.val, ask)
    // TanStack leaves the item and its time as they were, marks it invalidated, and caches the refusal beside it as its error.
    if ((prior !== undefined) && (Thing.cmp(prior, record) < 0)) { throw Throwers.staleRead(ask) }
    return deepFreeze(record)
  }

  // Only the Kids value lands here: the vaultDB notifies the parent and each Thing listed before it answers, so each lands
  // through the watch before the listing itself does.
  /** Fetch the {@link Kids} value of `scoped`'s children, deeply frozen, telling the bank's `tellBadNews` of any Thing stored damaged. */
  async #fetchListing(scoped: ThingScope): Promise<Kids> {
    const ask    = this.#bank.makeListAsk({ labelpath: scoped.labelpath, ifAbsent: 'nil' })
    const answer = await this.vaultDB.tryListThings(ask)
    this.#landWorld(answer.world)
    if (! answer.ok) { throw answer.err }
    if (answer.damaged_rows.length > 0) { this.#bank.tellBadNews([Throwers.childrenStoredDamaged(ask, answer.damaged_rows)]) }
    return deepFreeze(answer.val)
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
  /** Cache `record` in its item or soon while minding, where this minder minds its Thing.
   * A whole record older than the item, or a sparse one no newer than the soonest cached, lands nowhere.
   */
  protected sendToTSQ(record: DeliverableThing): void {
    if (! this.#isReady) { return }
    deepFreeze(this.#checkedDelivered(record, this.scope))
    if (! this.mindsItemAt(record.labelpath)) { return }
    let isFirst = false
    if (! Thing.isSparse(record)) {
      const prior = this.#itemAt(record)
      if (! isOlder(prior, record)) {
        this.#tsq.setQueryData(this.itemQueryKey(record), record)
        isFirst = this.#isFirstStored(record, this.itemQueryKey(record), prior)
      }
    } else if (isNewer(this.#soonestAt(record), record)) {
      this.#tsq.setQueryData(this.soonQueryKey(record), record)
      isFirst = this.#isFirstStored(record, this.soonQueryKey(record), undefined)
    }
    this.#settleLanded(record, isFirst)
  }

  // The world is read with the answer, in one step: its bank and main gate are as new as the answer.
  /** Cache the bank and main gate of `world`, an answer's world, where this minder minds them. */
  #landWorld(world: WorldRecord | null): void {
    if (world === null) { return }
    const { maingate, ...bank } = world
    this.sendToTSQ(bank)
    this.sendToTSQ(maingate)
  }

  // A listing's fetch needs nothing more: the Things it lists landed through the watch before it. A soon is never fetched.
  /** Settle what a fetch that just landed `val` under `queryKey` brings about, where it is an item of this bank. */
  #landedByFetch(val: unknown, queryKey: TSQ.QueryKey): void {
    if (! TSQ.partialMatchKey(queryKey, [...bankKeyHeadOf(this.scope), Itemkind])) { return }
    const record = val as DeliverableThing
    this.#settleLanded(record, this.#isFirstStored(record, queryKey, undefined))
  }

  // The record has landed before #markBehinds invalidates the item or removes the soon, so a listener told of a soon's
  // success already finds the item behind, and a get there fetches it; and the item's invalidate follows the soon's
  // success at once, before the listing's. cancelRefetch false: a list's own children land while it is under way, and
  // the list joined takes them in; any other refetch would cancel it and start it again.
  /** Bring `record`'s soon and item up to date with its having landed, or been dropped, and mark its parent's listing stale where `isFirst`. */
  #settleLanded(record: DeliverableThing, isFirst: boolean): void {
    this.#markBehinds(record)
    if (! isFirst) { return }
    void this.#tsq.invalidateQueries({ queryKey: this.listQueryKey({ labelpath: Labelpath.parentOf(record.labelpath) }), exact: true }, { cancelRefetch: false })
  }

  // TanStack counts each landing in an entry's dataUpdateCount, 1 at its first. A shell holds an item where nothing is
  // stored, so the first stored record over it counts as first too: a box put on this device gets its shell first.
  /** True when `record`, just landed under `landedKey` over `prior`, is the first stored record of its Thing: its entry's first landing,
   * or its first over a shell, while its other entry, the item or the soon, has no stored record.
   */
  #isFirstStored(record: DeliverableThing, landedKey: TSQ.QueryKey, prior: DeliverableThing | undefined): boolean {
    if (Thing.isVoidSentinel(record)) { return false }
    const isFirstHere = (this.#tsq.getQueryState(landedKey)?.dataUpdateCount === 1) || ((prior !== undefined) && Thing.isVoidSentinel(prior))
    const other = Thing.isSparse(record) ? this.#itemAt(record) : this.#soonAt(record)
    return isFirstHere && ((other === undefined) || Thing.isVoidSentinel(other))
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

  /** The shell of the Thing at `labelpathed`: a box's in the life of the bank's root box. */
  #shellAt(labelpathed: Labelpathed): VoidSentinel {
    return Shell.of(labelpathed, this.rootBox)
  }
  // --

  // == [What a subclass minds]: mindsItemAt, mindsListingAt, rootBox

  /** True for the labelpath of a Thing whose item and soon this minder caches. */
  protected abstract mindsItemAt(labelpath: Labelpath): boolean

  /** True for the labelpath of a Thing whose listing of children this minder caches. */
  protected abstract mindsListingAt(labelpath: Labelpath): boolean

  /** The bank's root box, the parent of every box, as last heard of: its shell while none is. */
  abstract get rootBox(): BoxRecord | VoidSentinel
  // --

  // == [Checks]: scope, queryClient, #demandOwnScope, #demandItemScope, #demandListingScope, #checkedDelivered, #demandReady, #scopeOfQueryKey

  /** The scope of this minder's bank. */
  get scope(): ThingWatchScope { return { userid: this.userid, banklabel: this.banklabel } }

  /** The QueryClient this minder caches in: hand it to TanStack's `QueryClientProvider` to observe what it caches. */
  get queryClient(): TSQ.QueryClient { return this.#tsq }

  /** The scope of `labelpathed`, demanding that it is in this minder's bank. */
  #demandOwnScope(labelpathed: Labelpathed): ThingScope {
    // Its fields alone: an ask or a record passes, and is read as its scope.
    return ThingChecks.thingScope.parseConsistent(labelpathed, this.scope)
  }

  /** The scope of `labelpathed`, demanding that it is a Thing of this minder's bank whose item it minds. */
  #demandItemScope(labelpathed: Labelpathed): ThingScope {
    const scope = this.#demandOwnScope(labelpathed)
    if (! this.mindsItemAt(scope.labelpath)) { throw Throwers.notMinded() }
    return scope
  }

  /** The scope of `labelpathed`, demanding that it is a Thing of this minder's bank whose listing it minds. */
  #demandListingScope(labelpathed: Labelpathed): ThingScope {
    const scope = this.#demandOwnScope(labelpathed)
    if (! this.mindsListingAt(scope.labelpath)) { throw Throwers.notMinded() }
    return scope
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

// == [Helpers]: Itemkind, Soonkind, Listkind, EntrykindIdx, Marks, labelsOf, bankHashOf, Lander, LandersOfClient, TellableTSQEvent, isTellableTSQEvent, isNewer, isOlder, gotAnswerOf, isTimelyQuery, isKids, landedKidsOf

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

/** The hash of `queryKey`'s first three segments, which are its bank's where it is a minder's key. */
function bankHashOf(queryKey: TSQ.QueryKey): string { return TSQ.hashKey(queryKey.slice(0, EntrykindIdx)) }

/** What a client's cache hands a record a fetch just landed under `queryKey`, for the minder of its bank to settle. */
type Lander = (val: unknown, queryKey: TSQ.QueryKey) => void

// A client is a TanStack QueryClient as a host's QueryClientProvider takes it, so what minders it has is kept beside it.
/** The minders attached to each client {@link Minder.makeClient} made, by {@link bankHashOf} of their bank's key head. */
const LandersOfClient = new WeakMap<TSQ.QueryClient, Map<string, Lander>>()

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

/** True for a {@link Kids} value. */
function isKids(val: unknown): val is Kids {
  return CX.isPlainBag(val) && (val['modelkind'] === 'kids')
}

// TanStack shares structure through this both between a listing's values and between what a host's `select` returns from
// them, so anything but two Kids values gets TanStack's own default. A read_tc compares as text in the order of the reads.
/** TanStack's structural sharing for a listing: `prior` where it was read later than `next`, else `next`, frozen, with the parts equal to `prior`'s kept. */
function landedKidsOf(prior: unknown, next: unknown): unknown {
  if (isKids(prior) && isKids(next) && (prior.read_tc > next.read_tc)) { return prior }
  return deepFreeze(TSQ.replaceEqualDeep(prior, next))
}
// --

// == [Checks]: MinderOptsChecks, DeliveredChecks

/** The checks of the options every minder is made with, which each subclass's `make` extends. */
export const MinderOptsChecks = Validator.Checkers('bad_record', ({ obj, custom }) => ({
  minderOpts: obj({
    vaultDB:        ThingChecks.vaultDBShape,
    queryCacheOpts: MinderChecks.queryCacheOptsOrDefault,
    queryClient:    custom<TSQ.QueryClient>((val) => Minder.isClient(val), Phrases.MinderClientExpected).optional(),
  }),
}))

/** The check of a record the vaultDB delivers, refusing `unexpected_error`: a record of another scope is a bug in the vaultDB. */
const DeliveredChecks = {
  thingScope: ThingChecks.thingScope.refusingAs('unexpected_error'),
}
// --
