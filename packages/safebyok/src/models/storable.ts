import { randomId } from '../crypto'
import { VaultError } from '../errors'
import { adorn } from '../helpers'
import { type Outcome, outcomeOf } from '../outcome'
import { stableJsonify } from '../stable-jsonify'
import { lockedError } from '../utils/throwers'
import { Trigger } from '../utils/trigger'
import type { Age, EditOpts, Fetched, Reconciled, RecordShape, Revision, SendOpts, Settled, SparseBase, StagedForms, StorableListing, StorableOpts, TimelyOpts, Times, Tombstone, World } from './models-shapes'
import * as MSX from './models-shapes'

// == [Revisions]: cmpRevisions

/** How `post` compares to `ante`: the later `revision_seq` is newer. The same seq under another `revision_tok` is two writes landed as one revision, refused 'corrupt_record'. */
export const cmpRevisions = (ante: Revision, post: Revision): Age => {
  if (post.revision_seq < ante.revision_seq) { return 'older' }
  if (post.revision_seq > ante.revision_seq) { return 'newer' }
  if (post.revision_tok !== ante.revision_tok) {
    throw new VaultError('corrupt_record', 'Storage holds a record at the same revision_seq as this device, under another revision_tok: two writes landed as one revision, so neither can be trusted until the record is read again.')
  }
  return 'same'
}
// --

// == [Storable]

export abstract class Storable<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>, PatchT, SnapshotT> {
  // == [Declarations]: scope, world, listing, registered_at, revision_tok, revision_seq, written_at, central, staged, snapshot, trigger, listeners

  readonly scope: ScopeT

  // Adorned in the constructor: readable, left out of enumeration and JSON.
  declare readonly world:   World
  declare readonly listing: StorableListing<ScopeT, RecordT, SparseT>

  // Tattooed with the scope, immutably.
  declare readonly registered_at: number

  // The revision and time of the record in hand, as plain props: inscribed by `initialize`, set by `assign` at each adopt.
  declare revision_tok:  string
  declare revision_seq:  number
  declare written_at:    number

  // The latest record this device knows storage holds: full, sparse, or a tombstone. A thing never stored is born with a tombstone at NeverStoredSeq.
  #central: Fetched<RecordT, SparseT>
  // The record in hand: central itself while nothing is staged; else the record edited here and not yet sent, under the next revision, or a tombstone while `del` is sending.
  #staged: Fetched<RecordT, SparseT>
  // Made on first read, and again by each `settle` once one exists.
  #snapshot: SnapshotT | null = null
  readonly #trigger: Trigger<SnapshotT, void>
  readonly #listeners = new Set<() => void>()
  // --

  // == [Constructor]: constructor, assignInitialProps, assign

