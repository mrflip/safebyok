/** The base of a box listing and a vault listing: the live instances of one kind of thing, the watch on storage, and every storage call made for that kind of thing. */

import { isEqual } from 'es-toolkit'
import { UNANSWERED } from '../helpers/consts'
import { isConsistent } from '../helpers/validator'
import { oneAtATime } from '../helpers/one-at-a-time'
import { VaultError, isVaultError } from '../refusals/errors'
import { type Notice as VaultDBNotice, type VaultDB, answerWithVal, refusedAnswerOf } from '../storage/vault-db'
import type { BadAct, DeliveryFielding, GoodAct, IfAbsent } from '../shapes/shapes-enums'
import * as SX from '../shapes/shapes-storage'
import type { BoxRow, PutOpts, VaultRow } from '../shapes/shapes-storage'
import * as VX from '../shapes/shapes-vaultish'
import type { BankFriend, DelTombstone, Fetched, FetchOpts, ListingAnswer, ListingDelOpts, ListingListAnswer, ListingPutAnswer, ListingPutOpts, ListingOpts, ListingWorld, ListingGetAnswer, SparseBase, Thing, ThingAnswer } from '../shapes/shapes-vaultish'
import { deliveredNotAsSent, instanceDisabled, nothingStoredWhereLive, oneRevisionTwoFates, oneRevisionTwoLives, refusalOfDelivering, rowOfOtherVaultTok, storageIssue } from '../refusals/throwers'
import { valOf } from '../refusals/outcome'
import { reportToPlatform } from '../refusals/report-error'
import { type Storable, cmpRevisions } from './storable'

/** Administers a list of instances while coordinating updates to its world (the vault) and coordinating its listed instances.
 * It acts as the hub for vaultDB requests because it owns instantiating,
 * listing, disabling, remaking, and delisting its storable instances.
 */
export abstract class Listing<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>, SnapshotT, ThingT extends Storable<ScopeT, RecordT, SparseT, SnapshotT>, DamagedT extends ScopeT & SX.DamagedRow = ScopeT & SX.DamagedRow> {
  // == [Props]: world, maxMillisSinceRefresh, vaultDB, bankFriend, #things, #joinedGetOf, #listOnce, #listeners, #snapshot, #unwatch, #isEnabled, #getSnapshot, #subscribe

  readonly world: ListingWorld
  /** The refresh horizon of each thing made here. */
  readonly maxMillisSinceRefresh: number
  protected readonly vaultDB: VaultDB
  /** The bank's private calls, as this listing was handed them. */
  protected readonly bankFriend: BankFriend

  readonly #things    = new Map<string, ThingT>()
  // Keyed by scopepath, not by instance: a scope may have no instance listed to key on.
  /** The storage get of each scope, joined while one runs. */
  readonly #joinedGetOf = new Map<string, () => Promise<Joined<ListingAnswer<RecordT, SparseT>, ThingT | null>>>()
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

  // == [Construction]: constructor

  constructor(world: ListingWorld, opts: ListingOpts) {
    VX.listingWorld.parse(world)
    const { vaultDB, maxMillisSinceRefresh, bankFriend } = VX.listingOpts.parse(opts)
    this.world = world
    this.vaultDB = vaultDB
    this.bankFriend = bankFriend
    this.maxMillisSinceRefresh = maxMillisSinceRefresh
  }
  // --

  // == [Its world]: isLocked, ensureTimelyWorld

  /** True while this listing's world is locked. */
  get isLocked(): boolean { return this.world.isLocked }

  /** The world refreshed within `maxMillis`, by default its own horizon. */
  async ensureTimelyWorld(maxMillis?: number): Promise<void> { await this.world.ensureTimely(VX.maxMillis.parse(maxMillis)) }
  // --

  // == [The listed things]: at, delist, enlist

