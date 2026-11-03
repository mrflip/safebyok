import { VaultError } from '../errors'
import { adorn, tattoo } from '../helpers'
import { type Outcome, outcomeOf } from '../outcome'
import { oneAtATime } from '../one-at-a-time'
import { stableJsonify } from '../stable-jsonify'
import { lockedError, partialLoadError } from '../helpers/throwers'
import * as Phrases from '../phrases'
import { Trigger } from '../helpers/trigger'
import type { Listing } from './listing'
import type { Age, Am, Fetched, FetchOpts, Reconciled, RecordShape, Revision, Settled, SparseBase, StorableOpts, TimelyOpts, Tombstone, World } from './models-shapes'
import * as MSX from './models-shapes'

// == [Revisions]: cmpRevisions

/** How `post` compares to `ante`: the later `revision_seq` is newer. The same seq under another `revision_tok` is two puts landed as one revision, refused 'record_conflict'. */
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
  // == [Declarations]: scope, world, listing, vault_tok, revision_tok, revision_seq, registered_at, written_at, central, snapshot, trigger, listeners, watchable

  /** The scope, held once and frozen: the listing keys and watches by it, and the verbs name it. Its props are also tattooed on, so the thing ducks as its record; a getter keeps `scope` itself off the duck. */
  readonly #scope: ScopeT

  /** Adorned in the constructor: readable, left out of enumeration and JSON. */
  declare readonly world:   World
  declare readonly listing: ListingOf<ScopeT, RecordT, SparseT>

  /** The vault this thing lies in, inscribed once by `assignInitialProps` and never moved: a record under another `vault_tok` is refused, not taken. */
  declare readonly vault_tok: string
  /** The revision and times of the record in hand, as plain own props, assigned before the seal by `assignInitialProps` and again by `assign` at each adopt: `registered_at` only at birth and for a record of another life. */
  declare revision_tok:  string
  declare revision_seq:  number
  declare registered_at: number
  declare written_at:    number

  /** The latest record this device knows storage holds: full, sparse, or a tombstone. A thing never stored is born with a tombstone at NeverStoredSeq. */
  #central: Fetched<RecordT, SparseT>
  /** Made when `snapshot` is first asked for, and again by each `settle` once one exists. */
  #snapshot: SnapshotT | null = null
  readonly #trigger: Trigger<this>
  /** The fetch under way, which every `fetch` made meanwhile joins, resolving whether storage held a record. */
  readonly #oneFetchAtATime = oneAtATime(() => this.doFetch())
  readonly #listeners = new Set<() => void>()
  /** Whether the listing's watch should push full records for this thing: true until set otherwise. */
  #watchable = true
  // --

  // == [Statics]: isLockedFUBag

  /** True for {@link MSX.LOCKED}, the bag a storable answers in place of what the locked vault hides, and for nothing else: not a copy of it, nor any bag a host builds, nor `Symbol.for('LOCKED')`. */
  static isLockedFUBag(val: unknown): val is MSX.LockedBag { return val === MSX.LOCKED }
  // --

  // == [Constructor]: constructor, assignInitialProps, assign

  /** A refresh its timer launched that was refused is bad news, told to `listing.tellBadNews`. A concrete class inscribes its own props in `assignInitialProps`; it needs no constructor. */
  constructor(world: World, listing: ListingOf<ScopeT, RecordT, SparseT>, central: Fetched<RecordT, SparseT>, opts: StorableOpts) {
    MSX.storableArgs.parse({ world, listing, central, opts })
    adorn(this, 'world', world)
    adorn(this, 'listing', listing)
    this.#scope = Object.freeze(listing.scopeOf(central))
    this.#central = Object.freeze(central)
    this.assignInitialProps(central)
    this.settle()
    Object.seal(this)
    //
    this.#trigger = new Trigger({
      clock:          world.clock,
      intervalMillis: opts.maxMillisSinceRefresh,
      eagerFrac:      opts.eagerFrac,
      // `receive` notes success by its verdict: a record not older, central or the record in hand whole. The next launch is scheduled after any launch that completes.
      doTryLaunch:    () => this.tryFetch({ ifAbsent: 'nil' }),
      onTimerRefusal: (err) => { this.listing.tellBadNews([err]) },
    })
  }

  /** Inscribe the own props, before the seal: the scope and `vault_tok`, tattooed immutably, and `registered_at`, here; through `assign`, the ones that follow the record in hand. A concrete class with props of its own overrides it, calls super first, and inscribes them the same way: as own props, assigned, tattooed or adorned, never as #fields, which do not exist while the base constructor runs. */
  protected assignInitialProps(central: Fetched<RecordT, SparseT>): void {
    tattoo(this, { ...this.scope, vault_tok: central.vault_tok }, { writable: false, configurable: false })
    this.registered_at = central.registered_at
    this.assign(central)
  }

  /** Assign the mutable own props from `record`, the record about to be in hand: for the base, its revision and `written_at` always, and its `registered_at`, which dates a life of the thing, only where `record` is of another life than the record in hand until now, as at a birthday made here or received. `adopt` calls it before it replaces central, so that is the record judged; `assignInitialProps` sets `registered_at` at birth itself. Never `vault_tok`, fixed at birth. A concrete class with mutable props of its own overrides it, calls super first, and takes them from `record` alone. */
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
    const central = this.#central
    return this.isFullRecord(central) ? central : null
  }

  /** The sparse form of central: everything but what only the full record carries. */
  get sparse(): SparseT { return this.listing.sparseOf(this.#central) }

  get am(): Am { return this.#central.am }

  toJSON(): SparseT { return this.sparse }
  // --

  // == [States]: isTimely, isLocked, isPresent, isFull, isWhole, isWholeRecord, isTombstoneRecord, isWatchable

  get isTimely(): boolean { return this.#trigger.isTimely }

  get isLocked(): boolean { return this.listing.lockState() === 'locked' }

  /** The record in hand is not a tombstone: the thing is not gone. */
  get isPresent(): boolean { return ! MSX.isTombstone(this.#central) }

  /** True where the record in hand has every field filled; false for a sparse view, as a listing's query hands back, or for a tombstone over a deleted or damaged record. */
  get isFull(): boolean { return this.isFullRecord(this.#central) }

  /** True where the record in hand is whole: {@link isFull}, or a tombstone; only a sparse record is not. */
  get #isWhole(): boolean { return this.isWholeRecord(this.#central) }

  /** Whether `record` is whole, as storage would hand it back complete: full, or a tombstone, deleted or damaged. A sparse record is not. */
  protected isWholeRecord(record: Fetched<RecordT, SparseT>): record is RecordT | Tombstone<SparseT> {
    return this.isTombstoneRecord(record) || this.isFullRecord(record)
  }

  /** Whether `record` is a tombstone, deleted or damaged. */
  protected isTombstoneRecord(record: Fetched<RecordT, SparseT>): record is Tombstone<SparseT> {
    return MSX.isTombstone(record)
  }

  get isWatchable(): boolean { return this.#watchable }

  set isWatchable(watchable: boolean) { this.#watchable = MSX.watchable.parse(watchable) }
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
    this.#listeners.forEach((listener) => { listener() })
  }
  /** Compare two snapshots for equality: notifications are not sent if old and new are the same */
  protected sameSnapshot(next: SnapshotT, current: SnapshotT): boolean {
    return stableJsonify(next) === stableJsonify(current)
  }
  // --

  // == [Guards]: demandUnlocked, demandPresent, demandFull, demandFullProps, ensureReadyToFetch, ensureReadyToDel, demandReadyToDel

  demandUnlocked(): this { if (this.isLocked)    { throw lockedError() }                               return this }

  demandPresent():  this { if (! this.isPresent) { throw this.listing.absentRefusal(this.scope) }      return this }

  demandFull():     this { if (! this.isFull)    { throw partialLoadError() }                          return this }

  /** The full record in hand, or refuses 'bad_option' where it is sparse or a tombstone. */
  protected demandFullProps(): RecordT {
    const { full } = this
    if (full === null) { throw partialLoadError() }
    return full
  }

  /** A fetch needs only the world timely: it takes no lock, and may find the thing gone. */
  async ensureReadyToFetch(opts: TimelyOpts = {}): Promise<this> {
    await this.listing.ensureTimelyWorld(opts)
    return this
  }

  async ensureReadyToDel(opts: TimelyOpts = {}): Promise<this> {
    await this.hydrate(opts)
    return this.demandReadyToDel()
  }

  /** A delete needs the vault unlocked, and no more: a thing gone or damaged is deleted again. */
  demandReadyToDel(): this { return this.demandUnlocked() }
  // --

  // == [Storable ops]: fetch, hydrate, del, each with its try form

  /** Get the record storage holds, through the listing, which delivers it to `receive`: one fetch at a time, a call made while one is under way joining it, and settling as it settles, its refusal included.
   * Where nothing is stored, or a tombstone, `opts.ifAbsent` says: 'fail', the default, throws the absent refusal; 'nil'
   * resolves this thing, absent. It is judged for each call, joined or not. `opts` are checked first, before the world is made timely.
   */
  async fetch(opts: FetchOpts = {}): Promise<this> {
    const { ifAbsent = 'fail', ...timely } = MSX.fetchOpts.parse(opts)
    await this.ensureReadyToFetch(timely)
    const isStored = await this.#oneFetchAtATime()
    if (ifAbsent === 'fail' && ! isStored) { throw this.listing.absentRefusal(this.scope) }
    return this
  }

  /** Get the record storage holds, through the listing, at once: the one fetch that `fetch` has calls made meanwhile join. Resolves whether storage held a record, not a tombstone. */
  protected async doFetch(): Promise<boolean> {
    return (await this.listing.fetch(this.scope, { ifAbsent: 'nil' })) !== null
  }

  tryFetch(opts: FetchOpts = {}): Promise<Outcome<this>> {
    return outcomeOf(() => this.fetch(opts))
  }

  /** The world timely first, as its answer may lock the vault or take the thing away; then the record in hand, by the horizon given, or by {@link MSX.MinRefreshMillis} where it is not whole, so fetched again whatever its age once that short horizon passes. Calls made during a fetch join it. */
  async hydrate(opts: TimelyOpts = {}): Promise<this> {
    const timely = MSX.timelyOpts.parse(opts)
    await this.ensureReadyToFetch(timely)
    await this.#trigger.ensureTimelyWithin(this.#isWhole ? timely.maxMillisSinceRefresh : MSX.MinRefreshMillis)
    return this
  }

  tryHydrate(opts: TimelyOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.hydrate(opts)) }

  /** Hand this thing to `listing.del`; its answer, the stored tombstone, makes the thing gone once it lands. A thing gone or damaged is deleted again, over its tombstone's revision. */
  async del(opts: TimelyOpts = {}): Promise<this> {
    await this.ensureReadyToDel(MSX.timelyOpts.parse(opts))
    await this.listing.del(this)
    return this
  }

  tryDel(opts: TimelyOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.del(opts)) }
  // --

  // == [Receiving]: receive, adopt, settle, tombstoneFor, priorRevisionTok

  /** Take in what storage said about this thing: `rcvd`, or null for nothing stored, which reads as a tombstone at the
   * revision held. A record storage could not validate arrives as a tombstone 'd', made of what the listing recovered.
   * `reconcileCentral` judges it; on 'older', 'same' or 'skip' central stays, and otherwise the record is adopted and the
   * thing settles. A record not older than central notes success where, once it is taken in, the record in hand is whole,
   * so a sparse one that only confirms the revision held counts; an older one notes nothing.
   */
  receive(rcvd: Fetched<RecordT, SparseT> | null): Settled {
    const answer = rcvd ?? this.tombstoneFor(this.#central)
    const { central } = this.reconcileCentral(answer, this.classifyRecordShape(answer))
    const older = cmpRevisions(this.#central, answer) === 'older'
    const isTaken = central !== this.#central
    if (isTaken) { this.adopt(central) }
    if (! older && this.#isWhole) { this.#trigger.taskCompleted() }
    return isTaken ? this.settle() : { badnews: [] }
  }

  // Every adopt is followed by a settle, which the snapshot is made from: an adopt left unsettled would leave it behind.
  /** Assign the props of `central`, judged against the central held until now, then hold it, frozen; the snapshot waits for `settle`. */
  protected adopt(central: Fetched<RecordT, SparseT>): void {
    this.assign(central)
    this.#central = Object.freeze(central)
  }

  /** Bring the snapshot up to the state just adopted, notifying the subscribers where it changed. Calling it again changes nothing. The base answers no bad news. A subclass that overrides it calls super last, so that the snapshot sees what the subclass set. */
  settle(): Settled {
    this.#replaceSnapshot()
    return { badnews: [] }
  }

  /** A tombstone made here, from the sparse props held, under `revision`, written now: `am` 'x' for a deletion, 'd' for damage. */
  protected tombstoneFor(revision: Revision, am: 'd' | 'x' = 'x'): Tombstone<SparseT> {
    const { revision_tok, revision_seq } = revision
    return { ...this.sparse, revision_tok, revision_seq, written_at: this.world.clock.now(), am }
  }

  /** The `revision_tok` storage should hold when this thing is deleted: central's; null for a thing never stored, which expects no record. */
  priorRevisionTok(): string | null {
    const { revision_tok, revision_seq } = this.#central
    return revision_seq === MSX.NeverStoredSeq ? null : revision_tok
  }
  // --

  // == [Reconcile]: reconcileCentral, sameLife, classifyRecordShape

  /** The central that results from `rcvd` meeting the central held, and the policy that names the row taken.
   *
   * NOTE, damage at one revision (the Coach, 2026-10-30). Alive here is `am` 'a', as `amVals` has it: a full or sparse
   * record, never a damaged one. At the same revision, damage is not a fate that conflicts with deletion:
   * * A damaged record delivered skips, whatever central is, a deletion included: what storage holds failed its checks
   *   here, so it tells this device nothing to weigh against its own copy.
   * * A deletion delivered over a copy held damaged takes 'gone': the deletion is the one healthy word on that
   *   revision, so central becomes it. This includes nothing stored (`receive(null)`) for a thing held damaged.
   * Of the shapes, only a deletion against a living record, either way round, refuses 'record_conflict'; `cmpRevisions`
   * refuses another tok at the same seq before any row is weighed.
   *
   * NOTE, another life (the Coach, 2026-10-31). A record's life is its {@link lifeTokPathOf}, compared with central's by
   * `#sameLife`. A put lands at the stored row's `revision_seq` + 1, and seqs continue over tombstones, so revisions order
   * the records of every life of a scope alike. A record of another life is weighed by its age as any other, past two rows
   * of its own:
   * * Under another `vault_tok` than this thing's ('other vault'), it throws 'unexpected_error', whatever its age or shape,
   *   over a central never stored included: this thing's `vault_tok`, tattooed at birth, never moves. A vault's life is its
   *   `vault_tok`, so every record of another life of a vault takes this row. Not yet: flushing and remaking every instance
   *   of a vault made anew.
   * * At the revision held, it throws 'record_conflict': one revision cannot begin a life and continue another. A damaged
   *   record skips first, as the damage NOTE rules: its `box_tok` is no more to be trusted than the rest of it.
   * Past those, a newer record of another life is the thing born anew elsewhere, after a deletion this device may not have
   * received: a birthday, taken by the newer rows like any other. An older one is a past life's, and is older.
   *
   * | life        | age   | rcvd   | central | policy                   | central after |
   * | ----------- | ----- | ------ | ------- | ------------------------ | ------------- |
   * | other vault | any   | any    | any     | throw 'unexpected_error' | -             |
   * | any         | older | ouch   | any     | 'skip'                   | central       |
   * | any         | same  | ouch   | any     | 'skip'                   | central       |
   * | other       | same  | any    | any     | throw 'record_conflict'  | -             |
   * |             |       |        |         |                          |               |
   * | any         | older | any    | any     | 'older'                  | central       |
   * | any         | older | gone   | any     | 'older'                  | central       |
   * |             |       |        |         |                          |               |
   * | same        | same  | gone   | ouch    | 'gone'                   | rcvd          |
   * | same        | same  | gone   | alive   | throw 'record_conflict'  | -             |
   * | same        | same  | alive  | gone    | throw 'record_conflict'  | -             |
   * | same        | same  | sparse | any     | 'same'                   | central       |
   * | same        | same  | gone   | gone    | 'same'                   | central       |
   * | same        | same  | full   | full    | 'same'                   | central       |
   * | same        | same  | full   | sparse  | 'fill'                   | rcvd          |
   * | same        | same  | full   | ouch    | 'fill'                   | rcvd          |
   * |             |       |        |         |                          |               |
   * | any         | newer | sparse | any     | 'adopt'                  | rcvd          |
   * | any         | newer | full   | any     | 'adopt'                  | rcvd          |
   * | any         | newer | gone   | any     | 'gone'                   | rcvd          |
   * | any         | newer | ouch   | any     | 'ouch'                   | ouchstone     |
   * |             |       |        |         |                          |               |
   *
   * The age is `cmpRevisions(central, rcvd)`, which refuses the same seq under another tok. An ouchstone is a tombstone
   * made here, 'd' under the damaged record's revision, of the sparse props held. For a thing already held, nothing else of
   * the delivered record is kept; for a thing not yet held, the listing makes its never-stored central of the delivered
   * record's sparse form, so the props held are the damaged record's own.
   */
  protected reconcileCentral(rcvd: Fetched<RecordT, SparseT>, rcvdShape: RecordShape): Reconciled<RecordT, SparseT> { // eslint-disable-line sonarjs/cognitive-complexity
    // The vault_tok first, whatever the life: a joined life tok path cannot tell 'a-b' + 'c' from 'a' + 'b-c'.
    if ((rcvd.vault_tok !== this.vault_tok))                     { throw new VaultError('unexpected_error', Phrases.OtherVaultTok) }
    const central = this.#central
    const age = cmpRevisions(central, rcvd)
    // Damage before life: a damaged record's box_tok is no more to be trusted than the rest of it.
    if ((age !== 'newer') && (rcvdShape === 'ouch'))             { return { central, policy: 'skip' } }
    if ((age === 'same') && (! this.#sameLife(rcvd)))            { throw new VaultError('record_conflict', Phrases.OneRevisionTwoLives) }
    const centralShape = this.classifyRecordShape(central)
    if ((age === 'older'))                                       { return { central, policy: 'older' } }
    if ((age === 'same')) {
      if ((rcvdShape === 'gone') && (centralShape === 'ouch'))   { return { central: rcvd, policy: 'gone' } }
      if ((rcvdShape !== 'gone') && (centralShape === 'gone'))   { throw new VaultError('record_conflict', Phrases.OneRevisionTwoFates) }
      if ((rcvdShape === 'gone') && (centralShape !== 'gone'))   { throw new VaultError('record_conflict', Phrases.OneRevisionTwoFates) }
      if ((rcvdShape === 'gone') && (centralShape === 'gone'))   { return { central, policy: 'same' } }
      if ((rcvdShape === 'sparse'))                              { return { central, policy: 'same' } }
      if ((rcvdShape === 'full') && (centralShape === 'full'))   { return { central, policy: 'same' } }
      if ((rcvdShape === 'full') && (centralShape === 'sparse')) { return { central: rcvd, policy: 'fill' } }
      if ((rcvdShape === 'full') && (centralShape === 'ouch'))   { return { central: rcvd, policy: 'fill' } }
    } else {
      if (rcvdShape === 'gone') { return { central: rcvd, policy: 'gone' } }
      if (rcvdShape === 'ouch') { return { central: this.tombstoneFor(rcvd, 'd'), policy: 'ouch' } }
      return { central: rcvd, policy: 'adopt' }
    }
    throw new VaultError('unexpected_error', Phrases.ShapeUnreconciled)
  }

  /** Whether `record` is of the life of the central held: the same {@link lifeTokPathOf}. */
  #sameLife(record: Fetched<RecordT, SparseT>): boolean {
    return this.lifeTokPathOf(record) === this.lifeTokPathOf(this.#central)
  }

  /** The shape of `record`, by its `am` first: 'ouch' for a damaged one's tombstone, 'gone' for a deletion's, then 'full' for a record `isFullRecord` accepts, 'sparse' for any other. */
  protected classifyRecordShape(record: Fetched<RecordT, SparseT>): RecordShape {
    if (record.am === 'd')             { return 'ouch' }
    if (record.am === 'x')             { return 'gone' }
    if (this.isFullRecord(record))     { return 'full' }
    return 'sparse'
  }
  // --

  // == [Concrete Subclass Required Methods]: isFullRecord, lifeTokPathOf, makeSnapshot

  /** Whether `fetched` is a full record, alive: a tombstone, deleted or damaged, never is. */
  protected abstract isFullRecord(fetched: SparseT): fetched is RecordT
  /** The life of the thing `record` is of: the life toks that a birthday mints, joined. Two records of one scope with different paths are of different lives of it. */
  protected abstract lifeTokPathOf(record: Fetched<RecordT, SparseT>): string
  protected abstract makeSnapshot(): SnapshotT
  // --
}
// --
