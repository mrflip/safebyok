import { randomId } from '../crypto'
import { VaultError } from '../errors'
import { adorn } from '../helpers'
import { type Outcome, outcomeOf } from '../outcome'
import { stableJsonify } from '../stable-jsonify'
import { lockedError, movedUnderEditError, notFullError } from '../helpers/throwers'
import * as Phrases from '../phrases'
import { Trigger } from '../helpers/trigger'
import type { Listing } from './listing'
import type { Age, Am, EditOpts, Fetched, FetchOpts, Reconciled, RecordShape, Revision, SendOpts, Settled, SparseBase, StagedForms, StorableOpts, Tell, TimelyOpts, Times, Tombstone, World } from './models-shapes'
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
  // == [Declarations]: scope, world, listing, vault_tok, revision_tok, revision_seq, registered_at, written_at, central, staged, minted, snapshot, trigger, listeners, watchable

  /** The scope, held once and frozen: the listing keys and watches by it, and the verbs name it. Its props are also tattooed on, so the thing ducks as its record; a getter keeps `scope` itself off the duck. */
  readonly #scope: ScopeT

  /** Adorned in the constructor: readable, left out of enumeration and JSON. */
  declare readonly world:   World
  declare readonly listing: ListingOf<ScopeT, RecordT, SparseT>

  /** The vault this thing lies in, inscribed once by `assignInitialProps` and never moved: a record under another `vault_tok` is refused, not taken. */
  declare readonly vault_tok: string
  /** The revision and times of the record in hand, as plain props: inscribed by `assignInitialProps`, set by `assign` at each adopt, `registered_at` only over a tombstone. */
  declare revision_tok:  string
  declare revision_seq:  number
  declare registered_at: number
  declare written_at:    number

  /** The latest record this device knows storage holds: full, sparse, or a tombstone. A thing never stored is born with a tombstone at NeverStoredSeq. */
  #central: Fetched<RecordT, SparseT>
  /** The record edited here and not yet sent, under the next revision, or a tombstone while `del` is sending; null while nothing is staged. */
  #staged: Fetched<RecordT, SparseT> | null
  /** The revision `nextRevision` last minted, and the `revision_tok` of the record it follows; cleared by `send` and `del` as they hand the record to the listing. */
  #minted: { revision: Revision, anteTok: string } | null = null
  /** Made when `snapshot` is first asked for, and again by each `settle` once one exists. */
  #snapshot: SnapshotT | null = null
  readonly #trigger: Trigger<SnapshotT, this>
  readonly #listeners = new Set<() => void>()
  /** Whether the listing's watch should push full records for this thing: true until set otherwise. */
  #watchable = true
  // --

  // == [Constructor]: constructor, assignInitialProps, assign

  /** Checks the arguments, holds central and the staged, inscribes the props, settles, and seals itself. `tell` is how it tells bad news nobody asked about to the host. A concrete class inscribes its own props in `assignInitialProps`; it needs no constructor. */
  constructor(world: World, listing: ListingOf<ScopeT, RecordT, SparseT>, central: Fetched<RecordT, SparseT>, staged: Fetched<RecordT, SparseT> | null, opts: StorableOpts, tell: Tell) {
    MSX.storableArgs.parse({ world, listing, central, staged, opts, tell })
    adorn(this, 'world', world)
    adorn(this, 'listing', listing)
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
      onTimerRefusal:  (err) => { tell([err]) },
    })
  }

  /** Inscribe the own props, before the seal: the scope and `vault_tok`, immutably, here, and through `assign`, the ones that follow the record in hand. A concrete class with props of its own overrides it, calls super first, and inscribes them the same way: as own props, tattooed or adorned, never as #fields, which do not exist while the base constructor runs. */
  protected assignInitialProps(combined: Fetched<RecordT, SparseT>): void {
    tattoo(this, { ...this.scope, vault_tok: combined.vault_tok }, { writable: false, configurable: false })
    this.assign(combined, null)
  }

  /** Set the props that follow `record`, the record in hand: its revision and `written_at` always; its `registered_at`,
   * which names a life of the thing, only at birth (`current` null) or where `current`, the central held until now, is a
   * tombstone, as it is before a first store and after a death. Never `vault_tok`, fixed at birth. The concrete class sets
   * its own after calling this.
   */
  protected assign(record: Fetched<RecordT, SparseT>, current: Fetched<RecordT, SparseT> | null): void {
    if (current === null || MSX.isTombstone(current)) { tattoo(this, lifePropsOf(record), { configurable: false }) }
    tattoo(this, revisionPropsOf(record), { configurable: false })
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
    return ! MSX.isTombstone(combined) && this.isFullRecord(combined) ? combined : null
  }

  /** The sparse form of central: everything but what only the full record carries. */
  get sparse(): SparseT { return this.listing.sparseOf(this.#central) }

  get am(): Am { return this.combined.am }

  toJSON(): SparseT { return this.sparse }
  // --

  // == [States]: isTimely, isLocked, isPresent, isFull, hasStaged, isWatchable

  get isTimely(): boolean { return this.#trigger.isTimely }

  get isLocked(): boolean { return this.listing.lockState() === 'locked' }

  /** The record in hand is not a tombstone: the thing is not gone, and no `del` is sending. */
  get isPresent(): boolean { return ! MSX.isTombstone(this.combined) }

  get isFull(): boolean { return this.full !== null }

  /** A record is staged: edited here and not yet sent. */
  get hasStaged(): boolean { return this.#staged !== null }

  get isWatchable(): boolean { return this.#watchable }

  set isWatchable(watchable: boolean) { this.#watchable = watchable }
  // --

  // == [Snapshot and subscription]: snapshot, getSnapshot, subscribe

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
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
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

  // == [Guards]: demandUnlocked, demandPresent, demandFull, ensureReadyToFetch, ensureReadyToEdit, demandReadyToEdit, ensureReadyToDel, demandReadyToDel

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

  async ensureReadyToDel(opts: TimelyOpts = {}): Promise<this> {
    await this.hydrate(opts)
    return this.demandReadyToDel()
  }

  /** A delete needs the vault unlocked, and no more: a thing gone or damaged is deleted again. */
  demandReadyToDel(): this { return this.demandUnlocked() }
  // --

  // == [Storable ops]: fetch, hydrate, edit, send, del, each with its try form

  /** Get the record storage holds, through the listing, which delivers it to `receive`. Where nothing is stored, or a tombstone,
   * `opts.ifAbsent` says: 'fail', the default, throws the absent refusal; 'nil' resolves this thing, absent.
   */
  async fetch(opts: FetchOpts = {}): Promise<this> {
    await this.ensureReadyToFetch(opts)
    await this.listing.fetch(this.scope, opts)
    return this
  }

  tryFetch(opts: FetchOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.fetch(opts)) }

  /** The world timely first, as its answer may lock the vault or take the thing away; then the record in hand, by the horizon given, fetched whatever its age where it is not whole. Calls made during a fetch join it. */
  async hydrate(opts: TimelyOpts = {}): Promise<this> {
    await this.ensureReadyToFetch(opts)
    await this.#trigger.ensureTimelyWithin(this.#holdsWhole ? opts.maxMillisSinceRefresh : 0)
    return this
  }

  tryHydrate(opts: TimelyOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.hydrate(opts)) }

  /** Lay `patch` over the record in hand under the next revision, alive, through the concrete class's `makeStaged`; reconcile the result in as the staged; settle. Central is untouched; nothing is stored. On a thing gone or damaged, this is its rebirth: the record made is alive over its tombstone's sparse props, registered now. Once past its guards it completes, whether or not the vault locks meanwhile; but a central that moves while `makeStaged` runs refuses 'stale_write', staging nothing, as the record made was laid over one storage no longer holds; the refusal carries that central as a 'stale_write' from storage carries what it holds (`meta.box_stored` for a box). */
  async edit(patch: PatchT, opts: EditOpts = {}): Promise<this> {
    await this.ensureReadyToEdit(opts)
    const ante = this.#central
    const nextRevision = this.nextRevision(ante)
    const now = this.world.clock.now()
    const { combined } = this
    const registered_at = MSX.isTombstone(combined) ? now : combined.registered_at
    const made = await this.makeStaged({ ...combined, ...nextRevision, registered_at, written_at: now, am: 'a' }, patch, opts)
    if (this.#central.revision_tok !== ante.revision_tok) { throw movedUnderEditError(this.listing.staleMetaOf(this.#central)) }
    this.adopt(this.#central, this.reconcileStaged({ act: 'edit', central: this.#central, staged: this.staged, patch: made, nextRevision }))
    this.settle()
    return this
  }

  tryEdit(patch: PatchT, opts: EditOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.edit(patch, opts)) }

  /** `edit`, then hand the record it staged to `listing.put`, which resolves once storage's answer is delivered; a 'stale_write' refusal delivers what storage holds, then throws. The revision minted is spent, whatever the answer: the next `edit` mints another.
   * `opts.ifPresent`, optional, is only ever `'replace'`, the default: every put is the versioned replace, landing only over the record whose `revision_tok` this device holds, at its `revision_seq` + 1 (or over no row at revision 0, for a thing never stored), else refused (the `Store` doc block says how). It is checked and sets nothing; any other value refuses 'bad_option'.
   */
  async send(patch: PatchT, opts: SendOpts = {}): Promise<this> {
    const { ifPresent: _ifPresent, ...timely } = MSX.sendOpts.parse(opts)
    await this.edit(patch, timely)
    this.#minted = null
    // The staged record, not this thing ducking as it: a lock may come down between edit and put, and a locked thing's getters hide what it holds.
    await this.listing.put(this.listing.recordOf(this.#staged))
    return this
  }

  trySend(patch: PatchT, opts: SendOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.send(patch, opts)) }

  /** Stage a tombstone under the next revision; hand this thing to `listing.del`. Its answer, the stored tombstone, makes the thing gone. A thing gone or damaged is deleted again, over its tombstone's revision. */
  async del(opts: TimelyOpts = {}): Promise<this> {
    await this.ensureReadyToDel(opts)
    const nextRevision = this.nextRevision(this.#central)
    this.adopt(this.#central, this.reconcileStaged({ act: 'del', central: this.#central, staged: this.staged, nextRevision }))
    this.settle()
    this.#minted = null
    await this.listing.del(this)
    return this
  }

  tryDel(opts: TimelyOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.del(opts)) }
  // --

  // == [Receiving]: receive, adopt, settle, tombstoneFor, nextRevision, priorTok

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
    if (! older && this.#holdsWhole) { this.#trigger.noteSuccessNow() }
    return (delSpent || act.success) ? this.settle() : { badnews: [] }
  }

  // Every adopt is followed by a settle: the listing saves the copy last handed in by settle, not the state at the time of the save.
  /** Hold both, frozen, the staged null where nothing is staged, and assign the props of the record in hand over the central held until now; the snapshot waits for `settle`. */
  protected adopt(central: Fetched<RecordT, SparseT>, staged: Fetched<RecordT, SparseT> | null): void {
    const current = this.#central
    this.#central = Object.freeze(central)
    this.#staged = staged === null ? null : Object.freeze(staged)
    this.assign(this.combined, current)
  }

  /** Act on the state as adopted, idempotently: the base replaces the snapshot, hands the listing the copy for the device cache by `listing[MSX.KeepCopy]`, and tells no news. The copy, central and the staged beside the sparse form, is made here from the private central and staged, and goes nowhere but into that call; the listing saves it when it delivers or builds. A subclass calls super last, so that the snapshot sees it. */
  settle(): Settled {
    this.#replaceSnapshot()
    this.listing[MSX.KeepCopy](Object.freeze({ ...this.listing.sparseOf(this.#central), central: this.#central, staged: this.#staged }))
    return { badnews: [] }
  }

  /** A tombstone made here, from the sparse props held, under `revision`, written now: `am` 'x' for a deletion, 'd' for damage. */
  protected tombstoneFor(revision: Revision, am: 'd' | 'x' = 'x'): Tombstone<SparseT> {
    const { revision_tok, revision_seq } = revision
    return { ...this.sparse, revision_tok, revision_seq, written_at: this.world.clock.now(), am }
  }

  /** The revision after `ante`: minted once, then the same while `ante`'s tok is the one it followed, so edits made one after another stage one revision until `send` or `del` spends it. */
  protected nextRevision(ante: Revision): Revision {
    if (this.#minted?.anteTok === ante.revision_tok) { return this.#minted.revision }
    const revision = { revision_tok: randomId(), revision_seq: ante.revision_seq + 1 }
    this.#minted = { revision, anteTok: ante.revision_tok }
    return revision
  }

  /** The `revision_tok` storage should hold when this thing is put or deleted: central's; null for a thing never stored, which expects no record. */
  priorTok(): string | null {
    const { revision_tok, revision_seq } = this.#central
    return revision_seq === MSX.NeverStoredSeq ? null : revision_tok
  }
  // --

  // == [Reconcile]: reconcileCentral, reconcileStaged, classifyRecordShape, isWholeRecord, holdsWhole

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

  /** Whether `record` is whole, as storage would hand it back complete: full, or a tombstone, deleted or damaged. A sparse record is not. */
  protected isWholeRecord(record: Fetched<RecordT, SparseT>): boolean {
    return MSX.isTombstone(record) || this.isFullRecord(record)
  }

  /** Whether the record in hand is whole. A thing built from a dna is staged full, so only a sparse record storage delivered, with nothing staged over it, is not. */
  get #holdsWhole(): boolean { return this.isWholeRecord(this.combined) }
  // --

  // == [Concrete Subclass Required Methods]: isFullRecord, makeStaged, makeSnapshot

  protected abstract isFullRecord(fetched: SparseT): fetched is RecordT
  /** The step of `edit` only the concrete class can take: `base` is the record in hand, sparse or full, under its next revision; lay the patch over it and seal what needs sealing. The record it returns is held as the staged, full. */
  protected abstract makeStaged(base: SparseT, patch: PatchT, opts: EditOpts): Promise<RecordT>
  protected abstract makeSnapshot(): SnapshotT
  // --
}
// --

// == [Helpers]: lifePropsOf, revisionPropsOf, tattoo

/** The own prop that names a life of the thing, set at birth and over a tombstone. */
const lifePropsOf = ({ registered_at }: Times): Pick<Times, 'registered_at'> => ({ registered_at })

/** The own props that follow every record in hand. */
const revisionPropsOf = ({ revision_tok, revision_seq, written_at }: Revision & Times): Revision & Pick<Times, 'written_at'> => ({ revision_tok, revision_seq, written_at })

/** A placeholder until the helpers worker lands `tattoo`; then this goes and the import takes its place. */
const tattoo = <BT extends object>(obj: object, shown: BT, opts: { writable?: boolean, configurable?: boolean } = {}): BT => {
  for (const [ckey, val] of Object.entries(shown)) {
    Object.defineProperty(obj, ckey, { value: val, enumerable: true, writable: opts.writable ?? true, configurable: opts.configurable ?? true })
  }
  return shown
}
// --
