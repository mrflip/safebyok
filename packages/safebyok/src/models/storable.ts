import { randomId } from '../crypto'
import { VaultError } from '../errors'
import { adorn, tattoo } from '../helpers'
import { type Outcome, outcomeOf } from '../outcome'
import { stableJsonify } from '../stable-jsonify'
import { lockedError, movedUnderEditError, notFullError } from '../helpers/throwers'
import * as Phrases from '../phrases'
import { Trigger } from '../helpers/trigger'
import type { Listing } from './listing'
import type { Age, Am, Cache, EditOpts, Fetched, FetchOpts, Reconciled, RecordShape, Revision, SendOpts, Settled, SparseBase, StagedForms, StorableOpts, TimelyOpts, Tombstone, World } from './models-shapes'
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
  Listing<ScopeT, RecordT, SparseT, unknown, Storable<ScopeT, RecordT, SparseT, unknown, unknown>>

export abstract class Storable<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>, PatchT, SnapshotT> {
  // == [Declarations]: scope, world, listing, cache, vault_tok, revision_tok, revision_seq, registered_at, written_at, central, staged, memoizedNextRevision, snapshot, trigger, listeners, watchable

  /** The scope, held once and frozen: the listing keys and watches by it, and the verbs name it. Its props are also tattooed on, so the thing ducks as its record; a getter keeps `scope` itself off the duck. */
  readonly #scope: ScopeT

  /** Adorned in the constructor: readable, left out of enumeration and JSON. */
  declare readonly world:   World
  declare readonly listing: ListingOf<ScopeT, RecordT, SparseT>

  /** The device cache of this kind of thing, the listing's, which each `settle` saves this thing's copy to. */
  readonly #cache: Cache<RecordT, SparseT>

  /** The vault this thing lies in, inscribed once by `assignInitialProps` and never moved: a record under another `vault_tok` is refused, not taken. */
  declare readonly vault_tok: string
  /** The revision and times of the record in hand, as plain own props, assigned before the seal by `assignInitialProps` and again by `assign` at each adopt: `registered_at` only at birth and over a tombstone. */
  declare revision_tok:  string
  declare revision_seq:  number
  declare registered_at: number
  declare written_at:    number

  /** The latest record this device knows storage holds: full, sparse, or a tombstone. A thing never stored is born with a tombstone at NeverStoredSeq. */
  #central: Fetched<RecordT, SparseT>
  /** The record edited here and not yet sent, under the next revision, or a tombstone while `del` is sending; null while nothing is staged. */
  #staged: Fetched<RecordT, SparseT> | null
  /** The revision `nextRevision` last minted, and the `revision_tok` of the record it follows; cleared by `send` and `del` as they hand the record to the listing. */
  #memoizedNextRevision: { revision: Revision, anteTok: string } | null = null
  /** Made when `snapshot` is first asked for, and again by each `settle` once one exists. */
  #snapshot: SnapshotT | null = null
  readonly #trigger: Trigger<SnapshotT, this>
  readonly #listeners = new Set<() => void>()
  /** Whether the listing's watch should push full records for this thing: true until set otherwise. */
  #watchable = true
  // --

  // == [Statics]: isLockedFUBag

  /** True for {@link MSX.LOCKED}, the bag a storable answers in place of what the locked vault hides, and for nothing else: not a copy of it, nor any bag a host builds, nor `Symbol.for('LOCKED')`. */
  static isLockedFUBag(val: unknown): val is MSX.LockedBag { return val === MSX.LOCKED }
  // --

  // == [Constructor]: constructor, assignInitialProps, assign

