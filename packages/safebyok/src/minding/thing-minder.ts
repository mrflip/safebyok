// The ThingMinder is an exemplar at both of its ends. Its interface is the minder as we would design it for the layer in
// front of it: scopes, records, cars, acts and refusals, in our vocabulary. Its implementation shows TanStack Query used as
// its authors intend: each need is met by the feature TanStack built for that job (query defaults, structural sharing,
// the error state, the cache's events), chosen because it fits, not because it was nearest to hand.
// Where a ruling, a design note or this code seems to serve one end at the other's expense, report it rather than split
// the difference.

/** `ThingMinder`, which minds every Thing in one bank in a TanStack Query cache of its own. */

import * as TSQ from '@tanstack/query-core'
import { noop } from 'es-toolkit'
import { Outcome, Throwers, Validator } from 'safebyok-big/internals'
import { minderNotStarted, staleRead } from '../refusals/throwers'
import type { Banklabel, Labelpath, Userid } from '../shapes/primitives'
import { type Thing, type ThingScope, type VoidSentinel, RootBoxLabelpath, ThingChecks, cmpThings, shellOf } from '../shapes/shapes-thing'
import { type GetAsk, type ThingWatchScope, loggableAskOf } from '../shapes/shapes-asks'
import type { ThingNotice, VaultDB } from '../storage/vault-db'
import {
  type CarAt, type CarFreshness, type DeliverableThing, type GotAnswer, type MinderFriend, type MinderGetOpts, type MinderOpts, type MinderTryAtOpts, type QueryCacheOpts,
  type ScopeAt, type TSQAnswer, type TSQGotAnswer, type ThingAt, type ThingCar, type TsqStaleTime,
  FixedQueryCacheOpts, MinderChecks,
} from '../shapes/shapes-minder'
import { bestCarOf, carOf, dbHasNewer } from './thing-car'

