// The ThingMinder is an exemplar at both of its ends. Its interface is the minder as we would design it for the layer in
// front of it: scopes, records, acts and refusals, in our vocabulary. Its implementation shows TanStack Query used as
// its authors intend: each need is met by the feature TanStack built for that job (query defaults, structural sharing,
// invalidation, the error state, the cache's events), chosen because it fits, not because it was nearest to hand.
// Where a ruling, a design note or this code seems to serve one end at the other's expense, report it rather than split
// the difference.

/** `ThingMinder`, which keeps one kind of Thing in one bank fresh in a TanStack Query cache. */

import * as TSQ from '@tanstack/query-core'
import { noop } from 'es-toolkit'
import { exactOptional } from 'zod'
import { Errors, Logger, Outcome, SX, Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import {
  type GetThingAsk, type LoggableAsk, type Sparse, type Thing, type ThingScope, type ThingWatchScope, type Thingkind, type WorldRecord,
  BankThingFormat, BoxThingFormat, GateThingFormat, KindChecks, ShellCited, ShellLifeseq, checkedGetThingAsk, childShellCited, loggableAskOf, modelkindOf, thingkindVals,
} from '../storage/shapes-thing'
import { type BadAnswer, type GoodAnswer, type ThingNotice, type VaultDB, isVaultDB } from '../storage/vault-db'
import {
  type MinderAskOpts, type MinderFriend, type MinderGetAskOpts, type QueryCacheOpts, type ThingTies,
  DefaultQueryCacheOpts, FixedQueryCacheOpts, minderAskOpts, minderFriend, minderGetAskOpts, minderListener, queryCacheOpts, tsqClient,
} from './shapes-minder'

// == [Answers]: VoidSentinel, voidSentinelOf, DeliverableThing, GotAnswer, TSQEntryState, TSQAnswer

/** What the cache holds for a scope where storage holds nothing: the shell of the Thing there, a tombstone with every Thing field and no body.
 * Its revseq is -1. A write cites it as the Thing it expects to find, to make the Thing's first revision.
 */
export type VoidSentinel = Sparse<Thing> & Readonly<{ am: 'x' }>

/** The `fmt` of each kind of Thing. */
const ThingFormats = { bank: BankThingFormat, gate: GateThingFormat, box: BoxThingFormat } as const satisfies Record<Thingkind, number>

/** The void sentinel at `scoped`: a root's where `parentLifepath` is null, else that of a Thing under a parent living at `parentLifepath`. */
export function voidSentinelOf(scoped: ThingScope, parentLifepath: string | null): VoidSentinel {
  const { userid, banklabel, labelpath } = scoped
  const cited = (parentLifepath === null) ? ShellCited : childShellCited(parentLifepath)
  return Object.freeze({
    userid, banklabel, labelpath, label: labelpath.slice(labelpath.lastIndexOf('/') + 1), fmt: ThingFormats[modelkindOf(labelpath)],
    ...cited, am: 'x', lifeseq: ShellLifeseq, born_at: SX.VoidTime, written_at: SX.VoidTime,
  })
}

/** A record on its way to the cache: a Thing, whole or sparse, or the void sentinel for a scope where storage holds nothing. */
export type DeliverableThing = Thing | Sparse<Thing> | VoidSentinel

// `val` is undefined under `vacant` and `untimely`, where the cache knows nothing timely; null under `gotvoid`, where storage holds nothing.
/** The cache's record for a scope, shaped like a get's answer. Act `vacant` means nothing is cached, and `untimely` means the cached record is older than asked. */
type GotAnswer = (
  | GoodAnswer<Thing | Sparse<Thing>, 'gotlive' | 'gotgone'>
  | GoodAnswer<null, 'gotvoid'>
  | { ok: true, ask: LoggableAsk, act: 'vacant' | 'untimely', world: null, val: undefined }
) & { ask: GetThingAsk }

/** How recent a cache entry is, and how its last get went. */
interface TSQEntryState { isTimely: boolean, refreshedAt: number, isFetching: boolean, lastErr: Errors.VaultError | null }

/** The cache's answer for a scope, read without waiting on the vaultDB: a get's answer with the entry's freshness (`isTimely`, `refreshedAt`, `isFetching`, `lastErr`), or a refusal. */
export type TSQAnswer = (GotAnswer & TSQEntryState) | BadAnswer
// --

// == [Arguments]: MinderRoster, MinderOpts, Checks, isRosterOwn

/** The minder of each kind of Thing in a bank, as one minder hands them the Things it hears of. */
export type MinderRoster = Readonly<Partial<Record<Thingkind, ThingMinder>>>

/** The options of {@link ThingMinder.make}, beside its ties and its bank. */
export interface MinderOpts {
  /** Where the bank's Things are stored. */
  vaultDB:         VaultDB
  /** The TanStack Query client whose cache holds the records. A host may share its own. */
  tsq:             TSQ.QueryClient
  /** How long a record stays timely, and an entry no one listens to stays cached. A missing field defaults from {@link DefaultQueryCacheOpts}. */
  queryCacheOpts?: Partial<QueryCacheOpts>
  /** The minders of the bank's other kinds of Thing, which this minder hands each Thing of their kind it hears of. */
  minders?:        MinderRoster
}

// Defined here, not with the shapes: they name the minder's own class.
/** The checks of {@link ThingMinder.make}'s arguments. */
const Checks = Validator.Checkers('bad_option', ({ obj, oneof, custom, orDefault }) => {
  const minder = custom<ThingMinder>((val) => val instanceof ThingMinder, Phrases.MinderExpected)
  const roster = obj({ bank: exactOptional(minder), gate: exactOptional(minder), box: exactOptional(minder) }).strict()
  return {
    minderMakeArgs: obj({
      ties: obj({ modelkind: oneof(thingkindVals) }),
      opts: obj({
        vaultDB:        custom<VaultDB>(isVaultDB, Phrases.VaultDBExpected),
        tsq:            tsqClient,
        queryCacheOpts: orDefault(queryCacheOpts, DefaultQueryCacheOpts),
        minders:        orDefault(roster, {}),
      }),
      bank: minderFriend,
    }).refine(isRosterOwn, Phrases.MinderOfOtherKind),
  }
})

/** True when each minder of `opts.minders` minds the kind it is given for, in `bank`. */
function isRosterOwn({ opts: { minders }, bank }: { opts: { minders: MinderRoster }, bank: MinderFriend }): boolean {
  const { userid, banklabel } = bank.scope
  return Object.entries(minders).every(([modelkind, minder]) => Validator.isConsistent(minder.ties, { userid, banklabel, modelkind }))
}
// --

/** Keeps one kind of Thing in one bank fresh in a TanStack Query cache. The bank's own minder watches the bank for every minder of it. */
export class ThingMinder {
  // == [Props]: userid, banklabel, modelkind, #bank, #vaultDB, #tsq, #queryCacheOpts, #recordChecker, #minders, #unwatch, #isReady
  readonly userid:    string
  readonly banklabel: string
  readonly modelkind: Thingkind
  readonly #bank:           MinderFriend
  readonly #vaultDB:        VaultDB
  readonly #tsq:            TSQ.QueryClient
  readonly #queryCacheOpts: Readonly<QueryCacheOpts>
  readonly #recordChecker:  typeof KindChecks[Thingkind]['record']
  /** The minder each kind of Thing goes to, this one for its own kind. */
  readonly #minders:        MinderRoster
  #unwatch: (() => void) | null = null
  /** True from `hello` until `goodbye`: the reads answer, and records are cached, only then. */
  #isReady = false
  // --

  // == [Construction]: make, constructor

  /** Make a minder of `ties.modelkind` in `bank`, asking `opts.vaultDB` and caching in `opts.tsq`. Call `hello` to start it.
   * A bank's minder hands each gate and box it hears of to `opts.minders`.
   */
  static make(ties: Pick<ThingTies, 'modelkind'>, opts: MinderOpts, bank: MinderFriend): ThingMinder {
    const checked = Checks.minderMakeArgs.parse({ ties, opts, bank })
    return new ThingMinder(checked.ties, checked.opts, checked.bank)
  }

  private constructor(ties: Pick<ThingTies, 'modelkind'>, opts: Required<Omit<MinderOpts, 'queryCacheOpts'>> & { queryCacheOpts: QueryCacheOpts }, bank: MinderFriend) {
    const { userid, banklabel } = bank.scope
    this.userid          = userid
    this.banklabel       = banklabel
    this.modelkind       = ties.modelkind
    this.#bank           = bank
    this.#vaultDB        = opts.vaultDB
    this.#tsq            = opts.tsq
    this.#queryCacheOpts = Object.freeze(opts.queryCacheOpts)
    this.#recordChecker  = KindChecks[this.modelkind].record
    this.#minders        = Object.freeze({ ...opts.minders, [this.modelkind]: this })
    Object.freeze(this)
  }
  // --

  // == [Starting and ending]: hello, #startVaultDBWatch, goodbye

  /** Start minding: set this minder's defaults on the cache, and for the bank's minder, watch the bank. A second call does nothing. */
  hello(): void {
    if (this.#isReady) { return }
    this.#tsq.setQueryDefaults(this.keyPrefix, {
      ...this.#queryCacheOpts,
      ...FixedQueryCacheOpts,
      structuralSharing: (prior: unknown, record: unknown) => betterRecordOf(prior, record, (cached) => this.#isWholeRecord(cached)),
    })
    this.#isReady = true
    if (this.modelkind === 'bank') { this.#startVaultDBWatch() }
  }

  /** Watch the bank: each notice goes to `#receive`, and the watch's trouble to `#reportTrouble`. */
  #startVaultDBWatch(): void {
    this.#unwatch = this.#vaultDB.watch(this.scope, (notice: ThingNotice) => { this.#receive(notice) }, (news) => { this.#reportTrouble(news, 'watch') })
  }

  /** Stop minding, and remove this minder's entries and defaults from the cache. Reads refuse until `hello` is called again. */
  goodbye(): void {
    this.#isReady = false
    if (this.#unwatch) { this.#unwatch() }
    this.#unwatch = null
    this.#tsq.removeQueries({ queryKey: this.keyPrefix })
    // TanStack Query cannot remove a key's defaults: empty ones in their place set nothing.
    this.#tsq.setQueryDefaults(this.keyPrefix, {})
  }
  // --

  // == [Reading]: at, tryAt, get, list, isStaleAt, listen

  /** The cached record for `scoped`, however old, or undefined for none. Never asks the vaultDB. */
  at(scoped: ThingScope): DeliverableThing | undefined {
    return this.#tsq.getQueryData<DeliverableThing>(this.queryKey(scoped))
  }

  /** The cache's answer for `ask`'s scope, and whether it is timely. Never waits on the vaultDB.
   * - `staleTime`          -- a record older than this (milliseconds) is `untimely`, without its `val`
   * - `ifStale: 'get'`     -- read the cache alone (default)
   * - `ifStale: 'refresh'` -- also fetch a stale or vacant record in the background
   */
  tryAt(ask: GetThingAsk & { ifAbsent: 'nil' }, opts: MinderAskOpts = {}): TSQAnswer {
    try {
      const { staleTime = this.#queryCacheOpts.staleTime, ifStale = 'get' } = minderAskOpts.parse(opts)
      this.#demandReady()
      const checked = this.#demandOwnAsk(ask)
      if (ifStale === 'refresh') { this.#backgroundRefresh(ask, { staleTime }) }
      // Found after the refresh starts, so that a vacant entry's answer is isFetching.
      return this.#answerOfTSQ(checked, this.#tsqFind(ask), staleTime)
    } catch (err) {
      return { ok: false, ask: loggableAskOf(ask), act: 'unclassified_storing', world: null, dbhas: null, err: Outcome.storageRefusalOf(err) }
    }
  }

  /** Get the record `ask` names: the cached one if timely, else from the vaultDB. A get already under way is shared.
   * Refuses `stale_read` where storage answers older than the record cached when the get began. That record stays cached, and no longer counts as timely.
   * Refuses `disabled` where `goodbye` is called while it waits.
   */
  async get(ask: GetThingAsk & { ifAbsent: 'nil' }, opts: MinderGetAskOpts = {}): Promise<DeliverableThing> {
    const checkedOpts = minderGetAskOpts.parse(opts)
    this.#demandReady()
    this.#demandOwnAsk(ask)
    return this.#doGet(ask, checkedOpts)
  }

  /** List the Things one label under this minder's root, tombstones included, and resolve their labelpaths. A box minder lists the boxes under the root box.
   * Each enters the cache as a sparse record, stale unless the cache holds it whole, so that the next get fetches it whole.
   */
  async list(): Promise<string[]> {
    this.#demandReady()
    const answer = await this.#vaultDB.tryListThings(this.#vaultDB.listAsk({ ...this.scope, labelpath: this.modelkind, ifAbsent: 'nil' }))
    if (! answer.ok) { throw answer.err }
    TSQ.notifyManager.batch(() => {
      this.#routeWorld(answer.world)
      for (const record of answer.val) { this.#doDeliverSeed(record) }
    })
    return answer.val.map((record) => record.labelpath)
  }

  /** True when no cached record for `scoped` is timely within `staleTime`. */
  isStaleAt(scoped: ThingScope, staleTime: number = this.#queryCacheOpts.staleTime): boolean {
    return this.#tsqFind(scoped)?.isStaleByTime(staleTime) ?? true
  }

  /** Call `listener` with a scope and the record now cached there, undefined once removed, each time the record or its standing changes.
   * A record that lands is told even when it changes nothing. So is a get's refusal, or an invalidation, after which the record is no longer timely.
   * Returns the function that stops it. What the listener throws goes to the default logger, the console unless the host set one, and stops nothing.
   */
  listen(listener: (scoped: ThingScope, record: DeliverableThing | undefined) => void): () => void {
    const checked = minderListener.parse(listener)
    const { keyPrefix } = this
    return this.#tsq.getQueryCache().subscribe((event) => {
      if (! (isRecordEvent(event) && TSQ.matchQuery({ queryKey: keyPrefix }, event.query))) { return }
      // The cache's events are typed loosely; an entry under this minder's prefix holds a record of its own.
      const entry = event.query as TSQ.Query<DeliverableThing>
      try { checked(this.#scopeOfKey(entry.queryKey), (event.type === 'removed') ? undefined : entry.state.data) } catch (err) { this.#reportTrouble(err, 'listen') }
    })
  }
  // --

  // == [TSQ Direct Cache Calls]: #backgroundRefresh, #doGet, #tsqFind

  // Its refusal lands in the entry, where the next tryAt finds it as `lastErr`.
  /** Initiate fetch of `ask`'s record, if it is stale, without waiting for the result. If a fetch is under way, it will use its result (not starting a new one). */
  #backgroundRefresh(ask: GetThingAsk & { ifAbsent: 'nil' }, opts: MinderGetAskOpts): void {
    void this.#doGet(ask, opts).catch(noop)
  }

  /** The record for `ask`'s scope, from the cache if timely within `staleTime`, else from the vaultDB. */
  async #doGet(ask: GetThingAsk & { ifAbsent: 'nil' }, opts: MinderGetAskOpts): Promise<DeliverableThing> {
    let fetched: DeliverableThing
    try {
      fetched = await this.#tsq.query({ ...this.#tsqGetAskOf(ask), ...opts })
    } catch (err) {
      // TanStack cancels a get under way when goodbye removes its entry.
      throw (err instanceof TSQ.CancelledError) ? minderNotStarted() : err
    }
    // A notice can land after the queryFn returns and before TanStack resolves the fetch with what it returned.
    return this.at(ask) ?? fetched
  }

  /** The cache's entry for `scoped`, or undefined for none. */
  #tsqFind(scoped: ThingScope): TSQ.Query<DeliverableThing> | undefined {
    return this.#tsq.getQueryCache().find<DeliverableThing>({ queryKey: this.queryKey(scoped), exact: true })
  }
  // --

  // == [VaultDB->Minder Delivery]: #receive, #routeWorld, #route, #doDeliverSeed, #doDeliverRecord

  /** Cache what a notice of the bank's watch carries, each Thing in the minder of its kind: its world's bank and main gate, then its own Thing. */
  #receive(notice: ThingNotice): void {
    TSQ.notifyManager.batch(() => {
      this.#routeWorld(notice.world)
      this.#route(notice.val)
    })
  }

  /** Hand the bank and the main gate of `world` each to the minder of its kind. */
  #routeWorld(world: WorldRecord | null): void {
    if (world === null) { return }
    const { maingate, ...bank } = world
    this.#route(bank)
    this.#route(maingate)
  }

  /** Hand `record` to the minder of its kind. Skips a Thing of a kind no minder here minds. */
  #route(record: Thing): void {
    const minder = this.#minders[modelkindOf(record.labelpath)]
    if (minder) { minder.#doDeliverRecord(record) }
  }

  // Invalidated, not refetched: the next get, or a listener's next look, fetches it whole.
  /** Cache sparse `record`. Unless the cache already has the whole record, mark it stale: the next get will fetch it whole. */
  #doDeliverSeed(record: Sparse<Thing>): void {
    this.#doDeliverRecord(record)
    if (! this.isWholeRecordAt(record)) {
      void this.#tsq.invalidateQueries({ queryKey: this.queryKey(record), exact: true, refetchType: 'none' })
    }
  }

  /** Send `record` to the cache, while this minder is minding. TSQ will use betterRecordOf to identify what, if anything, has changed. */
  #doDeliverRecord(record: DeliverableThing): void {
    if (! this.#isReady) { return }
    this.#tsq.setQueryData(this.queryKey(record), record)
  }
  // --

  // == [TSQ Asks]: keyPrefix, queryKey, #tsqGetAskOf, #voidSentinelAt

  /** The key every one of this minder's cache entries starts with. */
  get keyPrefix(): TSQ.QueryKey { return ['safebyok', this.userid, this.banklabel, this.modelkind] }

  // Each label is a segment of its own, so that a key prefix selects a Thing and everything under it. A labelpath
  // starts with its modelkind, so the key does too.
  /** The key of the cache entry for `scoped`. */
  queryKey(scoped: ThingScope): TSQ.QueryKey { return ['safebyok', this.userid, this.banklabel, ...scoped.labelpath.split('/')] }

  /** TanStack's query options for a get of `ask`. Its record, and the world beside it, go in through `#doDeliverRecord`. */
  #tsqGetAskOf(ask: GetThingAsk & { ifAbsent: 'nil' }) {
    return {
      queryKey: this.queryKey(ask),
      queryFn:  async (): Promise<DeliverableThing> => {
        // Held before asking: a record that lands while the get waits only makes its answer late (notes/wontfix.md).
        const prior  = this.at(ask)
        const answer = await this.#vaultDB.tryGetThing(ask)
        if (! answer.ok) { throw answer.err }
        const record = answer.val ?? this.#voidSentinelAt(ask)
        // TanStack keeps the entry's record and its time, marks it invalidated, and holds the refusal as the entry's error.
        if ((prior !== undefined) && (cmpRecords(prior, record) < 0)) { throw staleRead(ask) }
        TSQ.notifyManager.batch(() => {
          this.#routeWorld(answer.world)
          this.#doDeliverRecord(record)
        })
        // TanStack writes what this returns over the entry: the record the entry holds changes nothing. After goodbye,
        // nothing was cached, and TanStack drops what this returns.
        return this.at(ask) ?? record
      },
    }
  }

  // Boxes are the only Things under a root, for now: one label under the root box.
  /** The void sentinel at `scoped`: a root's, or that of a box under the bank's root box. */
  #voidSentinelAt(scoped: ThingScope): VoidSentinel {
    return voidSentinelOf(scoped, scoped.labelpath.includes('/') ? this.#bank.rootBox.lifepath : null)
  }
  // --

  // == [Checks]: scope, ties, #isWholeRecord, isWholeRecordAt, #demandOwnAsk, #demandReady

  /** The bank this minder minds Things of. */
  get scope(): ThingWatchScope { return { userid: this.userid, banklabel: this.banklabel } }

  /** This minder's user, bank and modelkind. */
  get ties(): ThingTies { return { userid: this.userid, banklabel: this.banklabel, modelkind: this.modelkind } }

  /** True when `record` passes its kind's record check, so it has its body. A sparse record does not. */
  #isWholeRecord(record: DeliverableThing | undefined): boolean {
    return this.#recordChecker.safeParse(record).success
  }

  /** Internal. True when the record cached at `scoped` has its body: not sparse, not the void sentinel, and not missing. */
  isWholeRecordAt(scoped: ThingScope): boolean {
    return this.#isWholeRecord(this.at(scoped))
  }

  /** Demand that `rawAsk` is a get ask with `ifAbsent: 'nil'`, for this minder's bank and modelkind. Throws `bad_option`. */
  #demandOwnAsk(rawAsk: unknown): GetThingAsk {
    return Validator.checkedConsistent(checkedGetThingAsk(rawAsk), { ...this.ties, ifAbsent: 'nil' }, { kind: 'bad_option' })
  }

  /** Demand that the minder is minding: after `hello`, before `goodbye`. */
  #demandReady(): void {
    if (! this.#isReady) { throw minderNotStarted() }
  }

  /** The scope of the cache entry at `queryKey`, one of this minder's. */
  #scopeOfKey(queryKey: TSQ.QueryKey): ThingScope {
    return { userid: this.userid, banklabel: this.banklabel, labelpath: queryKey.slice(3).join('/') }
  }

  /** Report `err`, which no caller is waiting to hear, to the console or the logger the host set as the default. */
  #reportTrouble(err: unknown, oplabel: 'watch' | 'listen'): void {
    Logger.DefaultLogger.error(Phrases.MinderTrouble, { oplabel: `ThingMinder.${oplabel}`, ...this.ties }, Logger.asError(err))
  }
  // --

  // == [TSQ Helpers]: #answerOfTSQ

  /** The {@link TSQAnswer} for `entry`, the cache's entry for `ask`'s scope. */
  #answerOfTSQ(ask: GetThingAsk, entry: TSQ.Query<DeliverableThing> | undefined, staleTime: number): TSQAnswer {
    const state    = entry?.state
    const isTimely = (! (entry?.isStaleByTime(staleTime) ?? true))
    return {
      ...gotAnswerOf(ask, state?.data, isTimely),
      isTimely,
      refreshedAt: state?.dataUpdatedAt ?? 0,
      isFetching:  (state?.fetchStatus === 'fetching'),
      lastErr:     ((state === undefined) || (state.error === null)) ? null : Outcome.storageRefusalOf(state.error),
    }
  }
  // --
}

