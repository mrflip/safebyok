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

/** Compare `post` with `ante` by `revision_seq`: the higher is newer.
 * Throws where they share a `revision_seq` under different `revision_tok`s.
 */
export function cmpRevisions(ante: Revision, post: Revision): Age {
  if (post.revision_seq < ante.revision_seq) { return 'older' }
  if (post.revision_seq > ante.revision_seq) { return 'newer' }
  if (post.revision_tok !== ante.revision_tok) {
    throw oneRevisionTwoToks(post)
  }
  return 'same'
}
// --

/** A listing below a thing, as {@link Storable.align} reaches it. */
export type Alignable = Readonly<{ align: () => void }>

/** A bank, gate, vault or box in this tab, kept in step with its row in the bankDB. */
export abstract class Storable<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>, SnapshotT> {
  // == [Props]: scope, listing, revision_tok, revision_seq, registered_at, written_at, #central, #snapshot, #refreshedAt, #listeners, #getSnapshot, #subscribe

  /** The listing this thing is in. It is left out of enumeration and JSON. */
  declare readonly listing: ListingOf<ScopeT, RecordT, SparseT>

  /** The revision and times of the record in hand, as own props. */
  declare revision_tok:  string
  declare revision_seq:  number
  declare registered_at: number
  declare written_at:    number

  // The scope's fields are own props too, so the thing ducks as its record; `scope` itself is a getter, kept off the duck.
  /** The scope, frozen. */
  readonly #scope: ScopeT

  /** The record in hand: the latest this device knows is stored, full, sparse or a tombstone. */
  #central: Fetched<RecordT, SparseT>
  /** The snapshot, or null until first asked for. */
  #snapshot: SnapshotT | null = null
  /** When storage last confirmed the record in hand while it was whole, or null. */
  #refreshedAt: number | null = null
  readonly #listeners = new Set<() => void>()

  /** `snapshot`, as a function safe to pass without binding. */
  readonly #getSnapshot = (): SnapshotT => this.snapshot

  /** Add `listener`, returning a function that removes it. Safe to pass without binding. */
  readonly #subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(VX.listener.parse(listener))
    return () => { this.#listeners.delete(listener) }
  }
  // --

  // == [Getters]: scope, central, full, sparse, am, toJSON, snapshot, getSnapshot, subscribe

