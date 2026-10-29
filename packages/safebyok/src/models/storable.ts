/** The base of a Box and a Vault: one stored thing as this device holds it, the verbs that fetch, edit, send and delete it, and the pipeline that takes in what storage says of it. */

import type * as Z from 'zod'
import { Checker } from '../checks/validator'
import { randomId } from '../crypto'
import { VaultError } from '../errors'
import { type Outcome, outcomeOf } from '../outcome'
import type { Clock } from '../shapes/bank-opts'
import { stableJsonify } from '../stable-jsonify'
import { Trigger } from '../utils/trigger'

// == [Record forms]: Revision, Times, Tombstone, Fetched, Dna, Received, isTombstone, isDraft

/** The two fields that version every stored thing: a token minted fresh for each write, and a count storage raises by one per write. */
export type Revision = Readonly<{ revision_tok: string, revision_seq: number }>

/** When the thing was first stored, and when the record in hand was written. On a tombstone, `written_at` is when it was deleted. */
export type Times = Readonly<{ registered_at: number, written_at: number }>

/** What a deletion leaves: the scope, the revision the deletion wrote, the times, and `deleted: true`. Nothing the user put in the thing. */
export type Tombstone<ScopeT> = ScopeT & Revision & Times & Readonly<{ deleted: true }>

/** A record as storage answers it, or as the device cache kept it: full, sparse, or a tombstone. A draft is a sparse record at `revision_seq` 0, which nothing stored has. */
export type Fetched<ScopeT, RecordT, SparseT> = RecordT | SparseT | Tombstone<ScopeT>

/** What a host hands `listing.make`, or `fetch` with `ifAbsent: 'create'`, for a thing not stored yet: its scope, and any record field it wants to set. The listing completes it into a draft. */
export type Dna<ScopeT, RecordT> = ScopeT & Partial<RecordT>

/** What `receive` hands back to the listing: the copy to write to the device cache, and news to tell the host once. */
export type Received<ScopeT, SparseT> = Readonly<{
  cacheable: SparseT | Tombstone<ScopeT>
  badnews:   readonly VaultError[]
}>

/** True for a tombstone. */
export const isTombstone = <ScopeT>(fetched: object): fetched is Tombstone<ScopeT> => (
  'deleted' in fetched && fetched.deleted === true
)

/** True for a draft: a record at `revision_seq` 0, made here from a dna and not stored yet. */
export const isDraft = (fetched: Revision): boolean => fetched.revision_seq === 0
// --

// == [Options]: IfPresent, ifPresent, TimelyOpts, EditOpts, SendOpts

/** What `send` does with a draft when storage already holds the thing: write over it, refuse, or take what is stored instead. Not acted on yet. */
export const IfPresentVals = ['replace', 'fail', 'fetch'] as const
export const ifPresent = Checker(({ oneof }) => oneof(IfPresentVals), 'bad_option')
export type  IfPresent = Z.infer<typeof ifPresent>

/** How old a copy a verb may work from, in milliseconds: of the record in hand, and of the world around it. Left out, the listing's defaults hold. `maxWorldMillis` is not acted on yet. */
export type TimelyOpts = { maxMillisSinceRefresh?: number | undefined, maxWorldMillis?: number | undefined }

export type EditOpts = TimelyOpts

export type SendOpts = TimelyOpts & { ifPresent?: IfPresent | undefined }
// --

// == [What a storable is given]: LockState, World, StorableListing, StorableOpts

export type LockState = 'unlocked' | 'locked'

/** What every listing's surroundings supply: the one clock. The bank is a vault listing's world; the vault is a box listing's. */
export type World = { clock: Clock }

/** What a storable asks of the listing holding it: the clock, the lock, the world's timeliness, and storage calls made on its behalf. A `Listing` implements it. */
export type StorableListing<ScopeT extends object, RecordT extends SparseT, SparseT extends ScopeT & Revision & Times> = {
  clock: Clock
  lockState(): LockState
  ensureTimelyWorld(opts: TimelyOpts): Promise<void>
  absentRefusal(scope: ScopeT): VaultError
  fetchRecordOf(thing: Storable<ScopeT, RecordT, SparseT, unknown, unknown>): Promise<void>
  putRecordOf(thing: Storable<ScopeT, RecordT, SparseT, unknown, unknown>, record: RecordT): Promise<void>
  delRecordOf(thing: Storable<ScopeT, RecordT, SparseT, unknown, unknown>): Promise<void>
}

