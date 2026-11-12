/** The base of a box listing and a vault listing: the live instances of one kind of thing, the watch on storage, and every storage call made for that kind of thing. */

import { isEqual } from 'es-toolkit'
import { UNANSWERED } from '../helpers/consts'
import { isConsistent } from '../helpers/validator'
import { oneAtATime } from '../helpers/one-at-a-time'
import { VaultError, isVaultError } from '../refusals/errors'
import { type BankDB, type Notice as BankDBNotice, answerWithVal, refusedAnswerOf } from '../storage/bank-db'
import type { BankBadAct, DeliveryFielding, GoodAct, IfAbsent } from '../shapes/shapes-enums'
import * as SX from '../shapes/shapes-storage'
import type { PutOpts } from '../shapes/shapes-storage'
import type { BankRow, BoxRow, GateRecord, VaultRow } from '../shapes/shapes-bankdb'
import * as VX from '../shapes/shapes-vaultish'
import type { DelTombstone, Fetched, FetchOpts, ListingAnswer, ListingDelOpts, ListingListAnswer, ListingPutAnswer, ListingPutOpts, ListingOpts, ListingGetAnswer, SparseBase, Thing, ThingAnswer } from '../shapes/shapes-vaultish'
import { deliveredNotAsSent, nothingStoredWhereLive, oneRevisionTwoFates, oneRevisionTwoLives, refusalOfDelivering, storageIssue } from '../refusals/throwers'
import { valOf } from '../refusals/outcome'
import { reportToPlatform } from '../refusals/report-error'
import type { Device } from './device'
import { type Storable, cmpRevisions } from './storable'

/** The live instances of one kind of thing under the thing above it, the watch on storage, and every storage call made for that kind of thing.
 * It is the hub for bankDB requests because it makes, lists and delists its instances. It has no lifecycle of its own: it answers while the thing above it does.
 */
export abstract class Listing<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>, SnapshotT, ThingT extends Storable<ScopeT, RecordT, SparseT, SnapshotT>, DamagedT extends ScopeT & SX.DamagedRow = ScopeT & SX.DamagedRow> {
  // == [Props]: device, maxMillisSinceRefresh, bankDB, #things, #joinedGetOf, #doTryListJoined, #listeners, #snapshot, #unwatch, #getSnapshot, #subscribe

  /** The device this listing's bank is of, which hears its bad news. */
  readonly device: Device
  /** The refresh horizon of each thing made here. */
  readonly maxMillisSinceRefresh: number
  protected readonly bankDB: BankDB

  readonly #things    = new Map<string, ThingT>()
  // Keyed by scopepath, not by instance: a scope may have no instance listed to key on.
  /** The storage get of each scope under way, joined while it runs. */
  readonly #joinedGetOf = new Map<string, () => Promise<Joined<ListingAnswer<RecordT, SparseT>, ThingT | null>>>()
  /** The rows the bankDB's last listing set aside as damaged. */
  #damagedRows: readonly DamagedT[] = Object.freeze([])
  readonly #listeners = new Set<() => void>()
  #snapshot: readonly SnapshotT[] = Object.freeze([])
  #unwatch:  (() => void) | null = null

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

  constructor(device: Device, opts: ListingOpts) {
    const { bankDB, maxMillisSinceRefresh } = VX.listingOpts.parse(opts)
    this.device = VX.listedUnder.device.parse(device)
    this.bankDB = bankDB
    this.maxMillisSinceRefresh = maxMillisSinceRefresh
  }
  // --

  // == [Above it]: ensureTimelyWorld

  // Only a box listing's vault has a row to refresh: a bank's row comes with every answer about its gate and its vaults.
  /** The thing above this listing refreshed within `maxMillis`, by default its own horizon. */
  async ensureTimelyWorld(maxMillis?: number): Promise<void> { VX.maxMillis.parse(maxMillis) } // eslint-disable-line @typescript-eslint/require-await -- async so that a refusal rejects
  // --

