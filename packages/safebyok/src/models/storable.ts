import type * as Z from 'zod'
import { Checker, objCheck } from '../checks/validator'
import { randomId } from '../crypto'
import { VaultError } from '../errors'
import { adorn } from '../helpers'
import { type Outcome, outcomeOf } from '../outcome'
import type { Clock } from '../shapes/bank-opts'
import { stableJsonify } from '../stable-jsonify'
import { Trigger } from '../utils/trigger'

// == [Record forms]: Revision, Times, Tombstone, Fetched, Dna, Staged, Cacheable, Settled, CentralPolicy, Reconciled, StagedPolicy, NeverStoredSeq, isTombstone

export type Revision = Readonly<{ revision_tok: string, revision_seq: number }>

// When the thing was first stored, and when the record in hand was written; on a tombstone, when it was deleted.
export type Times = Readonly<{ registered_at: number, written_at: number }>

// Scope, revision and times stay on a tombstone, for the record; nothing the user put in the thing does.
export type Tombstone<ScopeT> = ScopeT & Revision & Times & Readonly<{ deleted: true }>

/** Outcome `val` of storage calls: the full record, its sparse form, or its tombstone. */
export type Fetched<ScopeT, RecordT, SparseT> = RecordT | SparseT | Tombstone<ScopeT>

// The DNA of a storable, what a caller hands `listing.make`: the scope, and any of the record's props; those the factory controls are ignored.
export type Dna<ScopeT, RecordT> = ScopeT & Partial<RecordT>

// The staged: the whole record edited here and not yet sent, a tombstone while `del` is sending, or null when nothing is edited.
export type Staged<ScopeT, RecordT> = RecordT | Tombstone<ScopeT> | null

// What the listing writes to the device cache: the sparse form (or the tombstone), then central and the staged as they stand.
export type Cacheable<ScopeT, RecordT, SparseT> = (SparseT | Tombstone<ScopeT>) & Readonly<{
  central: Fetched<ScopeT, RecordT, SparseT>
  staged: Staged<ScopeT, RecordT>
}>

// Bag `settle` and `receive` hand back: news to tell the host once. What to cache is the instance's `cacheable`.
export type Settled = Readonly<{ badnews: readonly VaultError[] }>

// What `reconcileCentral` says of an answer: older than central, the same, filling a sparse central at the same revision, or the newer, to adopt.
export type CentralPolicy = 'older' | 'same' | 'fill' | 'adopt'
export type Reconciled<ScopeT, RecordT, SparseT> = Readonly<{ central: Fetched<ScopeT, RecordT, SparseT>, policy: CentralPolicy }>

// What brought `reconcileStaged` a staged: a central policy past 'same', or the verb that begins one.
export type StagedPolicy = CentralPolicy | 'edit' | 'del'

// The revision_seq of a central nothing has stored: a new thing is born with central at -1 and its staged at 0.
export const NeverStoredSeq = -1

export const isTombstone = <ScopeT>(fetched: object): fetched is Tombstone<ScopeT> => (
  'deleted' in fetched && fetched.deleted === true
)

/** Policies when writing to an already-existing record: replace it, throw an error, return it instead */
export const IfPresentValues = ['replace', 'fail', 'fetch'] as const
/** Policy when writing to an already-existing record: replace it, throw an error, return it instead */
export const ifPresent = Checker(({ oneof }) => oneof(IfPresentValues))
export type  IfPresent = Z.infer<typeof ifPresent>

/** What a storable asks of its listing: World, StorableListing */
export type LockState = 'unlocked' | 'locked'

// The world a listing lives in: the vault for boxes, the bank for vaults. The one clock lives here.
export type World = { clock: Clock }

export type StorableListing<ScopeT extends object, RecordT extends SparseT, SparseT extends ScopeT & Revision & Times> = {
  world: World
  clock: Clock
  lockState(): LockState
  ensureTimelyWorld(opts: TimelyOpts): Promise<void>
  absentRefusal(scope: ScopeT): VaultError
  fetchRecordOf(thing: Storable<ScopeT, RecordT, SparseT, unknown, unknown>): Promise<void>
  putRecordOf(thing: Storable<ScopeT, RecordT, SparseT, unknown, unknown>, record: RecordT): Promise<void>
  delRecordOf(thing: Storable<ScopeT, RecordT, SparseT, unknown, unknown>): Promise<void>
}