  /** Checks the arguments, holds central and the staged, inscribes the props, settles, and seals itself. `cache` is the listing's device cache, which each settle saves this thing's copy to. Bad news nobody asked about, a refused cache save or a refresh its timer launched that was refused, goes to `listing.tellBadNews`. A concrete class inscribes its own props in `assignInitialProps`; it needs no constructor. */
  constructor(world: World, listing: ListingOf<ScopeT, RecordT, SparseT>, cache: Cache<RecordT, SparseT>, central: Fetched<RecordT, SparseT>, staged: Fetched<RecordT, SparseT> | null, opts: StorableOpts) {
    MSX.storableArgs.parse({ world, listing, cache, central, staged, opts })
    adorn(this, 'world', world)
    adorn(this, 'listing', listing)
    this.#cache = cache
    this.#scope = Object.freeze(listing.scopeOf(central))
    this.#central = Object.freeze(central)
    this.#staged  = staged === null ? null : Object.freeze(staged)
    this.assignInitialProps(this.combined)
    this.settle()
    Object.seal(this)
    //
    this.#trigger = new Trigger({
      clock:       world.clock,
      maxMillis:   opts.maxMillisSinceRefresh,
      eagerFrac:   opts.eagerFrac,
      doSnapshot:  () => this.snapshot,
      doTryLaunch: () => this.tryFetch({ ifAbsent: 'nil' }),
      // `receive` notes success by its verdict: a record not older, central or the record in hand whole. The next launch is scheduled after any launch that completes.
      notesOwnSuccess: true,
      onTimerRefusal:  (err) => { this.listing.tellBadNews([err]) },
    })
  }

  /** Inscribe the own props, before the seal: the scope and `vault_tok`, tattooed immutably, and `registered_at`, here; through `assign`, the ones that follow the record in hand. A concrete class with props of its own overrides it, calls super first, and inscribes them the same way: as own props, assigned, tattooed or adorned, never as #fields, which do not exist while the base constructor runs. */
  protected assignInitialProps(combined: Fetched<RecordT, SparseT>): void {
    tattoo(this, { ...this.scope, vault_tok: combined.vault_tok }, { writable: false, configurable: false })
    this.registered_at = combined.registered_at
    this.assign(combined)
  }

  /** Assign the mutable own props from `record`, the record about to be in hand: for the base, its revision and `written_at` always, and its `registered_at`, which names a life of the thing, only where the central held until now is a tombstone, as it is before a first store and after a death. `adopt` calls it before it replaces central, so that is the central judged; `assignInitialProps` sets `registered_at` at birth itself. Never `vault_tok`, fixed at birth. A concrete class with mutable props of its own overrides it, calls super first, and takes them from `record` alone. */
  protected assign(record: Fetched<RecordT, SparseT>): void {
    const { revision_tok, revision_seq, written_at, registered_at } = record
    if (this.isTombstoneRecord(this.#central)) { this.registered_at = registered_at }
    this.revision_tok = revision_tok
    this.revision_seq = revision_seq
    this.written_at   = written_at
  }
  // --

  // == [Forms]: scope, combined, central, staged, full, sparse, am, toJSON

  get scope(): ScopeT { return this.#scope }

  /** The record in hand: the staged where there is one, else central. */
  protected get combined(): Fetched<RecordT, SparseT> { return this.#staged ?? this.#central }

  /** The most recent view of the stored record. */
  protected get central(): Fetched<RecordT, SparseT> { return this.#central }

  /** The record edited here and not yet sent; null where there is none. */
  protected get staged(): Fetched<RecordT, SparseT> | null { return this.#staged }

  /** The record in hand where it is the full record, else null. */
  protected get full(): RecordT | null {
    const { combined } = this
    return this.isFullRecord(combined) ? combined : null
  }

  /** The sparse form of central: everything but what only the full record carries. */
  get sparse(): SparseT { return this.listing.sparseOf(this.#central) }

  get am(): Am { return this.combined.am }

  toJSON(): SparseT { return this.sparse }
  // --

  // == [States]: isTimely, isLocked, isPresent, isFull, isWhole, isWholeRecord, isTombstoneRecord, hasStaged, isWatchable

  get isTimely(): boolean { return this.#trigger.isTimely }

  get isLocked(): boolean { return this.listing.lockState() === 'locked' }

  /** The record in hand is not a tombstone: the thing is not gone, and no `del` is sending. */
  get isPresent(): boolean { return ! MSX.isTombstone(this.combined) }

  /** True where the record in hand, the staged edit or else the stored record, has every field filled; false for a sparse view, as a listing's query hands back, or for a tombstone over a deleted or damaged record. */
  get isFull(): boolean { return this.isFullRecord(this.combined) }

  /** True where the record in hand is whole: {@link isFull}, or a tombstone. A thing built from a dna is staged full, so only a sparse record storage delivered, with nothing staged over it, is not. */
  get #isWhole(): boolean { return this.isWholeRecord(this.combined) }

  /** Whether `record` is whole, as storage would hand it back complete: full, or a tombstone, deleted or damaged. A sparse record is not. */
  protected isWholeRecord(record: Fetched<RecordT, SparseT>): record is RecordT | Tombstone<SparseT> {
    return this.isTombstoneRecord(record) || this.isFullRecord(record)
  }

  /** Whether `record` is a tombstone, deleted or damaged. */
  protected isTombstoneRecord(record: Fetched<RecordT, SparseT>): record is Tombstone<SparseT> {
    return MSX.isTombstone(record)
  }

  /** A record is staged: edited here and not yet sent. */
  get hasStaged(): boolean { return this.#staged !== null }

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

  // == [Guards]: demandUnlocked, demandPresent, demandFull, ensureReadyToFetch, ensureReadyToEdit, demandReadyToEdit, ensureReadyToSend, demandReadyToSend, ensureReadyToDel, demandReadyToDel

  demandUnlocked(): this { if (this.isLocked)    { throw lockedError() }                               return this }

  demandPresent():  this { if (! this.isPresent) { throw this.listing.absentRefusal(this.scope) }      return this }

  demandFull():     this { if (! this.isFull)    { throw notFullError() }                              return this }

  /** A fetch needs only the world timely: it takes no lock, and may find the thing gone. */
  async ensureReadyToFetch(opts: TimelyOpts = {}): Promise<this> {
    await this.listing.ensureTimelyWorld(opts)
    return this
  }

  async ensureReadyToEdit(opts: TimelyOpts = {}): Promise<this> {
    await this.hydrate(opts)
    return this.demandReadyToEdit()
  }

  /** An edit needs the vault unlocked, and no more: a thing gone or damaged is edited back to life. */
  demandReadyToEdit(): this { return this.demandUnlocked() }

  async ensureReadyToSend(opts: TimelyOpts = {}): Promise<this> {
    await this.hydrate(opts)
    return this.demandReadyToSend()
  }

  /** A send needs what an edit does, as what it puts is what the edit stages: for the base, the vault unlocked. */
  demandReadyToSend(): this { return this.demandReadyToEdit() }

  async ensureReadyToDel(opts: TimelyOpts = {}): Promise<this> {
    await this.hydrate(opts)
    return this.demandReadyToDel()
  }

  /** A delete needs the vault unlocked, and no more: a thing gone or damaged is deleted again. */
  demandReadyToDel(): this { return this.demandUnlocked() }
  // --

  // == [Storable ops]: fetch, hydrate, edit, send, del, each with its try form

  /** Get the record storage holds, through the listing, which delivers it to `receive`. Where nothing is stored, or a tombstone,
   * `opts.ifAbsent` says: 'fail', the default, throws the absent refusal; 'nil' resolves this thing, absent. `opts` are checked
   * first, before the world is made timely.
   */
  async fetch(opts: FetchOpts = {}): Promise<this> {
    const fetchOpts = MSX.fetchOpts.parse(opts)
    await this.ensureReadyToFetch(fetchOpts)
    await this.listing.fetch(this.scope, fetchOpts)
    return this
  }

  tryFetch(opts: FetchOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.fetch(opts)) }

  /** The world timely first, as its answer may lock the vault or take the thing away; then the record in hand, by the horizon given, or by {@link MSX.MinRefreshMillis} where it is not whole, so fetched again whatever its age once that short horizon passes. Calls made during a fetch join it. */
  async hydrate(opts: TimelyOpts = {}): Promise<this> {
    const timely = MSX.timelyOpts.parse(opts)
    await this.ensureReadyToFetch(timely)
    await this.#trigger.ensureTimelyWithin(this.#isWhole ? timely.maxMillisSinceRefresh : MSX.MinRefreshMillis)
    return this
  }

  tryHydrate(opts: TimelyOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.hydrate(opts)) }

  /** Lay `patch` over the record in hand under the next revision, alive, through the concrete class's `makeStaged`; reconcile the result in as the staged; settle. Central is untouched; nothing is stored. On a thing gone or damaged, this is its rebirth: the record made is alive over its tombstone's sparse props, registered now. Once past its guards it completes, whether or not the vault locks meanwhile; but a central that moves while `makeStaged` runs refuses 'stale_write', staging nothing, as the record made was laid over one storage no longer holds; the refusal carries that central as a 'stale_write' from storage carries what it holds (`meta.box_stored` for a box). `patch`, through the concrete class's `isFullPatch`, then `opts`, are checked first of all, before any guard, each refusing 'bad_option' and naming the field. */
  async edit(patch: PatchT, opts: EditOpts = {}): Promise<this> {
    this.isFullPatch(patch)
    const timely = MSX.timelyOpts.parse(opts)
    await this.ensureReadyToEdit(timely)
    const ante = this.#central
    const nextRevision = this.nextRevision(ante)
    const now = this.world.clock.now()
    const { combined } = this
    const registered_at = MSX.isTombstone(combined) ? now : combined.registered_at
    const made = await this.makeStaged({ ...combined, ...nextRevision, registered_at, written_at: now, am: 'a' }, patch, timely)
    if (this.#central.revision_tok !== ante.revision_tok) { throw movedUnderEditError(this.listing.staleMetaOf(this.#central)) }
    this.adopt(this.#central, this.reconcileStaged({ act: 'edit', central: this.#central, staged: this.staged, patch: made, nextRevision }))
    this.settle()
    return this
  }

  tryEdit(patch: PatchT, opts: EditOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.edit(patch, opts)) }

  /** `ensureReadyToSend`, then `edit`, then hand the record it staged to `listing.put`, which resolves once storage's answer is delivered; a 'stale_write' refusal delivers what storage holds, then throws. The revision minted is spent, whatever the answer: the next `edit` mints another.
   * `opts.ifPresent`, optional, is only ever `'replace'`, the default: every put is the versioned replace, landing only over the record whose `revision_tok` this device holds, at its `revision_seq` + 1 (or over no row at revision 0, for a thing never stored), else refused (the `Store` doc block says how). It is checked and sets nothing; any other value refuses 'bad_option'. `opts`, then `patch`, are checked first of all, before any guard.
   */
  async send(patch: PatchT, opts: SendOpts = {}): Promise<this> {
    const { ifPresent: _ifPresent, ...timely } = MSX.sendOpts.parse(opts)
    this.isFullPatch(patch)
    await this.ensureReadyToSend(timely)
    await this.edit(patch, timely)
    this.#memoizedNextRevision = null
    // The staged record, not this thing ducking as it: a lock may come down between edit and put, and a locked thing's getters hide what it holds.
    await this.listing.put(this.listing.recordOf(this.#staged))
    return this
  }

  trySend(patch: PatchT, opts: SendOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.send(patch, opts)) }

  /** Stage a tombstone under the next revision; hand this thing to `listing.del`. Its answer, the stored tombstone, makes the thing gone. A thing gone or damaged is deleted again, over its tombstone's revision. */
  async del(opts: TimelyOpts = {}): Promise<this> {
    await this.ensureReadyToDel(MSX.timelyOpts.parse(opts))
    const nextRevision = this.nextRevision(this.#central)
    this.adopt(this.#central, this.reconcileStaged({ act: 'del', central: this.#central, staged: this.staged, nextRevision }))
    this.settle()
    this.#memoizedNextRevision = null
    await this.listing.del(this)
    return this
  }

  tryDel(opts: TimelyOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.del(opts)) }
  // --

  // == [Receiving]: receive, adopt, settle, cacheOnDevice, tombstoneFor, nextRevision, priorRevisionTok

  /** Take in what storage said about this thing: `rcvd`, or null for nothing stored, which reads as a tombstone at the
   * revision held. A record storage could not validate arrives as a tombstone 'd', made of what the listing recovered.
   * `reconcileCentral` judges it; on 'older', 'same' or 'skip' the receive ends there, but for a deletion at the revision
   * held met by the staged tombstone of a `del`, which is spent: the staged is dropped, and the thing settles. Otherwise
   * `reconcileStaged` judges the staged against the new central, both are adopted, and the thing settles. A record not
   * older than central notes success where, once it is taken in, the record in hand is whole, so a sparse one that only
   * confirms the revision held counts; an older one notes nothing.
   */
  receive(rcvd: Fetched<RecordT, SparseT> | null): Settled {
    const answer = rcvd ?? this.tombstoneFor(this.#central)
    const rcvdShape = this.classifyRecordShape(answer)
    const { central, policy } = this.reconcileCentral(answer, rcvdShape)
    const older = cmpRevisions(this.#central, answer) === 'older'
    const act = MSX.receivedAct.safeParse(policy)
    // A deletion at the revision held, the answer to a `del` sent over a thing already gone or a fetch or notice met meanwhile, says storage holds it gone: the staged tombstone is spent.
    const delSpent = (policy === 'same') && (rcvdShape === 'gone') && (this.#staged?.am === 'x')
    if (act.success) {
      this.adopt(central, this.reconcileStaged({ act: act.data, central: this.#central, staged: this.staged, rcvd: answer, nextRevision: this.nextRevision(central) }))
    } else if (delSpent) {
      this.adopt(central, null)
    }
    if (! older && this.#isWhole) { this.#trigger.noteSuccessNow() }
    return (delSpent || act.success) ? this.settle() : { badnews: [] }
  }

  // Every adopt is followed by a settle, which the snapshot and the device cache are made from: an adopt left unsettled would leave both behind.
  /** Assign the props of the record that will be in hand, judged against the central held until now, then hold both, frozen, the staged null where nothing is staged; the snapshot waits for `settle`. */
  protected adopt(central: Fetched<RecordT, SparseT>, staged: Fetched<RecordT, SparseT> | null): void {
    this.assign(staged ?? central)
    this.#central = Object.freeze(central)
    this.#staged = staged === null ? null : Object.freeze(staged)
  }

  /** Bring the snapshot and the device cache up to the state just adopted: replace the snapshot, notifying the subscribers where it changed, and save this thing's copy by `#cacheOnDevice`, not awaited. Calling it again changes nothing. The base answers no bad news. A subclass that overrides it calls super last, so that the snapshot sees what the subclass set. */
  settle(): Settled {
    this.#replaceSnapshot()
    this.#cacheOnDevice()
    return { badnews: [] }
  }

  /** Save the copy, central and the staged beside the sparse form, to the device cache by `cache.save`, not awaited: a save refused is told to `listing.tellBadNews`, never thrown into the verb that settled. The copy holds the records as stored and staged, sealed, and nothing the instance alone keeps, such as an exposed whisper. A thing never stored with nothing staged has nothing to keep, and saves nothing. One is in that state between its birth and the record it was born to receive. */
  #cacheOnDevice(): void {
    if (this.#central.revision_seq === MSX.NeverStoredSeq && this.#staged === null) { return }
    const copy = Object.freeze({ ...this.listing.sparseOf(this.#central), central: this.#central, staged: this.#staged })
    void outcomeOf(() => this.#cache.save(copy)).then(({ ok, err }) => { if (! ok) { this.listing.tellBadNews([err]) } })
  }

  /** A tombstone made here, from the sparse props held, under `revision`, written now: `am` 'x' for a deletion, 'd' for damage. */
  protected tombstoneFor(revision: Revision, am: 'd' | 'x' = 'x'): Tombstone<SparseT> {
    const { revision_tok, revision_seq } = revision
    return { ...this.sparse, revision_tok, revision_seq, written_at: this.world.clock.now(), am }
  }

  /** The revision after `ante`: minted once, then the same while `ante`'s tok is the one it followed, so edits made one after another stage one revision until `send` or `del` spends it. */
  protected nextRevision(ante: Revision): Revision {
    if (this.#memoizedNextRevision?.anteTok === ante.revision_tok) { return this.#memoizedNextRevision.revision }
    const revision = { revision_tok: randomId(), revision_seq: ante.revision_seq + 1 }
    this.#memoizedNextRevision = { revision, anteTok: ante.revision_tok }
    return revision
  }

  /** The `revision_tok` storage should hold when this thing is put or deleted: central's; null for a thing never stored, which expects no record. */
  priorRevisionTok(): string | null {
    const { revision_tok, revision_seq } = this.#central
    return revision_seq === MSX.NeverStoredSeq ? null : revision_tok
  }
  // --

  // == [Reconcile]: reconcileCentral, reconcileStaged, classifyRecordShape

  /** The central that results from `rcvd` meeting the central held, and the policy that names the row taken. The staged is not consulted.
   *
   * NOTE, damage at one revision (the Coach, 2026-10-30). Alive here is `am` 'a', as `amVals` has it: a full or sparse
   * record, never a damaged one. At the same revision, damage is not a fate that conflicts with deletion:
   * * A damaged record delivered skips, whatever central is, a deletion included: what storage holds failed its checks
   *   here, so it tells this device nothing to weigh against its own copy.
   * * A deletion delivered over a copy held damaged takes 'gone': the deletion is the one healthy word on that
   *   revision, so central becomes it and `reconcileStaged` drops the staged. This includes nothing stored
   *   (`receive(null)`) for a thing held damaged.
   *   The double edge: a staged edit carried past a newer damaged record's ouchstone is dropped when nothing stored
   *   then arrives. Nothing is refused and no news is told. The edit could have been kept; this policy unstages it.
   * Of the shapes, only a deletion against a living record, either way round, refuses 'record_conflict'; `cmpRevisions`
   * refuses another tok at the same seq before any row is weighed.
   *
   * NOTE, another `vault_tok` (the Coach, 2026-10-30). Before any row, a record of any shape under another `vault_tok`
   * than this thing's throws 'unexpected_error', over a central alive or a tombstone alike, a central never stored
   * included: it belongs to another life of the vault, whose revisions this one's do not order, and this thing's
   * `vault_tok`, fixed at birth, never moves. Not yet: flushing and remaking every instance of a vault made anew.
   *
   * | age   | rcvd   | central | policy                   | central after |
   * | ----- | ------ | ------- | ------------------------ | ------------- |
   * | older | any    | any     | 'older'                  | central       |
   * | older | gone   | any     | 'older'                  | central       |
   * | older | ouch   | any     | 'skip'                   | central       |
   * |       |        |         |                          |               |
   * | same  | ouch   | any     | 'skip'                   | central       |
   * | same  | gone   | ouch    | 'gone'                   | rcvd          |
   * | same  | gone   | alive   | throw 'record_conflict'  | -             |
   * | same  | alive  | gone    | throw 'record_conflict'  | -             |
   * | same  | sparse | any     | 'same'                   | central       |
   * | same  | gone   | gone    | 'same'                   | central       |
   * | same  | full   | full    | 'same'                   | central       |
   * | same  | full   | sparse  | 'fill'                   | rcvd          |
   * | same  | full   | ouch    | 'fill'                   | rcvd          |
   * |       |        |         |                          |               |
   * | newer | sparse | any     | 'adopt'                  | rcvd          |
   * | newer | full   | any     | 'adopt'                  | rcvd          |
   * | newer | gone   | any     | 'gone'                   | rcvd          |
   * | newer | ouch   | any     | 'ouch'                   | ouchstone     |
   * |       |        |         |                          |               |
   *
   * The age is `cmpRevisions(central, rcvd)`, which refuses the same seq under another tok. An ouchstone is a tombstone
   * made here, 'd' under the damaged record's revision, of the sparse props held. For a thing already held, nothing else of
   * the delivered record is kept; for a thing not yet held, the listing makes its never-stored central of the delivered
   * record's sparse form, so the props held are the damaged record's own.
   */
  protected reconcileCentral(rcvd: Fetched<RecordT, SparseT>, rcvdShape: RecordShape): Reconciled<RecordT, SparseT> { // eslint-disable-line sonarjs/cognitive-complexity
    if (rcvd.vault_tok !== this.vault_tok)                       { throw new VaultError('unexpected_error', Phrases.OtherVaultTok) }
    const central = this.#central
    const age = cmpRevisions(central, rcvd)
    const centralShape = this.classifyRecordShape(central)
    if ((age === 'older') && (rcvdShape === 'ouch'))             { return { central, policy: 'skip' } }
    if ((age === 'older'))                                       { return { central, policy: 'older' } }
    if ((age === 'same')) {
      if ((rcvdShape === 'ouch'))                                { return { central, policy: 'skip' } }
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

  /** The staged that replaces the one held, given a new central (fill, adopt, gone, ouch) or a verb called here (edit, del); null for nothing staged.
   * An implementation reads `forms` and nothing else: never an own prop. A staged edit surpassed by
   * a received update has no strategy both good and simple: any other drags the staged along until
   * the customer sends it, to meet a stale_write at best, and a spurious `edit` could bump it into
   * prominence. So the simple one: a healthy record (full, sparse, or a deletion's tombstone) drops
   * it, whether or not it is the staged's own put landing; a damaged one carries it to the next
   * revision (the Coach, 2026-10-30).
   *
   * | act             | staged after                                                                                   |
   * | --------------- | ---------------------------------------------------------------------------------------------- |
   * | `edit`          | `{ ...central, ...staged, ...patch, ...nextRevision }`                                         |
   * | `del`           | `tombstoneFor(nextRevision)`, 'x'                                                              |
   * | `fill`          | `staged`, as it was: a full record at the same revision surpasses nothing                      |
   * | `adopt`, `gone` | null: a healthy record newer than central, or a deletion from any device, drops the staged     |
   * | `ouch`          | `{ ...staged, ...nextRevision }`: the staged outlives the damage, under the revision after the ouchstone; null where nothing is staged |
   *
   * @param forms.act          - The row to take.
   * @param forms.central      - The central held.
   * @param forms.staged       - The staged held; null where nothing is staged.
   * @param forms.rcvd         - For a ReceivedAct, the record storage delivered, as it came.
   * @param forms.patch        - For edit, the record `makeStaged` made of the patch, whole and sealed.
   * @param forms.nextRevision - The revision after the central that results, minted once.
   */
  protected reconcileStaged(forms: StagedForms<RecordT, SparseT>): Fetched<RecordT, SparseT> | null {
    MSX.stagedForms.parse(forms)
    const { act, central, staged, patch, nextRevision } = forms
    if (act === 'edit') { return { ...central, ...staged, ...patch, ...nextRevision } }
    if (act === 'del')  { return this.tombstoneFor(nextRevision) }
    if (act === 'fill') { return staged }
    if (act === 'ouch') { return staged === null ? null : { ...staged, ...nextRevision } }
    return null
  }

  /** The shape of `record`, by its `am` first: 'ouch' for a damaged one's tombstone, 'gone' for a deletion's, then 'full' for a record `isFullRecord` accepts, 'sparse' for any other. */
  protected classifyRecordShape(record: Fetched<RecordT, SparseT>): RecordShape {
    if (record.am === 'd')             { return 'ouch' }
    if (record.am === 'x')             { return 'gone' }
    if (this.isFullRecord(record))     { return 'full' }
    return 'sparse'
  }
  // --

  // == [Concrete Subclass Required Methods]: isFullRecord, isFullPatch, makeStaged, makeSnapshot

  /** Whether `fetched` is a full record, alive: a tombstone, deleted or damaged, never is. */
  protected abstract isFullRecord(fetched: SparseT): fetched is RecordT
  /** The check `edit` (so `send`) makes of its patch first of all, before any guard: it returns for a full patch, one `makeStaged` can lay over the record in hand, and refuses any other 'bad_option', naming the field, through the concrete class's Checker. It returns nothing: `makeStaged` is handed the patch as given, and takes from it only what it lays over the record, so a field the check allows and ignores goes no further. */
  protected abstract isFullPatch(patch: unknown): asserts patch is PatchT
  /** The step of `edit` only the concrete class can take: `base` is the record in hand, sparse or full, under its next revision; lay the patch over it and seal what needs sealing. The record it returns is held as the staged, full. */
  protected abstract makeStaged(base: SparseT, patch: PatchT, opts: EditOpts): Promise<RecordT>
  protected abstract makeSnapshot(): SnapshotT
  // --
}
// --