  // == [The listed things]: at, isListed, delist, enlist

  /** The instance listed under the scope of `recordish`, or null. */
  at(recordish: unknown): ThingT | null {
    return this.#things.get(this.scopepathOf(this.scopeOf(recordish))) ?? null
  }

  /** Whether `thing` is the instance listed at its scope. */
  isListed(thing: Thing<ScopeT, RecordT, SparseT>): boolean {
    const listed: Thing<ScopeT, RecordT, SparseT> | undefined = this.#things.get(this.scopepathOf(thing.scope))
    return listed === thing
  }

  /** Delist `thing`: the scope is left with none listed only for this very instance. */
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

  // == [Starting and ending]: hello, goodbye, lock

  /** Start the watch. */
  async hello(): Promise<void> { // eslint-disable-line @typescript-eslint/require-await -- async so that a refusal rejects
    this.demandEnabled()
    this.#unwatch ??= this.watchRows(this.deliverNotice, (news) => { this.device.tellBadNews([news]) })
  }

  /** End the watch. The instances stay as they are. */
  goodbye(): void {
    this.#unwatch?.()
    this.#unwatch = null
  }

  /** Bring each thing listed up to the lock: see {@link Storable.lock}. Never throws. */
  lock(): this {
    for (const thing of this.things) { thing.lock() }
    return this
  }
  // --

  // == [Storage verbs]: list, tryList, doTryListJoined, listedAt, get, tryGet, doTryGetJoined, handleIfAbsent, put, tryPut, del, tryDel

  /** Enlists every row the bankDB lists here, sets aside the rows it found damaged, and answers the instances listed.
   * Chute: list → tryList → #doTryListJoined → doTryList → deliverListing → deliverRecord → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  async list(): Promise<readonly ThingT[]> { return valOf(await this.tryList()) }

  /** {@link list}, answering the bankDB's own answer with the instances listed as its `val`.
   * Chute: tryList → #doTryListJoined → doTryList → deliverListing → deliverRecord → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  async tryList(): Promise<ThingAnswer<readonly ThingT[]>> {
    try {
      this.demandEnabled()
      const listing = await this.#doTryListJoined()
      return ('err' in listing) ? refusedAnswerOf(listing.err, listing.answer) : answerWithVal(listing.answer, listing.val)
    } catch (err) { return refusedAnswerOf(err, UNANSWERED) }
  }

  /** The storage listing of every row, delivered, never rejecting: one at a time, joined by every list made while it runs.
   * Chute: #doTryListJoined → doTryList → deliverListing → deliverRecord → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  readonly #doTryListJoined = oneAtATime(async (): Promise<Joined<ListingListAnswer<RecordT, SparseT, DamagedT>, readonly ThingT[]>> => {
    const answer = await this.doTryList()
    try {
      return { answer, val: this.deliverListing(answer) }
    } catch (err) { return { answer, err } }
  })

  // A damaged row's address is storage's, under whatever labels it holds, so it is looked up as it is, never checked as a scope.
  /** The instance listed at a damaged row's address, or null. */
  #listedAt(damaged: DamagedT): ThingT | null { return this.#things.get(this.scopepathOf(damaged)) ?? null }