/** One bank's Things as best known on this device, a car for each, from all the vaultDB has said of them.
 * Three sources tell it of a Thing, in any order, late or more than once: a get's answer (the whole record, or the
 * Thing's shell where nothing is stored), the watch's notice of each write, and a list's sparse record. Each lands
 * in the Thing's car through one merge, which holds:
 * - A car never goes back: it carries the newest revision any source has told of, and a newer life replaces an older one whole.
 * - The order things arrive in never changes the car's liveness, or the revisions it carries.
 * - A sparse record never displaces a whole one: it leaves the car `behind` (or `bare`), and the next get fetches the newest whole.
 * - A get answered with a revision older than the car it began with changes nothing.
 * It caches only from `hello` until `goodbye`, and `goodbye` empties its cache.
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

  // == [Reading]: at, tryAt, get, list, isStaleAt, listen

  /** The cached car for `scoped`, however old, or undefined for none. Never asks the vaultDB. */
  at<LabelpathT extends Labelpath>(scoped: ScopeAt<LabelpathT>): CarAt<LabelpathT> | undefined {
    return this.#cachedAt(this.#demandOwnScope(scoped)) as CarAt<LabelpathT> | undefined
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
   * Each record is cached sparse. Where that leaves a car `behind` or `bare`, the next get fetches it whole. A deleted
   * Thing's car is `gone`, and answers from the cache.
   */
  async list(labelpath: Labelpath): Promise<Labelpath[]> {
    MinderChecks.minderLabelpath.parse(labelpath)
    this.#demandReady()
    const answer = await this.#vaultDB.tryListThings(this.#bank.makeListAsk({ labelpath, ifAbsent: 'nil' }))
    if (! answer.ok) { throw answer.err }
    TSQ.notifyManager.batch(() => {
      for (const record of answer.val) { this.#sendToTSQ(record) }
    })
    return answer.val.map((record) => record.labelpath)
  }

  /** True when `scoped`'s car is missing or not timely. */
  isStaleAt(scoped: ThingScope, opts: MinderGetOpts = {}): boolean {
    MinderChecks.minderGetOpts.parse(opts)
    const carQuery = this.#tsqFind(this.#demandOwnScope(scoped))
    return (! isTimelyQuery(carQuery, opts.staleTime ?? this.#queryCacheOpts.staleTime))
  }

  /** Call `listener` each time a car changes, with the answer for its scope. Returns the function that stops it.
   * A car changes when a record arrives in it (even one that changes nothing), a get of it is refused, or it is
   * removed. The answer's `isTimely` uses the minder's own `staleTime`.
   * Nothing is called when a car ages past `staleTime`, and listening caches no car.
   * What `listener` throws goes to the bank's `tellBadNews`, and stops nothing.
   */
  listen(listener: (answer: TSQGotAnswer) => void): () => void {
    MinderChecks.minderListener.parse(listener)
    return this.#tsq.getQueryCache().subscribe((event: unknown) => {
      if (! isUsefulTSQEvent(event)) { return }
      const answer = this.#answerOfTSQ(this.#askAt(this.#scopeOfQueryKey(event.query.queryKey)), {})
      try {
        listener(answer)
      } catch (err) {
        this.#bank.tellBadNews([Throwers.unexpectedError(err)])
      }
    })
  }
  // --

  // == [TSQ Direct Cache Calls]: #backgroundRefresh, #doGet, #fetchCar, #cachedAt, #tsqFind, #sendToTSQ

  // Its refusal is cached beside the car, where the next tryAt finds it as `lastErr`.
  /** Fetch `scoped`'s car in the background, if it is stale. */
  #backgroundRefresh(scoped: ThingScope, opts: MinderGetOpts): void {
    void this.#doGet(scoped, opts).catch(noop)
  }

  /** `scoped`'s car: the cached one if timely within `opts.staleTime`, else from the vaultDB. */
  async #doGet(scoped: ThingScope, opts: MinderGetOpts): Promise<ThingCar<Thing>> {
    let fetched: ThingCar<Thing>
    try {
      fetched = await this.#tsq.query(this.#tsqQueryOptions(scoped, opts))
    } catch (err) {
      // TanStack cancels a get under way when goodbye empties the cache.
      throw (err instanceof TSQ.CancelledError) ? minderNotStarted() : err
    }
    // TanStack resolves with what the queryFn returned, not what structural sharing kept: a notice that landed during the
    // get may have left the cache a later record.
    return this.#cachedAt(scoped) ?? fetched
  }

  /** Fetch `ask`'s car from the vaultDB, made of its shell where storage has nothing.
   * Refuses `stale_read` for an answer older than the revision cached when it began.
   */
  async #fetchCar(ask: GetAsk): Promise<ThingCar<Thing>> {
    // Held before asking: a record that lands while the get waits only makes its answer late (notes/wontfix.md).
    const prior  = this.#cachedAt(ask)
    const answer = await this.#vaultDB.tryGetThing(ask)
    if (! answer.ok) { throw answer.err }
    const record = answer.val ?? this.#shellAt(ask)
    // TanStack leaves the car and its time as they were, marks it invalidated, and caches the refusal beside it as its error.
    if ((prior !== undefined) && (cmpThings(prior.newest, record) < 0)) { throw staleRead(ask) }
    return carOf(record)
  }

  /** The cached car for `scoped`, a scope in this minder's bank, or undefined for none. */
  #cachedAt(scoped: ThingScope): ThingCar<Thing> | undefined {
    return this.#tsq.getQueryData<ThingCar<Thing>>(this.queryKey(scoped))
  }

  /** The cache's query of `scoped`'s car, or undefined for none. */
  #tsqFind(scoped: ThingScope): TSQ.Query<ThingCar<Thing>> | undefined {
    return this.#tsq.getQueryCache().find<ThingCar<Thing>>({ queryKey: this.queryKey(scoped), exact: true })
  }

  /** Send `record`'s car to TanStack, to merge into its cached car, while minding. */
  #sendToTSQ(record: DeliverableThing): void {
    if (! this.#isReady) { return }
    this.#tsq.setQueryData(this.queryKey(record), carOf(record))
  }
  // --

  // == [TSQ Asks]: queryKey, #tsqQueryOptions, #askAt, #shellAt

  // Each label is a segment of its own, so that the key without its final '.' selects a Thing and everything under it.
  // The '.' marks the Thing itself, and can never be a label: TanStack matches query defaults by key prefix, so without
  // it the root box's key would start every box's key, and no defaults could single out the root box. A labelpath
  // starts with its modelkind, so the key does too.
  /** The query key `scoped`'s car is cached under. */
  queryKey(scoped: ThingScope): TSQ.QueryKey { return ['safebyok', this.userid, this.banklabel, ...scoped.labelpath.split('/'), '.'] }

  // TanStack spreads these over the query defaults: a staleTime key given as undefined would put TanStack's 0 in place of the minder's own.
  /** TanStack's query options for a get of `scoped`'s car, with `opts.staleTime` where given, else the minder's query defaults' own. */
  #tsqQueryOptions(scoped: ThingScope, opts: MinderGetOpts): TSQ.QueryExecuteOptions<ThingCar<Thing>> {
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
    return scoped.labelpath.includes('/') ? shellOf(scoped, this.rootBox) : shellOf(scoped)
  }
  // --

  // == [Checks]: scope, rootBox, #rootBoxScope, #demandOwnScope, #demandReady, #scopeOfQueryKey

  /** The scope of this minder's bank. */
  get scope(): ThingWatchScope { return { userid: this.userid, banklabel: this.banklabel } }

  /** The bank's root box, the parent of every box: before the bank's birth, its shell. */
  get rootBox(): MinderFriend['rootBox'] { return this.#bank.rootBox }

  /** The scope of the bank's root box. */
  get #rootBoxScope(): ThingScope { return { ...this.scope, labelpath: RootBoxLabelpath } }

  /** The scope of `scoped`, demanding that it is in this minder's bank. */
  #demandOwnScope(scoped: ThingScope): ThingScope {
    // Its fields alone: an ask or a record passes, and is read as its scope.
    return ThingChecks.thingScope.parseConsistent(scoped, this.scope)
  }

  /** Demand that the minder is minding: after `hello`, before `goodbye`. */
  #demandReady(): void {
    if (! this.#isReady) { throw minderNotStarted() }
  }

  /** The scope whose car is cached under `queryKey`, one of this minder's query keys. */
  #scopeOfQueryKey(queryKey: TSQ.QueryKey): ThingScope {
    return { ...this.scope, labelpath: queryKey.slice(3, -1).join('/') }
  }
  // --

  // == [TSQ Helpers]: #answerOfTSQ

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
  // --
}

