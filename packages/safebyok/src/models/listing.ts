/** The base class of the bank, gate, vault and box listings. */

import { isEqual } from 'es-toolkit'
import { UNANSWERED } from '../helpers/consts'
import { isConsistent } from '../helpers/validator'
import { oneAtATime } from '../helpers/one-at-a-time'
import { VaultError, isVaultError } from '../refusals/errors'
import { type BankDB, type Notice as BankDBNotice, answerWithVal, refusedAnswerOf } from '../storage/bank-db'
import type { BadAct, DeliveryFielding, GoodAct, IfAbsent } from '../shapes/shapes-enums'
import * as SX from '../shapes/shapes-storage'
import type { PutOpts } from '../shapes/shapes-storage'
import * as BX from '../shapes/shapes-bankdb'
import type { BankRow, BoxRow, GateRecord, VaultRow } from '../shapes/shapes-bankdb'
import * as VX from '../shapes/shapes-vaultish'
import type { DelTombstone, Fetched, FetchOpts, ListingAnswer, ListingDelOpts, ListingListAnswer, ListingPutAnswer, ListingPutOpts, ListingOpts, ListingGetAnswer, SparseBase, Thing, ThingAnswer } from '../shapes/shapes-vaultish'
import { deliveredNotAsSent, instanceDisabled, nothingStoredWhereLive, oneRevisionTwoFates, oneRevisionTwoLives, refusalOfDelivering, storageIssue } from '../refusals/throwers'
import { valOf } from '../refusals/outcome'
import { reportToPlatform } from '../refusals/report-error'
import type { Device } from './device'
import { type Storable, cmpRevisions } from './storable'

// The hub for bankDB calls, because it makes and lists the instances.
/** The instances of one kind of thing under the thing above it, one per scope, and every bankDB call for that kind.
 * It has no lifecycle of its own: it answers while the thing above it does.
 */
export abstract class Listing<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>, SnapshotT, ThingT extends Storable<ScopeT, RecordT, SparseT, SnapshotT>, DamagedT extends ScopeT & SX.DamagedRow = ScopeT & SX.DamagedRow> {
  // == [Props]: device, maxMillisSinceRefresh, bankDB, #things, #joinedGetOf, #listeners, #snapshot, #unwatch, #getSnapshot, #subscribe

  /** The device of this listing's bank. The listing's bad news goes to it. */
  readonly device: Device
  /** How long, in milliseconds, a listed thing stays timely after a refresh. */
  readonly maxMillisSinceRefresh: number
  protected readonly bankDB: BankDB

  readonly #things    = new Map<string, ThingT>()
  // Keyed by scopepath, not by instance: a scope may have no instance listed to key on.
  /** The storage get under way for each scope, which a get of that scope joins. */
  readonly #joinedGetOf = new Map<string, () => Promise<Joined<ListingAnswer<RecordT, SparseT>, ThingT | null>>>()
  readonly #listeners = new Set<() => void>()
  #snapshot: readonly string[] = Object.freeze([])
  #unwatch:  (() => void) | null = null

  readonly #getSnapshot = (): readonly string[] => this.#snapshot

  readonly #subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(VX.listener.parse(listener))
    return () => { this.#listeners.delete(listener) }
  }
  // --

  // == [Getters]: things, snapshot, getSnapshot, subscribe

