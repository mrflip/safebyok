import { VaultError } from '../errors'
import { adorn, tattoo } from '../helpers'
import { type Outcome, outcomeOf } from '../outcome'
import { oneAtATime } from '../one-at-a-time'
import { reportToPlatform } from '../report-error'
import { stableJsonify } from '../stable-jsonify'
import { disabledError, lockedError, partialLoadError } from '../helpers/throwers'
import * as Phrases from '../phrases'
import type { Listing } from './listing'
import type { Age, Am, Fetched, FetchOpts, Reconciled, RecordShape, Revision, Settled, SparseBase, StorableOpts, TimelyOpts, Tombstone, World } from './models-shapes'
import * as MSX from './models-shapes'

// == [Revisions]: cmpRevisions

/** How `post` compares to `ante`: the later `revision_seq` is newer. The same seq under another `revision_tok` is two puts landed as one revision. */
export const cmpRevisions = (ante: Revision, post: Revision): Age => {
  if (post.revision_seq < ante.revision_seq) { return 'older' }
  if (post.revision_seq > ante.revision_seq) { return 'newer' }
  if (post.revision_tok !== ante.revision_tok) {
    throw new VaultError('record_conflict', Phrases.OneRevisionTwoToks)
  }
  return 'same'
}
// --

// == [Storable]

/** The listing a storable is made in, as it sees it: its own kind of thing, whatever snapshot the concrete class makes. */
export type ListingOf<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>> =
  Listing<ScopeT, RecordT, SparseT, unknown, Storable<ScopeT, RecordT, SparseT, unknown>>

export abstract class Storable<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>, SnapshotT> {
  // == [Declarations]: scope, world, listing, vault_tok, revision_tok, revision_seq, registered_at, written_at, central, snapshot, horizonMillis, refreshedAt, listeners

  /** The scope, held once and frozen: the listing keys and watches by it, and the verbs name it. Its props are also tattooed on, so the thing ducks as its record; a getter keeps `scope` itself off the duck. */
  readonly #scope: ScopeT

  /** Adorned in the constructor: readable, left out of enumeration and JSON. */
  declare readonly world:   World
  declare readonly listing: ListingOf<ScopeT, RecordT, SparseT>

  /** The vault this thing lies in, inscribed once by `assignInitialProps` and never moved. */
  declare readonly vault_tok: string
  /** The revision and times of the record in hand, as plain own props, assigned before the seal by `assignInitialProps` and again by `assign` at each adopt: `registered_at` only at birth and for a record of another life. */
  declare revision_tok:  string
  declare revision_seq:  number
  declare registered_at: number
  declare written_at:    number

  /** Set by a sweep, a vacate or a delete, and never cleared. */
  #isEnabled = true

  /** The latest record this device knows storage holds: full, sparse or a tombstone, void on a new instance. */
  #central: Fetched<RecordT, SparseT>
  /** Made when `snapshot` is first asked for, and again by each `settle` once one exists. */
  #snapshot: SnapshotT | null = null
  /** How long after its last refresh the record in hand stays timely, where a caller names no age of its own. */
  readonly #horizonMillis: number
  /** When storage last answered with a record not older than central that left the record in hand whole; null until it has. */
  #refreshedAt: number | null = null
  /** The fetch under way, which every `fetch` made meanwhile joins. */
  readonly #oneFetchAtATime = oneAtATime(() => this.listing.fetch(this.scope, { ifAbsent: 'nil' }))
  readonly #listeners = new Set<() => void>()
  // --

  // == [Statics]: isLockedFUBag

  /** True for {@link MSX.LOCKED}, the bag a storable answers in place of what the locked vault hides, and for nothing else: not a copy of it, nor any bag a host builds, nor `Symbol.for('LOCKED')`. */
  static isLockedFUBag(val: unknown): val is MSX.LockedBag { return val === MSX.LOCKED }
  // --

  // == [Constructor]: constructor, assignInitialProps, assign

  /** A concrete class inscribes its own props in `assignInitialProps`; it needs no constructor. */
  constructor(world: World, listing: ListingOf<ScopeT, RecordT, SparseT>, central: Fetched<RecordT, SparseT>, opts: StorableOpts) {
    MSX.storableArgs.parse({ world, listing, central, opts })
    this.#horizonMillis = opts.maxMillisSinceRefresh
    adorn(this, 'world', world)
    adorn(this, 'listing', listing)
    this.#scope = Object.freeze(listing.scopeOf(central))
    this.#central = Object.freeze(central)
    this.assignInitialProps(central)
    this.settle()
    Object.seal(this)
  }

