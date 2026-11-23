// The Minder is an exemplar at both of its ends. Its interface is the minder as we would design it for the layer in
// front of it: scopes, records, acts and refusals, in our vocabulary. Its implementation shows TanStack Query used as
// its authors intend: each need is met by the feature TanStack built for that job (query defaults, structural sharing,
// the error state, the cache's events), chosen because it fits, not because it was nearest to hand.
// Where a ruling, a design note or this code seems to serve one end at the other's expense, report it rather than split
// the difference.

/** `Minder`, the code a VaultMinder and a BankMinder share: they mind the Things of one bank in a TanStack Query cache of their own. */

import * as TSQ from '@tanstack/query-core'
import { type Persister, persistQueryClientRestore, persistQueryClientSubscribe } from '@tanstack/query-persist-client-core'
import { deepFreeze } from 'es-toolkit'
import { CX, Outcome, Validator } from 'safebyok-big/internals'
import { type Banklabel, type Userid, Labelpath } from '../shapes/primitives'
import { type Sparse, type ThingCited, type ThingRecord, type ThingScope, type Tombstone, Shell, ThingChecks, ThingFormat } from '../shapes/shapes-thing'
import { Thing } from '../models/thing'
import type { BankScope } from '../shapes/shapes-stamps'
import { type GetAsk, type ThingWatchScope, type WorldRecord, type WriteAsk } from '../shapes/shapes-asks'
import type { GetThingAnswer, Kids, ThingNotice, VaultDB, WriteThingAnswer } from '../storage/vault-db'
import { refusedAnswerOf } from '../storage/refused-answer'
import {
  type DeliverableThing, type GotAnswer, type MinderEvent, type MinderFriend, type MinderGetOpts, type MinderOpts, type MinderTryAtOpts,
  type MinderInvalidateOpts, type QueryCacheOpts, type ScopeAt, type TSQAnswer, type TSQGotAnswer, type ThingAt, type ThingEvent, type SoonEvent, type DeadEvent, type TsqStaleTime, type ListingEvent, type MinderEventkind, type MinderEventFormat, type TSQQueryAction,
  FixedQueryCacheOpts, MinderChecks,
} from '../shapes/shapes-minder'
import { MinderKeyRoot, bankKeyHeadOf } from './minder-keys'
import { newerThingOf } from './newer-thing'
import { bulletproofHandlerOf } from '../helpers/bulletproof'
import * as Phrases from '../phrases'
import * as Throwers from '../refusals/throwers'

/** Anything naming a labelpath: a scope, an ask or a record. */
export type Labelpathed = { labelpath: Labelpath }