  /** The instance listed under the scope of `recordish`, or null. */
  at(recordish: unknown): ThingT | null {
    return this.#things.get(this.scopepathOf(this.scopeOf(recordish))) ?? null
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

  // == [Storage verbs]: list, tryList, listRows, listedAt, get, tryGet, doTryGetJoined, handleIfAbsent, put, tryPut, del, tryDel

  /** Enlists every row the vaultDB lists here, sets aside the rows it found damaged, and answers the instances listed.
   * Chute: bank and vault bring-up → **list** → tryList → (joined) #listRows → deliverListing
   */
  async list(): Promise<readonly ThingT[]> { return valOf(await this.tryList()) }

  /** {@link list}, answering the vaultDB's own answer with the instances listed as its `val`.
   * Chute: list → **tryList** → (joined) #listRows → deliverListing
   */
  async tryList(): Promise<ThingAnswer<readonly ThingT[]>> {
    try {
      this.demandEnabled()
      const listing = await this.#listOnce()
      return ('err' in listing) ? refusedAnswerOf(listing.err, listing.answer) : answerWithVal(listing.answer, listing.val)
    } catch (err) { return refusedAnswerOf(err, UNANSWERED) }
  }

  /** One storage listing, delivered, never rejecting: what every list made while it runs shares.
   * Chute: tryList → (joined) **#listRows** → doTryList, then deliverListing
   */
  async #listRows(): Promise<Joined<ListingListAnswer<RecordT, SparseT, DamagedT>, readonly ThingT[]>> {
    const answer = await this.doTryList()
    try {
      return { answer, val: this.#deliverListing(answer) }
    } catch (err) { return { answer, err } }
  }

  // A damaged row's address is storage's, under whatever labels it holds, so it is looked up as it is, never checked as a scope.
  /** The instance listed at a damaged row's address, or null. */
  #listedAt(damaged: DamagedT): ThingT | null { return this.#things.get(this.scopepathOf(damaged)) ?? null }

  /** The instance under `scoped`: the one listed, no older than `opts` allows, or fetched where none is; null under `ifAbsent: 'nil'`.
   * Chute: thing.hydrate | vault.getBox → **listing.get** → tryGet → (joined by scope) #doTryGetJoined → doTryGet, then deliverAnswer
   */
  async get(scoped: ScopeT, opts: FetchOpts = {}): Promise<ThingT | null> { return valOf(await this.tryGet(scoped, opts)) }

  /** {@link get}, answering the vaultDB's own answer where storage was asked, or the act `timely` where the instance listed served it.
   * Chute: listing.get | bank.tryProbe → **tryGet** → (joined by scope) #doTryGetJoined → doTryGet, then deliverAnswer
   */
  async tryGet(scoped: ScopeT, opts: FetchOpts = {}): Promise<ListingGetAnswer<ThingT | null>> {
    try {
      const { ifAbsent, maxMillisSinceRefresh = this.maxMillisSinceRefresh, maxWorldMillis } = VX.fetchOpts.parse(opts)
      const scope = this.scopeOf(scoped)
      await this.ensureTimelyWorld(maxWorldMillis)
      this.demandEnabled()
      const listed = this.at(scope)
      if (listed?.isHydratedWithin(maxMillisSinceRefresh) === true) {
        return { ok: true, act: 'timely', val: this.handleIfAbsent(listed, scope, ifAbsent), world: null, ask: SX.loggableAsk.parse({ op: 'get', ...scope }) }
      }
      const got = await this.#doTryGetJoined(scope)
      if ('err' in got) { return refusedAnswerOf(got.err, got.answer) }
      return answerWithVal(got.answer, this.handleIfAbsent(got.val, scope, ifAbsent))
    } catch (err) { return refusedAnswerOf(err, UNANSWERED) }
  }

  // A get joins any get of the same scope under way: the storage get and its delivery are shared, each caller's
  // `ifAbsent` its own.
  /** The storage get of `scope`, delivered, never rejecting: one at a time, joined by every get of that scope made while it runs.
   * Chute: tryGet → (joined by scope) **#doTryGetJoined** → doTryGet, then deliverAnswer
   */
  #doTryGetJoined(scope: ScopeT): Promise<Joined<ListingAnswer<RecordT, SparseT>, ThingT | null>> {
    const scopepath = this.scopepathOf(scope)
    let getOnce = this.#joinedGetOf.get(scopepath)
    if (getOnce === undefined) {
      getOnce = oneAtATime(async () => {
        const answer = await this.doTryGet(scope)
        try {
          return { answer, val: this.deliverAnswer(answer, scope) }
        } catch (err) { return { answer, err } }
      })
      this.#joinedGetOf.set(scopepath, getOnce)
    }
    return getOnce()
  }

