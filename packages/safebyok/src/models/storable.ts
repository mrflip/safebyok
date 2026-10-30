import type * as Z from 'zod'
import { Checker } from '../checks/validator.js'
import { VaultError } from '../errors'
import { type Outcome, outcomeOf } from '../outcome'
import type { Clock } from '../shapes/bank-opts'
import { stableJsonify } from '../stable-jsonify'
import { Trigger } from '../utils/trigger'

// == [Record forms]: Revision, Times, Tombstone, Fetched, Draft, Received, isTombstone

export type Revision = Readonly<{ revision_tok: string, revision_seq: number }>

// When the thing was first stored, and when the record in hand was written; on a tombstone, when it was deleted.
export type Times = Readonly<{ registered_at: number, written_at: number }>

// Scope, revision and times stay on a tombstone, for the record; nothing the user put in the thing does.
export type Tombstone<ScopeT> = ScopeT & Revision & Times & Readonly<{ deleted: true }>

/** Outcome `val` of storage calls: the full record, its sparse form, or its tombstone. */
export type Fetched<ScopeT, RecordT, SparseT> = RecordT | SparseT | Tombstone<ScopeT>

// Slop: What `make` takes for a thing that is not stored yet: its scope and any props the host sets, no revision or times.
// Properties for instatiating a storable: require the minimal props, accept the full record.
export type Draft<ScopeT, RecordT> = ScopeT & Partial<RecordT>

// Payload `receive` hands back to the listing: the copy to cache on the device, and news to tell.
export type Received<ScopeT, SparseT> = Readonly<{
  cacheable: SparseT | Tombstone<ScopeT>
  badnews:   readonly VaultError[]
}>

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
  delRecordOf(thing: Storable<ScopeT, RecordT, SparseT, unknown, unknown>, tombstone: Tombstone<ScopeT>): Promise<void>
}

export type StorableOpts<ScopeT extends object, RecordT extends SparseT, SparseT extends ScopeT & Revision & Times> = {
  listing:                StorableListing<ScopeT, RecordT, SparseT>
  maxMillisSinceRefresh:  number
}

// == [Options]: TimelyOpts, SendOpts, EditOpts

// How fresh the record in hand and the world must be before a verb goes on. `maxWorldMillis`: not yet.
export type TimelyOpts = { maxMillisSinceRefresh?: number | undefined, maxWorldMillis?: number | undefined }

// What `send` does when storage already holds the thing a draft is sent as. Not yet acted on.
export type SendOpts = TimelyOpts & { ifPresent?: 'replace' | 'fail' | 'fetch' | undefined }

export type EditOpts = TimelyOpts

// == [Storable]

/**
 * Storable props come in several flavors. These are managed by the storable:
 * - immutable props: the scope (eg `applabel`, `user_id`, `vaultlabel`), plus `registered_at`; Vault adds `vault_tok`
 * - envelope props: revision props (`revision_tok`, `revision_seq`, `written_at`), managed by the storable
 * Payload props are defined by the concrete class:
 * - in Vault, `gate_epoch` and gate props; in Box, `sidecar`, and the whisper / box key props
 *
 * The storable coordinates updates from other devices with local uncommitted changes by carrying
 * - `central`, the latest view of the centrally stored record;
 * - `overlay`, if data has been edited locally: a payload that will overwrite
 *    the stored values when `send` is called. New data `receive`d passes through
 *    `reconcile` to allow the overlay and central values to be merged
 *    (or refused if there is a problem). Any call to `edit` activates the overlay:
 *    even if there are no changes, and even if the offered patch is empty.
 *
 * Public props are exposed as own props or as accessors onto private props -- not onto the
 * captured records, as those gain and lose in ground truth as the storable is updated.
 *
 * A storable is instantiated using async `build` in one of three circumstances:
 *
 * - explicitly by host, giving props for an assumedly never-before-stored thing;
 * - listing's subscription reports a record it doesn't yet hold
 * - during warmup, loaded from the local DeviceDB cache
 * - when a listing operation contains records not yet held
 *
 * External updates to the `central` value come via `receive` (even when it's the result of an operation):
 *
 * - full:    an explicit fetch, yielding a full record
 * - sparse:  an explicit listing operation, yielding a sparse record
 * - full:    as metadata on certain refused calls, such as `stale_write` (which returns the stored record that won the race)
 * - full:    return value of a write operation, giving the full actual record stored
 * - full(§): subscribed notification of a record change ((§): notification-space-limited VaultDBs, eg Postgres, may omit payloads of large records)
 * - full:    in the case of vault, the `world` slot of any VaultDB call
 * - either:  in the case of vault, the `world` slot of any VaultDB subscription (depends on VaultDB capabilities)
 *
 * FIXME -- need to allow different timeliness windows for the object and the world
 *
 * FIXME -- PropsT is something an other agent hallucinated, rip that out
 */