// == [Helpers]: minderNotStarted, staleRead, isRecordEvent, isVoidSentinel, gotAnswerOf, betterRecordOf, cmpRecords

/** The refusal of a read on a minder that is not minding. */
function minderNotStarted(): Errors.VaultError {
  return new Errors.VaultError('disabled', Phrases.MinderNotStarted)
}

/** The refusal of a get that storage answered older than the record cached when it began. */
function staleRead(ask: GetThingAsk): Errors.VaultError {
  return new Errors.VaultError('stale_read', Phrases.StaleRead, { meta: { ask: loggableAskOf(ask) } })
}

// A record lands (success), a get is refused or the entry invalidated (both leave the record untimely), or the entry
// is removed. Adding an entry, a fetch starting, pausing or failing once, and the observers' bookkeeping change none.
/** True for a cache event that changes an entry's record, or whether it is timely. */
function isRecordEvent(event: TSQ.QueryCacheNotifyEvent): boolean {
  if (event.type === 'removed') { return true }
  return (event.type === 'updated') && ['success', 'error', 'invalidate'].includes(event.action.type)
}

/** True when `record` is a void sentinel: its revseq is the shell's -1. */
function isVoidSentinel(record: DeliverableThing): record is VoidSentinel {
  return record.revseq === SX.VoidRevisionSeq
}