  /** `found` when present. Anything else is refused under `ifAbsent: 'fail'`, and null under `ifAbsent: 'nil'`. */
  protected handleIfAbsent(found: ThingT | null, scoped: ScopeT, ifAbsent: IfAbsent): ThingT | null {
    if (ifAbsent === 'fail') {
      if (found === null) { throw this.nothingStoredError(scoped) }
      found.demandPresent()
    }
    return (found?.isPresent === true) ? found : null
  }

  /** Put `record` over the row `opts.expected`, and return the listed instance.
   * Chute: a vault birth (gating) → **listing.put** → tryPut → doTryPut, then deliverAnswer
   */
  async put(record: RecordT, opts: PutOpts): Promise<ThingT> { return valOf(await this.tryPut(record, opts)) }

  /** {@link put}, answering the vaultDB's own answer with the instance listed as its `val`.
   * Chute: listing.put | box.put → **tryPut** → doTryPut, then deliverAnswer
   */
  async tryPut(record: RecordT, opts: PutOpts): Promise<ThingAnswer<ThingT>> {
    let answer: ListingPutAnswer<RecordT, SparseT> | typeof UNANSWERED = UNANSWERED
    try {
      const { expected, ifAbsent, ifPresent } = SX.putOpts.parse(opts)
      const checked = this.recordOf(record)
      this.demandEnabled()
      answer = putAnswerOf(await this.doTryPut(checked, { expected: this.sparseOf(expected), ifAbsent, ifPresent }))
      return answerWithVal(answer, this.deliverAnswer(answer, checked))
    } catch (err) { return refusedAnswerOf(err, answer) }
  }

  /** SLOPDOC: Deletes the thing `record` names, over its revision, and delivers storage's answer: its tombstone, if anything was stored.
   * Chute: thing.del → **listing.del** → tryDel → doTryDel, then deliverAnswer
   */
  async del(record: SparseT): Promise<ThingT | null> { return valOf(await this.tryDel(record)) }

  /** {@link del}, answering the vaultDB's own answer with the instance as its `val`.
   * Chute: listing.del → **tryDel** → doTryDel, then deliverAnswer
   */
  async tryDel(record: SparseT): Promise<ThingAnswer<ThingT | null>> {
    let answer: ListingAnswer<RecordT, SparseT> | typeof UNANSWERED = UNANSWERED
    try {
      const expected = this.sparseOf(record)
      this.demandEnabled()
      const tombstone = this.tombstoneOver(expected)
      answer = await this.doTryDel(tombstone, { expected })
      return answerWithVal(answer, this.deliverAnswer(answer, tombstone))
    } catch (err) { return refusedAnswerOf(err, answer) }
  }

  // --

  // == [Delivering]: deliverAnswer, answerDeliveringOf, deliverRecord, recordDeliveringOf, doDeliverRecord, deliverListing