export type StorableOpts<ScopeT extends object, RecordT extends SparseT, SparseT extends ScopeT & Revision & Times> = {
  listing:               StorableListing<ScopeT, RecordT, SparseT>
  maxMillisSinceRefresh: number
}
// --

// == [Storable]

/** One stored thing as this device holds it, and the verbs on it. A Box or a Vault is one; its listing makes it (`listing.make`), never `new`.
 *
 * It keeps two copies. `central` is the latest record this device knows storage holds, frozen:
 * full, sparse, a draft at revision 0, or a tombstone. `overlay` is the fields edited here and
 * not yet sent, or null. `record` is central with the overlay laid over it, and is what the
 * snapshot shows and what `send` writes.
 *
 * Four verbs change it. `hydrate` makes the world and the record in hand timely, fetching when
 * they are not. `edit` lays a patch over the record in hand, sealing what needs the vaultKey.
 * `send` edits, then writes the record in hand under the next revision. `del` asks storage to
 * delete it. Each is a try pair, and each resolves `this`. Every answer storage gives, to these
 * or to a notice from the watch, comes back in through `receive`, which reconciles it against
 * central, adopts what is newer, and settles the consequences.
 *
 * The scope is the instance's only own fields, frozen. Everything that changes is read through
 * `snapshot`, which keeps its identity until something changes, as `useSyncExternalStore` wants.
 *
 * Refusals: 'vault_locked' from `edit`, `send` or `del` while the vault is locked; the listing's
 * absent refusal ('absent_box', 'absent_vault') from a verb on a thing gone; 'bad_option' from
 * `send` on a record too sparse to write.
 */
export abstract class Storable<ScopeT extends object, RecordT extends SparseT, SparseT extends ScopeT & Revision & Times, PatchT, SnapshotT> {
  readonly scope: ScopeT
  protected readonly listing: StorableListing<ScopeT, RecordT, SparseT>

  #central:  Fetched<ScopeT, RecordT, SparseT>
  #overlay:  Partial<RecordT> | null = null
  #snapshot: SnapshotT | null = null
  readonly #trigger:   Trigger<null, void>
  readonly #listeners = new Set<() => void>()