  /** SLOPDOC: Inscribes the own props before the seal; a subclass adds its own the same way, never as #fields. */
  protected assignInitialProps(central: Fetched<RecordT, SparseT>): void {
    tattoo(this, { ...this.scope, vault_tok: central.vault_tok }, { writable: false, configurable: false })
    this.registered_at = central.registered_at
    this.assign(central)
  }

  /** SLOPDOC: Assigns the mutable own props from the record about to be in hand; a subclass adds its own from it. */
  protected assign(record: Fetched<RecordT, SparseT>): void {
    const { revision_tok, revision_seq, written_at, registered_at } = record
    if (! this.#sameLife(record)) { this.registered_at = registered_at }
    this.revision_tok = revision_tok
    this.revision_seq = revision_seq
    this.written_at   = written_at
  }
  // --

  // == [Forms]: scope, central, full, sparse, am, toJSON

  get scope(): ScopeT { return this.#scope }

  /** The most recent view of the stored record. */
  protected get central(): Fetched<RecordT, SparseT> { return this.#central }

  /** The record in hand where it is the full record, else null. */
  protected get full(): RecordT | null {
    return this.isFullRecord(this.#central) ? this.#central : null
  }

  /** The sparse form of central: everything but what only the full record carries. */
  get sparse(): SparseT { return this.listing.sparseOf(this.#central) }

  get am(): Am { return this.#central.am }

  toJSON(): SparseT { return this.sparse }
  // --

  // == [States]: isTimely, isLocked, isPresent, isFull, isWhole, isWholeRecord, isTombstoneRecord

  /** Whether the record in hand was refreshed within the thing's horizon: never before storage has answered. */
  get isTimely(): boolean { return this.#isRefreshedWithin(this.#horizonMillis) }

  #isRefreshedWithin(maxMillis: number): boolean {
    return this.#refreshedAt !== null && this.world.clock.now() - this.#refreshedAt < maxMillis
  }

  get isLocked(): boolean { return this.listing.lockState() === 'locked' }

  /** The record in hand is not a tombstone: the thing is not gone. */
  get isPresent(): boolean { return ! MSX.isTombstone(this.#central) }

  /** True where the record in hand has every field filled; false for a sparse view, as a listing's query hands back, or for a tombstone. */
  get isFull(): boolean { return this.isFullRecord(this.#central) }

  /** True where the record in hand is whole: {@link isFull}, or a tombstone; only a sparse record is not. */
  get #isWhole(): boolean { return this.isWholeRecord(this.#central) }

  /** Whether `record` is whole, as storage would hand it back complete: full, or a tombstone. A sparse record is not. */
  protected isWholeRecord(record: Fetched<RecordT, SparseT>): record is RecordT | Tombstone<SparseT> {
    return this.isTombstoneRecord(record) || this.isFullRecord(record)
  }

  /** Whether `record` is a tombstone. */
  protected isTombstoneRecord(record: Fetched<RecordT, SparseT>): record is Tombstone<SparseT> {
    return MSX.isTombstone(record)
  }
  // --

  // == [Snapshot and subscription]: snapshot, getSnapshot, subscribe, becomeNotifiable

  /** Direct public access to the snapshot */
  get snapshot(): SnapshotT {
    if (this.#snapshot === null) { this.#snapshot = this.makeSnapshot() }
    return this.#snapshot
  }
  /** Public access to the unbound "hand over yer snapshot" callback */
  get       getSnapshot(): () => SnapshotT { return this.#getSnapshot }
  /** Unbound callback to acquire the snapshot */
  readonly #getSnapshot = (): SnapshotT => this.snapshot

  /** Public access to the unbound "make me a subscriber" callback */
  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }
  /** Unbound callback to enroll the given listener for push notifications
   * Invoke the returned unsubscribe function to unenroll the listener
   */
  readonly #subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(MSX.listener.parse(listener))
    return () => { this.#listeners.delete(listener) }
  }

  /** Make the snapshot now, if not yet made, so that each change from here on notifies the subscribers: until then there is none to replace. */
  becomeNotifiable(): this {
    this.#snapshot ??= this.makeSnapshot()
    return this
  }

  /** Replace the snapshot with a new one, and notify all listeners. Until `snapshot` is first asked for there is none to replace: that ask makes it. */
  #replaceSnapshot(): void {
    if (this.#snapshot === null) { return }
    const nextSnapshot = this.makeSnapshot()
    if (this.sameSnapshot(nextSnapshot, this.#snapshot)) { return }
    this.#snapshot = nextSnapshot
    this.#listeners.forEach((listener) => {
      try {
        listener()
      } catch (err) {
        reportToPlatform(err)
      }
    })
  }
  /** Compare two snapshots for equality: notifications are not sent if old and new are the same */
  protected sameSnapshot(next: SnapshotT, current: SnapshotT): boolean {
    return stableJsonify(next) === stableJsonify(current)
  }
  // --

  // == [Guards]: isEnabled, demandEnabled, demandUnlocked, demandPresent, demandFull, demandWhole, demandFullProps, ensureDeletable, demandDeletable

  /** False past a sweep, a vacate or a delete, and from then on. */
  get isEnabled(): boolean { return this.#isEnabled }

  demandEnabled():  this { this.#demandInstanceEnabled();                                                     return this }

  demandUnlocked(): this { if (this.isLocked)    { throw lockedError() }                               return this }

  demandFull():     this { if (! this.isFull)    { throw partialLoadError() }                          return this }

  demandWhole():    this { if (! this.#isWhole)  { throw partialLoadError() }                          return this }

  // Not `demandEnabled`, which a Vault widens to refuse a vault gone: a fetch is how a thing gone hears its slot has moved on.
  #demandInstanceEnabled(): void { if (! this.#isEnabled) { throw disabledError() } }

  /** The full record in hand. */
  protected demandFullProps(): RecordT {
    if (this.full !== null) { return this.full }
    throw partialLoadError()
  }

  ensureDeletable(opts: TimelyOpts = {}): Promise<this> { return this.hydrate(opts) }

  /** A delete needs the thing enabled and the vault unlocked, and no more: a thing gone is deleted again. */
  demandDeletable(): this { return this.demandEnabled().demandUnlocked() }
  // --

  // == [Storable ops]: fetch, hydrate, del, each with its try form

  /** SLOPDOC: Refreshes this thing from storage through the listing, joining any fetch under way. */
  async fetch(opts: FetchOpts = {}): Promise<this> {
    const { ifAbsent = 'fail', maxWorldMillis } = MSX.fetchOpts.parse(opts)
    await this.listing.ensureTimelyWorld(maxWorldMillis)
    this.#demandInstanceEnabled()
    await this.#oneFetchAtATime()
    this.#demandInstanceEnabled()
    if (ifAbsent === 'fail') { this.demandPresent() }
    return this
  }

  tryFetch(opts: FetchOpts = {}): Promise<Outcome<this>> {
    return outcomeOf(() => this.fetch(opts))
  }

  /** This thing, its world timely and its record fetched unless timely within `opts.maxMillisSinceRefresh`. */
  async hydrate(opts: TimelyOpts = {}): Promise<this> {
    const { maxMillisSinceRefresh = this.#horizonMillis, maxWorldMillis } = MSX.timelyOpts.parse(opts)
    await this.listing.ensureTimelyWorld(maxWorldMillis)
    if (this.#isWhole && this.#isRefreshedWithin(maxMillisSinceRefresh)) { return this }
    return this.fetch({ ifAbsent: 'nil' })
  }

  tryHydrate(opts: TimelyOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.hydrate(opts)) }

  /** Delete this thing through its listing. A thing gone is deleted again, over its tombstone's revision. */
  async del(opts: TimelyOpts = {}): Promise<this> {
    await this.ensureDeletable(MSX.timelyOpts.parse(opts)); this.demandDeletable()
    await this.listing.del(this)
    return this
  }

  tryDel(opts: TimelyOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.del(opts)) }
  // --

  // == [Discards]: lock, sweep, vacate, sweepContents, vacateContents, disable

  /** Tell the listeners the lock has moved. A no-op past a discard; never throws. */
  lock(): this {
    if (this.#isEnabled) { this.settle() }
    return this
  }

  /** Drop what this instance holds of secrets, leave what this device has cached, and answer nothing from here on, unlisted. A repeat is a no-op. Never throws. */
  sweep(): this { return this.#disable(() => { this.sweepContents() }) }

  /** As `sweep`, and what this device has cached of it goes too. Storage is untouched. A repeat is a no-op. Never throws. */
  vacate(): this { return this.#disable(() => { this.vacateContents() }) }

  protected sweepContents(): void { /* a thing of no contents has none to drop */ }

  protected vacateContents(): void { /* a thing of no contents has none to drop */ }

  // Marked first, so that a repeat met on the way finds the work done.
  #disable(dropContents: () => void): this {
    if (! this.#isEnabled) { return this }
    this.#isEnabled = false
    dropContents()
    this.listing.unlist(this)
    this.settle()
    return this
  }
  // --

  // == [Receiving]: receive, adopt, settle, tombstoneFor

  /** SLOPDOC: Takes in what storage said: judges it against the record in hand, adopts and settles what it takes. */
  receive(rcvd: Fetched<RecordT, SparseT> | null): Settled {
    if (! this.#isEnabled) { return { badnews: [] } }
    const answer = rcvd ?? this.tombstoneFor(this.#central)
    const { central, policy } = this.reconcileCentral(answer, this.classifyRecordShape(answer))
    const isTaken = central !== this.#central
    if (isTaken) { this.adopt(central) }
    if ((policy !== 'older') && this.#isWhole) { this.#refreshedAt = this.world.clock.now() }
    return isTaken ? this.settle() : { badnews: [] }
  }

  // Every adopt is followed by a settle, which the snapshot is made from: an adopt left unsettled would leave it behind.
  /** Assign the props of `central`, judged against the central held until now, then hold it, frozen; the snapshot waits for `settle`. */
  protected adopt(central: Fetched<RecordT, SparseT>): void {
    this.assign(central)
    this.#central = Object.freeze(central)
  }

  /** SLOPDOC: Brings the snapshot up to the state just adopted, notifying the subscribers where it changed. */
  settle(): Settled {
    this.#replaceSnapshot()
    return { badnews: [] }
  }

  /** A tombstone made here, from the sparse props held, under `revision`, written now. */
  protected tombstoneFor(revision: Revision): Tombstone<SparseT> {
    const { revision_tok, revision_seq } = revision
    return { ...this.sparse, revision_tok, revision_seq, written_at: this.world.clock.now(), am: 'x' }
  }
  // --

  // == [Reconcile]: reconcileCentral, sameLife, classifyRecordShape

  /** SLOPDOC: Judges `rcvd` against the central held, answering the central that results and the policy applied. */
  protected reconcileCentral(rcvd: Fetched<RecordT, SparseT>, rcvdShape: RecordShape): Reconciled<RecordT, SparseT> { // eslint-disable-line sonarjs/cognitive-complexity
    // The vault_tok first, whatever the life: a joined life tok path cannot tell 'a-b' + 'c' from 'a' + 'b-c'.
    if ((rcvd.vault_tok !== this.vault_tok))                     { throw new VaultError('unexpected_error', Phrases.OtherVaultTok) }
    const central = this.#central
    const age = cmpRevisions(central, rcvd)
    if ((age === 'same') && (! this.#sameLife(rcvd)))            { throw new VaultError('record_conflict', Phrases.OneRevisionTwoLives) }
    const centralShape = this.classifyRecordShape(central)
    if ((age === 'older'))                                       { return { central, policy: 'older' } }
    if ((age === 'same')) {
      if ((rcvdShape !== 'gone') && (centralShape === 'gone'))   { throw new VaultError('record_conflict', Phrases.OneRevisionTwoFates) }
      if ((rcvdShape === 'gone') && (centralShape !== 'gone'))   { throw new VaultError('record_conflict', Phrases.OneRevisionTwoFates) }
      if ((rcvdShape === 'gone') && (centralShape === 'gone'))   { return { central, policy: 'same' } }
      if ((rcvdShape === 'sparse'))                              { return { central, policy: 'same' } }
      if ((rcvdShape === 'full') && (centralShape === 'full'))   { return { central, policy: 'same' } }
      if ((rcvdShape === 'full') && (centralShape === 'sparse')) { return { central: rcvd, policy: 'fill' } }
    } else {
      if (rcvdShape === 'gone') { return { central: rcvd, policy: 'gone' } }
      return { central: rcvd, policy: 'adopt' }
    }
    throw new VaultError('unexpected_error', Phrases.ShapeUnreconciled)
  }

  /** Whether `record` is of the life of the central held: the same {@link lifeTokPathOf}. */
  #sameLife(record: Fetched<RecordT, SparseT>): boolean {
    return this.lifeTokPathOf(record) === this.lifeTokPathOf(this.#central)
  }

  /** The shape of `record`: 'gone' for a tombstone, 'full' for a record `isFullRecord` accepts, 'sparse' for any other. */
  protected classifyRecordShape(record: Fetched<RecordT, SparseT>): RecordShape {
    if (this.isTombstoneRecord(record)) { return 'gone' }
    if (this.isFullRecord(record))      { return 'full' }
    return 'sparse'
  }
  // --

  // == [Concrete Subclass Required Methods]: demandPresent, isFullRecord, lifeTokPathOf, makeSnapshot

  abstract demandPresent(): this

  /** Whether `fetched` is a full record, alive: a tombstone never is. */
  protected abstract isFullRecord(fetched: SparseT): fetched is RecordT
  /** The life of the thing `record` is of: the life toks that a birthday mints, joined. Two records of one scope with different paths are of different lives of it. */
  protected abstract lifeTokPathOf(record: Fetched<RecordT, SparseT>): string
  protected abstract makeSnapshot(): SnapshotT
  // --
}
// --