/** This device's cache of the Things of one bank it minds, kept from everything the vaultDB tells of them.
 * A subclass says which Things it minds: a VaultMinder the boxes under the root box, a BankMinder the bank, its main gate and its root box.
 * Each Thing minded has an item, with what a host shows: its live whole record, or null where none is stored live.
 * It may also have a soon, a sparse record newer than the item, removed once the item catches up; and a dead record, its
 * tombstone that last landed. Each Thing whose children it minds has a listing of them, once listed.
 * Records arrive from gets, lists, good writes, the world each answer carries, and the watch, in any order, late or more
 * than once. A live whole record lands in the item, a sparse record in the soon, and a tombstone in the dead record and
 * then, as null, in the item. A listing is the {@link Kids} value a list answered, replaced whole by the next. Of a Thing
 * it does not mind, only what a get or list of it answers is cached, and no later record brings that up to date: get and
 * list only the Things it minds. It caches only from `hello` until `goodbye`, and `goodbye` empties its cache.
 *
 * ## Invariants
 * - For a caller or listener using it as documented, what it shows depends only on which records the minder has heard
 *   of, never on the order they arrived in.
 * - An item, a soon and a dead record never go back. An item that is null counts as its dead record's tombstone, or
 *   where it has none, as nothing stored, older than every record. The item has the newest whole record or tombstone
 *   heard of, a tombstone as null, and the soon the newest sparse record while that is newer than the item. A newer
 *   life replaces an older one whole.
 * - A record that would take the item or soon back is dropped, nothing is told, and the item keeps its time: a sparse
 *   record no newer than the item or the soon, or a whole record or tombstone older than the item from any source but a get. One at the item's
 *   revision lands, and makes the item fresh as of then. The soon is removed once the item is no older than it.
 * - An item is behind while a soon newer than it is cached, or a soon with no item. Behind is that comparison, not
 *   whether a soon is cached: a `tryAt` or `isBehindAt` made while a record lands, once it has caught the item up but
 *   before the soon is removed, already finds the item not behind. An item behind is never timely. One an observer keeps
 *   active, as a hook does, is fetched again as it falls behind; any other waits for its next get.
 * - A sparse record lands in the soon before its item is invalidated, so from the soon's `success` on, every read and
 *   get finds the item behind ({@link SoonEvent}). A refused get leaves the item invalidated too, until a record lands in it.
 * - A listener is told of each item, soon, dead record and listing in the order the cache changes, and what it is told
 *   never goes back either: each record told of an item, a soon or a dead record is no older than the last, and each
 *   listing was read no earlier than the last. Only a removal breaks the run, and what is told after it starts over. A
 *   soon is removed whenever the item catches up with it; the cache removes any other query only at `goodbye`.
 *   {@link ThingEvent}, {@link SoonEvent}, {@link DeadEvent} and {@link ListingEvent} give the order of the events.
 * - A get answered with a revision older than the newest cached when it began refuses `stale_read`, and changes nothing.
 *   An answer of null counts as its tombstone, or as nothing stored.
 * - A good get resolves what the item holds once it resolves: its record, or null. A `tryAt` that answers `gotlive`,
 *   `gotgone` or `gotvoid` has the same as its `val`, and where that is null, the dead record's tombstone, or null, as its `dbhas`.
 * - A listing is what the vaultDB last answered a list of its parent with, never joined to: a list landing replaces it
 *   whole, unless the listing cached was read later, by `read_tc`. A list refused leaves it as it was.
 * - A child's first stored record to land, in its item, its soon or its dead record while the others have none, marks its
 *   parent's listing stale, and a listing a host observes is listed again. A null item is no stored record, and marks nothing;
 *   nor does a get's record that replaces it.
 * - An operation caches its own good answer (the record got or written, or the {@link Kids} value listed, never a write's
 *   ask) and the bank and main gate of the world its answer carries, refused or not. Any other record an answer carries (a
 *   refusal's `dbhas`, a list's parentage and deltas, or a tracked bank, main gate or root box) is cached only as the
 *   watch tells of it, and the watch tells of it before the operation returns.
 * - A refused write changes no item it writes and marks nothing stale. Its `dbhas`, through the watch, may still change an item.
 * - A write's answer and the watch's notice of the same write leave the same item, in either order: the later changes nothing.
 * - `invalidate` marks listings stale, never items. It lists again only a listing an observer keeps active, and asks the
 *   vaultDB nothing for the rest.
 */
export abstract class Minder {
  // == [Props]: #bank, vaultDB, #tsq, #queryCacheOpts, #unwatch, #isReady
  readonly #bank:           MinderFriend
  /** Where the bank's Things are stored. */
  protected readonly vaultDB: VaultDB
  readonly #tsq:            TSQ.QueryClient
  readonly #queryCacheOpts: Readonly<QueryCacheOpts>
  #unwatch: (() => void) | null = null
  /** True while minding: from `hello` until `goodbye`. */
  #isReady = false
  // --

  // == [Construction]: constructor, persist

