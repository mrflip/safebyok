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
  RootBoxLabelpath, checkedGetAsk, loggableAskOf, modelkindOf, shellOf, thingkindVals,
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
/** A get's answer, read from the cache. Beside a get's own acts:
 * * `vacant`   -- nothing is cached
 * * `untimely` -- the car is older than `staleTime`, is `behind` or `bare`, or its last get was refused
 */
type GotAnswer = (
  | GoodAnswer<Thing, 'gotlive'>
  | GoodAnswer<Tombstone<Thing>, 'gotgone'>
  | GoodAnswer<null, 'gotvoid'>
  | { ok: true, ask: LoggableAsk, act: 'vacant' | 'untimely', world: null, val: undefined }
) & { ask: GetAsk }

/** The car cached for a scope, however old, and the state of its gets. */
interface CarFreshness {
  /** The cached car, or undefined for none. */
  car:         ThingCar<Thing> | undefined
  /** False where the act is `vacant` or `untimely`. */
  isTimely:    boolean
  /** When a record last landed in the car, or 0 for none. */
  refreshedAt: EpochMillis
  /** True while a get of the car is under way. */
  isFetching:  boolean
  /** The refusal of the car's last get, or null. */
  lastErr:     Errors.VaultError | null
}

/** A get's answer read from the cache, with the car and its {@link CarFreshness}. */
export type TSQGotAnswer = GotAnswer & CarFreshness

/** `tryAt`'s answer: a {@link TSQGotAnswer}, or a refusal. */
export type TSQAnswer = TSQGotAnswer | BadAnswer
// --

// == [Arguments]: MinderOpts, Checks

/** Options for {@link ThingMinder.make}. */
export interface MinderOpts {
  /** Where the bank's Things are stored. */
  vaultDB:         VaultDB
  /** The TanStack Query client whose cache holds the cars. A host may share its own. */
  tsq:             TSQ.QueryClient
  /** The cache's timings ({@link QueryCacheOpts}). A field left out takes its value from {@link DefaultQueryCacheOpts}. */
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

/** Keeps one kind of Thing in one bank fresh in a TanStack Query cache, through its own watch of the bank.
 * Internal: the layers above the core build on it, and a host does not call it.
 * It reads only its bank's scope and ask builders, so it may be made before the bank's birth.
 * It answers `get`, `tryAt` and `list` only between `hello` and `goodbye`, and refuses `disabled` outside them.
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
  /** True while minding: from `hello` until `goodbye`. */
  #isReady = false
  // --

  // == [Construction]: make, constructor

  /** Make a minder of one kind of Thing in `bank`. It does nothing until `hello`. */
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

  /** Start minding: until `goodbye`, answer gets, and cache each change the vaultDB tells of. A second call does nothing.
   * A TanStack observer of a minder's `queryKey` then fetches and merges cars too.
   */
  hello(): void {
    if (this.#isReady) { return }
    const { staleTime } = this.#queryCacheOpts
    this.#tsq.setQueryDefaults(this.keyPrefix, {
      ...this.#queryCacheOpts,
      ...FixedQueryCacheOpts,
      staleTime:         staleTimeFnOf(staleTime),
      queryFn:           ({ queryKey }) => this.#fetchCar(this.#bank.makeGetAsk(this.#scopeOfKey(queryKey))),
      structuralSharing: keptValOf,
    })
    this.#isReady = true
    // Kept whatever the host's gcTime: its own key's defaults reach no box under it.
    if (this.modelkind === 'box') { this.#tsq.setQueryDefaults(this.queryKey(this.#rootBoxScope), { gcTime: Infinity }) }
    this.#startVaultDBWatch()
  }

  /** Start this minder's watch of the bank. */
  #startVaultDBWatch(): void {
    this.#unwatch = this.#vaultDB.watch(
      this.scope,
      (notice: ThingNotice) => { this.#receive(notice) },
      (news)                => { this.#bank.tellBadNews([news]) },
    )
  }