  // Checks the bag, inscribes the props, holds central and the staged, settles, and seals itself. A concrete class inscribes its own props in `initialize`; it needs no constructor.
  constructor(world, listing, central, staged, opts: StorableOpts<ScopeT, RecordT, SparseT>) {
    MSX.storableOpts.parse({ world, listing, central, staged, opts })
    adorn(this, 'world', world)
    adorn(this, 'listing', listing)
    this.scope = this.scopeOf(central)
    this.#central = Object.freeze(central)
    this.#staged   = Object.freeze(staged)
    this.assignInitialProps(this.combined)
    this.settle()
    Object.seal(this)
    //
    this.#trigger = new Trigger({
      clock:       world.clock,
      maxMillis:   maxMillisSinceRefresh,
      eagerFrac,
      doSnapshot:  () => this.snapshot,
      doTryLaunch: () => this.tryFetch(),
    })
  }

  // Inscribe the own props that follow the record in hand, before the seal, so `assign` can set them after it. A concrete
  // class with props of its own overrides it, calls super first, and inscribes them the same way: as own props, tattooed or
  // adorned, never as #fields, which do not exist while the base constructor runs.
  protected assignInitialProps(combined: Fetched<RecordT, SparseT>): void {
    const { registered_at, vault_tok } = combined
    tattoo(this, { ...this.scope, registered_at, vault_tok }, { writable: false, configurable: false })
  }

  // Set every prop that follows the record in hand. The concrete class sets its own after calling this.
  protected assign(record: Fetched<RecordT, SparseT>): void {
    tattoo(this, revisionPropsOf(record), { configurable: false })
  }

  // --

  // == [Identity and forms]: combined, central, staged, cacheable, sparse, isGone, isHydrated, hasStaged, toJSON

  /** Staged (uncommitted changes) if any -- otherwise central (the most recent view of the stored record) */
  protected get combined(): Fetched<RecordT, SparseT> { return this.#staged }

  /** Central (the most recent view of the stored record) */
  protected get central(): Fetched<RecordT, SparseT> { return this.#central }

  /** Staged (uncommitted changes) */
  protected get staged(): Fetched<RecordT, SparseT> { return this.#staged }

  // The copy the listing writes to the device cache
  get cacheable(): MSX.Cacheable<RecordT, SparseT> {
    return Object.freeze({ ...this.sparseOf(this.#central), central: this.#central, staged: this.#staged })
  }

  // The sparse form of central -- everything but the payload (heavy mutable props)
  get sparse(): SparseT { return this.sparseOf(this.#central) }

  // The record in hand is full: central is, or a full record is staged.
  get isFull(): boolean { return this.whole() !== null }

  // Something is staged: the record in hand is under a revision central is not.
  get hasStaged(): boolean { return this.#staged.revision_tok !== this.#central.revision_tok }

  toJSON(): SparseT { return this.sparse }
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

  /** Replace the snapshot with a new one, and notify all listeners. Before the first read there is none to replace: the read makes it. */
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

  // == [Guards]: isTimely, isLocked, demandUnlocked, present, demandPresent, whole, demandWhole, ensureReadyToFetch, ensureReadyToEdit, demandReadyToEdit, ensureReadyToSend, demandReadyToSend, ensureReadyToDel, demandReadyToDel

  get isTimely(): boolean { return this.#trigger.isTimely }

  isLocked(): boolean { return this.listing.lockState() === 'locked' }

  demandUnlocked(): this {
    if (this.isLocked()) { throw lockedError() }
    return this
  }

  // The record in hand where it is not a tombstone, else null: the thing is present, and no `del` is sending.
  present(): SparseT | null { return MSX.isTombstone(this.combined) ? null : this.combined }

  demandPresent(): SparseT {
    const present = this.present()
    if (present === null) { throw this.listing.absentRefusal(this.scope) }
    return present
  }

  // The record in hand where it is the full record `send` puts, else null.
  whole(): RecordT | null {
    const present = this.present()
    return present !== null && this.isFullRecord(present) ? present : null
  }

  demandWhole(): RecordT {
    const whole = this.whole()
    if (whole === null) { throw new VaultError('bad_option', 'This record is not whole, so there is nothing to send: hydrate it, or edit a whole record in, and call again.') }
    return whole
  }

  // A fetch needs only the world timely: it takes no lock, and may find the thing gone.
  async ensureReadyToFetch(opts: TimelyOpts = {}): Promise<this> {
    await this.listing.ensureTimelyWorld(opts)
    return this
  }

  async ensureReadyToEdit(opts: TimelyOpts = {}): Promise<this> {
    await this.hydrate(opts)
    return this.demandReadyToEdit()
  }

  demandReadyToEdit(): this {
    this.demandUnlocked()
    this.demandPresent()
    return this
  }

  async ensureReadyToSend(opts: TimelyOpts = {}): Promise<this> {
    await this.hydrate(opts)
    return this.demandReadyToSend()
  }

  demandReadyToSend(): this {
    this.demandReadyToEdit()
    this.demandWhole()
    return this
  }

  async ensureReadyToDel(opts: TimelyOpts = {}): Promise<this> {
    await this.hydrate(opts)
    return this.demandReadyToDel()
  }

  demandReadyToDel(): this { return this.demandReadyToEdit() }
  // --

  // == [Storable ops]: hydrate, fetch, edit, send, del, each with its try form

  async fetch(opts: FetchOpts = {}): Promise<this> {
    await this.ensureReadyToFetch(opts)
    demandReadyToFetch(opts)
    await this.listing.fetchRecordOf(this)
    return this
  }

  tryFetch(opts: FetchOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.fetch(opts)) }

  // The world timely first, as its answer may lock the vault or take the thing away; then the record in hand, by the horizon given. Calls made during a fetch join it.
  async hydrate(opts: TimelyOpts = {}): Promise<this> {
    await this.ensureReadyToFetch(opts)
    await this.#trigger.ensureTimelyWithin(opts.maxMillisSinceRefresh)
    return this
  }

  tryHydrate(opts: TimelyOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.hydrate(opts)) }

  // Lay `patch` over the record in hand under the next revision, through the concrete class's `makeStaged`; reconcile the result in as the staged; settle. Central is untouched; nothing is stored.
  async edit(patch: PatchT, opts: EditOpts = {}): Promise<this> {
    await this.ensureReadyToEdit(opts)
    const nextRevision = this.nextRevision(this.#central)
    const made = await this.makeStaged({ ...this.demandPresent(), ...nextRevision, written_at: this.world.clock.now() }, patch, opts)
    this.demandReadyToEdit()   // drift while making it: the vault may have locked, or the thing gone
    this.adopt(this.#central, this.reconcileStaged({ act: 'edit', central: this.#central, staged: this.#staged, patch: made, nextRevision }))
    this.settle()
    return this
  }

  tryEdit(patch: PatchT, opts: EditOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.edit(patch, opts)) }

  // `edit`, then put the staged. `putRecordOf` resolves once the answer is received, cached, its bad news told and the listing settled; a 'stale_write' refusal delivers the record storage holds, then throws.
  async send(patch: PatchT, opts: SendOpts = {}): Promise<this> {
    await this.edit(patch, opts)
    this.demandReadyToSend()
    await this.listing.putRecordOf(this, this.demandWhole())
    return this
  }

  trySend(patch: PatchT, opts: SendOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.send(patch, opts)) }

  // Stage a tombstone under the next revision; ask the listing to delete. Its answer, the stored tombstone, makes the thing gone.
  async del(opts: TimelyOpts = {}): Promise<this> {
    await this.ensureReadyToDel(opts)
    const nextRevision = this.nextRevision(this.#central)
    this.adopt(this.#central, this.reconcileStaged({ act: 'del', central: this.#central, staged: this.#staged, nextRevision }))
    this.settle()
    await this.listing.delRecordOf(this)
    return this
  }

  tryDel(opts: TimelyOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.del(opts)) }
  // --

  // == [Receiving]: receive, adopt, settle, tombstoneFor

  /** Take in what storage said about this thing: `rcvd`, or null for nothing stored, which reads as a tombstone at the
   * revision held. `damaged` says the listing could not validate it, and recovered only its scope, vault_tok and revision.
   * `reconcileCentral` judges it; on 'older', 'same' or 'skip' the receive ends there; otherwise `reconcileStaged` judges
   * the staged against the new central, both are adopted, and the thing settles. A full record or a tombstone makes the
   * record timely, even one that only confirms central.
   */
  receive(rcvd: Fetched<RecordT, SparseT> | null, { damaged = false }: { damaged?: boolean | undefined } = {}): Settled {
    const answer = rcvd ?? this.tombstoneFor(this.#central)
    const rcvdShape = this.classifyRecordShape(answer, damaged)
    const { central, policy } = this.reconcileCentral(answer, rcvdShape)
    if (rcvdShape === 'full' || rcvdShape === 'gone') { this.#trigger.noteSuccessNow() }
    const act = MSX.receivedAct.safeParse(policy)
    if (! act.success) { return { badnews: [] } }
    this.adopt(central, this.reconcileStaged({ act: act.data, central: this.#central, staged: this.#staged, rcvd: answer, nextRevision: this.nextRevision(central) }))
    return this.settle()
  }

  // Hold both, frozen, and assign the props of the record in hand; the snapshot waits for `settle`.
  protected adopt(central: Fetched<RecordT, SparseT>, staged: Fetched<RecordT, SparseT>): void {
    this.#central = Object.freeze(central)
    this.#staged = Object.freeze(staged)
    this.assign(this.combined)
  }

  // Act on the state as adopted, idempotently: the base replaces the snapshot and tells no news.
  // Subclasses: must call super, last so that the snapshot sees it.
  settle(): Settled {
    this.#replaceSnapshot()
    return { badnews: [] }
  }

  // A tombstone made here, from the sparse props held, under `revision`, written now: `am` 'x' for a deletion, 'd' for damage.
  protected tombstoneFor(revision: Revision, am: 'd' | 'x' = 'x'): Tombstone<SparseT> {
    const { revision_tok, revision_seq } = revision
    return { ...this.sparse, revision_tok, revision_seq, written_at: this.world.clock.now(), am }
  }

  protected nextRevision(ante: Revision): Revision {
    return { revision_tok: randomId(), revision_seq: ante.revision_seq + 1 }
  }
  // --

  // == [Reconcile]: reconcileCentral, reconcileStaged, classifyRecordShape

  /** The central that results from `rcvd` meeting the central held, and the policy that names the row taken. The staged is not consulted.
   *
   * | age   | rcvd   | central | policy                   | central after |
   * | ----- | ------ | ------- | ------------------------ | ------------- |
   * | older | any    | any     | 'older'                  | central       |
   * | older | gone   | any     | 'older'                  | central       |
   * | older | ouch   | any     | 'skip'                   | central       |
   * |       |        |         |                          |               |
   * | same  | gone   | alive   | throw 'corrupt_record'   | -             |
   * | same  | alive  | gone    | throw 'corrupt_record'   | -             |
   * | same  | sparse | any     | 'same'                   | central       |
   * | same  | gone   | gone    | 'same'                   | central       |
   * | same  | full   | full    | 'same'                   | central       |
   * | same  | full   | sparse  | 'fill'                   | rcvd          |
   * | same  | ouch   | any     | 'skip'                   | central       |
   * |       |        |         |                          |               |
   * | newer | sparse | any     | 'adopt'                  | rcvd          |
   * | newer | full   | any     | 'adopt'                  | rcvd          |
   * | newer | gone   | any     | 'gone'                   | rcvd          |
   * | newer | ouch   | any     | 'ouch'                   | ouchstone     |
   * |       |        |         |                          |               |
   *
   * The age is `cmpRevisions(central, rcvd)`, which refuses the same seq under another tok. An ouchstone is a tombstone
   * made here, 'd' under the damaged record's revision: nothing else of the damaged record is kept.
   */
  protected reconcileCentral(rcvd: Fetched<RecordT, SparseT>, rcvdShape: RecordShape): Reconciled<RecordT, SparseT> { // eslint-disable-line sonarjs/cognitive-complexity
    const central = this.#central
    const age = cmpRevisions(central, rcvd)
    const centralShape = this.classifyRecordShape(central)
    if ((age === 'older') && (rcvdShape === 'ouch'))             { return { central, policy: 'skip' } }
    if ((age === 'older'))                                       { return { central, policy: 'older' } }
    if ((age === 'same')) {
      if ((rcvdShape !== 'gone') && (centralShape === 'gone'))   { throw new VaultError('corrupt_record', OneRevisionTwoFates) }
      if ((rcvdShape === 'gone') && (centralShape !== 'gone'))   { throw new VaultError('corrupt_record', OneRevisionTwoFates) }
      if ((rcvdShape === 'ouch'))                                { return { central, policy: 'skip' } }
      if ((rcvdShape === 'gone') && (centralShape === 'gone'))   { return { central, policy: 'same' } }
      if ((rcvdShape === 'sparse'))                              { return { central, policy: 'same' } }
      if ((rcvdShape === 'full') && (centralShape === 'full'))   { return { central, policy: 'same' } }
      if ((rcvdShape === 'full') && (centralShape === 'sparse')) { return { central, policy: 'fill' } }
    } else {
      if (rcvdShape === 'gone') { return { central: rcvd, policy: 'gone' } }
      if (rcvdShape === 'ouch') { return { central: this.tombstoneFor(rcvd, 'd'), policy: 'ouch' } }
      return { central: rcvd, policy: 'adopt' }
    }
    throw new VaultError('unexpected_error', 'An unexpected shape was reconciled: a bug in Storable.')
  }

  /** The staged that replaces the one held, given a new central (fill, adopt, gone, ouch) or a verb called here (edit, del).
   * An implementation reads `forms` and nothing else: never an own prop. Nothing staged is the staged being central.
   *
   * | act             | staged after                                                                                   |
   * | --------------- | ---------------------------------------------------------------------------------------------- |
   * | `edit`          | `{ ...central, ...staged, ...patch, ...nextRevision }`                                         |
   * | `fill`, `adopt` | `rcvd`, the new central, where nothing is staged or the staged is now stored; else `{ ...rcvd, ...staged, ...nextRevision }` |
   * | `del`, `ouch`   | `tombstoneFor(nextRevision, am)`: 'x' for del, 'd' for ouch                                    |
   * | `gone`          | `rcvd`, the tombstone: a deletion seen, from any device, drops the staged                      |
   *
   * @param forms.act          - The row to take.
   * @param forms.central      - The central held.
   * @param forms.staged       - The staged held: central itself where nothing is staged.
   * @param forms.rcvd         - For a ReceivedAct, the record storage delivered, as it came.
   * @param forms.patch        - For edit, the record `makeStaged` made of the patch, whole and sealed.
   * @param forms.nextRevision - The revision after the central that results, minted once.
   */
  protected reconcileStaged(forms: StagedForms<RecordT, SparseT>): Fetched<RecordT, SparseT> {
    MSX.stagedForms.parse(forms)
    const { act, central, staged, rcvd, patch, nextRevision } = forms
    if (act === 'edit') { return { ...central, ...staged, ...patch, ...nextRevision } }
    if (act === 'del')  { return this.tombstoneFor(nextRevision) }
    if (act === 'ouch') { return this.tombstoneFor(nextRevision, 'd') }
    const nothingStaged = staged.revision_tok === central.revision_tok
    const stagedStored  = staged.revision_tok === rcvd.revision_tok
    if (act === 'gone' || nothingStaged || stagedStored) { return rcvd }
    if (MSX.isTombstone(staged)) { return { ...staged, ...nextRevision } }
    return { ...rcvd, ...staged, ...nextRevision }
  }

  /** The shape of `record`:
   * 'ouch' for damaged,
   * 'gone' for a tombstone,
   * 'full' for a record carrying its full payload,
   * 'sparse' for a record missing some fields from the database.
   * */
  protected classifyRecordShape(record: Fetched<RecordT, SparseT>, damaged = false): RecordShape {
    if (damaged)                       { return 'ouch' }
    if (MSX.isTombstone(record))       { return 'gone' }
    if (this.isFullRecord(record))     { return 'full' }
    return 'sparse'
  }
  // --

  // == [What the concrete class defines]: scopeOf, isFullRecord, sparseOf, makeStaged, makeSnapshot

  protected abstract scopeOf(fetched: Fetched<RecordT, SparseT>): ScopeT
  protected abstract isFullRecord(fetched: SparseT): fetched is RecordT
  protected abstract sparseOf(record: SparseT): SparseT
  // The step of `edit` only the concrete class can take: `base` is the record in hand, sparse or full, under its next
  // revision; lay the patch over it and seal what needs sealing. The record it returns is held as the staged, whole.
  protected abstract makeStaged(base: SparseT, patch: PatchT, opts: EditOpts): Promise<RecordT>
  protected abstract makeSnapshot(): SnapshotT
  // --
}
// --

// == [Helpers]: OneRevisionTwoFates, revisionPropsOf, tattoo

const OneRevisionTwoFates = 'Storage and this device hold one revision of a record, and only one of them holds it deleted: the record cannot be trusted until it is read again.'

// The own props that follow the record in hand.
const revisionPropsOf = ({ revision_tok, revision_seq, written_at }: Revision & Times): Revision & Pick<Times, 'written_at'> => ({ revision_tok, revision_seq, written_at })

// A placeholder until the helpers worker lands `tattoo`; then this goes and the import takes its place.
const tattoo = <BT extends object>(obj: object, shown: BT, opts: { writable?: boolean, configurable?: boolean } = {}): BT => {
  for (const [ckey, val] of Object.entries(shown)) {
    Object.defineProperty(obj, ckey, { value: val, enumerable: true, writable: opts.writable ?? true, configurable: opts.configurable ?? true })
  }
  return shown
}
// --