// == [Helpers]: isUsefulTSQEvent, gotAnswerOf, isTimelyQuery, staleTimeFnOf

// A record arrives (success), a get is refused (which leaves the car untimely), or the car is removed. A fetch starting,
// pausing or failing once, and the observers' bookkeeping change none.
/** True for a cache event a listener hears: a car removed, or a query's success or error. */
function isUsefulTSQEvent(event: unknown): event is Readonly<{ type: 'removed' | 'updated', query: TSQ.Query }> {
  if (! (event instanceof Object)) { return false }
  const qcne = event as TSQ.QueryCacheNotifyEvent
  if (qcne.type === 'removed') { return true }
  return (qcne.type === 'updated') && ['success', 'error'].includes(qcne.action.type)
}

/** The {@link GotAnswer} for `carQuery`, the query of `ask`'s car, with the car and whether it is timely within `staleTime`. */
function gotAnswerOf(ask: GetAsk, carQuery: TSQ.Query<ThingCar<Thing>> | undefined, staleTime: TsqStaleTime): GotAnswer & Pick<CarFreshness, 'car' | 'isTimely'> {
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
function isTimelyQuery(carQuery: TSQ.Query<ThingCar<Thing>> | undefined, staleTime: TsqStaleTime): boolean {
  const car = carQuery?.state.data
  if ((carQuery === undefined) || (car === undefined)) { return false }
  if (dbHasNewer(car))                                 { return false }
  return (! carQuery.isStaleByTime(staleTime))
}

// Every query in the minder's cache has a car the minder cached.
/** TanStack's staleTime for a car's query: `staleTime`, or 0 where {@link dbHasNewer}. */
function staleTimeFnOf(staleTime: TsqStaleTime): (carQuery: Readonly<{ state: Readonly<{ data: unknown }> }>) => TSQ.StaleTime {
  return (carQuery) => {
    const car = carQuery.state.data as ThingCar<Thing> | undefined
    return ((car !== undefined) && dbHasNewer(car)) ? 0 : staleTime
  }
}
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