  /** Stop minding, and remove this minder's cars from the cache. A get still waiting refuses `disabled`. */
  goodbye(): void {
    this.#isReady = false
    if (this.#unwatch) { this.#unwatch() }
    this.#unwatch = null
    this.#tsq.removeQueries({ queryKey: this.keyPrefix })
    // TanStack Query cannot remove a key's defaults: empty ones in their place set nothing.
    this.#tsq.setQueryDefaults(this.keyPrefix, {})
    if (this.modelkind === 'box') { this.#tsq.setQueryDefaults(this.queryKey(this.#rootBoxScope), {}) }
  }
  // --

  // == [Reading]: at, tryAt, get, list, isStaleAt, listen

  /** The cached car for `scoped`, however old, or undefined for none. Never asks the vaultDB. */
  at(scoped: ThingScope): ThingCar<Thing> | undefined {
    this.#demandOwnScope(scoped)
    return this.#cachedAt(scoped)
  }

  /** The cache's answer for `ask`'s scope, without waiting on the vaultDB.
   * A car that is not timely answers `untimely`, with no `val`.
   * Under `ifStale: 'refresh'`, it also fetches a stale or missing car in the background ({@link MinderAskOpts}).
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

  /** Get `ask`'s car: the cached one if timely, else from the vaultDB. A get already under way is shared.
   * Refuses `stale_read` when the vaultDB answers with a revision older than one cached when the get began. A later get asks again.
   * With no root car cached, a get of a box the vaultDB holds nothing for refuses: get the root box first.
   */
  async get(ask: MinderGetAsk, opts: MinderGetAskOpts = {}): Promise<ThingCar<Thing>> {
    const { staleTime = this.#queryCacheOpts.staleTime } = minderGetAskOpts.parse(opts)
    this.#demandReady()
    this.#demandOwnAsk(ask)
    return this.#doGet(ask, staleTime)
  }

  /** List the Things directly under this minder's root, in labelpath order, tombstones included.
   * A box minder's root is the root box. Each record is cached sparse. Where that leaves a car `behind` or `bare`, the
   * next get fetches it whole. A tombstone's car is `gone`, and answers from the cache.
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

  /** True when `ask`'s car is missing or not timely. */
  isStaleAt(ask: MinderGetAsk, opts: MinderGetAskOpts = {}): boolean {
    const { staleTime = this.#queryCacheOpts.staleTime } = minderGetAskOpts.parse(opts)
    this.#demandOwnAsk(ask)
    return isStaleQuery(this.#tsqFind(ask), staleTime)
  }

  /** Call `listener` each time a car changes, with the answer for its scope. Returns the function that stops it.
   * A car changes when a record lands in it (even one that changes nothing), a get of it is refused, or it is invalidated
   * or removed. The answer's `isTimely` uses the minder's own `staleTime`.
   * Nothing is called when a car ages past `staleTime`, and listening keeps no car cached: use a TanStack observer for either.
   * What `listener` throws goes to the bank's `tellBadNews`, and stops nothing.
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

  // == [TSQ Direct Cache Calls]: #backgroundRefresh, #doGet, #cachedAt, #tsqFind

  // Its refusal lands beside the car, where the next tryAt finds it as `lastErr`.
  /** Fetch `ask`'s car in the background, if it is stale. */
  #backgroundRefresh(ask: GetAsk, staleTime: number): void {
    void this.#doGet(ask, staleTime).catch(noop)
  }

  /** `ask`'s car: the cached one if timely within `staleTime`, else from the vaultDB. */
  async #doGet(ask: GetAsk, staleTime: number): Promise<ThingCar<Thing>> {
    let fetched: ThingCar<Thing>
    try {
      fetched = await this.#tsq.query({ ...this.#tsqGetAskOf(ask), staleTime: staleTimeFnOf(staleTime) })
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

  /** The cache's query holding `scoped`'s car, or undefined for none. */
  #tsqFind(scoped: ThingScope): TSQ.Query<ThingCar<Thing>> | undefined {
    return this.#tsq.getQueryCache().find<ThingCar<Thing>>({ queryKey: this.queryKey(scoped), exact: true })
  }
  // --

  // == [VaultDB->Minder Delivery]: #receive, #doDeliverRecord

  /** Cache `notice`'s Thing, if it is of this minder's kind. */
  #receive(notice: ThingNotice): void {
    if (modelkindOf(notice.val.labelpath) === this.modelkind) { this.#doDeliverRecord(notice.val) }
  }

  /** Merge `record` into its cached car, while minding. */
  #doDeliverRecord(record: DeliverableThing): void {
    if (! this.#isReady) { return }
    this.#tsq.setQueryData(this.queryKey(record), carOf(record))
  }
  // --

  // == [TSQ Asks]: keyPrefix, queryKey, #tsqGetAskOf, #fetchCar, #shellAt

  /** The start of the key every one of this minder's cars is cached under. */
  get keyPrefix(): TSQ.QueryKey { return ['safebyok', this.userid, this.banklabel, this.modelkind] }

  // Each label is a segment of its own, so that the key without its final '.' selects a Thing and everything under it.
  // The '.' marks the Thing itself, and can never be a label: TanStack matches query defaults by key prefix, so without
  // it the root box's key would be the box minder's keyPrefix and start every box's key, and no defaults could single
  // out the root box. A labelpath starts with its modelkind, so the key does too; do not repeat it.
  /** The key `scoped`'s car is cached under. */
  queryKey(scoped: ThingScope): TSQ.QueryKey { return ['safebyok', this.userid, this.banklabel, ...scoped.labelpath.split('/'), '.'] }

  /** TanStack's query options for a get of `ask`. */
  #tsqGetAskOf(ask: GetAsk) {
    return { queryKey: this.queryKey(ask), queryFn: () => this.#fetchCar(ask) }
  }

  // A host's observer keeps the default queryFn past goodbye, and would cache what it fetches.
  /** Fetch `ask`'s car from the vaultDB, made of its shell where storage holds nothing.
   * Refuses `stale_read` for an answer older than the revision cached when it began.
   */
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

  // Boxes are the only Things under a root, for now: one label under the root box.
  /** The shell at `scoped`. Below a root, it takes the life of its root's cached car, and refuses `bad_option` where none is cached. */
  #shellAt(scoped: ThingScope): VoidSentinel {
    const { labelpath } = scoped
    if (! labelpath.includes('/')) { return shellOf(scoped) }
    const parent = this.#cachedAt({ ...scoped, labelpath: modelkindOf(labelpath) })?.newest
    if (parent === undefined) { throw new Errors.VaultError('bad_option', Phrases.RootNotCached) }
    return shellOf(scoped, parent)
  }
  // --

  // == [Checks]: scope, ties, #demandOwnAsk, #demandOwnScope, #demandReady, #scopeOfKey

  /** The scope of this minder's bank. */
  get scope(): ThingWatchScope { return { userid: this.userid, banklabel: this.banklabel } }

  /** The scope of the bank's root box. */
  get #rootBoxScope(): ThingScope { return { ...this.scope, labelpath: RootBoxLabelpath } }

  /** This minder's user, bank and modelkind. */
  get ties(): ThingTies { return { userid: this.userid, banklabel: this.banklabel, modelkind: this.modelkind } }

  /** Demand that `ask` is a get ask with `ifAbsent: 'nil'` and a `track`, for this minder's bank and modelkind. */
  #demandOwnAsk(ask: MinderGetAsk): void {
    minderTrack.parse(ask)
    Validator.checkedConsistent(checkedGetAsk(ask), { ...this.ties, ifAbsent: 'nil' }, { kind: 'bad_option' })
  }

  /** Demand that `scoped` is a scope in this minder's bank, of its modelkind. */
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
    const isTimely = (! isStaleQuery(carQuery, opts.staleTime))
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

// == [Helpers]: minderNotStarted, staleRead, isCarEvent, gotAnswerOf, staleTimeFnOf, isStaleQuery, keptValOf

/** The refusal of a read on a minder that is not minding. */
function minderNotStarted(): Errors.VaultError {
  return new Errors.VaultError('disabled', Phrases.MinderNotStarted)
}

/** The refusal of a get answered with a revision older than one cached when it began. */
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

/** The {@link GotAnswer} for `car`, the car cached at `ask`'s scope. */
function gotAnswerOf(ask: GetAsk, car: ThingCar<Thing> | undefined, isTimely: boolean): GotAnswer {
  if (car === undefined)                         { return { ok: true, ask, act: 'vacant',   world: null, val: undefined } }
  if (isTimely && (car.liveness === 'full'))     { return { ok: true, ask, act: 'gotlive',  world: null, val: car.newest } }
  if (isTimely && (car.liveness === 'gone'))     { return { ok: true, ask, act: 'gotgone',  world: null, val: car.newest } }
  if (isTimely && (car.liveness === 'void'))     { return { ok: true, ask, act: 'gotvoid',  world: null, val: null } }
  // A behind or bare car is never timely.
  return                                                  { ok: true, ask, act: 'untimely', world: null, val: undefined }
}

// A query under this minder's prefix holds a car this minder cached.
/** TanStack's staleTime for a car's query: `staleTime`, or 0 where {@link isVaultDBNewer}. */
function staleTimeFnOf(staleTime: number): (carQuery: Readonly<{ state: Readonly<{ data: unknown }> }>) => number {
  return (carQuery) => {
    const car = carQuery.state.data as ThingCar<Thing> | undefined
    return ((car !== undefined) && isVaultDBNewer(car)) ? 0 : staleTime
  }
}

/** True when `carQuery` is absent, or its car is not timely within `staleTime`. */
function isStaleQuery(carQuery: TSQ.Query<ThingCar<Thing>> | undefined, staleTime: number): boolean {
  return carQuery?.isStaleByTime(staleTimeFnOf(staleTime)(carQuery)) ?? true
}

// TanStack also calls it on an observer's selected and placeholder values, which may be anything.
/** The value TanStack keeps when `landed` lands over `prior`: the merged car ({@link mergedCarOf}) for a car, else TanStack's default sharing. */
function keptValOf(prior: unknown, landed: unknown): unknown {
  if (! isThingCar(landed)) { return TSQ.replaceEqualDeep(prior, landed) }
  return mergedCarOf(isThingCar(prior) ? prior : undefined, landed)
}
// --
