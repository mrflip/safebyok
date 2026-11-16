/** `ThingMinder`, which keeps one kind of Thing in one bank fresh in a TanStack Query cache. */

import * as TSQ from '@tanstack/query-core'
import { noop } from 'es-toolkit'
import { Errors, Outcome, SX, Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import { type GetThingAsk, type ListThingsAsk, type LoggableAsk, type Sparse, type Thing, type ThingScope, type ThingWatchScope, type Thingkind, KindChecks, ShellCited, checkedGetThingAsk, loggableAskOf, modelkindOf } from '../storage/shapes-thing'
import type { BadAnswer, GetThingAnswer, GoodAnswer, ThingNotice, VaultDB, WriteThingAnswer } from '../storage/vault-db'
import { type MinderAskOpts, type MinderBank, type MinderGetAskOpts, type QueryCacheOpts, type ThingPins, minderAskOpts, minderGetAskOpts, minderMakeArgs, thingPins } from './shapes-minder'

// == [Answers]: VoidSentinel, TSQAnswer

/** The cached record for a scope the vaultDB reported empty: the shell, which sorts below every Thing. */
export const VoidSentinel = Object.freeze({ ...ShellCited, revseq: SX.VoidRevisionSeq })
/** The type of {@link VoidSentinel}: the shell's fields, at revseq -1, and no scope. */
export type VoidSentinel = typeof VoidSentinel

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

/** Keeps one kind of Thing in one bank fresh in a TanStack Query cache. */
export class ThingMinder {
  // == [Props]: userid, banklabel, scope, modelkind, #bank, #vaultDB, #tsq, #onBadNews, #queryCacheOpts, #staleTime, #unwatch, #isReady
  readonly userid:    string
  readonly banklabel: string
  /** The bank this minder watches. */
  readonly scope:     ThingWatchScope
  readonly modelkind: Thingkind
  readonly #bank:           MinderBank
  readonly #vaultDB:        VaultDB
  readonly #tsq:            TSQ.QueryClient
  readonly #onBadNews:      (news: Errors.VaultError) => void
  readonly #queryCacheOpts: Readonly<QueryCacheOpts>
  readonly #staleTime:      number
  #unwatch:  (() => void) | null = null
  /** True from `hello` until `goodbye`: the reads answer only then. */
  #isReady = false
  // --

  // == [Construction]: make, constructor

  /** Make a minder of `pins.modelkind` in `bank`, asking `vaultDB`, caching in `tsq`, and reporting watch trouble to `onBadNews`. Call `hello` to start it. */
  static make(pins: Pick<ThingPins, 'modelkind'>, opts: { bank: MinderBank, vaultDB: VaultDB, tsq: TSQ.QueryClient, onBadNews: (news: Errors.VaultError) => void }): ThingMinder {
    const { pins: checkedPins, opts: checked } = minderMakeArgs.parse({ pins, opts })
    return new ThingMinder(checkedPins, checked)
  }

  private constructor(pins: Pick<ThingPins, 'modelkind'>, opts: { bank: MinderBank, vaultDB: VaultDB, tsq: TSQ.QueryClient, onBadNews: (news: Errors.VaultError) => void }) {
    this.userid          = opts.bank.userid
    this.banklabel       = opts.bank.banklabel
    this.modelkind       = pins.modelkind
    this.#bank           = opts.bank
    this.#vaultDB        = opts.vaultDB
    this.#tsq            = opts.tsq
    this.#onBadNews      = opts.onBadNews
    this.#queryCacheOpts = opts.bank.queryCacheOpts
    this.#staleTime      = opts.bank.queryCacheOpts.staleTime
    this.scope           = Object.freeze({ userid: this.userid, banklabel: this.banklabel })
    Object.freeze(this)
  }
  // --

  // == [Starting and ending]: hello, #startVaultDBWatch, goodbye

  /** Start minding: set this minder's defaults on the cache and watch the bank, caching each record it hears of. Call it once. */
  hello(): void {
    this.#demandEnabled()
    this.#tsq.setQueryDefaults(this.keyPrefix, this.#queryCacheOpts)
    this.#tsq.setQueryDefaults([...this.keyPrefix, 'get'], { structuralSharing: (prior: unknown, record: unknown) => betterRecordOf(prior, record, (held) => this.#isWholeRecord(held)) })
    this.#startVaultDBWatch()
    this.#isReady = true
  }

  /** Watch the bank: each notice goes to the cache, and trouble goes to `onBadNews`. */
  #startVaultDBWatch(): void {
    this.#unwatch = this.#vaultDB.watch(this.scope, (notice: ThingNotice) => {
      this.#deliver(notice)
    }, this.#onBadNews)
  }

  /** Stop minding, and remove this minder's entries from the cache. Reads refuse until `hello` is called again. */
  goodbye(): void {
    this.#isReady = false
    if (this.#unwatch) { this.#unwatch() }
    this.#unwatch = null
    this.#vacateTSQ()
  }
  // --

  // == [Reading]: at, tryAt, get

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
      const { staleTime = this.#staleTime, ifStale = 'get' } = minderAskOpts.parse(opts)
      this.#demandEnabled()
      this.#demandReady()
      const checked = this.#demandOwnAsk(ask)
      if (ifStale === 'refresh') { this.#backgroundRefresh(ask, { staleTime }) }
      // Found after the refresh starts, so that a vacant entry's answer is isFetching.
      return this.#answerOfTSQ(checked, this.#tsqFind(ask), staleTime)
    } catch (err) {
      return { ok: false, ask: loggableAskOf(ask), act: 'unclassified_storing', world: null, dbhas: null, err: Outcome.storageRefusalOf(err) }
    }
  }

  /** Get the record `ask` names: the cached one if timely, else from the vaultDB. A get already under way is shared. */
  async get(ask: GetThingAsk & { ifAbsent: 'nil' }, opts: MinderGetAskOpts = {}): Promise<DeliverableThing> {
    const checkedOpts = minderGetAskOpts.parse(opts)
    this.#demandEnabled()
    this.#demandReady()
    this.#demandOwnAsk(ask)
    return this.#doGet(ask, checkedOpts)
  }
  // --

  // == [TSQ Direct Cache Calls]: #backgroundRefresh, #doGet, #tsqFind, #vacateTSQ

  // Its refusal lands in the entry, where the next tryAt finds it as `lastErr`.
  /** Start a get of `ask`'s record without waiting on it. Nothing is fetched while the cached record is timely within `staleTime`. */
  #backgroundRefresh(ask: GetThingAsk & { ifAbsent: 'nil' }, opts: MinderGetAskOpts): void {
    void this.#doGet(ask, opts).catch(noop)
  }

  /** The record for `ask`'s scope, from the cache if timely within `staleTime`, else from the vaultDB. */
  async #doGet(ask: GetThingAsk & { ifAbsent: 'nil' }, opts: MinderGetAskOpts): Promise<DeliverableThing> {
    const fetched = await this.#tsq.query({ ...this.#tsqGetAskOf(ask), ...opts })
    // TanStack resolves a fetch with the queryFn's record, not the one betterRecordOf kept: the entry holds that.
    return this.at(ask) ?? fetched
  }

  /** The cache's entry for `scoped`, or undefined for none. */
  #tsqFind(scoped: ThingScope): TSQ.Query<DeliverableThing> | undefined {
    return this.#tsq.getQueryCache().find<DeliverableThing>({ queryKey: this.queryKey(scoped), exact: true })
  }

  /** True when no cached record for `scoped` is timely within `staleTime`. */
  isStaleAt(scoped: ThingScope, staleTime: number = this.#staleTime): boolean {
    return this.#tsqFind(scoped)?.isStaleByTime(staleTime) ?? true
  }
  /** Remove every one of this minder's entries from the cache. */
  #vacateTSQ(): void {
    this.#tsq.removeQueries({ queryKey: this.keyPrefix })
  }
  // --

  // == [VaultDB->Minder Delivery]: #deliver, #doDeliverSeed, #doDeliverRecord

  /** Hand the cache the Thing `answer` reports: a good answer's `val`, or a refusal's `dbhas`. */
  #deliver(answer: ThingNotice | GetThingAnswer | WriteThingAnswer): void {
    const record = answer.ok ? answer.val : answer.dbhas
    if (record !== null) { this.#doDeliverRecord(record) }
  }

  // Invalidated, not refetched: the next get, or a listener's next look, fetches it whole.
  /** Hand the cache `record`, a listed child, and mark its entry stale if the cached record is sparse. */
  #doDeliverSeed(record: Sparse<Thing>): void {
    this.#doDeliverRecord(record)
    const held = this.at(record)
    if ((held !== undefined) && (! this.#isWholeRecord(held))) {
      void this.#tsq.invalidateQueries({ queryKey: this.queryKey(record), exact: true, refetchType: 'none' })
    }
  }

  /** Hand the cache `record` under its own key; an earlier record never replaces a later one. Skips a Thing of another modelkind. */
  #doDeliverRecord(record: Thing | Sparse<Thing>): void {
    if (! this.#isOurThing(record)) { return }
    this.#tsq.setQueryData(this.queryKey(record), record)
  }
  // --

  // == [TSQ Asks]: keyPrefix, queryKey, listingKey, #tsqGetAskOf, #tsqListAskOf

  /** The key every one of this minder's cache entries starts with. */
  get keyPrefix(): TSQ.QueryKey { return ['safebyok', this.userid, this.banklabel, this.modelkind] }

  // Each label is a segment of its own, so that a key prefix selects a Thing and everything under it.
  /** The key of the cache entry for a get of `scoped`. */
  queryKey(scoped: ThingScope): TSQ.QueryKey { return [...this.keyPrefix, 'get', ...scoped.labelpath.split('/')] }

  /** The key of the cache entry for a listing of `scoped`. */
  listingKey(scoped: ThingScope): TSQ.QueryKey { return [...this.keyPrefix, 'list', ...scoped.labelpath.split('/')] }

  /** TanStack's query options for a get of `ask`. */
  #tsqGetAskOf(ask: GetThingAsk & { ifAbsent: 'nil' }) {
    return {
      queryKey: this.queryKey(ask),
      queryFn:  async (): Promise<DeliverableThing> => {
        const answer = await this.#vaultDB.tryGetThing(ask)
        if (! answer.ok) { throw answer.err }
        return answer.val ?? VoidSentinel
      },
    }
  }

  // Unread until the minder's listing, tryList, is built (design-minder.md, The listing).
  /** TanStack's query options for a list of `ask`. The listing caches the children's labelpaths, and each child record has its own entry. */
  // @ts-expect-error -- unread until tryList
  #tsqListAskOf(ask: ListThingsAsk & { ifAbsent: 'nil' }) { // eslint-disable-line no-unused-private-class-members
    return {
      queryKey: this.listingKey(ask),
      queryFn:  async (): Promise<string[]> => {
        const answer = await this.#vaultDB.tryListThings(ask)
        if (! answer.ok) { throw answer.err }
        TSQ.notifyManager.batch(() => {
          for (const record of answer.val) { this.#doDeliverSeed(record) }
        })
        return answer.val.map((record) => record.labelpath)
      },
    }
  }
  // --

  // == [Checks]: pins, #isOurThing, #isWholeRecord, #demandOwnAsk, #demandEnabled, #demandReady

  /** This minder's user, bank and modelkind. */
  get pins(): ThingPins { return thingPins.parse(this) }

  /** True when the Thing at `labelpath` is of this minder's modelkind. */
  #isOurThing({ labelpath }: { labelpath: string }): boolean {
    return modelkindOf(labelpath) === this.modelkind
  }

  /** True when `record` passes its kind's record check, so it has its body. A sparse record does not. */
  #isWholeRecord(record: DeliverableThing): boolean {
    return KindChecks[this.modelkind].record.safeParse(record).success
  }

  /** Demand that `rawAsk` is a get ask with `ifAbsent: 'nil'`, for this minder's bank and modelkind. Throws `bad_option`. */
  #demandOwnAsk(rawAsk: unknown): GetThingAsk {
    return Validator.checkedConsistent(checkedGetThingAsk(rawAsk), { ...this.pins, ifAbsent: 'nil' }, { kind: 'bad_option' })
  }

  /** Demand that the bank is enabled. */
  #demandEnabled(): void {
    this.#bank.demandEnabled()
  }

  /** Demand that the minder is minding: after `hello`, before `goodbye`. */
  #demandReady(): void {
    if (! this.#isReady) { throw new Errors.VaultError('disabled', Phrases.MinderNotStarted) }
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

// == [Helpers]: isVoidSentinel, gotAnswerOf, betterRecordOf, cmpRecords

/** True when `record` is the void sentinel: its revseq is the shell's -1. */
function isVoidSentinel(record: DeliverableThing): record is VoidSentinel {
  return record.revseq === SX.VoidRevisionSeq
}

/** A get's answer for `record`, the cached record at `ask`'s scope: act `vacant` for none, `untimely` unless `isTimely`, `gotvoid` for the shell. */
function gotAnswerOf(ask: GetThingAsk, record: DeliverableThing | undefined, isTimely: boolean): GotAnswer {
  if (record === undefined) { return { ok: true, ask, act: 'vacant', world: null, val: undefined } }
  if (! isTimely) { return { ok: true, ask, act: 'untimely', world: null, val: undefined } }
  if (isVoidSentinel(record)) { return { ok: true, ask, act: 'gotvoid', world: null, val: null } }
  return { ok: true, ask, act: (record.am === 'a') ? 'gotlive' : 'gotgone', world: null, val: record }
}

// Kept pure: TanStack also calls it on observers' results, and marks the entry fresh whichever record it keeps.
/** The later of `prior` and `record`, by lifepath, then revseq. For the same revision, `record` wins only if it is whole and `prior` is not. */
function betterRecordOf(prior: unknown, record: unknown, isWholeRecord: (held: DeliverableThing) => boolean): unknown {
  if (prior === undefined) { return record }
  const [ante, post] = [prior as DeliverableThing, record as DeliverableThing]
  const cmp = cmpRecords(ante, post) || ((isWholeRecord(post) && ! isWholeRecord(ante)) ? 1 : 0)
  return (cmp > 0) ? TSQ.replaceEqualDeep(prior, record) : prior
}

// The lifepath decides first: a Thing born under a new life of its parent starts again at revseq 0. Lifeseqs are
// fixed-width base-32 digits, 0-9 then a-v, so lifepaths compare as strings; the shell's '-' sorts below them all.
/** Positive when `post` is later than `ante` (a later life, or a later revision of the same life), negative when earlier, zero for the same revision. */
function cmpRecords(ante: Pick<Thing | VoidSentinel, 'lifepath' | 'revseq'>, post: Pick<Thing | VoidSentinel, 'lifepath' | 'revseq'>): number {
  if (ante.lifepath !== post.lifepath) { return (post.lifepath > ante.lifepath) ? 1 : -1 }
  return post.revseq - ante.revseq
}
// --