// What a storable is made with: its world and listing, the record it holds as central (and the staged, when revived from the cache), and its refresh horizon.
export type StorableOpts<ScopeT extends object, RecordT extends SparseT, SparseT extends ScopeT & Revision & Times> = {
  world:                  World
  listing:                StorableListing<ScopeT, RecordT, SparseT>
  central:                Fetched<ScopeT, RecordT, SparseT>
  staged?:               Staged<ScopeT, RecordT> | undefined
  maxMillisSinceRefresh:  number
  // The trigger's: the fraction of the horizon after which the next refresh is scheduled.
  eagerFrac?:             number | undefined
}

// The shape of a StorableOpts, as far as the base can tell: the concrete class's validator judges the records. Checks only; the bag goes on as it came.
const storableOptsShape = objCheck(({ obj, fn, custom, str, int, num, epochMillis }) => {
  const revised = obj({ revision_tok: str, revision_seq: int, registered_at: epochMillis, written_at: epochMillis })
  return {
    world:                 obj({ clock: obj({ now: fn<Clock['now']>() }) }),
    listing:               obj({ lockState: fn(), ensureTimelyWorld: fn(), absentRefusal: fn(), fetchRecordOf: fn(), putRecordOf: fn(), delRecordOf: fn() }),
    central:               revised,
    staged:               revised.nullable().optional(),
    maxMillisSinceRefresh: num.nonnegative().or(custom<number>((val) => val === Infinity)),
    eagerFrac:             num.positive().max(1).optional(),
  }
}, 'bad_option')

// == [Options]: TimelyOpts, SendOpts, EditOpts

// How fresh the record in hand and the world must be before a verb goes on. The world reads `maxWorldMillis`; the record, `maxMillisSinceRefresh`.
export type TimelyOpts = { maxMillisSinceRefresh?: number | undefined, maxWorldMillis?: number | undefined }

// What `send` does when storage already holds the thing a draft is sent as. Not yet acted on.
export type SendOpts = TimelyOpts & { ifPresent?: 'replace' | 'fail' | 'fetch' | undefined }

export type EditOpts = TimelyOpts

// == [Storable]

export abstract class Storable<ScopeT extends object, RecordT extends SparseT, SparseT extends ScopeT & Revision & Times, PatchT, SnapshotT> {
  readonly scope: ScopeT

  // Adorned in the constructor: readable, left out of enumeration and JSON.
  declare readonly world:   World
  declare readonly listing: StorableListing<ScopeT, RecordT, SparseT>

  // Tattooed with the scope, immutably.
  declare readonly registered_at: number

  // The revision and time of the record in hand, as plain props: tattooed writable, and set by `assign` at each adopt.
  declare revision_tok:  string
  declare revision_seq:  number
  declare written_at:    number

  // The most recent stored value this device knows: full, sparse, or a tombstone; at NeverStoredSeq for a thing never stored.
  #central: Fetched<ScopeT, RecordT, SparseT>
  // The record edited here and not yet sent, whole and under the next revision, so `send` can put it as it is; a tombstone while `del` is sending. Null when nothing is edited.
  #staged: Staged<ScopeT, RecordT>
  // Made on first read, and again by `settle`: the concrete class's fields do not exist while the base constructor runs.
  #snapshot: SnapshotT | null = null
  readonly #trigger: Trigger<SnapshotT, void>
  readonly #listeners = new Set<() => void>()