  /** The pipeline every storage answer follows, from its world through the instance listed to the caller.
   * Delivers updated records to: (! = unconventional practice)
   * - the vault that owns it (!),
   *   - possibly replacing / deleting / vacating / disabling it (!) and by consequence itself (!),
   * - in service of either:
   *   - updating a record it has, or
   *   - deleting it (!) by updating it (!) but not removing it (!) (except for vault(!), which it does(!))
   *   - ~~or building a new instance from scratch with the props~~,
   *   - or making a shell (!) and updating it (!)
   * - and finally notifying listeners, sharing bad news, and returning the appropriate instance
   * Chute: #doTryGetJoined | tryPut | tryDel | tryReplacePassphrase | tryAddPasskey | tryRevokePasskey → **deliverAnswer** → world.receiveWorld, then answerDeliveringOf → recordDeliveringOf → doDeliverRecord
   */
  protected deliverAnswer(answer: ListingPutAnswer<RecordT, SparseT>, sent: ScopeT | Fetched<RecordT, SparseT>): ThingT
  protected deliverAnswer(answer: ListingAnswer<RecordT, SparseT>, sent: ScopeT | Fetched<RecordT, SparseT>): ThingT | null
  protected deliverAnswer(answer: ListingAnswer<RecordT, SparseT>, sent: ScopeT | Fetched<RecordT, SparseT>): ThingT | null {
    this.demandEnabled()
    // No awaits: a revoked identity panics before any other answer is delivered. The first refusal met is thrown, any
    // after it told as bad news: a refusal's own err comes first.
    try {
      if (answer.world !== null) { this.world.receiveWorld(answer.world) }
      const delivering = this.#answerDeliveringOf(answer, sent)
      const thing = (delivering === null) ? null : this.#doDeliverRecord(delivering)
      if (answer.ok) { return thing }
    } catch (err) {
      if (answer.ok) { throw err }
      this.bankFriend.tellBadNews([err])
    }
    this.panicIfRevoked(answer.err)
    throw answer.err
  }