  /** The instance under `scoped`: the one listed, no older than `opts` allows, or fetched where none is; null under `ifAbsent: 'nil'`.
   * Chute: listing.get → tryGet → #doTryGetJoined → doTryGet → deliverAnswer → answerDeliveringOf → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  async get(scoped: ScopeT, opts: FetchOpts = {}): Promise<ThingT | null> { return valOf(await this.tryGet(scoped, opts)) }

  /** {@link get}, answering the bankDB's own answer where storage was asked, or the act `timely` where the instance listed served it.
   * Chute: tryGet → #doTryGetJoined → doTryGet → deliverAnswer → answerDeliveringOf → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  async tryGet(scoped: ScopeT, opts: FetchOpts = {}): Promise<ListingGetAnswer<ThingT | null>> {
    try {
      const { ifAbsent, maxMillisSinceRefresh = this.maxMillisSinceRefresh, maxWorldMillis } = VX.fetchOpts.parse(opts)
      const scope = this.scopeOf(scoped)
      await this.ensureTimelyWorld(maxWorldMillis)
      const listed = this.at(scope)
      if (listed?.isHydratedWithin(maxMillisSinceRefresh) === true) {
        return { ok: true, act: 'timely', val: this.handleIfAbsent(listed, scope, ifAbsent), parent: null, ask: SX.loggableAsk.parse({ op: 'get', ...scope }) }
      }
      const got = await this.#doTryGetJoined(scope)
      if ('err' in got) { return refusedAnswerOf(got.err, got.answer) }
      return answerWithVal(got.answer, this.handleIfAbsent(got.val, scope, ifAbsent))
    } catch (err) { return refusedAnswerOf(err, UNANSWERED) }
  }

  // A get joins any get of the same scope under way: the storage get and its delivery are shared, each caller's
  // `ifAbsent` its own.
  /** The storage get of `scope`, delivered, never rejecting: one at a time, joined by every get of that scope made while it runs.
   * Chute: #doTryGetJoined → doTryGet → deliverAnswer → answerDeliveringOf → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  #doTryGetJoined(scope: ScopeT): Promise<Joined<ListingAnswer<RecordT, SparseT>, ThingT | null>> {
    const scopepath = this.scopepathOf(scope)
    let getOnce = this.#joinedGetOf.get(scopepath)
    if (getOnce === undefined) {
      getOnce = oneAtATime(async () => {
        const answer = await this.doTryGet(scope)
        // The join ends as storage answers: delivering is synchronous, so no get can join it after, and none is kept.
        this.#joinedGetOf.delete(scopepath)
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
   * Chute: listing.put → tryPut → doTryPut → deliverAnswer → answerDeliveringOf → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  async put(record: RecordT, opts: PutOpts): Promise<ThingT> { return valOf(await this.tryPut(record, opts)) }

  /** {@link put}, answering the bankDB's own answer with the instance listed as its `val`.
   * Chute: tryPut → doTryPut → deliverAnswer → answerDeliveringOf → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
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
   * Chute: listing.del → tryDel → doTryDel → deliverAnswer → answerDeliveringOf → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  async del(record: SparseT): Promise<ThingT | null> { return valOf(await this.tryDel(record)) }

  /** {@link del}, answering the bankDB's own answer with the instance as its `val`.
   * Chute: tryDel → doTryDel → deliverAnswer → answerDeliveringOf → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
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

  /** Deliver storage's `answer`: the row above first, then its record to the instance listed at `sent`'s scope, which is returned (null where the answer carries no record).
   * Nothing is written to storage. A good answer throws whatever delivering it meets. A refused one tells that as bad news
   * and throws its own refusal. The contract, table by table, is `notes/deliver-contract.md`.
   * Chute: deliverAnswer → answerDeliveringOf → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  protected deliverAnswer(answer: ListingPutAnswer<RecordT, SparseT>, sent: ScopeT | Fetched<RecordT, SparseT>): ThingT
  protected deliverAnswer(answer: ListingAnswer<RecordT, SparseT>, sent: ScopeT | Fetched<RecordT, SparseT>): ThingT | null
  protected deliverAnswer(answer: ListingAnswer<RecordT, SparseT>, sent: ScopeT | Fetched<RecordT, SparseT>): ThingT | null {
    this.demandEnabled()
    // No awaits: a revoked identity panics before any other answer is delivered. The first refusal met is thrown, any
    // after it told as bad news: a refusal's own err comes first.
    try {
      if (answer.parent !== null) { this.receiveParent(answer.parent) }
      const delivering = this.#answerDeliveringOf(answer, sent)
      const thing = (delivering === null) ? null : this.#doDeliverRecord(delivering)
      if (answer.ok) { return thing }
    } catch (err) {
      if (answer.ok) { throw err }
      this.device.tellBadNews([err])
    }
    this.panicIfRevoked(answer.err)
    throw answer.err
  }

  // The answer passed its verb's check, and is trusted: its act alone says where its record is (`deliveryFieldingOf`).
  /** What delivering `answer` to the instance listed at `sent`'s scope will do, decided before anything changes; null for nothing.
   * Throws `storage_issue` for a record of another scope or revision than `sent`, and `record_conflict` where storage
   * is certain nothing is stored and a live instance is listed.
   * Chute: answerDeliveringOf → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  #answerDeliveringOf(answer: ListingAnswer<RecordT, SparseT>, sent: ScopeT | Fetched<RecordT, SparseT>): Delivering<Fetched<RecordT, SparseT>, ThingT> | null {
    try {
      const fielding = deliveryFieldingOf[answer.act]
      if (fielding === 'none') { return null }
      const scope    = this.scopeOf(sent)
      const listed   = this.at(scope)
      // No record is storage's word that nothing is stored (`gotvoid`, a refused `void` or `ahead`): a live instance listed is impossible.
      const record = ((answer.ok ? answer.val : answer.dbhas) ?? null) as Fetched<RecordT, SparseT> | null
      if (record === null) {
        if (listed === null)  { return null }
        if (listed.isPresent) { throw nothingStoredWhereLive() }
        return { making: 'listed', mod: 'same', listed, record: null }
      }
      const pins   = (fielding === 'as_sent') ? { ...scope, ...SX.revisionPins.parse(sent) } : scope
      if (! isConsistent(record, pins)) { throw deliveredNotAsSent(fielding, record, pins) }
      return this.#recordDeliveringOf(record)
    } catch (err) { throw refusalOfDelivering(err, answer) }
  }

  /** The instance of `record`, made or brought up to it, and listed. Writes nothing.
   * Chute: deliverRecord → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  deliverRecord(record: Fetched<RecordT, SparseT>): ThingT {
    this.demandEnabled()
    return this.#doDeliverRecord(this.#recordDeliveringOf(record))
  }

  // The receive table of `notes/deliver-contract.md`, read once: the first row that matches wins. An instance stands for
  // its scope through its lives: a newer record of another life is received into it, and an older one of any life
  // leaves it as it is. The first check covers a row under another life of the thing above.
  /** What receiving `record` will do: which instance receives it, and what becomes of that instance's record.
   * Throws `storage_issue` for a record under another life of the thing above than the listing's, and `record_conflict` where storage
   * and the instance listed disagree on the history of one revision.
   * Chute: recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  #recordDeliveringOf(record: Fetched<RecordT, SparseT>): Delivering<Fetched<RecordT, SparseT>, ThingT> {
    this.demandOfWorld(record)
    const listed     = this.at(this.scopeOf(record))
    if (listed === null) { return { making: 'make', mod: 'adopt', listed: null, record } }
    const age        = cmpRevisions(listed, record)
    if (age === 'older')                                                 { return { making: 'listed', mod: 'older', listed, record } }
    if (age === 'newer')                                                 { return { making: 'listed', mod: 'adopt', listed, record } }
    if (! listed.isOfLife(record))                                       { throw oneRevisionTwoLives(record) }
    const rcvdShape  = listed.shapeOf(record)
    const heldShape  = listed.shape
    if ((rcvdShape === 'gone') !== (heldShape === 'gone'))               { throw oneRevisionTwoFates(record) }
    if ((rcvdShape === 'full') && (heldShape === 'sparse'))              { return { making: 'listed', mod: 'adopt', listed, record } }
    return { making: 'listed', mod: 'same', listed, record }
  }

  // The one place an instance is made and enlisted. It is made at the void revision and handed its record as a listed one
  // is, so that receiving runs for it too: a vault made from a tombstone forgets the lease cached on this device. What
  // can throw (`makeThing`, `receiveRecord`) runs before the listing changes; an instance never enlisted holds nothing.
  /** Do what `delivering` says, and answer the instance it leaves listed.
   * Chute: doDeliverRecord → thing.receiveRecord
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
    this.#remakeSnapshot()
    return thing
  }

  // A row set aside as damaged takes down the instance listed at its scope: delisted, it answers nothing more, and drops
  // what it has of secrets. The row is told as bad news.
  /** The instances `answer` lists, made or brought up to their records, its damaged rows set aside.
   * Chute: deliverListing → deliverRecord → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  protected deliverListing(answer: ListingListAnswer<RecordT, SparseT, DamagedT>): readonly ThingT[] {
    this.demandEnabled()
    if (answer.parent !== null) { this.receiveParent(answer.parent) }
    if (! answer.ok) {
      this.panicIfRevoked(answer.err)
      throw answer.err
    }
    const { listed, damaged_rows } = answer.val
    const isDamageNews = ! isEqual(this.#damagedRows, damaged_rows)
    this.#damagedRows = Object.freeze(damaged_rows)
    for (const damaged of damaged_rows) { this.#takeDown(this.#listedAt(damaged)) }
    this.device.tellBadNews(damaged_rows.map((damaged) => this.damagedStoredError(damaged)))
    if (isDamageNews) { this.tellListeners() }
    // Every row is delivered: the first refusal met is thrown, any after it told as bad news.
    const things: ThingT[] = []
    const refusals: unknown[] = []
    for (const row of listed) {
      try { things.push(this.deliverRecord(row)) } catch (err) { refusals.push(err) }
    }
    if (refusals.length > 0) {
      this.device.tellBadNews(refusals.slice(1))
      throw refusals[0]
    }
    return things
  }

  /** Delist `thing`, if any, and bring it up to the lock, where a thing no longer listed drops what it has of secrets. */
  #takeDown(thing: ThingT | null): void {
    if (thing === null) { return }
    this.delist(thing)
    thing.lock()
  }
  // --

  // == [The watch]: deliverNotice

  // A notice is not an answer: it has no ask and no sent, and its record is the claim, as a listed row's is.
  /** Delivers a watch notice of this listing's kind, and passes over any other: the row above, then its record, any refusal told as bad news. Bound.
   * Chute: deliverNotice → deliverRecord → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  readonly deliverNotice = (notice: BankDBNotice): void => {
    const { val, parent } = notice
    if ((! this.isEnabled) || (! this.isOwnRow(val))) { return }
    try {
      if (parent !== null) { this.receiveParent(parent) }
      this.deliverRecord(val)
    } catch (err) { this.device.tellBadNews([err]) }
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

  // Not awaited: the caller hears the refusal as the device's vacate begins, and the vacate disables before it awaits.
  /** A refusal of the bankDB's on its way to a caller: 'identity_revoked' vacates the device before the caller hears the refusal. */
  protected panicIfRevoked(refusal: VaultError): void {
    if (isVaultError(refusal, 'identity_revoked')) { void this.device.vacate({ cause: refusal }) }
  }
  // --

  // == [Defined by the concrete listing]: isEnabled, demandEnabled, receiveParent, demandOfWorld, scopepathOf, scopeOf, sparseOf, recordOf, makeThing, nothingStoredError, doTryList, damagedStoredError, doTryGet, doTryPut, tombstoneOver, doTryDel, watchRows, isOwnRow

  /** Whether this listing answers: the thing above it does, and, for a box listing, its vault is still of the life it was made under. */
  abstract get isEnabled(): boolean
  /** Demand that this listing answers: see {@link Listing.isEnabled}. */
  abstract demandEnabled(): this
  /** Deliver the row above, which an answer or a notice carries, to the thing above this listing. */
  protected abstract receiveParent(parent: unknown): void
  /** Throws `storage_issue` for a record that does not lie under the thing above: a box of another vault life, a vault or a gate of another bank. */
  protected abstract demandOfWorld(record: Fetched<RecordT, SparseT>): void
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
  /** The bankDB's get of this kind of thing, expecting the listed instance's row. Its answer's `val` is null when nothing is stored. */
  protected abstract doTryGet(scope: ScopeT): Promise<ListingAnswer<RecordT, SparseT>>
  /** The bankDB's put of this kind of thing. */
  protected abstract doTryPut(record: RecordT, opts: ListingPutOpts<SparseT>): Promise<ListingAnswer<RecordT, SparseT>>
  /** The bankDB's listing of every row of this kind, live, gone and damaged. */
  protected abstract doTryList(): Promise<ListingListAnswer<RecordT, SparseT, DamagedT>>
  /** The bad news a row the listing set aside as damaged is told as. */
  protected abstract damagedStoredError(damaged: DamagedT): VaultError
  /** The tombstone a del stores over `expected`: at the next revision, with a new life token of its own. */
  protected abstract tombstoneOver(expected: SparseT): DelTombstone<SparseT>
  /** The bankDB's del of this kind of thing. */
  protected abstract doTryDel(tombstone: DelTombstone<SparseT>, opts: ListingDelOpts<SparseT>): Promise<ListingAnswer<RecordT, SparseT>>
  /** Start the bankDB's watch over this listing's scope, `onBadNews` hearing of trouble with it; returns how to stop. */
  protected abstract watchRows(onNotice: (notice: BankDBNotice) => void, onBadNews: (news: VaultError) => void): () => void
  /** True for a row this listing has: the bankDB's watch tells of the bank's rows, its gates', its vaults' and its boxes' alike. */
  protected abstract isOwnRow(row: BankRow | GateRecord | VaultRow | BoxRow): row is Fetched<RecordT, SparseT> & (BankRow | GateRecord | VaultRow | BoxRow)
  // --
}