  // TanStack calls the cache's onSuccess right after a fetch's record lands, and never for setQueryData: sendToTSQ does
  // the same for every other record. TanStack matches query defaults by key prefix, and every minder key starts with
  // MinderKeyRoot, so every query takes these from the start, a restored one included. Where an option differs by kind of
  // query, it reads the key's kind, or the value's for structural sharing, which TanStack hands no key.
  // A subclass freezes the minder once its own fields are set.
  /** A minder of `bank`'s Things over `opts`, checked by the subclass's `make`, with a QueryClient of its own. */
  protected constructor(opts: MinderOpts & Readonly<{ queryCacheOpts: QueryCacheOpts }>, bank: MinderFriend) {
    this.#bank           = bank
    this.vaultDB         = opts.vaultDB
    this.#queryCacheOpts = Object.freeze(opts.queryCacheOpts)
    this.#tsq            = new TSQ.QueryClient({ queryCache: new TSQ.QueryCache({ onSuccess: (val, { queryKey }) => { this.#landedByFetch(val, queryKey) } }) })
    this.#tsq.setQueryDefaults([MinderKeyRoot], {
      ...FixedQueryCacheOpts,
      queryFn:           async ({ queryKey }) => await this.#fetchAt(queryKey),
      // A list fetches whatever its listing holds.
      staleTime:         ({ queryKey }) => ((queryKey[EntrykindIdx] === Listkind) ? 0 : this.#queryCacheOpts.staleTime),
      structuralSharing: (prior: unknown, next: unknown) => (isKids(next) ? landedKidsOf(prior, next) : newerThingOf(prior, next, (scope) => this.#deadAt(scope))),
    })
  }

  // TanStack's own restore and save, with our defaults where its own would drop what we keep: a refused get's item, and a
  // snapshot more than a day old. A restore builds each query with its saved state and the client's query defaults, so no
  // structural sharing or onSuccess runs.
  /** Restore this minder's cache from the snapshot `persister` keeps, then save the cache to it at each change.
   * Call it before `hello`: what the minder caches then lands over what was restored.
   * Every query with a record or a listing is saved, an item whose last get was refused among them, and restored however
   * old, unless it was saved under another {@link ThingFormat}. No mutation is saved, paused or not.
   * Rejects where the restore fails, discarding the snapshot; saving goes on.
   */
  async persist(persister: Persister): Promise<void> {
    const queryClient = this.#tsq
    try {
      await persistQueryClientRestore({ queryClient, persister, buster: PersistBuster, maxAge: Infinity, hydrateOptions: RestoreOpts })
    } finally {
      persistQueryClientSubscribe({ queryClient, persister, buster: PersistBuster, dehydrateOptions: SaveOpts })
    }
  }
  // --

  // == [Starting and ending]: hello, goodbye

  /** Start minding: until `goodbye`, answer gets, and cache each change the vaultDB notifies. A second call does nothing. */
  hello(): void {
    if (this.#isReady) { return }
    this.#isReady = true
    this.#unwatch = this.vaultDB.watch(
      this.scope,
      // Synchronous on purpose: the vaultDB notifies of a refusal's dbhas, each changed tracked Thing and a list's parentage and deltas before its verb returns. An await here would cache them after the operation resumes.
      (notice: ThingNotice) => { this.sendToTSQ(notice.val) },
      (news)                => { this.#bank.tellBadNews([news]) },
    )
  }

  /** Stop minding, and remove this bank's queries from the cache. A later `hello` starts minding again. */
  goodbye(): void {
    this.#isReady = false
    if (this.#unwatch) { this.#unwatch() }
    this.#unwatch = null
    this.#tsq.removeQueries({ queryKey: bankKeyHeadOf(this.scope) })
  }
  // --

  // == [Reading]: at, soonAt, deadAt, isBehindAt, listingAt, tryAt, get, tryGet, backgroundRefresh, list, tryList, isStaleAt, listen

  /** What `scoped`'s item has, however old: its live record, null, or undefined for no item. Never asks the vaultDB. */
  at<LabelpathT extends Labelpath>(scoped: ScopeAt<LabelpathT>): ThingAt<LabelpathT> | null | undefined {
    return this.#itemAt(this.#demandOwnScope(scoped)) as ThingAt<LabelpathT> | null | undefined
  }

  /** The sparse record `scoped`'s soon has, newer than its item, or undefined for no soon. Never asks the vaultDB. */
  soonAt<LabelpathT extends Labelpath>(scoped: ScopeAt<LabelpathT>): Sparse<ThingAt<LabelpathT>> | undefined {
    return this.#soonAt(this.#demandOwnScope(scoped)) as Sparse<ThingAt<LabelpathT>> | undefined
  }

  /** The tombstone of `scoped`'s Thing that last landed, or undefined for none. It may be of a life older than the item's. Never asks the vaultDB. */
  deadAt<LabelpathT extends Labelpath>(scoped: ScopeAt<LabelpathT>): Tombstone<ThingAt<LabelpathT>> | undefined {
    return this.#deadAt(this.#demandOwnScope(scoped))
  }

  /** True when `scoped`'s item is behind: a soon newer than the item is cached, or a soon with no item. Never asks the vaultDB. */
  isBehindAt(scoped: ThingScope): boolean {
    return this.#isBehindAt(this.#demandOwnScope(scoped))
  }

  /** The cached listing of `scoped`'s children, however old, or undefined for none: the {@link Kids} value a list last answered. Never asks the vaultDB. */
  listingAt(scoped: ThingScope): Kids | undefined {
    return this.#tsq.getQueryData<Kids>(this.listQueryKey(this.#demandOwnScope(scoped)))
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

  /** Get `scoped`'s live whole record, or null where none is stored live: the cached one if timely, else from the vaultDB. A get already under way is shared.
   * Where the Thing is deleted, {@link deadAt} has its tombstone by the time the get resolves.
   * Refuses `stale_read` when the vaultDB answers with a revision older than one cached when the get began. A later get asks again.
   */
  async get<LabelpathT extends Labelpath>(scoped: ScopeAt<LabelpathT>, opts: MinderGetOpts = {}): Promise<ThingAt<LabelpathT> | null> {
    MinderChecks.minderGetOpts.parse(opts)
    this.#demandReady()
    return await this.#doGet(this.#demandOwnScope(scoped), opts) as ThingAt<LabelpathT> | null
  }

  /** {@link get}, resolving an `Outcome` instead of throwing: a refusal, misuse included, is its bad outcome. */
  async tryGet<LabelpathT extends Labelpath>(scoped: ScopeAt<LabelpathT>, opts: MinderGetOpts = {}): Promise<Outcome.Outcome<ThingAt<LabelpathT> | null>> {
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
   * listed land first: a live child as its soon where it is newer than the item, so the item is fetched whole again, at
   * once where an observer keeps it active, else by its next get; a tombstone in its dead record, and null in its item, so
   * a get of it answers from the cache. A Thing stored damaged is left out, and reported to the bank's `tellBadNews`.
   */
  async list(labelpath: Labelpath): Promise<Kids> {
    MinderChecks.minderLabelpath.parse(labelpath)
    this.#demandReady()
    // Under a listing's staleTime, 0, TanStack fetches whatever the listing holds, and shares a fetch under way.
    return await this.#tsq.query<Kids>({ queryKey: this.listQueryKey({ labelpath }) })
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
    const scope = this.#demandOwnScope(scoped)
    return this.#tsqFind(scope)?.isStaleByTime(this.#staleTimeOf(scope, opts)) ?? true
  }

  /** Call `listener` with each change to the cache, and return the function that stops it.
   * Pass `MinderEventFormat` as `version`: the event shape `listener` was written for. Any other refuses.
   * It tells of each of this bank's queries added, changed or removed, and of nothing an observer does. Narrow each event on its
   * `eventkind`: {@link ThingEvent}, {@link SoonEvent}, {@link DeadEvent} and {@link ListingEvent} say what each tells, and when.
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
   * A listing marked that an observer keeps active, as a hook does, is listed again. The rest wait for the next list.
   */
  invalidate(labelpath: Labelpath | undefined, opts: MinderInvalidateOpts): void {
    MinderChecks.minderInvalidateOpts.parse(opts)
    const labels = (labelpath === undefined) ? [] : labelsOf(MinderChecks.minderLabelpath.parse(labelpath))
    // cancelRefetch false: a list under way takes in what it finds, and is joined rather than cancelled and started again.
    void this.#tsq.invalidateQueries({ queryKey: [...bankKeyHeadOf(this.scope), Listkind, ...labels] }, { cancelRefetch: false })
  }
  // --

  // == [Writing]: tryWrite, write

  /** Write `ask` through the vaultDB, and return its answer, a refusal included.
   * The record written, a tombstone as null in its item, and the bank and main gate of the answer's world, are cached before it answers, where this minder minds them. A refusal's `dbhas` is cached only as the watch tells of it.
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

  // == [TSQ Direct Cache Calls]: #doGet, #fetchAt, #fetchRecord, #fetchListing, #itemAt, #soonAt, #deadAt, #itemRecordAt, #soonestAt, #isBehindAt, #tsqFind, sendToTSQ, #landWorld, #landedByFetch, #settleLanded, #hasStoredBesideItem, #markBehinds

  // TanStack resolves with what the queryFn returned, not what structural sharing left in the cache: a notice that landed during the
  // get may have left the item a later record.
  /** `scoped`'s live record or null: the item's if timely within `opts.staleTime`, else from the vaultDB. */
  async #doGet(scoped: ThingScope, opts: MinderGetOpts): Promise<ThingRecord | null> {
    const fetched = await this.#tsq.query(this.#tsqQueryOptions(scoped, opts))
    const item = this.#itemAt(scoped)
    return (item === undefined) ? fetched : item
  }

  // The minder never fetches a soon or a dead record: each takes its record only from sendToTSQ.
  /** Fetch what `queryKey`, the key of one of this bank's items or listings, caches. Refuses unless minding. */
  async #fetchAt(queryKey: TSQ.QueryKey): Promise<ThingRecord | null | Kids> {
    this.#demandReady()
    const scope = this.#scopeOfQueryKey(queryKey)
    return (queryKey[EntrykindIdx] === Listkind) ? await this.#fetchListing(scope) : await this.#fetchRecord(this.#askAt(scope))
  }

  // A tombstone answered is the answer's dbhas, which the watch lands before the answer resumes this fetch.
  /** Fetch `ask`'s live record, deeply frozen, or null where the vaultDB has none live.
   * Refuses `stale_read` for an answer older than the soonest record cached when the fetch began: null counts as its tombstone, or as nothing stored.
   */
  async #fetchRecord(ask: GetAsk): Promise<ThingRecord | null> {
    // Read before asking: a record that lands while the get waits only makes its answer late (notes/wontfix.md).
    const prior  = this.#soonestAt(ask)
    const answer = await this.vaultDB.tryGetThing(ask)
    this.#landWorld(answer.world)
    // Thrown unchanged. The `dbhas` is delivered through the watch, never from here.
    if (! answer.ok) { throw answer.err }
    const answered = (answer.act === 'gotlive') ? this.#checkedDelivered(answer.val, ask) : nullCitedOf(answer)
    // TanStack leaves the item and its time as they were, marks it invalidated, and caches the refusal beside it as its error.
    if ((prior !== undefined) && (Thing.cmp(prior, answered) < 0)) { throw Throwers.staleRead(ask) }
    return deepFreeze(answer.val)
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

  /** What `scoped`'s item has: its live record, null, or undefined for no item. */
  #itemAt(scoped: Labelpathed): ThingRecord | null | undefined {
    return this.#tsq.getQueryData<ThingRecord | null>(this.itemQueryKey(scoped))
  }

  /** The sparse record `scoped`'s soon has, or undefined for no soon. */
  #soonAt(scoped: Labelpathed): Sparse<ThingRecord> | undefined {
    return this.#tsq.getQueryData<Sparse<ThingRecord>>(this.soonQueryKey(scoped))
  }

  /** The tombstone `scoped`'s dead record has, or undefined for none. */
  #deadAt(scoped: Labelpathed): Tombstone<ThingRecord> | undefined {
    return this.#tsq.getQueryData<Tombstone<ThingRecord>>(this.deadQueryKey(scoped))
  }

