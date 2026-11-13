import { isEqual } from 'es-toolkit'
import { nowMillis } from '../helpers/clock'
import * as Phrases from '../helpers/phrases'
import { checkedConsistent } from '../helpers/validator'
import { adorn, tattoo } from '../helpers/helpers'
import { type Outcome, outcomeOf } from '../refusals/outcome'
import { reportToPlatform } from '../refusals/report-error'
import { instanceDisabled, needUnlocked, oneRevisionTwoToks, partialLoad } from '../refusals/throwers'
import type { Age, Am, RecordShape } from '../shapes/shapes-enums'
import * as VX from '../shapes/shapes-vaultish'
import type { Fetched, FetchOpts, ListingOf, SparseBase, TimelyOpts, Tombstone } from '../shapes/shapes-vaultish'
import * as SX from '../shapes/shapes-storage'
import type { Revision } from '../shapes/shapes-storage'

// == [Revisions]: cmpRevisions

/** How `post` compares to `ante`: the later `revision_seq` is newer. The same seq under another `revision_tok` is two puts written as one revision. */
export function cmpRevisions(ante: Revision, post: Revision): Age {
  if (post.revision_seq < ante.revision_seq) { return 'older' }
  if (post.revision_seq > ante.revision_seq) { return 'newer' }
  if (post.revision_tok !== ante.revision_tok) {
    throw oneRevisionTwoToks(post)
  }
  return 'same'
}
// --

/** A bank, gate, vault or box in this tab, kept in step with its row in the bankDB. */
export abstract class Storable<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>, SnapshotT> {
  // == [Props]: scope, listing, revision_tok, revision_seq, registered_at, written_at, #central, #snapshot, #refreshedAt, #listeners, #getSnapshot, #subscribe

  /** Adorned in the constructor: readable, left out of enumeration and JSON. */
  declare readonly listing: ListingOf<ScopeT, RecordT, SparseT>

  /** The revision and times of the record in hand, as plain own props, assigned before the seal by `assignInitialProps` and again by `assign` at each adopt: `registered_at` only at birth and for a record of another life. */
  declare revision_tok:  string
  declare revision_seq:  number
  declare registered_at: number
  declare written_at:    number

  /** The scope, set once and frozen: the listing keys and watches by it, and the verbs name it. Its props are also tattooed on, so the thing ducks as its record; a getter keeps `scope` itself off the duck. */
  readonly #scope: ScopeT

  /** The latest record this device knows is stored: full, sparse or a tombstone, void on a new instance. */
  #central: Fetched<RecordT, SparseT>
  /** Made when `snapshot` is first asked for, and again by each `align` once one exists. */
  #snapshot: SnapshotT | null = null
  /** When storage last answered with a record not older than central that left the record in hand whole; null until it has. */
  #refreshedAt: number | null = null
  readonly #listeners = new Set<() => void>()

  /** Unbound callback to acquire the snapshot */
  readonly #getSnapshot = (): SnapshotT => this.snapshot

  /** Unbound callback to enroll the given listener for push notifications
   * Invoke the returned unsubscribe function to unenroll the listener
   */
  readonly #subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(VX.listener.parse(listener))
    return () => { this.#listeners.delete(listener) }
  }
  // --

  // == [Getters]: scope, central, full, sparse, am, toJSON, snapshot, getSnapshot, subscribe, subscribeOwn

