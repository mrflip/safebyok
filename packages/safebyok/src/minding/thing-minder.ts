// The ThingMinder is an exemplar at both of its ends. Its interface is the minder as we would design it for the layer in
// front of it: scopes, records, cars, acts and refusals, in our vocabulary. Its implementation shows TanStack Query used as
// its authors intend: each need is met by the feature TanStack built for that job (query defaults, structural sharing,
// invalidation, the error state, the cache's events), chosen because it fits, not because it was nearest to hand.
// Where a ruling, a design note or this code seems to serve one end at the other's expense, report it rather than split
// the difference.

/** `ThingMinder`, which keeps one kind of Thing in one bank fresh in a TanStack Query cache. */

import * as TSQ from '@tanstack/query-core'
import { noop } from 'es-toolkit'
import { Errors, Outcome, Throwers, Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import type { Banklabel, EpochMillis, Labelpath, Userid } from '../storage/primitives'
import {
  type GetAsk, type LoggableAsk, type Thing, type ThingScope, type ThingWatchScope, type Thingkind, type VoidSentinel,
  checkedGetAsk, loggableAskOf, modelkindOf, shellOf, sparseOf, thingkindVals,
} from '../storage/shapes-thing'
import { type BadAnswer, type GoodAnswer, type ThingNotice, type VaultDB, isVaultDB } from '../storage/vault-db'
import {
  type MinderAskOpts, type MinderFriend, type MinderGetAsk, type MinderGetAskOpts, type QueryCacheOpts, type ThingTies,
  DefaultQueryCacheOpts, FixedQueryCacheOpts, minderAskOpts, minderFriend, minderGetAskOpts, minderListener, minderScope, minderTrack, queryCacheOpts, tsqClient,
} from './shapes-minder'
import { type DeliverableThing, type ThingCar, type Tombstone, carOf, cmpRecords, isThingCar, isVaultDBNewer, mergedCarOf } from './thing-car'

// == [Answers]: GotAnswer, CarFreshness, TSQGotAnswer, TSQAnswer

// `val` is undefined under `vacant` and `untimely`, where the cache knows nothing timely; null under `gotvoid`, where storage holds nothing.
// A timely car is full, gone or void: a behind or bare car is never timely.
/** The cache's record for a scope, shaped like a get's answer. Act `vacant` means nothing is cached, and `untimely` means the cached car is older than asked, or lacks the newest record whole. */
type GotAnswer = (
  | GoodAnswer<Thing, 'gotlive'>
  | GoodAnswer<Tombstone<Thing>, 'gotgone'>
  | GoodAnswer<null, 'gotvoid'>
  | { ok: true, ask: LoggableAsk, act: 'vacant' | 'untimely', world: null, val: undefined }
) & { ask: GetAsk }

/** The car cached for a scope, however old, and how recent it is, and how its last get went. */
interface CarFreshness { car: ThingCar<Thing> | undefined, isTimely: boolean, refreshedAt: EpochMillis, isFetching: boolean, lastErr: Errors.VaultError | null }

/** The cache's record for a scope, shaped like a get's answer, with its car and the car's freshness (`car`, `isTimely`, `refreshedAt`, `isFetching`, `lastErr`). */
export type TSQGotAnswer = GotAnswer & CarFreshness

/** The cache's answer for a scope, read without waiting on the vaultDB: its {@link TSQGotAnswer}, or a refusal. */
export type TSQAnswer = TSQGotAnswer | BadAnswer
// --

// == [Arguments]: MinderOpts, Checks

/** The options of {@link ThingMinder.make}, beside its ties and its bank. */
export interface MinderOpts {
  /** Where the bank's Things are stored. */
  vaultDB:         VaultDB
  /** The TanStack Query client whose cache holds the cars. A host may share its own. */
  tsq:             TSQ.QueryClient
  /** How long a full car stays timely, and a car stays cached once no TanStack observer uses it. A missing field defaults from {@link DefaultQueryCacheOpts}. */
  queryCacheOpts?: Partial<QueryCacheOpts>
}

/** The checks of {@link ThingMinder.make}'s arguments. */
const Checks = Validator.Checkers('bad_option', ({ obj, oneof, custom, orDefault }) => ({
  minderMakeArgs: obj({
    ties: obj({ modelkind: oneof(thingkindVals) }),
    opts: obj({
      vaultDB:        custom<VaultDB>(isVaultDB, Phrases.VaultDBExpected),
      tsq:            tsqClient,
      queryCacheOpts: orDefault(queryCacheOpts, DefaultQueryCacheOpts),
    }),
    bank: minderFriend,
  }),
}))
// --

/** Keeps one kind of Thing in one bank fresh in a TanStack Query cache, through a watch of the bank of its own.
 * The bank must be stored: before its birth, a get or a list refuses.
 */
export class ThingMinder {
  // == [Props]: userid, banklabel, modelkind, #bank, #vaultDB, #tsq, #queryCacheOpts, #unwatch, #isReady
  readonly userid:    Userid
  readonly banklabel: Banklabel
  readonly modelkind: Thingkind
  readonly #bank:           MinderFriend
  readonly #vaultDB:        VaultDB
  readonly #tsq:            TSQ.QueryClient
  readonly #queryCacheOpts: Readonly<QueryCacheOpts>
  #unwatch: (() => void) | null = null
  /** True from `hello` until `goodbye`: cars are cached, and `tryAt`, `get` and `list` answer, only then. */
  #isReady = false
  // --

  // == [Construction]: make, constructor

  /** Make a minder of `ties.modelkind` in `bank`, asking `opts.vaultDB` and caching in `opts.tsq`. Call `hello` to start it. */
  static make(ties: Pick<ThingTies, 'modelkind'>, opts: MinderOpts, bank: MinderFriend): ThingMinder {
    const checked = Checks.minderMakeArgs.parse({ ties, opts, bank })
    return new ThingMinder(checked.ties, checked.opts, checked.bank)
  }

  private constructor(ties: Pick<ThingTies, 'modelkind'>, opts: Omit<MinderOpts, 'queryCacheOpts'> & { queryCacheOpts: QueryCacheOpts }, bank: MinderFriend) {
    const { userid, banklabel } = bank.scope
    this.userid          = userid
    this.banklabel       = banklabel
    this.modelkind       = ties.modelkind
    this.#bank           = bank
    this.#vaultDB        = opts.vaultDB
    this.#tsq            = opts.tsq
    this.#queryCacheOpts = Object.freeze(opts.queryCacheOpts)
    Object.freeze(this)
  }
  // --

  // == [Starting and ending]: hello, #startVaultDBWatch, goodbye

  // The root box is cached here, not when the minder is made: only a minder minding keeps cars, under its defaults.
  // Before the bank's birth its root box is the shell, which is not cached: a void car would be timely, and a get of the
  // root box would answer the shell where the vaultDB refuses.
  /** Start minding: set this minder's defaults on the cache, and watch the bank. A box minder caches its bank's live root box, `bare`, until `goodbye`. A second call does nothing. */
  hello(): void {
    if (this.#isReady) { return }
    const { staleTime } = this.#queryCacheOpts
    this.#tsq.setQueryDefaults(this.keyPrefix, {
      ...this.#queryCacheOpts,
      ...FixedQueryCacheOpts,
      // A car under this minder's prefix is one this minder cached.
      staleTime:         (carQuery) => staleTimeOf(carQuery.state.data as ThingCar<Thing> | undefined, staleTime),
      queryFn:           ({ queryKey }) => this.#fetchCar(this.#bank.makeGetAsk(this.#scopeOfKey(queryKey))),
      structuralSharing: keptValOf,
    })
    this.#isReady = true
    if (this.modelkind === 'box') {
      // Kept whatever the host's gcTime: its own key's defaults reach no box under it.
      this.#tsq.setQueryDefaults(this.queryKey(this.#bank.rootBox), { gcTime: Infinity })
      if (this.#bank.rootBox.am === 'a') { this.#doDeliverRecord(sparseOf(this.#bank.rootBox)) }
    }
    this.#startVaultDBWatch()
  }

  /** Watch the bank: each notice goes to `#receive`, and the watch's trouble to the bank's `tellBadNews`. */
  #startVaultDBWatch(): void {
    this.#unwatch = this.#vaultDB.watch(
      this.scope,
      (notice: ThingNotice) => { this.#receive(notice) },
      (news)                => { this.#bank.tellBadNews([news]) },
    )
  }

  /** Stop minding, and remove this minder's cars and defaults from the cache. Reads refuse until `hello` is called again. */
  goodbye(): void {
    this.#isReady = false
    if (this.#unwatch) { this.#unwatch() }
    this.#unwatch = null
    this.#tsq.removeQueries({ queryKey: this.keyPrefix })
    // TanStack Query cannot remove a key's defaults: empty ones in their place set nothing.
    this.#tsq.setQueryDefaults(this.keyPrefix, {})
    if (this.modelkind === 'box') { this.#tsq.setQueryDefaults(this.queryKey(this.#bank.rootBox), {}) }
  }
  // --

  // == [Reading]: at, tryAt, get, list, isStaleAt, listen

  /** The cached car for `scoped`, however old, or undefined for none. Never asks the vaultDB. */
  at(scoped: ThingScope): ThingCar<Thing> | undefined {
    this.#demandOwnScope(scoped)
    return this.#cachedAt(scoped)
  }

  /** The cache's answer for `ask`'s scope, and whether it is timely. Never waits on the vaultDB.
   * - `staleTime`          -- a car older than this (milliseconds) is `untimely`, without its `val`; so is a `behind` or `bare` car
   * - `ifStale: 'get'`     -- read the cache alone (default)
   * - `ifStale: 'refresh'` -- also fetch a stale or vacant car in the background
   */
  tryAt(ask: MinderGetAsk, opts: MinderAskOpts = {}): TSQAnswer {
    try {
      const { staleTime = this.#queryCacheOpts.staleTime, ifStale = 'get' } = minderAskOpts.parse(opts)
      this.#demandReady()
      this.#demandOwnAsk(ask)
      if (ifStale === 'refresh') { this.#backgroundRefresh(ask, staleTime) }
      return this.#answerOfTSQ(ask, { staleTime })
    } catch (err) {
      return { ok: false, ask: loggableAskOf(ask), act: 'unclassified_storing', world: null, dbhas: null, err: Outcome.storageRefusalOf(err) }
    }
  }

  /** Get the car of the Thing `ask` names: the cached one if timely, else from the vaultDB. A get already under way is shared.
   * Refuses `stale_read` where storage answers older than the newest record cached when the get began. That car stays cached, and no longer counts as timely.
   * Refuses `disabled` where `goodbye` is called while it waits.
   */
  async get(ask: MinderGetAsk, opts: MinderGetAskOpts = {}): Promise<ThingCar<Thing>> {
    const { staleTime = this.#queryCacheOpts.staleTime } = minderGetAskOpts.parse(opts)
    this.#demandReady()
    this.#demandOwnAsk(ask)
    return this.#doGet(ask, staleTime)
  }

  /** List the Things one label under this minder's root, tombstones included, and resolve their labelpaths. A box minder lists the boxes under the root box.
   * Each lands in its car as a sparse record. A car left `behind` or `bare` is stale, so that the next get fetches the record whole.
   */
  async list(): Promise<Labelpath[]> {
    this.#demandReady()
    const answer = await this.#vaultDB.tryListThings(this.#bank.makeListAsk({ labelpath: this.modelkind, ifAbsent: 'nil' }))
    if (! answer.ok) { throw answer.err }
    TSQ.notifyManager.batch(() => {
      for (const record of answer.val) { this.#doDeliverRecord(record) }
    })
    return answer.val.map((record) => record.labelpath)
  }

  /** True when no cached car for `ask`'s scope is timely. `staleTime` overrides the minder's own. Never asks the vaultDB. */
  isStaleAt(ask: MinderGetAsk, opts: MinderGetAskOpts = {}): boolean {
    const { staleTime = this.#queryCacheOpts.staleTime } = minderGetAskOpts.parse(opts)
    this.#demandOwnAsk(ask)
    return this.#isStale(ask, staleTime)
  }

  /** Call `listener` with the answer `tryAt` would give for a scope, under this minder's own `staleTime`, each time a record lands in its car, a get of it is refused, or the car is invalidated or removed.
   * A record that lands is told even when it changes nothing. A car that ages past `staleTime` is not told, and listening keeps nothing cached: a TanStack observer does both.
   * Returns the function that stops it. What the listener throws goes to the device's `onBadNews`, and stops nothing.
   */
  listen(listener: (answer: TSQGotAnswer) => void): () => void {
    const checked = minderListener.parse(listener)
    const { keyPrefix } = this
    return this.#tsq.getQueryCache().subscribe((event) => {
      if (! (isCarEvent(event) && TSQ.matchQuery({ queryKey: keyPrefix }, event.query))) { return }
      // The cache's events are typed loosely; a query under this minder's prefix holds a car of its own.
      const carQuery = event.query as TSQ.Query<ThingCar<Thing>>
      const ask      = this.#bank.makeGetAsk(this.#scopeOfKey(carQuery.queryKey))
      const answer   = this.#answerOfTSQ(ask, this.#queryCacheOpts)
      try { checked(answer) } catch (err) { this.#bank.tellBadNews([Throwers.unexpectedError(err)]) }
    })
  }
  // --

  // == [TSQ Direct Cache Calls]: #backgroundRefresh, #doGet, #cachedAt, #tsqFind, #isStale

  // Its refusal lands beside the car, where the next tryAt finds it as `lastErr`.
  /** Initiate fetch of `ask`'s record, if its car is stale, without waiting for the result. If a fetch is under way, it will use its result (not starting a new one). */
  #backgroundRefresh(ask: GetAsk, staleTime: number): void {
    void this.#doGet(ask, staleTime).catch(noop)
  }

  /** The car for `ask`'s scope, from the cache if timely within `staleTime`, else from the vaultDB. */
  async #doGet(ask: GetAsk, staleTime: number): Promise<ThingCar<Thing>> {
    let fetched: ThingCar<Thing>
    try {
      fetched = await this.#tsq.query({ ...this.#tsqGetAskOf(ask), staleTime: (carQuery) => staleTimeOf(carQuery.state.data, staleTime) })
    } catch (err) {
      // TanStack cancels a get under way when goodbye removes its car.
      throw (err instanceof TSQ.CancelledError) ? minderNotStarted() : err
    }
    // TanStack resolves with what the queryFn returned, not what structural sharing kept: a notice that landed during the
    // get may have left the cache a later record.
    return this.#cachedAt(ask) ?? fetched
  }

  /** The cached car for `scoped`, one of this minder's scopes, or undefined for none. */
  #cachedAt(scoped: ThingScope): ThingCar<Thing> | undefined {
    return this.#tsq.getQueryData<ThingCar<Thing>>(this.queryKey(scoped))
  }

  /** The cache's query for `scoped`, which holds its car, or undefined for none. */
  #tsqFind(scoped: ThingScope): TSQ.Query<ThingCar<Thing>> | undefined {
    return this.#tsq.getQueryCache().find<ThingCar<Thing>>({ queryKey: this.queryKey(scoped), exact: true })
  }

  /** True when no car is cached for `scoped`, or the car cached is not timely within `staleTime`. */
  #isStale(scoped: ThingScope, staleTime: number): boolean {
    const carQuery = this.#tsqFind(scoped)
    return carQuery?.isStaleByTime(staleTimeOf(carQuery.state.data, staleTime)) ?? true
  }
  // --

  // == [VaultDB->Minder Delivery]: #receive, #doDeliverRecord

  /** Cache the Thing a notice of the bank's watch carries, where it is of this minder's kind. */
  #receive(notice: ThingNotice): void {
    if (modelkindOf(notice.val.labelpath) === this.modelkind) { this.#doDeliverRecord(notice.val) }
  }

  /** Land the car of `record` in the cache, while this minder is minding. */
  #doDeliverRecord(record: DeliverableThing): void {
    if (! this.#isReady) { return }
    this.#tsq.setQueryData(this.queryKey(record), carOf(record))
  }
  // --

  // == [TSQ Asks]: keyPrefix, queryKey, #tsqGetAskOf, #fetchCar, #shellAt

  /** The key every one of this minder's cars is cached under starts with: its root's, without the final '.', selecting the root and everything under it. */
  get keyPrefix(): TSQ.QueryKey { return ['safebyok', this.userid, this.banklabel, this.modelkind] }

  // Each label is a segment of its own, so that the key without its final '.' selects a Thing and everything under it.
  // The '.' marks the Thing itself, and can never be a label: TanStack matches query defaults by key prefix, so without
  // it the root box's key would be the box minder's keyPrefix and start every box's key, and no defaults could single
  // out the root box. A labelpath starts with its modelkind, so the key does too; do not repeat it.
  /** The key `scoped`'s car is cached under. */
  queryKey(scoped: ThingScope): TSQ.QueryKey { return ['safebyok', this.userid, this.banklabel, ...scoped.labelpath.split('/'), '.'] }

  /** TanStack's query options for a get of `ask`, the vaultDB's part of a minder's get ask. */
  #tsqGetAskOf(ask: GetAsk) {
    return { queryKey: this.queryKey(ask), queryFn: () => this.#fetchCar(ask) }
  }

  // A host's observer keeps the default queryFn past goodbye, and would cache what it fetches.
  /** The car of `ask`'s record from the vaultDB, or of its shell where storage holds nothing. Refuses `stale_read` where it is older than the newest record cached when it began. */
  async #fetchCar(ask: GetAsk): Promise<ThingCar<Thing>> {
    this.#demandReady()
    // Held before asking: a record that lands while the get waits only makes its answer late (notes/wontfix.md).
    const prior  = this.#cachedAt(ask)
    const answer = await this.#vaultDB.tryGetThing(ask)
    if (! answer.ok) { throw answer.err }
    const record = answer.val ?? this.#shellAt(ask)
    // TanStack keeps the car and its time, marks it invalidated, and holds the refusal beside it as its error.
    if ((prior !== undefined) && (cmpRecords(prior.newest, record) < 0)) { throw staleRead(ask) }
    return carOf(record)
  }

  // Boxes are the only Things under a root, for now: one label under the root box, which `hello` caches.
  /** The shell at `scoped`: a root's, or that of a Thing under the root of its kind as this minder caches it. */
  #shellAt(scoped: ThingScope): VoidSentinel {
    const { labelpath } = scoped
    if (! labelpath.includes('/')) { return shellOf(scoped) }
    const parent = this.#cachedAt({ ...scoped, labelpath: modelkindOf(labelpath) })?.newest
    // With no root cached, shellOf refuses: below a root, a shell needs a life.
    return (parent === undefined) ? shellOf(scoped) : shellOf(scoped, parent)
  }
  // --

  // == [Checks]: scope, ties, #demandOwnAsk, #demandOwnScope, #demandReady, #scopeOfKey

  /** The bank this minder minds Things of. */
  get scope(): ThingWatchScope { return { userid: this.userid, banklabel: this.banklabel } }

  /** This minder's user, bank and modelkind. */
  get ties(): ThingTies { return { userid: this.userid, banklabel: this.banklabel, modelkind: this.modelkind } }

  /** Demand that `ask` is a get ask with `ifAbsent: 'nil'` and a `track`, for this minder's bank and modelkind. Throws `bad_option`. */
  #demandOwnAsk(ask: MinderGetAsk): void {
    minderTrack.parse(ask)
    Validator.checkedConsistent(checkedGetAsk(ask), { ...this.ties, ifAbsent: 'nil' }, { kind: 'bad_option' })
  }

  /** Demand that `scoped` is a scope in this minder's bank, of its modelkind. Throws `bad_option`. */
  #demandOwnScope(scoped: ThingScope): void {
    const { labelpath, ...bankScope } = minderScope.parse(scoped)
    Validator.checkedConsistent({ ...bankScope, modelkind: modelkindOf(labelpath) }, this.ties, { kind: 'bad_option' })
  }

  /** Demand that the minder is minding: after `hello`, before `goodbye`. */
  #demandReady(): void {
    if (! this.#isReady) { throw minderNotStarted() }
  }

  /** The scope whose car is cached under `queryKey`, one of this minder's keys. */
  #scopeOfKey(queryKey: TSQ.QueryKey): ThingScope {
    return { userid: this.userid, banklabel: this.banklabel, labelpath: queryKey.slice(3, -1).join('/') }
  }

  // --

  // == [TSQ Helpers]: #answerOfTSQ

  // Its caller starts any refresh first, so that a vacant answer is isFetching. A removed car is vacant.
  /** The {@link TSQGotAnswer} the cache gives for `ask`'s scope, timely within `opts.staleTime`. */
  #answerOfTSQ(ask: GetAsk, opts: Readonly<{ staleTime: number }>): TSQGotAnswer {
    const carQuery = this.#tsqFind(ask)
    const isTimely = (! this.#isStale(ask, opts.staleTime))
    const lastErr  = carQuery?.state.error ?? null
    return {
      ...gotAnswerOf(ask, carQuery?.state.data, isTimely),
      car:         carQuery?.state.data,
      isTimely,
      refreshedAt: carQuery?.state.dataUpdatedAt ?? 0,
      isFetching:  (carQuery?.state.fetchStatus === 'fetching'),
      lastErr:     (lastErr === null) ? null : Outcome.storageRefusalOf(lastErr),
    }
  }
  // --
}