  // The concrete constructor freezes the instance as its last line: a private field cannot be added to a frozen object.
  protected constructor(central: Fetched<ScopeT, RecordT, SparseT>, opts: StorableOpts<ScopeT, RecordT, SparseT>) {
    this.listing = opts.listing
    this.scope = this.scopeOf(central)
    tattoo(this, this.scope)
    this.#central = Object.freeze(central)
    this.#trigger = new Trigger({
      clock:                 opts.listing.clock,
      maxMillisSinceSuccess: opts.maxMillisSinceRefresh,
      doSnapshot:            () => null,
      doTryLaunch:           () => outcomeOf(() => this.listing.fetchRecordOf(this)),
    })
  }

  // == [Copies]: central, overlay, record, sparse, isDraft, isGone, isHydrated, hasOverlay, toJSON

  /** The latest record this device knows storage holds, frozen: full, sparse, a draft, or a tombstone. */
  protected get central(): Fetched<ScopeT, RecordT, SparseT> { return this.#central }

  /** The fields edited here and not yet sent, frozen, or null when nothing is. */
  protected get overlay(): Partial<RecordT> | null { return this.#overlay }

  /** The record in hand: central with the overlay laid over it. A tombstone takes no overlay. */
  protected get record(): Fetched<ScopeT, RecordT, SparseT> {
    if (this.#overlay === null || isTombstone(this.#central)) { return this.#central }
    return { ...this.#central, ...this.#overlay }
  }

  /** The record in hand without its heavy fields, or null once gone. */
  get sparse(): SparseT | null {
    const { record } = this
    return isTombstone(record) ? null : this.sparseOf(record)
  }

  /** True while the thing was made here and never stored. */
  get isDraft(): boolean { return isDraft(this.#central) }

  /** True once storage holds a tombstone, or nothing, where this thing was: every verb on it refuses. */
  get isGone(): boolean { return isTombstone(this.#central) }

  /** True when the record in hand is full, so there is a whole record to send or open. */
  get isHydrated(): boolean {
    const { record } = this
    return ! isTombstone(record) && this.isFullRecord(record)
  }

  /** True while an edit made here is not yet sent. */
  get hasOverlay(): boolean { return this.#overlay !== null }

  toJSON(): SparseT | null { return this.sparse }
  // --

  // == [Snapshot and subscription]: snapshot, getSnapshot, subscribe, replaceSnapshot, sameSnapshot

  /** What a host renders: frozen plain data, the same object until something changes. Made on first read. */
  get snapshot(): SnapshotT {
    this.#snapshot ??= this.makeSnapshot()
    return this.#snapshot
  }

  /** `() => snapshot`, one function for the instance's life: the second argument of `useSyncExternalStore`. */
  get getSnapshot(): () => SnapshotT { return this.#getSnapshot }
  readonly #getSnapshot = (): SnapshotT => this.snapshot

  /** Enroll `listener` to be called after each change of the snapshot, returning the function that unenrolls it: the first argument of `useSyncExternalStore`. */
  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }
  readonly #subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  /** Make the snapshot again and, when it differs from the one held, replace it and call every listener. */
  protected replaceSnapshot(): void {
    const next = this.makeSnapshot()
    if (this.#snapshot !== null && this.sameSnapshot(next, this.#snapshot)) { return }
    this.#snapshot = next
    for (const listener of this.#listeners) { listener() }
  }

  /** True when two snapshots say the same thing, so no listener need hear of the second. Their JSON, by default. */
  protected sameSnapshot(next: SnapshotT, held: SnapshotT): boolean {
    return stableJsonify(next) === stableJsonify(held)
  }
  // --

  // == [Guards]: isTimely, isLocked, demandNotGone, demandUnlocked, demandStorability, ensureTimelyStorability, fullRecord

  /** True while the record in hand was fetched within the listing's `maxMillisSinceRefresh`. Says nothing of the world. */
  get isTimely(): boolean { return this.#trigger.isTimely }

  /** True while the vault is locked, by the listing's word. */
  get isLocked(): boolean { return this.listing.lockState() === 'locked' }

  /** Throw the listing's absent refusal once this thing is gone. */
  demandNotGone(): this {
    if (this.isGone) { throw this.listing.absentRefusal(this.scope) }
    return this
  }

  /** Throw 'vault_locked' while the vault is locked. */
  demandUnlocked(): this {
    if (this.isLocked) { throw new VaultError('vault_locked', 'The vault is locked, so nothing in it can be opened or stored: unlock it and call again.') }
    return this
  }

  /** Throw unless a record can be written now: not gone, the vault unlocked, and the record in hand full. */
  demandStorability(): this {
    this.demandNotGone()
    this.demandUnlocked()
    this.fullRecord()
    return this
  }

  /** Hydrate, then {@link demandStorability}: the one precondition of `send` and `del`. */
  async ensureTimelyStorability(opts: TimelyOpts = {}): Promise<this> {
    await this.hydrate(opts)
    return this.demandStorability()
  }

  /** The record in hand as a full record, or a throw: the absent refusal once gone, 'bad_option' while too sparse to write. */
  protected fullRecord(): RecordT {
    const { record } = this
    if (isTombstone(record)) { throw this.listing.absentRefusal(this.scope) }
    if (! this.isFullRecord(record)) { throw new VaultError('bad_option', 'This record is not whole, so there is nothing to make a record over: hydrate it, or edit in what it lacks, and call again.') }
    return record
  }
  // --

  // == [Verbs]: hydrate, edit, send, del, each with its try form

  /** Make the world timely, then the record in hand, fetching each that is not; resolve `this`.
   * The world goes first: its answer may lock this vault or take this thing away. Calls made
   * while a fetch runs join it. A thing it finds gone resolves gone: the caller asks `isGone`.
   */
  async hydrate(opts: TimelyOpts = {}): Promise<this> {
    await this.listing.ensureTimelyWorld(opts)
    await this.#trigger.ensureTimelyWithin(opts.maxMillisSinceRefresh)
    return this
  }

  tryHydrate(opts: TimelyOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.hydrate(opts)) }

  /** Hydrate, then lay `patch` over the record in hand as the overlay; resolve `this`. Nothing is stored until `send`.
   * The concrete class turns the patch into record fields through `overlayOf`, sealing what the
   * vaultKey must seal. A later edit lays over the last. An empty patch still begins an overlay.
   * Central is never touched: a newer record received meanwhile is adopted beneath the overlay,
   * and the host decides between the two. Refuses 'vault_locked' while the vault is locked,
   * whatever the patch holds.
   */
  async edit(patch: PatchT, opts: EditOpts = {}): Promise<this> {
    await this.hydrate(opts)
    this.demandNotGone()
    this.demandUnlocked()
    const laid = await this.overlayOf(patch, opts)
    this.demandNotGone()
    this.demandUnlocked()
    const merged: Partial<RecordT> = { ...this.#overlay, ...laid }
    this.#overlay = Object.freeze(merged)
    this.replaceSnapshot()
    return this
  }

  tryEdit(patch: PatchT, opts: EditOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.edit(patch, opts)) }

  /** Edit, then write the record in hand under the next revision; resolve `this` once storage answers.
   * The answer comes back through `receive`, so central is what storage now holds, and the
   * overlay sent is dropped. A write storage refuses as 'stale_write' is delivered the same way
   * before the refusal is thrown: central catches up, and the overlay stays for the host.
   * Refuses as {@link demandStorability} does.
   */
  async send(patch: PatchT, opts: SendOpts = {}): Promise<this> {
    await this.edit(patch, opts)
    this.demandStorability()
    const sent = this.#overlay
    const record: RecordT = { ...this.fullRecord(), ...this.nextRevision(), written_at: this.listing.clock.now() }
    await this.listing.putRecordOf(this, record)
    if (this.#overlay === sent) {
      this.#overlay = null
      this.replaceSnapshot()
    }
    return this
  }

  trySend(patch: PatchT, opts: SendOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.send(patch, opts)) }

  /** Hydrate, then ask storage to delete the thing at the revision in hand; resolve `this`, gone.
   * The answer comes back through `receive` as a tombstone: the listing lets the thing go and
   * its snapshot shows no data. Refuses 'vault_locked' while the vault is locked.
   */
  async del(opts: TimelyOpts = {}): Promise<this> {
    await this.hydrate(opts)
    this.demandNotGone()
    this.demandUnlocked()
    await this.listing.delRecordOf(this)
    return this
  }

  tryDel(opts: TimelyOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.del(opts)) }
  // --

  // == [Receiving]: receive, reconcile, adopt, settle

  /** Take in what storage said of this thing, `fetched`, or null for nothing stored: reconcile it against central, adopt it when it is newer, settle the consequences, and hand back what to cache and what to tell.
   * The listing calls it with every answer and every notice. Nothing stored is a tombstone at the
   * revision held: it confirms a draft, and takes a stored thing away. It throws what `reconcile`
   * throws.
   */
  async receive(fetched: Fetched<ScopeT, RecordT, SparseT> | null): Promise<Received<ScopeT, SparseT>> {
    const central = this.reconcile(fetched ?? this.#tombstoneForAbsence())
    if (central !== this.#central) { this.adopt(central) }
    const badnews = await this.settle()
    return { cacheable: isTombstone(central) ? central : this.sparseOf(central), badnews }
  }

  /** The record that is central after hearing `fetched`: central itself where `fetched` is older or says less, else `fetched`. Refusals throw; the overlay plays no part.
   * Older is a lower `revision_seq`: a read served before an own write and answered after it
   * looks exactly so, and is ignored. A tombstone at the held revision is the thing gone, unless
   * the held record is a draft, which absence confirms. Two records at one `revision_seq` under
   * different tokens throw 'corrupt_record'. The concrete class adds its own judgments over this.
   */
  protected reconcile(fetched: Fetched<ScopeT, RecordT, SparseT>): Fetched<ScopeT, RecordT, SparseT> {
    const held = this.#central
    if (fetched.revision_seq < held.revision_seq) { return held }
    if (fetched.revision_seq > held.revision_seq) { return fetched }
    if (fetched.revision_tok !== held.revision_tok) {
      throw new VaultError('corrupt_record', 'Storage holds a record at the same revision_seq as this device, under another revision_tok: two writes landed as one revision, so neither can be trusted until the record is read again.')
    }
    if (isTombstone(fetched)) { return isDraft(held) ? held : fetched }
    if (isTombstone(held)) { return held }
    return this.isFullRecord(held) && ! this.isFullRecord(fetched) ? held : fetched
  }

  /** Hold `central` as the central record, frozen, and replace the snapshot.
   * A tombstone drops the overlay. A full record or a tombstone counts as a fetch that landed; a
   * sparse one over a full one schedules a fetch at once, so a thing held whole stays whole.
   */
  protected adopt(central: Fetched<ScopeT, RecordT, SparseT>): void {
    const wasHydrated = this.isHydrated
    this.#central = Object.freeze(central)
    if (isTombstone(central)) {
      this.#overlay = null
      this.#trigger.noteSuccessNow()
    } else if (this.isFullRecord(central)) {
      this.#trigger.noteSuccessNow()
    } else if (wasHydrated) {
      this.#trigger.scheduleLaunchNow()
    }
    this.replaceSnapshot()
  }

  /** Act on the record now central, beyond its fields and the snapshot, and resolve the bad news found in it. Nothing, by default.
   * `receive` calls it after every answer, adopted or not, and the listing once at birth. A vault
   * judges its lease and ways in here.
   */
  settle(): Promise<readonly VaultError[]> { return Promise.resolve([]) }
  // --

  // == [Revision]: nextRevision, tombstoneForAbsence

  /** The revision `send` writes under: a fresh token, and the central count plus one. */
  protected nextRevision(): Revision {
    return { revision_tok: randomId(), revision_seq: this.#central.revision_seq + 1 }
  }

  /** The tombstone an answer of nothing stored amounts to: at the revision and times held. */
  #tombstoneForAbsence(): Tombstone<ScopeT> {
    const { revision_tok, revision_seq, registered_at, written_at } = this.#central
    return { ...this.scope, revision_tok, revision_seq, registered_at, written_at, deleted: true }
  }
  // --

  // == [What the concrete class defines]: scopeOf, isFullRecord, sparseOf, overlayOf, makeSnapshot

  /** The scope fields of `fetched`, and nothing else. */
  protected abstract scopeOf(fetched: Fetched<ScopeT, RecordT, SparseT>): ScopeT
  /** True when `fetched` holds every field of the full record. */
  protected abstract isFullRecord(fetched: SparseT): fetched is RecordT
  /** `record` without its heavy fields. */
  protected abstract sparseOf(record: SparseT): SparseT
  /** The record fields `patch` lays over the record in hand, sealed where the vaultKey must seal them. Called unlocked. */
  protected abstract overlayOf(patch: PatchT, opts: EditOpts): Promise<Partial<RecordT>>
  /** The snapshot of the record in hand and what changes beside it. */
  protected abstract makeSnapshot(): SnapshotT
  // --
}
// --

// == [Helpers]: tattoo

/** Attach each entry of `shown` to `obj` as an own enumerable field that cannot be assigned: the stamp a spread, `Object.keys` or JSON shows. */
const tattoo = (obj: object, shown: object): void => {
  for (const [ckey, val] of Object.entries(shown)) {
    Object.defineProperty(obj, ckey, { value: val, enumerable: true, writable: false, configurable: false })
  }
}
// --
