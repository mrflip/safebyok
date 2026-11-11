/** The base of a box listing and a vault listing: the live instances of one kind of thing, the watch on storage, and every storage call made for that kind of thing. */

import { isEqual } from 'es-toolkit'
import { UNANSWERED } from '../helpers/consts'
import { checkedConsistent } from '../helpers/validator'
import { oneAtATime } from '../helpers/one-at-a-time'
import { VaultError, isVaultError } from '../refusals/errors'
import { type GoodAnswer, type Notice as VaultDBNotice, type VaultDB, answerWithVal, refusedAnswerOf } from '../storage/vault-db'
import type { IfAbsent } from '../shapes/shapes-enums'
import * as SX from '../shapes/shapes-storage'
import type { BoxRow, PutOpts, VaultRow } from '../shapes/shapes-storage'
import * as VX from '../shapes/shapes-vaultish'
import type { BankFriend, DelTombstone, Fetched, FetchOpts, ListingAnswer, ListingDelOpts, ListingListAnswer, ListingPutAnswer, ListingPutOpts, ListingOpts, ListingWorld, ListingGetAnswer, SlotFate, SparseBase, Thing, ThingAnswer } from '../shapes/shapes-vaultish'
import { instanceDisabled, rowOfOtherVaultTok, storageIssue } from '../refusals/throwers'
import * as Phrases from '../helpers/phrases'
import { demandGood, outcomeOf } from '../refusals/outcome'
import { reportToPlatform } from '../refusals/report-error'
import type { Storable } from './storable'

/** SLOPDOC: The live instances of one kind of thing, by scope, each made once and enlisted, as its tombstone once gone. */
export abstract class Listing<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>, SnapshotT, ThingT extends Storable<ScopeT, RecordT, SparseT, SnapshotT>, DamagedT extends ScopeT & SX.DamagedRow = ScopeT & SX.DamagedRow> {
  // == [Props]: world, maxMillisSinceRefresh, vaultDB, bankFriend, #things, #fetchOfSlot, #listOnce, #listeners, #snapshot, #unwatch, #isEnabled, #getSnapshot, #subscribe

  readonly world: ListingWorld
  /** The refresh horizon of each thing made here. */
  readonly maxMillisSinceRefresh: number
  protected readonly vaultDB: VaultDB
  /** The bank's private calls, as this listing was handed them. */
  protected readonly bankFriend: BankFriend

  readonly #things    = new Map<string, ThingT>()
  // Keyed by scopepath, not by instance: a slot may have no instance to key on.
  /** The fetch of each slot, joined while one runs. */
  readonly #fetchOfSlot = new Map<string, () => Promise<Joined<ListingAnswer<RecordT, SparseT>, ThingT | null>>>()
  /** The listing of every row, joined while one runs. */
  readonly #listOnce = oneAtATime(() => this.#listRows())
  /** The rows the vaultDB's last listing set aside as damaged. */
  #damagedRows: readonly DamagedT[] = Object.freeze([])
  readonly #listeners = new Set<() => void>()
  #snapshot: readonly SnapshotT[] = Object.freeze([])
  #unwatch:  (() => void) | null = null
  /** Set by a sweep or a vacate, and never cleared. */
  #isEnabled = true

  readonly #getSnapshot = (): readonly SnapshotT[] => this.#snapshot

  readonly #subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(VX.listener.parse(listener))
    return () => { this.#listeners.delete(listener) }
  }
  // --

  // == [Getters]: things, damaged_rows, snapshot, getSnapshot, subscribe