// == [Helpers]: minderNotStarted, staleRead, isCarEvent, gotAnswerOf, staleTimeOf, keptValOf

/** The refusal of a read on a minder that is not minding. */
function minderNotStarted(): Errors.VaultError {
  return new Errors.VaultError('disabled', Phrases.MinderNotStarted)
}

/** The refusal of a get that storage answered older than the newest record cached when it began. */
function staleRead(ask: GetAsk): Errors.VaultError {
  return new Errors.VaultError('stale_read', Phrases.StaleRead, { meta: { ask: loggableAskOf(ask) } })
}

// A record lands (success), a get is refused or the car invalidated (both leave the car untimely), or the car is
// removed. A fetch starting, pausing or failing once, and the observers' bookkeeping change none.
/** True for a cache event that changes a car, or whether it is timely. */
function isCarEvent(event: TSQ.QueryCacheNotifyEvent): boolean {
  if (event.type === 'removed') { return true }
  return (event.type === 'updated') && ['success', 'error', 'invalidate'].includes(event.action.type)
}

/** A get's answer for `car`, the car cached at `ask`'s scope: act `vacant` for none, `untimely` unless `isTimely`, and otherwise its newest record. */
function gotAnswerOf(ask: GetAsk, car: ThingCar<Thing> | undefined, isTimely: boolean): GotAnswer {
  if (car === undefined)                         { return { ok: true, ask, act: 'vacant',   world: null, val: undefined } }
  if (isTimely && (car.liveness === 'full'))     { return { ok: true, ask, act: 'gotlive',  world: null, val: car.newest } }
  if (isTimely && (car.liveness === 'gone'))     { return { ok: true, ask, act: 'gotgone',  world: null, val: car.newest } }
  if (isTimely && (car.liveness === 'void'))     { return { ok: true, ask, act: 'gotvoid',  world: null, val: null } }
  // A behind or bare car is never timely.
  return                                                  { ok: true, ask, act: 'untimely', world: null, val: undefined }
}

/** `staleTime`, or 0 where the vaultDB holds a newer whole record than `car`'s, so that the next get fetches it. */
function staleTimeOf(car: ThingCar<Thing> | undefined, staleTime: number): number {
  return ((car !== undefined) && isVaultDBNewer(car)) ? 0 : staleTime
}

// TanStack also calls it on an observer's selected and placeholder values, which may be anything.
/** The value TanStack keeps when `landed` lands over `prior`: their merged car where `landed` is a car, else what TanStack's default sharing keeps. */
function keptValOf(prior: unknown, landed: unknown): unknown {
  if (! isThingCar(landed)) { return TSQ.replaceEqualDeep(prior, landed) }
  return mergedCarOf(isThingCar(prior) ? prior : undefined, landed)
}
// --
