import { isEqual } from 'es-toolkit'
import { nowMillis } from '../helpers/clock'
import * as Phrases from '../helpers/phrases'
import { verifyConsistent } from '../helpers/validator'
import { adorn, tattoo } from '../helpers/helpers'
import { type WhisperedBag, isWhisperedBag } from '../helpers/consts'
import { type Outcome, outcomeOf } from '../refusals/outcome'
import { reportToPlatform } from '../refusals/report-error'
import { disabledError, lockedError, oneRevisionTwoFates, oneRevisionTwoLives, oneRevisionTwoToks, otherVaultTok, partialLoadError, shapeUnreconciled } from '../refusals/throwers'
import type { Age, Am, RecordShape } from '../shapes/shapes-enums'
import * as VX from '../shapes/shapes-vaultish'
import type { Fetched, FetchOpts, ListingOf, ListingWorld, Reconciled, Aligned, SparseBase, TimelyOpts, Tombstone } from '../shapes/shapes-vaultish'
import * as SX from '../shapes/shapes-storage'
import type { Revision } from '../shapes/shapes-storage'

// == [Revisions]: cmpRevisions

/** How `post` compares to `ante`: the later `revision_seq` is newer. The same seq under another `revision_tok` is two puts written as one revision. */
export const cmpRevisions = (ante: Revision, post: Revision): Age => {
  if (post.revision_seq < ante.revision_seq) { return 'older' }
  if (post.revision_seq > ante.revision_seq) { return 'newer' }
  if (post.revision_tok !== ante.revision_tok) {
    throw oneRevisionTwoToks()
  }
  return 'same'
}
// --

/** A vault or box in this tab, kept in step with its row in the vaultDB. */
export abstract class Storable<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>, SnapshotT> {
  // == [Props]: scope, world, listing, vault_tok, revision_tok, revision_seq, registered_at, written_at, #isEnabled, #central, #snapshot, #refreshedAt, #listeners, #getSnapshot, #subscribe, isFUBag

  /** Adorned in the constructor: readable, left out of enumeration and JSON. */
  declare readonly world:   ListingWorld
  declare readonly listing: ListingOf<ScopeT, RecordT, SparseT>

  /** The vault this thing lies in, inscribed once by `assignInitialProps` and never moved. */
  declare readonly vault_tok: string
  /** The revision and times of the record in hand, as plain own props, assigned before the seal by `assignInitialProps` and again by `assign` at each adopt: `registered_at` only at birth and for a record of another life. */
  declare revision_tok:  string
  declare revision_seq:  number
  declare registered_at: number
  declare written_at:    number

  /** The scope, set once and frozen: the listing keys and watches by it, and the verbs name it. Its props are also tattooed on, so the thing ducks as its record; a getter keeps `scope` itself off the duck. */
  readonly #scope: ScopeT

  /** Set by a sweep or a vacate, and never cleared. */
  #isEnabled = true

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

  /** True for what a box answers for a whisper it will not show, or a copy of it: anything carrying the `Whispered` mark. */
  static isFUBag(val: unknown): val is WhisperedBag { return isWhisperedBag(val) }
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

  /** When this thing's record was last refreshed from the vaultDB, or null where it never was. */
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
  constructor(world: ListingWorld, listing: ListingOf<ScopeT, RecordT, SparseT>, central: Fetched<RecordT, SparseT>) {
    VX.storableArgs.parse({ world, listing, central })
    adorn(this, 'world', world)
    adorn(this, 'listing', listing)
    this.#scope = Object.freeze(listing.scopeOf(central))
    this.#central = Object.freeze(central)
    this.assignInitialProps(central)
    this.align()
    Object.seal(this)
  }

  /** SLOPDOC: Inscribes the own props before the seal; a subclass adds its own the same way, never as #fields. */
  protected assignInitialProps(central: Fetched<RecordT, SparseT>): void {
    tattoo(this, { ...this.scope, vault_tok: central.vault_tok }, { configurable: false })
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

  // == [Storable ops]: fetch, hydrate, del, each with its try form

  /** SLOPDOC: Refreshes this thing from storage through the listing, which joins any fetch of its slot under way. */
  async fetch(opts: FetchOpts = {}): Promise<this> {
    const { ifAbsent, maxWorldMillis } = VX.fetchOpts.parse(opts)
    await this.listing.ensureTimelyWorld(maxWorldMillis)
    this.demandEnabled()
    await this.listing.fetch(this.scope, { ifAbsent: 'nil' })
    this.demandEnabled()
    if (ifAbsent === 'fail') { this.demandPresent() }
    return this
  }

  /** Non-throwing form of {@link fetch}. */
  tryFetch(opts: FetchOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.fetch(opts)) }