// == [Helpers]: deliveryFieldingOf, Delivering, Joined, putAnswerOf

// The acts are the classifier's and the gate verbs': `notes/answer-contract.md`. A box's `vault_*` act, a bankDB's `bank_*` act, an unclassified_storing
// refusal, and the acts of a list or a housekeeping verb carry no record of this listing.
/** Where an answer's record is, by its act: see {@link DeliveryFielding}. */
const deliveryFieldingOf = {
  born:    'as_sent', reborn:  'as_sent', replaced: 'as_sent', deleted: 'as_sent', added: 'as_sent', revoked: 'as_sent',
  gotlive: 'as_got',  gotgone: 'as_got',  passed:   'as_got',  gotvoid: 'as_got',
  stale:   'as_db',   camped:  'as_db',   gone:     'as_db',   dubdel:  'as_db',   retcon: 'as_db', clash: 'as_db', forked: 'as_db', ahead: 'as_db',
  void:    'as_db',   vault_void: 'none', vault_gone: 'none',  vault_reborn: 'none', vault_full: 'none', unclassified_storing: 'none',
  bank_void: 'none',  bank_gone: 'none',  bank_reborn: 'none',
  got:     'none',    tidied:  'none',    timely:   'none',
} as const satisfies Record<GoodAct | BankBadAct, DeliveryFielding>

// Every form has every field, null where it has none, so the plan destructures and narrows on its tags.
/** What delivering does, decided before anything changes: which instance receives (its `making`), and what becomes of its record (its `mod`), as the `DeliveryMaking` and `DeliveryModification` tags say. */
type Delivering<RecordT, ThingT> = Readonly<
  | { making: 'listed', mod: 'older' | 'same', listed: ThingT, record: RecordT | null }
  | { making: 'listed', mod: 'adopt',          listed: ThingT, record: RecordT }
  | { making: 'make',   mod: 'adopt',          listed: null,   record: RecordT }
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