  /** The record `scoped`'s item counts as: its live record, or where it is null its tombstone, or undefined for neither. */
  #itemRecordAt(scoped: Labelpathed): DeliverableThing | undefined {
    const item = this.#itemAt(scoped)
    return (item === null) ? this.#deadAt(scoped) : item
  }

  /** The soonest record cached for `scoped`: its soon where the item is behind it, else the record its item counts as, or undefined for neither. */
  #soonestAt(scoped: Labelpathed): DeliverableThing | undefined {
    return this.#isBehindAt(scoped) ? this.#soonAt(scoped) : this.#itemRecordAt(scoped)
  }

  // A soon the item has caught up with stays cached while the record that caught it up lands: listeners hear the landing first.
  /** True when `scoped`'s soon is newer than the record its item counts as, or there is a soon and no item. */
  #isBehindAt(scoped: Labelpathed): boolean {
    const soon = this.#soonAt(scoped)
    return (soon !== undefined) && isNewer(this.#itemRecordAt(scoped), soon)
  }

  /** The cache's query of `scoped`'s item, or undefined for none. */
  #tsqFind(scoped: Labelpathed): TSQ.Query<ThingRecord | null> | undefined {
    return this.#tsq.getQueryCache().find<ThingRecord | null>({ queryKey: this.itemQueryKey(scoped), exact: true })
  }

  // Every record but a get's lands here: TanStack lands a get's record in the item itself, then calls #landedByFetch.
  // A whole record at the item's revision lands, and makes the item fresh as of now, as TanStack counts a confirmation from
  // the server. An older one lands nowhere: it would make the newer record read fresh as of its arrival. A tombstone
  // lands in its dead record before a null lands in the item, so a listener on the item's success finds it there.
  /** Cache `record` in its item, soon or dead record while minding, where this minder minds its Thing.
   * A whole record or tombstone older than the record the item counts as, or a sparse one no newer than the soonest cached, lands nowhere.
   */
  protected sendToTSQ(record: DeliverableThing): void {
    if (! this.#isReady) { return }
    deepFreeze(this.#checkedDelivered(record, this.scope))
    if (! this.mindsItemAt(record.labelpath)) { return }
    const item = this.#itemAt(record)
    const isNoneStored = (! this.#hasStoredBesideItem(record)) && ((item === undefined) || (item === null))
    let isLanded = false
    if (! Thing.isSparse(record)) {
      if (! isOlder(this.#itemRecordAt(record), record)) {
        const isTombstone = Thing.isTombstone(record)
        if (isTombstone) { this.#tsq.setQueryData(this.deadQueryKey(record), record) }
        this.#tsq.setQueryData(this.itemQueryKey(record), isTombstone ? null : record)
        isLanded = true
      }
    } else if (isNewer(this.#soonestAt(record), record)) {
      this.#tsq.setQueryData(this.soonQueryKey(record), record)
      isLanded = true
    }
    this.#settleLanded(record, isLanded && isNoneStored)
  }

  // The world is read with the answer, in one step: its bank and main gate are as new as the answer.
  /** Cache the bank and main gate of `world`, an answer's world, where this minder minds them. */
  #landWorld(world: WorldRecord | null): void {
    if (world === null) { return }
    const { maingate, ...bank } = world
    this.sendToTSQ(bank)
    this.sendToTSQ(maingate)
  }

  // A listing's fetch needs nothing more: the Things it lists landed through the watch before it. A soon or a dead record is
  // never fetched. A get's live record over a null item is no first landing: only the item's own count of landings tells one.
  /** Settle the item a fetch just landed `val` in, where `queryKey`, a key of this bank, is an item's. */
  #landedByFetch(val: unknown, queryKey: TSQ.QueryKey): void {
    if (queryKey[EntrykindIdx] !== Itemkind) { return }
    const scope   = this.#scopeOfQueryKey(queryKey)
    const isFirst = (val !== null) && (this.#tsq.getQueryState(queryKey)?.dataUpdateCount === 1) && (! this.#hasStoredBesideItem(scope))
    this.#settleLanded(scope, isFirst)
  }

  // The record has landed before #markBehinds invalidates the item or removes the soon, so a listener told of a soon's
  // success already finds the item behind, and a get there fetches it; and the item's invalidate follows the soon's
  // success at once, before the listing's. cancelRefetch false: a list's own children land while it is under way, and
  // the list joined takes them in; any other refetch would cancel it and start it again.
  /** Bring `scoped`'s soon and item up to date with a record's having landed, or been dropped, and mark its parent's listing stale where `isFirst`. */
  #settleLanded(scoped: Labelpathed, isFirst: boolean): void {
    this.#markBehinds(scoped)
    if (! isFirst) { return }
    void this.#tsq.invalidateQueries({ queryKey: this.listQueryKey({ labelpath: Labelpath.parentOf(scoped.labelpath) }), exact: true }, { cancelRefetch: false })
  }

  /** True when `scoped`'s soon or dead record has a record. */
  #hasStoredBesideItem(scoped: Labelpathed): boolean {
    return (this.#soonAt(scoped) !== undefined) || (this.#deadAt(scoped) !== undefined)
  }

  // TanStack tells nothing when it invalidates a query already invalidated, so an item tells its falling behind once until
  // a record lands in it, and not at all after a refused get; but it fetches an active item again each time, so one a
  // refused get left invalidated is fetched again when it falls further behind. An item no observer keeps active waits for
  // the next get. cancelRefetch false: a fetch already under way is left to land, and its landing marks it again where it
  // landed behind. An item query with no record, one whose first get was refused, is invalidated too, so an observer of
  // it is fetched again.
  /** Remove `scoped`'s soon if its item has caught up with it, else invalidate the item, fetching it again where an observer keeps it active.
   * Does nothing unless the soon is cached.
   */
  #markBehinds(scoped: Labelpathed): void {
    const soon = this.#soonAt(scoped)
    if (soon === undefined) { return }
    if ((this.#itemAt(scoped) !== undefined) && (! isNewer(this.#itemRecordAt(scoped), soon))) {
      this.#tsq.removeQueries({ queryKey: this.soonQueryKey(scoped), exact: true })
      return
    }
    void this.#tsq.invalidateQueries({ queryKey: this.itemQueryKey(scoped), exact: true }, { cancelRefetch: false })
  }
  // --

  // == [TSQ Asks]: itemQueryKeyOf, listQueryKeyOf, bankQueryKeyOf, itemQueryKey, soonQueryKey, deadQueryKey, listQueryKey, #tsqQueryOptions, #staleTimeOf, #askAt

  // A key is the bank's three segments, the kind of query ('item', 'soon', 'dead' or 'list'), the labelpath's labels with
  // '/' between them, then a mark: '!' for the item, '~' for the soon, '+' for the dead record, '#' and 'kids' for the
  // listing. TanStack matches query defaults and invalidation by key prefix, so the kind's prefix singles out every query
  // of that kind, and a Thing's listing key without its mark covers every listing under it too. Without a mark the root
  // box's item key would start every box's. No label is '!', '~', '+', '/' or '#', so no mark is mistaken for one. A
  // labelpath starts with its modelkind.
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

  /** The query key `labelpathed`'s dead record is cached under. */
  deadQueryKey(labelpathed: Labelpathed): TSQ.QueryKey { return [...bankKeyHeadOf(this.scope), Deadkind, ...labelsOf(labelpathed.labelpath), '+'] }

  /** The query key the listing of `labelpathed`'s children is cached under. */
  listQueryKey(labelpathed: Labelpathed): TSQ.QueryKey { return [...bankKeyHeadOf(this.scope), Listkind, ...labelsOf(labelpathed.labelpath), '#', 'kids'] }

  /** TanStack's query options for a get of `labelpathed`'s item, under {@link #staleTimeOf}'s staleTime. */
  #tsqQueryOptions(labelpathed: Labelpathed, opts: MinderGetOpts): TSQ.QueryExecuteOptions<ThingRecord | null> {
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
  // --

  // == [What a subclass minds]: mindsItemAt

  /** True for the labelpath of a Thing whose item and soon this minder caches. */
  protected abstract mindsItemAt(labelpath: Labelpath): boolean
  // --

  // == [Checks]: userid, banklabel, scope, queryClient, #demandOwnScope, #demandItemScope, #checkedDelivered, #demandReady, #scopeOfQueryKey

  /** The user whose bank this minder minds: its friend's. Refuses where its friend's scope does, as a device's until `signIn`. */
  get userid(): Userid { return this.scope.userid }

  /** The label of the bank this minder minds: its friend's. Refuses where its friend's scope does. */
  get banklabel(): Banklabel { return this.scope.banklabel }

  /** The scope of this minder's bank: its friend's. Refuses where its friend's scope does. */
  get scope(): ThingWatchScope {
    const { userid, banklabel } = this.#bank.scope
    return { userid, banklabel }
  }

  /** The QueryClient this minder caches in, its own: hand it to TanStack's `QueryClientProvider` to observe what it caches. */
  get queryClient(): TSQ.QueryClient { return this.#tsq }

  /** The scope of `labelpathed`, demanding that it is in this minder's bank. */
  #demandOwnScope(labelpathed: Labelpathed): ThingScope {
    // Its fields alone: an ask or a record passes, and is read as its scope.
    return ThingChecks.thingScope.parseConsistent(labelpathed, this.scope)
  }

  // Only a write demands it: the write of a Thing no minder here caches would land in storage and nowhere in the cache.
  /** The scope of `labelpathed`, demanding that it is a Thing of this minder's bank whose item it minds. */
  #demandItemScope(labelpathed: Labelpathed): ThingScope {
    const scope = this.#demandOwnScope(labelpathed)
    if (! this.mindsItemAt(scope.labelpath)) { throw Throwers.notMinded() }
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
      ...gotAnswerOf(ask, itemQuery, this.#deadAt(ask), this.#isBehindAt(ask), opts.staleTime ?? this.#queryCacheOpts.staleTime),
      refreshedAt: itemQuery?.state.dataUpdatedAt ?? 0,
      isFetching:  (itemQuery?.state.fetchStatus === 'fetching'),
      lastErr,
    }
  }

  // The emitted event pragmatically mimics the incoming TSQ event.
  // A key's kind says what its query caches: an item, a soon, a dead record or a listing. A removed query still has its last
  // state, which its event tells, though the cache no longer has it. An item is invalidated when it falls behind its soon,
  // or its get is refused; a listing, by `invalidate` or a refused list. A soon or a dead record is never invalidated or fetched.
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
    // The record at a labelpath is of the kind its labelpath starts with. null has none of a record's fields.
    const record = (told.state.data === null) ? undefined : told.state.data as DeliverableThing | undefined
    return Object.freeze({
      ...told, revtok: record?.revtok, revseq: record?.revseq, am: record?.am, lifeseq: record?.lifeseq, lifepath: record?.lifepath,
    }) as ThingEvent | SoonEvent | DeadEvent
  }
  // --
}

// == [Helpers]: Itemkind, Soonkind, Deadkind, Listkind, EntrykindIdx, Marks, labelsOf, TellableTSQEvent, isTellableTSQEvent, nullCitedOf, isNewer, isOlder, gotAnswerOf, isTimelyQuery, isKids, landedKidsOf, PersistBuster, RestoreOpts, SaveOpts

/** The entrykind segment of an item's query key. */
const Itemkind = 'item'
/** The entrykind segment of a soon's query key. */
const Soonkind = 'soon'
/** The entrykind segment of a dead record's query key. */
const Deadkind = 'dead'
/** The entrykind segment of a listing's query key. */
const Listkind = 'list'
/** Where a query key's entrykind segment is: after the bank's three. */
const EntrykindIdx = 3
/** The marks a query key's labels end at. */
const Marks: ReadonlySet<unknown> = new Set(['!', '~', '+', '#'])

/** The labels of `labelpath`, with '/' between them, as a query key spells them. */
function labelsOf(labelpath: Labelpath): string[] {
  return labelpath.split('/').flatMap((label) => ['/', label]).slice(1)
}

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

/** What a good get's answer of null compares as, by life and revision: its tombstone, or for nothing stored the shell's citation, older than every record. */
function nullCitedOf(answer: Extract<GetThingAnswer, { val: null }>): Pick<ThingCited, 'lifepath' | 'revseq'> {
  return answer.dbhas ?? Shell.Cited
}

/** True when `record` is newer than `prior`, or `prior` is undefined. */
function isNewer(prior: DeliverableThing | undefined, record: DeliverableThing): boolean {
  return (prior === undefined) || (Thing.cmp(prior, record) > 0)
}

/** True when `record` is older than `prior`; false where `prior` is undefined. */
function isOlder(prior: DeliverableThing | undefined, record: DeliverableThing): boolean {
  return (prior !== undefined) && (Thing.cmp(prior, record) < 0)
}

/** The {@link GotAnswer} for `itemQuery`, the query of `ask`'s item, with its record and whether it is timely within `staleTime`, and `dead`, the Thing's tombstone cached. */
function gotAnswerOf(ask: GetAsk, itemQuery: TSQ.Query<ThingRecord | null> | undefined, dead: Tombstone<ThingRecord> | undefined, isBehind: boolean, staleTime: TsqStaleTime): GotAnswer & Pick<TSQGotAnswer, 'record' | 'isTimely'> {
  const record   = itemQuery?.state.data
  const isTimely = isTimelyQuery(itemQuery, isBehind, staleTime)
  const base     = { ok: true, record, ask, world: null, isTimely } as const
  // A newer revision heard of, with no item, is something cached all the same.
  if ((record === undefined) && (! isBehind))  { return { ...base, act: 'vacant',   val: undefined } }
  if ((record === undefined) || (! isTimely))  { return { ...base, act: 'untimely', val: undefined } }
  if (record !== null)                         { return { ...base, act: 'gotlive',  val: record } }
  if (dead === undefined)                      { return { ...base, act: 'gotvoid',  val: null, dbhas: null } }
  return                                                { ...base, act: 'gotgone',  val: null, dbhas: dead }
}

/** True when `itemQuery` has a record, is not behind, and is fresh under `staleTime` as TanStack Query counts it. */
function isTimelyQuery(itemQuery: TSQ.Query<ThingRecord | null> | undefined, isBehind: boolean, staleTime: TsqStaleTime): boolean {
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

/** The buster a snapshot is saved under: a snapshot saved under another is discarded at restore. */
const PersistBuster: string = ThingFormat

/** How {@link Minder.persist} restores a snapshot: each record or listing deeply frozen. */
const RestoreOpts: TSQ.HydrateOptions = Object.freeze({ defaultOptions: { deserializeData: deepFreeze } })

// A mutation's variables may hold the cleartexts it was handed: a whisper put, a passphrase for a gating. A host observes
// the minder's client, and may run queries of its own in it, which may hold the same.
/** What {@link Minder.persist} saves: every minder query with a record or a listing, whatever its last fetch did, no query of the host's, and no mutation. */
const SaveOpts: TSQ.DehydrateOptions = Object.freeze({
  shouldDehydrateQuery:    (tsqQuery: TSQ.Query) => ((tsqQuery.queryKey[0] === MinderKeyRoot) && (tsqQuery.state.data !== undefined)),
  shouldDehydrateMutation: () => false,
})

// --

// == [Checks]: MinderOptsChecks, DeliveredChecks

/** The checks of the options every minder is made with, which each subclass's `make` extends. */
export const MinderOptsChecks = Validator.Checkers('bad_record', ({ obj }) => ({
  minderOpts: obj({
    vaultDB:        ThingChecks.vaultDBShape,
    queryCacheOpts: MinderChecks.queryCacheOptsOrDefault,
  }),
}))

/** The check of a record the vaultDB delivers, refusing `unexpected_error`: a record of another scope is a bug in the vaultDB. */
const DeliveredChecks = {
  thingScope: ThingChecks.thingScope.refusingAs('unexpected_error'),
}
// --