  /** This thing, its world timely and its record fetched unless timely within `opts.maxMillisSinceRefresh`. */
  async hydrate(opts: TimelyOpts = {}): Promise<this> {
    const { maxMillisSinceRefresh = this.listing.maxMillisSinceRefresh, maxWorldMillis } = VX.timelyOpts.parse(opts)
    await this.listing.ensureTimelyWorld(maxWorldMillis)
    if (this.isHydratedWithin(maxMillisSinceRefresh)) { return this }
    return this.fetch({ ifAbsent: 'nil' })
  }

  /** Non-throwing form of {@link hydrate}. */
  tryHydrate(opts: TimelyOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.hydrate(opts)) }

  /** Delete, via its listing -- the asked-for record must be consistent with the listed one
   * refuses `stale_write` if the record changes between the hydration here and the delete transaction.
   */
  async del(asked: ScopeT | SparseT, opts: TimelyOpts = {}): Promise<this> {
    const scope = this.listing.scopeOf(asked)
    const pins = { ...SX.reqParams.parse(asked), ...scope }
    const { maxMillisSinceRefresh, maxWorldMillis } = VX.timelyOpts.parse(opts)
    await this.ensureDeletable({ maxMillisSinceRefresh, maxWorldMillis }); this.demandDeletable()
    verifyConsistent(this.sparse, pins, { kind: 'stale_write', message: Phrases.DelOfOtherRevision })
    await this.listing.del(this.sparse)
    return this
  }

  /** Non-throwing form of {@link del}. */
  tryDel(asked: ScopeT | SparseT, opts: TimelyOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.del(asked, opts)) }
  // --

  // == [Receiving]: receive, tombstoneFor

  /** SLOPDOC: Receives what storage said: judges it against the record in hand, then adopts and aligns it. */
  receive(rcvd: Fetched<RecordT, SparseT> | null): Aligned {
    if (! this.#isEnabled) { return { badnews: [] } }
    const answer = rcvd ?? this.tombstoneFor(this.#central)
    const { central, policy } = this.reconcileCentral(answer, this.classifyRecordShape(answer))
    const isAdopting = central !== this.#central
    if (isAdopting) { this.adopt(central) }
    if ((policy !== 'older') && this.#isWhole) { this.#refreshedAt = nowMillis() }
    return isAdopting ? this.align() : { badnews: [] }
  }

  /** A tombstone made here, from the sparse props in hand, under `revision`, written now. */
  protected tombstoneFor(revision: Revision): Tombstone<SparseT> {
    const { revision_tok, revision_seq } = revision
    return { ...this.sparse, revision_tok, revision_seq, written_at: nowMillis(), am: 'x' }
  }
  // --

  // == [Reconcile]: reconcileCentral, sameLife, classifyRecordShape

  /** SLOPDOC: Judges `rcvd` against the central adopted, answering the central that results and the policy applied. */
  protected reconcileCentral(rcvd: Fetched<RecordT, SparseT>, rcvdShape: RecordShape): Reconciled<RecordT, SparseT> {
    // The vault_tok first, whatever the life: a joined life tok path cannot tell 'a-b' + 'c' from 'a' + 'b-c'.
    if ((rcvd.vault_tok !== this.vault_tok))                     { throw otherVaultTok() }
    const central = this.#central
    const age = cmpRevisions(central, rcvd)
    if ((age === 'same') && (! this.#sameLife(rcvd)))            { throw oneRevisionTwoLives() }
    const centralShape = this.classifyRecordShape(central)
    if ((age === 'older'))                                       { return { central, policy: 'older' } }
    if ((age === 'same')) {
      if ((rcvdShape !== 'gone') && (centralShape === 'gone'))   { throw oneRevisionTwoFates() }
      if ((rcvdShape === 'gone') && (centralShape !== 'gone'))   { throw oneRevisionTwoFates() }
      if ((rcvdShape === 'gone') && (centralShape === 'gone'))   { return { central, policy: 'same' } }
      if ((rcvdShape === 'sparse'))                              { return { central, policy: 'same' } }
      if ((rcvdShape === 'full') && (centralShape === 'full'))   { return { central, policy: 'same' } }
      if ((rcvdShape === 'full') && (centralShape === 'sparse')) { return { central: rcvd, policy: 'fill' } }
    } else {
      if (rcvdShape === 'gone') { return { central: rcvd, policy: 'gone' } }
      return { central: rcvd, policy: 'adopt' }
    }
    throw shapeUnreconciled()
  }

  /** Whether `record` is of the life of the central adopted: the same `lifeTokPathOf`. */
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

  // == [Aligning]: align, becomeNotifiable, replaceSnapshot, tellListeners

  /** SLOPDOC: Brings the snapshot up to the state just adopted, notifying the subscribers where it changed. */
  align(): Aligned {
    this.#replaceSnapshot()
    return { badnews: [] }
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

  // == [Discards]: lock, sweep, vacate, disable

  /** Tell the listeners the lock has moved. A no-op past a discard; never throws. */
  lock(): this {
    if (this.#isEnabled) { this.align() }
    return this
  }

  /** Drop what this instance has of secrets, leave what this device has cached, and answer nothing from here on, delisted. A repeat is a no-op. Never throws. */
  sweep(): this { return this.#disable(() => { this.sweepContents() }) }

  /** As `sweep`, and what this device has cached of it goes too. Storage is untouched. A repeat is a no-op. Never throws. */
  vacate(): this { return this.#disable(() => { this.vacateContents() }) }

  // Marked first, so that a repeat met on the way finds the work done.
  #disable(dropContents: () => void): this {
    if (! this.#isEnabled) { return this }
    this.#isEnabled = false
    dropContents()
    this.listing.delist(this)
    this.align()
    return this
  }
  // --

  // == [Guards]: isEnabled, isLocked, isTimely, isHydratedWithin, isRefreshedWithin, isPresent, isFull, isWhole, isWholeRecord, isTombstoneRecord, demandDeletable, demandUnlocked, demandEnabled, demandFull, demandWhole, demandFullProps, ensureDeletable

  /** False past a sweep or a vacate, and from then on. */
  get isEnabled(): boolean { return this.#isEnabled }

  /** Whether this thing's vault is locked, read live. */
  abstract get isLocked(): boolean

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

  /** Whether `record` is whole (full, or a tombstone), as stored in VaultDB. A sparse record is not whole. */
  protected isWholeRecord(record: Fetched<RecordT, SparseT>): record is RecordT | Tombstone<SparseT> {
    return this.isTombstoneRecord(record) || this.isFullRecord(record)
  }

  /** Whether `record` is a tombstone. */
  protected isTombstoneRecord(record: Fetched<RecordT, SparseT>): record is Tombstone<SparseT> {
    return VX.isTombstone(record)
  }

  /** A delete needs the thing enabled and the vault unlocked, and no more: a thing gone is deleted again. */
  demandDeletable(): this { return this.demandEnabled().demandUnlocked() }

  /** Demand that this thing's vault is unlocked. */
  demandUnlocked(): this { if (this.isLocked)    { throw lockedError() }                               return this }

  /** Demand that this thing is still enabled. */
  demandEnabled():  this { if (! this.#isEnabled) { throw disabledError() }                            return this }

  /** Demand that the record in hand is full. */
  demandFull():     this { if (! this.isFull)    { throw partialLoadError() }                          return this }

  /** Demand that the record in hand is whole: full, or a tombstone. */
  demandWhole():    this { if (! this.#isWhole)  { throw partialLoadError() }                          return this }

  /** The full record in hand. */
  protected demandFullProps(): RecordT {
    if (this.full !== null) { return this.full }
    throw partialLoadError()
  }

  /** Hydrate this thing so that a delete can act on it. */
  ensureDeletable(opts: TimelyOpts = {}): Promise<this> { return this.hydrate(opts) }
  // --

  // == [Protected, for a subclass to override]: adopt, sweepContents, vacateContents, demandPresent, isFullRecord, lifeTokPathOf, makeSnapshot

  // Every adopt is followed by an align, which the snapshot is made from: an adopt left unaligned would leave it behind.
  /** Assign the props of `central`, judged against the central adopted until now, then keep it, frozen; the snapshot waits for `align`. */
  protected adopt(central: Fetched<RecordT, SparseT>): void {
    this.assign(central)
    this.#central = Object.freeze(central)
  }

  protected sweepContents(): void { /* a thing of no contents has none to drop */ }

  protected vacateContents(): void { /* a thing of no contents has none to drop */ }

  abstract demandPresent(): this

  /** Whether `fetched` is a full record, alive: a tombstone never is. */
  protected abstract isFullRecord(fetched: SparseT): fetched is RecordT
  /** The life of the thing `record` is of: the life toks that a birthday mints, joined. Two records of one scope with different paths are of different lives of it. */
  protected abstract lifeTokPathOf(record: Fetched<RecordT, SparseT>): string
  protected abstract makeSnapshot(): SnapshotT
  // --
}