  // The answer passed its verb's check, and is trusted: its act alone says where its record is (`deliveryFieldingOf`).
  /** What delivering `answer` to the instance listed at `sent`'s scope will do, decided before anything changes; null for nothing.
   * Throws `storage_issue` for a record of another scope or revision than `sent`, and `record_conflict` for news that
   * nothing is stored where a live instance is listed.
   * Chute: deliverAnswer → **answerDeliveringOf** → recordDeliveringOf
   */
  #answerDeliveringOf(answer: ListingAnswer<RecordT, SparseT>, sent: ScopeT | Fetched<RecordT, SparseT>): Delivering<Fetched<RecordT, SparseT>, ThingT> | null {
    try {
      const fielding = deliveryFieldingOf[answer.act]
      if (fielding === 'none') { return null }
      const scope    = this.scopeOf(sent)
      const listed   = this.at(scope)
      if (fielding === 'void') {
        if (listed === null)  { return null }
        if (listed.isPresent) { throw nothingStoredWhereLive() }
        return { making: 'listed', mod: 'same', listed, record: null }
      }
      const record = (answer.ok ? answer.val : answer.dbhas) as Fetched<RecordT, SparseT>
      const pins   = (fielding === 'as_sent') ? { ...scope, ...SX.revisionPins.parse(sent) } : scope
      if (! isConsistent(record, pins)) { throw deliveredNotAsSent(fielding, record, pins) }
      return this.#recordDeliveringOf(record)
    } catch (err) { throw refusalOfDelivering(err, answer) }
  }

  /** The instance of `record`, made, brought up to it, or remade, and listed. Writes nothing.
   * Chute: deliverListing | #onNotice | vault.receiveWorld | BoxListing.#shellFor → **deliverRecord** → recordDeliveringOf → doDeliverRecord
   */
  deliverRecord(record: Fetched<RecordT, SparseT>): ThingT {
    this.demandEnabled()
    return this.#doDeliverRecord(this.#recordDeliveringOf(record))
  }

  // The receive table of `notes/receive-contract.md`, read once: the first row that matches wins. A vault listing makes
  // an instance of each life (`isOneLifePerInstance`): a newer record of another life, or one alive over a tombstone,
  // remakes it, and an older one of any life leaves it as it is. A box listed has its world's vault_tok, so the first
  // row covers a box of another vault; a vault of another vault_tok is of another life.
  /** What receiving `record` will do: which instance receives it, and what becomes of that instance's record.
   * Throws `storage_issue` for a record of another vault_tok than the listing's, and `record_conflict` where storage
   * and the instance listed disagree on the history of one revision.
   * Chute: answerDeliveringOf | deliverRecord → **recordDeliveringOf**
   */
  #recordDeliveringOf(record: Fetched<RecordT, SparseT>): Delivering<Fetched<RecordT, SparseT>, ThingT> {
    const vault_tok = this.vaultTokOfWorld()
    if ((vault_tok !== null) && (record.vault_tok !== vault_tok)) { throw rowOfOtherVaultTok(record) }
    const listed     = this.at(this.scopeOf(record))
    if (listed === null) { return { making: 'make', mod: 'adopt', listed: null, record } }
    const age        = cmpRevisions(listed, record)
    const isSameLife = listed.isOfLife(record)
    const rcvdShape  = listed.shapeOf(record)
    const heldShape  = listed.shape
    const isRebirth  = (heldShape === 'gone') && (rcvdShape !== 'gone')
    const isPerLife  = this.isOneLifePerInstance
    if (isPerLife && (age === 'older'))                                  { return { making: 'listed', mod: 'older', listed, record } }
    if (isPerLife && (age === 'newer') && ((! isSameLife) || isRebirth)) { return { making: 'remake', mod: 'adopt', listed, record } }
    if ((age === 'same') && (! isSameLife))                              { throw oneRevisionTwoLives(record) }
    if (age === 'older')                                                 { return { making: 'listed', mod: 'older', listed, record } }
    if (age === 'newer')                                                 { return { making: 'listed', mod: 'adopt', listed, record } }
    if ((rcvdShape === 'gone') !== (heldShape === 'gone'))               { throw oneRevisionTwoFates(record) }
    if ((rcvdShape === 'full') && (heldShape === 'sparse'))              { return { making: 'listed', mod: 'adopt', listed, record } }
    return { making: 'listed', mod: 'same', listed, record }
  }

  // The one place an instance is made and enlisted. It is made at the void revision and handed its record as a listed one
  // is, so that receiving runs for it too: a vault made from a tombstone forgets the lease cached on this device. What
  // can throw (`makeThing`, `receiveRecord`) runs before the listing changes; an instance never enlisted holds nothing.
  /** Do what `delivering` says, and answer the instance it leaves listed.
   * Chute: deliverAnswer | deliverRecord → **doDeliverRecord**
   */
  #doDeliverRecord({ making, mod, listed, record }: Delivering<Fetched<RecordT, SparseT>, ThingT>): ThingT {
    this.demandEnabled()
    if (making === 'listed') {
      if (mod === 'adopt') { listed.receiveRecord(record) } else if (mod === 'same') { listed.markRefreshed() }
      this.#remakeSnapshot()
      return listed
    }
    const thing = this.makeThing({ ...this.sparseOf(record), ...SX.VoidRevision, am: 'x' })
    thing.receiveRecord(record)
    this.#enlist(thing)
    if (making === 'remake') { listed.vacate() }
    this.#remakeSnapshot()
    return thing
  }

  // A row set aside as damaged takes down the instance listed at its scope, as a tombstone would, and is told as bad news.
  /** The instances `answer` lists, made or brought up to their records, its damaged rows set aside.
   * Chute: #listRows → **deliverListing** → world.receiveWorld, then deliverRecord for each row
   */
  #deliverListing(answer: ListingListAnswer<RecordT, SparseT, DamagedT>): readonly ThingT[] {
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
    // Every row is delivered: the first refusal met is thrown, any after it told as bad news.
    const things: ThingT[] = []
    const refusals: unknown[] = []
    for (const row of listed) {
      try { things.push(this.deliverRecord(row)) } catch (err) { refusals.push(err) }
    }
    if (refusals.length > 0) {
      this.bankFriend.tellBadNews(refusals.slice(1))
      throw refusals[0]
    }
    return things
  }
  // --

  // == [The watch]: onNotice

  // A notice is not an answer: it has no ask and no sent, and its record is the claim, as a listed row's is.
  /** Delivers a watch notice of this listing's kind: its world, then its record, any refusal told as bad news.
   * Chute: the vaultDB's watch → **#onNotice** → world.receiveWorld, then deliverRecord
   */
  readonly #onNotice = (notice: VaultDBNotice): void => {
    const { val, world } = notice
    if ((! this.#isEnabled) || (! this.isOwnRow(val))) { return }
    try {
      if (world !== null) { this.world.receiveWorld(world) }
      this.deliverRecord(val)
    } catch (err) { this.bankFriend.tellBadNews([err]) }
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

  // == [Guards]: demandEnabled

  /** Demands that this listing be enabled: not past a sweep or a vacate. */
  demandEnabled(): this {
    if (! this.#isEnabled) { throw instanceDisabled() }
    return this
  }
  // --

  // == [Defined by the concrete listing]: isOneLifePerInstance, vaultTokOfWorld, scopepathOf, scopeOf, sparseOf, recordOf, makeThing, nothingStoredError, doTryList, damagedStoredError, doTryGet, doTryPut, tombstoneOver, doTryDel, watchRows, isOwnRow

  /** True where an instance is one life of its thing: a record of a newer life remakes it, rather than being received into it. */
  protected abstract get isOneLifePerInstance(): boolean

  /** The `vault_tok` every record of this listing lies under, being the vault's own; null for a listing whose records make their own, as a vault's do. */
  protected abstract vaultTokOfWorld(): string | null
  protected abstract scopepathOf(scope: ScopeT): string
  /** The scope of `recordish`, a record in any form or a thing ducking as one. */
  abstract scopeOf(recordish: unknown): ScopeT
  /** The sparse form of `recordish`, a record in any form or a thing ducking as one, as a plain copy with the payload left out. */
  abstract sparseOf(recordish: unknown): SparseT
  /** The full record `recordish` is, as a plain copy. */
  abstract recordOf(recordish: unknown): RecordT
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

// == [Helpers]: deliveryFieldingOf, Delivering, Joined, putAnswerOf

// The acts are the classifier's and the gate verbs': `notes/answer-contract.md`. A box's `vault_*` act, an unclassified_storing
// refusal, and the acts of a list or a housekeeping verb carry no record of this listing.
/** Where an answer's record is, by its act: see {@link DeliveryFielding}. */
const deliveryFieldingOf = {
  born:    'as_sent', reborn:  'as_sent', replaced: 'as_sent', deleted: 'as_sent', added: 'as_sent', revoked: 'as_sent',
  gotlive: 'as_got',  gotgone: 'as_got',  passed:   'as_got',
  gotvoid: 'void',
  stale:   'as_db',   camped:  'as_db',   gone:     'as_db',   dubdel:  'as_db',   retcon: 'as_db', clash: 'as_db', forked: 'as_db', ahead: 'as_db',
  void:    'none',    vault_void: 'none', vault_gone: 'none',  vault_reborn: 'none', vault_full: 'none', unclassified_storing: 'none',
  got:     'none',    tidied:  'none',    timely:   'none',
} as const satisfies Record<GoodAct | BadAct, DeliveryFielding>

// Every form has every field, null where it has none, so the plan destructures and narrows on its tags.
/** What delivering does, decided before anything changes: which instance receives (its `making`), and what becomes of its record (its `mod`), as the `DeliveryMaking` and `DeliveryModification` tags say. */
type Delivering<RecordT, ThingT> = Readonly<
  | { making: 'listed', mod: 'older' | 'same', listed: ThingT, record: RecordT | null }
  | { making: 'listed', mod: 'adopt',          listed: ThingT, record: RecordT }
  | { making: 'make',   mod: 'adopt',          listed: null,   record: RecordT }
  | { making: 'remake', mod: 'adopt',          listed: ThingT, record: RecordT }
>

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