  /** Every instance listed, whether present or deleted. */
  get things(): readonly ThingT[] { return [...this.#things.values()] }

  /** The rows found damaged at the last listing, each named by where it is stored. */
  get damaged_rows(): readonly DamagedT[] { return this.#damagedRows }

  /** The snapshot of every present instance, as the instance itself gives it: frozen, the same array until one of them changes. */
  get snapshot(): readonly SnapshotT[] { return this.#snapshot }

  /** The unbound snapshot getter, for `useSyncExternalStore`. */
  get getSnapshot(): () => readonly SnapshotT[] { return this.#getSnapshot }

  /** The unbound subscribe callback, for `useSyncExternalStore`. */
  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }
  // --

  // == [Construction]: constructor, build

  constructor(world: ListingWorld, opts: ListingOpts) {
    VX.listingWorld.parse(world)
    const { vaultDB, maxMillisSinceRefresh, bankFriend } = VX.listingOpts.parse(opts)
    this.world = world
    this.vaultDB = vaultDB
    this.bankFriend = bankFriend
    this.maxMillisSinceRefresh = maxMillisSinceRefresh
  }

  /** The instance of `record`, built or brought up to it, and enlisted. Writes nothing. */
  async build(record: Fetched<RecordT, SparseT>): Promise<ThingT> { // eslint-disable-line @typescript-eslint/require-await -- async so that a refusal rejects
    return this.buildOrReceive(record)
  }

  /** {@link build}, synchronously, for a row that came with another listing's answer. Throws if `build` would reject. */
  receiveRow(record: Fetched<RecordT, SparseT>): ThingT { return this.buildOrReceive(record) }
  // --

  // == [Its world]: isLocked, ensureTimelyWorld

  /** True while this listing's world is locked. */
  get isLocked(): boolean { return this.world.isLocked }

  /** The world refreshed within `maxMillis`, by default its own horizon. */
  async ensureTimelyWorld(maxMillis?: number): Promise<void> { await this.world.ensureTimely(VX.maxMillis.parse(maxMillis)) }
  // --

  // == [The listed things]: at, delist, enlist

  /** The instance listed under the scope of `duck`, or null. */
  at(duck: unknown): ThingT | null {
    return this.#things.get(this.scopepathOf(this.scopeOf(duck))) ?? null
  }

  /** Delist `thing`, as its own discard asks: the slot empties only for this very instance. */
  delist(thing: Thing<ScopeT, RecordT, SparseT>): void {
    const scopepath = this.scopepathOf(this.scopeOf(thing))
    const listed: Thing<ScopeT, RecordT, SparseT> | undefined = this.#things.get(scopepath)
    if (listed !== thing) { return }
    this.#things.delete(scopepath)
    this.#remakeSnapshot()
  }

  /** Enlist `thing`, born here, under its scope, and make the listing's snapshot again on each change of the thing's. */
  #enlist(thing: ThingT): void {
    this.#things.set(this.scopepathOf(thing.scope), thing)
    thing.becomeNotifiable()
    thing.subscribeOwn(() => { this.#remakeSnapshot() })
  }
  // --

  // == [Starting and ending]: hello, goodbye, lock, sweep, vacate, disable

  /** Start the watch. */
  async hello(): Promise<void> { // eslint-disable-line @typescript-eslint/require-await -- async so that a refusal rejects
    this.demandEnabled()
    this.#unwatch ??= this.watchRows(this.#onNotice, (news) => { this.bankFriend.tellBadNews([news]) })
  }

  /** End the watch. The instances stay as they are. */
  goodbye(): void {
    this.#unwatch?.()
    this.#unwatch = null
  }

  /** Lock each thing listed. */
  lock(): this {
    for (const thing of this.things) { thing.lock() }
    return this
  }

  /** End the watch, sweep each thing, and accept no further calls. A repeat is a no-op. Never throws. */
  sweep(): this { return this.#disable((thing) => { thing.sweep() }) }

  /** End the watch, vacate each thing, and accept no further calls. A repeat is a no-op. Never throws. */
  vacate(): this { return this.#disable((thing) => { thing.vacate() }) }

  #disable(discard: (thing: ThingT) => void): this {
    if (! this.#isEnabled) { return this }
    this.#isEnabled = false
    this.goodbye()
    for (const thing of this.things) { discard(thing) }
    return this
  }
  // --

  // == [Storage verbs]: list, tryList, listRows, takeListed, listedAt, get, tryGet, fetch, tryFetch, fetchJoined, fetchSlot, handleIfAbsent, put, tryPut, del, tryDel

  /** Enlists every row the vaultDB lists here, sets aside the rows it found damaged, and answers the instances listed. */
  async list(): Promise<readonly ThingT[]> { return demandGood(await this.tryList()).val }

  /** {@link list}, answering the vaultDB's own answer with the instances listed as its `val`. */
  async tryList(): Promise<ThingAnswer<readonly ThingT[]>> {
    try {
      this.demandEnabled()
      const listing = await this.#listOnce()
      return ('err' in listing) ? refusedAnswerOf(listing.err, listing.answer) : answerWithVal(listing.answer, listing.val)
    } catch (err) { return refusedAnswerOf(err, UNANSWERED) }
  }

  /** One storage listing, delivered, never rejecting: what every list made while it runs shares. */
  async #listRows(): Promise<Joined<ListingListAnswer<RecordT, SparseT, DamagedT>, readonly ThingT[]>> {
    const answer = await this.doTryList()
    try {
      return { answer, val: await this.#takeListed(answer) }
    } catch (err) { return { answer, err } }
  }

  // A row set aside as damaged takes down the instance listed in its slot, as a tombstone would, and is told as bad news.
  /** The instances `answer` lists, built or brought up to their rows, its damaged rows set aside. */
  async #takeListed(answer: ListingListAnswer<RecordT, SparseT, DamagedT>): Promise<readonly ThingT[]> {
    this.demandEnabled()
    if (answer.world !== null) { this.world.receiveWorld(answer.world) }
    if (! answer.ok) {
      this.panicIfRevoked(answer.err)
      throw answer.err
    }
    const { listed, damaged_rows } = answer.val
    const isDamageNews = ! isEqual(this.#damagedRows, damaged_rows)
    this.#damagedRows = Object.freeze(damaged_rows)
    for (const damaged of damaged_rows) { this.#listedAt(damaged)?.vacate() }
    this.bankFriend.tellBadNews(damaged_rows.map((damaged) => this.damagedStoredError(damaged)))
    if (isDamageNews) { this.tellListeners() }
    return Promise.all(listed.map((row) => this.build(row)))
  }

  // A damaged row's address is storage's, under whatever labels it holds, so it is looked up as it is, never checked as a scope.
  /** The instance listed at a damaged row's address, or null. */
  #listedAt(damaged: DamagedT): ThingT | null { return this.#things.get(this.scopepathOf(damaged)) ?? null }

  /** The instance under `scoped`: the one listed, no older than `opts` allows, or fetched where none is; null under `ifAbsent: 'nil'`. */
  async get(scoped: ScopeT, opts: FetchOpts = {}): Promise<ThingT | null> { return demandGood(await this.tryGet(scoped, opts)).val }

  /** {@link get}, answering the vaultDB's own answer where storage was asked, or the act `timely` where the instance listed served it. */
  async tryGet(scoped: ScopeT, opts: FetchOpts = {}): Promise<ListingGetAnswer<ThingT | null>> {
    try {
      const { ifAbsent, maxMillisSinceRefresh = this.maxMillisSinceRefresh, maxWorldMillis } = VX.fetchOpts.parse(opts)
      const scope = this.scopeOf(scoped)
      await this.ensureTimelyWorld(maxWorldMillis)
      const listed = this.at(scope)
      if (listed?.isHydratedWithin(maxMillisSinceRefresh) !== true) { return await this.tryFetch(scope, opts) }
      return { ok: true, act: 'timely', val: this.handleIfAbsent(listed, scope, ifAbsent), world: null, req_params: SX.reqParams.parse(scope) }
    } catch (err) { return refusedAnswerOf(err, UNANSWERED) }
  }

  /** SLOPDOC: The instance under `scope` as it is now stored, built where none was listed. */
  async fetch(scope: ScopeT, opts: FetchOpts = {}): Promise<ThingT | null> { return demandGood(await this.tryFetch(scope, opts)).val }

  /** {@link fetch}, answering the vaultDB's own answer with the instance as its `val`. */
  async tryFetch(scope: ScopeT, opts: FetchOpts = {}): Promise<ThingAnswer<ThingT | null>> {
    try {
      const { ifAbsent, maxWorldMillis } = VX.fetchOpts.parse(opts)
      const scoped = this.scopeOf(scope)
      await this.ensureTimelyWorld(maxWorldMillis)
      this.demandEnabled()
      const fetching = await this.#fetchJoined(scoped)
      if ('err' in fetching) { return refusedAnswerOf(fetching.err, fetching.answer) }
      return answerWithVal(fetching.answer, this.handleIfAbsent(fetching.val, scoped, ifAbsent))
    } catch (err) { return refusedAnswerOf(err, UNANSWERED) }
  }

  /** The storage get of the slot `scoped` names, delivered: one at a time, joined by every fetch of that slot made while it runs. */
  #fetchJoined(scoped: ScopeT): Promise<Joined<ListingAnswer<RecordT, SparseT>, ThingT | null>> {
    const scopepath = this.scopepathOf(scoped)
    let fetchOnce = this.#fetchOfSlot.get(scopepath)
    if (fetchOnce === undefined) {
      fetchOnce = oneAtATime(() => this.#fetchSlot(scoped))
      this.#fetchOfSlot.set(scopepath, fetchOnce)
    }
    return fetchOnce()
  }

  /** One storage get of `scoped`'s slot, delivered, never rejecting. */
  async #fetchSlot(scoped: ScopeT): Promise<Joined<ListingAnswer<RecordT, SparseT>, ThingT | null>> {
    const answer = await this.doTryGet(scoped)
    try {
      return { answer, val: await this.deliver(answer, scoped) }
    } catch (err) { return { answer, err } }
  }

  /** `found` when present. Anything else is refused under `ifAbsent: 'fail'`, and null under `ifAbsent: 'nil'`. */
  protected handleIfAbsent(found: ThingT | null, scoped: ScopeT, ifAbsent: IfAbsent): ThingT | null {
    if (ifAbsent === 'fail') {
      if (found === null) { throw this.nothingStoredError(scoped) }
      found.demandPresent()
    }
    return (found?.isPresent === true) ? found : null
  }

  /** Put `record` over the row `opts.expected`, and return the listed instance. */
  async put(record: RecordT, opts: PutOpts): Promise<ThingT> { return demandGood(await this.tryPut(record, opts)).val }

  /** {@link put}, answering the vaultDB's own answer with the instance listed as its `val`. */
  async tryPut(record: RecordT, opts: PutOpts): Promise<ThingAnswer<ThingT>> {
    let answer: ListingPutAnswer<RecordT, SparseT> | typeof UNANSWERED = UNANSWERED
    try {
      const { expected, ifAbsent, ifPresent } = SX.putOpts.parse(opts)
      const checked = this.recordOf(record)
      this.demandEnabled()
      answer = putAnswerOf(await this.doTryPut(checked, { expected: this.sparseOf(expected), ifAbsent, ifPresent }))
      return answerWithVal(answer, await this.deliver(answer, checked))
    } catch (err) { return refusedAnswerOf(err, answer) }
  }

  /** SLOPDOC: Deletes the thing `record` names, over its revision, and delivers storage's answer: its tombstone, if anything was stored. */
  async del(record: SparseT): Promise<ThingT | null> { return demandGood(await this.tryDel(record)).val }

  /** {@link del}, answering the vaultDB's own answer with the instance as its `val`. */
  async tryDel(record: SparseT): Promise<ThingAnswer<ThingT | null>> {
    let answer: ListingAnswer<RecordT, SparseT> | typeof UNANSWERED = UNANSWERED
    try {
      const expected = this.sparseOf(record)
      this.demandEnabled()
      const tombstone = this.tombstoneOver(expected)
      answer = await this.doTryDel(tombstone, { expected })
      return answerWithVal(answer, await this.deliver(answer, tombstone))
    } catch (err) { return refusedAnswerOf(err, answer) }
  }

  // --

  // == [Delivering an answer]: deliver, deliverGood, receiveNothing, buildOrReceive, makeThingOf

  /** SLOPDOC: The pipeline every storage answer follows, from its world through the instance listed to the caller. */
  protected deliver(answer: ListingPutAnswer<RecordT, SparseT>, sent: ScopeT | Fetched<RecordT, SparseT>): Promise<ThingT>
  protected deliver(answer: ListingAnswer<RecordT, SparseT>, sent: ScopeT | Fetched<RecordT, SparseT>): Promise<ThingT | null>
  protected async deliver(answer: ListingAnswer<RecordT, SparseT>, sent: ScopeT | Fetched<RecordT, SparseT>): Promise<ThingT | null> {
    this.demandEnabled()
    if (answer.world !== null) { this.world.receiveWorld(answer.world) }
    if (answer.ok) { return this.#deliverGood(answer, sent) }
    const stored = (answer.dbhas ?? null) as VaultRow | BoxRow | null
    if ((stored !== null) && this.isOwnRow(stored)) {
      const delivered = await outcomeOf(() => {
        this.#demandRecordOfScope(stored, this.scopeOf(sent))
        return this.buildOrReceive(stored)
      })
      if (! delivered.ok) { this.bankFriend.tellBadNews([delivered.err]) }
    }
    this.panicIfRevoked(answer.err)
    throw answer.err
  }

  /** The instance a good answer to `sent` leaves listed, or null where none is. */
  #deliverGood(answer: GoodAnswer<Fetched<RecordT, SparseT> | null, string, unknown>, sent: ScopeT | Fetched<RecordT, SparseT>): ThingT | null {
    const record = answer.val
    // An `act: 'passed'` put returns the stored row. Its revision does not match the one sent, so only its scope is checked.
    const pins = (answer.act === 'passed') ? this.scopeOf(sent) : SX.reqParamsOf(sent)
    if (record !== null) { checkedConsistent(record, pins, { kind: 'storage_issue', message: Phrases.AnswerNotAsSent }) }
    return (record === null) ? this.#receiveNothing(this.scopeOf(sent)) : this.buildOrReceive(record)
  }

  /** The instance listed under `scope`, told that nothing is stored there. */
  #receiveNothing(scope: ScopeT): ThingT | null {
    this.demandEnabled()
    const listed = this.at(scope)
    if (listed === null) { return null }
    this.bankFriend.tellBadNews(listed.receive(null).badnews)
    this.#remakeSnapshot()
    return listed
  }

  // The one place an instance is made and enlisted: `#makeThingOf` is called from here alone, and only where no instance is listed.
  /** The instance under the scope of `record`: built, brought up to it or replaced, by the record's fate. */
  protected buildOrReceive(record: Fetched<RecordT, SparseT>): ThingT {
    this.demandEnabled()
    const sparse = this.sparseOf(record)
    const vault_tok = this.vaultTokOfWorld()
    if ((vault_tok !== null) && (sparse.vault_tok !== vault_tok)) { throw rowOfOtherVaultTok() }
    const listed = this.at(this.scopeOf(sparse))
    const fate = (listed === null) ? 'replace' : this.fateOver(listed, record)
    if ((listed !== null) && (fate === 'lose')) { return listed }
    const thing = ((fate === 'replace') ? null : listed) ?? this.#makeThingOf(sparse)
    this.bankFriend.tellBadNews(thing.receive(record).badnews)
    if (thing !== listed) {
      this.#enlist(thing)
      listed?.vacate()
    }
    this.#remakeSnapshot()
    return thing
  }

  /** SLOPDOC: A new instance born of `sparse`, void, for `receive` to adopt its record like any newer one. */
  #makeThingOf(sparse: SparseT): ThingT { return this.makeThing({ ...sparse, ...SX.VoidRevision, am: 'x' }) }
  // --

  // == [The watch]: onNotice

  /** SLOPDOC: Delivers a watch notice of this listing's kind like a good answer, making any refusal bad news. */
  readonly #onNotice = (notice: VaultDBNotice): void => {
    const { val, world } = notice
    if ((! this.#isEnabled) || (! this.isOwnRow(val))) { return }
    void (async () => {
      const { ok, err } = await outcomeOf(() => {
        if (world !== null) { this.world.receiveWorld(world) }
        return this.#isEnabled ? this.buildOrReceive(val) : null
      })
      if (! ok) { this.bankFriend.tellBadNews([err]) }
    })()
  }
  // --

  // == [Snapshot]: remakeSnapshot, tellListeners

  /** Make the listing's snapshot again, of the present instances' own; when one differs, replace it and call every listener. */
  #remakeSnapshot(): void {
    const next = this.things.filter((thing) => thing.isPresent).map((thing) => thing.getSnapshot())
    const isSame = next.length === this.#snapshot.length && next.every((snapshot, idx) => snapshot === this.#snapshot[idx])
    if (isSame) { return }
    this.#snapshot = Object.freeze(next)
    this.tellListeners()
  }

  /** Tell every listener, for a subclass whose change a snapshot's fields cannot show. */
  protected tellListeners(): void {
    for (const listener of this.#listeners) {
      try {
        listener()
      } catch (err) {
        reportToPlatform(err)
      }
    }
  }
  // --

  // == [Panic]: panicIfRevoked

  /** A refusal of the vaultDB's on its way to a caller: 'identity_revoked' vacates the bank before the caller hears the refusal. */
  protected panicIfRevoked(refusal: VaultError): void {
    if (isVaultError(refusal, 'identity_revoked')) { this.bankFriend.panic(refusal) }
  }
  // --

  // == [Guards]: demandEnabled, demandRecordOfScope

  /** Demands that this listing be enabled: not past a sweep or a vacate. */
  demandEnabled(): this {
    if (! this.#isEnabled) { throw instanceDisabled() }
    return this
  }

  /** Demands a `record` whose scope is `scope`, the one the answer that carries it names. */
  #demandRecordOfScope(record: Fetched<RecordT, SparseT>, scope: ScopeT): void {
    checkedConsistent(this.scopeOf(record), scope, { kind: 'storage_issue', message: Phrases.RecordOfOtherScope })
  }
  // --

  // == [Defined by the concrete listing]: fateOver, vaultTokOfWorld, scopepathOf, scopeOf, sparseOf, recordOf, makeThing, nothingStoredError, doTryList, damagedStoredError, doTryGet, doTryPut, tombstoneOver, doTryDel, watchRows, isOwnRow

  /** The fate of `record` meeting `listed`, the thing in its slot: by default its `receive` judges it. */
  protected fateOver(_held: ThingT, _record: Fetched<RecordT, SparseT>): SlotFate { return 'receive' }

  /** The `vault_tok` every record of this listing lies under, being the vault's own; null for a listing whose records make their own, as a vault's do. */
  protected abstract vaultTokOfWorld(): string | null
  protected abstract scopepathOf(scope: ScopeT): string
  /** The scope of `duck`, a record in any form or a thing ducking as one. */
  abstract scopeOf(duck: unknown): ScopeT
  /** The sparse form of `duck`, a record in any form or a thing ducking as one, as a plain copy with the payload left out. */
  abstract sparseOf(duck: unknown): SparseT
  /** The full record `duck` is, as a plain copy. */
  abstract recordOf(duck: unknown): RecordT
  protected abstract makeThing(central: Fetched<RecordT, SparseT>): ThingT
  /** The refusal for a scope where no row is stored and no instance is listed. */
  protected abstract nothingStoredError(scope: ScopeT): VaultError
  /** The vaultDB's get of this kind of thing, expecting the listed instance's row. Its answer's `val` is null when nothing is stored. */
  protected abstract doTryGet(scope: ScopeT): Promise<ListingAnswer<RecordT, SparseT>>
  /** The vaultDB's put of this kind of thing. */
  protected abstract doTryPut(record: RecordT, opts: ListingPutOpts<SparseT>): Promise<ListingAnswer<RecordT, SparseT>>
  /** The vaultDB's listing of every row of this kind, live, gone and damaged. */
  protected abstract doTryList(): Promise<ListingListAnswer<RecordT, SparseT, DamagedT>>
  /** The bad news a row the listing set aside as damaged is told as. */
  protected abstract damagedStoredError(damaged: DamagedT): VaultError
  /** The tombstone a del stores over `expected`: at the next revision, with a new life token of its own. */
  protected abstract tombstoneOver(expected: SparseT): DelTombstone<SparseT>
  /** The vaultDB's del of this kind of thing. */
  protected abstract doTryDel(tombstone: DelTombstone<SparseT>, opts: ListingDelOpts<SparseT>): Promise<ListingAnswer<RecordT, SparseT>>
  /** Start the vaultDB's watch over this listing's scope, `onBadNews` hearing of trouble with it; returns how to stop. */
  protected abstract watchRows(onNotice: (notice: VaultDBNotice) => void, onBadNews: (news: VaultError) => void): () => void
  /** True for a row this listing has: the vaultDB's watch tells of a vault's rows and its boxes' alike. */
  protected abstract isOwnRow(row: VaultRow | BoxRow): row is (VaultRow | BoxRow) & Fetched<RecordT, SparseT>
  // --
}

// == [Helpers]: Joined, putAnswerOf

/** A joined storage call's answer, with what delivering it made, or the refusal delivering met. */
type Joined<AnswerT, ValT> = { answer: AnswerT, val: ValT } | { answer: AnswerT, err: unknown }

/** `answer` as a put's answer, whose good form carries the stored record or the live row found. Throws `storage_issue` for a good answer with no row. */
function putAnswerOf<RecordT, SparseT>(answer: ListingAnswer<RecordT, SparseT>): ListingPutAnswer<RecordT, SparseT> {
  if (! answer.ok) { return answer }
  const { val } = answer
  if (val === null) { throw storageIssue() }
  return { ...answer, val }
}
// --