  /** The scope this thing is stored under. */
  get scope(): ScopeT { return this.#scope }

  /** The record in hand: the latest this device knows is stored. */
  protected get central(): Fetched<RecordT, SparseT> { return this.#central }

  /** The record in hand if it is full, else null. */
  protected get full(): RecordT | null {
    return this.isFullRecord(this.#central) ? this.#central : null
  }

  /** The record in hand, in its sparse form. */
  get sparse(): SparseT { return this.listing.sparseOf(this.#central) }

  /** When this thing's record was last refreshed from the bankDB, or null if never. */
  get refreshedAt(): number | null { return this.#refreshedAt }

  /** Whether the record in hand is alive, damaged or gone. */
  get am(): Am { return this.#central.am }

  /** The {@link sparse} form of this thing, for `JSON.stringify`. */
  toJSON(): SparseT { return this.sparse }

  /** This thing's frozen snapshot: the same object until something it shows changes. */
  get snapshot(): SnapshotT {
    if (this.#snapshot === null) { this.#snapshot = this.makeSnapshot() }
    return this.#snapshot
  }

  /** A function returning {@link snapshot}, safe to pass without binding, as `useSyncExternalStore` wants. */
  get       getSnapshot(): () => SnapshotT { return this.#getSnapshot }

  /** A function that subscribes a listener to this thing's changes and returns its unsubscribe, safe to pass without binding. */
  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }
  // --

  // == [Construction]: constructor, assignInitialProps, assign

  /** Make the thing for `central`, in `listing`.
   * A subclass sets its own props in `assignInitialProps`, and needs no constructor.
   */
  constructor(listing: ListingOf<ScopeT, RecordT, SparseT>, central: Fetched<RecordT, SparseT>) {
    VX.storableArgs.parse({ listing, central })
    adorn(this, 'listing', listing)
    this.#scope = Object.freeze(listing.scopeOf(central))
    this.#central = Object.freeze(central)
    this.assignInitialProps(central)
    Object.seal(this)
  }

  /** Set the props that mirror `central`, before this instance is sealed. A subclass extends it to add its own. */
  protected assignInitialProps(central: Fetched<RecordT, SparseT>): void {
    tattoo(this, this.scope, { configurable: false })
    this.registered_at = central.registered_at
    this.assign(central)
  }

  /** Set the props that change with each revision from `record`, about to become the record in hand. */
  protected assign(record: Fetched<RecordT, SparseT>): void {
    const { revision_tok, revision_seq, written_at, registered_at } = record
    if (! this.isOfLife(record)) { this.registered_at = registered_at }
    this.revision_tok = revision_tok
    this.revision_seq = revision_seq
    this.written_at   = written_at
  }
  // --

  // == [Storable ops]: get, hydrate, del, each with its try form

  /** This thing, its record fetched unless refreshed within `maxMillisSinceRefresh`.
   * - `ifAbsent: 'fail'` -- refuse where the thing was never stored, or deleted (default)
   * - `ifAbsent: 'nil'`  -- resolve this thing there, absent
   *
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
  /** This thing, whole and refreshed within `maxMillisSinceRefresh` (default: its listing's), fetched if not.
   * An absent thing resolves too: ask {@link isPresent}.
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

  /** Delete this thing, as `asked` names it, and resolve it.
   * `asked` is a scope, or a record whose revision must be the one stored: otherwise it refuses `stale_write`.
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

  /** Adopt `record` from storage, mark this thing refreshed if it is whole, and tell the subscribers of any change. */
  receiveRecord(record: Fetched<RecordT, SparseT>): void {
    this.adopt(record)
    if (this.#isWhole) { this.#refreshedAt = nowMillis() }
    this.align()
  }

  /** Mark this thing refreshed, if the record in hand is whole: storage has just confirmed it. */
  markRefreshed(): void {
    if (this.#isWhole) { this.#refreshedAt = nowMillis() }
  }

  /** Whether `record` is of the same life as the record in hand. */
  isOfLife(record: Fetched<RecordT, SparseT>): boolean {
    return this.lifeTokPathOf(record) === this.lifeTokPathOf(this.#central)
  }

  /** The shape of the record in hand: see {@link shapeOf}. */
  get shape(): RecordShape { return this.shapeOf(this.#central) }

  /** The shape of `record`:
   * - `'gone'`   -- a tombstone
   * - `'full'`   -- a full record (`isFullRecord`)
   * - `'sparse'` -- any other
   */
  shapeOf(record: Fetched<RecordT, SparseT>): RecordShape {
    if (this.isTombstoneRecord(record)) { return 'gone' }
    if (this.isFullRecord(record))      { return 'full' }
    return 'sparse'
  }
  // --

  // == [Aligning]: align, becomeNotifiable, replaceSnapshot, tellListeners

  // The listings below first, this thing's snapshot last: a listener hears of a change once everything below shows it.
  /** Bring this thing and everything below it into line with the bank's lock and their lives, telling the subscribers of any change.
   * Never throws. A thing that no longer answers drops what it holds of secrets when aligned.
   */
  align(): void {
    for (const child of this.children) { child.align() }
    this.#replaceSnapshot()
  }

  /** Make the snapshot now, so that every later change tells the subscribers. */
  becomeNotifiable(): this {
    this.#snapshot ??= this.makeSnapshot()
    return this
  }

  /** Replace the snapshot and tell the listeners, if one was made and it changed. */
  #replaceSnapshot(): void {
    if (this.#snapshot === null) { return }
    const nextSnapshot = this.makeSnapshot()
    if (isEqual(nextSnapshot, this.#snapshot)) { return }
    this.#snapshot = nextSnapshot
    this.tellListeners()
  }

  /** Call every listener, for a change the snapshot does not show. A listener that throws does not stop the rest. */
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

  // == [Guards]: isEnabled, isLocked, isTimely, isHydratedWithin, isRefreshedWithin, isPresent, isFull, isWhole, isWholeRecord, isTombstoneRecord, demandDeletable, demandUnlocked, demandEnabled, demandFull, demandWhole, demandFullProps, ensureDeletable

  /** Whether its listing is enabled and still lists this instance at its scope. */
  get isEnabled(): boolean { return this.listing.isEnabled && this.listing.isListed(this) }

  /** Whether this thing's bank is locked. */
  protected abstract get isLocked(): boolean

  /** Whether the record in hand was refreshed within its listing's `maxMillisSinceRefresh`. False until storage has answered. */
  get isTimely(): boolean { return this.#isRefreshedWithin(this.listing.maxMillisSinceRefresh) }

  /** Whether the record in hand is whole, and was refreshed within `maxMillis`. */
  isHydratedWithin(maxMillis: number): boolean { return this.#isWhole && this.#isRefreshedWithin(maxMillis) }

  #isRefreshedWithin(maxMillis: number): boolean {
    return this.#refreshedAt !== null && nowMillis() - this.#refreshedAt < maxMillis
  }

  /** Whether the record in hand is not a tombstone. */
  get isPresent(): boolean { return ! VX.isTombstone(this.#central) }

  /** Whether the record in hand is full. False for a tombstone, and for the sparse record a listing returns. */
  get isFull(): boolean { return this.isFullRecord(this.#central) }

  /** Whether the record in hand is full or a tombstone. */
  get #isWhole(): boolean { return this.isWholeRecord(this.#central) }

  /** Whether `record` is whole: full, or a tombstone. */
  protected isWholeRecord(record: Fetched<RecordT, SparseT>): record is RecordT | Tombstone<SparseT> {
    return this.isTombstoneRecord(record) || this.isFullRecord(record)
  }

  /** Whether `record` is a tombstone. */
  protected isTombstoneRecord(record: Fetched<RecordT, SparseT>): record is Tombstone<SparseT> {
    return VX.isTombstone(record)
  }

  /** Throw unless {@link isEnabled} and unlocked. */
  demandDeletable(): this { return this.demandEnabled().demandUnlocked() }

  /** Demand that this thing's bank is unlocked. */
  demandUnlocked(): this { if (this.isLocked)    { throw needUnlocked() }                               return this }

  /** Throw unless {@link isEnabled}. */
  demandEnabled():  this { if (! this.isEnabled) { throw instanceDisabled() }                     return this }

  /** Demand that the record in hand is full. */
  demandFull():     this { if (! this.isFull)    { throw partialLoad() }                          return this }

  /** Demand that the record in hand is whole: full, or a tombstone. */
  demandWhole():    this { if (! this.#isWhole)  { throw partialLoad() }                          return this }

  /** The record in hand, throwing unless it is full. */
  protected demandFullProps(): RecordT {
    if (this.full !== null) { return this.full }
    throw partialLoad()
  }

  /** Hydrate this thing so that a delete can act on it. */
  ensureDeletable(opts: TimelyOpts = {}): Promise<this> { return this.hydrate(opts) }
  // --

  // == [Protected, for a subclass to override]: adopt, children, demandPresent, isFullRecord, lifeTokPathOf, makeSnapshot

  // Every adopt is followed by an align, which the snapshot is made from: an adopt left unaligned would leave it behind.
  /** Make `central` the record in hand, frozen, and set the props from it. The snapshot waits for {@link align}. */
  protected adopt(central: Fetched<RecordT, SparseT>): void {
    this.assign(central)
    this.#central = Object.freeze(central)
  }

  /** The listings below this thing, which `align` aligns too. */
  protected abstract get children(): readonly Alignable[]

  /** Throw unless `isPresent`. */
  abstract demandPresent(): this

  /** Whether `fetched` is a full, live record. */
  protected abstract isFullRecord(fetched: SparseT): fetched is RecordT
  /** The life of `record`: the life toks minted at its birth, joined. Records of one scope are of one life only if these match. */
  protected abstract lifeTokPathOf(record: Fetched<RecordT, SparseT>): string
  protected abstract makeSnapshot(): SnapshotT
  // --
}