  /** The scope this thing is stored under. */
  get scope(): ScopeT { return this.#scope }

  /** The most recent view of the stored record. */
  protected get central(): Fetched<RecordT, SparseT> { return this.#central }

  /** The record in hand where it is the full record, else null. */
  protected get full(): RecordT | null {
    return this.isFullRecord(this.#central) ? this.#central : null
  }

  /** The sparse form of central: everything but what only the full record carries. */
  get sparse(): SparseT { return this.listing.sparseOf(this.#central) }

  /** When this thing's record was last refreshed from the bankDB, or null where it never was. */
  get refreshedAt(): number | null { return this.#refreshedAt }

  /** Whether the record in hand is alive, damaged or gone. */
  get am(): Am { return this.#central.am }

  /** The {@link sparse} form of this thing, for `JSON.stringify`. */
  toJSON(): SparseT { return this.sparse }

  /** Direct public access to the snapshot */
  get snapshot(): SnapshotT {
    if (this.#snapshot === null) { this.#snapshot = this.makeSnapshot() }
    return this.#snapshot
  }

  /** Public access to the unbound "hand over yer snapshot" callback */
  get       getSnapshot(): () => SnapshotT { return this.#getSnapshot }

  /** Public access to the unbound "make me a subscriber" callback */
  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }

  /** As {@link subscribe}, for this thing's own changes alone, where a subclass widens `subscribe`. */
  get subscribeOwn(): (listener: () => void) => (() => void) { return this.#subscribe }
  // --

  // == [Construction]: constructor, assignInitialProps, assign

  /** A concrete class inscribes its own props in `assignInitialProps`; it needs no constructor. */
  constructor(listing: ListingOf<ScopeT, RecordT, SparseT>, central: Fetched<RecordT, SparseT>) {
    VX.storableArgs.parse({ listing, central })
    adorn(this, 'listing', listing)
    this.#scope = Object.freeze(listing.scopeOf(central))
    this.#central = Object.freeze(central)
    this.assignInitialProps(central)
    this.align()
    Object.seal(this)
  }

  /** SLOPDOC: Inscribes the own props before the seal; a subclass adds its own the same way, never as #fields. */
  protected assignInitialProps(central: Fetched<RecordT, SparseT>): void {
    tattoo(this, this.scope, { configurable: false })
    this.registered_at = central.registered_at
    this.assign(central)
  }

  /** SLOPDOC: Assigns the mutable own props from the record about to be in hand; a subclass adds its own from it. */
  protected assign(record: Fetched<RecordT, SparseT>): void {
    const { revision_tok, revision_seq, written_at, registered_at } = record
    if (! this.isOfLife(record)) { this.registered_at = registered_at }
    this.revision_tok = revision_tok
    this.revision_seq = revision_seq
    this.written_at   = written_at
  }
  // --

  // == [Storable ops]: get, hydrate, del, each with its try form

  /** This thing, its record fetched unless timely within `opts.maxMillisSinceRefresh`; refused if absent, unless `ifAbsent: 'nil'`.
   * Chute: thing.get → listing.get → tryGet → #doTryGetJoined → doTryGet → deliverAnswer → answerDeliveringOf → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  async get(opts: FetchOpts = {}): Promise<this> {
    const { ifAbsent, maxMillisSinceRefresh, maxWorldMillis } = VX.fetchOpts.parse(opts)
    this.demandEnabled()
    await this.listing.get(this.scope, { ifAbsent: 'nil', maxMillisSinceRefresh, maxWorldMillis })
    this.demandEnabled()
    if (ifAbsent === 'fail') { this.demandPresent() }
    return this
  }

  /** Non-throwing form of {@link get}. */
  tryGet(opts: FetchOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.get(opts)) }

  // A thing let go answers from the record it has while that is timely: only a fetch needs it enabled.
  /** This thing, its world timely and its record fetched unless timely within `opts.maxMillisSinceRefresh`.
   * Chute: thing.hydrate → thing.get → listing.get → tryGet → #doTryGetJoined → doTryGet → deliverAnswer → answerDeliveringOf → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  async hydrate(opts: TimelyOpts = {}): Promise<this> {
    const { maxMillisSinceRefresh = this.listing.maxMillisSinceRefresh, maxWorldMillis } = VX.timelyOpts.parse(opts)
    if (! this.isHydratedWithin(maxMillisSinceRefresh)) { return this.get({ ifAbsent: 'nil', maxMillisSinceRefresh: 0, maxWorldMillis }) }
    await this.listing.ensureTimelyWorld(maxWorldMillis)
    return this
  }

  /** Non-throwing form of {@link hydrate}. */
  tryHydrate(opts: TimelyOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.hydrate(opts)) }

  /** Delete, via its listing -- the asked-for record must be consistent with the listed one
   * refuses `stale_write` if the record changes between the hydration here and the delete transaction.
   */
  async del(asked: ScopeT | SparseT, opts: TimelyOpts = {}): Promise<this> {
    const scope = this.listing.scopeOf(asked)
    const pins = { ...SX.revisionPins.parse(asked), ...scope }
    const { maxMillisSinceRefresh, maxWorldMillis } = VX.timelyOpts.parse(opts)
    await this.ensureDeletable({ maxMillisSinceRefresh, maxWorldMillis }); this.demandDeletable()
    checkedConsistent(this.sparse, pins, { kind: 'stale_write', message: Phrases.DelOfOtherRevision })
    await this.listing.del(this.sparse)
    return this
  }

  /** Non-throwing form of {@link del}. */
  tryDel(asked: ScopeT | SparseT, opts: TimelyOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.del(asked, opts)) }
  // --

  // == [Receiving]: receiveRecord, markRefreshed, isOfLife, shapeOf
  // The listing decides what a record received does here (`Listing.#recordDeliveringOf`): an instance judges nothing.

  /** Adopt `record`, mark this instance refreshed once whole, and tell the subscribers. */
  receiveRecord(record: Fetched<RecordT, SparseT>): void {
    this.adopt(record)
    if (this.#isWhole) { this.#refreshedAt = nowMillis() }
    this.align()
  }

  /** Mark this instance refreshed, once whole: storage answered the record in hand. */
  markRefreshed(): void {
    if (this.#isWhole) { this.#refreshedAt = nowMillis() }
  }

  /** Whether `record` is of the life of the record in hand: the same `lifeTokPathOf`. */
  isOfLife(record: Fetched<RecordT, SparseT>): boolean {
    return this.lifeTokPathOf(record) === this.lifeTokPathOf(this.#central)
  }

  /** The shape of the record in hand: see {@link shapeOf}. */
  get shape(): RecordShape { return this.shapeOf(this.#central) }

  /** The shape of `record`: 'gone' for a tombstone, 'full' for a record `isFullRecord` accepts, 'sparse' for any other. */
  shapeOf(record: Fetched<RecordT, SparseT>): RecordShape {
    if (this.isTombstoneRecord(record)) { return 'gone' }
    if (this.isFullRecord(record))      { return 'full' }
    return 'sparse'
  }
  // --

  // == [Aligning]: align, becomeNotifiable, replaceSnapshot, tellListeners

  /** SLOPDOC: Brings the snapshot up to the state just adopted, notifying the subscribers where it changed. */
  align(): void { this.#replaceSnapshot() }

  /** Make the snapshot now, if not yet made, so that each change from here on notifies the subscribers: until then there is none to replace. */
  becomeNotifiable(): this {
    this.#snapshot ??= this.makeSnapshot()
    return this
  }

  /** Replace the snapshot with a new one, and notify all listeners. Until `snapshot` is first asked for there is none to replace: that ask makes it. */
  #replaceSnapshot(): void {
    if (this.#snapshot === null) { return }
    const nextSnapshot = this.makeSnapshot()
    if (isEqual(nextSnapshot, this.#snapshot)) { return }
    this.#snapshot = nextSnapshot
    this.tellListeners()
  }

  /** Tell every listener, for a subclass whose change a snapshot's fields cannot show. */
  protected tellListeners(): void {
    this.#listeners.forEach((listener) => {
      try {
        listener()
      } catch (err) {
        reportToPlatform(err)
      }
    })
  }
  // --

  // == [The lock]: alignLock

  // A thing's one duty at a lock and at its end: tell its listeners, and, once it no longer answers, drop what it has
  // of secrets. The base has none.
  /** Tell the listeners the bank's lock has moved. Never throws. Locks nothing: a host locks the bank.
   * @internal
   */
  alignLock(): this {
    this.align()
    return this
  }
  // --

  // == [Guards]: isEnabled, isLocked, isTimely, isHydratedWithin, isRefreshedWithin, isPresent, isFull, isWhole, isWholeRecord, isTombstoneRecord, demandDeletable, demandUnlocked, demandEnabled, demandFull, demandWhole, demandFullProps, ensureDeletable

  /** Whether this thing answers: its listing does, and it is the instance listed at its scope. */
  get isEnabled(): boolean { return this.listing.isEnabled && this.listing.isListed(this) }

  /** Whether this thing's bank is locked, read live. */
  protected abstract get isLocked(): boolean

  /** Whether the record in hand was refreshed within the thing's horizon: never before storage has answered. */
  get isTimely(): boolean { return this.#isRefreshedWithin(this.listing.maxMillisSinceRefresh) }

  /** Whether the whole record is in hand, refreshed within `maxMillis`: what `hydrate` takes as it is. */
  isHydratedWithin(maxMillis: number): boolean { return this.#isWhole && this.#isRefreshedWithin(maxMillis) }

  #isRefreshedWithin(maxMillis: number): boolean {
    return this.#refreshedAt !== null && nowMillis() - this.#refreshedAt < maxMillis
  }

  /** The record in hand is not a tombstone: the thing is not gone. */
  get isPresent(): boolean { return ! VX.isTombstone(this.#central) }

  /** True where the record in hand has every field filled; false for a sparse view, as a listing's query hands back, or for a tombstone. */
  get isFull(): boolean { return this.isFullRecord(this.#central) }

  /** True where the record in hand is whole: {@link isFull}, or a tombstone; only a sparse record is not. */
  get #isWhole(): boolean { return this.isWholeRecord(this.#central) }

  /** Whether `record` is whole (full, or a tombstone), as stored in BankDB. A sparse record is not whole. */
  protected isWholeRecord(record: Fetched<RecordT, SparseT>): record is RecordT | Tombstone<SparseT> {
    return this.isTombstoneRecord(record) || this.isFullRecord(record)
  }

  /** Whether `record` is a tombstone. */
  protected isTombstoneRecord(record: Fetched<RecordT, SparseT>): record is Tombstone<SparseT> {
    return VX.isTombstone(record)
  }

  /** Throw unless this thing is enabled and its bank is unlocked. */
  demandDeletable(): this { return this.demandEnabled().demandUnlocked() }

  /** Demand that this thing's bank is unlocked. */
  demandUnlocked(): this { if (this.isLocked)    { throw needUnlocked() }                               return this }

  /** Demand that this thing answers: see {@link isEnabled}. */
  demandEnabled():  this {
    this.listing.demandEnabled()
    if (! this.listing.isListed(this)) { throw instanceDisabled() }
    return this
  }

  /** Demand that the record in hand is full. */
  demandFull():     this { if (! this.isFull)    { throw partialLoad() }                          return this }

  /** Demand that the record in hand is whole: full, or a tombstone. */
  demandWhole():    this { if (! this.#isWhole)  { throw partialLoad() }                          return this }

  /** The full record in hand. */
  protected demandFullProps(): RecordT {
    if (this.full !== null) { return this.full }
    throw partialLoad()
  }

  /** Hydrate this thing so that a delete can act on it. */
  ensureDeletable(opts: TimelyOpts = {}): Promise<this> { return this.hydrate(opts) }
  // --

  // == [Protected, for a subclass to override]: adopt, demandPresent, isFullRecord, lifeTokPathOf, makeSnapshot

  // Every adopt is followed by an align, which the snapshot is made from: an adopt left unaligned would leave it behind.
  /** Assign the props of `central`, judged against the central adopted until now, then keep it, frozen; the snapshot waits for `align`. */
  protected adopt(central: Fetched<RecordT, SparseT>): void {
    this.assign(central)
    this.#central = Object.freeze(central)
  }

  abstract demandPresent(): this

  /** Whether `fetched` is a full record, alive: a tombstone never is. */
  protected abstract isFullRecord(fetched: SparseT): fetched is RecordT
  /** The life of the thing `record` is of: the life toks that a birthday mints, joined. Two records of one scope with different paths are of different lives of it. */
  protected abstract lifeTokPathOf(record: Fetched<RecordT, SparseT>): string
  protected abstract makeSnapshot(): SnapshotT
  // --
}