  // Holds what it is given and seals itself. Nothing is adopted or settled here: the concrete class's fields do not exist yet, so the listing calls `initialize` next.
  constructor(opts: StorableOpts<ScopeT, RecordT, SparseT>) {
    storableOptsShape.parse(opts)
    const { world, listing, central, staged, maxMillisSinceRefresh, eagerFrac } = opts
    adorn(this, 'world', world)
    adorn(this, 'listing', listing)
    this.scope = this.scopeOf(central)
    tattoo(this, { ...this.scope, registered_at: central.registered_at }, { writable: false, configurable: false })
    tattoo(this, { revision_tok: central.revision_tok, revision_seq: central.revision_seq, written_at: central.written_at }, { configurable: false })
    this.#central = Object.freeze(central)
    this.#staged = staged === undefined || staged === null ? null : Object.freeze(staged)
    this.#trigger = new Trigger({
      clock:       world.clock,
      maxMillis:   maxMillisSinceRefresh,
      eagerFrac,
      doSnapshot:  () => this.snapshot,
      doTryLaunch: () => outcomeOf(() => this.listing.fetchRecordOf(this)),
    })
    Object.seal(this)
  }

  // The listing calls it once, after construction: central and the staged it was born with go through adopt and settle, as every later change does.
  initialize(): Promise<Settled> {
    this.adopt(this.#central, this.#staged)
    return this.settle()
  }

  // Set every prop that follows the record in hand. The concrete class sets its own after calling this.
  protected assign(record: Fetched<ScopeT, RecordT, SparseT>): void {
    this.revision_tok = record.revision_tok
    this.revision_seq = record.revision_seq
    this.written_at = record.written_at
  }

  // == [Identity and forms]: combined, central, staged, cacheable, sparse, isGone, isHydrated, hasStaged, toJSON

  // The record in hand: the staged where one is begun, else central.
  protected get combined(): Fetched<ScopeT, RecordT, SparseT> { return this.#staged ?? this.#central }

  protected get central(): Fetched<ScopeT, RecordT, SparseT> { return this.#central }

  protected get staged(): Staged<ScopeT, RecordT> { return this.#staged }

  // What the listing writes to the device cache after a `receive`: the sparse form (the tombstone, for a thing gone), then central and the staged as they stand, frozen.
  get cacheable(): Cacheable<ScopeT, RecordT, SparseT> {
    const head = isTombstone(this.#central) ? this.#central : this.sparseOf(this.#central)
    return Object.freeze({ ...head, central: this.#central, staged: this.#staged })
  }

  get sparse(): SparseT | null {
    if (isTombstone(this.#central)) { return null }
    return this.sparseOf(this.#central)
  }

  get isGone(): boolean { return isTombstone(this.#central) }

  // The record in hand is full: central is, or a staged is begun.
  get isHydrated(): boolean {
    const { combined } = this
    return ! isTombstone(combined) && this.isFullRecord(combined)
  }

  get hasStaged(): boolean { return this.#staged !== null }

  toJSON(): SparseT | null { return this.sparse }
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

  /** Replace the snapshot with a new one, and notify all listeners */
  #replaceSnapshot(): void {
    const nextSnapshot = this.makeSnapshot()
    if (this.#snapshot !== null && this.sameSnapshot(nextSnapshot, this.#snapshot)) { return }
    this.#snapshot = nextSnapshot
    this.#listeners.forEach((listener) => { listener() })
  }
  /** Compare two snapshots for equality: notifications are not sent if old and new are the same */
  protected sameSnapshot(next: SnapshotT, current: SnapshotT): boolean {
    return stableJsonify(next) === stableJsonify(current)
  }
  // --

  // == [Guards]: isTimely, isLocked, demandUnlocked, demandNotGone, ensureReadyToFetch, ensureReadyToEdit, demandReadyToEdit, ensureReadyToSend, demandReadyToSend, ensureReadyToDel, demandReadyToDel

  get isTimely(): boolean { return this.#trigger.isTimely }

  isLocked(): boolean { return this.listing.lockState() === 'locked' }

  demandUnlocked(): this {
    if (this.isLocked()) {
      throw new VaultError('vault_locked', 'The vault is locked, so nothing in it can be opened or stored: unlock it and call again.')
    }
    return this
  }

  // Neither central nor the staged is a tombstone: the thing is not gone, and no `del` is sending.
  demandNotGone(): this {
    if (isTombstone(this.combined)) { throw this.listing.absentRefusal(this.scope) }
    return this
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
    return this.demandNotGone()
  }

  async ensureReadyToSend(opts: TimelyOpts = {}): Promise<this> {
    await this.hydrate(opts)
    return this.demandReadyToSend()
  }

  demandReadyToSend(): this {
    this.demandReadyToEdit()
    this.#whole()
    return this
  }

  async ensureReadyToDel(opts: TimelyOpts = {}): Promise<this> {
    await this.hydrate(opts)
    return this.demandReadyToDel()
  }

  demandReadyToDel(): this { return this.demandReadyToEdit() }

  // The record in hand as the full record `send` puts; 'bad_option' when it is not whole.
  #whole(): RecordT {
    const { combined } = this
    if (isTombstone(combined) || ! this.isFullRecord(combined)) {
      throw new VaultError('bad_option', 'This record is not whole, so there is nothing to send: hydrate it, or edit a whole record in, and call again.')
    }
    return combined
  }
  // --

  // == [Storable ops]: hydrate, edit, send, del, each with its try form

  // The world timely first, as its answer may lock the vault or take the thing away; then the record in hand, by the horizon given. Calls made during a fetch join it.
  async hydrate(opts: TimelyOpts = {}): Promise<this> {
    await this.ensureReadyToFetch(opts)
    await this.#trigger.ensureTimelyWithin(opts.maxMillisSinceRefresh)
    return this
  }

  tryHydrate(opts: TimelyOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.hydrate(opts)) }

  // Lay `patch` over the record in hand under the next revision, through the concrete class's `makeStaged`; hold the result as the staged; settle. Central is untouched; nothing is stored.
  async edit(patch: PatchT, opts: EditOpts = {}): Promise<this> {
    await this.ensureReadyToEdit(opts)
    const base = this.#notGone()
    const staged = await this.makeStaged({ ...base, ...this.nextRevision(), written_at: this.world.clock.now() }, patch, opts)
    this.demandReadyToEdit()   // drift while making it: the vault may have locked, or the thing gone
    this.adopt(this.#central, this.reconcileStaged('edit', this.#central, staged))
    await this.settle()
    return this
  }

  tryEdit(patch: PatchT, opts: EditOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.edit(patch, opts)) }

  // `edit`, then put the staged. `putRecordOf` resolves once the answer is received, cached, its bad news told and the listing settled; a 'stale_write' refusal delivers the record storage holds, then throws.
  async send(patch: PatchT, opts: SendOpts = {}): Promise<this> {
    await this.edit(patch, opts)
    this.demandReadyToSend()
    await this.listing.putRecordOf(this, this.#whole())
    return this
  }

  trySend(patch: PatchT, opts: SendOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.send(patch, opts)) }

  // Hold a tombstone under the next revision as the staged; ask the listing to delete. Its answer, the stored tombstone, makes the thing gone.
  async del(opts: TimelyOpts = {}): Promise<this> {
    await this.ensureReadyToDel(opts)
    const tombstone: Tombstone<ScopeT> = { ...this.scope, ...this.nextRevision(), registered_at: this.registered_at, written_at: this.world.clock.now(), deleted: true }
    this.adopt(this.#central, this.reconcileStaged('del', this.#central, tombstone))
    await this.settle()
    await this.listing.delRecordOf(this)
    return this
  }

  tryDel(opts: TimelyOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.del(opts)) }

  // The record in hand, which the guards have found not gone.
  #notGone(): SparseT {
    const { combined } = this
    if (isTombstone(combined)) { throw this.listing.absentRefusal(this.scope) }
    return combined
  }
  // --

  // == [Receiving]: receive, reconcileCentral, reconcileStaged, adopt, settle

  // The listing hands in what storage said about this thing, or null for nothing stored. Judge it against central; where it is the newer or the fuller, judge the staged against it, adopt both, settle. A whole answer makes the record timely, even one that only confirms central.
  async receive(fetched: Fetched<ScopeT, RecordT, SparseT> | null): Promise<Settled> {
    const answer = fetched ?? this.#absenceAsTombstone()
    const { central, policy } = this.reconcileCentral(answer)
    if (isTombstone(answer) || this.isFullRecord(answer)) { this.#trigger.noteSuccessNow() }
    if (policy === 'older' || policy === 'same') { return { badnews: [] } }
    this.adopt(central, this.reconcileStaged(policy, central, this.#staged))
    return this.settle()
  }

  // Judge `fetched` against central alone, staged unseen: the record that stands, and the policy that says why. Refusals throw.
  protected reconcileCentral(fetched: Fetched<ScopeT, RecordT, SparseT>): Reconciled<ScopeT, RecordT, SparseT> {
    const held = this.#central
    if (fetched.revision_seq < held.revision_seq) { return { central: held, policy: 'older' } }
    if (fetched.revision_seq > held.revision_seq) { return { central: fetched, policy: 'adopt' } }
    if (fetched.revision_tok !== held.revision_tok) {
      throw new VaultError('corrupt_record', 'Storage holds a record at the same revision_seq as this device, under another revision_tok: two writes landed as one revision, so neither can be trusted until the record is read again.')
    }
    if (isTombstone(fetched)) {
      if (held.revision_seq === NeverStoredSeq) { return { central: held, policy: 'same' } }   // nothing stored yet, as expected of a thing never stored: it waits for its first send
      throw this.listing.absentRefusal(this.scope)                                            // absence, or a tombstone, at the very revision held
    }
    if (isTombstone(held)) { return { central: held, policy: 'same' } }
    if (! this.isFullRecord(held) && this.isFullRecord(fetched)) { return { central: fetched, policy: 'fill' } }
    return { central: held, policy: 'same' }
  }

  // What becomes of `staged` once `central` stands, by what brought it: `edit` and `del` begin it; a `fill` leaves it; a newer central spends it when storage holds what it sent or the thing is gone, and otherwise leaves it, over a central it no longer follows, for the next `edit` to make again.
  protected reconcileStaged(policy: StagedPolicy, central: Fetched<ScopeT, RecordT, SparseT>, staged: Staged<ScopeT, RecordT>): Staged<ScopeT, RecordT> {
    if (staged === null || policy !== 'adopt') { return staged }
    if (isTombstone(central) || central.revision_tok === staged.revision_tok) { return null }
    return staged
  }

  // Hold both, frozen, and assign the props of the record in hand; the snapshot waits for `settle`.
  protected adopt(central: Fetched<ScopeT, RecordT, SparseT>, staged: Staged<ScopeT, RecordT>): void {
    this.#central = Object.freeze(central)
    this.#staged = staged === null ? null : Object.freeze(staged)
    this.assign(this.combined)
  }

  // Act on the state as adopted, idempotently: the base replaces the snapshot and tells no news. A concrete class does its own work first and calls super last, so the snapshot sees it.
  settle(): Promise<Settled> {
    this.#replaceSnapshot()
    return Promise.resolve({ badnews: [] })
  }

  // Nothing stored, as a tombstone at the revision central holds: reconcile reads it as "gone at the very revision held", which a thing never stored survives.
  #absenceAsTombstone(): Tombstone<ScopeT> {
    const { revision_tok, revision_seq } = this.#central
    return { ...this.scope, revision_tok, revision_seq, registered_at: this.registered_at, written_at: this.world.clock.now(), deleted: true }
  }
  // --

  // == [Versioning]: nextRevision

  protected nextRevision(): Revision {
    return { revision_tok: randomId(), revision_seq: this.#central.revision_seq + 1 }
  }
  // --

  // == [What the concrete class defines]: scopeOf, isFullRecord, sparseOf, makeStaged, makeSnapshot

  protected abstract scopeOf(fetched: Fetched<ScopeT, RecordT, SparseT>): ScopeT
  protected abstract isFullRecord(fetched: SparseT): fetched is RecordT
  protected abstract sparseOf(record: SparseT): SparseT
  // The step of `edit` only the concrete class can take: `base` is the record in hand, sparse or full, under its next
  // revision; lay the patch over it and seal what needs sealing. What comes back is held as the staged, whole.
  protected abstract makeStaged(base: SparseT, patch: PatchT, opts: EditOpts): Promise<RecordT>
  protected abstract makeSnapshot(): SnapshotT
  // --
}

// == [Helpers]: tattoo

// Stands in until the helpers worker lands `tattoo`; then this goes and the import takes its place.
const tattoo = <BT extends object>(obj: object, shown: BT, opts: { writable?: boolean, configurable?: boolean } = {}): BT => {
  for (const [ckey, val] of Object.entries(shown)) {
    Object.defineProperty(obj, ckey, { value: val, enumerable: true, writable: opts.writable ?? true, configurable: opts.configurable ?? true })
  }
  return shown
}
// --