export abstract class Storable<ScopeT extends object, RecordT extends SparseT, SparseT extends ScopeT & Revision & Times, PatchT, SnapshotT> {
  readonly scope:   ScopeT
  readonly #world:  World
  readonly listing: StorableListing<ScopeT, RecordT, SparseT>

  // The revision and times of the record in hand, as plain props. `assign` sets them; the concrete class's
  // constructor calls it once every field exists, then seals the instance.
  declare revision_tok:  string
  declare revision_seq:  number
  declare registered_at: number
  declare written_at:    number

  // The most recent stored value this device knows: full, sparse, or a tombstone. A thing is born holding one,
  // the listing's `make` having completed a draft into a record at revision_seq 0, the revision nothing stored has.
  #central: Fetched<ScopeT, RecordT, SparseT>
  // The local copy: the record as edited here and not yet sent (including a tombstone `del` is sending).
  #edited: RecordT | Tombstone<ScopeT> | null = null
  #snapshot: SnapshotT
  readonly #trigger: Trigger<SnapshotT, void>
  readonly #listeners = new Set<() => void>()

  constructor(world: World, listing: StorableListing<ScopeT, RecordT, SparseT>, central: Fetched<ScopeT, RecordT, SparseT>, opts: StorableOpts<ScopeT, RecordT, SparseT>) {
    this.#world = world
    this.listing = listing
    this.scope = this.scopeOf(central)
    tattoo(this, this.scope, { writable: false }) // assign scope props immutably
    this.#central = Object.freeze(central)
    this.#trigger = new Trigger({
      clock:                 this.#world.clock,
      maxMillisSinceSuccess: opts.maxMillisSinceRefresh,
      doSnapshot:            () => this.#snapshot,
      doTryLaunch:           () => outcomeOf(() => this.listing.fetchRecordOf(this)),
    })
    this.initialize()
    this.#snapshot = this.makeSnapshot()
  }

  // We need a way to attach other lifetime props or do other housekeeping before the snapshot is made. Subclasses must call super.initialize()
  protected initialize(): void { /* no-op */ }

  // Set every prop that follows the record in hand. The concrete class sets its own after calling this.
  protected assign(record: Fetched<ScopeT, RecordT, SparseT>): void {
    this.revision_tok = record.revision_tok
    this.revision_seq = record.revision_seq
    this.registered_at = record.registered_at
    this.written_at = record.written_at
  }

  // == [Identity and forms]: clock, record, central, edited, sparse, isGone, isHydrated, toJSON

  // The record in hand: the local copy where one is begun, else the stored one.
  // combines the envelope (core immutables and most-recent revision info)
  // with the payload (from the overlay, or from the central value if no overlay and it's full)
  // The design here is not clear yet: do we assemble on the fly
  // using
  // -
  protected get record(): Fetched<ScopeT, RecordT, SparseT> { return this.#edited ?? this.#central }

  protected get central(): Fetched<ScopeT, RecordT, SparseT> { return this.#central }

  protected get edited(): RecordT | Tombstone<ScopeT> | null { return this.#edited }

  get sparse(): SparseT | null {
    if (isTombstone(this.#central)) { return null }
    return this.sparseOf(this.#central)
  }

  get isGone(): boolean { return isTombstone(this.#central) }

  get isHydrated(): boolean { return ! isTombstone(this.#central) && this.isFullRecord(this.#central) }

  toJSON(): SparseT | null { return this.sparse }
  // --

  // == [Snapshot and subscription]: snapshot, getSnapshot, subscribe

  /** Direct public access to the snapshot */
  get snapshot(): SnapshotT { return this.#snapshot }
  /** Public access to the unbound "hand over yer snapshot" callback */
  get       getSnapshot(): () => SnapshotT { return this.#getSnapshot }
  /** Unbound callback to acquire the snapshot */
  readonly #getSnapshot = (): SnapshotT => this.#snapshot

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
    if (this.sameSnapshot(nextSnapshot, this.#snapshot)) { return }
    this.#snapshot = nextSnapshot
    this.#listeners.forEach((listener) => { listener() })
  }
  /** Compare two snapshots for equality: notifications are not sent if old and new are the same */
  protected sameSnapshot(next: SnapshotT, current: SnapshotT): boolean {
    return stableJsonify(next) === stableJsonify(current)
  }
  // --

  // == [Guards]: isTimely, ensureTimelyStorability, demandStorability, demandUnlocked

  get isTimely(): boolean { return this.#trigger.isTimely }

  // The world and the record in hand are timely, and a record can be made over it.
  async ensureTimelyStorability(opts: TimelyOpts = {}): Promise<this> {
    await this.hydrate(opts)
    this.demandStorability()
    return this
  }

  // The world is unlocked; the record in hand is whole and not gone, so a record can be made over it.
  demandStorability(): this {
    this.demandUnlocked()
    if (this.isGone) { throw this.listing.absentRefusal(this.scope) }
    if (! this.isHydrated) { throw new VaultError('bad_option', 'This record has not been hydrated, so there is nothing to make a record over: call hydrate() first.') }
    return this
  }

  isLocked(): boolean { return this.listing.lockState() === 'locked' }
  demandUnlocked(): this {
    if (this.listing.lockState() === 'locked') {
      throw new VaultError('vault_locked', 'The vault is locked, so nothing in it can be opened or stored: unlock it and call again.')
    }
    return this
  }

  // == [Storable ops]: hydrate, send, edit, del, each with its try form

  // The world timely; then, if the record in hand is stale, fetch. Calls made during a fetch join it.
  async hydrate(opts: TimelyOpts = {}): Promise<this> {
    // FIXME -- can/should these be run in parallel? With zero, you will get two or more refreshes, as the refresh will also ask for timeliness
    await this.listing.ensureTimelyWorld(opts)
    // FIXME -- change the interface to isTimelyWithin to fall back if given `undefined`
    // const timely = opts.maxMillisSinceRefresh === undefined
    //   ? this.#trigger.isTimely
    //   : this.#trigger.isTimelyWithin(opts.maxMillisSinceRefresh)
    // if (! timely) { await this.#trigger.launch() }
    // FIXME -- have the trigger accept an `eagerFrac` option, default 0.8. The timer is set for that fraction of max millis -- we'd like the call to have *completed* every max millis, not to be *called* every max millis.
    // undefined means the period set when the trigger was created: i.e. it should usually be true if the timer is working and response times are reasonable
    await this.#trigger.ensureTimelyWithin({ maxMillis: opts.maxMillisSinceRefresh })
    return this
  }

  tryHydrate(opts: TimelyOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.hydrate(opts)) }

  /** Edit, prepare and store the current record, returning the full record stored (if unlocked)
   * Once ready, apply edits from props and put the edited record.
   * Listing will update this record as the answer comes back.
   * returns `this`
   */
  async send(patch: PatchT, opts: SendOpts = {}): Promise<this> {
    await this.ensureTimelyStorability(opts) // unlocked, world is timely, this record is timely, all are consistent
    await this.edit(patch, opts)             // apply and settle (eg seal) modifications
    this.demandStorability()                 // unlocked, consistent with world
    const { record } = this
    await this.listing.putRecordOf(this, record)
    return this
  }

  trySend(patch: PatchT, opts: SendOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.send(props, opts)) }

  /** Become timely; reconcile the patch with current values; adopt them, and settle consequences (eg seal and snapshot), returning `this`
   * When done, our contract is restored:
   * - overlay has the reconciled payload props, central is untouched
   * - settle was able to handle the consequences (eg seal and snapshot)
   */
  async edit(patch: PatchT, opts: EditOpts = {}): Promise<this> {
    await this.ensureTimelyStorability(opts) // unlocked, world is timely, this record is timely, all are consistent
    // my design here isn't clear yet
    const props = this.reconcile(patch) // determine new payload to adopt
    this.assign(this.#edited)
    this.replaceSnapshot()
    await this.settle()
    return this
  }

  tryEdit(props: PropsT, opts: EditOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.edit(props, opts)) }

  // Timely and storable; hold the tombstone as edited; ask the listing to delete. The answer evicts this.
  async del(opts: TimelyOpts = {}): Promise<this> {
    await this.ensureTimelyStorability(opts)
    const { registered_at } = this.#central
    const tombstone: Tombstone<ScopeT> = Object.freeze({ ...this.scope, ...this.nextRevision(), registered_at, written_at: this.clock.now(), deleted: true })
    this.#edited = tombstone
    await this.listing.delRecordOf(this, tombstone)
    return this
  }

  tryDel(opts: TimelyOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.del(opts)) }

  // == [Receiving]: receive, reconcile, adopt, settle

  // The listing hands in what storage said about this thing. Reconcile it to the record that stands;
  // adopt that; settle the consequences; say what to cache and what to tell.
  async receive(fetched: Fetched<ScopeT, RecordT, SparseT>): Promise<Received<ScopeT, SparseT>> {
    const record = this.reconcile(fetched)
    this.adopt(record)
    const badnews = await this.settle()
    return { cacheable: isTombstone(record) ? record : this.sparseOf(record), badnews }
  }

  // Refusals throw; reasonable data is judged. What comes back is the record that stands, which is what
  // can be cached: the held one where the answer is older or says less, else the answer.
  protected reconcile(fetched: Fetched<ScopeT, RecordT, SparseT>): Fetched<ScopeT, RecordT, SparseT> {
    const held = this.#central
    if (fetched.revision_seq < held.revision_seq) { return held }
    if (fetched.revision_seq > held.revision_seq) { return fetched }
    if (fetched.revision_tok !== held.revision_tok) {
      throw new VaultError('corrupt_record', 'Storage holds a record at the same revision_seq as this device, under another revision_tok: two writes landed as one revision, so neither can be trusted until the record is read again.')
    }
    if (isTombstone(fetched)) {
      if (held.revision_seq === 0) { return held }   // a draft confirmed absent stands, waiting for its first send
      throw this.listing.absentRefusal(this.scope)   // absence, or a tombstone, at the very revision held
    }
    if (isTombstone(held)) { return held }
    return this.isFullRecord(held) && ! this.isFullRecord(fetched) ? held : fetched
  }

  // Hold the record as central, frozen; assign props; mark the fetch good if it brought the whole record; snapshot.
  protected adopt(record: Fetched<ScopeT, RecordT, SparseT>): void {
    this.#central = Object.freeze(record)
    if (isTombstone(record)) { this.#edited = null }
    this.assign(this.record)
    if (isTombstone(record) || this.isFullRecord(record)) { this.#trigger.noteSuccessNow() }
    this.replaceSnapshot()
  }

  // The consequences of a new record in hand, beyond the props and the snapshot. None by default.
  // `receive` and `edit` call it after adopting; the listing's `make` calls it once on the record a thing is born with.
  settle(): Promise<VaultError[]> { return Promise.resolve([]) }

  // == [Versioning]: nextRevision

  protected nextRevision(): Revision {
    return { revision_tok: mintRevisionTok(), revision_seq: this.#central.revision_seq + 1 }
  }

  // == [What the concrete class defines]: scopeOf, isFullRecord, sparseOf, overlayPropsAndSealBeforeSettling, makeSnapshot

  protected abstract scopeOf(fetched: Fetched<ScopeT, RecordT, SparseT>): ScopeT
  protected abstract isFullRecord(fetched: SparseT): fetched is RecordT
  protected abstract sparseOf(record: SparseT): SparseT
  // The step of `edit` only the concrete class can take: `drafted` is the record in hand under its next
  // revision; lay the props over it and seal what needs sealing. What comes back is held as edited.
  protected abstract overlayPropsAndSealBeforeSettling(drafted: RecordT, props: PropsT, opts: EditOpts): Promise<RecordT>
  protected abstract makeSnapshot(): SnapshotT
}

// == [Helpers]: tattoo, mintRevisionTok

// Stands in until the helpers worker lands `tattoo`; then this goes and the import takes its place.
const tattoo = <BT extends object>(obj: object, shown: BT, opts: { writable?: boolean } = {}): BT => {
  for (const [ckey, val] of Object.entries(shown)) {
    Object.defineProperty(obj, ckey, { value: val, enumerable: true, writable: opts.writable ?? true, configurable: true })
  }
  return shown
}

export const mintRevisionTok = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