/** A get's answer for `record`, the cached record at `ask`'s scope: act `vacant` for none, `untimely` unless `isTimely`, `gotvoid` for a void sentinel. */
function gotAnswerOf(ask: GetThingAsk, record: DeliverableThing | undefined, isTimely: boolean): GotAnswer {
  if (record === undefined) { return { ok: true, ask, act: 'vacant', world: null, val: undefined } }
  if (! isTimely) { return { ok: true, ask, act: 'untimely', world: null, val: undefined } }
  if (isVoidSentinel(record)) { return { ok: true, ask, act: 'gotvoid', world: null, val: null } }
  return { ok: true, ask, act: (record.am === 'a') ? 'gotlive' : 'gotgone', world: null, val: record }
}

// Kept pure: TanStack also calls it on observers' results, and marks the entry fresh whichever record it keeps.
/** The later of `prior` and `record`, by lifepath, then revseq. For the same revision, `record` wins only if it is whole and `prior` is not. */
function betterRecordOf(prior: unknown, record: unknown, isWholeRecord: (cached: DeliverableThing) => boolean): unknown {
  if (prior === undefined) { return record }
  const [ante, post] = [prior as DeliverableThing, record as DeliverableThing]
  const cmp = cmpRecords(ante, post) || ((isWholeRecord(post) && ! isWholeRecord(ante)) ? 1 : 0)
  return (cmp > 0) ? TSQ.replaceEqualDeep(prior, record) : prior
}

// The lifepath decides first: a Thing born under a new life of its parent starts again at revseq 0. Lifeseqs are
// fixed-width base-32 digits, 0-9 then a-v, so lifepaths compare as strings; the shell's '-' sorts below them all.
/** Positive when `post` is later than `ante` (a later life, or a later revision of the same life), negative when earlier, zero for the same revision. */
function cmpRecords(ante: Pick<DeliverableThing, 'lifepath' | 'revseq'>, post: Pick<DeliverableThing, 'lifepath' | 'revseq'>): number {
  if (ante.lifepath !== post.lifepath) { return (post.lifepath > ante.lifepath) ? 1 : -1 }
  return post.revseq - ante.revseq
}
// --