  // A deleted thing is kept at its scope, out of the list, to judge later rows against and to receive a new life into.
  /** Every instance kept, one per scope: the present ones, which make the list, and the deleted ones. */
  get things(): readonly ThingT[] { return [...this.#things.values()] }

  /** The list: the label of each present instance, in a frozen array that stays the same until one comes or goes.
   * The listeners are told when it changes, and only then. A thing's own changes are its own snapshot's: subscribe to the thing for those.
   */
  get snapshot(): readonly string[] { return this.#snapshot }

  /** The snapshot getter for `useSyncExternalStore`, which needs no binding. */
  get getSnapshot(): () => readonly string[] { return this.#getSnapshot }

  /** The subscribe function for `useSyncExternalStore`, which needs no binding. */
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

  // == [Above it]: ensureParentTimely

  // Only a box listing's vault has a row to refresh: a bank's row comes with every answer about its gate and its vaults.
  /** Refresh the thing above this listing, unless it was refreshed within `maxMillis` (default: its own horizon). */
  async ensureParentTimely(maxMillis?: number): Promise<void> { VX.maxMillis.parse(maxMillis) } // eslint-disable-line @typescript-eslint/require-await -- async so that a refusal rejects
  // --

  // == [The things kept]: at, isKept, enlist

  /** The instance kept at `recordish`'s scope, **present or deleted**, or null if none. */
  at(recordish: unknown): ThingT | null {
    return this.#things.get(this.scopepathOf(this.scopeOf(recordish))) ?? null
  }

  /** Whether `thing` is the instance kept at its scope, present or deleted. */
  isKept(thing: Thing<ScopeT, RecordT, SparseT>): boolean {
    const kept: Thing<ScopeT, RecordT, SparseT> | undefined = this.#things.get(this.scopepathOf(thing.scope))
    return kept === thing
  }

  /** Enlist a new `thing` at its scope. */
  #enlist(thing: ThingT): void {
    this.#things.set(this.scopepathOf(thing.scope), thing)
    thing.becomeNotifiable()
  }
  // --

  // == [Starting and ending]: hello, goodbye, align

  /** Start watching storage for this listing's rows, if not started. */
  async hello(): Promise<void> { // eslint-disable-line @typescript-eslint/require-await -- async so that a refusal rejects
    this.demandEnabled()
    this.#unwatch ??= this.watchRows(this.deliverNotice, (news) => { this.device.tellBadNews([news]) })
  }

  // An unwatch is the adapter's, called from inside a lock or a sweep: what it throws is news, and the cascade goes on.
  /** End the watch. The instances stay as they are. Never throws: a failed unwatch is told as bad news. */
  goodbye(): void {
    const unwatch = this.#unwatch
    this.#unwatch = null
    try {
      unwatch?.()
    } catch (err) {
      this.device.tellBadNews([err])
    }
  }

  // A listing whose thing above has ended, or moved to another life, answers nothing more: its watch ends here.
  /** Align each listed thing (see {@link Storable.align}), and end the watch once this listing no longer answers.
   * Never throws.
   */
  align(): void {
    if (! this.isEnabled) { this.goodbye() }
    for (const thing of this.things) { thing.align() }
  }
  // --

  // == [Storage verbs]: list, tryList, doTryListJoined, get, tryGet, doTryGetJoined, handleIfAbsent, put, tryPut, del, tryDel

  /** List this kind's rows from storage, and return their instances.
   * A damaged row is told as bad news, and lets the instance at its scope go, which drops its secrets.
   * A list made while another runs shares it.
   * Chute: list → tryList → #doTryListJoined → doTryList → deliverListing → deliverRecord → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  async list(): Promise<readonly ThingT[]> { return valOf(await this.tryList()) }

  /** Non-throwing form of {@link list}: the bankDB's answer, with the instances as its `val`.
   * Chute: tryList → #doTryListJoined → doTryList → deliverListing → deliverRecord → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  async tryList(): Promise<ThingAnswer<readonly ThingT[]>> {
    try {
      this.demandEnabled()
      const listing = await this.#doTryListJoined()
      return ('err' in listing) ? refusedAnswerOf(listing.err, listing.answer) : answerWithVal(listing.answer, listing.val)
    } catch (err) { return refusedAnswerOf(err, UNANSWERED) }
  }

  /** List and deliver every row, never rejecting. A list made while one runs shares it.
   * Chute: #doTryListJoined → doTryList → deliverListing → deliverRecord → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  readonly #doTryListJoined = oneAtATime(async (): Promise<Joined<ListingListAnswer<RecordT, SparseT, DamagedT>, readonly ThingT[]>> => {
    const answer = await this.doTryList()
    try {
      return { answer, val: this.deliverListing(answer) }
    } catch (err) { return { answer, err } }
  })

  /** The instance at `scoped`, refreshed by a storage get unless the one listed is whole and recent enough.
   * - `maxMillisSinceRefresh`: how recent is enough (default: the listing's horizon)
   * - `maxParentMillis`: how recent the thing above must be; it is refreshed first if not
   * - `ifAbsent`: for an absent or tombstoned thing, `'fail'` (default) refuses, and `'nil'` returns null
   * Chute: listing.get → tryGet → #doTryGetJoined → doTryGet → deliverAnswer → answerDeliveringOf → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  async get(scoped: ScopeT, opts: FetchOpts = {}): Promise<ThingT | null> { return valOf(await this.tryGet(scoped, opts)) }

  /** Non-throwing form of {@link get}: the bankDB's answer, or act `timely` where the listed instance served.
   * Chute: tryGet → #doTryGetJoined → doTryGet → deliverAnswer → answerDeliveringOf → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  async tryGet(scoped: ScopeT, opts: FetchOpts = {}): Promise<ListingGetAnswer<ThingT | null>> {
    try {
      const { ifAbsent, maxMillisSinceRefresh = this.maxMillisSinceRefresh, maxParentMillis } = VX.fetchOpts.parse(opts)
      const scope = this.scopeOf(scoped)
      await this.ensureParentTimely(maxParentMillis)
      const listed = this.at(scope)
      if (listed?.isHydratedWithin(maxMillisSinceRefresh) === true) {
        return { ok: true, act: 'timely', val: this.handleIfAbsent(listed, scope, ifAbsent), parent: null, ask: BX.loggableAsk.parse({ op: 'get', ...scope }) }
      }
      const got = await this.#doTryGetJoined(scope)
      if ('err' in got) { return refusedAnswerOf(got.err, got.answer) }
      return answerWithVal(got.answer, this.handleIfAbsent(got.val, scope, ifAbsent))
    } catch (err) { return refusedAnswerOf(err, UNANSWERED) }
  }

  // A get joins any get of the same scope under way: the storage get and its delivery are shared, each caller's
  // `ifAbsent` its own.
  /** Get and deliver `scope`'s row, never rejecting.
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

  /** `found` if present. Otherwise, a refusal under `ifAbsent: 'fail'`, and null under `'nil'`. */
  protected handleIfAbsent(found: ThingT | null, scoped: ScopeT, ifAbsent: IfAbsent): ThingT | null {
    if (ifAbsent === 'fail') {
      if (found === null) { throw this.nothingStoredError(scoped) }
      found.demandPresent()
    }
    return (found?.isPresent === true) ? found : null
  }

  /** Put `record` over the stored row `opts.expected`, and return its listed instance.
   * - `ifPresent`: over a live row, `'repl'` (default) replaces it, `'fail'` refuses, and `'get'` puts nothing and returns its instance
   * - `ifAbsent`: over a void or tombstoned row, `'add'` (default) puts, and `'fail'` refuses
   * Chute: listing.put → tryPut → doTryPut → deliverAnswer → answerDeliveringOf → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  async put(record: RecordT, opts: PutOpts): Promise<ThingT> { return valOf(await this.tryPut(record, opts)) }

  /** Non-throwing form of {@link put}: the bankDB's answer, with the instance as its `val`.
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

  /** Delete the live row at `record`'s scope and revision, and return its instance, now tombstoned.
   * Chute: listing.del → tryDel → doTryDel → deliverAnswer → answerDeliveringOf → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  async del(record: SparseT): Promise<ThingT | null> { return valOf(await this.tryDel(record)) }

  /** Non-throwing form of {@link del}: the bankDB's answer, with the instance as its `val`.
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

  // == [Delivering]: deliverAnswer, answerDeliveringOf, deliverRecord, recordDeliveringOf, doDeliverRecord, deliverListing, takeDown

  /** Deliver storage's `answer`, and return the instance listed at `sent`'s scope, or null if the answer carries no record.
   * A refused answer's record is delivered too, and its refusal thrown. Any refusal its delivery meets is told as bad news.
   * Writes nothing to storage. The rules are in `notes/deliver-contract.md`.
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
  /** The plan for delivering `answer` at `sent`'s scope, or null if there is nothing to deliver. Changes nothing.
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
      demandDeliveredAs(fielding, record, scope, sent)
      return this.#recordDeliveringOf(record)
    } catch (err) { throw refusalOfDelivering(err, answer) }
  }

  /** Deliver `record` to the instance listed at its scope, making one if none is listed, and return it.
   * Writes nothing to storage.
   * Chute: deliverRecord → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  deliverRecord(record: Fetched<RecordT, SparseT>): ThingT {
    this.demandEnabled()
    return this.#doDeliverRecord(this.#recordDeliveringOf(record))
  }

  // The receive table of `notes/deliver-contract.md`, read once: the first row that matches wins. An instance stands for
  // its scope through its lives: a newer record of another life is received into it, and an older one of any life
  // leaves it as it is. The first check covers a row under another life of the thing above.
  /** The plan for receiving `record`: which instance receives it, and what becomes of that instance's record. Changes nothing.
   * Chute: recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  #recordDeliveringOf(record: Fetched<RecordT, SparseT>): Delivering<Fetched<RecordT, SparseT>, ThingT> {
    this.demandOfLife(record)
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
  /** Carry out `delivering`, and return the instance it leaves listed.
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

  // A row set aside as damaged takes down the instance kept at its scope: let go, it answers nothing more, and drops
  // what it has of secrets. The row is told as bad news.
  /** Deliver every row of a listing `answer`, setting its damaged rows aside, and return the instances.
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
    for (const damaged of damaged_rows) { this.#takeDown(damaged) }
    this.device.tellBadNews(damaged_rows.map((damaged) => this.damagedStoredError(damaged)))
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

  // A damaged row's address is storage's, under whatever labels it holds, so it is looked up as it is, never checked as a scope.
  /** Let the instance kept at `damaged`'s address go, if any, and align it, which drops its secrets. */
  #takeDown(damaged: DamagedT): void {
    const scopepath = this.scopepathOf(damaged)
    const thing = this.#things.get(scopepath)
    if (thing === undefined) { return }
    this.#things.delete(scopepath)
    thing.align()
    this.#remakeSnapshot()
  }
  // --

  // == [The watch]: deliverNotice

  // A notice is not an answer: it has no ask and no sent, and its record is the claim, as a listed row's is.
  /** Deliver a watch notice of this listing's kind, and ignore any other.
   * Never throws: a refusal is told as bad news. Bound, so it can be passed as it is.
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

  // == [Snapshot]: remakeSnapshot

  /** Remake the list from the present instances, and tell the listeners if it changed. Never throws. */
  #remakeSnapshot(): void {
    const next = this.things.filter((thing) => thing.isPresent).map((thing) => this.labelOf(thing.scope))
    if (isEqual(next, this.#snapshot)) { return }
    this.#snapshot = Object.freeze(next)
    for (const listener of this.#listeners) {
      try {
        listener()
      } catch (err) {
        reportToPlatform(err)
      }
    }
  }
  // --

  // == [Guards]: demandEnabled

  /** Throw unless `isEnabled`. */
  demandEnabled(): this { if (! this.isEnabled) { throw instanceDisabled() } return this }
  // --

  // == [Panic]: panicIfRevoked

  // Not awaited: the caller hears the refusal as the device's vacate begins, and the vacate disables before it awaits.
  /** Vacate the device if the bankDB's `refusal` is `identity_revoked`. */
  protected panicIfRevoked(refusal: VaultError): void {
    if (isVaultError(refusal, 'identity_revoked')) { void this.device.vacate({ cause: refusal }) }
  }
  // --

  // == [Defined by the concrete listing]: isEnabled, receiveParent, demandOfLife, scopepathOf, labelOf, scopeOf, sparseOf, recordOf, makeThing, nothingStoredError, doTryList, damagedStoredError, doTryGet, doTryPut, tombstoneOver, doTryDel, watchRows, isOwnRow

  /** Whether this listing answers, which it does only while the thing above it does. */
  abstract get isEnabled(): boolean
  /** Deliver the parent row an answer or a notice carries to the thing above this listing. */
  protected abstract receiveParent(parent: unknown): void
  /** Throw unless `record` belongs to the life of the thing above that this listing was made under. */
  protected abstract demandOfLife(record: Fetched<RecordT, SparseT>): void
  protected abstract scopepathOf(scope: ScopeT): string
  /** The label that names `scope` within the thing above: a vault's `vaultlabel`, a box's `boxlabel`. */
  protected abstract labelOf(scope: ScopeT): string
  /** The scope of `recordish`, any form of record or a thing. Refuses a scope outside the thing above. */
  abstract scopeOf(recordish: unknown): ScopeT
  /** The sparse form of `recordish`, any form of record or a thing, as a plain copy. */
  abstract sparseOf(recordish: unknown): SparseT
  /** `recordish` as a full record, in a plain copy. */
  abstract recordOf(recordish: unknown): RecordT
  protected abstract makeThing(central: Fetched<RecordT, SparseT>): ThingT
  /** The refusal for a scope with no row stored and no instance listed. */
  protected abstract nothingStoredError(scope: ScopeT): VaultError
  /** The bankDB's get of this kind of thing, expecting the listed instance's row. Its `val` is null when no row is stored. */
  protected abstract doTryGet(scope: ScopeT): Promise<ListingAnswer<RecordT, SparseT>>
  /** The bankDB's put of this kind of thing. */
  protected abstract doTryPut(record: RecordT, opts: ListingPutOpts<SparseT>): Promise<ListingAnswer<RecordT, SparseT>>
  /** The bankDB's list of every row of this kind: live, tombstoned and damaged. */
  protected abstract doTryList(): Promise<ListingListAnswer<RecordT, SparseT, DamagedT>>
  /** The bad news told for a damaged row. */
  protected abstract damagedStoredError(damaged: DamagedT): VaultError
  /** The tombstone a del puts over `expected`: at the next revision, under a new life token. */
  protected abstract tombstoneOver(expected: SparseT): DelTombstone<SparseT>
  /** The bankDB's del of this kind of thing. */
  protected abstract doTryDel(tombstone: DelTombstone<SparseT>, opts: ListingDelOpts<SparseT>): Promise<ListingAnswer<RecordT, SparseT>>
  /** Start the bankDB's watch for this listing, and return a function that stops it. `onBadNews` hears of trouble with the watch. */
  protected abstract watchRows(onNotice: (notice: BankDBNotice) => void, onBadNews: (news: VaultError) => void): () => void
  /** Whether `row` is one of this listing's. A watch tells of rows of every kind. */
  protected abstract isOwnRow(row: BankRow | GateRecord | VaultRow | BoxRow): row is Fetched<RecordT, SparseT> & (BankRow | GateRecord | VaultRow | BoxRow)
  // --
}

// == [Helpers]: deliveryFieldingOf, demandDeliveredAs, Delivering, Joined, putAnswerOf

// The acts are the classifier's: `notes/answer-contract.md`. A box's `vault_*` act, a bankDB's `bank_*` act, an unclassified_storing
// refusal, and the acts of a list or a housekeeping verb carry no record of this listing.
/** Where an answer's record is, by its act: see {@link DeliveryFielding}. */
const deliveryFieldingOf = {
  born:    'as_sent', reborn:  'as_sent', replaced: 'as_sent', deleted: 'as_sent',
  gotlive: 'as_got',  gotgone: 'as_got',  passed:   'as_got',  gotvoid: 'as_got',
  stale:   'as_db',   camped:  'as_db',   gone:     'as_db',   dubdel:  'as_db',   retcon: 'as_db', clash: 'as_db', forked: 'as_db', ahead: 'as_db',
  void:    'as_db',   vault_void: 'none', vault_gone: 'none',  vault_reborn: 'none', vault_full: 'none', unclassified_storing: 'none',
  bank_void: 'none',  bank_gone: 'none',  bank_reborn: 'none',
  got:     'none',    tidied:  'none',    timely:   'none',
} as const satisfies Record<GoodAct | BadAct, DeliveryFielding>

/** Demand that `record`, which storage delivered as `fielding` says, agrees with `scope`, and for a record stored (`as_sent`) with the revision pins of `sent`.
 * Throws a `storage_issue` where it does not.
 */
export function demandDeliveredAs(fielding: 'as_sent' | 'as_got' | 'as_db', record: object, scope: object, sent: object): void {
  const pins = (fielding === 'as_sent') ? { ...scope, ...SX.revisionPins.parse(sent) } : scope
  if (! isConsistent(record, pins)) { throw deliveredNotAsSent(fielding, record, pins) }
}

// Every form has every field, null where it has none, so the plan destructures and narrows on its tags.
/** A delivery plan: which instance receives the record (`making`), and what becomes of its record (`mod`).
 * See `DeliveryMaking` and `DeliveryModification`.
 */
type Delivering<RecordT, ThingT> = Readonly<
  | { making: 'listed', mod: 'older' | 'same', listed: ThingT, record: RecordT | null }
  | { making: 'listed', mod: 'adopt',          listed: ThingT, record: RecordT }
  | { making: 'make',   mod: 'adopt',          listed: null,   record: RecordT }
>

/** A joined storage call's answer, with what delivering it returned, or the refusal delivering met. */
type Joined<AnswerT, ValT> = { answer: AnswerT, val: ValT } | { answer: AnswerT, err: unknown }

/** `answer` as a put's answer, which carries a row when good. */
function putAnswerOf<RecordT, SparseT>(answer: ListingAnswer<RecordT, SparseT>): ListingPutAnswer<RecordT, SparseT> {
  if (! answer.ok) { return answer }
  const { val } = answer
  if (val === null) { throw storageIssue() }
  return { ...answer, val }
}
// --
